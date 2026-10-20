// Regras de pontuação compartilhadas entre server.js (rede local) e api/scores.js (Vercel).
const GAMES = ['reflexo', 'clique', 'digitacao', 'memoria', 'mira', 'snake', 'matematica', 'voa', 'chuva', 'cores', 'numeros', 'toupeira', 'blocos',
  'tijolos', 'g2048', 'torre', 'invasores', 'minado', 'ritmo', 'anagrama', 'sudoku', 'pong', 'forca', 'ligue4', 'corredor', 'comecome', 'termo', 'quiz'];

// Faixa possível de pontuação de cada jogo — fora disso é request forjado.
const LIMITS = { voa: [0, 1500], chuva: [0, 1800], cores: [0, 600], matematica: [0, 800], numeros: [3, 600], toupeira: [0, 900], blocos: [0, 5000000],
  tijolos: [0, 1000000], g2048: [0, 500000], torre: [0, 2000], invasores: [0, 2000000], minado: [3, 3600], ritmo: [0, 200000], anagrama: [0, 1500], sudoku: [40, 7200],
  pong: [0, 500], forca: [0, 3000], ligue4: [0, 3000], corredor: [0, 200000], comecome: [0, 500000], termo: [100, 699], quiz: [0, 600],
  // os primeiros jogos também: Reflexo abaixo de 80 ms de média é mais rápido que um humano; Mira com 20 alvos em menos de 3s idem
  reflexo: [80, 10000], mira: [3, 600], snake: [0, 5000], digitacao: [0, 120], memoria: [0, 200] };

// Anti-autoclicker do Clique Maluco. Mesma regra do public/js/games/clique.js (GAMES.clique.check).
// proof = intervalos em ms entre cliques consecutivos. Página antiga (sem proof) só passa pelo limite de CPS.
const MAX_CPS = 20;
function cheatReason(game, score, proof) {
  const range = LIMITS[game];
  if (range && (score < range[0] || score > range[1])) return 'pontuação impossível';
  if (game !== 'clique') return null;
  if (score > MAX_CPS * 10) return 'cliques demais pra um humano';
  if (!Array.isArray(proof) || !proof.every(n => Number.isFinite(n) && n >= 0)) return null;
  if (proof.length >= 50) {
    const mean = proof.reduce((a, b) => a + b, 0) / proof.length;
    const sd = Math.sqrt(proof.reduce((a, b) => a + (b - mean) ** 2, 0) / proof.length);
    if (mean > 0 && sd / mean < 0.05) return 'ritmo regular demais (autoclicker)';
  }
  return null;
}

// Valida o corpo de um POST. Retorna { status, error } se recusado, ou { entry } se ok.
function checkSubmission(body) {
  const { game, player, score, proof } = body || {};
  const name = typeof player === 'string' ? player.trim().slice(0, 16) : '';
  if (!GAMES.includes(game) || !name || typeof score !== 'number' || !Number.isFinite(score)) {
    return { status: 400, error: 'dados inválidos' };
  }
  const cheat = cheatReason(game, score, proof);
  if (cheat) {
    console.log(`[anti-cheat] recusado: ${name} / ${game} / ${score} — ${cheat}`);
    return { status: 422, error: cheat };
  }
  return { entry: { game, player: name, score } };
}

// Agrupa linhas { game, name, score, date } no formato que a página espera.
function groupByGame(rows) {
  const out = {};
  for (const r of rows) (out[r.game] ||= []).push({ name: r.name, score: Number(r.score), date: Number(r.date) });
  return out;
}

// Jogos em que ganha o MENOR valor (tempo). O resto: maior valor ganha. Mesmo que `better: 'low'` em public/js/games/.
const LOW_IS_BETTER = new Set(['reflexo', 'mira', 'numeros', 'minado', 'sudoku']);
const isBetter = (game, a, b) => (LOW_IS_BETTER.has(game) ? a < b : a > b);

module.exports = { GAMES, checkSubmission, groupByGame, LOW_IS_BETTER, isBetter };
