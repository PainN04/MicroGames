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
};

const clone = o => JSON.parse(JSON.stringify(o));

async function getRules() {
  const rows = await sql`SELECT value FROM settings WHERE key = ${'gate_rules'}`;
  if (!rows[0]) return clone(DEFAULT_RULES);
  try {
    const saved = JSON.parse(rows[0].value);
    return { ...clone(DEFAULT_RULES), ...saved, priority: { ...DEFAULT_RULES.priority, ...(saved.priority || {}) } };
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
  const rules = {
    enabled: !!input.enabled,
    limit: n(input.limit, 'Limite', 0, 1000),
    priority: Object.fromEntries(Object.keys(DEFAULT_RULES.priority).map(k => [k, n(p[k], `Peso ${k}`)])),
    noInteractionMult: n(input.noInteractionMult, 'Multiplicador sem interação'),
    waitingClientMult: n(input.waitingClientMult, 'Multiplicador aguardando cliente'),
    waitingClientSituationIds: (Array.isArray(input.waitingClientSituationIds) ? input.waitingClientSituationIds : [])
      .map(Number).filter(Number.isInteger),
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

/* ---------- resultado do bloqueio (com cache de 60s por atendente) ---------- */

const gateCache = new Map();
const GATE_TTL = 60_000;

/** Quem não tem ID do Geiko vinculado nunca é bloqueado. Se o Geiko cair, libera (e avisa) em vez de travar todo mundo. */
async function gateFor(user, { force = false } = {}) {
  const rules = await getRules();
  // bloqueio manual do admin vale pra qualquer conta (com ou sem Geiko) e não passa pelo cache
  if (user.blockUntil && user.blockUntil > Date.now()) {
    return { linked: !!user.geikoId, enabled: true, blocked: true, manual: { until: user.blockUntil, reason: user.blockReason || '' },
      total: 0, limit: rules.limit, tickets: [] };
  }
  if (!user.geikoId) return { linked: false, enabled: rules.enabled, blocked: false, total: 0, limit: rules.limit, tickets: [] };
  if (!rules.enabled) return { linked: true, enabled: false, blocked: false, total: 0, limit: rules.limit, tickets: [] };

  const cached = gateCache.get(user.geikoId);
  if (!force && cached && Date.now() - cached.at < GATE_TTL) return cached.value;

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

module.exports = { DEFAULT_RULES, getRules, saveRules, gateFor, situationNames };
