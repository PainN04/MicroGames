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
const { weigh, freeWindow, DEFAULT_RULES } = require('../lib/geiko');

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

test('schema: guarda a versão das tabelas pra instância nova não refazer as migrações', async () => {
  const { schemaKey } = require('../lib/schema');
  const rows = await sql`SELECT key FROM settings WHERE key LIKE ${'schema:%'}`;
  assert.deepEqual(rows.map(r => r.key), [schemaKey()], 'uma marca só, a da versão atual');
});

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

test('ranking com ETag: sem mudança responde 304, partida nova muda a resposta', async () => {
  const c = await login('ana', 'senha-ana-123');
  const first = await client()('/api/scores');
  const etag = first.headers.get('etag');
  assert.ok(etag, 'manda ETag');
  assert.equal((await client()('/api/scores', { headers: { 'If-None-Match': etag } })).status, 304);
  assert.equal((await play(c, 'snake', 33)).status, 201);
  const after = await client()('/api/scores', { headers: { 'If-None-Match': etag } });
  assert.equal(after.status, 200);
  assert.notEqual(after.headers.get('etag'), etag);
});

test('pontuação: jogo inexistente e valor impossível são recusados', async () => {
  const c = await login('ana', 'senha-ana-123');
  assert.equal((await play(c, 'naoexiste', 1)).status, 400);
  assert.equal((await play(c, 'cores', 9999)).status, 422);
  assert.equal((await play(c, 'reflexo', 5)).status, 422, 'reflexo de 5 ms é impossível');
  assert.equal((await play(c, 'mira', 1)).status, 422, '20 alvos em 1s é impossível');
  assert.equal((await play(c, 'digitacao', 500)).status, 422, 'só existem 120 palavras');
  assert.equal((await play(c, 'memoria', 999)).status, 422);
  assert.equal((await play(c, 'snake', 99999)).status, 422);
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

test('horário livre: das 18h às 8h (Brasília) e fim de semana libera todo mundo', () => {
  const at = iso => Date.parse(iso + '-03:00');
  const free = iso => freeWindow(DEFAULT_RULES, at(iso));
  assert.equal(free('2026-10-19T10:00:00'), null, 'segunda 10h: expediente');
  assert.equal(free('2026-10-19T17:59:00'), null, 'segunda 17h59: ainda expediente');
  assert.equal(free('2026-10-19T18:00:00').until, at('2026-10-20T08:00:00'), 'segunda 18h: livre até terça 8h');
  assert.equal(free('2026-10-20T07:30:00').until, at('2026-10-20T08:00:00'), 'madrugada de terça');
  assert.equal(free('2026-10-20T08:00:00'), null, 'terça 8h: volta o bloqueio');
  assert.equal(free('2026-10-23T19:00:00').until, at('2026-10-26T08:00:00'), 'sexta à noite: livre até segunda 8h');
  assert.equal(free('2026-10-25T14:00:00').until, at('2026-10-26T08:00:00'), 'domingo à tarde');
  const off = { ...DEFAULT_RULES, freeHours: { ...DEFAULT_RULES.freeHours, enabled: false } };
  assert.equal(freeWindow(off, at('2026-10-25T14:00:00')), null, 'desligado no painel');
  const noWeekend = { ...DEFAULT_RULES, freeHours: { ...DEFAULT_RULES.freeHours, weekends: false } };
  assert.equal(freeWindow(noWeekend, at('2026-10-25T14:00:00')), null, 'sem fim de semana: domingo 14h bloqueia');
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

  // avatar pré-pronto e título
  assert.equal((await client()('/api/profile/look', { method: 'POST', body: { avatar: 'lia:290' } })).status, 401, 'sem login não escolhe avatar');
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { avatar: 'lia:12' } })).status, 400, 'cor fora da lista');
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { avatar: 'nao-existe:290' } })).status, 400);
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { title: '<b>x</b>' } })).status, 400);
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { avatar: 'jogo-nao-existe:290' } })).status, 400, 'avatar de jogo que não existe');
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { avatar: 'jogo-snake:290' } })).status, 200, 'avatar de jogo');
  for (const g of GAMES) assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'img', 'avatars', `jogo-${g}.svg`)), `falta o avatar do jogo ${g}`);
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { avatar: 'lia:290' } })).status, 200);
  const look = await ana('/api/profile/look', { method: 'POST', body: { title: 'estreia' } });
  assert.deepEqual(look.body, { avatar: 'lia:290', title: 'estreia' }, 'mandar só o título mantém o avatar');
  const looks = (await client()('/api/flair')).body;
  assert.equal(looks.avatars.Ana, 'lia:290');
  assert.equal(looks.titles.Ana, 'estreia');
  assert.equal((await ana('/api/auth/me')).body.user.avatar, 'lia:290');
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { avatar: null, title: null } })).status, 200, 'dá pra tirar os dois');
  assert.equal((await client()('/api/flair')).body.avatars.Ana, undefined);
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

