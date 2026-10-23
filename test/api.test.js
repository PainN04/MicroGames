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
/** Abre a partida no servidor (POST /api/plays) e volta o relógio dela, como se tivesse começado há `ago` ms. */
async function openPlay(c, game, ago = 30 * 60_000) {
  const r = await c('/api/plays', { method: 'POST', body: { game } });
  if (r.status !== 201) return null;
  await sql`UPDATE arcade_plays SET created_at = created_at - ${ago} WHERE id = ${r.body.id}`;
  return r.body;
}
const play = async (c, game, score, proof) => {
  const p = await openPlay(c, game);
  return c('/api/scores', { method: 'POST', body: { game, score, proof, play: p?.id } });
};

/** Partida do Ritmo numa música (POST /api/ritmo/score). */
const ritmoPlay = async (c, track, score, ago) => {
  const p = await openPlay(c, 'ritmo', ago);
  return c('/api/ritmo/score', { method: 'POST', body: { track, score, play: p?.id } });
};

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
  // "text/plain; application/json" é text/plain (outro site manda sem preflight): não pode passar como JSON
  const r3 = await fetch(base + '/api/auth/login', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain; application/json' } });
  assert.equal(r3.status, 415);
  // Origin "null" (iframe sandbox) é recusado, não vira erro 500
  const r4 = await fetch(base + '/api/auth/login', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: 'null' } });
  assert.equal(r4.status, 403);
  // salvar pontuação e sair também exigem JSON da própria origem
  const c = await login('ana', 'senha-ana-123');
  assert.equal((await c('/api/scores', { method: 'POST', body: { game: 'snake', score: 5 }, headers: { Origin: 'https://malicioso.example' } })).status, 403);
  assert.equal((await c('/api/auth/logout', { method: 'POST', body: {}, headers: { Origin: 'https://malicioso.example' } })).status, 403);
  assert.equal((await c('/api/auth/ping')).status, 200, 'o logout de outro site não derrubou a sessão');
  // corpo "null" não derruba a rota com 500
  const r5 = await fetch(base + '/api/auth/login', { method: 'POST', body: 'null', headers: { 'Content-Type': 'application/json' } });
  assert.equal(r5.status, 401);
});

test('freio de força bruta: 5 erros travam o login, espaço/maiúscula contam como o mesmo usuário, e vale no banco', async () => {
  await makeUser('cris', 'Cris', 'player', 'senha-cris-123');
  const c = client();
  for (const u of ['cris', ' cris', 'CRIS ', 'Cris', '  cris  ']) {
    assert.equal((await c('/api/auth/login', { method: 'POST', body: { username: u, password: 'errada' } })).status, 401);
  }
  const locked = await c('/api/auth/login', { method: 'POST', body: { username: 'cris', password: 'senha-cris-123' } });
  assert.equal(locked.status, 429, 'travado mesmo com a senha certa');
  const [row] = await sql`SELECT n, until_at FROM login_fails WHERE key = ${'cris'}`;
  assert.equal(Number(row.n), 5);
  assert.ok(Number(row.until_at) > Date.now(), 'o bloqueio fica no banco (vale pra todas as instâncias)');
  // passou o tempo: entra, e o contador zera
  await sql`UPDATE login_fails SET until_at = ${Date.now() - 1} WHERE key = ${'cris'}`;
  assert.equal((await c('/api/auth/login', { method: 'POST', body: { username: 'cris', password: 'senha-cris-123' } })).status, 200);
  assert.equal((await sql`SELECT 1 AS x FROM login_fails WHERE key = ${'cris'}`).length, 0);
});

test('trocar senha: chutar a senha atual também trava', async () => {
  await makeUser('duda', 'Duda', 'player', 'senha-duda-123');
  const c = await login('duda', 'senha-duda-123');
  for (let i = 0; i < 5; i++) assert.equal((await c('/api/auth/password', { method: 'POST', body: { current: 'chute' + i, next: 'nova-senha-123' } })).status, 400);
  assert.equal((await c('/api/auth/password', { method: 'POST', body: { current: 'senha-duda-123', next: 'nova-senha-123' } })).status, 429);
});

test('cabeçalhos de segurança: a API manda nosniff', async () => {
  const r = await client()('/api/version');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
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
  for (const a of require('../public/js/avatars.js').AVATARS) assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'img', 'avatars', `${a.id}.svg`)), `falta a imagem do avatar ${a.id}`);
  for (const g of GAMES) assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'img', 'avatars', `jogo-${g}.svg`)), `falta o avatar do jogo ${g}`);
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { avatar: 'lia:290' } })).status, 200);
  const look = await ana('/api/profile/look', { method: 'POST', body: { title: 'estreia' } });
  assert.deepEqual(look.body, { avatar: 'lia:290', title: 'estreia', showcase: null, bio: null }, 'mandar só o título mantém o avatar');

  // vitrine e frase
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { showcase: { ach: ['a1', 'a2', 'a3', 'a4'] } } })).status, 400, 'no máximo 3 conquistas');
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { showcase: { ach: [], game: 'nao-existe' } } })).status, 400);
  assert.equal((await ana('/api/profile/look', { method: 'POST', body: { bio: 'x'.repeat(61) } })).status, 400, 'frase até 60');
  const vit = await ana('/api/profile/look', { method: 'POST', body: { showcase: { ach: ['estreia', 'estreia', 'cobra'], game: 'snake' }, bio: '  oi\n  pessoal  ' } });
  assert.equal(vit.status, 200);
  assert.deepEqual(vit.body.showcase, { ach: ['estreia', 'cobra'], game: 'snake' }, 'conquista repetida conta uma vez');
  assert.equal(vit.body.bio, 'oi pessoal', 'frase vira uma linha só');
  const looks2 = (await client()('/api/flair')).body;
  assert.equal(looks2.bios.Ana, 'oi pessoal');
  assert.equal(looks2.showcases.Ana.game, 'snake');
  assert.equal((await bia('/api/admin/bio', { method: 'POST', body: { name: 'Ana' } })).status, 403, 'só admin apaga a frase');
  const adm = await login('outroadm', 'senha-adm-123');
  assert.equal((await adm('/api/admin/bio', { method: 'POST', body: { name: 'Ana' } })).status, 200);
  assert.equal((await client()('/api/flair')).body.bios.Ana, undefined, 'admin apagou a frase');
  assert.equal((await ana('/api/profile/frame', { method: 'POST', body: { frame: 'fogo' } })).status, 200, 'moldura de conquista');
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
  assert.equal((await play(bia, 'forca', 45)).status, 403, 'forca é conferida e salva pelo servidor');
  assert.equal((await play(bia, 'ligue4', 37)).status, 201);
  assert.equal((await play(bia, 'corredor', 1800)).status, 201);
  assert.equal((await play(bia, 'comecome', 2400)).status, 201);
  for (const g of ['termo', 'forca', 'anagrama', 'quiz']) assert.equal((await play(bia, g, 450)).status, 403, `${g}: só o servidor grava`);
  const { GAMES, isBetter } = require('../lib/rules');
  assert.ok(['pong', 'forca', 'ligue4', 'corredor', 'comecome', 'termo'].every(g => GAMES.includes(g)));
  assert.equal(isBetter('termo', 600, 450), true);
});

