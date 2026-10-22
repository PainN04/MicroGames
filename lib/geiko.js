// Bloqueio por fila do Geiko: busca os tickets abertos do atendente e soma um "peso" por ticket.
// Mesma consulta do GeikoDashboard (POST /attendance/search com attendantIds + openAttendance).
const { sql } = require('./store');

/* ---------- regra (editável no painel admin; guardada na tabela settings) ---------- */

const DEFAULT_RULES = {
  enabled: true,
  limit: 3, // bloqueia quando a soma dos pesos passa disso
  priority: { URG: 2, ALT: 1.5, MED: 1, NOR: 1, BAI: 0.75, none: 2.5 }, // sem prioridade pesa mais
  noInteractionMult: 1.5, // ninguém mexeu desde a abertura, ou tem mensagem nova sem resposta
  waitingClientMult: 0.25, // já interagiu e está esperando o cliente: pouco a fazer
  waitingClientSituationIds: [2], // "Aguardando retorno do Cliente"
  weeklyPublic: false, // ranking de tickets resolvidos na semana: false = todos veem só o destaque; números só no relatório do admin
  freeHours: { enabled: true, from: 18, to: 8, weekends: true }, // fora do expediente (horário de Brasília) libera todo mundo, com ou sem ticket
};

const BRT = 3 * 3_600_000; // horário de Brasília = UTC-3 (sem horário de verão)
const clone = o => JSON.parse(JSON.stringify(o));

async function getRules() {
  const rows = await sql`SELECT value FROM settings WHERE key = ${'gate_rules'}`;
  if (!rows[0]) return clone(DEFAULT_RULES);
  try {
    const saved = JSON.parse(rows[0].value);
    return { ...clone(DEFAULT_RULES), ...saved, priority: { ...DEFAULT_RULES.priority, ...(saved.priority || {}) },
      freeHours: { ...DEFAULT_RULES.freeHours, ...(saved.freeHours || {}) } };
  } catch {
    return clone(DEFAULT_RULES);
  }
}

/** Valida e grava. Devolve a regra salva ou lança Error com mensagem pro admin. */
async function saveRules(input) {
  const n = (v, name, min = 0, max = 100) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x < min || x > max) throw new Error(`${name} inválido (use um número entre ${min} e ${max}).`);
    return x;
  };
  const p = input.priority || {};
  const fh = { ...DEFAULT_RULES.freeHours, ...(input.freeHours || {}) };
  const rules = {
    enabled: !!input.enabled,
    limit: n(input.limit, 'Limite', 0, 1000),
    priority: Object.fromEntries(Object.keys(DEFAULT_RULES.priority).map(k => [k, n(p[k], `Peso ${k}`)])),
    noInteractionMult: n(input.noInteractionMult, 'Multiplicador sem interação'),
    waitingClientMult: n(input.waitingClientMult, 'Multiplicador aguardando cliente'),
    waitingClientSituationIds: (Array.isArray(input.waitingClientSituationIds) ? input.waitingClientSituationIds : [])
      .map(Number).filter(Number.isInteger),
    weeklyPublic: !!input.weeklyPublic,
    freeHours: {
      enabled: !!fh.enabled,
      from: n(fh.from, 'Hora de início do horário livre', 0, 23),
      to: n(fh.to, 'Hora de fim do horário livre', 0, 23),
      weekends: !!fh.weekends,
    },
  };
  const value = JSON.stringify(rules);
  await sql`DELETE FROM settings WHERE key = ${'gate_rules'}`;
  await sql`INSERT INTO settings (key, value) VALUES (${'gate_rules'}, ${value})`;
  gateCache.clear();
  return rules;
}

/* ---------- API do Geiko ---------- */

const bases = () => [process.env.GEIKO_API_URL, 'https://public-api.geiko.com.br', 'https://api.geiko.com.br'].filter(Boolean);
let activeBase = null;

