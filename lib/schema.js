// Cria/atualiza as tabelas. Idempotente: roda uma vez por instância (Vercel) ou ao subir o server.js.
const { createHash } = require('node:crypto');
const { sql, dialect } = require('./store');

let ready = null;

async function postgres() {
  await sql`CREATE TABLE IF NOT EXISTS scores (
    id         BIGSERIAL PRIMARY KEY,
    game       TEXT             NOT NULL,
    player     TEXT             NOT NULL,
    score      DOUBLE PRECISION NOT NULL,
    created_at BIGINT           NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_scores_game ON scores (game)`;
  await sql`ALTER TABLE scores ADD COLUMN IF NOT EXISTS user_id BIGINT`;
  await sql`CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
    geiko_id      TEXT,
    password_hash TEXT    NOT NULL,
    must_change   BOOLEAN NOT NULL DEFAULT true,
    active        BOOLEAN NOT NULL DEFAULT true,
    token_version INTEGER NOT NULL DEFAULT 1,
    created_at    BIGINT  NOT NULL
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username))`;
  // sessão ativa: só o aparelho com este id é aceito (login novo derruba o anterior)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_id TEXT`;
  // bloqueio manual pelo admin: até quando (ms) e motivo
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS block_until BIGINT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS block_reason TEXT`;
  // moldura de avatar escolhida (prêmio dos desafios do dia ganhos)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS frame TEXT`;
  // avatar pré-pronto ("id:cor") e título (id de uma conquista) que a pessoa escolheu
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT`;
  // vitrine do perfil (JSON: até 3 conquistas e o jogo do coração) e frase curta
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS showcase TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`;
  // equipe/setor (o admin define): vira o ranking por equipe
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS team TEXT`;
  // presença: última conferência da página, tela atual e desde quando está nela
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen BIGINT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_view TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS view_since BIGINT`;
  await sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  // avisos pra uma pessoa ("Fulano tomou seu recorde"): entregues no /api/auth/ping
  await sql`CREATE TABLE IF NOT EXISTS notifications (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT  NOT NULL,
    created_at BIGINT  NOT NULL,
    text       TEXT    NOT NULL,
    seen       BOOLEAN NOT NULL DEFAULT false
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, seen)`;
  // opened = a pessoa abriu a lista de avisos (seen = já saiu como balão). Os que já existiam ficam como lidos.
  await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS opened BOOLEAN NOT NULL DEFAULT true`;
  await sql`ALTER TABLE notifications ALTER COLUMN opened SET DEFAULT false`;
  // erros de JavaScript que acontecem no navegador do pessoal (POST /api/errors)
  await sql`CREATE TABLE IF NOT EXISTS client_errors (
    id         BIGSERIAL PRIMARY KEY,
    created_at BIGINT NOT NULL,
    user_id    BIGINT,
    view       TEXT,
    message    TEXT   NOT NULL,
    source     TEXT,
    agent      TEXT
  )`;
  // reações (👏🔥😮…) ao recorde de alguém: uma por pessoa, por alvo e jogo; `score` é o recorde a que ela reagiu
  await sql`CREATE TABLE IF NOT EXISTS reactions (
    id         BIGSERIAL PRIMARY KEY,
    game       TEXT             NOT NULL,
    target_id  BIGINT           NOT NULL,
    from_id    BIGINT           NOT NULL,
    score      DOUBLE PRECISION NOT NULL,
    emoji      TEXT             NOT NULL,
    created_at BIGINT           NOT NULL
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS reactions_unique ON reactions (game, target_id, from_id)`;
  // duelos de 24h: vale a melhor partida de cada um no jogo dentro da janela
  await sql`CREATE TABLE IF NOT EXISTS duels (
    id            BIGSERIAL PRIMARY KEY,
    game          TEXT   NOT NULL,
    challenger_id BIGINT NOT NULL,
    opponent_id   BIGINT NOT NULL,
    created_at    BIGINT NOT NULL,
    ends_at       BIGINT NOT NULL,
    status        TEXT   NOT NULL DEFAULT 'open',
    winner_id     BIGINT,
    a_score       DOUBLE PRECISION,
    b_score       DOUBLE PRECISION
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_duels_status ON duels (status, ends_at)`;
  // duplas (convite → ativa → encerrada); a pontuação sai das partidas
  await sql`CREATE TABLE IF NOT EXISTS duos (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT   NOT NULL,
    inviter_id  BIGINT NOT NULL,
    partner_id  BIGINT NOT NULL,
    status      TEXT   NOT NULL DEFAULT 'pending',
    created_at  BIGINT NOT NULL,
    expires_at  BIGINT NOT NULL,
    formed_at   BIGINT,
    ended_at    BIGINT
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_duos_status ON duos (status)`;
  // desde quando as partidas contam pra dupla (vazio = desde que foi formada; o admin pode voltar no tempo)
  await sql`ALTER TABLE duos ADD COLUMN IF NOT EXISTS since BIGINT`;
  // freio de força bruta do login (lib/auth.js): falhas seguidas por username, compartilhado entre instâncias
  await sql`CREATE TABLE IF NOT EXISTS login_fails (
    key      TEXT PRIMARY KEY,
    n        INTEGER NOT NULL,
    until_at BIGINT  NOT NULL,
    last_at  BIGINT  NOT NULL
  )`;
  // cópias dos recordes e contas (lib/backup.js)
  await sql`CREATE TABLE IF NOT EXISTS backups (
    id         BIGSERIAL PRIMARY KEY,
    created_at BIGINT  NOT NULL,
    reason     TEXT    NOT NULL,
    scores     INTEGER NOT NULL,
    users      INTEGER NOT NULL,
    data       TEXT    NOT NULL
  )`;
}

async function sqlite() {
  await sql`CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    game       TEXT    NOT NULL,
    player     TEXT    NOT NULL,
    score      REAL    NOT NULL,
    created_at INTEGER NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_scores_game ON scores (game)`;
  const cols = await sql`SELECT name FROM pragma_table_info('scores')`;
  if (!cols.some(c => c.name === 'user_id')) await sql`ALTER TABLE scores ADD COLUMN user_id INTEGER`;
  await sql`CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
    geiko_id      TEXT,
    password_hash TEXT    NOT NULL,
    must_change   INTEGER NOT NULL DEFAULT 1,
    active        INTEGER NOT NULL DEFAULT 1,
    token_version INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username))`;
  const userCols = await sql`SELECT name FROM pragma_table_info('users')`;
  if (!userCols.some(c => c.name === 'session_id')) await sql`ALTER TABLE users ADD COLUMN session_id TEXT`;
  if (!userCols.some(c => c.name === 'block_until')) await sql`ALTER TABLE users ADD COLUMN block_until INTEGER`;
  if (!userCols.some(c => c.name === 'block_reason')) await sql`ALTER TABLE users ADD COLUMN block_reason TEXT`;
  if (!userCols.some(c => c.name === 'frame')) await sql`ALTER TABLE users ADD COLUMN frame TEXT`;
  if (!userCols.some(c => c.name === 'avatar')) await sql`ALTER TABLE users ADD COLUMN avatar TEXT`;
  if (!userCols.some(c => c.name === 'title')) await sql`ALTER TABLE users ADD COLUMN title TEXT`;
  if (!userCols.some(c => c.name === 'showcase')) await sql`ALTER TABLE users ADD COLUMN showcase TEXT`;
  if (!userCols.some(c => c.name === 'bio')) await sql`ALTER TABLE users ADD COLUMN bio TEXT`;
  if (!userCols.some(c => c.name === 'team')) await sql`ALTER TABLE users ADD COLUMN team TEXT`;
  if (!userCols.some(c => c.name === 'last_seen')) await sql`ALTER TABLE users ADD COLUMN last_seen INTEGER`;
  if (!userCols.some(c => c.name === 'last_view')) await sql`ALTER TABLE users ADD COLUMN last_view TEXT`;
  if (!userCols.some(c => c.name === 'view_since')) await sql`ALTER TABLE users ADD COLUMN view_since INTEGER`;
  await sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    text       TEXT    NOT NULL,
    seen       INTEGER NOT NULL DEFAULT 0
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, seen)`;
  const noteCols = await sql`SELECT name FROM pragma_table_info('notifications')`;
  if (!noteCols.some(c => c.name === 'opened')) await sql`ALTER TABLE notifications ADD COLUMN opened INTEGER NOT NULL DEFAULT 1`;
  await sql`CREATE TABLE IF NOT EXISTS client_errors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    user_id    INTEGER,
    view       TEXT,
    message    TEXT    NOT NULL,
    source     TEXT,
    agent      TEXT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS reactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    game       TEXT    NOT NULL,
    target_id  INTEGER NOT NULL,
    from_id    INTEGER NOT NULL,
    score      REAL    NOT NULL,
    emoji      TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS reactions_unique ON reactions (game, target_id, from_id)`;
  await sql`CREATE TABLE IF NOT EXISTS duels (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game          TEXT    NOT NULL,
    challenger_id INTEGER NOT NULL,
    opponent_id   INTEGER NOT NULL,
    created_at    INTEGER NOT NULL,
    ends_at       INTEGER NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'open',
    winner_id     INTEGER,
    a_score       REAL,
    b_score       REAL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_duels_status ON duels (status, ends_at)`;
  await sql`CREATE TABLE IF NOT EXISTS duos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    inviter_id  INTEGER NOT NULL,
    partner_id  INTEGER NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'pending',
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    formed_at   INTEGER,
    ended_at    INTEGER
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_duos_status ON duos (status)`;
  const duoCols = await sql`SELECT name FROM pragma_table_info('duos')`;
  if (!duoCols.some(c => c.name === 'since')) await sql`ALTER TABLE duos ADD COLUMN since INTEGER`;
  await sql`CREATE TABLE IF NOT EXISTS login_fails (
    key      TEXT PRIMARY KEY,
    n        INTEGER NOT NULL,
    until_at INTEGER NOT NULL,
    last_at  INTEGER NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS backups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    reason     TEXT    NOT NULL,
    scores     INTEGER NOT NULL,
    users      INTEGER NOT NULL,
    data       TEXT    NOT NULL
  )`;
}

// Versão das tabelas = impressão digital do próprio código de migração acima: qualquer mudança nele gera outra versão
// e tudo roda de novo. Banco já em dia → 1 consulta só em vez de ~27 (instância nova da Vercel responde bem mais rápido).
const migrations = () => (dialect() === 'sqlite' ? sqlite : postgres);
const schemaKey = () => 'schema:' + createHash('sha1').update(String(migrations())).digest('hex').slice(0, 16);

async function migrate() {
  const key = schemaKey();
  try {
    if ((await sql`SELECT 1 AS ok FROM settings WHERE key = ${key}`).length) return;
  } catch { /* banco novo: a tabela settings ainda não existe */ }
  await migrations()();
  await sql`DELETE FROM settings WHERE key LIKE ${'schema:%'} AND key <> ${key}`;
  await sql`INSERT INTO settings (key, value) VALUES (${key}, ${String(Date.now())}) ON CONFLICT (key) DO NOTHING`;
}

function ensureSchema() {
  ready ??= migrate().catch(err => { ready = null; throw err; });
  return ready;
}

module.exports = { ensureSchema, schemaKey };