test('campo minado: vencer em menos de 1s vale (sem tempo mínimo), mas acima de 1h não', async () => {
  const bia = await login('bia', 'senha-bia-123');
  assert.equal((await play(bia, 'minado', 0.8)).status, 201, 'dá pra vencer no primeiro clique');
  assert.equal((await play(bia, 'minado', 3601)).status, 422);
  assert.equal((await play(bia, 'minado', -1)).status, 422);
});

test('jogos novos entram no sorteio do dia só a partir do lançamento (dias antigos não mudam)', () => {
  const { scheduledGame, DAILY_SINCE } = require('../public/js/daily.js');
  const { GAMES } = require('../lib/rules');
  const NEW = ['pong', 'forca', 'ligue4', 'corredor', 'comecome', 'termo'];
  for (const id of NEW) assert.ok(DAILY_SINCE[id] >= 20746, id);
  for (let d = 20000; d < 20746; d++) assert.ok(!NEW.includes(scheduledGame(GAMES, d, {})), 'dia ' + d);
  const seen = new Set();
  for (let d = 20746; d < 20746 + 27 * 2; d++) seen.add(scheduledGame(GAMES, d, {}));
  assert.ok(NEW.filter(g => g !== 'termo').every(g => seen.has(g)), 'todos entram no rodízio depois');
});

test('aba de jogos diários: Termo sai do desafio do dia a partir de 23/10/2026 e os dias anteriores não mudam', () => {
  const { scheduledGame, seededShuffle, DAILY_SINCE, DAILY_TAB } = require('../public/js/daily.js');
  const { GAMES } = require('../lib/rules');
  // sorteio de antes da aba (28 jogos, sem os diários novos)
  const OLD = GAMES.filter(g => g === 'termo' || !DAILY_TAB.includes(g));
  assert.equal(OLD.length, 28);
  const oldPick = i => { const r = OLD.filter(id => !(id in DAILY_SINCE) || i >= DAILY_SINCE[id]).sort(); return seededShuffle(r, Math.floor(i / r.length) * 7919 + 13)[i % r.length]; };
  for (let d = 20000; d < 20749; d++) assert.equal(scheduledGame(GAMES, d, {}), oldPick(d), 'dia ' + d);
  for (let d = 20749; d < 20749 + 200; d++) assert.ok(!DAILY_TAB.includes(scheduledGame(GAMES, d, {})), 'dia ' + d);
  assert.notEqual(scheduledGame(GAMES, 20760, { 20760: { game: 'termo' } }), 'termo', 'escolha antiga do Termo não vale mais');
  assert.equal(scheduledGame(GAMES, 20760, { 20760: { game: 'memoria' } }), 'memoria');
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
  assert.equal((await ritmoPlay(bia, 'treino', 80000)).status, 201, 'Ritmo (treino) só com Perfeitos (200 pts) e combo x4 passa de 80 mil');
  assert.equal((await ritmoPlay(bia, 'treino', 150000)).status, 422);
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
  const recs = async c => (await notesOf(c)).filter(n => n.kind === 'duo_record' && n.game === 'torre');
  assert.equal((await play(dono, 'torre', 10)).status, 201, 'primeira partida do jogo: ninguém é avisado');
  assert.equal((await recs(bia)).length, 0);
  assert.equal((await play(ana, 'torre', 20)).status, 201, 'Ana tira o recorde do Paulo');
  const [n] = await recs(bia);
  assert.ok(n, 'Bia fica sabendo');
  assert.equal(n.by, 'Ana'); assert.equal(n.scope, 'geral'); assert.equal(n.name, 'Recordistas');
  assert.equal((await play(bia, 'torre', 30)).status, 201, 'Bia tira o recorde da própria parceira');
  assert.equal((await recs(ana)).length, 0, 'Ana recebe só o aviso de recorde tomado');
  await sql`UPDATE duos SET status = ${'ended'} WHERE status = ${'active'}`;
});

/* ---------- respostas só no servidor (Termo, Forca, Anagrama, Quiz) ---------- */

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const roundState = async id => JSON.parse((await sql`SELECT state FROM game_rounds WHERE id = ${id}`)[0].state);
const boardOf = async game => ((await client()('/api/scores')).body[game] || []);

test('termo: a palavra fica no servidor, cada tentativa volta com as cores e o acerto é gravado pelo servidor', async () => {
  await makeUser('eva', 'Eva', 'player', 'senha-eva-123');
  const { termoSecret } = require('../lib/rounds');
  const { TERMO_ANSWERS } = require('../lib/words');
  const { today } = require('../lib/flair');
  const answer = norm(termoSecret(today()));
  const other = TERMO_ANSWERS.map(norm).find(w => w !== answer);
  const eva = await login('eva', 'senha-eva-123');
  assert.equal((await client()('/api/termo')).status, 401, 'precisa de login');
  const st = await eva('/api/termo');
  assert.equal(st.status, 200);
  assert.equal(st.body.word, null, 'a palavra não vem antes do fim');
  assert.equal(st.body.guesses.length, 0);
  assert.equal((await eva('/api/termo/guess', { method: 'POST', body: { guess: 'QQQQQ' } })).status, 422, 'palavra fora da lista');
  assert.equal((await eva('/api/termo/guess', { method: 'POST', body: { guess: 'AB' } })).status, 400);
  const g1 = await eva('/api/termo/guess', { method: 'POST', body: { guess: other } });
  assert.equal(g1.status, 200);
  assert.equal(g1.body.guesses[0].res.length, 5);
  assert.equal(g1.body.word, null);
  assert.equal(g1.body.saved, undefined);
  // o estado vem do servidor (outro aparelho vê a mesma tentativa)
  assert.equal((await eva('/api/termo')).body.guesses[0].guess, other);
  const g2 = await eva('/api/termo/guess', { method: 'POST', body: { guess: answer } });
  assert.equal(g2.body.won, true);
  assert.equal(g2.body.saved, 'ok');
  assert.ok(g2.body.score >= 500 && g2.body.score <= 599, 'acertou na 2ª: 500 + bônus de tempo');
  assert.equal(norm(g2.body.word), answer, 'no fim a palavra aparece');
  assert.ok((await boardOf('termo')).some(s => s.name === 'Eva' && s.score === g2.body.score));
  assert.equal((await eva('/api/termo/guess', { method: 'POST', body: { guess: other } })).status, 409, 'só uma partida por dia');
  assert.equal((await play(eva, 'termo', 699)).status, 403, 'e não dá pra mandar a pontuação direto');
});

