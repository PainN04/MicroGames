// Jogos diários (aba "Jogos diários" do menu): Dueto, Quarteto, Octeto, Contexto, Conexões, Alvo, Soletra, Senha,
// Equação, Bandeira e Caça-palavras. O Termo também é diário,
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

/* ---------- Dueto, Quarteto e Octeto: 2, 4 ou 8 palavras do Termo ao mesmo tempo ---------- */
const MULTI = { dueto: { n: 2, rows: 7, per: 6 }, quarteto: { n: 4, rows: 9, per: 12 }, octeto: { n: 8, rows: 13, per: 24 } };
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

/* ---------- Soletra: palavras com as 7 letras da colmeia, sempre com a do meio ---------- */
// Palavras que o corretor do LibreOffice aceita (com plural, feminino e conjugação) e que aparecem em legendas de filmes
// (scripts/build-soletra.py). lib/data/soletra.json tem as 25 mil mais usadas, em ordem de frequência: são as palavras
// do dia, que contam no "achadas/total". lib/data/soletra-extra.txt tem outras 25 mil, menos comuns: valem pontos como
// palavra extra, mas não entram no total. Acento não conta: "está" entra com E S T A.
const lower = s => norm(s).toLowerCase();
let sol = null;
function solData() {
  if (sol) return sol;
  const words = [], seen = new Set(), extra = new Map();
  for (const w of JSON.parse(fs.readFileSync(path.join(__dirname, 'data/soletra.json'), 'utf8'))) {
    const k = lower(w);
    if (/^[a-z]{4,}$/.test(k) && !seen.has(k)) { seen.add(k); words.push({ k, w, set: new Set(k) }); }
  }
  for (const w of fs.readFileSync(path.join(__dirname, 'data/soletra-extra.txt'), 'utf8').split('\n')) {
    const k = lower(w.trim());
    if (/^[a-z]{4,}$/.test(k) && !seen.has(k) && !extra.has(k)) extra.set(k, w.trim());
  }
  // palavra-base do dia: comum (entre as 4000 primeiras) e com exatamente 7 letras diferentes
  sol = { words, extra, bases: words.slice(0, 4000).filter(x => x.set.size === 7) };
  return sol;
}
const SOL_MIN = 15, SOL_MAX = 60;
function solPuzzle(day) {
  const { words, bases } = solData();
  // uma palavra-base por dia, passando por todas numa ordem embaralhada; se nenhuma letra do meio der de 15 a 60
  // palavras, sorteia outra base
  const r = rng(hashSeed('soletra', day));
  let base = seededShuffle(bases, Math.floor(day / bases.length) * 7919 + 31)[day % bases.length];
  for (;;) {
    for (const center of seededShuffle([...base.set], hashSeed('sol-c', day))) {
      const answers = words.filter(x => x.k.includes(center) && [...x.set].every(c => base.set.has(c)));
      if (answers.length < SOL_MIN || answers.length > SOL_MAX) continue;
      const outer = seededShuffle([...base.set].filter(c => c !== center), hashSeed('sol-o', day));
      return { center, outer, answers: answers.map(x => ({ k: x.k, w: x.w, pangram: x.set.size === 7 })) };
    }
    base = bases[Math.floor(r() * bases.length)];
  }
}
// uma colmeia qualquer com as palavras do dia que cabem nela
function solHive(center, outer) {
  const ok = new Set([center, ...outer]);
  const answers = solData().words.filter(x => x.k.includes(center) && [...x.set].every(c => ok.has(c)));
  return { center, outer, answers: answers.map(x => ({ k: x.k, w: x.w, pangram: x.set.size === 7 })) };
}
// palavra aceita na colmeia do dia: uma das do dia ou uma extra (que vale ponto mas não conta no total)
function solWord({ center, outer, answers }, k) {
  const a = answers.find(x => x.k === k);
  if (a) return a;
  const w = solData().extra.get(k);
  if (!w || !k.includes(center) || ![...k].every(c => c === center || outer.includes(c))) return null;
  return { k, w, pangram: new Set(k).size === 7, extra: true };
}
const solPoints = a => (a.k.length === 4 ? 1 : a.k.length) + (a.pangram ? 7 : 0);
function solView(day, p) {
  const puzzle = solPuzzle(day), { center, outer, answers } = puzzle;
  const found = p.st.found.map(k => solWord(puzzle, k)).filter(Boolean)
    .map(a => ({ word: a.w, points: solPoints(a), pangram: a.pangram, extra: !!a.extra }));
  return {
    game: 'soletra', day, center, outer, found, hits: found.filter(f => !f.extra).length, count: answers.length,
    max: answers.reduce((t, a) => t + solPoints(a), 0), points: found.reduce((t, f) => t + f.points, 0), over: p.over, won: p.won, score: p.score || 0,
    all: p.over ? [...answers.map(a => ({ word: a.w, pangram: a.pangram, found: p.st.found.includes(a.k) })),
      ...found.filter(f => f.extra).map(f => ({ word: f.word, pangram: f.pangram, found: true, extra: true }))] : null,
  };
}
async function solPlay(user, day, p, body) {
  const puzzle = solPuzzle(day), { center, outer, answers } = puzzle;
  const st = { found: p.st.found.filter(k => solWord(puzzle, k)) };
  const startedAt = p.raw ? p.startedAt : Date.now();
  const total = () => st.found.reduce((t, k) => t + solPoints(solWord(puzzle, k)), 0);
  if (body.action === 'end') { const score = total(); return { st, over: true, won: score > 0, score, startedAt }; }
  const k = lower(body.word || '').replace(/[^a-z]/g, '');
  if (k.length < 4) throw fail(400, 'Mínimo de 4 letras');
  if (![...k].every(c => c === center || outer.includes(c))) throw fail(422, 'Tem letra fora da colmeia');
  if (!k.includes(center)) throw fail(422, `Falta a letra do meio (${center.toUpperCase()})`);
  const a = solWord(puzzle, k);
  if (!a) throw fail(422, 'Não está na lista');
  if (st.found.includes(k)) return { repeat: a.w };
  st.found.push(k);
  const over = answers.every(x => st.found.includes(x.k));
  return { st, over, won: over, score: over ? total() : 0, startedAt, result: { word: a.w, points: solPoints(a), pangram: a.pangram, extra: !!a.extra } };
}