/* ---------- social e competição ---------- */

const notesOf = async c => (await c('/api/notifications')).body.notes;
const idOf = async u => (await sql`SELECT id FROM users WHERE username = ${u}`)[0].id;

test('reações: ao recorde de outra pessoa, uma por pessoa, avisa uma vez e zera quando o recorde cai', async () => {
  const ana = await login('ana', 'senha-ana-123'), bia = await login('bia', 'senha-bia-123');
  assert.equal((await play(bia, 'tijolos', 100)).status, 201);
  const react = (c, body) => c('/api/reactions', { method: 'POST', body: { game: 'tijolos', ...body } });
  assert.equal((await react(bia, { target: 'Bia', emoji: '🔥' })).status, 400, 'não reage a si mesma');
  assert.equal((await react(ana, { target: 'Bia', emoji: '💩' })).status, 400, 'emoji fora da lista');
  assert.equal((await react(ana, { target: 'Ana', emoji: '🔥' })).status, 400);
  assert.equal((await react(ana, { target: 'Fantasma', emoji: '🔥' })).status, 404);
  assert.equal((await react(ana, { target: 'Bia', emoji: '🔥' })).status, 200);
  assert.equal((await react(ana, { target: 'Bia', emoji: '👏' })).status, 200, 'trocar de emoji vale');
  const mine = (await ana('/api/social')).body.reactions.tijolos.Bia;
  assert.deepEqual(mine.counts, { '👏': 1 });
  assert.equal(mine.mine, '👏');
  assert.equal((await bia('/api/social')).body.reactions.tijolos.Bia.mine, null);
  const avisos = (await notesOf(bia)).filter(n => n.kind === 'reaction');
  assert.equal(avisos.length, 1, 'trocar o emoji não manda aviso de novo');
  assert.equal(avisos[0].by, 'Ana');
  assert.equal((await play(bia, 'tijolos', 150)).status, 201); // recorde novo: as reações eram do antigo
  assert.equal((await ana('/api/social')).body.reactions.tijolos?.Bia, undefined);
  assert.equal((await react(ana, { target: 'Bia', emoji: '🔥' })).status, 200);
  assert.equal((await notesOf(bia)).filter(n => n.kind === 'reaction').length, 2, 'recorde novo, reação nova, aviso novo');
  assert.equal((await react(ana, { target: 'Bia', emoji: null })).status, 200, 'dá pra tirar a reação');
  assert.equal((await ana('/api/social')).body.reactions.tijolos?.Bia, undefined);
});