test('forca: a página só recebe dica e letras descobertas; palavra certa soma, 6 erros acabam e o servidor grava', async () => {
  await makeUser('fabi', 'Fabi', 'player', 'senha-fabi-123');
  const { FORCA_WORDS } = require('../lib/words');
  const fabi = await login('fabi', 'senha-fabi-123');
  const r = await fabi('/api/rounds', { method: 'POST', body: { game: 'forca' } });
  assert.equal(r.status, 201);
  const st = await roundState(r.body.id);
  const [word] = FORCA_WORDS[st.deck[0]], plain = norm(word);
  assert.ok(!JSON.stringify(r.body).includes(plain.replace(/[^A-Z]/g, '')), 'a palavra não vai pra página');
  assert.ok(r.body.view.mask.every(c => c === '' || c === ' ' || c === '-'));
  // outra pessoa não joga a partida dela
  const ana = await login('ana', 'senha-ana-123');
  assert.equal((await ana('/api/rounds/' + r.body.id, { method: 'POST', body: { action: 'letter', letter: 'A' } })).status, 404);
  const letters = [...new Set(plain.replace(/[^A-Z]/g, ''))];
  let last;
  for (const l of letters) last = await fabi('/api/rounds/' + r.body.id, { method: 'POST', body: { action: 'letter', letter: l } });
  assert.equal(last.body.result.solved, true);
  assert.equal(last.body.result.word, word);
  const gain = plain.replace(/[^A-Z]/g, '').length + 6;
  assert.equal(last.body.view.pts, gain);
  // erra 6 letras na próxima palavra: acaba e grava
  const next = norm(FORCA_WORDS[(await roundState(r.body.id)).deck[1]][0]);
  const misses = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter(l => !next.includes(l)).slice(0, 6);
  for (const l of misses) last = await fabi('/api/rounds/' + r.body.id, { method: 'POST', body: { action: 'letter', letter: l } });
  assert.equal(last.body.result.lost, true);
  assert.equal(last.body.final, gain);
  assert.equal(last.body.saved, 'ok');
  assert.ok((await boardOf('forca')).some(s => s.name === 'Fabi' && s.score === gain));
  assert.equal((await fabi('/api/rounds/' + r.body.id, { method: 'POST', body: { action: 'letter', letter: 'Z' } })).status, 409, 'partida acabada não aceita jogada');
});

test('anagrama: confere no servidor, dica tira ponto, e só fecha (e grava) depois dos 60s', async () => {
  await makeUser('gil', 'Gil', 'player', 'senha-gil-123');
  const { ANAGRAMA_WORDS, ANAGRAMA_HINTS } = require('../lib/words');
  // toda palavra tem dica, e a dica não entrega a palavra
  const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  for (const w of ANAGRAMA_WORDS) assert.ok(ANAGRAMA_HINTS[w] && !plain(ANAGRAMA_HINTS[w]).includes(w), `dica de ${w}`);
  const gil = await login('gil', 'senha-gil-123');
  const r = await gil('/api/rounds', { method: 'POST', body: { game: 'anagrama' } });
  const id = r.body.id, call = body => gil('/api/rounds/' + id, { method: 'POST', body });
  let st = await roundState(id);
  const w1 = ANAGRAMA_WORDS[st.deck[0]];
  assert.notEqual(r.body.view.mix, w1);
  assert.equal(r.body.view.clue, ANAGRAMA_HINTS[w1], 'a dica vem junto com as letras');
  assert.ok(!JSON.stringify(r.body).includes(w1), 'a resposta não vai pra página');
  assert.equal([...r.body.view.mix].sort().join(''), [...w1].sort().join(''));
  assert.equal((await call({ action: 'answer', guess: 'XYZ' })).body.result.ok, false);
  assert.equal((await call({ action: 'hint' })).body.result.prefix, w1[0]);
  const ok = await call({ action: 'answer', guess: w1 });
  assert.equal(ok.body.result.ok, true);
  assert.equal(ok.body.result.gain, w1.length - 1, 'a dica tirou 1 ponto');
  assert.equal((await call({ action: 'finish' })).status, 409, 'ainda tem tempo');
  st = await roundState(id);
  st.startedAt -= 64_000;
  await sql`UPDATE game_rounds SET state = ${JSON.stringify(st)} WHERE id = ${id}`;
  assert.equal((await call({ action: 'answer', guess: 'ABC' })).status, 409, 'depois do tempo não vale resposta');
  const fin = await call({ action: 'finish' });
  assert.equal(fin.body.final, w1.length - 1);
  assert.equal(fin.body.saved, 'ok');
  assert.equal((await call({ action: 'finish' })).status, 409, 'fechar de novo não grava duas vezes');
  assert.equal((await boardOf('anagrama')).filter(s => s.name === 'Gil').length, 1);
});

test('quiz: a certa só aparece depois da resposta; combo e erro contam no servidor', async () => {
  await makeUser('hugo', 'Hugo', 'player', 'senha-hugo-123');
  const { QUIZ } = require('../lib/words');
  const hugo = await login('hugo', 'senha-hugo-123');
  const r = await hugo('/api/rounds', { method: 'POST', body: { game: 'quiz', daily: true } });
  assert.equal(r.status, 201);
  const id = r.body.id, call = body => hugo('/api/rounds/' + id, { method: 'POST', body });
  const correctIn = async view => { const st = await roundState(id); return view.opts.indexOf(QUIZ[st.deck[st.pos]][1]); };
  assert.equal(r.body.view.opts.length, 4);
  assert.equal('right' in r.body.view, false, 'a página não sabe qual é a certa');
  const a1 = await call({ action: 'answer', choice: await correctIn(r.body.view) });
  assert.equal(a1.body.result.ok, true);
  assert.equal(a1.body.view.pts, 1);
  const right = await correctIn(a1.body.view);
  const a2 = await call({ action: 'answer', choice: (right + 1) % 4 });
  assert.equal(a2.body.result.ok, false);
  assert.equal(a2.body.result.right, right, 'errou: mostra a certa');
  assert.equal(a2.body.view.pts, 0);
  const st = await roundState(id);
  st.startedAt -= 64_000;
  await sql`UPDATE game_rounds SET state = ${JSON.stringify(st)} WHERE id = ${id}`;
  const fin = await call({ action: 'finish' });
  assert.equal(fin.body.result.rights, 1);
  assert.equal(fin.body.result.wrongs, 1);
  assert.equal(fin.body.saved, 'ok');
});

