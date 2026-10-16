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
                                 block_until, block_reason FROM users ORDER BY id`;
  const at = Date.now();
  const data = JSON.stringify({ v: 1, at, scores, users });
  await sql`INSERT INTO backups (created_at, reason, scores, users, data) VALUES (${at}, ${reason}, ${scores.length}, ${users.length}, ${data})`;
  // guarda só as KEEP mais novas
  await sql`DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT ${KEEP})`;
  console.log(`[backup] ${reason}: ${scores.length} partidas, ${users.length} contas`);
  return { at, scores: scores.length, users: users.length };
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

module.exports = { snapshot, snapshotIfOlder, dailyIfDue, list, get, restoreScores };
