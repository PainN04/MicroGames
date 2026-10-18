// Todas as rotas /api/*. Usado pela Vercel (api/index.js) e pelo servidor local (server.js),
// então o que se testa local é exatamente o código de produção.
const { sql } = require('./store');
const { ensureSchema } = require('./schema');
const { checkSubmission, groupByGame, GAMES, LOW_IS_BETTER, isBetter } = require('./rules');
const { logVitals } = require('./vitals');
const auth = require('./auth');
const { gateFor, getRules, saveRules, situationNames, weeklyClosed, weekStartBRT } = require('./geiko');
const backup = require('./backup');
const flair = require('./flair');
const social = require('./social');

/* ---------- utilidades ---------- */

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 1e5) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > limit) throw Object.assign(new Error('corpo grande demais'), { status: 413 });
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

/* ---------- avisos de recorde tomado ---------- */

// Início do mês no horário de Brasília (UTC-3, sem horário de verão) — mesma temporada que a página mostra.
const BRT = 3 * 3_600_000;
function monthStartBRT(now = Date.now()) {
  const d = new Date(now - BRT);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + BRT;
}
/** Melhor partida de um jogo desde `since` (empate: quem fez primeiro). */
async function leaderOf(game, since = 0) {
  const rows = LOW_IS_BETTER.has(game)
    ? await sql`SELECT user_id, score FROM scores WHERE game = ${game} AND created_at >= ${since} ORDER BY score ASC, created_at ASC LIMIT 1`
    : await sql`SELECT user_id, score FROM scores WHERE game = ${game} AND created_at >= ${since} ORDER BY score DESC, created_at ASC LIMIT 1`;
  return rows[0] ? { userId: rows[0].user_id == null ? null : Number(rows[0].user_id), score: Number(rows[0].score) } : null;
}
/** Chamado antes de gravar a partida: se ela tira o 1º lugar (geral ou do mês) de outra pessoa, avisa essa pessoa. */
async function notifyDethroned(user, game, score) {
  try {
    const [all, month] = await Promise.all([leaderOf(game), leaderOf(game, monthStartBRT())]);
    const note = async (leader, kind) => {
      if (!leader || leader.userId == null || leader.userId === user.id || !isBetter(game, score, leader.score)) return false;
      const text = JSON.stringify({ kind, game, by: user.name, score, old: leader.score });
      await sql`INSERT INTO notifications (user_id, created_at, text, seen, opened) VALUES (${leader.userId}, ${Date.now()}, ${text}, ${false}, ${false})`;
      return true;
    };
    // tomou o geral: um aviso só (não repete o do mês)
    if (!(await note(all, 'geral'))) await note(month, 'mes');
  } catch (err) { console.error('[avisos]', err.message); }
}