test('duelo: desafio, só vale partida depois do desafio, vence a melhor, avisa os dois e dá pra cancelar', async () => {
  const ana = await login('ana', 'senha-ana-123'), bia = await login('bia', 'senha-bia-123');
  const biaId = await idOf('bia'), anaId = await idOf('ana');
  assert.equal((await play(bia, 'memoria', 30)).status, 201); // antes do duelo: não conta
  assert.equal((await ana('/api/duels', { method: 'POST', body: { opponentId: anaId, game: 'memoria' } })).status, 400, 'contra si mesma');
  assert.equal((await ana('/api/duels', { method: 'POST', body: { opponentId: biaId, game: 'termo' } })).status, 400, 'Termo não vale duelo');
  assert.equal((await ana('/api/duels', { method: 'POST', body: { opponentId: 99999, game: 'memoria' } })).status, 404);
  const created = await ana('/api/duels', { method: 'POST', body: { opponentId: biaId, game: 'memoria' } });
  assert.equal(created.status, 201);
  assert.equal((await bia('/api/duels', { method: 'POST', body: { opponentId: anaId, game: 'memoria' } })).status, 409, 'já existe duelo entre os dois nesse jogo');
  assert.ok((await notesOf(bia)).some(n => n.kind === 'duel_new' && n.by === 'Ana'));

  assert.equal((await play(ana, 'memoria', 5)).status, 201);
  assert.equal((await play(bia, 'memoria', 9)).status, 201);
  const live = (await ana('/api/social')).body.duels.open[0];
  assert.equal(live.vs, 'Bia'); assert.equal(live.mine, 5); assert.equal(live.theirs, 9, 'a partida de 30 feita antes não entra');

  await sql`UPDATE duels SET ends_at = ${Date.now()} WHERE id = ${created.body.id}`; // o prazo acabou agora (as partidas feitas ficam dentro da janela)
  await new Promise(r => setTimeout(r, 5));
  assert.equal((await ana('/api/auth/ping')).status, 200); // o ping fecha os duelos vencidos
  const aviso = n => n.kind === 'duel_end';
  const dela = (await notesOf(ana)).find(aviso), dele = (await notesOf(bia)).find(aviso);
  assert.equal(dela.result, 'lose'); assert.equal(dele.result, 'win');
  assert.equal(dela.vs, 'Bia'); assert.equal(dele.vs, 'Ana'); // nomes certos (a lista de contas é buscada só quando um duelo fecha)
  assert.equal((await notesOf(ana)).filter(aviso).length, 1, 'avisa uma vez só');
  const after = (await bia('/api/social')).body;
  assert.equal(after.duels.open.length, 0);
  assert.equal(after.duels.recent[0].result, 'win');
  assert.equal(after.duelWins.Bia >= 1, true);

  const c2 = await ana('/api/duels', { method: 'POST', body: { opponentId: biaId, game: 'mira' } });
  assert.equal((await bia(`/api/duels/${c2.body.id}/cancel`, { method: 'POST', body: {} })).status, 200);
  assert.ok((await notesOf(ana)).some(n => n.kind === 'duel_cancel' && n.by === 'Bia'));
  assert.equal((await bia(`/api/duels/${c2.body.id}/cancel`, { method: 'POST', body: {} })).status, 409, 'já cancelado');
  const dono = await login('paulo', 'senha-dono-123');
  assert.equal((await dono(`/api/duels/${c2.body.id}/cancel`, { method: 'POST', body: {} })).status, 403, 'não é duelo dele');
});

test('torneio semanal: 3 jogos por semana, pontos por posição, pódio fechado uma vez só com aviso e troféu', async () => {
  const social = require('../lib/social');
  const week = social.TOURNEY_FIRST_WEEK + 3;
  const games = await social.tournamentGames(week);
  assert.equal(games.length, 3);
  assert.ok(!games.includes('termo'));
  assert.deepEqual(await social.tournamentGames(week), games, 'a escolha da semana fica guardada');
  const ana = await idOf('ana'), bia = await idOf('bia'), dono = await idOf('paulo');
  const t = social.weekStart(week) + 2 * 86_400_000;
  const add = (userId, name, game, score, at) => sql`INSERT INTO scores (game, player, score, created_at, user_id) VALUES (${game}, ${name}, ${score}, ${at}, ${userId})`;
  const { LOW_IS_BETTER } = require('../lib/rules');
  const good = (g, k) => (LOW_IS_BETTER.has(g) ? 100 - k : 100 + k); // k maior = melhor
  // Ana ganha os 2 primeiros jogos, Bia o terceiro; Paulo só joga 1 (aparece, mas fica atrás)
  await add(ana, 'Ana', games[0], good(games[0], 9), t); await add(bia, 'Bia', games[0], good(games[0], 5), t);
  await add(ana, 'Ana', games[1], good(games[1], 9), t); await add(bia, 'Bia', games[1], good(games[1], 5), t);
  await add(bia, 'Bia', games[2], good(games[2], 9), t); await add(ana, 'Ana', games[2], good(games[2], 5), t);
  await add(dono, 'Paulo', games[0], good(games[0], 1), t);
  await add(ana, 'Ana', games[2], good(games[2], 9) + 0, social.weekStart(week) - 1000); // semana anterior: não conta
  const during = await social.socialState({ id: ana, name: 'Ana' }, t + 3600_000);
  assert.equal(during.tourney.on, true);
  assert.deepEqual(during.tourney.standings.map(r => [r.name, r.points]), [['Ana', 10 + 10 + 7], ['Bia', 7 + 7 + 10], ['Paulo', 5]].sort((a, b) => b[1] - a[1]));
  assert.equal(during.tourney.mineRank, 1);

  // a semana acabou: fecha, avisa o pódio e conta o troféu do campeão
  const after = await social.socialState({ id: bia, name: 'Bia' }, social.weekEnd(week) + 3600_000);
  const campea = after.tourney.last;
  assert.equal(campea.week, week);
  assert.equal(campea.top[0].name, 'Ana');
  assert.equal(after.trophies.Ana, (during.trophies.Ana || 0) + 1, 'ganha 1 troféu (outros testes podem ter dado troféus de semanas anteriores)');
  const ana1 = (await sql`SELECT text FROM notifications WHERE user_id = ${ana}`).map(r => JSON.parse(r.text)).filter(n => n.kind === 'tourney' && n.week === week);
  assert.equal(ana1.length, 1); assert.equal(ana1[0].rank, 1);
  await social.socialState({ id: bia, name: 'Bia' }, social.weekEnd(week) + 7200_000);
  const again = (await sql`SELECT text FROM notifications WHERE user_id = ${ana}`).map(r => JSON.parse(r.text)).filter(n => n.kind === 'tourney' && n.week === week);
  assert.equal(again.length, 1, 'não avisa duas vezes');
});