/* ---------- Senha: descobrir a sequência de 4 cores (pode repetir cor) ---------- */
const SENHA = { len: 4, colors: 6, rows: 8 };
const senhaCode = day => { const r = rng(hashSeed('senha', day)); return Array.from({ length: SENHA.len }, () => Math.floor(r() * SENHA.colors)); };
function senhaEval(guess, code) {
  let exact = 0; const a = {}, b = {};
  guess.forEach((g, i) => { if (g === code[i]) exact++; else { a[g] = (a[g] || 0) + 1; b[code[i]] = (b[code[i]] || 0) + 1; } });
  const near = Object.keys(a).reduce((t, c) => t + Math.min(a[c], b[c] || 0), 0);
  return { exact, near };
}
function senhaView(day, p) {
  const code = senhaCode(day);
  return { game: 'senha', day, ...SENHA, guesses: p.st.guesses.map(g => ({ guess: g, ...senhaEval(g, code) })), over: p.over, won: p.won, score: p.score || 0, code: p.over ? code : null };
}
async function senhaPlay(user, day, p, body) {
  const g = body.guess;
  if (!Array.isArray(g) || g.length !== SENHA.len || !g.every(c => Number.isInteger(c) && c >= 0 && c < SENHA.colors)) throw fail(400, 'Escolha as 4 cores');
  const st = { guesses: [...p.st.guesses, g] };
  const startedAt = p.raw ? p.startedAt : Date.now();
  const won = senhaEval(g, senhaCode(day)).exact === SENHA.len, over = won || st.guesses.length >= SENHA.rows;
  const score = won ? (SENHA.rows + 1 - st.guesses.length) * 100 + timeBonus((Date.now() - startedAt) / 1000, 3) : 0;
  return { st, over, won, score, startedAt };
}

