// Cria (ou promove) uma conta de administrador e mostra uma senha temporária UMA vez.
// Uso:
//   npm run admin -- <usuario> "<Nome>" [idGeiko]            → banco de TESTE local (microgame.db)
//   npm run admin -- <usuario> "<Nome>" [idGeiko] --producao → banco da Vercel (DATABASE_URL do .env.local)
//   npm run admin -- <usuario> "<Nome>" [idGeiko] --homolog  → banco de TESTE da Vercel (Homolog_DB_URL no ambiente)
// No primeiro login a pessoa é obrigada a trocar a senha. As demais contas se criam pelo painel admin.
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const prod = args.includes('--producao');
const homolog = args.includes('--homolog');
const [username, name, geikoId] = args.filter(a => !a.startsWith('--'));
if (!username || !name) {
  console.error('Uso: npm run admin -- <usuario> "<Nome>" [idGeiko] [--producao | --homolog]');
  process.exit(1);
}

if (homolog) {
  // a URL do banco de teste vem do ambiente (set Homolog_DB_URL=...), nunca do arquivo
  if (!process.env.Homolog_DB_URL) { console.error('Defina Homolog_DB_URL no ambiente antes de rodar com --homolog'); process.exit(1); }
  process.env.DATABASE_URL = process.env.Homolog_DB_URL;
} else if (prod) {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const m = env.match(/^DATABASE_URL="?([^"\r\n]*)"?/m);
  if (!m) { console.error('DATABASE_URL não encontrada no .env.local'); process.exit(1); }
  process.env.DATABASE_URL = m[1];
} else {
  process.env.MICROGAME_SQLITE = path.join(__dirname, '..', 'microgame.db');
}

const { sql } = require('../lib/store');
const { ensureSchema } = require('../lib/schema');
const { hashPassword, generatePassword } = require('../lib/auth');

(async () => {
  await ensureSchema();
  const temp = generatePassword(12);
  const hash = await hashPassword(temp);
  const existing = await sql`SELECT id FROM users WHERE lower(username) = lower(${username})`;
  if (existing.length) {
    await sql`UPDATE users SET name = ${name}, role = ${'admin'}, active = ${true}, password_hash = ${hash}, must_change = ${true},
              geiko_id = ${geikoId || null}, token_version = token_version + 1 WHERE id = ${existing[0].id}`;
  } else {
    await sql`INSERT INTO users (username, name, role, geiko_id, password_hash, must_change, active, token_version, created_at)
              VALUES (${username}, ${name}, ${'admin'}, ${geikoId || null}, ${hash}, ${true}, ${true}, ${1}, ${Date.now()})`;
  }
  const onde = prod ? 'de PRODUÇÃO (Vercel)' : homolog ? 'de TESTE (Vercel)' : 'de TESTE (local)';
  console.log(`\nConta de admin pronta no banco ${onde}:`);
  console.log(`  usuário: ${username}`);
  console.log(`  senha temporária: ${temp}`);
  console.log('  (no primeiro login o site pede pra trocar)\n');
})().catch(err => { console.error(err); process.exit(1); });