test('semana de torneio: segunda a domingo no horário de Brasília', () => {
  const social = require('../lib/social');
  const w = social.TOURNEY_FIRST_WEEK;
  assert.equal(new Date(social.weekStart(w)).toISOString(), '2026-10-19T03:00:00.000Z', 'segunda 19/10/2026 00h em Brasília');
  assert.equal(social.weekOf(social.weekStart(w)), w);
  assert.equal(social.weekOf(social.weekStart(w) - 1), w - 1);
  assert.equal(social.weekOf(social.weekEnd(w) - 1), w);
  assert.deepEqual([0, 1, 2, 3, 6, 9].map(social.pointsFor), [10, 7, 5, 4, 1, 1]);
});

test('torneio: na produção só começa em 19/10/2026; na versão de teste já vale na semana atual', async () => {
  const social = require('../lib/social');
  const ana = { id: await idOf('ana'), name: 'Ana' };
  const before = social.weekStart(social.TOURNEY_FIRST_WEEK - 1) + 2 * 86_400_000; // meio da semana anterior ao lançamento
  assert.equal((await social.socialState(ana, before)).tourney.on, false);
  process.env.VERCEL_ENV = 'preview';
  try {
    const t = (await social.socialState(ana, before)).tourney;
    assert.equal(t.on, true);
    assert.equal(t.games.length, 3);
  } finally { delete process.env.VERCEL_ENV; }
  assert.equal((await social.socialState(ana, social.weekStart(social.TOURNEY_FIRST_WEEK) + 1000)).tourney.on, true);
});

