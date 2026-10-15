// Copia as pontuações do microgame.db (SQLite local) pro Neon. Roda uma vez só.
// Uso: DATABASE_URL=... node scripts/migrate-to-neon.js   (ou com .env.local na raiz)
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const envFile = path.join(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(DATABASE_URL)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
process.env.MICROGAME_SQLITE = '';
const { sql } = require('../lib/store');
const { ensureSchema } = require('../lib/schema');

(async () => {
  await ensureSchema();
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM scores`;
  if (n > 0) {
    console.log(`O Neon já tem ${n} pontuações — migração cancelada pra não duplicar.`);
    return;
  }
  const local = new DatabaseSync(path.join(__dirname, '..', 'microgame.db'), { readOnly: true });
  const rows = local.prepare('SELECT game, player, score, created_at FROM scores ORDER BY id').all();
  for (const r of rows) {
    await sql`INSERT INTO scores (game, player, score, created_at) VALUES (${r.game}, ${r.player}, ${r.score}, ${r.created_at})`;
  }
  const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM scores`;
  console.log(`Migradas ${rows.length} pontuações. Total no Neon: ${total}.`);
})().catch(err => { console.error(err); process.exit(1); });
