// Ritmo com músicas: cada música tem o seu ranking (a melhor partida de cada pessoa nela, tabela ritmo_scores) e o
// ranking do jogo (scores, game 'ritmo') guarda a pontuação geral = soma do melhor de cada pessoa em cada música.
// Quem calcula a soma é o servidor: a página só manda a pontuação da música, conferida contra o mapa de notas dela
// (lib/plays.js, regra do ritmo), então não dá pra forjar nem a pontuação da música nem a geral pelo F12.
// As músicas e os mapas ficam em public/data/ritmo/ (gerados por scripts/ritmo-chart.js); 'treino' é a música
// gerada na hora (a de antes), sem mapa fixo: vale o limite antigo de pontos.
const fs = require('node:fs');
const path = require('node:path');
const { sql, num } = require('./store');

const DIR = path.join(__dirname, '../public/data/ritmo');
// durationMs = até o fim da última nota (o mínimo de partida); lengthMs = duração da música (o que a página mostra)
const TREINO = { id: 'treino', title: 'Treino', artist: 'Música gerada na hora', durationMs: 40000, lengthMs: 45000, max: 120000 };

// Teto da música: toda nota em Perfeito (200) com o combo no máximo (x4); nota comprida pinga 5 a cada 100 ms e dá
// 50 no fim, também x4. Mesmo cálculo de public/js/games/ritmo.js.
const MAX_MULT = 4;
function maxScore(notes) {
  let max = 0;
  for (const [, , len = 0] of notes) max += 200 * MAX_MULT + (len ? (Math.floor(len / 100) + 1) * 5 * MAX_MULT + 50 * MAX_MULT : 0);
  return max;
}

let catalog = null;
/** id → { id, title, artist, durationMs, max } (o treino incluso). */
function songs() {
  if (catalog) return catalog;
  catalog = new Map([[TREINO.id, TREINO]]);
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(DIR, 'songs.json'), 'utf8')); } catch {}
  for (const s of list) {
    try {
      const chart = JSON.parse(fs.readFileSync(path.join(DIR, s.id + '.json'), 'utf8'));
      const lastEnd = Math.max(...chart.notes.map(([t, , len = 0]) => t + len));
      catalog.set(s.id, { id: s.id, title: s.title, artist: s.artist, durationMs: lastEnd, lengthMs: chart.durationMs, max: maxScore(chart.notes) });
    } catch (err) { console.error('[ritmo] mapa quebrado:', s.id, err.message); }
  }
  return catalog;
}

/** Recusa (texto) ou null. secs = segundos do relógio do servidor desde que a partida abriu. */
function checkSong(track, score, secs, slack) {
  const song = typeof track === 'string' && songs().get(track);
  if (!song) return 'música inválida';
  if (!Number.isInteger(score) || score < 0 || score > song.max) return 'pontuação impossível pra essa música';
  if (secs < song.durationMs / 1000 - slack) return 'partida mais curta que a música';
  return null;
}

/** Melhor de cada música da pessoa: { track: score }. */
async function bestsOf(userId) {
  const rows = await sql`SELECT track, MAX(score) AS b FROM ritmo_scores WHERE user_id = ${userId} GROUP BY track`;
  return Object.fromEntries(rows.map(r => [r.track, num(r.b)]));
}
const sum = bests => Object.values(bests).reduce((a, b) => a + b, 0);

/** Grava a partida da música e devolve { total, bests, prevBest } — total = nova pontuação geral (o router grava em scores). */
async function recordSong(user, track, score) {
  const before = await bestsOf(user.id);
  await sql`INSERT INTO ritmo_scores (user_id, track, score, created_at) VALUES (${user.id}, ${track}, ${score}, ${Date.now()})`;
  const bests = { ...before, [track]: Math.max(before[track] ?? 0, score) };
  return { total: sum(bests), bests, prevBest: before[track] ?? null };
}

/** Rankings das músicas: o melhor de cada pessoa em cada uma (desempate: quem fez primeiro). */
async function boards() {
  const rows = await sql`SELECT r.track, r.user_id, u.name, r.score, r.created_at FROM ritmo_scores r JOIN users u ON u.id = r.user_id`;
  const best = new Map();
  for (const r of rows) {
    const key = r.track + '|' + r.user_id, score = num(r.score), at = num(r.created_at);
    const cur = best.get(key);
    if (!cur || score > cur.score || (score === cur.score && at < cur.date)) best.set(key, { track: r.track, name: r.name, score, date: at });
  }
  const out = {};
  for (const b of best.values()) (out[b.track] ||= []).push({ name: b.name, score: b.score, date: b.date });
  for (const k in out) out[k].sort((a, b) => b.score - a.score || a.date - b.date);
  return out;
}

/** O que a página mostra antes de escolher a música. */
async function overview(user) {
  return {
    songs: [...songs().values()].map(({ id, title, artist, durationMs, lengthMs }) => ({ id, title, artist, durationMs: lengthMs ?? durationMs })),
    boards: await boards(),
    mine: user ? await bestsOf(user.id) : {},
  };
}

// Primeira vez com músicas: o melhor Ritmo de cada pessoa (todas as partidas eram da música gerada) vira o melhor
// dela no Treino, então a pontuação geral começa de onde o recorde estava.
async function migrateLegacy() {
  const flag = await sql`INSERT INTO settings (key, value) VALUES (${'ritmo_tracks_v1'}, ${'1'}) ON CONFLICT (key) DO NOTHING RETURNING key`;
  if (!flag.length) return;
  await sql`INSERT INTO ritmo_scores (user_id, track, score, created_at)
            SELECT user_id, ${'treino'}, MAX(score), MAX(created_at) FROM scores WHERE game = ${'ritmo'} AND user_id IS NOT NULL GROUP BY user_id`;
}

module.exports = { songs, checkSong, recordSong, overview, boards, bestsOf, maxScore, migrateLegacy, TREINO };