test('duplas: convite, aceite, nome único, renomear, sair — e cada pessoa em uma dupla só', async () => {
  assert.equal((await client()('/api/social')).status, 401);
  const ana = await login('ana', 'senha-ana-123'), bia = await login('bia', 'senha-bia-123'), dono = await login('paulo', 'senha-dono-123');
  const anaId = await idOf('ana'), biaId = await idOf('bia'), donoId = await idOf('paulo');
  const convite = (c, partnerId, name) => c('/api/duos', { method: 'POST', body: { partnerId, name } });
  assert.equal((await convite(ana, anaId, 'Sozinha')).status, 400, 'não dá pra formar dupla consigo mesma');
  assert.equal((await convite(ana, biaId, 'x')).status, 400, 'nome curto demais');
  assert.equal((await convite(ana, biaId, 'n'.repeat(30))).status, 400, 'nome longo demais');
  assert.equal((await convite(ana, 99999, 'Fantasmas')).status, 404);
  const feito = await convite(ana, biaId, '  Os   Imbatíveis ');
  assert.equal(feito.status, 201);
  assert.ok((await notesOf(bia)).some(n => n.kind === 'duo_invite' && n.by === 'Ana' && n.name === 'Os Imbatíveis'), 'espaços sobrando saem do nome');

  const daBia = (await bia('/api/social')).body, daAna = (await ana('/api/social')).body;
  assert.equal(daBia.myDuo.state, 'in'); assert.equal(daAna.myDuo.state, 'out');
  assert.equal(daAna.people.find(x => x.name === 'Bia').free, false, 'quem tem convite aberto não está livre');
  assert.equal(daAna.duos.length, 0, 'só dupla ativa entra no ranking');
  assert.equal((await convite(ana, donoId, 'Outra')).status, 409, 'quem convidou não convida outra pessoa');
  assert.equal((await convite(dono, biaId, 'Outra')).status, 409, 'a convidada já está ocupada');
  assert.equal((await ana(`/api/duos/${feito.body.id}/accept`, { method: 'POST', body: {} })).status, 403, 'só a convidada aceita');
  assert.equal((await ana(`/api/duos/${feito.body.id}/leave`, { method: 'POST', body: {} })).status, 409, 'convite ainda não é dupla pra sair');

  assert.equal((await bia(`/api/duos/${feito.body.id}/accept`, { method: 'POST', body: {} })).status, 200);
  assert.ok((await notesOf(ana)).some(n => n.kind === 'duo_accept' && n.by === 'Bia'));
  const ativa = (await ana('/api/social')).body;
  assert.equal(ativa.myDuo.state, 'active');
  assert.equal(ativa.duos.length, 1);
  assert.deepEqual([ativa.duos[0].name, ativa.duos[0].aName, ativa.duos[0].bName], ['Os Imbatíveis', 'Ana', 'Bia']);
  assert.ok(ativa.duos[0].formedAt > 0);

  // outra dupla não pode usar o mesmo nome (maiúsculas não contam)
  const outro = await login('outroadm', 'senha-adm-123'), outroId = await idOf('outroadm');
  assert.equal((await convite(dono, outroId, 'OS IMBATÍVEIS')).status, 409);
  assert.equal((await convite(dono, outroId, 'Dupla Dois')).status, 201);
  assert.equal((await bia(`/api/duos/${feito.body.id}/rename`, { method: 'POST', body: { name: 'dupla dois' } })).status, 409, 'nome já usado por outra');
  assert.equal((await bia(`/api/duos/${feito.body.id}/rename`, { method: 'POST', body: { name: 'Ana e Bia' } })).status, 200);
  assert.equal((await outro('/api/social')).body.duos.length, 1);
  assert.equal((await dono(`/api/duos/${feito.body.id}/rename`, { method: 'POST', body: { name: 'Roubado' } })).status, 403, 'não é a dupla dele');

  assert.equal((await bia(`/api/duos/${feito.body.id}/leave`, { method: 'POST', body: {} })).status, 200);
  assert.ok((await notesOf(ana)).some(n => n.kind === 'duo_left' && n.by === 'Bia'));
  const livre = (await ana('/api/social')).body;
  assert.equal(livre.myDuo.state, 'none'); assert.equal(livre.duos.length, 0);
  assert.equal(livre.people.find(x => x.name === 'Bia').free, true);
  assert.equal((await bia(`/api/duos/${feito.body.id}/leave`, { method: 'POST', body: {} })).status, 409, 'já acabou');
});

