// Jogos diários (aba "Jogos diários" do menu): Dueto, Quarteto, Contexto, Conexões e Alvo. O Termo também é diário,
// mas tem as rotas e a tabela dele em lib/rounds.js (veio antes).
// Igual ao Termo: o desafio do dia é o mesmo pra todo mundo e a resposta fica SÓ aqui. A página manda cada jogada
// e recebe o resultado dela (cores, posição, grupo certo); a resposta só sai quando a partida acaba. A pontuação
// é calculada aqui e quem grava é o servidor (o POST /api/scores recusa esses jogos). Uma partida por pessoa por dia.
const fs = require('node:fs');
const path = require('node:path');
const { sql, bool, num } = require('./store');
const { seededShuffle } = require('../public/js/daily.js');
const { TERMO_ANSWERS } = require('./words');
const { CONEXOES } = require('./conexoes');
const { today } = require('./flair');
const { termoSecret, termoValidSet, termoEvaluate } = require('./rounds');

const fail = (status, message) => Object.assign(new Error(message), { status });
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const hashSeed = (...parts) => {
  let h = 2166136261;
  for (const c of parts.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
// gerador com semente (mesmo do daily.js): sorteios do dia iguais pra todo mundo
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const timeBonus = (secs, per) => Math.max(0, 99 - Math.floor(secs / per));

/* ---------- partida do dia (uma linha por pessoa, jogo e dia) ---------- */
async function loadPlay(userId, game, day) {
  const [r] = await sql`SELECT * FROM daily_plays WHERE user_id = ${userId} AND game = ${game} AND day = ${day}`;
  return r ? { st: JSON.parse(r.state), raw: r.state, startedAt: num(r.started_at), over: bool(r.finished), won: bool(r.won), score: num(r.score) } : null;
}
// grava só se ninguém mexeu no meio (duas abas ao mesmo tempo): a linha antiga tem que estar igual à que foi lida
async function savePlay(userId, game, day, prev, next) {
  const state = JSON.stringify(next.st);
  const rows = prev
    ? await sql`UPDATE daily_plays SET state = ${state}, finished = ${next.over}, won = ${next.won}, score = ${next.score}
                WHERE user_id = ${userId} AND game = ${game} AND day = ${day} AND state = ${prev.raw} AND finished = ${false} RETURNING day`
    : await sql`INSERT INTO daily_plays (user_id, game, day, state, started_at, finished, won, score)
                VALUES (${userId}, ${game}, ${day}, ${state}, ${next.startedAt}, ${next.over}, ${next.won}, ${next.score})
                ON CONFLICT (user_id, game, day) DO NOTHING RETURNING day`;
  if (!rows.length) throw fail(409, 'Essa jogada já foi enviada em outra aba. Abra o jogo de novo.');
}
// jogou hoje antes de existir a linha? (só o Termo tinha isso; aqui é sempre uma partida nova)
const fresh = st => ({ st, raw: null, startedAt: Date.now(), over: false, won: false, score: 0 });

/* ---------- Dueto e Quarteto: 2 ou 4 palavras do Termo ao mesmo tempo ---------- */
const MULTI = { dueto: { n: 2, rows: 7, per: 6 }, quarteto: { n: 4, rows: 9, per: 12 } };
const LEN = 5;
function multiWords(game, day) {
  const termo = norm(termoSecret(day));
  const pool = TERMO_ANSWERS.filter(w => norm(w) !== termo);
  return seededShuffle(pool, hashSeed(game, day)).slice(0, MULTI[game].n);
}
function multiView(game, day, p) {
  const { n, rows } = MULTI[game], words = multiWords(game, day), guesses = p.st.guesses;
  const boards = words.map(secret => {
    const answer = norm(secret);
    const hit = guesses.indexOf(answer);
    const upto = hit < 0 ? guesses.length : hit + 1;
    return {
      solved: hit >= 0,
      rows: guesses.slice(0, upto).map(g => { const res = termoEvaluate(g, answer); return { guess: g, res, letters: [...g].map((ch, i) => (res[i] === 'g' ? secret[i] : ch)) }; }),
      word: p.over || hit >= 0 ? secret : null,
    };
  });
  return { game, day, n, rows, len: LEN, guesses, boards, over: p.over, won: p.won, score: p.score || 0 };
}
async function multiGuess(user, game, day, p, body) {
  const { rows, per } = MULTI[game];
  const guess = norm(body.guess || '').replace(/[^A-Z]/g, '');
  if (guess.length !== LEN) throw fail(400, 'Faltam letras');
  if (!termoValidSet().has(guess)) throw fail(422, 'Essa palavra não está na lista');
  const st = { guesses: [...p.st.guesses, guess] };
  const answers = multiWords(game, day).map(norm);
  const won = answers.every(a => st.guesses.includes(a));
  const over = won || st.guesses.length >= rows;
  const startedAt = p.raw ? p.startedAt : Date.now();
  const score = won ? (rows + 1 - st.guesses.length) * 100 + timeBonus((Date.now() - startedAt) / 1000, per) : 0;
  return { st, over, won, score, startedAt };
}

/* ---------- Contexto: a palavra secreta por proximidade de sentido ---------- */
// Vocabulário e vetores de palavras gerados por scripts/build-contexto.py (vetores do spaCy, sem API externa).
// A posição de cada palavra = quantas palavras do vocabulário têm sentido mais perto da secreta do que ela (+1).
let ctx = null;
function ctxData() {
  if (ctx) return ctx;
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/contexto.json'), 'utf8'));
  const buf = fs.readFileSync(path.join(__dirname, 'data/contexto.bin'));
  const vec = new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength), D = meta.dims, N = meta.vocab.length;
  const len = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = i * D; k < i * D + D; k++) s += vec[k] * vec[k]; len[i] = Math.sqrt(s); }
  const lookup = new Map();
  meta.vocab.forEach((w, i) => { const k = norm(w).toLowerCase(); if (!lookup.has(k)) lookup.set(k, i); });
  for (const [k, i] of Object.entries(meta.forms)) if (!lookup.has(k)) lookup.set(k, i);
  ctx = { ...meta, vec, len, D, N, lookup, ranks: new Map() };
  return ctx;
}
const CTX_TOP = 30, CTX_START_HINT = 300;
const ctxSecretIdx = day => { const c = ctxData(); return c.vocab.indexOf(seededShuffle(c.secrets, Math.floor(day / c.secrets.length) * 7919 + 211)[day % c.secrets.length]); };
// posição de cada palavra do vocabulário pra secreta do dia (calcula uma vez por instância, ~20ms)
function ctxRanks(day) {
  const c = ctxData(), q = ctxSecretIdx(day);
  if (c.ranks.has(q)) return c.ranks.get(q);
  const { vec, len, D, N } = c, sim = new Float32Array(N), qo = q * D;
  for (let i = 0; i < N; i++) { let s = 0; const o = i * D; for (let k = 0; k < D; k++) s += vec[o + k] * vec[qo + k]; sim[i] = s / (len[i] * len[q]); }
  sim[q] = 2; // a própria palavra sempre em 1º
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => sim[b] - sim[a]);
  const rank = new Int32Array(N);
  order.forEach((i, k) => { rank[i] = k + 1; });
  const out = { rank, order };
  if (c.ranks.size > 4) c.ranks.clear();
  c.ranks.set(q, out);
  return out;
}
function ctxView(day, p) {
  const c = ctxData(), { rank, order } = ctxRanks(day);
  const guesses = p.st.guesses.map(([i, hint]) => ({ word: c.vocab[i], rank: rank[i], ...(hint && { hint: true }) }));
  return {
    game: 'contexto', day, total: c.N, guesses, hints: p.st.hints, over: p.over, won: p.won, score: p.score || 0,
    word: p.over ? c.vocab[order[0]] : null,
    top: p.over ? order.slice(0, CTX_TOP).map((i, k) => ({ word: c.vocab[i], rank: k + 1 })) : null,
  };
}
async function ctxPlay(user, day, p, body) {
  const c = ctxData(), { rank, order } = ctxRanks(day);
  const st = { guesses: [...p.st.guesses], hints: p.st.hints, gaveUp: false };
  const startedAt = p.raw ? p.startedAt : Date.now();
  const finish = won => {
    const tries = st.guesses.filter(([, h]) => !h).length;
    const score = won ? Math.max(50, 1000 - 8 * (tries - 1) - 40 * st.hints) : 0;
    return { st, over: true, won, score, startedAt };
  };
  if (body.action === 'giveup') { st.gaveUp = true; return finish(false); }
  if (body.action === 'hint') {
    // dica: uma palavra no meio do caminho entre a melhor posição e a secreta (nunca a própria secreta)
    const best = Math.min(CTX_START_HINT * 2, ...st.guesses.map(([i]) => rank[i]));
    const seen = new Set(st.guesses.map(([i]) => i));
    let r = best <= 2 ? 2 : Math.max(2, Math.floor(best / 2));
    while (r < c.N && seen.has(order[r - 1])) r++;
    st.guesses.push([order[r - 1], 1]); st.hints++;
    return { st, over: false, won: false, score: 0, startedAt };
  }
  const word = norm(body.guess || '').toLowerCase().replace(/[^a-z]/g, '');
  if (word.length < 2) throw fail(400, 'Digite uma palavra');
  const i = c.lookup.get(word);
  if (i === undefined) throw fail(422, 'Não conheço essa palavra');
  if (st.guesses.some(([g]) => g === i)) return { repeat: c.vocab[i] };
  st.guesses.push([i, 0]);
  if (rank[i] === 1) return finish(true);
  return { st, over: false, won: false, score: 0, startedAt };
}

