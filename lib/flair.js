// Prêmios do desafio do dia (que precisam do servidor): o jogo de amanhã escolhido pelo vencedor e as molduras de avatar.
// Quem ganhou cada dia sai das partidas, no fuso de Brasília — as mesmas contas que a página faz.
const { sql } = require('./store');
const { GAMES, isBetter } = require('./rules');
const { scheduledGame } = require('../public/js/daily.js');

const DAY_MS = 86_400_000, BRT = 3 * 3_600_000;
const dayOf = t => Math.floor((Number(t) - BRT) / DAY_MS);
const today = () => dayOf(Date.now());

/** Moldura → quantos desafios do dia precisa ter ganhado. */
const FRAMES = { bronze: 1, silver: 3, gold: 7, diamond: 15 };

async function getPicks() {
  const rows = await sql`SELECT key, value FROM settings WHERE key LIKE ${'pick:%'}`;
  const out = {};
  for (const r of rows) { try { out[Number(String(r.key).slice(5))] = JSON.parse(r.value); } catch {} }
  return out;
}
const setPick = (day, pick) => sql`INSERT INTO settings (key, value) VALUES (${'pick:' + day}, ${JSON.stringify(pick)})
  ON CONFLICT (key) DO UPDATE SET value = excluded.value`;

/** Nome → moldura escolhida (só contas ativas que escolheram uma). */
async function getFrames() {
  const rows = await sql`SELECT name, frame FROM users WHERE frame IS NOT NULL AND active = ${true}`;
  return Object.fromEntries(rows.map(r => [r.name, r.frame]));
}

/** Vencedor de cada dia já encerrado, do mais antigo ao mais novo: [{ day, game, name, score }]. */
async function winners(picks) {
  picks ||= await getPicks();
  const rows = await sql`SELECT s.game, s.score, s.created_at, COALESCE(u.name, s.player) AS name
                         FROM scores s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.id`;
  const now = today(), byDay = new Map();
  for (const r of rows) {
    const d = dayOf(r.created_at);
    if (d < now) (byDay.get(d) || byDay.set(d, []).get(d)).push(r);
  }
  const out = [];
  for (const d of [...byDay.keys()].sort((a, b) => a - b)) {
    const game = scheduledGame(GAMES, d, picks);
    const best = new Map();
    for (const r of byDay.get(d)) {
      const s = Number(r.score);
      if (r.game === game && (!best.has(r.name) || isBetter(game, s, best.get(r.name)))) best.set(r.name, s);
    }
    let top = null;
    for (const [name, score] of best) if (!top || isBetter(game, score, top.score)) top = { name, score };
    if (top) out.push({ day: d, game, ...top });
  }
  return out;
}

module.exports = { today, FRAMES, getPicks, setPick, getFrames, winners };
