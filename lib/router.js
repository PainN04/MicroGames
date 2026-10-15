// Todas as rotas /api/*. Usado pela Vercel (api/index.js) e pelo servidor local (server.js),
// então o que se testa local é exatamente o código de produção.
const { sql } = require('./store');
const { ensureSchema } = require('./schema');
const { checkSubmission, groupByGame } = require('./rules');
const { logVitals } = require('./vitals');
const auth = require('./auth');
const { gateFor, getRules, saveRules, situationNames } = require('./geiko');

/* ---------- utilidades ---------- */

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1e5) throw Object.assign(new Error('corpo grande demais'), { status: 413 });
  }
  return data ? JSON.parse(data) : {};
}

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const KICKED = 'Sua conta entrou em outro dispositivo — só dá pra usar em um por vez.';

// Contra CSRF: ações que mudam algo exigem JSON e (se o navegador mandar) Origin do próprio site.
function requireSameOriginJson(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) throw new HttpError(415, 'Envie JSON.');
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Origem não permitida.');
}

async function requireUser(req) {
  const { user, reason } = await auth.sessionStatus(req);
  if (!user) throw new HttpError(401, reason === 'other-device' ? KICKED : 'Faça login pra continuar.', { reason });
  return user;
}
async function requireAdmin(req) {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw new HttpError(403, 'Só administradores.');
  return user;
}

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;
const GEIKO_ID_RE = /^\d{1,12}$/;
function cleanUserInput(body, { partial = false } = {}) {
  const out = {};
  if (!partial || 'username' in body) {
    const u = String(body.username || '').trim();
    if (!USERNAME_RE.test(u)) throw new HttpError(400, 'Usuário: 3 a 32 caracteres (letras, números, ponto, hífen ou _).');
    out.username = u;
  }
  if (!partial || 'name' in body) {
    const n = String(body.name || '').trim();
    if (n.length < 1 || n.length > 40) throw new HttpError(400, 'Nome: de 1 a 40 caracteres.');
    out.name = n;
  }
  if (!partial || 'geikoId' in body) {
    const g = String(body.geikoId ?? '').trim();
    if (g && !GEIKO_ID_RE.test(g)) throw new HttpError(400, 'ID do Geiko: só números.');
    out.geikoId = g || null;
  }
  if (!partial || 'role' in body) {
    const r = body.role || 'player';
    if (!['player', 'admin'].includes(r)) throw new HttpError(400, 'Papel inválido.');
    out.role = r;
  }
  if ('active' in body) out.active = !!body.active;
  return out;
}

/* ---------- rotas ---------- */