test('jogos diários: Dueto e Quarteto conferem cada palpite nos quadros, a resposta só sai no fim e vale 1 partida por dia', async () => {
  await makeUser('ivo', 'Ivo', 'player', 'senha-ivo-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  const { TERMO_ANSWERS } = require('../lib/words');
  const ivo = await login('ivo', 'senha-ivo-123');
  assert.equal((await client()('/api/diarios/dueto')).status, 401, 'precisa de login');
  assert.equal((await ivo('/api/diarios/naoexiste')).status, 404);
  const words = d.multiWords('dueto', today()).map(norm);
  assert.equal(words.length, 2);
  assert.notEqual(words[0], words[1]);
  const st = await ivo('/api/diarios/dueto');
  assert.equal(st.status, 200);
  assert.ok(st.body.boards.every(b => b.word === null), 'a palavra não vem antes do fim');
  assert.ok(!words.some(w => st.text.includes(w)));
  const other = TERMO_ANSWERS.map(norm).find(w => !words.includes(w));
  assert.equal((await ivo('/api/diarios/dueto', { method: 'POST', body: { guess: 'QQQQQ' } })).status, 422);
  const g1 = await ivo('/api/diarios/dueto', { method: 'POST', body: { guess: other } });
  assert.equal(g1.body.boards[0].rows.length, 1);
  assert.equal(g1.body.boards[1].rows[0].res.length, 5);
  const g2 = await ivo('/api/diarios/dueto', { method: 'POST', body: { guess: words[1] } });
  assert.equal(g2.body.boards[1].solved, true);
  assert.equal(norm(g2.body.boards[1].word), words[1], 'quadro acertado mostra a palavra');
  assert.equal(g2.body.boards[0].word, null, 'o outro continua escondido');
  const g3 = await ivo('/api/diarios/dueto', { method: 'POST', body: { guess: words[0] } });
  assert.equal(g3.body.boards[1].rows.length, 2, 'quadro acertado para de receber palpites');
  assert.equal(g3.body.won, true);
  assert.equal(g3.body.saved, 'ok');
  assert.ok(g3.body.score >= 500 && g3.body.score <= 599, '3 tentativas de 7: 500 + bônus');
  assert.equal((await ivo('/api/diarios/dueto', { method: 'POST', body: { guess: other } })).status, 409, 'só uma partida por dia');
  assert.equal((await play(ivo, 'dueto', 699)).status, 403, 'não dá pra mandar a pontuação direto');
  assert.ok((await boardOf('dueto')).some(s => s.name === 'Ivo' && s.score === g3.body.score));
  // quarteto: 9 erros e acabou, sem gravar
  const q = d.multiWords('quarteto', today()).map(norm);
  assert.equal(new Set(q).size, 4);
  const wrong = TERMO_ANSWERS.map(norm).filter(w => !q.includes(w));
  let last;
  for (let i = 0; i < 9; i++) last = await ivo('/api/diarios/quarteto', { method: 'POST', body: { guess: wrong[i] } });
  assert.equal(last.body.over, true);
  assert.equal(last.body.won, false);
  assert.equal(last.body.saved, undefined);
  assert.deepEqual(last.body.boards.map(b => norm(b.word)), q, 'no fim mostra as 4');
  const status = await ivo('/api/diarios');
  assert.deepEqual(Object.keys(status.body.games).sort(), ['dueto', 'quarteto']);
  assert.equal(status.body.games.quarteto.won, false);
});

test('jogos diários: Contexto dá a posição de cada palpite, dica ajuda e a secreta só aparece no fim', async () => {
  await makeUser('jai', 'Jai', 'player', 'senha-jai-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  const c = d.ctxData(), secret = c.vocab[d.ctxSecretIdx(today())];
  assert.ok(c.secrets.every(w => c.vocab.includes(w)), 'toda resposta está no vocabulário');
  const jai = await login('jai', 'senha-jai-123');
  const st = await jai('/api/diarios/contexto');
  assert.equal(st.body.word, null);
  assert.ok(!st.text.includes(`"${secret}"`));
  assert.equal((await jai('/api/diarios/contexto', { method: 'POST', body: { guess: 'xkcdqwz' } })).status, 422, 'palavra desconhecida');
  const guess = secret === 'casa' ? 'carro' : 'casa';
  const g1 = await jai('/api/diarios/contexto', { method: 'POST', body: { guess: guess.toUpperCase() } });
  assert.equal(g1.status, 200);
  assert.ok(g1.body.guesses[0].rank > 1);
  const rep = await jai('/api/diarios/contexto', { method: 'POST', body: { guess } });
  assert.equal(rep.body.guesses.length, 1, 'repetido não conta');
  const h = await jai('/api/diarios/contexto', { method: 'POST', body: { action: 'hint' } });
  assert.equal(h.body.hints, 1);
  assert.ok(h.body.guesses[1].hint && h.body.guesses[1].rank < g1.body.guesses[0].rank && h.body.guesses[1].rank > 1, 'a dica chega mais perto, sem entregar');
  // sem acento também vale
  const win = await jai('/api/diarios/contexto', { method: 'POST', body: { guess: norm(secret) } });
  assert.equal(win.body.won, true);
  assert.equal(win.body.word, secret);
  assert.equal(win.body.top[0].word, secret);
  assert.equal(win.body.score, 1000 - 8 - 40, '2 palpites e 1 dica');
  assert.equal(win.body.saved, 'ok');
});

test('jogos diários: Conexões confere os grupos no servidor, avisa "falta uma" e 4 erros acabam', async () => {
  await makeUser('kai', 'Kai', 'player', 'senha-kai-123');
  const d = require('../lib/diarios');
  const { CONEXOES } = require('../lib/conexoes');
  const { today } = require('../lib/flair');
  const all = CONEXOES.flatMap(g => g.palavras);
  assert.equal(new Set(all).size, all.length, 'nenhuma palavra em dois grupos');
  for (let day = today(); day < today() + 60; day++) {
    const p = d.cxPuzzle(day);
    assert.deepEqual(p.groups.map(g => g.nivel), [1, 2, 3, 4]);
    assert.equal(new Set(p.board).size, 16);
    assert.equal(new Set(p.groups.map(g => CONEXOES.find(x => x.nome === g.nome).tema)).size, 4, 'temas diferentes no mesmo dia');
  }
  const { groups } = d.cxPuzzle(today());
  const kai = await login('kai', 'senha-kai-123');
  const st = await kai('/api/diarios/conexoes');
  assert.equal(st.body.words.length, 16);
  assert.ok(!st.text.includes(groups[0].nome), 'o nome dos grupos não vai antes');
  const send = words => kai('/api/diarios/conexoes', { method: 'POST', body: { words } });
  assert.equal((await send(['X', 'Y', 'Z', 'W'])).status, 400);
  const almost = [...groups[0].palavras.slice(0, 3), groups[1].palavras[0]];
  const r1 = await send(almost);
  assert.equal(r1.body.result.ok, false);
  assert.equal(r1.body.result.oneAway, true);
  assert.equal(r1.body.mistakes, 1);
  assert.equal((await send(almost)).body.mistakes, 1, 'a mesma tentativa não conta duas vezes');
  const r2 = await send(groups[2].palavras);
  assert.equal(r2.body.result.ok, true);
  assert.equal(r2.body.solved[0].nome, groups[2].nome);
  assert.equal(r2.body.words.length, 12);
  for (const g of [groups[0], groups[1], groups[3]]) await send(g.palavras);
  const end = await kai('/api/diarios/conexoes');
  assert.equal(end.body.won, true);
  assert.ok((await boardOf('conexoes')).some(s => s.name === 'Kai' && s.score === end.body.score && s.score >= 400));
});

test('jogos diários: Alvo refaz as contas no servidor e só aceita números que existem', async () => {
  await makeUser('lia2', 'Lia', 'player', 'senha-lia-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  for (let day = today(); day < today() + 40; day++) {
    const p = d.alvoPuzzle(day);
    assert.equal(p.nums.length, 6);
    assert.ok(p.target >= 101 && p.target <= 999);
  }
  assert.throws(() => d.alvoCheck([1, 2, 3, 4, 25, 50], [[25, '*', 25]]), /não existe/, 'cada número uma vez');
  assert.throws(() => d.alvoCheck([1, 2, 3, 4, 25, 50], [[3, '/', 2]]), /inteiro/);
  assert.throws(() => d.alvoCheck([1, 2, 3, 4, 25, 50], [[2, '-', 3]]), /positivo/);
  assert.deepEqual(d.alvoCheck([1, 2, 3, 4, 25, 50], [[25, '*', 4], [100, '+', 3]]), [100, 103]);
  const lia = await login('lia2', 'senha-lia-123');
  const st = await lia('/api/diarios/alvo');
  assert.equal(st.body.solution, null, 'a solução só aparece no fim');
  const { nums, target } = st.body;
  assert.equal((await lia('/api/diarios/alvo', { method: 'POST', body: { steps: [[999, '+', 1]] } })).status, 400);
  // a mesma conta da página: os dois maiores somados
  const [a, b] = [...nums].sort((x, y) => y - x);
  const r = await lia('/api/diarios/alvo', { method: 'POST', body: { steps: [[a, '+', b]] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.over, true);
  assert.equal(r.body.result.value, a + b);
  assert.equal(r.body.result.diff, Math.abs(a + b - target));
  assert.ok(r.body.solution, 'no fim mostra um jeito de chegar');
  assert.equal((await lia('/api/diarios/alvo', { method: 'POST', body: { steps: [[a, '+', b]] } })).status, 409, 'uma tentativa por dia');
  assert.equal((await play(lia, 'alvo', 599)).status, 403);
});

test('jogos diários: Octeto tem 8 quadros e 13 tentativas', async () => {
  await makeUser('oto', 'Oto', 'player', 'senha-oto-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  const words = d.multiWords('octeto', today()).map(norm);
  assert.equal(new Set(words).size, 8);
  const oto = await login('oto', 'senha-oto-123');
  const st = await oto('/api/diarios/octeto');
  assert.equal(st.body.boards.length, 8);
  assert.equal(st.body.rows, 13);
  assert.ok(!words.some(w => st.text.includes(w)));
  let last;
  for (const w of words) last = await oto('/api/diarios/octeto', { method: 'POST', body: { guess: w } });
  assert.equal(last.body.won, true);
  assert.ok(last.body.score >= 600 && last.body.score <= 699, '8 tentativas de 13: 600 + bônus');
  assert.equal(last.body.saved, 'ok');
});

test('jogos diários: Soletra só aceita palavras da colmeia com a letra do meio e grava ao encerrar', async () => {
  await makeUser('sol', 'Sol', 'player', 'senha-sol-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  for (let day = today(); day < today() + 30; day++) {
    const p = d.solPuzzle(day);
    assert.equal(p.outer.length, 6);
    assert.ok(p.answers.length >= 15 && p.answers.length <= 60);
    assert.ok(p.answers.some(a => a.pangram), 'sempre tem uma palavra com as 7 letras');
    assert.ok(p.answers.every(a => a.k.includes(p.center) && [...a.k].every(c => c === p.center || p.outer.includes(c))));
  }
  const p = d.solPuzzle(today());
  const sol = await login('sol', 'senha-sol-123');
  const st = await sol('/api/diarios/soletra');
  assert.equal(st.body.all, null, 'a lista de palavras só aparece no fim');
  assert.equal(st.body.count, p.answers.length);
  const bad = p.outer.join('').slice(0, 4);
  assert.equal((await sol('/api/diarios/soletra', { method: 'POST', body: { word: bad } })).status, 422, 'sem a letra do meio');
  assert.equal((await sol('/api/diarios/soletra', { method: 'POST', body: { word: 'abc' } })).status, 400, 'mínimo de 4 letras');
  const [a, b] = p.answers;
  const r1 = await sol('/api/diarios/soletra', { method: 'POST', body: { word: a.w.toUpperCase() } });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.result.points, d.solPoints(a));
  assert.equal((await sol('/api/diarios/soletra', { method: 'POST', body: { word: a.k } })).body.result.repeat, a.w, 'repetida não conta de novo');
  await sol('/api/diarios/soletra', { method: 'POST', body: { word: b.k } });
  const end = await sol('/api/diarios/soletra', { method: 'POST', body: { action: 'end' } });
  assert.equal(end.body.over, true);
  assert.equal(end.body.score, d.solPoints(a) + d.solPoints(b));
  assert.equal(end.body.saved, 'ok');
  assert.equal(end.body.all.length, p.answers.length, 'no fim mostra todas');
  assert.equal((await sol('/api/diarios/soletra', { method: 'POST', body: { word: b.k } })).status, 409);
});

test('jogos diários: Senha conta cores no lugar e fora do lugar', async () => {
  await makeUser('sen', 'Sen', 'player', 'senha-sen-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  assert.deepEqual(d.senhaEval([0, 0, 1, 2], [0, 1, 0, 3]), { exact: 1, near: 2 });
  assert.deepEqual(d.senhaEval([5, 5, 5, 5], [5, 1, 2, 3]), { exact: 1, near: 0 }, 'cor repetida não conta duas vezes');
  const code = d.senhaCode(today());
  const sen = await login('sen', 'senha-sen-123');
  const st = await sen('/api/diarios/senha');
  assert.equal(st.body.code, null);
  assert.equal((await sen('/api/diarios/senha', { method: 'POST', body: { guess: [0, 1, 9, 2] } })).status, 400);
  const other = code.map(c => (c + 1) % 6);
  const g1 = await sen('/api/diarios/senha', { method: 'POST', body: { guess: other } });
  assert.deepEqual({ exact: g1.body.guesses[0].exact, near: g1.body.guesses[0].near }, d.senhaEval(other, code));
  const g2 = await sen('/api/diarios/senha', { method: 'POST', body: { guess: code } });
  assert.equal(g2.body.won, true);
  assert.ok(g2.body.score >= 700 && g2.body.score <= 799);
  assert.deepEqual(g2.body.code, code);
});

test('jogos diários: Equação só aceita conta certa de 8 símbolos', async () => {
  await makeUser('equ', 'Equ', 'player', 'senha-equ-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  for (let day = today(); day < today() + 60; day++) {
    const e = d.eqSecret(day);
    assert.equal(e.length, 8);
    assert.equal(d.eqInvalid(e), null, e);
  }
  assert.equal(d.eqInvalid('9*8-3=69'), null, '× antes de −');
  assert.match(d.eqInvalid('12+35=48'), /não fecha/);
  assert.match(d.eqInvalid('01+2=003'), /resultado|não vale/);
  assert.match(d.eqInvalid('10/4+1=3'), /não vale/, 'divisão quebrada');
  assert.deepEqual(d.eqEvaluate('13+34=47', '12+35=47'), ['g', 'x', 'g', 'g', 'x', 'g', 'g', 'g']);
  const ans = d.eqSecret(today());
  const equ = await login('equ', 'senha-equ-123');
  const st = await equ('/api/diarios/equacao');
  assert.equal(st.body.answer, null);
  assert.ok(!st.text.includes(ans));
  assert.equal((await equ('/api/diarios/equacao', { method: 'POST', body: { guess: '12+35=48' } })).status, 422);
  const r = await equ('/api/diarios/equacao', { method: 'POST', body: { guess: ans.replace(/\*/g, '×') } });
  assert.equal(r.body.won, true);
  assert.ok(r.body.score >= 600 && r.body.score <= 699);
});

test('jogos diários: Bandeira manda só o desenho, diz distância e direção e dá dicas', async () => {
  await makeUser('ban', 'Ban', 'player', 'senha-ban-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  const { list } = d.flagData();
  const ans = list[d.flagIdx(today())];
  assert.ok(list.every(c => !/\sid="(?!f\d)/.test(c.svg)), 'sem id com a sigla do país');
  const ban = await login('ban', 'senha-ban-123');
  const st = await ban('/api/diarios/bandeira');
  assert.equal(st.body.answer, null);
  assert.equal(st.body.continente, null);
  assert.ok(st.body.svg.startsWith('<svg'));
  assert.ok(st.body.names.includes(ans.nome), 'a lista de nomes vem pra completar');
  assert.ok(!st.body.svg.includes(ans.nome));
  assert.equal((await ban('/api/diarios/bandeira', { method: 'POST', body: { guess: 'Atlântida' } })).status, 422);
  const wrong = list.filter(c => c !== ans).slice(0, 4);
  let r;
  for (const c of wrong.slice(0, 2)) r = await ban('/api/diarios/bandeira', { method: 'POST', body: { guess: c.nome.toUpperCase() } });
  assert.ok(r.body.guesses[1].km > 0 && ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'].includes(r.body.guesses[1].dir));
  assert.equal(r.body.continente, ans.continente, 'continente depois de 2 erros');
  assert.equal(r.body.capital, null);
  const rep = await ban('/api/diarios/bandeira', { method: 'POST', body: { guess: wrong[0].nome } });
  assert.equal(rep.body.guesses.length, 2, 'repetido não gasta palpite');
  const ok = await ban('/api/diarios/bandeira', { method: 'POST', body: { guess: ans.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() } });
  assert.equal(ok.body.won, true, 'sem acento também vale');
  assert.ok(ok.body.score >= 400 && ok.body.score <= 499);
  assert.equal(ok.body.answer, ans.nome);
  assert.equal(d.flagData().byKey.get('eua'), list.findIndex(c => c.nome === 'Estados Unidos'), 'apelidos valem');
});

test('jogos diários: Caça-palavras confere a linha marcada no servidor', async () => {
  await makeUser('cac', 'Cac', 'player', 'senha-cac-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  for (let day = today(); day < today() + 30; day++) {
    const p = d.cpPuzzle(day);
    assert.equal(p.grid.length, 100);
    assert.equal(p.words.length, 8);
    p.place.forEach(w => assert.equal(d.cpLine(p.grid, w.from, w.to), w.word));
  }
  const p = d.cpPuzzle(today());
  const cac = await login('cac', 'senha-cac-123');
  const st = await cac('/api/diarios/cacapalavras');
  assert.equal(st.body.place, null, 'onde estão só aparece no fim');
  assert.deepEqual(st.body.words, p.words);
  assert.equal((await cac('/api/diarios/cacapalavras', { method: 'POST', body: { from: 0, to: 12 } })).status, 422, 'linha torta');
  let r;
  for (const [k, w] of p.place.entries()) {
    // metade marcada de trás pra frente
    r = await cac('/api/diarios/cacapalavras', { method: 'POST', body: k % 2 ? { from: w.to, to: w.from } : { from: w.from, to: w.to } });
    assert.equal(r.status, 200);
  }
  assert.equal(r.body.won, true);
  assert.ok(r.body.score >= 100 && r.body.score <= 999);
  assert.equal(r.body.saved, 'ok');
  assert.ok(r.body.place);
  const status = await cac('/api/diarios');
  assert.equal(status.body.games.cacapalavras.won, true);
});

test('jogos diários: Cruzadinha tem dica pra toda palavra e confere a grade no servidor', async () => {
  await makeUser('cru', 'Cru', 'player', 'senha-cru-123');
  const d = require('../lib/diarios');
  const { today } = require('../lib/flair');
  const { grids, clues } = require('../lib/data/cruzadinha.json');
  assert.ok(grids.length >= 200, 'grades pra boa parte do ano');
  assert.equal(new Set(grids).size, grids.length, 'grades repetidas');
  for (const g of grids) {
    assert.match(g, /^[A-Z#]{25}$/);
    // cada linha e coluna: os trechos de 2+ letras são palavras com dica, sem palavra repetida na grade
    const words = [];
    for (let a = 0; a < 5; a++) for (const line of [[0, 1, 2, 3, 4].map(k => g[a * 5 + k]).join(''), [0, 1, 2, 3, 4].map(k => g[k * 5 + a]).join('')])
      line.split('#').filter(w => w.length > 1).forEach(w => words.push(w));
    words.forEach(w => assert.ok(clues[w], `sem dica: ${w}`));
    assert.equal(new Set(words).size, words.length, `palavra repetida em ${g}`);
  }
  const p = d.cwPuzzle(today());
  p.slots.forEach(s => assert.ok(s.clue && s.word.length >= 3));
  const cru = await login('cru', 'senha-cru-123');
  const st = await cru('/api/diarios/cruzadinha');
  assert.equal(st.body.answer, null, 'a resposta só aparece no fim');
  assert.ok(!JSON.stringify(st.body).includes(p.slots[0].word) || p.slots[0].word.length < 4, 'a página não recebe as palavras');
  assert.equal(st.body.across.length + st.body.down.length, p.slots.length);
  const wrongGrid = [...p.grid].map(c => (c === '#' ? '#' : c === 'A' ? 'E' : 'A')).join('');
  assert.equal((await cru('/api/diarios/cruzadinha', { method: 'POST', body: { letters: wrongGrid.replace(/[A-Z]/, ' ') } })).status, 422, 'grade incompleta');
  let r = await cru('/api/diarios/cruzadinha', { method: 'POST', body: { action: 'check', letters: wrongGrid } });
  assert.equal(r.status, 200);
  assert.equal(r.body.checks, 1);
  assert.equal(r.body.wrong.length, [...p.grid].filter(c => c !== '#').length, 'conferir marca as casas erradas');
  r = await cru('/api/diarios/cruzadinha', { method: 'POST', body: { letters: wrongGrid } });
  assert.equal(r.body.over, false, 'errar não acaba a partida');
  r = await cru('/api/diarios/cruzadinha', { method: 'POST', body: { letters: p.grid.toLowerCase() } });
  assert.equal(r.body.won, true);
  assert.ok(r.body.score >= 100 && r.body.score <= 999 - 60 - 20);
  assert.equal(r.body.saved, 'ok');
  assert.equal(r.body.answer, p.grid);
  assert.equal((await cru('/api/diarios/cruzadinha', { method: 'POST', body: { letters: p.grid } })).status, 409, 'uma partida por dia');
});

/* ---------- jogos de arcade: partida aberta no servidor (lib/plays.js) ---------- */

test('arcade: todo jogo é conferido no servidor ou precisa de partida aberta', () => {
  const { GAMES } = require('../lib/rules');
  const { SERVER_GAMES } = require('../lib/rounds');
  const { ARCADE } = require('../lib/plays');
  for (const g of GAMES) assert.ok(SERVER_GAMES.has(g) !== ARCADE.has(g), g);
});

test('arcade: sem partida, partida de outro jogo, de outra conta ou repetida não salva', async () => {
  const ana = await login('ana', 'senha-ana-123'), bia = await login('bia', 'senha-bia-123');
  const send = (c, body) => c('/api/scores', { method: 'POST', body });
  const r0 = await send(ana, { game: 'snake', score: 10 });
  assert.equal(r0.status, 422);
  assert.match(r0.body.error, /não foi aberta/);
  const p = await openPlay(ana, 'snake');
  assert.equal((await send(ana, { game: 'tijolos', score: 10, play: p.id })).status, 422, 'partida é de outro jogo');
  assert.equal((await send(bia, { game: 'snake', score: 10, play: p.id })).status, 422, 'partida é de outra conta');
  assert.equal((await send(ana, { game: 'snake', score: 10, play: p.id })).status, 201);
  const again = await send(ana, { game: 'snake', score: 10, play: p.id });
  assert.equal(again.status, 422, 'mesma partida duas vezes');
  assert.match(again.body.error, /já usada/);
  assert.equal((await ana('/api/plays', { method: 'POST', body: { game: 'termo' } })).status, 400, 'Termo é conferido no servidor');
  assert.equal((await client()('/api/plays', { method: 'POST', body: { game: 'snake' } })).status, 401);
});

test('arcade: o relógio é o do servidor (não cabe 30s de jogo em 1s nem pontos demais pro tempo)', async () => {
  const ana = await login('ana', 'senha-ana-123');
  const send = async (game, score, ago, proof) => {
    const p = await openPlay(ana, game, ago);
    return ana('/api/scores', { method: 'POST', body: { game, score, proof, play: p.id } });
  };
  assert.equal((await send('matematica', 20, 1000)).status, 422, 'jogo de 30s enviado 1s depois');
  assert.equal((await send('matematica', 20, 31_000)).status, 201);
  assert.equal((await send('chuva', 100, 20_000)).status, 422, 'sobreviveu 100s numa partida de 20s');
  assert.equal((await send('chuva', 18.5, 20_000)).status, 201);
  assert.equal((await send('snake', 400, 10_000)).status, 422, '400 pontos de Snake em 10s');
  assert.equal((await send('memoria', 40, 30_000)).status, 422, '40 rodadas de Memória em 30s');
  assert.equal((await send('reflexo', 200, 1000)).status, 422, '3 rodadas de Reflexo em 1s');
  assert.equal((await send('reflexo', 200, 9000)).status, 201);
});

test('arcade: 2048 refaz a partida com a semente do servidor e a pontuação tem que bater', async () => {
  const { replay2048 } = require('../lib/plays');
  const ana = await login('ana', 'senha-ana-123');
  const p = await openPlay(ana, 'g2048', 60_000);
  let moves = '';
  for (let k = 0; k < 300; k++) {
    const d = ['L', 'D', 'R', 'U'].find(x => replay2048(p.seed, moves + x) !== null);
    if (!d) break;
    moves += d;
  }
  const score = replay2048(p.seed, moves);
  assert.ok(score > 0);
  const send = (body) => ana('/api/scores', { method: 'POST', body: { game: 'g2048', ...body } });
  assert.equal((await send({ score: score + 4, proof: moves, play: p.id })).status, 422, 'pontuação inventada');
  const p2 = await openPlay(ana, 'g2048', 60_000);
  assert.equal((await send({ score, proof: 'XYZ', play: p2.id })).status, 422, 'movimentos inválidos');
  const p3 = await openPlay(ana, 'g2048', 60_000);
  assert.equal((await send({ score, proof: moves, play: p3.id })).status, 422, 'movimentos de outra semente');
  // com a semente certa e os movimentos de verdade, vale
  const p4 = await openPlay(ana, 'g2048', 60_000);
  let m4 = '';
  for (let k = 0; k < 200; k++) { const d = ['L', 'D', 'R', 'U'].find(x => replay2048(p4.seed, m4 + x) !== null); if (!d) break; m4 += d; }
  assert.equal((await send({ score: replay2048(p4.seed, m4), proof: m4, play: p4.id })).status, 201);
});

test('arcade: freio de partidas abertas por conta', async () => {
  const bia = await login('bia', 'senha-bia-123');
  const [{ id }] = await sql`SELECT id FROM users WHERE username = ${'bia'}`;
  const now = Date.now();
  for (let k = 0; k < 120; k++) await sql`INSERT INTO arcade_plays (id, user_id, game, created_at, seed, used) VALUES (${'freio' + k}, ${id}, ${'snake'}, ${now}, ${1}, ${false})`;
  assert.equal((await bia('/api/plays', { method: 'POST', body: { game: 'snake' } })).status, 429);
  await sql`DELETE FROM arcade_plays WHERE id LIKE ${'freio%'}`;
  assert.equal((await bia('/api/plays', { method: 'POST', body: { game: 'snake' } })).status, 201);
});

/* ---------- Ritmo: músicas, ranking por música e pontuação geral ---------- */

test('ritmo: cada música tem o seu recorde e a pontuação geral é a soma do melhor de cada uma', async () => {
  const ritmo = require('../lib/ritmo');
  // duas músicas de 60s com 100 notas cada (teto: 100 × 200 × 4 = 80 mil)
  const notes = Array.from({ length: 100 }, (_, i) => [1000 + i * 500, i % 4]);
  for (const id of ['rock-a', 'rock-b']) ritmo.songs().set(id, { id, title: id, artist: 'Teste', durationMs: 60000, max: ritmo.maxScore(notes) });
  assert.equal(ritmo.maxScore(notes), 80000);
  assert.equal(ritmo.maxScore([[0, 0, 1000]]), 800 + 11 * 20 + 200, 'nota comprida: pingos e bônus no combo máximo');

  const ana = await login('ana', 'senha-ana-123');
  const base = (await ana('/api/ritmo')).body.mine;
  const before = Object.values(base).reduce((a, b) => a + b, 0);
  assert.equal((await ritmoPlay(ana, 'rock-a', 30000)).status, 201);
  let r = await ritmoPlay(ana, 'rock-b', 20000);
  assert.equal(r.status, 201);
  assert.equal(r.body.total, before + 50000, 'geral = soma das músicas');
  r = await ritmoPlay(ana, 'rock-a', 10000);
  assert.equal(r.body.total, before + 50000, 'partida pior não baixa a geral');
  assert.equal(r.body.prevBest, 30000);
  r = await ritmoPlay(ana, 'rock-a', 40000);
  assert.equal(r.body.total, before + 60000, 'recorde novo na música sobe a geral');

  // o ranking do jogo (scores) guarda a geral; o de cada música vem do /api/ritmo
  const board = (await ana('/api/scores')).body.ritmo.filter(s => s.name === 'Ana');
  assert.equal(Math.max(...board.map(s => s.score)), before + 60000);
  const ov = (await ana('/api/ritmo')).body;
  assert.ok(ov.songs.some(s => s.id === 'treino'), 'o treino (música gerada) continua');
  assert.equal(ov.boards['rock-a'][0].score, 40000);
  assert.equal(ov.boards['rock-a'].filter(x => x.name === 'Ana').length, 1, 'uma linha por pessoa: o melhor dela');
  assert.equal(ov.mine['rock-b'], 20000);
});

test('ritmo: à prova de F12 — teto da música, música inexistente, partida curta, reuso e envio direto no /api/scores', async () => {
  const bia = await login('bia', 'senha-bia-123');
  assert.equal((await ritmoPlay(bia, 'rock-a', 80001)).status, 422, 'acima do teto do mapa de notas');
  assert.equal((await ritmoPlay(bia, 'rock-a', 1.5)).status, 422, 'pontuação quebrada');
  assert.equal((await ritmoPlay(bia, 'nao-existe', 100)).status, 422);
  assert.equal((await ritmoPlay(bia, 'rock-a', 1000, 10_000)).status, 422, 'partida de 10s numa música de 60s');
  const p = await openPlay(bia, 'ritmo');
  assert.equal((await bia('/api/ritmo/score', { method: 'POST', body: { track: 'rock-a', score: 100, play: p.id } })).status, 201);
  assert.equal((await bia('/api/ritmo/score', { method: 'POST', body: { track: 'rock-a', score: 100, play: p.id } })).status, 422, 'partida já usada');
  assert.equal((await play(bia, 'ritmo', 100)).status, 409, 'a geral não se manda pelo /api/scores');
  assert.equal((await bia('/api/ritmo/score', { method: 'POST', body: { track: 'rock-a', score: 100 } })).status, 422, 'sem partida aberta');
});

test('ritmo: o recorde antigo (música gerada) vira o Treino na primeira migração', async () => {
  const ritmo = require('../lib/ritmo');
  const uid = (await sql`SELECT id FROM users WHERE username = ${'outroadm'}`)[0].id;
  await sql`DELETE FROM settings WHERE key = ${'ritmo_tracks_v1'}`;
  await sql`DELETE FROM ritmo_scores WHERE user_id = ${uid}`;
  await sql`INSERT INTO scores (game, player, score, created_at, user_id) VALUES (${'ritmo'}, ${'Outro Admin'}, ${12345}, ${Date.now()}, ${uid})`;
  await ritmo.migrateLegacy();
  assert.deepEqual(await ritmo.bestsOf(uid), { treino: 12345 });
  await ritmo.migrateLegacy();
  assert.deepEqual(await ritmo.bestsOf(uid), { treino: 12345 }, 'roda uma vez só');
});
