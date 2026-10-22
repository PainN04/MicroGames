// Parte social e de competição: reações nos recordes, duelos de 24h, torneio semanal e duplas.
// Tudo sai das partidas (tabela scores); só o que não dá pra deduzir delas fica em tabelas próprias.
const { sql } = require('./store');
const { GAMES, LOW_IS_BETTER, isBetter } = require('./rules');
const { seededShuffle, DAILY_TAB } = require('../public/js/daily.js');
const { dayOf } = require('./flair');

const DAY = 86_400_000, BRT = 3 * 3_600_000;
const num = v => (v == null ? null : Number(v));

/* ---------- semanas (segunda a domingo, horário de Brasília) ---------- */
// dia 0 (1/1/1970) foi quinta; (dia + 3) / 7 vira o número da semana começando na segunda
const weekOf = t => Math.floor((dayOf(t) + 3) / 7);
const weekStart = w => (w * 7 - 3) * DAY + BRT;
const weekEnd = w => weekStart(w + 1);
const TOURNEY_FIRST_WEEK = 2964; // semana de 19/10/2026: antes disso não existia torneio
// Na versão de teste da Vercel o torneio já vale na semana atual (pra dar pra ver e testar); na produção começa em 19/10/2026.
const firstWeek = now => (process.env.VERCEL_ENV === 'preview' ? Math.min(TOURNEY_FIRST_WEEK, weekOf(now)) : TOURNEY_FIRST_WEEK);
const TOURNEY_POINTS = [10, 7, 5, 4, 3, 2]; // 1º ao 6º; do 7º em diante 1 ponto
const pointsFor = rank => TOURNEY_POINTS[rank] ?? 1;
const NO_TOURNEY = new Set(DAILY_TAB); // só vale 1 partida por dia: não serve pra disputa

const REACTION_EMOJIS = ['👏', '🔥', '😮', '💪', '🎉'];
const DUEL_HOURS = 24, MAX_OPEN_DUELS = 5;

/** Aviso pra uma pessoa (mesma tabela dos avisos de recorde tomado). */
async function notify(userId, payload) {
  if (userId == null) return;
  await sql`INSERT INTO notifications (user_id, created_at, text, seen, opened) VALUES (${userId}, ${Date.now()}, ${JSON.stringify(payload)}, ${false}, ${false})`;
}

async function usersMap() {
  const rows = await sql`SELECT id, name, active FROM users`;
  return new Map(rows.map(r => [Number(r.id), { id: Number(r.id), name: r.name, active: r.active === true || r.active === 1 }]));
}

/* ---------- melhor partida (usada em reações e duelos) ---------- */
async function bestOf(userId, game, since = 0, until = 8.64e15) {
  const rows = LOW_IS_BETTER.has(game)
    ? await sql`SELECT MIN(score) AS b FROM scores WHERE user_id = ${userId} AND game = ${game} AND created_at >= ${since} AND created_at < ${until}`
    : await sql`SELECT MAX(score) AS b FROM scores WHERE user_id = ${userId} AND game = ${game} AND created_at >= ${since} AND created_at < ${until}`;
  return num(rows[0]?.b);
}

/* ---------- torneio semanal ---------- */
async function tournamentGames(week) {
  const key = 'tgames:' + week;
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  if (rows[0]) { try { return JSON.parse(rows[0].value); } catch {} }
  // 3 jogos sorteados pela semana (igual pra todo mundo); guardados pra não mudarem quando entrar jogo novo
  const games = seededShuffle(GAMES.filter(g => !NO_TOURNEY.has(g)).sort(), week * 7919 + 17).slice(0, 3);
  await sql`INSERT INTO settings (key, value) VALUES (${key}, ${JSON.stringify(games)}) ON CONFLICT (key) DO NOTHING`;
  return games;
}