/* ---------- Equação: a conta do dia com 8 símbolos (Termo com números) ---------- */
const EQ = { len: 8, rows: 6 };
/** Calcula "12+3*4" com precedência (× e ÷ antes), só inteiros; null se a conta não vale (0 à esquerda, divisão quebrada...). */
function eqCalc(expr) {
  const toks = expr.match(/\d+|[-+*/]/g);
  if (!toks || toks.join('') !== expr || toks.length % 2 === 0) return null;
  const nums = [], ops = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (i % 2 === 0) { if (!/^\d+$/.test(t) || (t.length > 1 && t[0] === '0')) return null; nums.push(+t); }
    else if (/^[-+*/]$/.test(t)) ops.push(t); else return null;
  }
  const terms = [nums[0]], signs = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i], n = nums[i + 1];
    if (o === '*') terms.push(terms.pop() * n);
    else if (o === '/') { const a = terms.pop(); if (!n || a % n) return null; terms.push(a / n); }
    else { signs.push(o); terms.push(n); }
  }
  return terms.reduce((t, x, i) => (i === 0 ? x : signs[i - 1] === '+' ? t + x : t - x), 0);
}
/** Confere um palpite: "lado esquerdo = número", 8 símbolos, conta certa. Devolve a mensagem de erro ou null. */
function eqInvalid(g) {
  if (g.length !== EQ.len) return 'Use os 8 espaços';
  if (!/^[\d+\-*/=]+$/.test(g)) return 'Só números, + − × ÷ e =';
  const parts = g.split('=');
  if (parts.length !== 2) return 'Precisa de um = (só um)';
  const [l, r] = parts;
  if (!/^\d+$/.test(r) || (r.length > 1 && r[0] === '0')) return 'Depois do = vem só o resultado';
  if (!/[-+*/]/.test(l)) return 'Faça uma conta antes do =';
  const v = eqCalc(l);
  if (v === null) return 'Essa conta não vale (sem zero à esquerda e divisão exata)';
  if (v !== +r) return 'A conta não fecha';
  return null;
}
function eqSecret(day) {
  const r = rng(hashSeed('equacao', day)), int = (a, b) => a + Math.floor(r() * (b - a + 1));
  for (;;) {
    // metade dos dias com 2 números (ex.: 47+38=85), metade com 3 (ex.: 9*8-3=69)
    const n = r() < 0.5 ? 2 : 3, parts = [String(int(1, n === 2 ? 99 : 20))];
    for (let i = 1; i < n; i++) parts.push('+-*/'[int(0, 3)], String(int(1, n === 2 ? 99 : 12)));
    const l = parts.join(''), v = eqCalc(l);
    if (v === null || v < 0) continue;
    const eq = `${l}=${v}`;
    // sem conta boba (×1, ÷1) e com cara de desafio: pelo menos 4 algarismos diferentes
    if (eq.length === EQ.len && !/[*/]1(?!\d)/.test(eq) && new Set(eq.replace(/\D/g, '')).size >= 4) return eq;
  }
}
function eqEvaluate(guess, answer) {
  const res = Array(guess.length).fill('x'), left = {};
  for (let i = 0; i < guess.length; i++) { if (guess[i] === answer[i]) res[i] = 'g'; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
  for (let i = 0; i < guess.length; i++) if (res[i] === 'x' && left[guess[i]] > 0) { res[i] = 'y'; left[guess[i]]--; }
  return res;
}
function eqView(day, p) {
  const answer = eqSecret(day);
  return { game: 'equacao', day, ...EQ, guesses: p.st.guesses.map(g => ({ guess: g, res: eqEvaluate(g, answer) })), over: p.over, won: p.won, score: p.score || 0, answer: p.over ? answer : null };
}
async function eqPlay(user, day, p, body) {
  const g = String(body.guess || '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s/g, '');
  const bad = eqInvalid(g);
  if (bad) throw fail(422, bad);
  const st = { guesses: [...p.st.guesses, g] };
  const startedAt = p.raw ? p.startedAt : Date.now();
  const won = g === eqSecret(day), over = won || st.guesses.length >= EQ.rows;
  const score = won ? (EQ.rows + 1 - st.guesses.length) * 100 + timeBonus((Date.now() - startedAt) / 1000, 3) : 0;
  return { st, over, won, score, startedAt };
}

/* ---------- Bandeira: qual é o país? Cada palpite diz a distância e a direção ---------- */
// Os países da ONU (lib/data/bandeiras.json, de scripts/build-diarios.js): nome, capital, coordenadas e o desenho
// da bandeira (o SVG vai dentro da resposta, sem nome de arquivo nem id que entreguem o país).
let flags = null;
function flagData() {
  if (flags) return flags;
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/bandeiras.json'), 'utf8'));
  const key = s => lower(s).replace(/[^a-z]/g, '');
  const byKey = new Map();
  list.forEach((c, i) => [c.nome, ...c.alias].forEach(n => byKey.set(key(n), i)));
  flags = { list, byKey, key };
  return flags;
}
const FLAG_ROWS = 6;
const flagIdx = day => { const { list } = flagData(); return seededShuffle(list.map((_, i) => i), Math.floor(day / list.length) * 7919 + 97)[day % list.length]; };
function flagDistance(a, b) {
  const rad = x => (x * Math.PI) / 180, R = 6371;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const km = Math.round(2 * R * Math.asin(Math.sqrt(h)));
  const y = Math.sin(dLng) * Math.cos(rad(b.lat)), x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { km, dir: ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8], pct: Math.max(0, Math.round(100 - (km / 20015) * 100)) };
}
function flagView(day, p) {
  const { list } = flagData(), ans = list[flagIdx(day)];
  const guesses = p.st.guesses.map(i => (i === flagIdx(day) ? { nome: list[i].nome, km: 0, dir: null, pct: 100 } : { nome: list[i].nome, ...flagDistance(list[i], ans) }));
  const wrong = guesses.filter(g => g.km || g.dir).length;
  return {
    game: 'bandeira', day, rows: FLAG_ROWS, svg: ans.svg, names: list.map(c => c.nome).sort((a, b) => a.localeCompare(b, 'pt')), guesses,
    continente: wrong >= 2 || p.over ? ans.continente : null, capital: wrong >= 4 || p.over ? ans.capital : null,
    over: p.over, won: p.won, score: p.score || 0, answer: p.over ? ans.nome : null,
  };
}
async function flagPlay(user, day, p, body) {
  const { byKey, key } = flagData();
  const i = byKey.get(key(body.guess || ''));
  if (i === undefined) throw fail(422, 'Não conheço esse país');
  if (p.st.guesses.includes(i)) return { repeat: flagData().list[i].nome };
  const st = { guesses: [...p.st.guesses, i] };
  const startedAt = p.raw ? p.startedAt : Date.now();
  const won = i === flagIdx(day), over = won || st.guesses.length >= FLAG_ROWS;
  const score = won ? (FLAG_ROWS + 1 - st.guesses.length) * 100 + timeBonus((Date.now() - startedAt) / 1000, 3) : 0;
  return { st, over, won, score, startedAt };
}

/* ---------- Caça-palavras: 8 palavras de 2 temas escondidas num quadro 10×10 ---------- */
const CP = { size: 10, words: 8 };
const CP_DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
function cpPuzzle(day) {
  const r = rng(hashSeed('caca', day)), S = CP.size;
  const pool = CONEXOES.filter(g => !/_|Palíndromos|Escondem/.test(g.nome))
    .map(g => ({ nome: g.nome, palavras: [...new Set(g.palavras.map(norm))].filter(w => /^[A-Z]{3,9}$/.test(w)) })).filter(g => g.palavras.length >= 4);
  for (let attempt = 0; ; attempt++) {
    const [g1, g2] = seededShuffle(pool, hashSeed('caca-g', day, attempt));
    const words = [...seededShuffle(g1.palavras, hashSeed('cp1', day, attempt)).slice(0, 4), ...seededShuffle(g2.palavras, hashSeed('cp2', day, attempt)).slice(0, 4)];
    if (new Set(words).size < CP.words || words.some((w, i) => words.some((x, j) => i !== j && x.includes(w)))) continue;
    const grid = Array.from({ length: S * S }, () => '');
    const place = [];
    const ok = [...words].sort((a, b) => b.length - a.length).every(w => {
      for (let t = 0; t < 200; t++) {
        const [dr, dc] = CP_DIRS[Math.floor(r() * 8)], r0 = Math.floor(r() * S), c0 = Math.floor(r() * S);
        const r1 = r0 + dr * (w.length - 1), c1 = c0 + dc * (w.length - 1);
        if (r1 < 0 || r1 >= S || c1 < 0 || c1 >= S) continue;
        const cells = [...w].map((_, k) => (r0 + dr * k) * S + c0 + dc * k);
        if (!cells.every((c, k) => !grid[c] || grid[c] === w[k])) continue;
        cells.forEach((c, k) => { grid[c] = w[k]; });
        place.push({ word: w, from: cells[0], to: cells.at(-1) });
        return true;
      }
      return false;
    });
    if (!ok) continue;
    const ABC = 'AAAABCDEEEEFGHIIIJLMNOOOOPQRRSSTTUUVXZ';
    for (let k = 0; k < grid.length; k++) if (!grid[k]) grid[k] = ABC[Math.floor(r() * ABC.length)];
    return { grid: grid.join(''), words, temas: [g1.nome, g2.nome], place };
  }
}
/** As letras da linha reta entre duas casas do quadro (null se não for reta: horizontal, vertical ou diagonal). */
function cpLine(grid, from, to) {
  const S = CP.size, r0 = Math.floor(from / S), c0 = from % S, r1 = Math.floor(to / S), c1 = to % S;
  const dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0), n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  if (from === to || (r0 !== r1 && c0 !== c1 && Math.abs(r1 - r0) !== Math.abs(c1 - c0))) return null;
  return Array.from({ length: n + 1 }, (_, k) => grid[(r0 + dr * k) * S + c0 + dc * k]).join('');
}
function cpView(day, p) {
  const { grid, words, temas, place } = cpPuzzle(day);
  return {
    game: 'cacapalavras', day, size: CP.size, grid, words, temas, found: p.st.found, over: p.over, won: p.won, score: p.score || 0, startedAt: p.startedAt,
    place: p.over ? place : null,
  };
}
async function cpPlay(user, day, p, body) {
  const { grid, words } = cpPuzzle(day);
  if (body.action === 'giveup') return { st: p.st, over: true, won: false, score: 0, startedAt: p.startedAt };
  const from = Number(body.from), to = Number(body.to), N = CP.size * CP.size;
  if (![from, to].every(x => Number.isInteger(x) && x >= 0 && x < N)) throw fail(400, 'Marque a palavra no quadro');
  const line = cpLine(grid, from, to);
  const word = line && words.find(w => w === line || w === [...line].reverse().join(''));
  if (!word) throw fail(422, 'Não é uma das palavras');
  if (p.st.found.some(f => f.word === word)) return { repeat: word };
  const st = { found: [...p.st.found, { word, from, to }] };
  const won = st.found.length === words.length;
  const score = won ? Math.max(100, 999 - Math.floor(((Date.now() - p.startedAt) / 1000) * 1.5)) : 0;
  return { st, over: won, won, score, startedAt: p.startedAt, result: { word } };
}

