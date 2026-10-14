// Conexão com o Neon Postgres (Vercel). A integração do Neon cria DATABASE_URL no projeto.
const { neon } = require('@neondatabase/serverless');

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) throw new Error('DATABASE_URL não configurada — adicione a integração Neon no projeto da Vercel');
const sql = neon(url);

let ready;
function ensureSchema() {
  ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS scores (
      id         BIGSERIAL PRIMARY KEY,
      game       TEXT             NOT NULL,
      player     TEXT             NOT NULL,
      score      DOUBLE PRECISION NOT NULL,
      created_at BIGINT           NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_scores_game ON scores (game)`;
  })();
  return ready;
}

module.exports = { sql, ensureSchema };
