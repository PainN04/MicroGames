// Backup dos recordes e contas numa tabela do próprio banco (backups). Protege contra apagar/editar por engano
// (editor de recordes, reset): dá pra baixar o JSON ou restaurar as partidas de qualquer cópia.
// Cópias: uma por dia (cron da Vercel + conferência preguiçosa no POST /api/scores) e uma antes de editar recordes.
const { sql, dialect, num } = require('./store');

const KEEP = 30;
const DAY = 86_400_000;

async function lastBackupAt() {
  const rows = await sql`SELECT max(created_at) AS t FROM backups`;
  return num(rows[0]?.t) || 0;
}

async function snapshot(reason) {
  const scores = await sql`SELECT id, game, player, score, created_at, user_id FROM scores ORDER BY id`;
  // sessão ativa não entra: restaurar não deve ressuscitar login de ninguém
  const users = await sql`SELECT id, username, name, role, geiko_id, password_hash, must_change, active, token_version, created_at,
                                 block_until, block_reason, team, frame, avatar, title FROM users ORDER BY id`;
  const at = Date.now();
  const data = JSON.stringify({ v: 1, at, scores, users });
  await sql`INSERT INTO backups (created_at, reason, scores, users, data) VALUES (${at}, ${reason}, ${scores.length}, ${users.length}, ${data})`;
  const [{ id }] = await sql`SELECT id FROM backups WHERE created_at = ${at} ORDER BY id DESC LIMIT 1`;
  // guarda só as KEEP mais novas
  await sql`DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT ${KEEP})`;
  console.log(`[backup] ${reason}: ${scores.length} partidas, ${users.length} contas`);
  return { id: num(id), at, scores: scores.length, users: users.length };
}

/** Cópia só se a última for mais velha que maxAgeMs. Nunca lança (backup não pode derrubar quem chamou). */
let checkedAt = 0;
async function snapshotIfOlder(reason, maxAgeMs = DAY) {
  try {
    if (Date.now() - (await lastBackupAt()) >= maxAgeMs) return await snapshot(reason);
  } catch (err) { console.error('[backup] falhou:', err.message); }
  return null;
}
/** Para rotas quentes: confere no banco no máximo uma vez por hora por instância. */
function dailyIfDue() {
  if (Date.now() - checkedAt < 3_600_000) return;
  checkedAt = Date.now();
  return snapshotIfOlder('automático (diário)');
}

async function list() {
  const rows = await sql`SELECT id, created_at, reason, scores, users, length(data) AS size FROM backups ORDER BY created_at DESC`;
  return rows.map(r => ({ id: num(r.id), at: num(r.created_at), reason: r.reason, scores: num(r.scores), users: num(r.users), size: num(r.size) }));
}

async function get(id) {
  const rows = await sql`SELECT data FROM backups WHERE id = ${Number(id)}`;
  return rows[0] ? rows[0].data : null;
}

/** Troca TODAS as partidas pelas da cópia. Faz uma cópia do estado atual antes, então dá pra desfazer. */
async function restoreScores(id) {
  const raw = await get(id);
  if (!raw) return null;
  const { scores } = JSON.parse(raw);
  await snapshot('antes de restaurar');
  const json = JSON.stringify(scores);
  await sql`DELETE FROM scores`;
  if (dialect() === 'sqlite') {
    await sql`INSERT INTO scores (id, game, player, score, created_at, user_id)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.game'), json_extract(value, '$.player'), json_extract(value, '$.score'),
             json_extract(value, '$.created_at'), json_extract(value, '$.user_id') FROM json_each(${json})`;
  } else {
    await sql`INSERT INTO scores (id, game, player, score, created_at, user_id)
      SELECT id, game, player, score, created_at, user_id
      FROM json_to_recordset(${json}::json) AS x(id bigint, game text, player text, score double precision, created_at bigint, user_id bigint)`;
    await sql`SELECT setval(pg_get_serial_sequence('scores', 'id'), GREATEST(1, (SELECT COALESCE(max(id), 1) FROM scores)))`;
  }
  console.log(`[backup] partidas restauradas da cópia ${id}: ${scores.length}`);
  return { scores: scores.length };
}

/** Importar o backup da produção só é permitido onde NÃO é a produção: versão de teste da Vercel ou banco local (SQLite). */
const canImport = () => dialect() === 'sqlite' || process.env.VERCEL_ENV === 'preview';

const bad = msg => Object.assign(new Error(msg), { status: 400 });
const int = (v, what) => { const n = Number(v); if (!Number.isFinite(n)) throw bad(`Backup inválido: ${what}.`); return Math.trunc(n); };
const flt = (v, what) => { const n = Number(v); if (!Number.isFinite(n)) throw bad(`Backup inválido: ${what}.`); return n; };
const optInt = v => (v == null ? null : Math.trunc(Number(v)) || null);
const optStr = v => (v == null ? null : String(v));