test('duplas: recusar, cancelar, convite que expira e moderação do admin', async () => {
  const ana = await login('ana', 'senha-ana-123'), bia = await login('bia', 'senha-bia-123'), dono = await login('paulo', 'senha-dono-123');
  const biaId = await idOf('bia'), donoId = await idOf('paulo');
  const convite = (c, partnerId, name) => c('/api/duos', { method: 'POST', body: { partnerId, name } });
  const acao = (c, id, a, body = {}) => c(`/api/duos/${id}/${a}`, { method: 'POST', body });

  const d1 = (await convite(ana, biaId, 'Recusada')).body.id;
  assert.equal((await acao(bia, d1, 'decline')).status, 200);
  assert.ok((await notesOf(ana)).some(n => n.kind === 'duo_decline' && n.by === 'Bia'));
  assert.equal((await acao(bia, d1, 'accept')).status, 409, 'já respondido');

  const d2 = (await convite(ana, biaId, 'Cancelada')).body.id;
  assert.equal((await acao(bia, d2, 'cancel')).status, 409, 'só quem convidou cancela');
  assert.equal((await acao(ana, d2, 'cancel')).status, 200);
  assert.ok((await notesOf(bia)).some(n => n.kind === 'duo_cancel' && n.by === 'Ana'));

  const d3 = (await convite(ana, biaId, 'Vencida')).body.id;
  await sql`UPDATE duos SET expires_at = ${Date.now() - 1000} WHERE id = ${d3}`;
  assert.equal((await acao(bia, d3, 'accept')).status, 409, 'convite expirado não vira dupla');
  assert.equal((await ana('/api/social')).body.myDuo.state, 'none');

  // admin: lista, renomeia e desfaz (e avisa os dois)
  const d4 = (await convite(ana, biaId, 'Nome Ruim')).body.id;
  assert.equal((await acao(bia, d4, 'accept')).status, 200);
  assert.equal((await ana('/api/admin/duos')).status, 403, 'jogador não modera');
  assert.equal((await dono('/api/admin/duos')).body.duos.find(d => d.id === d4).a, 'Ana');
  assert.equal((await dono(`/api/admin/duos/${d4}/rename`, { method: 'POST', body: { name: 'Nome Bom' } })).status, 200);
  assert.equal((await ana('/api/social')).body.myDuo.name, 'Nome Bom');
  assert.equal((await ana(`/api/admin/duos/${d4}/end`, { method: 'POST', body: {} })).status, 403);
  assert.equal((await dono(`/api/admin/duos/${d4}/end`, { method: 'POST', body: {} })).status, 200);
  assert.ok((await notesOf(bia)).some(n => n.kind === 'duo_left' && n.by === 'o admin'));
  assert.equal((await ana('/api/social')).body.myDuo.state, 'none');
  void donoId;
});

test('duplas: o admin forma uma dupla direto (já ativa), com as mesmas regras de nome e de pessoa livre', async () => {
  const ana = await login('ana', 'senha-ana-123'), bia = await login('bia', 'senha-bia-123'), dono = await login('paulo', 'senha-dono-123');
  const anaId = await idOf('ana'), biaId = await idOf('bia'), donoId = await idOf('paulo');
  const criar = (c, aId, bId, name) => c('/api/admin/duos', { method: 'POST', body: { aId, bId, name } });
  // limpa o que testes anteriores deixaram abertos
  await sql`UPDATE duos SET status = ${'ended'} WHERE status IN (${'pending'}, ${'active'})`;
  assert.equal((await criar(ana, anaId, biaId, 'Intrusa')).status, 403, 'jogador não cria dupla pelo admin');
  assert.equal((await criar(dono, anaId, anaId, 'Mesma')).status, 400, 'duas pessoas diferentes');
  assert.equal((await criar(dono, anaId, 99999, 'Fantasma')).status, 404);
  assert.equal((await criar(dono, anaId, biaId, 'x')).status, 400, 'nome curto');
  const feita = await criar(dono, anaId, biaId, 'Criada pelo Admin');
  assert.equal(feita.status, 201);
  const vista = (await ana('/api/social')).body;
  assert.equal(vista.myDuo.state, 'active', 'nasce ativa, sem convite');
  assert.equal(vista.myDuo.name, 'Criada pelo Admin');
  assert.ok(vista.myDuo.formedAt > 0);
  assert.ok((await notesOf(bia)).some(n => n.kind === 'duo_admin_new' && n.with === 'Ana'));
  assert.ok((await notesOf(ana)).some(n => n.kind === 'duo_admin_new' && n.with === 'Bia'));
  const lista = (await dono('/api/admin/duos')).body.duos.find(d => d.id === feita.body.id);
  assert.deepEqual([lista.aId, lista.bId], [anaId, biaId]);
  assert.equal((await criar(dono, anaId, donoId, 'Outra')).status, 409, 'Ana já está em dupla');
  assert.equal((await criar(dono, donoId, biaId, 'Outra')).status, 409, 'Bia já está em dupla');
  const outroId = await idOf('outroadm');
  assert.equal((await criar(dono, donoId, outroId, 'criada PELO admin')).status, 409, 'nome já usado (maiúsculas não contam)');
  assert.equal((await criar(dono, donoId, outroId, 'Dupla dos Admins')).status, 201);
  assert.equal((await dono(`/api/admin/duos/${feita.body.id}/end`, { method: 'POST', body: {} })).status, 200);
  await sql`UPDATE duos SET status = ${'ended'} WHERE status = ${'active'}`;
});