/* ---------- Conexões: 16 palavras, 4 grupos escondidos ---------- */
const CX_MISTAKES = 4;
function cxPuzzle(day) {
  const r = rng(hashSeed('conexoes', day)), pick = list => list[Math.floor(r() * list.length)];
  const groups = [], temas = new Set();
  for (const nivel of [1, 2, 3, 4]) {
    const g = pick(CONEXOES.filter(x => x.nivel === nivel && !temas.has(x.tema)));
    temas.add(g.tema);
    groups.push({ nome: g.nome, nivel, palavras: seededShuffle(g.palavras, hashSeed('cx', day, nivel)).slice(0, 4) });
  }
  return { groups, board: seededShuffle(groups.flatMap(g => g.palavras), hashSeed('cxb', day)) };
}
function cxView(day, p) {
  const { groups, board } = cxPuzzle(day), found = p.st.found;
  const show = p.over ? [...found, ...groups.map((_, k) => k).filter(k => !found.includes(k))] : found;
  const solved = show.map(k => ({ ...groups[k], found: found.includes(k) }));
  const done = new Set(found.flatMap(k => groups[k].palavras));
  return { game: 'conexoes', day, words: p.over ? [] : board.filter(w => !done.has(w)), solved, mistakes: p.st.mistakes, max: CX_MISTAKES, tries: p.st.tries, over: p.over, won: p.won, score: p.score || 0 };
}
async function cxPlay(user, day, p, body) {
  const { groups, board } = cxPuzzle(day);
  const pick = Array.isArray(body.words) ? [...new Set(body.words.map(String))] : [];
  if (pick.length !== 4 || !pick.every(w => board.includes(w))) throw fail(400, 'Escolha 4 palavras do quadro');
  const st = { found: [...p.st.found], mistakes: p.st.mistakes, tries: [...p.st.tries] };
  if (pick.some(w => st.found.some(k => groups[k].palavras.includes(w)))) throw fail(400, 'Essa palavra já está num grupo');
  const key = [...pick].sort().join(',');
  if (st.tries.includes(key)) return { repeat: true };
  st.tries.push(key);
  const startedAt = p.raw ? p.startedAt : Date.now();
  const k = groups.findIndex(g => pick.every(w => g.palavras.includes(w)));
  let result;
  if (k >= 0) { st.found.push(k); result = { ok: true, group: groups[k].nome, nivel: groups[k].nivel }; }
  else {
    st.mistakes++;
    // "falta uma": 3 das 4 são do mesmo grupo
    result = { ok: false, oneAway: groups.some(g => pick.filter(w => g.palavras.includes(w)).length === 3) };
  }
  const won = st.found.length === 4, over = won || st.mistakes >= CX_MISTAKES;
  const score = won ? (CX_MISTAKES + 1 - st.mistakes) * 100 + timeBonus((Date.now() - startedAt) / 1000, 3) : 0;
  return { st, over, won, score, startedAt, result };
}

