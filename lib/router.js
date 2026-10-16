// Todas as rotas /api/*. Usado pela Vercel (api/index.js) e pelo servidor local (server.js),
// então o que se testa local é exatamente o código de produção.
const { sql } = require('./store');
const { ensureSchema } = require('./schema');
const { checkSubmission, groupByGame, GAMES, LOW_IS_BETTER, isBetter } = require('./rules');
const { logVitals } = require('./vitals');
const auth = require('./auth');
const { gateFor, getRules, saveRules, situationNames } = require('./geiko');
const backup = require('./backup');

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
async function requireRecordsOwner(req) {
  const user = await requireAdmin(req);
  if (!auth.canEditRecords(user)) throw new HttpError(403, 'Só o dono do site pode mexer nos recordes.');
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
    // nome atual da conta (renomear no painel vale pro histórico todo); partida sem conta usa o nome gravado
    return send(res, 200, groupByGame(await sql`
      SELECT s.game, COALESCE(u.name, s.player) AS name, s.score, s.created_at AS date
      FROM scores s LEFT JOIN users u ON u.id = s.user_id`));
  }
  if (path === '/api/scores' && method === 'POST') {
    const user = await requireUser(req);
    if (user.mustChange) throw new HttpError(403, 'Troque sua senha antes de jogar.');
    const gate = await gateFor(user);
    const br = n => String(n).replace('.', ',');
    if (gate.manual) throw new HttpError(423, 'Seu acesso aos jogos está bloqueado pelo admin.');
    if (gate.blocked) throw new HttpError(423, `Você está com ${br(gate.total)} pontos de fila no Geiko (limite ${br(gate.limit)}). Resolva os tickets pra liberar.`);
    const body = await readBody(req);
    const { status, error, entry } = checkSubmission({ ...body, player: user.name });
    if (error) throw new HttpError(status, error);
    await sql`INSERT INTO scores (game, player, score, created_at, user_id) VALUES (${entry.game}, ${entry.player}, ${entry.score}, ${Date.now()}, ${user.id})`;
    await backup.dailyIfDue();
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
    const user = await requireUser(req);
    // presença pro painel admin: em que tela a pessoa está (menu, admin ou o id do jogo)
    const asked = opts.query.get('view') || 'menu';
    const view = asked === 'admin' || asked === 'menu' || GAMES.includes(asked) ? asked : 'menu';
    const now = Date.now();
    await sql`UPDATE users SET last_seen = ${now},
              view_since = CASE WHEN last_view = ${view} AND view_since IS NOT NULL THEN view_since ELSE ${now} END,
              last_view = ${view} WHERE id = ${user.id}`;
    // a página usa isso pra tirar a pessoa do jogo assim que o admin bloquear
    return send(res, 200, { ok: true, block: auth.manualBlock(user) });
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
    // a conta dona (editor de recordes) só ela mesma edita, e ninguém pode virar ela trocando o usuário
    if (auth.canEditRecords(target) && target.id !== me.id) throw new HttpError(403, 'Só o dono pode editar essa conta.');
    if (data.username && data.username.toLowerCase() === (process.env.RECORDS_OWNER || 'paulo').toLowerCase() && !auth.canEditRecords(target)) {
      throw new HttpError(409, 'Esse usuário é reservado.');
    }
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
    const me = await requireAdmin(req);
    const target = await auth.findUserById(m[1]);
    if (!target) throw new HttpError(404, 'Conta não encontrada.');
    if (auth.canEditRecords(target) && target.id !== me.id) throw new HttpError(403, 'Só o dono pode mexer nessa conta.');
    const temp = auth.generatePassword();
    await sql`UPDATE users SET password_hash = ${await auth.hashPassword(temp)}, must_change = ${true}, token_version = token_version + 1 WHERE id = ${target.id}`;
    return send(res, 200, { tempPassword: temp });
  }
  // bloqueio manual: { minutes } (null/0 = até desbloquear) e { reason } opcional
  m = path.match(/^\/api\/admin\/users\/(\d+)\/(block|unblock)$/);
  if (m && method === 'POST') {
    requireSameOriginJson(req);
    const me = await requireAdmin(req);
    const target = await auth.findUserById(m[1]);
    if (!target) throw new HttpError(404, 'Conta não encontrada.');
    if (auth.canEditRecords(target) && target.id !== me.id) throw new HttpError(403, 'Só o dono pode mexer nessa conta.');
    if (m[2] === 'unblock') {
      await sql`UPDATE users SET block_until = ${null}, block_reason = ${null} WHERE id = ${target.id}`;
    } else {
      if (target.id === me.id) throw new HttpError(400, 'Você não pode bloquear a sua própria conta.');
      const { minutes, reason = '' } = await readBody(req);
      const mins = Number(minutes) || 0;
      if (mins < 0 || mins > 60 * 24 * 365) throw new HttpError(400, 'Tempo de bloqueio inválido.');
      const until = mins ? Date.now() + mins * 60_000 : 8.64e15; // sem tempo = até desbloquear
      await sql`UPDATE users SET block_until = ${until}, block_reason = ${String(reason).trim().slice(0, 120) || null} WHERE id = ${target.id}`;
    }
    return send(res, 200, { user: auth.publicUser(await auth.findUserById(target.id)) });
  }
  /* --- editor de recordes (só a conta dona: RECORDS_OWNER, padrão "paulo") --- */
  // recorde de cada pessoa em cada jogo = a melhor partida dela; conta as partidas também
  if (path === '/api/admin/records' && method === 'GET') {
    await requireRecordsOwner(req);
    const rows = await sql`SELECT s.game, s.user_id, COALESCE(u.name, s.player) AS name, s.score, s.created_at
                           FROM scores s LEFT JOIN users u ON u.id = s.user_id`;
    const map = new Map();
    for (const r of rows) {
      const key = `${r.game}|${r.user_id ?? 'n:' + r.name}`, score = Number(r.score);
      const cur = map.get(key);
      if (!cur) map.set(key, { game: r.game, userId: r.user_id == null ? null : Number(r.user_id), name: r.name, best: score, count: 1, lastAt: Number(r.created_at) });
      else { cur.count++; if (isBetter(r.game, score, cur.best)) cur.best = score; cur.lastAt = Math.max(cur.lastAt, Number(r.created_at)); }
    }
    return send(res, 200, { records: [...map.values()] });
  }
  // define o recorde de uma conta num jogo: apaga as partidas MELHORES que o valor e garante uma com o valor exato
  // (as partidas piores continuam, então o histórico não some)
  if (path === '/api/admin/records' && method === 'PUT') {
    requireSameOriginJson(req);
    const me = await requireRecordsOwner(req);
    await backup.snapshotIfOlder('antes de editar recordes', 3_600_000);
    const { game, userId, value } = await readBody(req);
    const v = Number(value);
    if (!GAMES.includes(game)) throw new HttpError(400, 'Jogo inválido.');
    if (!Number.isFinite(v) || v < 0 || v > 1e9) throw new HttpError(400, 'Valor inválido.');
    const target = await auth.findUserById(userId);
    if (!target) throw new HttpError(404, 'Conta não encontrada.');
    const removed = LOW_IS_BETTER.has(game)
      ? await sql`DELETE FROM scores WHERE game = ${game} AND user_id = ${target.id} AND score < ${v} RETURNING id`
      : await sql`DELETE FROM scores WHERE game = ${game} AND user_id = ${target.id} AND score > ${v} RETURNING id`;
    const exact = await sql`SELECT id FROM scores WHERE game = ${game} AND user_id = ${target.id} AND score = ${v}`;
    if (!exact.length) await sql`INSERT INTO scores (game, player, score, created_at, user_id) VALUES (${game}, ${target.name}, ${v}, ${Date.now()}, ${target.id})`;
    console.log(`[admin] ${me.username} definiu recorde de ${target.username} em ${game} = ${v} (${removed.length} partida(s) melhor(es) removida(s))`);
    return send(res, 200, { ok: true, removed: removed.length });
  }
  // apaga todas as partidas de uma conta (ou de um nome antigo sem conta) num jogo
  if (path === '/api/admin/records/delete' && method === 'POST') {
    requireSameOriginJson(req);
    const me = await requireRecordsOwner(req);
    await backup.snapshotIfOlder('antes de editar recordes', 3_600_000);
    const { game, userId, name } = await readBody(req);
    if (!GAMES.includes(game)) throw new HttpError(400, 'Jogo inválido.');
    const removed = userId != null
      ? await sql`DELETE FROM scores WHERE game = ${game} AND user_id = ${Number(userId)} RETURNING id`
      : await sql`DELETE FROM scores WHERE game = ${game} AND user_id IS NULL AND player = ${String(name || '')} RETURNING id`;
    console.log(`[admin] ${me.username} apagou recorde de ${userId ?? name} em ${game} (${removed.length} partida(s))`);
    return send(res, 200, { ok: true, removed: removed.length });
  }

  /* --- erros do navegador --- */
  // só de quem está logado (evita lixo de fora); guarda os 300 mais novos
  if (path === '/api/errors' && method === 'POST') {
    requireSameOriginJson(req);
    const user = await auth.currentUser(req);
    if (!user) return send(res, 204);
    const b = await readBody(req);
    const cut = (v, n) => (v == null ? null : String(v).slice(0, n));
    const view = GAMES.includes(b.view) || b.view === 'menu' || b.view === 'admin' ? b.view : null;
    if (!b.message) throw new HttpError(400, 'sem mensagem');
    await sql`INSERT INTO client_errors (created_at, user_id, view, message, source, agent)
              VALUES (${Date.now()}, ${user.id}, ${view}, ${cut(b.message, 500)}, ${cut(b.source, 1000)}, ${cut(req.headers['user-agent'], 200)})`;
    await sql`DELETE FROM client_errors WHERE id NOT IN (SELECT id FROM client_errors ORDER BY id DESC LIMIT ${300})`;
    return send(res, 204);
  }
  // erros agrupados pela mensagem: quantas vezes, quando foi o último, quem e em que tela
  if (path === '/api/admin/errors' && method === 'GET') {
    await requireAdmin(req);
    const rows = await sql`SELECT e.created_at, e.view, e.message, e.source, e.agent, u.name
                           FROM client_errors e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC`;
    const groups = new Map();
    for (const r of rows) {
      const g = groups.get(r.message) || { message: r.message, source: r.source, agent: r.agent, count: 0, last: Number(r.created_at), people: new Set(), views: new Set() };
      g.count++;
      if (r.name) g.people.add(r.name);
      if (r.view) g.views.add(r.view);
      groups.set(r.message, g);
    }
    return send(res, 200, { errors: [...groups.values()].map(g => ({ ...g, people: [...g.people], views: [...g.views] })) });
  }
  if (path === '/api/admin/errors/clear' && method === 'POST') {
    requireSameOriginJson(req);
    await requireAdmin(req);
    await sql`DELETE FROM client_errors`;
    return send(res, 200, { ok: true });
  }

  /* --- backups (só a conta dona) --- */
  // cron diário da Vercel (vercel.json): ela manda "Authorization: Bearer $CRON_SECRET"
  if (path === '/api/cron/backup' && method === 'GET') {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'não autorizado');
    return send(res, 200, (await backup.snapshotIfOlder('automático (diário)', 20 * 3_600_000)) || { skipped: true });
  }
  if (path === '/api/admin/backups' && method === 'GET') {
    await requireRecordsOwner(req);
    return send(res, 200, { backups: await backup.list() });
  }
  if (path === '/api/admin/backups' && method === 'POST') {
    requireSameOriginJson(req);
    const me = await requireRecordsOwner(req);
    return send(res, 201, await backup.snapshot(`manual (${me.username})`));
  }
  if (path === '/api/admin/backups/download' && method === 'GET') {
    await requireRecordsOwner(req);
    const id = Number(opts.query.get('id'));
    const data = await backup.get(id);
    if (!data) throw new HttpError(404, 'Cópia não encontrada.');
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="microgame-backup-${id}.json"`);
    return res.end(data);
  }
  if (path === '/api/admin/backups/restore' && method === 'POST') {
    requireSameOriginJson(req);
    const me = await requireRecordsOwner(req);
    const { id } = await readBody(req);
    const done = await backup.restoreScores(id);
    if (!done) throw new HttpError(404, 'Cópia não encontrada.');
    console.log(`[admin] ${me.username} restaurou as partidas da cópia ${id}`);
    return send(res, 200, done);
  }

  /* --- relatório (admin): partidas por pessoa × jogo, por dia, por hora --- */
  // ?days=1|7|30|0 (0 = tudo) & tz = minutos a somar no horário UTC pra chegar no horário local de quem pede
  if (path === '/api/admin/report' && method === 'GET') {
    await requireAdmin(req);
    const days = Math.max(0, Math.min(365, Number(opts.query.get('days')) || 0));
    const tz = Math.max(-840, Math.min(840, Number(opts.query.get('tz')) || 0)) * 60_000;
    const now = Date.now(), dayMs = 86_400_000;
    const localDay = ms => new Date(ms + tz).toISOString().slice(0, 10);
    // "hoje" = desde a meia-noite local; N dias = hoje + os N-1 dias anteriores
    const todayStart = Math.floor((now + tz) / dayMs) * dayMs - tz;
    const since = days ? todayStart - (days - 1) * dayMs : 0;
    const prevSince = days ? since - days * dayMs : 0;
    const rows = await sql`SELECT s.game, s.user_id, COALESCE(u.name, s.player) AS name, s.created_at
                           FROM scores s LEFT JOIN users u ON u.id = s.user_id WHERE s.created_at >= ${prevSince}`;
    const cur = rows.filter(r => Number(r.created_at) >= since);
    const prevTotal = days ? rows.length - cur.length : null;
    const people = new Map(), byDay = new Map(), byHour = Array(24).fill(0), byGame = {};
    for (const r of cur) {
      const t = Number(r.created_at), key = r.user_id ?? 'n:' + r.name;
      const p = people.get(key) || { name: r.name, games: {}, total: 0, last: 0, lastGame: null };
      p.games[r.game] = (p.games[r.game] || 0) + 1; p.total++;
      if (t > p.last) { p.last = t; p.lastGame = r.game; }
      people.set(key, p);
      byDay.set(localDay(t), (byDay.get(localDay(t)) || 0) + 1);
      byHour[new Date(t + tz).getUTCHours()]++;
      byGame[r.game] = (byGame[r.game] || 0) + 1;
    }
    // dias sem partida também aparecem (zerados) — senão o gráfico "pula" dias
    const first = days ? since : Math.min(...cur.map(r => Number(r.created_at)), now);
    const span = Math.min(90, Math.floor((todayStart - (Math.floor((first + tz) / dayMs) * dayMs - tz)) / dayMs) + 1);
    const daySeries = Array.from({ length: Math.max(1, span) }, (_, i) => {
      const d = localDay(todayStart - (span - 1 - i) * dayMs);
      return { day: d, count: byDay.get(d) || 0 };
    });
    return send(res, 200, {
      days, total: cur.length, prevTotal,
      people: [...people.values()].sort((a, b) => b.total - a.total),
      byGame, byHour, byDay: daySeries,
    });
  }

  // quem está com o site aberto agora (conferência nos últimos 60s) e quem passou nas últimas 24h
  if (path === '/api/admin/online' && method === 'GET') {
    await requireAdmin(req);
    const now = Date.now();
    const rows = await sql`SELECT * FROM users WHERE active = ${true} AND last_seen IS NOT NULL AND last_seen > ${now - 86_400_000} ORDER BY last_seen DESC`;
    const people = rows.map(r => {
      const u = auth.mapUser(r);
      return { ...auth.publicUser(u), lastSeen: Number(r.last_seen), view: r.last_view || 'menu', since: Number(r.view_since) || Number(r.last_seen), online: now - Number(r.last_seen) < 60_000 };
    });
    return send(res, 200, { now, online: people.filter(p => p.online), recent: people.filter(p => !p.online) });
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