test('duplas: o admin escolhe desde quando as partidas contam (agora, início do mês ou o começo) e pode mudar depois', async () => {
  const dono = await login('paulo', 'senha-dono-123'), ana = await login('ana', 'senha-ana-123');
  const anaId = await idOf('ana'), biaId = await idOf('bia');
  await sql`UPDATE duos SET status = ${'ended'} WHERE status IN (${'pending'}, ${'active'})`;
  const criar = since => dono('/api/admin/duos', { method: 'POST', body: { aId: anaId, bId: biaId, name: 'Retroativa', since } });
  assert.equal((await criar('semana-que-vem')).status, 400, 'início inválido');
  const feita = await criar('all');
  assert.equal(feita.status, 201);
  let d = (await ana('/api/social')).body.myDuo;
  assert.equal(d.since, 0, 'o começo = conta todas as partidas');
  assert.ok(d.formedAt > 0);
  assert.equal((await dono(`/api/admin/duos/${feita.body.id}/since`, { method: 'POST', body: { since: 'month' } })).status, 200);
  d = (await ana('/api/social')).body.myDuo;
  const monthStart = new Date(d.since);
  assert.equal(monthStart.toISOString().slice(8, 10), '01', 'início do mês (dia 1º, 03h UTC = meia-noite em Brasília)');
  assert.equal(monthStart.toISOString().slice(11, 13), '03');
  assert.equal((await dono(`/api/admin/duos/${feita.body.id}/since`, { method: 'POST', body: { since: 'now' } })).status, 200);
  d = (await ana('/api/social')).body.myDuo;
  assert.ok(Math.abs(d.since - Date.now()) < 5000);
  assert.equal((await ana(`/api/admin/duos/${feita.body.id}/since`, { method: 'POST', body: { since: 'all' } })).status, 403, 'jogador não muda');
  assert.equal((await dono(`/api/admin/duos/${feita.body.id}/since`, { method: 'POST', body: { since: 'xx' } })).status, 400);
  // dupla formada por convite conta desde que foi aceita
  await dono(`/api/admin/duos/${feita.body.id}/end`, { method: 'POST', body: {} });
  const conv = (await ana('/api/duos', { method: 'POST', body: { partnerId: biaId, name: 'Por Convite' } })).body.id;
  const bia = await login('bia', 'senha-bia-123');
  await bia(`/api/duos/${conv}/accept`, { method: 'POST', body: {} });
  d = (await ana('/api/social')).body.myDuo;
  assert.equal(d.since, d.formedAt, 'sem ajuste do admin: desde a formação');
  await sql`UPDATE duos SET status = ${'ended'} WHERE status IN (${'pending'}, ${'active'})`;
});

test('duplas: quem toma o 1º lugar avisa o parceiro (menos quando tomou do próprio parceiro)', async () => {
  const dono = await login('paulo', 'senha-dono-123'), ana = await login('ana', 'senha-ana-123'), bia = await login('bia', 'senha-bia-123');
  const anaId = await idOf('ana'), biaId = await idOf('bia');
  await sql`UPDATE duos SET status = ${'ended'} WHERE status IN (${'pending'}, ${'active'})`;
  assert.equal((await dono('/api/admin/duos', { method: 'POST', body: { aId: anaId, bId: biaId, name: 'Recordistas' } })).status, 201);
  const recs = async c => (await notesOf(c)).filter(n => n.kind === 'duo_record' && n.game === 'quiz');
  assert.equal((await play(dono, 'quiz', 10)).status, 201, 'primeira partida do jogo: ninguém é avisado');
  assert.equal((await recs(bia)).length, 0);
  assert.equal((await play(ana, 'quiz', 20)).status, 201, 'Ana tira o recorde do Paulo');
  const [n] = await recs(bia);
  assert.ok(n, 'Bia fica sabendo');
  assert.equal(n.by, 'Ana'); assert.equal(n.scope, 'geral'); assert.equal(n.name, 'Recordistas');
  assert.equal((await play(bia, 'quiz', 30)).status, 201, 'Bia tira o recorde da própria parceira');
  assert.equal((await recs(ana)).length, 0, 'Ana recebe só o aviso de recorde tomado');
  await sql`UPDATE duos SET status = ${'ended'} WHERE status = ${'active'}`;
});