/* ---------- Alvo: chegar no número do dia com 6 números e + − × ÷ ---------- */
const OPS = { '+': (a, b) => a + b, '-': (a, b) => (a > b ? a - b : null), '*': (a, b) => a * b, '/': (a, b) => (b && a % b === 0 ? a / b : null) };
function alvoPuzzle(day) {
  const r = rng(hashSeed('alvo', day)), int = (a, b) => a + Math.floor(r() * (b - a + 1));
  for (;;) {
    const big = seededShuffle([25, 50, 75, 100], hashSeed('alvo-g', day, int(0, 999))).slice(0, 2);
    const small = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hashSeed('alvo-p', day, int(0, 999))).slice(0, 4);
    const nums = [...big, ...small].sort((a, b) => a - b);
    // monta uma conta aleatória usando de 4 a 6 números; o resultado (101–999) é o alvo e a conta é a solução mostrada no fim
    const pool = seededShuffle(nums, hashSeed('alvo-s', day, int(0, 999))).map(v => ({ v, txt: String(v) }));
    const use = int(4, 6);
    let cur = pool[0];
    for (let i = 1; i < use; i++) {
      const b = pool[i], ops = seededShuffle(Object.keys(OPS), hashSeed('alvo-o', day, i, int(0, 999)));
      const op = ops.find(o => { const v = OPS[o](cur.v, b.v); return v !== null && v > 0 && !(o === '*' && (b.v === 1 || cur.v === 1)) && !(o === '/' && b.v === 1); });
      if (!op) break;
      cur = { v: OPS[op](cur.v, b.v), txt: `(${cur.txt} ${op.replace('*', '×').replace('/', '÷').replace('-', '−')} ${b.txt})` };
    }
    if (cur.v >= 101 && cur.v <= 999 && !nums.includes(cur.v)) return { nums, target: cur.v, solution: cur.txt.replace(/^\((.*)\)$/, '$1') };
  }
}
/** Confere as contas da página: cada passo usa dois números disponíveis (os 6 ou resultados anteriores) uma vez só.
 *  Devolve os resultados das contas (o que vale é o mais perto do alvo). */
