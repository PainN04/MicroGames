// Testes da API: sobe o mesmo lib/router.js num servidor de verdade, com um SQLite descartável (nunca o
// microgame.db nem o Neon). Rode antes de cada deploy:  npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'microgame-test-'));
process.env.MICROGAME_SQLITE = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
process.env.CRON_SECRET = 'cron-de-teste';
delete process.env.GEIKO_API_KEY; // sem Geiko: o bloqueio por tickets não consulta nada de fora
delete process.env.DATABASE_URL;
delete process.env.VERCEL;

const { handle } = require('../lib/router');
const { ensureSchema } = require('../lib/schema');
const { sql, getStore } = require('../lib/store');
const auth = require('../lib/auth');
const { weigh, DEFAULT_RULES } = require('../lib/geiko');

let server, base;

before(async () => {
  await ensureSchema();
  server = http.createServer((req, res) => handle(req, res, { version: () => 'teste' }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await makeUser('paulo', 'Paulo', 'admin', 'senha-dono-123');
  await makeUser('outroadm', 'Outro Admin', 'admin', 'senha-adm-123');
  await makeUser('ana', 'Ana', 'player', 'senha-ana-123');
  await makeUser('bia', 'Bia', 'player', 'senha-bia-123');
});
after(() => {
  server.close();
  getStore().raw.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function makeUser(username, name, role, password) {
  await sql`INSERT INTO users (username, name, role, password_hash, must_change, active, token_version, created_at)
            VALUES (${username}, ${name}, ${role}, ${await auth.hashPassword(password)}, ${false}, ${true}, ${1}, ${Date.now()})`;
}

/** Cliente com cookie próprio (cada um é um "aparelho"). */
function client() {
  let cookie = '';
  return async function call(p, { method = 'GET', body, headers = {} } = {}) {
    const r = await fetch(base + p, {
      method,
      headers: { ...(cookie && { cookie }), ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, body: json, text, headers: r.headers };
  };
}
async function login(username, password) {
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, `login de ${username}: ${r.text}`);
  return c;
}
const play = (c, game, score, proof) => c('/api/scores', { method: 'POST', body: { game, score, proof } });

/* ---------- login e sessão ---------- */

test('login: senha errada recusa, certa entra', async () => {
  const c = client();
  assert.equal((await c('/api/auth/login', { method: 'POST', body: { username: 'ana', password: 'errada' } })).status, 401);
  assert.equal((await c('/api/auth/login', { method: 'POST', body: { username: 'ANA', password: 'senha-ana-123' } })).status, 200);
  const me = await c('/api/auth/me');
  assert.equal(me.body.user.username, 'ana');
  assert.equal(me.body.user.passwordHash, undefined, 'hash da senha nunca sai na API');
});

test('uma conta, um aparelho: login novo derruba o anterior', async () => {
  const a = await login('bia', 'senha-bia-123');
  const b = await login('bia', 'senha-bia-123');
  const old = await a('/api/auth/ping');
  assert.equal(old.status, 401);
  assert.equal(old.body.reason, 'other-device');
  assert.equal((await b('/api/auth/ping')).status, 200);
});

test('CSRF: POST sem JSON ou de outra origem é recusado', async () => {
  const r1 = await fetch(base + '/api/auth/login', { method: 'POST', body: 'username=ana', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r1.status, 415);
  const r2 = await fetch(base + '/api/auth/login', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: 'https://malicioso.example' } });
  assert.equal(r2.status, 403);
});

/* ---------- pontuação ---------- */

test('pontuação: sem login não salva, logado salva com o nome da conta', async () => {
  assert.equal((await play(client(), 'snake', 10)).status, 401);
  const c = await login('ana', 'senha-ana-123');
  assert.equal((await play(c, 'snake', 12)).status, 201);
  const board = (await client()('/api/scores')).body;
  assert.ok(board.snake.some(s => s.name === 'Ana' && s.score === 12));
});

test('pontuação: jogo inexistente e valor impossível são recusados', async () => {
  const c = await login('ana', 'senha-ana-123');
  assert.equal((await play(c, 'naoexiste', 1)).status, 400);
  assert.equal((await play(c, 'cores', 9999)).status, 422);
});

test('anti-cheat do clique: CPS alto demais e ritmo de robô são recusados, humano passa', async () => {
  const c = await login('ana', 'senha-ana-123');
  assert.equal((await play(c, 'clique', 250)).status, 422);
  const robot = Array(80).fill(100);
  assert.equal((await play(c, 'clique', 80, robot)).status, 422);
  const human = Array.from({ length: 80 }, (_, i) => 90 + ((i * 37) % 50));
  assert.equal((await play(c, 'clique', 80, human)).status, 201);
});

test('bloqueio manual do admin impede salvar pontuação', async () => {
  const adm = await login('outroadm', 'senha-adm-123');
  const [ana] = await sql`SELECT id FROM users WHERE username = 'ana'`;
  assert.equal((await adm(`/api/admin/users/${ana.id}/block`, { method: 'POST', body: { minutes: 5, reason: 'teste' } })).status, 200);
  const c = await login('ana', 'senha-ana-123');
  assert.equal((await play(c, 'snake', 5)).status, 423);
  assert.equal((await adm(`/api/admin/users/${ana.id}/unblock`, { method: 'POST', body: {} })).status, 200);
  assert.equal((await play(c, 'snake', 5)).status, 201);
});

/* ---------- permissões ---------- */

test('permissões: jogador não entra no admin; só o dono edita recordes', async () => {
  const player = await login('ana', 'senha-ana-123');
  assert.equal((await player('/api/admin/users')).status, 403);
  assert.equal((await player('/api/admin/report?days=7')).status, 403);
  const adm = await login('outroadm', 'senha-adm-123');
  assert.equal((await adm('/api/admin/report?days=7')).status, 200);
  assert.equal((await adm('/api/admin/records')).status, 403);
  assert.equal((await adm('/api/admin/backups')).status, 403);
  const owner = await login('paulo', 'senha-dono-123');
  assert.equal((await owner('/api/admin/records')).status, 200);
});

/* ---------- editor de recordes + backup ---------- */

test('editor de recordes respeita "menor é melhor" e faz backup antes', async () => {
  const owner = await login('paulo', 'senha-dono-123');
  const [ana] = await sql`SELECT id FROM users WHERE username = 'ana'`;
  const c = await login('ana', 'senha-ana-123');
  await play(c, 'reflexo', 300);
  await play(c, 'reflexo', 250);
  await sql`UPDATE backups SET created_at = created_at - ${2 * 3_600_000}`; // última cópia com mais de 1h
  const before = (await owner('/api/admin/backups')).body.backups.length;
  const r = await owner('/api/admin/records', { method: 'PUT', body: { game: 'reflexo', userId: ana.id, value: 280 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.removed, 1, 'a de 250 (melhor que 280) sai');
  const rows = await sql`SELECT score FROM scores WHERE game = 'reflexo' AND user_id = ${ana.id} ORDER BY score`;
  assert.deepEqual(rows.map(x => x.score), [280, 300]);
  const after = (await owner('/api/admin/backups')).body.backups;
  assert.equal(after.length, before + 1);
  assert.equal(after[0].reason, 'antes de editar recordes');
});

test('backup: restaurar devolve as partidas e guarda o estado de antes', async () => {
  const owner = await login('paulo', 'senha-dono-123');
  const made = await owner('/api/admin/backups', { method: 'POST', body: {} });
  assert.equal(made.status, 201);
  const total = (await sql`SELECT count(*) AS n FROM scores`)[0].n;
  const { backups } = (await owner('/api/admin/backups')).body;
  const id = backups[0].id;

  const dl = await owner(`/api/admin/backups/download?id=${id}`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  assert.equal(dl.body.scores.length, total);
  assert.ok(dl.body.users.every(u => !('session_id' in u)));

  await sql`DELETE FROM scores`; // "acidente"
  const r = await owner('/api/admin/backups/restore', { method: 'POST', body: { id } });
  assert.equal(r.status, 200);
  assert.equal((await sql`SELECT count(*) AS n FROM scores`)[0].n, total);
  const list = (await owner('/api/admin/backups')).body.backups;
  assert.equal(list[0].reason, 'antes de restaurar');
  assert.equal(list[0].scores, 0);
  // depois de restaurar, partida nova ainda ganha id novo (sem colidir)
  const c = await login('ana', 'senha-ana-123');
  assert.equal((await play(c, 'snake', 7)).status, 201);
});

test('cron de backup exige o segredo', async () => {
  const c = client();
  assert.equal((await c('/api/cron/backup')).status, 401);
  assert.equal((await c('/api/cron/backup', { headers: { authorization: 'Bearer errado' } })).status, 401);
  assert.equal((await c('/api/cron/backup', { headers: { authorization: 'Bearer cron-de-teste' } })).status, 200);
});

test('erros do navegador: só de quem está logado, agrupados pro admin', async () => {
  const anon = client();
  assert.equal((await anon('/api/errors', { method: 'POST', body: { message: 'x' } })).status, 204);
  const c = await login('ana', 'senha-ana-123');
  for (let i = 0; i < 2; i++) await c('/api/errors', { method: 'POST', body: { message: 'TypeError: boom', source: 'a.js:1', view: 'snake' } });
  assert.equal((await c('/api/admin/errors')).status, 403);
  const adm = await login('outroadm', 'senha-adm-123');
  const { errors } = (await adm('/api/admin/errors')).body;
  assert.equal(errors.length, 1, 'anônimo não grava');
  assert.equal(errors[0].count, 2);
  assert.deepEqual(errors[0].people, ['Ana']);
  assert.deepEqual(errors[0].views, ['snake']);
  await adm('/api/admin/errors/clear', { method: 'POST', body: {} });
  assert.equal((await adm('/api/admin/errors')).body.errors.length, 0);
});

test('aviso de recorde tomado chega uma vez só pra quem perdeu o 1º lugar', async () => {
  const ana = await login('ana', 'senha-ana-123');
  const bia = await login('bia', 'senha-bia-123');
  await ana('/api/auth/ping'); // limpa avisos antigos
  assert.equal((await play(ana, 'memoria', 10)).status, 201);
  assert.equal((await play(bia, 'memoria', 8)).status, 201, 'pior que a Ana: sem aviso');
  assert.equal((await ana('/api/auth/ping')).body.notes.length, 0);
  assert.equal((await play(bia, 'memoria', 15)).status, 201, 'passou a Ana');
  const { notes } = (await ana('/api/auth/ping')).body;
  assert.equal(notes.length, 1);
  assert.deepEqual({ kind: notes[0].kind, game: notes[0].game, by: notes[0].by, score: notes[0].score, old: notes[0].old },
    { kind: 'geral', game: 'memoria', by: 'Bia', score: 15, old: 10 });
  assert.equal((await ana('/api/auth/ping')).body.notes.length, 0, 'não repete');
  assert.equal((await play(bia, 'memoria', 20)).status, 201, 'bater o próprio recorde não avisa ninguém');
  assert.equal((await bia('/api/auth/ping')).body.notes.length, 0);
});

test('avisos: contador de não lidos, lista e marcar como lido', async () => {
  const ana = await login('ana', 'senha-ana-123');
  const bia = await login('bia', 'senha-bia-123');
  await bia('/api/notifications/read', { method: 'POST', body: {} });
  assert.equal((await bia('/api/auth/ping')).body.unread, 0);
  assert.equal((await play(ana, 'memoria', 30)).status, 201, 'a Ana passou a Bia');
  const ping = (await bia('/api/auth/ping')).body;
  assert.equal(ping.notes.length, 1);
  assert.equal(ping.unread, 1, 'o balão sai, mas o contador continua até abrir a lista');
  assert.equal((await bia('/api/auth/me')).body.unread, 1);
  const list = (await bia('/api/notifications')).body.notes;
  assert.equal(list[0].by, 'Ana');
  assert.equal(list[0].unread, true);
  assert.equal((await client()('/api/notifications')).status, 401);
  assert.equal((await bia('/api/notifications/read', { method: 'POST' })).status, 415, 'CSRF: exige JSON');
  assert.equal((await bia('/api/notifications/read', { method: 'POST', body: {} })).body.unread, 0);
  assert.equal((await bia('/api/auth/ping')).body.unread, 0);
  assert.equal((await bia('/api/notifications')).body.notes[0].unread, false);
});

test('destaque da semana: exige login; sem Geiko responde vazio; jogo × trabalho só pra admin', async () => {
  assert.equal((await client()('/api/geiko/week')).status, 401);
  const ana = await login('ana', 'senha-ana-123');
  const w = await ana('/api/geiko/week');
  assert.equal(w.status, 200);
  assert.equal(w.body.champion, null);
  assert.equal((await ana('/api/admin/workplay')).status, 403);
  const adm = await login('outroadm', 'senha-adm-123');
  assert.equal((await adm('/api/admin/workplay')).status, 200);
});

/* ---------- regras do bloqueio por tickets (Geiko) ---------- */

test('pesos dos tickets do Geiko', () => {
  const at = '2026-10-10T10:00:00';
  const later = '2026-10-10T12:00:00';
  const w = t => weigh({ id: 1, startDate: at, lastInteractionDate: later, ...t }, DEFAULT_RULES, {}).weight;
  assert.equal(w({ priority: 'NOR' }), 1);
  assert.equal(w({ priority: 'URG' }), 2);
  assert.equal(w({ priority: null }), 2.5, 'sem prioridade pesa mais');
  assert.equal(w({ priority: 'NOR', lastInteractionDate: at }), 1.5, 'sem interação: x1.5');
  assert.equal(w({ priority: 'NOR', attendanceSituationId: 2 }), 0.25, 'aguardando cliente: x0.25');
});

test('bootstrap do banco de teste: não existe na produção nem quando já há contas', async () => {
  const call = client();
  assert.equal((await call('/api/homolog/bootstrap')).status, 404); // fora de preview
  process.env.VERCEL_ENV = 'preview';
  try { assert.equal((await call('/api/homolog/bootstrap')).status, 404); } // em preview, mas já há contas
  finally { delete process.env.VERCEL_ENV; }
});

test('backup: "baixar agora" dá o id; importar troca partidas e contas e recusa arquivo ruim', async () => {
  const dono = await login('paulo', 'senha-dono-123');
  const made = await dono('/api/admin/backups', { method: 'POST', body: {} });
  assert.equal(made.status, 201);
  assert.ok(made.body.id > 0, 'a rota devolve o id pra a página já baixar');
  const file = (await dono(`/api/admin/backups/download?id=${made.body.id}`)).body;
  assert.equal((await dono('/api/admin/backups')).body.canImport, true, 'banco local/teste pode importar');
  const ana = await login('ana', 'senha-ana-123');
  assert.equal((await ana('/api/admin/backups/import', { method: 'POST', body: file })).status, 403, 'só o dono');
  assert.equal((await dono('/api/admin/backups/import', { method: 'POST', body: { v: 2 } })).status, 400, 'arquivo que não é backup');
  const semAdmin = { ...file, users: file.users.map(u => ({ ...u, role: 'player' })) };
  assert.equal((await dono('/api/admin/backups/import', { method: 'POST', body: semAdmin })).status, 400, 'sem admin ninguém entraria');
  const done = await dono('/api/admin/backups/import', { method: 'POST', body: file });
  assert.equal(done.status, 200);
  assert.deepEqual(done.body, { scores: file.scores.length, users: file.users.length });
  assert.equal((await dono('/api/auth/me')).body.user, null, 'sessões não vêm no backup: todo mundo entra de novo');
  const again = await login('paulo', 'senha-dono-123'); // a senha vem junto com a conta
  assert.equal(((await again('/api/scores')).body.memoria || []).length >= 0, true);
  const backups = (await again('/api/admin/backups')).body.backups;
  assert.ok(backups.some(b => b.reason === 'antes de importar'), 'guarda o estado de antes');
});

test('sudoku: tempo normal salva, tempo impossível é recusado, e o menor tempo é o melhor', async () => {
  const bia = await login('bia', 'senha-bia-123');
  assert.equal((await play(bia, 'sudoku', 5)).status, 422, 'resolver em 5s é impossível');
  assert.equal((await play(bia, 'sudoku', 900)).status, 201);
  const { isBetter } = require('../lib/rules');
  assert.equal(isBetter('sudoku', 300, 900), true, 'menos segundos ganha');
});

test('prêmios do desafio do dia: só o vencedor de ontem escolhe o jogo de amanhã; moldura libera por vitórias', async () => {
  const flair = require('../lib/flair');
  const { GAMES, isBetter } = require('../lib/rules');
  const { scheduledGame } = require('../public/js/daily.js');
  const y = flair.today() - 1, game = scheduledGame(GAMES, y, {});
  const noon = y * 86_400_000 + 3 * 3_600_000 + 12 * 3_600_000; // meio-dia em Brasília de ontem
  const [better, worse] = isBetter(game, 1, 2) ? [1, 2] : [2, 1];
  const id = async u => (await sql`SELECT id FROM users WHERE username = ${u}`)[0].id;
  await sql`INSERT INTO scores (game, player, score, created_at, user_id) VALUES (${game}, ${'Ana'}, ${better}, ${noon}, ${await id('ana')})`;
  await sql`INSERT INTO scores (game, player, score, created_at, user_id) VALUES (${game}, ${'Bia'}, ${worse}, ${noon}, ${await id('bia')})`;
  const ana = await login('ana', 'senha-ana-123'), bia = await login('bia', 'senha-bia-123');

  assert.equal((await client()('/api/daily/pick', { method: 'POST', body: { game: 'memoria' } })).status, 401, 'sem login não escolhe');
  assert.equal((await bia('/api/daily/pick', { method: 'POST', body: { game: 'memoria' } })).status, 403, 'quem perdeu não escolhe');
  assert.equal((await ana('/api/daily/pick', { method: 'POST', body: { game: 'nao-existe' } })).status, 400);
  const ok = await ana('/api/daily/pick', { method: 'POST', body: { game: 'memoria' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.day, flair.today() + 1);
  const shown = (await client()('/api/flair')).body;
  assert.equal(shown.picks[flair.today() + 1].game, 'memoria');
  assert.equal(shown.picks[flair.today() + 1].by, 'Ana');
  assert.equal(scheduledGame(GAMES, flair.today() + 1, shown.picks), 'memoria', 'a escolha vale por cima do sorteio');

  assert.equal((await ana('/api/profile/frame', { method: 'POST', body: { frame: 'bronze' } })).status, 200, '1 vitória libera o bronze');
  assert.equal((await ana('/api/profile/frame', { method: 'POST', body: { frame: 'silver' } })).status, 403, 'prata pede 3');
  assert.equal((await ana('/api/profile/frame', { method: 'POST', body: { frame: 'laranja' } })).status, 400);
  assert.equal((await bia('/api/profile/frame', { method: 'POST', body: { frame: 'bronze' } })).status, 403, 'sem vitória, sem moldura');
  assert.equal((await client()('/api/flair')).body.frames.Ana, 'bronze');
  assert.equal((await ana('/api/auth/me')).body.user.frame, 'bronze');
  assert.equal((await ana('/api/profile/frame', { method: 'POST', body: { frame: null } })).status, 200, 'dá pra tirar a moldura');
});

test('jogos novos: pontuação impossível é recusada, e o Termo só vale uma vez por dia', async () => {
  const bia = await login('bia', 'senha-bia-123');
  assert.equal((await play(bia, 'pong', 5000)).status, 422);
  assert.equal((await play(bia, 'pong', 12)).status, 201);
  assert.equal((await play(bia, 'forca', 45)).status, 201);
  assert.equal((await play(bia, 'forca', 99999)).status, 422);
  assert.equal((await play(bia, 'ligue4', 37)).status, 201);
  assert.equal((await play(bia, 'corredor', 1800)).status, 201);
  assert.equal((await play(bia, 'comecome', 2400)).status, 201);
  assert.equal((await play(bia, 'termo', 50)).status, 422, 'abaixo de 100 não existe');
  assert.equal((await play(bia, 'termo', 450)).status, 201);
  assert.equal((await play(bia, 'termo', 600)).status, 409, 'segunda tentativa do dia não vale');
  const ana = await login('ana', 'senha-ana-123');
  assert.equal((await play(ana, 'termo', 300)).status, 201, 'cada pessoa tem a sua');
  const { GAMES, isBetter } = require('../lib/rules');
  assert.ok(['pong', 'forca', 'ligue4', 'corredor', 'comecome', 'termo'].every(g => GAMES.includes(g)));
  assert.equal(isBetter('termo', 600, 450), true);
});

test('jogos novos entram no sorteio do dia só a partir do lançamento (dias antigos não mudam)', () => {
  const { scheduledGame, DAILY_SINCE } = require('../public/js/daily.js');
  const { GAMES } = require('../lib/rules');
  const NEW = ['pong', 'forca', 'ligue4', 'corredor', 'comecome', 'termo'];
  for (const id of NEW) assert.ok(DAILY_SINCE[id] >= 20746, id);
  for (let d = 20000; d < 20746; d++) assert.ok(!NEW.includes(scheduledGame(GAMES, d, {})), 'dia ' + d);
  const seen = new Set();
  for (let d = 20746; d < 20746 + 27 * 2; d++) seen.add(scheduledGame(GAMES, d, {}));
  assert.ok(NEW.every(g => seen.has(g)), 'todos entram no rodízio depois');
});

test('combos e itens raros: pontuações maiores agora cabem nos limites, mas continua havendo teto', async () => {
  const bia = await login('bia', 'senha-bia-123');
  assert.equal((await play(bia, 'voa', 400)).status, 201, 'estrelas somam ao placar do Voa Voa');
  assert.equal((await play(bia, 'voa', 5000)).status, 422);
  assert.equal((await play(bia, 'toupeira', 220)).status, 201, 'combo x4 na toupeira passa de 200');
  assert.equal((await play(bia, 'toupeira', 9000)).status, 422);
  assert.equal((await play(bia, 'cores', 180)).status, 201);
  assert.equal((await play(bia, 'cores', 2000)).status, 422);
  assert.equal((await play(bia, 'matematica', 150)).status, 201);
  assert.equal((await play(bia, 'matematica', 9000)).status, 422);
});
