// Cria uma conta de jogador pra cada atendente cadastrado no painel do GeikoDashboard (tabela `attendants`),
// já vinculada ao ID do Geiko. Quem já tem conta (mesmo usuário ou mesmo ID do Geiko) é pulado.
// As senhas temporárias vão pra um CSV local (fora do Git) pra você distribuir; no 1º login cada um troca.
//
// Uso:
//   npm run importar -- "<caminho do .env do GeikoDashboard>"             → banco de TESTE local
//   npm run importar -- "<caminho do .env do GeikoDashboard>" --producao  → banco da Vercel
// O .env do GeikoDashboard precisa ter POSTGRES_URL (só é lido; nada é alterado lá).
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const prod = args.includes('--producao');
const dashEnv = args.find(a => a !== '--producao');
if (!dashEnv || !fs.existsSync(dashEnv)) {
  console.error('Uso: npm run importar -- "<.env do GeikoDashboard>" [--producao]');
  process.exit(1);
}
const dashUrl = (fs.readFileSync(dashEnv, 'utf8').match(/^POSTGRES_URL="?([^"\r\n]+)/m) || [])[1];
if (!dashUrl) { console.error('POSTGRES_URL não encontrada nesse .env'); process.exit(1); }

if (prod) {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  process.env.DATABASE_URL = (env.match(/^DATABASE_URL="?([^"\r\n]*)"?/m) || [])[1];
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL não encontrada no .env.local'); process.exit(1); }
} else {
  process.env.MICROGAME_SQLITE = path.join(__dirname, '..', 'microgame.db');
}

const { neon } = require('@neondatabase/serverless');
const { sql } = require('../lib/store');
const { ensureSchema } = require('../lib/schema');
const { hashPassword, generatePassword } = require('../lib/auth');

// "Gabryel Upton" → "gabryel.upton"; "João da Silva" → "joao.silva"
const usernameFor = nome => {
  const parts = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]}.${parts.at(-1)}` : parts[0];
};
const csvCell = v => `"${String(v).replace(/"/g, '""')}"`;

(async () => {
  const attendants = await neon(dashUrl)`SELECT id, nome FROM attendants ORDER BY nome`;
  await ensureSchema();
  const created = [], skipped = [];
  for (const a of attendants) {
    const geikoId = String(a.id), name = a.nome.trim(), username = usernameFor(name);
    const clash = await sql`SELECT username, geiko_id FROM users WHERE lower(username) = lower(${username}) OR geiko_id = ${geikoId}`;
    if (clash.length) { skipped.push(`${name} (já existe: ${clash[0].username})`); continue; }
    const temp = generatePassword(10);
    await sql`INSERT INTO users (username, name, role, geiko_id, password_hash, must_change, active, token_version, created_at)
              VALUES (${username}, ${name}, ${'player'}, ${geikoId}, ${await hashPassword(temp)}, ${true}, ${true}, ${1}, ${Date.now()})`;
    created.push({ name, username, geikoId, temp });
  }

  const where = prod ? 'producao' : 'teste';
  console.log(`\nBanco ${prod ? 'de PRODUÇÃO (Vercel)' : 'de TESTE (local)'}: ${created.length} conta(s) criada(s), ${skipped.length} pulada(s).`);
  for (const c of created) console.log(`  + ${c.name.padEnd(20)} ${c.username.padEnd(20)} Geiko ${c.geikoId}`);
  for (const s of skipped) console.log(`  = ${s}`);
  if (created.length) {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const file = path.join(__dirname, '..', `contas-${where}-${stamp}.csv`);
    fs.writeFileSync(file, '﻿' + ['nome;usuario;id_geiko;senha_temporaria',
      ...created.map(c => [c.name, c.username, c.geikoId, c.temp].map(csvCell).join(';'))].join('\r\n') + '\r\n');
    console.log(`\nSenhas temporárias em: ${path.basename(file)}  (fora do Git — apague depois de distribuir)`);
  }
})().catch(err => { console.error(err); process.exit(1); });