function alvoCheck(nums, steps) {
  if (!Array.isArray(steps) || !steps.length || steps.length > 5) throw fail(400, 'Faça pelo menos uma conta');
  const pool = [...nums], results = [];
  for (const s of steps) {
    if (!Array.isArray(s) || s.length !== 3) throw fail(400, 'Contas inválidas');
    const [a, op, b] = s;
    const ia = pool.indexOf(a);
    if (ia < 0 || !OPS[op]) throw fail(400, 'Conta com número que não existe');
    pool.splice(ia, 1);
    const ib = pool.indexOf(b);
    if (ib < 0) throw fail(400, 'Conta com número que não existe');
    pool.splice(ib, 1);
    const v = OPS[op](a, b);
    if (v === null || v <= 0 || !Number.isInteger(v)) throw fail(400, 'Só vale conta com resultado inteiro e positivo');
    pool.push(v); results.push(v);
  }
  return results;
}
function alvoView(day, p) {
  const { nums, target, solution } = alvoPuzzle(day);
  return { game: 'alvo', day, nums, target, over: p.over, won: p.won, score: p.score || 0, result: p.st.result || null, solution: p.over ? solution : null, startedAt: p.startedAt };
}
async function alvoPlay(user, day, p, body) {
  const { nums, target } = alvoPuzzle(day);
  const results = alvoCheck(nums, body.steps);
  const value = results.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best));
  const diff = Math.abs(value - target), secs = (Date.now() - p.startedAt) / 1000;
  const score = diff === 0 ? 500 + timeBonus(secs, 3) : diff < 10 ? (10 - diff) * 40 : 0;
  const st = { result: { value, diff, steps: body.steps } };
  return { st, over: true, won: score > 0, score, startedAt: p.startedAt };
}

