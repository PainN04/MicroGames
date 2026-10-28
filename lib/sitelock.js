// Bloqueio geral (modo manutenção): a conta dona liga no painel e ninguém mais joga até ela desligar.
// Fica na tabela settings, então vale na hora pra todas as instâncias, sem deploy.
const { sql } = require('./store');

const KEY = 'site_lock';

/** null se o site está liberado; senão { reason, since }. */
async function getSiteLock() {
  const rows = await sql`SELECT value FROM settings WHERE key = ${KEY}`;
  if (!rows[0]) return null;
  try {
    const v = JSON.parse(rows[0].value);
    return v && v.on ? { reason: String(v.reason || ''), since: Number(v.since) || 0 } : null;
  } catch {
    return null;
  }
}

/** Liga (com motivo opcional, até 200 caracteres) ou desliga. Devolve o estado novo. */
async function setSiteLock(on, reason = '') {
  await sql`DELETE FROM settings WHERE key = ${KEY}`;
  if (!on) return null;
  const value = { on: true, reason: String(reason || '').trim().slice(0, 200), since: Date.now() };
  await sql`INSERT INTO settings (key, value) VALUES (${KEY}, ${JSON.stringify(value)})`;
  return { reason: value.reason, since: value.since };
}

module.exports = { getSiteLock, setSiteLock };
