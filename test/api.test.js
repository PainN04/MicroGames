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
