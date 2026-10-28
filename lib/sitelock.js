// Bloqueio geral (modo manutenção): a conta dona liga no painel e ninguém mais joga até ela desligar.
// Fica na tabela settings, então vale na hora pra todas as instâncias, sem deploy.
const { sql } = require('./store');

const KEY = 'site_lock';

/** null se o site está liberado (ou o tempo do bloqueio já acabou); senão { reason, since, until }. until null = até liberar. */
async function getSiteLock() {
  const rows = await sql`SELECT value FROM settings WHERE key = ${KEY}`;
  if (!rows[0]) return null;
  try {
    const v = JSON.parse(rows[0].value);
    if (!v || !v.on) return null;
    const until = Number(v.until) || null;
    if (until && until <= Date.now()) return null;
    return { reason: String(v.reason || ''), since: Number(v.since) || 0, until };
  } catch {
    return null;
  }
}

/** Liga (com motivo opcional, até 200 caracteres, e por `minutes` minutos; 0 = até liberar) ou desliga. Devolve o estado novo. */
async function setSiteLock(on, reason = '', minutes = 0) {
  await sql`DELETE FROM settings WHERE key = ${KEY}`;
  if (!on) return null;
  const now = Date.now();
  const value = { on: true, reason: String(reason || '').trim().slice(0, 200), since: now, until: minutes ? now + minutes * 60_000 : null };
  await sql`INSERT INTO settings (key, value) VALUES (${KEY}, ${JSON.stringify(value)})`;
  return { reason: value.reason, since: value.since, until: value.until };
}

module.exports = { getSiteLock, setSiteLock };
