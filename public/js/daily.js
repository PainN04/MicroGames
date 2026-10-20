// Sorteio do jogo do dia — compartilhado entre a página (script comum) e o servidor (require em lib/flair.js),
// então os dois sempre concordam sobre qual é o desafio de cada dia.
// Um jogo por dia, igual pra todo mundo. A cada ciclo passa por todos os jogos, numa ordem embaralhada diferente.
// Jogo novo só entra no sorteio a partir do dia em que foi lançado (assim os dias que já passaram não mudam de jogo).
// `picks[dia] = { game }`: o vencedor do desafio de ontem escolhe o jogo de amanhã (vale por cima do sorteio).
const DAILY_SINCE = { sudoku: 20745, pong: 20746, forca: 20746, ligue4: 20746, corredor: 20746, comecome: 20746, termo: 20746, quiz: 20747 }; // 19/10/2026, 20/10/2026 e 21/10/2026 (número do dia desde 1970)

function seededShuffle(list, seed) {
  const a = [...list];
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function scheduledGame(ids, i, picks = {}) {
  const chosen = picks[i] && picks[i].game;
  if (chosen && ids.includes(chosen)) return chosen;
  const roster = ids.filter(id => !(id in DAILY_SINCE) || i >= DAILY_SINCE[id]).sort();
  return seededShuffle(roster, Math.floor(i / roster.length) * 7919 + 13)[i % roster.length];
}

if (typeof module !== 'undefined' && module.exports) module.exports = { DAILY_SINCE, seededShuffle, scheduledGame };