/** Quantos avisos a pessoa ainda não abriu (número do balão no botão da conta). */
async function unreadOf(userId) {
  const [row] = await sql`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ${userId} AND opened = ${false}`;
  return Number(row.n);
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

  // Só nas versões de teste da Vercel (branch dev) e só com o banco de teste ainda sem nenhuma conta:
  // cria o admin dono e mostra a senha temporária uma vez. Com qualquer conta existente, ou na produção, não existe.
  if (path === '/api/homolog/bootstrap' && method === 'GET') {
    if (process.env.VERCEL_ENV !== 'preview') throw new HttpError(404, 'Não encontrado.');
    const [{ n }] = await sql`SELECT COUNT(*) AS n FROM users`;
    if (Number(n) > 0) throw new HttpError(404, 'Não encontrado.');
    const username = (process.env.RECORDS_OWNER || 'paulo').toLowerCase();
    const temp = auth.generatePassword(12);
    await sql`INSERT INTO users (username, name, role, geiko_id, password_hash, must_change, active, token_version, created_at)
              VALUES (${username}, ${username}, ${'admin'}, ${null}, ${await auth.hashPassword(temp)}, ${true}, ${true}, ${1}, ${Date.now()})`;
    return send(res, 200, { usuario: username, senhaTemporaria: temp, aviso: 'Guarde agora: esta senha só aparece uma vez. No primeiro login o site pede pra trocar.' });
  }

  /* --- prêmios do desafio do dia: jogo de amanhã (escolha do vencedor) e molduras de avatar --- */
  if (path === '/api/flair' && method === 'GET') {
    const [all, frames] = await Promise.all([flair.getPicks(), flair.getFrames()]);
    const t = flair.today(), picks = {};
    for (const [d, p] of Object.entries(all)) if (Number(d) >= t - 120) picks[d] = p;
    return send(res, 200, { picks, frames });
  }
  if (path === '/api/daily/pick' && method === 'POST') {
    requireSameOriginJson(req);
    const user = await requireUser(req);
    const { game } = await readBody(req);
    if (!GAMES.includes(game)) throw new HttpError(400, 'Jogo inválido.');
    const t = flair.today(), picks = await flair.getPicks();
    const yesterday = (await flair.winners(picks)).find(w => w.day === t - 1);
    if (!yesterday || yesterday.name !== user.name) throw new HttpError(403, 'Só quem ganhou o desafio de ontem escolhe o jogo de amanhã.');
    const pick = { game, by: user.name, at: Date.now() };
    await flair.setPick(t + 1, pick);
    return send(res, 200, { day: t + 1, pick });
  }
  if (path === '/api/profile/frame' && method === 'POST') {
    requireSameOriginJson(req);
    const user = await requireUser(req);
    const { frame = null } = await readBody(req);
    if (frame !== null && !(frame in flair.FRAMES)) throw new HttpError(400, 'Moldura inválida.');
    if (frame) {
      const wins = (await flair.winners()).filter(w => w.name === user.name).length;
      if (wins < flair.FRAMES[frame]) throw new HttpError(403, `Essa moldura libera com ${flair.FRAMES[frame]} desafio(s) do dia ganho(s) — você tem ${wins}.`);
    }
    await sql`UPDATE users SET frame = ${frame} WHERE id = ${user.id}`;
    return send(res, 200, { frame });
  }

  /* --- social e competição: reações, duelos, torneio semanal, equipes --- */
  if (path === '/api/social' && method === 'GET') {
    const user = await requireUser(req);
    return send(res, 200, await social.socialState(user));
  }
  if (path === '/api/reactions' && method === 'POST') {
    requireSameOriginJson(req);
    const user = await requireUser(req);
    if (user.mustChange) throw new HttpError(403, 'Troque sua senha antes.');
    const { game, target, emoji = null } = await readBody(req);
    try { return send(res, 200, await social.react(user, game, target, emoji)); }
    catch (err) { if (err.status) throw new HttpError(err.status, err.message); throw err; }
  }
  if (path === '/api/duels' && method === 'POST') {
    requireSameOriginJson(req);
    const user = await requireUser(req);
    if (user.mustChange) throw new HttpError(403, 'Troque sua senha antes.');
    const { opponentId, game } = await readBody(req);
    try { return send(res, 201, await social.createDuel(user, opponentId, game)); }
    catch (err) { if (err.status) throw new HttpError(err.status, err.message); throw err; }
  }
  const dm = path.match(/^\/api\/duels\/(\d+)\/cancel$/);
  if (dm && method === 'POST') {
    requireSameOriginJson(req);
    const user = await requireUser(req);
    try { await social.cancelDuel(user, dm[1], await social.usersMap()); return send(res, 200, { ok: true }); }
    catch (err) { if (err.status) throw new HttpError(err.status, err.message); throw err; }
  }

  /* --- duplas --- */
  if (path === '/api/duos' && method === 'POST') {
    requireSameOriginJson(req);
    const user = await requireUser(req);
    if (user.mustChange) throw new HttpError(403, 'Troque sua senha antes.');
    const { partnerId, name } = await readBody(req);
    try { return send(res, 201, await social.inviteDuo(user, partnerId, name)); }
    catch (err) { if (err.status) throw new HttpError(err.status, err.message); throw err; }
  }
  const dp = path.match(/^\/api\/duos\/(\d+)\/(accept|decline|cancel|leave|rename)$/);
  if (dp && method === 'POST') {
    requireSameOriginJson(req);
    const user = await requireUser(req);
    try {
      if (dp[2] === 'accept' || dp[2] === 'decline') await social.answerDuo(user, dp[1], dp[2] === 'accept');
      else if (dp[2] === 'rename') return send(res, 200, await social.renameDuo(user, dp[1], (await readBody(req)).name));
      else await social.endDuo(user, dp[1], dp[2]);
      return send(res, 200, { ok: true });
    } catch (err) { if (err.status) throw new HttpError(err.status, err.message); throw err; }
  }
  // moderação: o admin vê, renomeia e desfaz duplas
  if (path === '/api/admin/duos' && method === 'GET') {
    await requireAdmin(req);
    return send(res, 200, { duos: await social.adminDuos(await social.usersMap()) });
  }
  if (path === '/api/admin/duos' && method === 'POST') {
    requireSameOriginJson(req);
    await requireAdmin(req);
    const { aId, bId, name, since } = await readBody(req);
    try { return send(res, 201, await social.adminCreateDuo(aId, bId, name, since)); }
    catch (err) { if (err.status) throw new HttpError(err.status, err.message); throw err; }
  }
  const ad = path.match(/^\/api\/admin\/duos\/(\d+)\/(rename|end|since)$/);
  if (ad && method === 'POST') {
    requireSameOriginJson(req);
    await requireAdmin(req);
    try {
      if (ad[2] === 'rename') return send(res, 200, await social.renameDuo(null, ad[1], (await readBody(req)).name, { admin: true }));
      if (ad[2] === 'since') { await social.adminSetDuoSince(ad[1], (await readBody(req)).since); return send(res, 200, { ok: true }); }
      await social.adminEndDuo(ad[1]);
      return send(res, 200, { ok: true });
    } catch (err) { if (err.status) throw new HttpError(err.status, err.message); throw err; }
  }

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
    // Termo: a palavra é a mesma o dia todo, então só a primeira partida de cada dia vale
    if (entry.game === 'termo') {
      const last = await sql`SELECT created_at FROM scores WHERE user_id = ${user.id} AND game = ${'termo'} ORDER BY id DESC LIMIT 1`;
      if (last[0] && flair.dayOf(last[0].created_at) === flair.today()) throw new HttpError(409, 'Você já jogou o Termo de hoje. Volte amanhã!');
    }
    await notifyDethroned(user, entry.game, entry.score);
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
    const [gate, unread] = await Promise.all([user.mustChange ? null : gateFor(user), unreadOf(user.id)]);
    return send(res, 200, { user: auth.publicUser(user), gate, unread });
  }
  // conferência leve que a página faz a cada ~20s pra saber se a conta entrou em outro aparelho
  if (path === '/api/auth/ping' && method === 'GET') {
    const user = await requireUser(req);
    // presença pro painel admin: em que tela a pessoa está (menu, admin ou o id do jogo)
    const asked = opts.query.get('view') || 'menu';
    const view = asked === 'admin' || asked === 'menu' || GAMES.includes(asked) ? asked : 'menu';
    const now = Date.now();
    // presença e duelos vencidos ao mesmo tempo; a lista de contas só é buscada se algum duelo fechar
    await Promise.all([
      sql`UPDATE users SET last_seen = ${now},
          view_since = CASE WHEN last_view = ${view} AND view_since IS NOT NULL THEN view_since ELSE ${now} END,
          last_view = ${view} WHERE id = ${user.id}`,
      social.resolveDuels(social.usersMap, user.id, now).catch(err => console.error('[duelos]', err.message)),
    ]);
    // avisos novos ("Fulano tomou seu recorde"): entrega e marca como vistos (depois dos duelos, que podem gerar aviso)
    const [notes, unread] = await Promise.all([
      sql`SELECT id, created_at, text FROM notifications WHERE user_id = ${user.id} AND seen = ${false} ORDER BY id LIMIT 5`,
      unreadOf(user.id),
    ]);
    if (notes.length) await sql`UPDATE notifications SET seen = ${true} WHERE user_id = ${user.id} AND id <= ${Number(notes[notes.length - 1].id)}`;
    // a página usa isso pra tirar a pessoa do jogo assim que o admin bloquear
    return send(res, 200, {
      ok: true, block: auth.manualBlock(user), unread,
      notes: notes.map(n => ({ at: Number(n.created_at), ...JSON.parse(n.text) })),
    });
  }
  // lista de avisos (os 30 mais novos) e "marcar tudo como lido"
  if (path === '/api/notifications' && method === 'GET') {
    const user = await requireUser(req);
    const rows = await sql`SELECT created_at, text, opened FROM notifications WHERE user_id = ${user.id} ORDER BY id DESC LIMIT 30`;
    return send(res, 200, { notes: rows.map(n => ({ at: Number(n.created_at), unread: !n.opened, ...JSON.parse(n.text) })) });
  }
  if (path === '/api/notifications/read' && method === 'POST') {
    requireSameOriginJson(req);
    const user = await requireUser(req);
    await sql`UPDATE notifications SET opened = ${true}, seen = ${true} WHERE user_id = ${user.id} AND opened = ${false}`;
    return send(res, 200, { unread: 0 });
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

  // destaque da semana: quem mais resolveu tickets no Geiko desde segunda. Os números de cada um só vão
  // pra admin (ou pra todos, se o admin ligar "mostrar ranking de tickets" na regra).
  if (path === '/api/geiko/week' && method === 'GET') {
    const user = await requireUser(req);
    if (!process.env.GEIKO_API_KEY) return send(res, 200, { since: weekStartBRT(), champion: null });
    const [week, rules] = await Promise.all([weeklyClosed(), getRules()]);
    const top = week.people[0];
    const mine = week.people.find(p => p.userId === user.id);
    return send(res, 200, {
      since: week.since, at: week.at,
      champion: top && top.count > 0 ? { name: top.name, count: top.count } : null,
      me: mine ? mine.count : null,
      people: user.role === 'admin' || rules.weeklyPublic ? week.people.map(({ name, count }) => ({ name, count })) : undefined,
    });
  }
  // relatório: jogo × trabalho na semana, por pessoa com Geiko vinculado
  if (path === '/api/admin/workplay' && method === 'GET') {
    await requireAdmin(req);
    if (!process.env.GEIKO_API_KEY) return send(res, 200, { since: weekStartBRT(), people: [], error: 'Geiko não configurado.' });
    const week = await weeklyClosed({ force: opts.query.get('force') === '1' });
    const plays = await sql`SELECT user_id, count(*) AS n FROM scores WHERE created_at >= ${week.since} GROUP BY user_id`;
    const playsBy = new Map(plays.map(r => [Number(r.user_id), Number(r.n)]));
    const people = await Promise.all(week.people.map(async p => {
      const u = await auth.findUserById(p.userId);
      const g = u ? await gateFor(u) : null;
      return { name: p.name, closed: p.count, plays: playsBy.get(p.userId) || 0, queue: g && !g.error ? g.total : null, blocked: !!g?.blocked };
    }));
    return send(res, 200, { since: week.since, at: week.at, error: week.error, people });
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
    return send(res, 200, { backups: await backup.list(), canImport: backup.canImport() });
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
  // importar o backup da produção (arquivo JSON) no ambiente de teste: troca partidas e contas; recusado na produção
  if (path === '/api/admin/backups/import' && method === 'POST') {
    requireSameOriginJson(req);
    const me = await requireRecordsOwner(req);
    if (!backup.canImport()) throw new HttpError(403, 'Importar só funciona na versão de teste, nunca na produção.');
    let done;
    try { done = await backup.importAll(await readBody(req, 8e6)); }
    catch (err) { if (err.status) throw new HttpError(err.status, err.message); throw err; }
    console.log(`[admin] ${me.username} importou um backup: ${done.scores} partidas, ${done.users} contas`);
    return send(res, 200, done);
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
