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
/** Molduras liberadas por conquista (a conquista é conferida na página, onde elas são calculadas). */
const ACH_FRAMES = ['fogo', 'neon', 'esmeralda', 'arcoiris', 'real'];

async function getPicks() {
  const rows = await sql`SELECT key, value FROM settings WHERE key LIKE ${'pick:%'}`;
  const out = {};
  for (const r of rows) { try { out[Number(String(r.key).slice(5))] = JSON.parse(r.value); } catch {} }
  return out;
}
const setPick = (day, pick) => sql`INSERT INTO settings (key, value) VALUES (${'pick:' + day}, ${JSON.stringify(pick)})
  ON CONFLICT (key) DO UPDATE SET value = excluded.value`;

/** Nome → moldura, avatar, título, vitrine e frase escolhidos (só contas ativas que escolheram algum). */
async function getLooks() {
  const rows = await sql`SELECT name, frame, avatar, title, showcase, bio FROM users
                         WHERE active = ${true} AND (frame IS NOT NULL OR avatar IS NOT NULL OR title IS NOT NULL
                                                     OR showcase IS NOT NULL OR bio IS NOT NULL)`;
  const frames = {}, avatars = {}, titles = {}, showcases = {}, bios = {};
  for (const r of rows) {
    if (r.frame) frames[r.name] = r.frame;
    if (r.avatar) avatars[r.name] = r.avatar;
    if (r.title) titles[r.name] = r.title;
    if (r.showcase) { try { showcases[r.name] = JSON.parse(r.showcase); } catch {} }
    if (r.bio) bios[r.name] = r.bio;
  }
  return { frames, avatars, titles, showcases, bios };
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

module.exports = { today, dayOf, FRAMES, ACH_FRAMES, getPicks, setPick, getLooks, winners };