async function route(req, res, path, opts) {
  const method = req.method;

  if (path === '/api/version' && method === 'GET') return send(res, 200, { version: opts.version() });

  if (path === '/api/vitals' && method === 'POST') {
    try { logVitals(await readBody(req)); } catch {}
    return send(res, 204);
  }

  await ensureSchema();

  /* --- ranking --- */
  if (path === '/api/scores' && method === 'GET') {
    return send(res, 200, groupByGame(await sql`SELECT game, player AS name, score, created_at AS date FROM scores`));
  }
  if (path === '/api/scores' && method === 'POST') {
    const user = await requireUser(req);
    if (user.mustChange) throw new HttpError(403, 'Troque sua senha antes de jogar.');
    const gate = await gateFor(user);
    const br = n => String(n).replace('.', ',');
    if (gate.blocked) throw new HttpError(423, `Você está com ${br(gate.total)} pontos de fila no Geiko (limite ${br(gate.limit)}). Resolva os tickets pra liberar.`);
    const body = await readBody(req);
    const { status, error, entry } = checkSubmission({ ...body, player: user.name });
    if (error) throw new HttpError(status, error);
    await sql`INSERT INTO scores (game, player, score, created_at, user_id) VALUES (${entry.game}, ${entry.player}, ${entry.score}, ${Date.now()}, ${user.id})`;
    return send(res, 201, { ok: true });
  }

  /* --- login --- */
  if (path === '/api/auth/login' && method === 'POST') {
    requireSameOriginJson(req);
    const { username = '', password = '' } = await readBody(req);
    const wait = auth.throttleCheck(username);
    if (wait) throw new HttpError(429, `Muitas tentativas. Tente de novo em ${wait}s.`);
    const user = await auth.findUserByUsername(username);
    const ok = await auth.verifyPassword(String(password), user ? user.passwordHash : auth.DUMMY_HASH);
    if (!user || !ok) { auth.throttleFail(username); throw new HttpError(401, 'Usuário ou senha incorretos.'); }
    auth.throttleOk(username);
    const token = await auth.startSession(user); // derruba a sessão de qualquer outro aparelho
    return send(res, 200, { user: auth.publicUser(user) }, { 'Set-Cookie': auth.sessionCookie(token) });
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const user = await auth.currentUser(req);
    if (user) await auth.endSession(user);
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
  }
  if (path === '/api/auth/me' && method === 'GET') {
    const { user, reason } = await auth.sessionStatus(req);
    if (!user) return send(res, 200, { user: null, reason });
    return send(res, 200, { user: auth.publicUser(user), gate: user.mustChange ? null : await gateFor(user) });
  }
  // conferência leve que a página faz a cada ~20s pra saber se a conta entrou em outro aparelho
  if (path === '/api/auth/ping' && method === 'GET') {
    await requireUser(req);
    return send(res, 200, { ok: true });
  }
  if (path === '/api/auth/password' && method === 'POST') {
    requireSameOriginJson(req);
    const user = await requireUser(req);
    const { current = '', next = '' } = await readBody(req);
    if (!(await auth.verifyPassword(String(current), user.passwordHash))) throw new HttpError(400, 'Senha atual incorreta.');
    if (String(next).length < 8) throw new HttpError(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
    if (next === current) throw new HttpError(400, 'A nova senha tem que ser diferente da atual.');
    const hash = await auth.hashPassword(String(next));
    await sql`UPDATE users SET password_hash = ${hash}, must_change = ${false}, token_version = token_version + 1 WHERE id = ${user.id}`;
    const fresh = await auth.findUserById(user.id); // token_version novo: reemite o cookie pra não deslogar quem trocou
    return send(res, 200, { user: auth.publicUser(fresh) }, { 'Set-Cookie': auth.sessionCookie(await auth.signSession(fresh)) });
  }
  if (path === '/api/gate' && method === 'GET') {
    const user = await requireUser(req);
    return send(res, 200, await gateFor(user, { force: opts.query.get('force') === '1' }));
  }

  /* --- painel admin --- */
  if (path === '/api/admin/users' && method === 'GET') {
    await requireAdmin(req);
    const rows = await sql`SELECT * FROM users ORDER BY lower(name)`;
    return send(res, 200, { users: rows.map(r => auth.publicUser(auth.mapUser(r))) });
  }
  if (path === '/api/admin/users' && method === 'POST') {
    requireSameOriginJson(req);
    await requireAdmin(req);
    const data = cleanUserInput(await readBody(req));
    if ((await sql`SELECT id FROM users WHERE lower(username) = lower(${data.username})`).length) {
      throw new HttpError(409, 'Já existe alguém com esse usuário.');
    }
    const temp = auth.generatePassword();
    await sql`INSERT INTO users (username, name, role, geiko_id, password_hash, must_change, active, token_version, created_at)
              VALUES (${data.username}, ${data.name}, ${data.role}, ${data.geikoId}, ${await auth.hashPassword(temp)}, ${true}, ${true}, ${1}, ${Date.now()})`;
    const user = await auth.findUserByUsername(data.username);
    return send(res, 201, { user: auth.publicUser(user), tempPassword: temp });
  }
  let m = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (m && method === 'PATCH') {
    requireSameOriginJson(req);
    const me = await requireAdmin(req);
    const target = await auth.findUserById(m[1]);
    if (!target) throw new HttpError(404, 'Conta não encontrada.');
    const data = cleanUserInput(await readBody(req), { partial: true });
    if (target.id === me.id && (data.role === 'player' || data.active === false)) throw new HttpError(400, 'Você não pode tirar o seu próprio acesso de admin.');
    if (data.username && data.username.toLowerCase() !== target.username.toLowerCase()
        && (await sql`SELECT id FROM users WHERE lower(username) = lower(${data.username})`).length) {
      throw new HttpError(409, 'Já existe alguém com esse usuário.');
    }
    const u = { ...target, ...data };
    // desativar ou mudar o papel derruba as sessões abertas da pessoa
    const bump = (data.active === false && target.active) || (data.role && data.role !== target.role) ? 1 : 0;
    await sql`UPDATE users SET username = ${u.username}, name = ${u.name}, role = ${u.role}, geiko_id = ${u.geikoId},
              active = ${u.active}, token_version = token_version + ${bump} WHERE id = ${target.id}`;
    return send(res, 200, { user: auth.publicUser(await auth.findUserById(target.id)) });
  }
  m = path.match(/^\/api\/admin\/users\/(\d+)\/reset-password$/);
  if (m && method === 'POST') {
    requireSameOriginJson(req);
    await requireAdmin(req);
    const target = await auth.findUserById(m[1]);
    if (!target) throw new HttpError(404, 'Conta não encontrada.');
    const temp = auth.generatePassword();
    await sql`UPDATE users SET password_hash = ${await auth.hashPassword(temp)}, must_change = ${true}, token_version = token_version + 1 WHERE id = ${target.id}`;
    return send(res, 200, { tempPassword: temp });
  }
  if (path === '/api/admin/rules' && method === 'GET') {
    await requireAdmin(req);
    let situations = {};
    try { situations = await situationNames(); } catch {}
    return send(res, 200, { rules: await getRules(), situations });
  }
  if (path === '/api/admin/rules' && method === 'PUT') {
    requireSameOriginJson(req);
    await requireAdmin(req);
    try { return send(res, 200, { rules: await saveRules(await readBody(req)) }); }
    catch (err) { throw new HttpError(400, err.message); }
  }
  if (path === '/api/admin/preview' && method === 'GET') {
    await requireAdmin(req);
    const geikoId = opts.query.get('geikoId') || '';
    if (!GEIKO_ID_RE.test(geikoId)) throw new HttpError(400, 'ID do Geiko: só números.');
    return send(res, 200, await gateFor({ geikoId }, { force: true }));
  }

  throw new HttpError(404, 'não encontrado');
}

/** Ponto de entrada. opts.version(): string que muda a cada deploy (a página usa pra se recarregar). */
async function handle(req, res, opts) {
  const url = new URL(req.url, 'http://x');
  try {
    await route(req, res, url.pathname, { ...opts, query: url.searchParams });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message, ...err.extra });
    if (err instanceof SyntaxError) return send(res, 400, { error: 'JSON inválido.' });
    console.error('[api]', err);
    send(res, err.status || 500, { error: 'Erro no servidor.' });
  }
}

module.exports = { handle };
