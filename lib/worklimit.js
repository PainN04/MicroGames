// Limite de jogo no expediente: cada conta tem um tanto de minutos por dia pra jogar dentro do horário de trabalho
// (padrão 30 min, das 08:00 às 17:30, de segunda a sexta, horário de Brasília). Fora dessa janela não tem limite.
//
// Quem conta é o servidor, pela conferência que a página faz a cada ~20s (GET /api/auth/ping). Se a conferência
// anterior foi dentro de um jogo, o tempo entre as duas entra na conta (só a parte dentro da janela, e no máximo
// GAP de cada vez: aba escondida não confere, então uma pausa longa não vira tempo de jogo). Com duas abas abertas o
// intervalo é sempre desde a última conferência da conta, então não conta em dobro.
// Ao chegar no limite, os jogos fecham pra conta até o fim da janela (a regra fica na tabela settings, editável
// pela conta dona no painel).
const { sql } = require('./store');

const KEY = 'work_limit';
const BRT = 3 * 3_600_000; // horário de Brasília = UTC-3 (sem horário de verão)
const DAY = 86_400_000;
const GAP = 45_000; // a página confere a cada 20s; mais que isso sem conferir = parou de jogar (aba escondida, fechou)

const DEFAULT = { enabled: true, minutes: 30, from: 8 * 60, to: 17 * 60 + 30, weekends: false };

const clone = o => ({ ...o });
const hm = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** "AAAA-MM-DD" do dia no horário de Brasília. */
function dayOf(ms) {
  return new Date(ms - BRT).toISOString().slice(0, 10);
}

/** Janela do expediente no dia de `now`: { start, end } em ms, ou null (regra desligada ou fim de semana livre). */
function windowOf(cfg, now = Date.now()) {
  if (!cfg.enabled || cfg.to <= cfg.from) return null;
  const local = now - BRT, midnight = local - (((local % DAY) + DAY) % DAY) + BRT;
  const wd = new Date(local).getUTCDay();
  if (!cfg.weekends && (wd === 0 || wd === 6)) return null;
  return { start: midnight + cfg.from * 60_000, end: midnight + cfg.to * 60_000 };
}

/** Milissegundos de [from, to] que caem dentro da janela do dia de `to` (0 se o intervalo for longo demais). */
function countable(cfg, from, to) {
  if (!from || to <= from || to - from > GAP) return 0;
  const w = windowOf(cfg, to);
  if (!w) return 0;
  return Math.max(0, Math.min(to, w.end) - Math.max(from, w.start));
}

async function getConfig() {
  const rows = await sql`SELECT value FROM settings WHERE key = ${KEY}`;
  if (!rows[0]) return clone(DEFAULT);
  try {
    const v = JSON.parse(rows[0].value);
    return { ...clone(DEFAULT), ...v };
  } catch {
    return clone(DEFAULT);
  }
}

/** Valida e grava. from/to em "HH:MM" ou minutos do dia. Lança Error com a mensagem pro painel. */
async function saveConfig(input = {}) {
  const time = (v, name) => {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1440) return v;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
    const x = m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
    if (!m || Number(m[2]) > 59 || x > 1440) throw new Error(`${name} inválido (use HH:MM).`);
    return x;
  };
  const minutes = Number(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) throw new Error('Minutos por dia: use um número inteiro de 1 a 600.');
  const cfg = {
    enabled: !!input.enabled, minutes,
    from: time(input.from, 'Início do expediente'), to: time(input.to, 'Fim do expediente'),
    weekends: !!input.weekends,
  };
  if (cfg.to <= cfg.from) throw new Error('O fim do expediente tem que ser depois do início.');
  await sql`DELETE FROM settings WHERE key = ${KEY}`;
  await sql`INSERT INTO settings (key, value) VALUES (${KEY}, ${JSON.stringify(cfg)})`;
  return cfg;
}

/** Milissegundos que a conta já jogou no expediente do dia de `now`. */
async function usedMs(userId, now = Date.now()) {
  const [r] = await sql`SELECT ms FROM work_play WHERE user_id = ${userId} AND day = ${dayOf(now)}`;
  return Number(r?.ms) || 0;
}

/**
 * Chamado na conferência da página: soma o tempo desde a última conferência se ela foi dentro de um jogo.
 * prev = { seen, view } da conferência anterior. Devolve os ms somados (0 se nada contou).
 */
async function track(userId, prev, isGame, cfg, now = Date.now()) {
  if (!prev?.view || !isGame(prev.view)) return 0;
  const add = Math.round(countable(cfg, Number(prev.seen) || 0, now));
  if (!add) return 0;
  await sql`INSERT INTO work_play (user_id, day, ms) VALUES (${userId}, ${dayOf(now)}, ${add})
    ON CONFLICT (user_id, day) DO UPDATE SET ms = work_play.ms + ${add}`;
  // guarda só uma semana de histórico
  await sql`DELETE FROM work_play WHERE day < ${dayOf(now - 7 * DAY)}`;
  return add;
}

/**
 * Situação da conta agora: null fora do expediente (ou regra desligada); senão
 * { used, limit, left, blocked, from, to, until } (ms; until = quando a janela acaba e os jogos voltam).
 */
function statusOf(cfg, used, now = Date.now()) {
  const w = windowOf(cfg, now);
  if (!w || now < w.start || now >= w.end) return null;
  const limit = cfg.minutes * 60_000;
  return { used, limit, left: Math.max(0, limit - used), blocked: used >= limit, from: hm(cfg.from), to: hm(cfg.to), until: w.end };
}

async function statusFor(user, now = Date.now()) {
  const cfg = await getConfig();
  if (!windowOf(cfg, now)) return null;
  return statusOf(cfg, await usedMs(user.id, now), now);
}

/** Quanto cada conta jogou no expediente de hoje (pro painel da conta dona), mais tempo primeiro. */
async function todayUsage(now = Date.now()) {
  const rows = await sql`SELECT w.user_id, w.ms, u.name FROM work_play w JOIN users u ON u.id = w.user_id
    WHERE w.day = ${dayOf(now)} ORDER BY w.ms DESC`;
  return rows.map(r => ({ userId: Number(r.user_id), name: r.name, ms: Number(r.ms) }));
}

/** Zera o tempo de hoje de uma conta (a conta dona libera alguém antes da hora). */
async function resetToday(userId, now = Date.now()) {
  await sql`DELETE FROM work_play WHERE user_id = ${userId} AND day = ${dayOf(now)}`;
}

module.exports = { DEFAULT, GAP, dayOf, windowOf, countable, getConfig, saveConfig, usedMs, track, statusOf, statusFor, todayUsage, resetToday, hm };