async function geiko(pathname, options = {}) {
  const key = process.env.GEIKO_API_KEY;
  if (!key) throw new Error('GEIKO_API_KEY não configurada no servidor.');
  const headers = { 'x-company-key': key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const tries = activeBase ? [activeBase, ...bases().filter(b => b !== activeBase)] : bases();
  let lastErr;
  for (const base of tries) {
    try {
      const res = await fetch(base + pathname, { ...options, headers, signal: AbortSignal.timeout(15000) });
      if (res.status >= 500) throw new Error(`Geiko respondeu ${res.status}`);
      if (!res.ok) throw new Error(`Geiko recusou a consulta (${res.status}).`);
      activeBase = base;
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

let situationsCache = { at: 0, map: {} };
async function situationNames() {
  if (Date.now() - situationsCache.at < 3600_000) return situationsCache.map;
  const d = await geiko('/attendance-situation/list');
  const map = {};
  for (const s of d.data || d || []) map[s.id] = s.description || s.name || `Status ${s.id}`;
  situationsCache = { at: Date.now(), map };
  return map;
}

/* ---------- peso de cada ticket ---------- */

const PRIORITY_LABEL = { URG: 'Urgente', ALT: 'Alta', MED: 'Média', NOR: 'Normal', BAI: 'Baixa', none: 'Sem prioridade' };

// "Sem interação do atendente": a API pública não diz QUEM interagiu, então usamos os dois sinais que ela dá —
// última interação igual à abertura (ninguém mexeu) ou newInteraction (mensagem nova ainda não tratada).
function noInteraction(t) {
  if (t.newInteraction === true) return true;
  if (!t.lastInteractionDate) return true;
  return !!t.startDate && t.lastInteractionDate.slice(0, 16) === t.startDate.slice(0, 16);
}

function weigh(t, rules, situations) {
  const prio = PRIORITY_LABEL[t.priority] ? t.priority : 'none';
  const base = rules.priority[prio];
  const silent = noInteraction(t);
  const waiting = !silent && rules.waitingClientSituationIds.includes(t.attendanceSituationId);
  const mult = silent ? rules.noInteractionMult : waiting ? rules.waitingClientMult : 1;
  return {
    id: t.id,
    priority: PRIORITY_LABEL[prio],
    status: situations[t.attendanceSituationId] || (t.attendanceSituationId ? `Status ${t.attendanceSituationId}` : 'Sem status'),
    reason: silent ? 'sem interação' : waiting ? 'aguardando cliente' : null,
    weight: Math.round(base * mult * 100) / 100,
  };
}

/* ---------- horário livre (fora do expediente) ---------- */
// Horas cheias no horário de Brasília (UTC-3). from > to atravessa a meia-noite (18 → 8 = das 18h às 7h59).
function isFreeHour(fh, ms) {
  const d = new Date(ms - BRT);
  if (fh.weekends && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) return true;
  const h = d.getUTCHours();
  if (fh.from === fh.to) return false;
  return fh.from > fh.to ? h >= fh.from || h < fh.to : h >= fh.from && h < fh.to;
}

/** null se agora é expediente; senão { until } = quando o bloqueio volta a valer. */
function freeWindow(rules, now = Date.now()) {
  const fh = rules.freeHours;
  if (!fh?.enabled || !isFreeHour(fh, now)) return null;
  let t = now - (now % 3_600_000) + 3_600_000; // próxima hora cheia (BRT tem offset inteiro)
  for (let i = 0; i < 24 * 8 && isFreeHour(fh, t); i++) t += 3_600_000;
  return { until: t };
}

/* ---------- resultado do bloqueio (com cache de 60s por atendente) ---------- */

const gateCache = new Map();
const GATE_TTL = 60_000;
// "Atualizar agora" (force) pula o cache, mas não mais que uma vez a cada 10s por atendente: sem isso qualquer conta
// logada podia disparar consultas sem fim na API do Geiko com a chave da empresa.
const FORCE_MIN = 10_000;

/** Quem não tem ID do Geiko vinculado nunca é bloqueado. Se o Geiko cair, libera (e avisa) em vez de travar todo mundo.
 *  No horário livre a fila continua aparecendo, mas não bloqueia (o bloqueio manual do admin continua valendo). */
async function gateFor(user, opts = {}) {
  const rules = await getRules();
  const value = await queueGate(user, rules, opts);
  const free = !value.manual && value.enabled ? freeWindow(rules) : null;
  return free ? { ...value, blocked: false, free } : value;
}

async function queueGate(user, rules, { force = false } = {}) {
  // bloqueio manual do admin vale pra qualquer conta (com ou sem Geiko) e não passa pelo cache
  if (user.blockUntil && user.blockUntil > Date.now()) {
    return { linked: !!user.geikoId, enabled: true, blocked: true, manual: { until: user.blockUntil, reason: user.blockReason || '' },
      total: 0, limit: rules.limit, tickets: [] };
  }
  if (!user.geikoId) return { linked: false, enabled: rules.enabled, blocked: false, total: 0, limit: rules.limit, tickets: [] };
  if (!rules.enabled) return { linked: true, enabled: false, blocked: false, total: 0, limit: rules.limit, tickets: [] };

  const cached = gateCache.get(user.geikoId);
  if (cached && Date.now() - cached.at < (force ? FORCE_MIN : GATE_TTL)) return cached.value;

  let value;
  try {
    const [d, situations] = await Promise.all([
      geiko('/attendance/search', { method: 'POST', body: JSON.stringify({ attendantIds: [Number(user.geikoId)], openAttendance: true }) }),
      situationNames(),
    ]);
    const tickets = (d.data?.attendances || []).map(t => weigh(t, rules, situations)).sort((a, b) => b.weight - a.weight);
    const total = Math.round(tickets.reduce((s, t) => s + t.weight, 0) * 100) / 100;
    value = { linked: true, enabled: true, blocked: total > rules.limit, total, limit: rules.limit, tickets, checkedAt: Date.now() };
  } catch (err) {
    console.error('[geiko]', err.message);
    value = { linked: true, enabled: true, blocked: false, total: 0, limit: rules.limit, tickets: [], error: 'Não consegui consultar o Geiko agora — liberado por enquanto.', checkedAt: Date.now() };
  }
  gateCache.set(user.geikoId, { at: Date.now(), value });
  return value;
}

/* ---------- tickets resolvidos na semana (destaque e relatório) ---------- */
// Semana = segunda 00:00 até agora, no horário de Brasília (UTC-3). O Geiko filtra pela data de solução.
function weekStartBRT(now = Date.now()) {
  const d = new Date(now - BRT);
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 86_400_000;
  return monday + BRT;
}
const geikoDate = ms => { const d = new Date(ms - BRT); return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`; };
const WEEK_TTL = 10 * 60_000;

/** [{ userId, name, count }] de todo mundo com ID do Geiko, mais quem fechou mais. Cache de 10 min no banco
 *  (settings), então várias instâncias da Vercel não repetem as consultas. */
async function weeklyClosed({ force = false } = {}) {
  const since = weekStartBRT();
  const rows = await sql`SELECT value FROM settings WHERE key = ${'geiko_week'}`;
  if (!force && rows[0]) {
    try {
      const c = JSON.parse(rows[0].value);
      if (c.since === since && Date.now() - c.at < WEEK_TTL) return c;
    } catch {}
  }
  const users = await sql`SELECT id, name, geiko_id FROM users WHERE geiko_id IS NOT NULL AND active = ${true}`;
  const body = id => JSON.stringify({ attendantIds: [Number(id)], attendanceEndedAt: { startDate: geikoDate(since), endDate: geikoDate(Date.now()) } });
  let people;
  try {
    people = await Promise.all(users.map(async u => {
      const d = await geiko('/attendance/search', { method: 'POST', body: body(u.geiko_id) });
      return { userId: Number(u.id), name: u.name, count: (d.data?.attendances || []).length };
    }));
  } catch (err) {
    console.error('[geiko semana]', err.message);
    if (rows[0]) { try { return { ...JSON.parse(rows[0].value), stale: true }; } catch {} }
    return { since, at: Date.now(), people: [], error: 'Não consegui consultar o Geiko agora.' };
  }
  people.sort((a, b) => b.count - a.count);
  const value = { since, at: Date.now(), people };
  await sql`DELETE FROM settings WHERE key = ${'geiko_week'}`;
  await sql`INSERT INTO settings (key, value) VALUES (${'geiko_week'}, ${JSON.stringify(value)})`;
  return value;
}

module.exports = { DEFAULT_RULES, getRules, saveRules, gateFor, freeWindow, situationNames, weigh, weeklyClosed, weekStartBRT };