/**
 * Troca TODAS as partidas e contas deste banco pelas de um arquivo de backup (o JSON baixado da produção).
 * Valida tudo antes de apagar e faz uma cópia do estado atual antes. Contas entram com a mesma senha da produção.
 */
async function importAll(payload) {
  if (!canImport()) throw Object.assign(new Error('Importar só funciona na versão de teste, nunca na produção.'), { status: 403 });
  if (!payload || payload.v !== 1 || !Array.isArray(payload.scores) || !Array.isArray(payload.users)) throw bad('Esse arquivo não é um backup do MicroGame.');
  if (payload.scores.length > 200_000 || payload.users.length > 5_000) throw bad('Backup grande demais.');
  const seen = new Set();
  const users = payload.users.map(u => {
    const username = String(u.username ?? '').trim();
    if (!username || !u.password_hash) throw bad('Backup inválido: conta sem usuário ou senha.');
    if (seen.has(username.toLowerCase())) throw bad(`Backup inválido: usuário repetido (${username}).`);
    seen.add(username.toLowerCase());
    return {
      id: int(u.id, 'id de conta'), username, name: String(u.name ?? username), role: u.role === 'admin' ? 'admin' : 'player',
      geiko_id: optStr(u.geiko_id), password_hash: String(u.password_hash), must_change: !!u.must_change, active: u.active !== false && u.active !== 0,
      token_version: optInt(u.token_version) || 1, created_at: int(u.created_at, 'data da conta'), block_until: optInt(u.block_until), block_reason: optStr(u.block_reason),
      team: optStr(u.team), frame: optStr(u.frame), avatar: optStr(u.avatar), title: optStr(u.title),
    };
  });
  if (!users.some(u => u.role === 'admin' && u.active)) throw bad('O backup não tem nenhum admin ativo — ninguém conseguiria entrar.');
  const scores = payload.scores.map(s => ({
    id: int(s.id, 'id de partida'), game: String(s.game ?? ''), player: String(s.player ?? ''), score: flt(s.score, 'pontuação'),
    created_at: int(s.created_at, 'data da partida'), user_id: optInt(s.user_id),
  }));
  await snapshot('antes de importar');
  await sql`DELETE FROM notifications`;
  await sql`DELETE FROM reactions`;
  await sql`DELETE FROM duels`;
  await sql`DELETE FROM scores`;
  await sql`DELETE FROM users`;
  const uj = JSON.stringify(users), sj = JSON.stringify(scores);
  if (dialect() === 'sqlite') {
    await sql`INSERT INTO users (id, username, name, role, geiko_id, password_hash, must_change, active, token_version, created_at, block_until, block_reason, team, frame, avatar, title)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.username'), json_extract(value, '$.name'), json_extract(value, '$.role'), json_extract(value, '$.geiko_id'),
             json_extract(value, '$.password_hash'), json_extract(value, '$.must_change'), json_extract(value, '$.active'), json_extract(value, '$.token_version'),
             json_extract(value, '$.created_at'), json_extract(value, '$.block_until'), json_extract(value, '$.block_reason'),
             json_extract(value, '$.team'), json_extract(value, '$.frame'),
             json_extract(value, '$.avatar'), json_extract(value, '$.title') FROM json_each(${uj})`;
    await sql`INSERT INTO scores (id, game, player, score, created_at, user_id)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.game'), json_extract(value, '$.player'), json_extract(value, '$.score'),
             json_extract(value, '$.created_at'), json_extract(value, '$.user_id') FROM json_each(${sj})`;
  } else {
    await sql`INSERT INTO users (id, username, name, role, geiko_id, password_hash, must_change, active, token_version, created_at, block_until, block_reason, team, frame, avatar, title)
      SELECT id, username, name, role, geiko_id, password_hash, must_change, active, token_version, created_at, block_until, block_reason, team, frame, avatar, title
      FROM json_to_recordset(${uj}::json) AS x(id bigint, username text, name text, role text, geiko_id text, password_hash text, must_change boolean, active boolean,
                                               token_version integer, created_at bigint, block_until bigint, block_reason text, team text, frame text, avatar text, title text)`;
    await sql`INSERT INTO scores (id, game, player, score, created_at, user_id)
      SELECT id, game, player, score, created_at, user_id
      FROM json_to_recordset(${sj}::json) AS x(id bigint, game text, player text, score double precision, created_at bigint, user_id bigint)`;
    await sql`SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST(1, (SELECT COALESCE(max(id), 1) FROM users)))`;
    await sql`SELECT setval(pg_get_serial_sequence('scores', 'id'), GREATEST(1, (SELECT COALESCE(max(id), 1) FROM scores)))`;
  }
  console.log(`[backup] importado: ${scores.length} partidas, ${users.length} contas`);
  return { scores: scores.length, users: users.length };
}

module.exports = { snapshot, snapshotIfOlder, dailyIfDue, list, get, restoreScores, canImport, importAll };