/* ---------- Cruzadinha: mini palavras cruzadas 5×5 com dicas ---------- */
// As grades e as dicas são geradas fora do app (scripts/build-cruzadinha.js → lib/data/cruzadinha.json).
// A página recebe só o formato da grade, a numeração e as dicas; as letras certas ficam aqui até o fim.
let cwData = null;
const CW = { size: 5 };
function cwPuzzle(day) {
  if (!cwData) cwData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cruzadinha.json'), 'utf8'));
  const { grids, clues } = cwData, S = CW.size;
  const grid = grids[seededShuffle(grids.map((_, i) => i), Math.floor(day / grids.length) * 7919 + 131)[day % grids.length]];
  const slots = [], nums = Array(S * S).fill(0);
  let n = 0;
  for (let i = 0; i < S * S; i++) {
    if (grid[i] === '#') continue;
    const r = Math.floor(i / S), c = i % S, starts = [];
    if ((c === 0 || grid[i - 1] === '#') && c + 1 < S && grid[i + 1] !== '#') starts.push(['A', 1]);
    if ((r === 0 || grid[i - S] === '#') && r + 1 < S && grid[i + S] !== '#') starts.push(['D', S]);
    if (!starts.length) continue;
    nums[i] = ++n;
    for (const [dir, step] of starts) {
      const cells = [];
      for (let k = i; k < S * S && grid[k] !== '#' && (step === S || Math.floor(k / S) === r); k += step) cells.push(k);
      const word = cells.map(k => grid[k]).join('');
      slots.push({ n, dir, cells, word, clue: clues[word] });
    }
  }
  return { grid, slots, nums };
}
const cwClean = (letters, grid) => [...grid].map((g, i) => (g === '#' ? '#' : /^[A-Z]$/.test(letters?.[i] || '') ? letters[i] : ' ')).join('');
function cwView(day, p) {
  const { grid, slots, nums } = cwPuzzle(day);
  return {
    game: 'cruzadinha', day, size: CW.size, black: [...grid].map((g, i) => (g === '#' ? i : -1)).filter(i => i >= 0), nums,
    across: slots.filter(s => s.dir === 'A').map(({ n, cells, clue }) => ({ n, cells, clue })),
    down: slots.filter(s => s.dir === 'D').map(({ n, cells, clue }) => ({ n, cells, clue })),
    letters: p.st.letters || cwClean('', grid), wrong: p.st.wrong || [], checks: p.st.checks || 0,
    over: p.over, won: p.won, score: p.score || 0, startedAt: p.startedAt, answer: p.over ? grid : null,
  };
}
// enviar a grade cheia: acerta tudo e ganha, ou ouve "ainda tem erro". Conferir mostra as casas erradas e custa pontos.
async function cwPlay(user, day, p, body) {
  const { grid } = cwPuzzle(day);
  const st = { letters: p.st.letters, wrong: p.st.wrong || [], checks: p.st.checks || 0, tries: p.st.tries || 0 };
  if (body.action === 'giveup') return { st, over: true, won: false, score: 0, startedAt: p.startedAt };
  const letters = cwClean(String(body.letters || '').toUpperCase(), grid);
  const wrong = [...letters].map((l, i) => (l !== ' ' && l !== grid[i] ? i : -1)).filter(i => i >= 0);
  if (body.action === 'save') return { st: { ...st, letters }, over: false, won: false, score: 0, startedAt: p.startedAt };
  if (body.action === 'check') return { st: { ...st, letters, wrong, checks: st.checks + 1 }, over: false, won: false, score: 0, startedAt: p.startedAt, result: { wrong: wrong.length } };
  if (letters.includes(' ')) throw fail(422, 'Preencha a grade toda');
  const won = letters === grid;
  const secs = (Date.now() - p.startedAt) / 1000;
  const score = won ? Math.max(100, 999 - Math.floor(secs * 1.5) - st.checks * 60 - st.tries * 20) : 0;
  return { st: { ...st, letters, tries: st.tries + (won ? 0 : 1) }, over: won, won, score, startedAt: p.startedAt, result: { ok: won } };
}

