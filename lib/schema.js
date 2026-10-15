// Cria/atualiza as tabelas. Idempotente: roda uma vez por instância (Vercel) ou ao subir o server.js.
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
  await sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
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
  await sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
}

function ensureSchema() {
  ready ??= (dialect() === 'sqlite' ? sqlite() : postgres()).catch(err => { ready = null; throw err; });
  return ready;
}

module.exports = { ensureSchema };