/** Classificação da semana: pontos por posição em cada um dos 3 jogos (melhor partida da pessoa na semana). */
async function tournamentStandings(week, games, users) {
  const start = weekStart(week), end = weekEnd(week);
  const total = new Map();
  // as partidas dos 3 jogos vêm juntas; a soma segue na ordem dos jogos
  const perGame = await Promise.all(games.map(game => sql`SELECT user_id, score, created_at FROM scores WHERE game = ${game} AND user_id IS NOT NULL AND created_at >= ${start} AND created_at < ${end}`));
  for (const [gi, game] of games.entries()) {
    const rows = perGame[gi];
    const best = new Map();
    for (const r of rows) {
      const id = Number(r.user_id), s = Number(r.score), t = Number(r.created_at), cur = best.get(id);
      if (!cur || isBetter(game, s, cur.score) || (s === cur.score && t < cur.at)) best.set(id, { score: s, at: t });
    }
    const ranked = [...best.entries()].sort((a, b) => (a[1].score === b[1].score ? a[1].at - b[1].at : isBetter(game, a[1].score, b[1].score) ? -1 : 1));
    ranked.forEach(([id, b], i) => {
      const u = users.get(id);
      if (!u) return;
      const row = total.get(id) || { userId: id, name: u.name, points: 0, played: 0, scores: {}, ranks: {} };
      row.points += pointsFor(i); row.played++; row.scores[game] = b.score; row.ranks[game] = i + 1;
      total.set(id, row);
    });
  }
  return [...total.values()].sort((a, b) => b.points - a.points || b.played - a.played || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Fecha as semanas que já acabaram (uma vez só): guarda o pódio e avisa os 3 primeiros.
 *  `done` (opcional): semanas já fechadas que quem chama já leu — evita uma consulta por semana. Devolve se fechou alguma. */
async function finalizeTournaments(users, now = Date.now(), done = null) {
  const cur = weekOf(now);
  let closed = false;
  for (let w = Math.max(firstWeek(now), cur - 4); w < cur; w++) {
    const key = 'tfinal:' + w;
    if (done ? done.has(w) : (await sql`SELECT 1 AS x FROM settings WHERE key = ${key}`).length) continue;
    const games = await tournamentGames(w);
    const top = (await tournamentStandings(w, games, users)).slice(0, 3).map(r => ({ userId: r.userId, name: r.name, points: r.points }));
    const value = JSON.stringify({ week: w, start: weekStart(w), end: weekEnd(w), games, top });
    // só quem conseguir inserir a linha avisa (duas páginas abrindo ao mesmo tempo não duplicam)
    const inserted = await sql`INSERT INTO settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO NOTHING RETURNING key`;
    if (!inserted.length) continue;
    closed = true;
    for (let i = 0; i < top.length; i++) await notify(top[i].userId, { kind: 'tourney', week: w, rank: i + 1, points: top[i].points, start: weekStart(w), end: weekEnd(w), games });
  }
  return closed;
}
async function finalTournaments() {
  const rows = await sql`SELECT value FROM settings WHERE key LIKE ${'tfinal:%'}`;
  return rows.map(r => { try { return JSON.parse(r.value); } catch { return null; } }).filter(Boolean).sort((a, b) => a.week - b.week);
}

/* ---------- duelos ---------- */
const duelRow = r => ({ id: Number(r.id), game: r.game, challengerId: Number(r.challenger_id), opponentId: Number(r.opponent_id),
  createdAt: Number(r.created_at), endsAt: Number(r.ends_at), status: r.status, winnerId: num(r.winner_id), aScore: num(r.a_score), bScore: num(r.b_score) });

async function createDuel(user, opponentId, game) {
  if (!GAMES.includes(game) || NO_TOURNEY.has(game)) throw Object.assign(new Error('Esse jogo não vale duelo.'), { status: 400 });
  const opp = (await sql`SELECT id, name, active FROM users WHERE id = ${Number(opponentId)}`)[0];
  if (!opp || !(opp.active === true || opp.active === 1)) throw Object.assign(new Error('Pessoa não encontrada.'), { status: 404 });
  if (Number(opp.id) === user.id) throw Object.assign(new Error('Você não pode duelar contra você mesmo.'), { status: 400 });
  const open = await sql`SELECT challenger_id, opponent_id, game FROM duels WHERE status = ${'open'} AND (challenger_id = ${user.id} OR opponent_id = ${user.id})`;
  if (open.filter(d => Number(d.challenger_id) === user.id).length >= MAX_OPEN_DUELS) throw Object.assign(new Error(`Você já tem ${MAX_OPEN_DUELS} duelos abertos. Espere algum acabar.`), { status: 409 });
  if (open.some(d => d.game === game && [Number(d.challenger_id), Number(d.opponent_id)].includes(Number(opp.id)))) throw Object.assign(new Error('Já existe um duelo aberto entre vocês nesse jogo.'), { status: 409 });
  const now = Date.now(), ends = now + DUEL_HOURS * 3_600_000;
  await sql`INSERT INTO duels (game, challenger_id, opponent_id, created_at, ends_at, status) VALUES (${game}, ${user.id}, ${Number(opp.id)}, ${now}, ${ends}, ${'open'})`;
  const [row] = await sql`SELECT id FROM duels WHERE challenger_id = ${user.id} AND created_at = ${now} ORDER BY id DESC LIMIT 1`;
  await notify(Number(opp.id), { kind: 'duel_new', duel: Number(row.id), game, by: user.name, until: ends });
  return { id: Number(row.id), endsAt: ends };
}

/** Quem tem a melhor partida DENTRO da janela do duelo (só vale jogar depois de ser desafiado, pros dois lados). */
function duelScores(d) {
  return Promise.all([bestOf(d.challengerId, d.game, d.createdAt, d.endsAt), bestOf(d.opponentId, d.game, d.createdAt, d.endsAt)]);
}

/** Fecha os duelos que já passaram do prazo (de uma pessoa, ou todos) e avisa os dois lados uma vez só.
 *  `users`: o mapa de contas, ou uma função que o busca (só é chamada se algum duelo precisar fechar). */
async function resolveDuels(users, userId = null, now = Date.now()) {
  const rows = userId == null
    ? await sql`SELECT * FROM duels WHERE status = ${'open'} AND ends_at <= ${now} LIMIT 50`
    : await sql`SELECT * FROM duels WHERE status = ${'open'} AND ends_at <= ${now} AND (challenger_id = ${userId} OR opponent_id = ${userId}) LIMIT 50`;
  if (!rows.length) return;
  if (typeof users === 'function') users = await users();
  for (const r of rows) {
    const d = duelRow(r), [a, b] = await duelScores(d);
    let winner = null;
    if (a != null && b == null) winner = d.challengerId;
    else if (b != null && a == null) winner = d.opponentId;
    else if (a != null && b != null && a !== b) winner = isBetter(d.game, a, b) ? d.challengerId : d.opponentId;
    const done = await sql`UPDATE duels SET status = ${'done'}, winner_id = ${winner}, a_score = ${a}, b_score = ${b} WHERE id = ${d.id} AND status = ${'open'} RETURNING id`;
    if (!done.length) continue;
    const ca = users.get(d.challengerId), op = users.get(d.opponentId);
    const result = who => (winner == null ? 'draw' : winner === who ? 'win' : 'lose');
    await Promise.all([
      notify(d.challengerId, { kind: 'duel_end', duel: d.id, game: d.game, vs: op?.name || '?', vsId: d.opponentId, result: result(d.challengerId), mine: a, theirs: b }),
      notify(d.opponentId, { kind: 'duel_end', duel: d.id, game: d.game, vs: ca?.name || '?', vsId: d.challengerId, result: result(d.opponentId), mine: b, theirs: a }),
    ]);
  }
}

async function cancelDuel(user, id, users) {
  const [r] = await sql`SELECT * FROM duels WHERE id = ${Number(id)}`;
  if (!r) throw Object.assign(new Error('Duelo não encontrado.'), { status: 404 });
  const d = duelRow(r);
  if (![d.challengerId, d.opponentId].includes(user.id)) throw Object.assign(new Error('Esse duelo não é seu.'), { status: 403 });
  if (d.status !== 'open') throw Object.assign(new Error('Esse duelo já acabou.'), { status: 409 });
  const done = await sql`UPDATE duels SET status = ${'canceled'} WHERE id = ${d.id} AND status = ${'open'} RETURNING id`;
  if (!done.length) return;
  const other = user.id === d.challengerId ? d.opponentId : d.challengerId;
  await notify(other, { kind: 'duel_cancel', game: d.game, by: users.get(user.id)?.name || user.name });
}

/* ---------- reações nos recordes ---------- */
async function react(user, game, targetName, emoji) {
  if (!GAMES.includes(game)) throw Object.assign(new Error('Jogo inválido.'), { status: 400 });
  const target = (await sql`SELECT id, name FROM users WHERE name = ${String(targetName || '')} AND active = ${true} ORDER BY id LIMIT 1`)[0];
  if (!target) throw Object.assign(new Error('Pessoa não encontrada.'), { status: 404 });
  if (Number(target.id) === user.id) throw Object.assign(new Error('Reaja ao recorde dos outros 🙂'), { status: 400 });
  if (emoji === null) { await sql`DELETE FROM reactions WHERE game = ${game} AND target_id = ${Number(target.id)} AND from_id = ${user.id}`; return { removed: true }; }
  if (!REACTION_EMOJIS.includes(emoji)) throw Object.assign(new Error('Reação inválida.'), { status: 400 });
  const best = await bestOf(Number(target.id), game);
  if (best == null) throw Object.assign(new Error('Essa pessoa ainda não jogou esse jogo.'), { status: 404 });
  const old = (await sql`SELECT score FROM reactions WHERE game = ${game} AND target_id = ${Number(target.id)} AND from_id = ${user.id}`)[0];
  await sql`INSERT INTO reactions (game, target_id, from_id, score, emoji, created_at) VALUES (${game}, ${Number(target.id)}, ${user.id}, ${best}, ${emoji}, ${Date.now()})
            ON CONFLICT (game, target_id, from_id) DO UPDATE SET score = excluded.score, emoji = excluded.emoji, created_at = excluded.created_at`;
  // aviso só na 1ª reação a cada recorde (trocar de emoji ou reagir de novo não enche a caixa)
  if (!old || Number(old.score) !== best) await notify(Number(target.id), { kind: 'reaction', game, by: user.name, emoji, score: best });
  return { score: best };
}

/** Reações que valem hoje: as feitas ao recorde ATUAL de cada pessoa em cada jogo. { jogo: { nome: { counts, mine } } } */
async function reactionsNow(userId, users) {
  const [hi, lo, given] = await Promise.all([
    sql`SELECT game, user_id, MAX(score) AS b FROM scores WHERE user_id IS NOT NULL GROUP BY game, user_id`,
    sql`SELECT game, user_id, MIN(score) AS b FROM scores WHERE user_id IS NOT NULL GROUP BY game, user_id`,
    sql`SELECT game, target_id, from_id, score, emoji FROM reactions`,
  ]);
  const best = new Map();
  for (const r of hi) if (!LOW_IS_BETTER.has(r.game)) best.set(`${r.game}|${r.user_id}`, Number(r.b));
  for (const r of lo) if (LOW_IS_BETTER.has(r.game)) best.set(`${r.game}|${r.user_id}`, Number(r.b));
  const out = {};
  for (const r of given) {
    if (best.get(`${r.game}|${r.target_id}`) !== Number(r.score)) continue;
    const t = users.get(Number(r.target_id));
    if (!t) continue;
    const slot = ((out[r.game] ||= {})[t.name] ||= { counts: {}, mine: null });
    slot.counts[r.emoji] = (slot.counts[r.emoji] || 0) + 1;
    if (Number(r.from_id) === userId) slot.mine = r.emoji;
  }
  return out;
}

/* ---------- duplas ---------- */
// Duas pessoas formam uma dupla com o nome que quiserem. Quem convida escolhe o nome; o convidado aceita ou recusa (48h).
// Cada pessoa só pode estar em uma dupla (ou convite aberto) por vez. A pontuação sai das partidas e é calculada na página.
const DUO_INVITE_HOURS = 48;
const fail = (status, message) => Object.assign(new Error(message), { status });
const duoRow = r => ({ id: Number(r.id), name: r.name, inviterId: Number(r.inviter_id), partnerId: Number(r.partner_id), status: r.status,
  createdAt: Number(r.created_at), expiresAt: Number(r.expires_at), formedAt: num(r.formed_at), since: num(r.since) });
const cleanDuoName = raw => {
  const n = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 24) throw fail(400, 'Nome da dupla: de 2 a 24 caracteres.');
  return n;
};
const liveDuos = async () => (await sql`SELECT * FROM duos WHERE status IN (${'pending'}, ${'active'}) ORDER BY id`).map(duoRow);
const duoOfUser = (list, userId) => list.find(d => d.inviterId === userId || d.partnerId === userId) || null;
const nameTaken = (list, name, exceptId = null) => list.some(d => d.id !== exceptId && d.name.toLowerCase() === name.toLowerCase());

/** Convites que ninguém respondeu em 48h viram "encerrados". */
async function expireDuoInvites(now = Date.now()) {
  await sql`UPDATE duos SET status = ${'ended'}, ended_at = ${now} WHERE status = ${'pending'} AND expires_at <= ${now}`;
}

async function inviteDuo(user, partnerId, rawName) {
  const name = cleanDuoName(rawName);
  const partner = (await sql`SELECT id, name, active FROM users WHERE id = ${Number(partnerId)}`)[0];
  if (!partner || !(partner.active === true || partner.active === 1)) throw fail(404, 'Pessoa não encontrada.');
  if (Number(partner.id) === user.id) throw fail(400, 'Chame outra pessoa pra formar dupla com você.');
  const live = await liveDuos();
  if (duoOfUser(live, user.id)) throw fail(409, 'Você já está em uma dupla (ou tem um convite aberto). Saia dela antes de formar outra.');
  if (duoOfUser(live, Number(partner.id))) throw fail(409, 'Essa pessoa já está em uma dupla ou com um convite aberto.');
  if (nameTaken(live, name)) throw fail(409, 'Já existe uma dupla com esse nome. Escolha outro.');
  const now = Date.now(), ends = now + DUO_INVITE_HOURS * 3_600_000;
  await sql`INSERT INTO duos (name, inviter_id, partner_id, status, created_at, expires_at) VALUES (${name}, ${user.id}, ${Number(partner.id)}, ${'pending'}, ${now}, ${ends})`;
  const [row] = await sql`SELECT id FROM duos WHERE inviter_id = ${user.id} AND created_at = ${now} ORDER BY id DESC LIMIT 1`;
  await notify(Number(partner.id), { kind: 'duo_invite', duo: Number(row.id), by: user.name, name, until: ends });
  return { id: Number(row.id) };
}

const loadDuo = async id => {
  const [r] = await sql`SELECT * FROM duos WHERE id = ${Number(id)}`;
  if (!r) throw fail(404, 'Dupla não encontrada.');
  return duoRow(r);
};
const otherOf = (d, userId) => (d.inviterId === userId ? d.partnerId : d.inviterId);

/** O convidado aceita (a dupla vale a partir de agora) ou recusa. */
async function answerDuo(user, id, accept) {
  const d = await loadDuo(id);
  if (d.partnerId !== user.id) throw fail(403, 'Esse convite não é pra você.');
  if (d.status !== 'pending') throw fail(409, 'Esse convite já foi respondido ou expirou.');
  if (d.expiresAt <= Date.now()) { await expireDuoInvites(); throw fail(409, 'Esse convite expirou.'); }
  const now = Date.now();
  const done = accept
    ? await sql`UPDATE duos SET status = ${'active'}, formed_at = ${now} WHERE id = ${d.id} AND status = ${'pending'} RETURNING id`
    : await sql`UPDATE duos SET status = ${'ended'}, ended_at = ${now} WHERE id = ${d.id} AND status = ${'pending'} RETURNING id`;
  if (!done.length) throw fail(409, 'Esse convite já foi respondido.');
  await notify(d.inviterId, { kind: accept ? 'duo_accept' : 'duo_decline', by: user.name, name: d.name });
}

/** Quem convidou desiste do convite, ou qualquer um dos dois sai da dupla. */
async function endDuo(user, id, mode) {
  const d = await loadDuo(id);
  if (![d.inviterId, d.partnerId].includes(user.id)) throw fail(403, 'Essa dupla não é sua.');
  if (mode === 'cancel' && (d.inviterId !== user.id || d.status !== 'pending')) throw fail(409, 'Só quem convidou cancela, e só enquanto o convite está aberto.');
  if (mode === 'leave' && d.status !== 'active') throw fail(409, 'Essa dupla não está ativa.');
  const done = await sql`UPDATE duos SET status = ${'ended'}, ended_at = ${Date.now()} WHERE id = ${d.id} AND status IN (${'pending'}, ${'active'}) RETURNING id`;
  if (!done.length) throw fail(409, 'Essa dupla já acabou.');
  await notify(otherOf(d, user.id), { kind: mode === 'cancel' ? 'duo_cancel' : 'duo_left', by: user.name, name: d.name });
}

async function renameDuo(user, id, rawName, { admin = false } = {}) {
  const d = await loadDuo(id);
  if (!admin && ![d.inviterId, d.partnerId].includes(user.id)) throw fail(403, 'Essa dupla não é sua.');
  if (d.status === 'ended') throw fail(409, 'Essa dupla já acabou.');
  const name = cleanDuoName(rawName);
  if (nameTaken(await liveDuos(), name, d.id)) throw fail(409, 'Já existe uma dupla com esse nome. Escolha outro.');
  await sql`UPDATE duos SET name = ${name} WHERE id = ${d.id}`;
  return { name };
}

/** Moderação do admin: lista, renomeia e desfaz duplas. */
async function adminDuos(users) {
  return (await liveDuos()).map(d => ({ id: d.id, name: d.name, status: d.status, aId: d.inviterId, bId: d.partnerId, a: users.get(d.inviterId)?.name || '?', b: users.get(d.partnerId)?.name || '?', formedAt: d.formedAt, since: d.since ?? d.formedAt, createdAt: d.createdAt }));
}
/** Início da contagem escolhido pelo admin: 'now' (agora), 'month' (dia 1º do mês, Brasília) ou 'all' (todas as partidas). */
function sinceFor(mode, now = Date.now()) {
  if (mode === 'all') return 0;
  if (mode === 'month') { const d = new Date(now - BRT); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + BRT; }
  if (mode === 'now' || mode == null || mode === '') return now;
  throw fail(400, 'Início inválido.');
}
/** Admin: muda desde quando as partidas contam pra uma dupla. */
async function adminSetDuoSince(id, mode) {
  const d = await loadDuo(id);
  if (d.status === 'ended') throw fail(409, 'Essa dupla já acabou.');
  await sql`UPDATE duos SET since = ${sinceFor(mode)} WHERE id = ${d.id}`;
}
/** O admin forma uma dupla direto (já ativa, sem convite). `since` diz desde quando as partidas dos dois contam. */
async function adminCreateDuo(aId, bId, rawName, sinceMode = 'now') {
  const name = cleanDuoName(rawName);
  if (!Number.isInteger(Number(aId)) || !Number.isInteger(Number(bId)) || Number(aId) === Number(bId)) throw fail(400, 'Escolha duas pessoas diferentes.');
  const people = [];
  for (const id of [aId, bId]) {
    const u = (await sql`SELECT id, name, active FROM users WHERE id = ${Number(id)}`)[0];
    if (!u || !(u.active === true || u.active === 1)) throw fail(404, 'Pessoa não encontrada (ou conta desativada).');
    people.push({ id: Number(u.id), name: u.name });
  }
  const live = await liveDuos();
  for (const p of people) if (duoOfUser(live, p.id)) throw fail(409, `${p.name} já está em uma dupla ou com um convite aberto.`);
  if (nameTaken(live, name)) throw fail(409, 'Já existe uma dupla com esse nome. Escolha outro.');
  const now = Date.now(), since = sinceFor(sinceMode, now);
  await sql`INSERT INTO duos (name, inviter_id, partner_id, status, created_at, expires_at, formed_at, since) VALUES (${name}, ${people[0].id}, ${people[1].id}, ${'active'}, ${now}, ${now}, ${now}, ${since})`;
  const [row] = await sql`SELECT id FROM duos WHERE inviter_id = ${people[0].id} AND created_at = ${now} ORDER BY id DESC LIMIT 1`;
  await notify(people[0].id, { kind: 'duo_admin_new', name, with: people[1].name });
  await notify(people[1].id, { kind: 'duo_admin_new', name, with: people[0].name });
  return { id: Number(row.id) };
}
async function adminEndDuo(id) {
  const d = await loadDuo(id);
  const done = await sql`UPDATE duos SET status = ${'ended'}, ended_at = ${Date.now()} WHERE id = ${d.id} AND status IN (${'pending'}, ${'active'}) RETURNING id`;
  if (!done.length) throw fail(409, 'Essa dupla já acabou.');
  for (const uid of [d.inviterId, d.partnerId]) await notify(uid, { kind: 'duo_left', by: 'o admin', name: d.name });
}

/* ---------- tudo que a página precisa (GET /api/social) ---------- */
async function socialState(user, now = Date.now()) {
  // 1) contas e semanas já fechadas; 2) o que muda estado (duelos vencidos, semana nova, convites expirados);
  // 3) todas as leituras de uma vez — cada consulta ao banco é uma ida e volta, então em paralelo a resposta sai bem antes
  const [users, finalsBefore] = await Promise.all([usersMap(), finalTournaments()]);
  const [, closedWeek] = await Promise.all([
    resolveDuels(users, null, now),
    finalizeTournaments(users, now, new Set(finalsBefore.map(f => f.week))),
    expireDuoInvites(now),
  ]);
  const week = weekOf(now);
  const [[games, standings], mineRows, winRows, live, reactions, finals] = await Promise.all([
    // classificação calculada sempre; a página só mostra quando `on`
    tournamentGames(week).then(async g => [g, await tournamentStandings(week, g, users)]),
    sql`SELECT * FROM duels WHERE challenger_id = ${user.id} OR opponent_id = ${user.id} ORDER BY id DESC LIMIT 60`,
    sql`SELECT winner_id, COUNT(*) AS n FROM duels WHERE status = ${'done'} AND winner_id IS NOT NULL GROUP BY winner_id`,
    liveDuos(),
    reactionsNow(user.id, users),
    closedWeek ? finalTournaments() : finalsBefore,
  ]);

  const duels = { open: [], recent: [] };
  const mine = mineRows.map(duelRow);
  // placar dos duelos abertos: todos juntos, na mesma ordem
  const openScores = await Promise.all(mine.map(d => (d.status === 'open' ? duelScores(d) : null)));
  mine.forEach((d, i) => {
    const iAmA = d.challengerId === user.id, other = users.get(iAmA ? d.opponentId : d.challengerId);
    const base = { id: d.id, game: d.game, vs: other?.name || '?', vsId: other?.id ?? null, byMe: iAmA, endsAt: d.endsAt, createdAt: d.createdAt };
    if (d.status === 'open') {
      const [a, b] = openScores[i];
      duels.open.push({ ...base, mine: iAmA ? a : b, theirs: iAmA ? b : a });
    } else if (d.status === 'done' && duels.recent.length < 10) {
      duels.recent.push({ ...base, mine: iAmA ? d.aScore : d.bScore, theirs: iAmA ? d.bScore : d.aScore, result: d.winnerId == null ? 'draw' : d.winnerId === user.id ? 'win' : 'lose' });
    }
  });
  const wins = {};
  for (const r of winRows) {
    const u = users.get(Number(r.winner_id)); if (u) wins[u.name] = Number(r.n);
  }
  const trophies = {};
  for (const f of finals) { const w = f.top?.[0]; const u = w && users.get(w.userId); if (u) trophies[u.name] = (trophies[u.name] || 0) + 1; }

  const busy = new Set(live.flatMap(d => [d.inviterId, d.partnerId])), myDuo = duoOfUser(live, user.id);
  const named = d => ({ id: d.id, name: d.name, aId: d.inviterId, aName: users.get(d.inviterId)?.name || '?', bId: d.partnerId, bName: users.get(d.partnerId)?.name || '?', formedAt: d.formedAt, since: d.since ?? d.formedAt, expiresAt: d.expiresAt });
  const last = finals.length ? finals[finals.length - 1] : null;
  return {
    now,
    emojis: REACTION_EMOJIS,
    people: [...users.values()].filter(u => u.active).map(u => ({ id: u.id, name: u.name, free: !busy.has(u.id) })),
    duos: live.filter(d => d.status === 'active').map(named),
    // minha situação: nenhuma, dupla ativa, convite que eu mandei ou convite que recebi
    myDuo: myDuo ? { state: myDuo.status === 'active' ? 'active' : myDuo.inviterId === user.id ? 'out' : 'in', ...named(myDuo) } : { state: 'none' },
    reactions,
    duels,
    duelWins: wins,
    trophies,
    tourney: {
      on: week >= firstWeek(now), week, start: weekStart(week), end: weekEnd(week), games,
      standings: standings.slice(0, 10), mine: standings.find(r => r.userId === user.id) || null, mineRank: standings.findIndex(r => r.userId === user.id) + 1 || null,
      players: standings.length, points: TOURNEY_POINTS,
      last: last ? { ...last, top: last.top.map(t => ({ ...t, name: users.get(t.userId)?.name || t.name })) } : null,
    },
  };
}

module.exports = {
  REACTION_EMOJIS, weekOf, weekStart, weekEnd, TOURNEY_FIRST_WEEK, pointsFor,
  notify, usersMap, react, createDuel, cancelDuel, resolveDuels, inviteDuo, answerDuo, endDuo, renameDuo, adminDuos, adminCreateDuo, adminSetDuoSince, adminEndDuo, socialState, tournamentGames, tournamentStandings, finalizeTournaments,
};