/* ---------- comum ---------- */
const DAILY_GAMES = {
  dueto: { init: () => ({ guesses: [] }), view: (d, p) => multiView('dueto', d, p), play: (u, d, p, b) => multiGuess(u, 'dueto', d, p, b) },
  quarteto: { init: () => ({ guesses: [] }), view: (d, p) => multiView('quarteto', d, p), play: (u, d, p, b) => multiGuess(u, 'quarteto', d, p, b) },
  octeto: { init: () => ({ guesses: [] }), view: (d, p) => multiView('octeto', d, p), play: (u, d, p, b) => multiGuess(u, 'octeto', d, p, b) },
  contexto: { init: () => ({ guesses: [], hints: 0 }), view: ctxView, play: ctxPlay },
  conexoes: { init: () => ({ found: [], mistakes: 0, tries: [] }), view: cxView, play: cxPlay },
  // o tempo do Alvo conta desde a hora em que os números aparecem: a partida é criada ao abrir
  alvo: { init: () => ({}), view: alvoView, play: alvoPlay, createOnOpen: true },
  soletra: { init: () => ({ found: [] }), view: solView, play: solPlay },
  senha: { init: () => ({ guesses: [] }), view: senhaView, play: senhaPlay },
  equacao: { init: () => ({ guesses: [] }), view: eqView, play: eqPlay },
  bandeira: { init: () => ({ guesses: [] }), view: flagView, play: flagPlay },
  cacapalavras: { init: () => ({ found: [] }), view: cpView, play: cpPlay, createOnOpen: true },
  cruzadinha: { init: () => ({ checks: 0, tries: 0 }), view: cwView, play: cwPlay, createOnOpen: true },
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

/* ---------- respostas do dia (aba "Respostas" da Administração) ---------- */
// O gabarito de cada jogo diário num dia e o que cada pessoa mandou. Só admin vê (o router confere) e só dias que
// já chegaram: amanhã não aparece, senão daria pra ver a resposta antes de abrir o jogo.
const asWords = list => list.map(w => ({ w }));
function dailyKey(game, day) {
  if (game === 'termo') return { sections: [{ words: asWords([termoSecret(day)]) }] };
  if (MULTI[game]) return { sections: [{ words: asWords(multiWords(game, day)) }] };
  if (game === 'contexto') { const c = ctxData(); return { sections: [{ words: asWords([c.vocab[ctxSecretIdx(day)]]) }] }; }
  if (game === 'conexoes') return { sections: cxPuzzle(day).groups.map(g => ({ title: g.nome, words: asWords(g.palavras) })) };
  if (game === 'soletra') {
    const { center, outer, answers } = solPuzzle(day);
    return {
      text: `Letra do meio ${center.toUpperCase()} · em volta ${outer.join(' ').toUpperCase()}`,
      sections: [{ title: `${answers.length} palavras (com estrela: usa as 7 letras)`, words: answers.map(a => ({ w: a.w, star: a.pangram })).sort((a, b) => b.star - a.star || a.w.localeCompare(b.w, 'pt')) }],
    };
  }
  if (game === 'alvo') { const { nums, target, solution } = alvoPuzzle(day); return { text: `Números ${nums.join(', ')} · alvo ${target}`, sections: [{ title: 'Uma conta que chega', words: asWords([solution]) }] }; }
  if (game === 'equacao') return { sections: [{ words: asWords([eqSecret(day)]) }] };
  if (game === 'senha') return { pegs: senhaCode(day) };
  if (game === 'bandeira') { const a = flagData().list[flagIdx(day)]; return { text: `Capital ${a.capital} · ${a.continente}`, sections: [{ words: asWords([a.nome]) }] }; }
  if (game === 'cacapalavras') { const { words: w, temas } = cpPuzzle(day); return { text: `Temas: ${temas.join(' e ')}`, sections: [{ words: asWords(w) }] }; }
  if (game === 'cruzadinha') {
    const { slots } = cwPuzzle(day), dir = { A: 'Horizontais', D: 'Verticais' };
    return { sections: ['A', 'D'].map(d => ({ title: dir[d], words: slots.filter(s => s.dir === d).map(s => ({ w: `${s.n}. ${s.word}`, clue: s.clue })) })) };
  }
  return null;
}
// o que a pessoa mandou, em texto curto (ou as cores, na Senha)
function dailySent(game, day, st) {
  const cap = list => (list.length > 30 ? [...list.slice(0, 30), `+${list.length - 30}`] : list);
  if (game === 'termo' || MULTI[game] || game === 'equacao') return { sent: cap(st.guesses || []) };
  if (game === 'contexto') { const c = ctxData(); return { sent: cap((st.guesses || []).map(([i, h]) => (h ? `${c.vocab[i]} (dica)` : c.vocab[i]))) }; }
  if (game === 'conexoes') return { sent: (st.tries || []).map(t => t.split(',').join(' ')) };
  if (game === 'soletra') { const pz = solPuzzle(day); return { sent: cap((st.found || []).map(k => solWord(pz, k)?.w || k)) }; }
  if (game === 'alvo') return { sent: st.result ? [`chegou em ${st.result.value}${st.result.diff ? ` (faltou ${st.result.diff})` : ''}`] : [] };
  if (game === 'senha') return { pegs: st.guesses || [] };
  if (game === 'bandeira') { const { list } = flagData(); return { sent: (st.guesses || []).map(i => list[i]?.nome || '?') }; }
  if (game === 'cacapalavras') return { sent: (st.found || []).map(f => f.word) };
  if (game === 'cruzadinha') {
    const grid = st.letters || '', n = [...grid].filter(c => /[A-Z]/.test(c)).length;
    return { sent: grid ? [`${n} letras preenchidas`, `${st.checks || 0} conferidas`, `${st.tries || 0} envios errados`] : [] };
  }
  return { sent: [] };
}
const DAILY_ORDER = ['termo', ...Object.keys(DAILY_GAMES)];
async function dailyAnswers(day = today()) {
  const now = today();
  day = Number.isInteger(day) ? day : now;
  if (day > now) throw fail(400, 'Esse dia ainda não chegou.');
  const names = new Map((await sql`SELECT id, name FROM users`).map(u => [Number(u.id), u.name]));
  const plays = new Map(DAILY_ORDER.map(g => [g, []]));
  const add = (game, r, st) => plays.get(game)?.push({
    name: names.get(Number(r.user_id)) || '?', over: bool(r.finished), won: bool(r.won), score: num(r.score), ...dailySent(game, day, st),
  });
  for (const r of await sql`SELECT * FROM termo_plays WHERE day = ${day}`) add('termo', r, { guesses: JSON.parse(r.guesses) });
  for (const r of await sql`SELECT * FROM daily_plays WHERE day = ${day}`) { let st = {}; try { st = JSON.parse(r.state); } catch {} add(r.game, r, st); }
  const order = (a, b) => b.won - a.won || b.score - a.score || a.name.localeCompare(b.name, 'pt');
  return { day, today: now, games: DAILY_ORDER.map(game => ({ game, ...dailyKey(game, day), players: plays.get(game).sort(order) })) };
}

module.exports = {
  DAILY_GAMES, dailyState, dailyPlay, dailyStatus, dailyAnswers, multiWords, ctxSecretIdx, ctxData, cxPuzzle, alvoPuzzle, alvoCheck,
  solPuzzle, solPoints, solWord, solHive, senhaCode, senhaEval, eqSecret, eqInvalid, eqEvaluate, flagIdx, flagData, cpPuzzle, cpLine, cwPuzzle,
};
