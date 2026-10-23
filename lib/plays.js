// Jogos de arcade (Reflexo, Snake, Tijolos, 2048...): a partida roda no navegador, mas quem decide se a pontuação vale
// é o servidor. Ao abrir o jogo a página pede uma partida (POST /api/plays) e recebe um id aleatório; o POST /api/scores
// só aceita pontuação com esse id, uma vez só, da mesma conta e do mesmo jogo. O relógio é o do servidor (hora em que
// a partida foi aberta até a hora do envio), então não dá pra mandar 30 segundos de jogo em 1 segundo nem repetir um
// envio. Cada jogo ainda tem um limite do que cabe nesse tempo (pontos por segundo, duração mínima), e o 2048 manda os
// movimentos: o servidor refaz a partida com a semente dele e a pontuação tem que bater exatamente.
const { randomBytes } = require('node:crypto');
const { sql, num } = require('./store');
const { seededRandom } = require('../public/js/daily.js');
const { today } = require('./flair');
const { checkSong } = require('./ritmo');

const TTL = 6 * 3600_000;     // partida aberta vale 6h (a fila de envio da página reenvia quando a rede volta)
const SLACK = 4;              // segundos de folga: a partida abre no servidor um pouco depois de a página começar
const MAX_PER_WINDOW = 120, WINDOW = 10 * 60_000; // freio: no máximo 120 partidas abertas em 10 min por conta