/* ---------- comum ---------- */
const DAILY_GAMES = {
  dueto: { init: () => ({ guesses: [] }), view: (d, p) => multiView('dueto', d, p), play: (u, d, p, b) => multiGuess(u, 'dueto', d, p, b) },
  quarteto: { init: () => ({ guesses: [] }), view: (d, p) => multiView('quarteto', d, p), play: (u, d, p, b) => multiGuess(u, 'quarteto', d, p, b) },
  contexto: { init: () => ({ guesses: [], hints: 0 }), view: ctxView, play: ctxPlay },
  conexoes: { init: () => ({ found: [], mistakes: 0, tries: [] }), view: cxView, play: cxPlay },
  // o tempo do Alvo conta desde a hora em que os números aparecem: a partida é criada ao abrir
  alvo: { init: () => ({}), view: alvoView, play: alvoPlay, createOnOpen: true },
};
const done = (status = 409) => fail(status, 'Você já jogou esse hoje. Volte amanhã!');

async function dailyState(user, game) {
  const g = DAILY_GAMES[game];
  if (!g) throw fail(404, 'Jogo não encontrado.');
  const day = today();
  let p = await loadPlay(user.id, game, day);
  if (!p && g.createOnOpen) {
    const f = fresh(g.init());
    await savePlay(user.id, game, day, null, f).catch(() => {});
    p = await loadPlay(user.id, game, day);
  }
  return g.view(day, p || fresh(g.init()));
}
/** Uma jogada. Devolve { view, result?, finalScore? } — finalScore quando ganhou (o router grava a partida). */
async function dailyPlay(user, game, body = {}) {
  const g = DAILY_GAMES[game];
  if (!g) throw fail(404, 'Jogo não encontrado.');
  const day = today();
  const prev = await loadPlay(user.id, game, day);
  if (prev?.over) throw done();
  const p = prev || fresh(g.init());
  const next = await g.play(user, day, p, body);
  if (next.repeat) return { view: g.view(day, p), result: { repeat: next.repeat } };
  await savePlay(user.id, game, day, prev, next);
  const saved = { ...next, raw: JSON.stringify(next.st) };
  return { view: g.view(day, saved), result: next.result, finalScore: next.won ? next.score : null };
}
/** Como está cada jogo diário de hoje pra essa pessoa (cards da aba). */
async function dailyStatus(user) {
  const day = today();
  const rows = await sql`SELECT game, finished, won, score, state FROM daily_plays WHERE user_id = ${user.id} AND day = ${day}`;
  const out = {};
  for (const r of rows) out[r.game] = { started: true, over: bool(r.finished), won: bool(r.won), score: num(r.score) };
  const [t] = await sql`SELECT finished, won, score, guesses FROM termo_plays WHERE user_id = ${user.id} AND day = ${day}`;
  if (t) out.termo = { started: true, over: bool(t.finished), won: bool(t.won), score: num(t.score), tries: JSON.parse(t.guesses).length };
  return { day, games: out };
}

module.exports = { DAILY_GAMES, dailyState, dailyPlay, dailyStatus, multiWords, ctxSecretIdx, ctxData, cxPuzzle, alvoPuzzle, alvoCheck };