const fail = (status, message) => Object.assign(new Error(message), { status });
const hashSeed = (...parts) => {
  let h = 2166136261;
  for (const c of parts.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

// Regras por jogo. secs = segundos do relógio do servidor. Devolve o motivo da recusa ou null.
const fixed = dur => (score, secs) => (secs < dur - SLACK ? 'partida mais curta que o tempo do jogo' : null);
const rate = (perSec, base) => (score, secs) => (score > base + perSec * secs ? 'pontos demais pro tempo de jogo' : null);
const none = () => null;
const lasted = (score, secs) => (score > secs + SLACK ? 'tempo maior que a partida' : null); // pontuação = segundos de jogo
const RULES = {
  clique: fixed(10), digitacao: fixed(30), matematica: fixed(30), cores: fixed(30), toupeira: fixed(30),
  // Ritmo: proof = id da música; a pontuação não passa do teto do mapa de notas dela e a partida dura a música toda
  ritmo: (score, secs, proof) => checkSong(proof, score, secs, SLACK),
  // 3 rodadas, cada uma espera de 1,5s a 4s antes do verde: a média em ms não cabe numa partida curta demais
  reflexo: (score, secs) => (secs < 3 * 1.5 + (3 * score) / 1000 - SLACK ? 'partida mais curta que as 3 rodadas' : null),
  // Chuva: a pontuação é o tempo que sobreviveu, então não passa do tempo que a partida ficou aberta
  chuva: lasted,
  // jogos de menor tempo (Mira, Números, Campo Minado, Sudoku): o servidor não tem como saber se você foi mais rápido
  // do que disse — vale a partida de uso único e a faixa possível de lib/rules.js
  mira: none, numeros: none, minado: none, sudoku: none,
  // rodada n da Memória mostra n cores (≥ 0,3s cada): R rodadas levam pelo menos 0,15·R² segundos
  memoria: (score, secs) => (score > 2 + Math.sqrt((secs + SLACK) / 0.15) ? 'rodadas demais pro tempo de jogo' : null),
  snake: rate(10, 20), voa: rate(4, 10), torre: rate(3, 5), pong: rate(2, 3), ligue4: rate(5, 31),
  corredor: rate(120, 200), comecome: rate(600, 3000), invasores: rate(1500, 2000), tijolos: rate(1500, 1000), blocos: rate(8000, 4000),
  g2048: (score, secs, proof, play) => {
    if (typeof proof !== 'string' || !/^[LRUD]{0,5000}$/.test(proof)) return 'movimentos inválidos';
    if (proof.length > 20 * (secs + SLACK)) return 'movimentos demais pro tempo de jogo';
    if (secs > 20 * 60) return 'partida aberta há tempo demais';
    const real = replay2048(play.seed, proof);
    return real === score ? null : 'pontuação não bate com os movimentos';
  },
};
const ARCADE = new Set(Object.keys(RULES));

/* ---------- 2048: o servidor refaz a partida ---------- */
// Mesmo jogo do public/js/games/g2048.js: peça nova numa casa vazia sorteada e vale 2 (90%) ou 4, tudo com a semente
// da partida. Cada letra é um movimento que mexeu o tabuleiro; um movimento que não mexe nada torna a lista inválida.
const N = 4;
const LINES = Object.fromEntries(['L', 'R', 'U', 'D'].map(dir => [dir, Array.from({ length: N }, (_, a) => Array.from({ length: N }, (_, b) => {
  if (dir === 'L') return a * N + b;
  if (dir === 'R') return a * N + (N - 1 - b);
  if (dir === 'U') return b * N + a;
  return (N - 1 - b) * N + a;
}))]));
function replay2048(seed, moves) {
  const rnd = seededRandom(seed), g = Array(N * N).fill(0);
  let score = 0;
  const add = () => {
    const empty = g.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
    if (!empty.length) return;
    const i = empty[Math.floor(rnd() * empty.length)];
    g[i] = rnd() < 0.9 ? 2 : 4;
  };
  add(); add();
  for (const dir of moves) {
    let moved = false;
    for (const idx of LINES[dir]) {
      const vals = idx.map(i => g[i]).filter(Boolean), out = [];
      for (let k = 0; k < vals.length; k++) {
        if (vals[k] === vals[k + 1]) { out.push(vals[k] * 2); score += vals[k] * 2; k++; } else out.push(vals[k]);
      }
      idx.forEach((i, k) => { const v = out[k] || 0; if (g[i] !== v) moved = true; g[i] = v; });
    }
    if (!moved) return null;
    add();
  }
  return score;
}

/* ---------- partidas ---------- */

/**
 * Abre uma partida de arcade pra conta. Devolve { id, seed } (a semente só importa pro 2048).
 * daily = é o desafio do dia: a semente sai do dia + nº da partida de hoje, igual pra todo mundo.
 */
async function startPlay(user, game, { daily = false } = {}) {
  if (!ARCADE.has(game)) throw fail(400, 'Jogo inválido.');
  const now = Date.now(), day = today();
  await sql`DELETE FROM arcade_plays WHERE created_at < ${now - TTL}`;
  const [{ n }] = await sql`SELECT COUNT(*) AS n FROM arcade_plays WHERE user_id = ${user.id} AND created_at >= ${now - WINDOW}`;
  if (Number(n) >= MAX_PER_WINDOW) throw fail(429, 'Partidas demais em pouco tempo. Espere uns minutos.');
  let seed = randomBytes(4).readUInt32BE(0);
  if (daily) {
    const [{ k }] = await sql`SELECT COUNT(*) AS k FROM arcade_plays WHERE user_id = ${user.id} AND game = ${game} AND daily_day = ${day}`;
    seed = hashSeed('daily', game, day, Number(k));
  }
  const id = randomBytes(18).toString('base64url');
  await sql`INSERT INTO arcade_plays (id, user_id, game, created_at, seed, daily_day, used)
            VALUES (${id}, ${user.id}, ${game}, ${now}, ${seed}, ${daily ? day : null}, ${false})`;
  return { id, seed };
}

/**
 * Confere a pontuação de uma partida de arcade e gasta a partida (vale uma vez só, mesmo se for recusada).
 * Devolve o motivo da recusa ou null.
 */
async function checkPlay(user, game, score, proof, playId) {
  if (!ARCADE.has(game)) return null;
  if (typeof playId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(playId)) return 'partida não foi aberta no servidor';
  // UPDATE ... WHERE used = false: dois envios ao mesmo tempo com o mesmo id, só um passa
  const [row] = await sql`UPDATE arcade_plays SET used = ${true}
                          WHERE id = ${playId} AND user_id = ${user.id} AND game = ${game} AND used = ${false} RETURNING created_at, seed`;
  if (!row) return 'partida inválida ou já usada';
  const secs = (Date.now() - num(row.created_at)) / 1000;
  if (secs * 1000 > TTL) return 'partida expirou';
  return RULES[game](score, secs, proof, { seed: num(row.seed) });
}

module.exports = { ARCADE, startPlay, checkPlay, replay2048, RULES, SLACK };
