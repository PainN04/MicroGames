// Jogos com resposta (Termo, Forca, Anagrama e Quiz de TI): a resposta fica só aqui no servidor.
// A página recebe uma coisa por vez (o que já foi descoberto da palavra, as letras embaralhadas, a pergunta com as
// alternativas) e manda cada tentativa pra conferir. A pontuação também é calculada aqui e quem grava é o servidor:
// o POST /api/scores recusa esses jogos (lib/router.js), então não dá pra forjar o resultado pelo F12.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { sql, bool, num } = require('./store');
const { seededShuffle } = require('../public/js/daily.js');
const { TERMO_ANSWERS, FORCA_WORDS, ANAGRAMA_WORDS, ANAGRAMA_HINTS, QUIZ } = require('./words');
const { today, dayOf } = require('./flair');

const SERVER_GAMES = new Set(['termo', 'forca', 'anagrama', 'quiz', 'dueto', 'quarteto', 'contexto', 'conexoes', 'alvo']);
const fail = (status, message) => Object.assign(new Error(message), { status });
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const randomSeed = () => randomBytes(4).readUInt32BE(0);
const hashSeed = (...parts) => {
  let h = 2166136261;
  for (const c of parts.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

/* ---------- Termo: a palavra do dia ---------- */
// Mesmo sorteio que a página fazia (dia no horário de Brasília), então a palavra de hoje não muda com a troca.
const TERMO_ROWS = 6, TERMO_LEN = 5;
const termoSecret = day => seededShuffle(TERMO_ANSWERS, Math.floor(day / TERMO_ANSWERS.length) * 7919 + 101)[day % TERMO_ANSWERS.length];
let termoValid = null;
function termoValidSet() {
  if (termoValid) return termoValid;
  let words = [];
  try { words = fs.readFileSync(path.join(__dirname, '../public/data/termo-validas.txt'), 'utf8').split(/\s+/).filter(Boolean); } catch {}
  termoValid = new Set([...words, ...TERMO_ANSWERS.map(norm)]);
  return termoValid;
}
function termoEvaluate(guess, answer) {
  const res = Array(TERMO_LEN).fill('x'), left = {};
  for (let i = 0; i < TERMO_LEN; i++) { if (guess[i] === answer[i]) res[i] = 'g'; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
  for (let i = 0; i < TERMO_LEN; i++) if (res[i] === 'x' && left[guess[i]] > 0) { res[i] = 'y'; left[guess[i]]--; }
  return res;
}
const termoPoints = (tries, secs) => (TERMO_ROWS + 1 - tries) * 100 + Math.max(0, 99 - Math.floor(secs / 3));

async function termoRow(userId, day) {
  const [r] = await sql`SELECT * FROM termo_plays WHERE user_id = ${userId} AND day = ${day}`;
  return r ? { guesses: JSON.parse(r.guesses), startedAt: num(r.started_at), over: bool(r.finished), won: bool(r.won), score: num(r.score) } : null;
}
/** O que a página mostra: cada tentativa com as cores (e o acento da palavra nas letras verdes). A palavra só sai no fim. */
function termoView(day, st) {
  const secret = termoSecret(day), answer = norm(secret);
  const rows = st.guesses.map(g => {
    const res = termoEvaluate(g, answer);
    return { guess: g, res, letters: [...g].map((ch, i) => (res[i] === 'g' ? secret[i] : ch)) };
  });
  return { day, rows: TERMO_ROWS, len: TERMO_LEN, guesses: rows, over: st.over, won: st.won, score: st.score || 0, word: st.over ? secret : null };
}
async function termoState(user) {
  const day = today();
  let st = await termoRow(user.id, day);
  if (!st) {
    // jogou hoje antes desta versão (a partida ficou só no navegador): já conta como feita
    const [done] = await sql`SELECT score, created_at FROM scores WHERE user_id = ${user.id} AND game = ${'termo'} ORDER BY id DESC LIMIT 1`;
    if (done && dayOf(done.created_at) === day) st = { guesses: [], over: true, won: true, score: num(done.score) };
    else st = { guesses: [], over: false, won: false, score: 0 };
  }
  return termoView(day, st);
}
/** Confere uma tentativa. Devolve { view, finalScore } — finalScore só quando acertou (o router grava a partida). */
async function termoGuess(user, raw) {
  const day = today(), guess = norm(raw || '').replace(/[^A-Z]/g, '');
  if (guess.length !== TERMO_LEN) throw fail(400, 'Faltam letras');
  if (!termoValidSet().has(guess)) throw fail(422, 'Essa palavra não está na lista');
  if ((await termoState(user)).over) throw fail(409, 'Você já jogou o Termo de hoje. Volte amanhã!');
  const st = (await termoRow(user.id, day)) || { guesses: [], startedAt: null, over: false, won: false, score: 0 };
  const now = Date.now(), answer = norm(termoSecret(day));
  st.guesses.push(guess);
  st.startedAt ??= now;
  const won = guess === answer;
  if (won) { st.over = true; st.won = true; st.score = termoPoints(st.guesses.length, (now - st.startedAt) / 1000); }
  else if (st.guesses.length >= TERMO_ROWS) st.over = true;
  // a primeira tentativa cria a linha; as outras só atualizam se ninguém mexeu nela no meio (duas abas ao mesmo tempo)
  const json = JSON.stringify(st.guesses);
  const saved = st.guesses.length === 1
    ? await sql`INSERT INTO termo_plays (user_id, day, guesses, started_at, finished, won, score) VALUES (${user.id}, ${day}, ${json}, ${st.startedAt}, ${st.over}, ${st.won}, ${st.score})
                ON CONFLICT (user_id, day) DO NOTHING RETURNING day`
    : await sql`UPDATE termo_plays SET guesses = ${json}, finished = ${st.over}, won = ${st.won}, score = ${st.score}
                WHERE user_id = ${user.id} AND day = ${day} AND guesses = ${JSON.stringify(st.guesses.slice(0, -1))} RETURNING day`;
  if (!saved.length) throw fail(409, 'Essa tentativa já foi enviada em outra aba. Abra o jogo de novo.');
  return { view: termoView(day, st), finalScore: won ? st.score : null };
}

/* ---------- partidas (Forca, Anagrama, Quiz) ---------- */
// Cada partida é uma linha em game_rounds com o estado completo (baralho, posição, pontos). O id é aleatório e a
// partida é da conta que abriu: outra pessoa não consegue jogar nem ver a dela.
const TIMED = { anagrama: 60_000, quiz: 60_000 };
const GRACE = 3_000; // atraso da rede: a última resposta chega um pouco depois dos 60s da página
const FORCA_MAX = 6, ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const COMBO_STEP = 5, COMBO_MAX = 4;
const comboMult = streak => Math.min(COMBO_MAX, 1 + Math.floor(streak / COMBO_STEP));
const indices = n => Array.from({ length: n }, (_, i) => i);

// mistura das letras do anagrama: sai da semente da partida, então o desafio do dia é igual pra todo mundo
function anagramaMix(st) {
  const word = ANAGRAMA_WORDS[st.deck[st.pos % st.deck.length]];
  let mix, k = 0;
  do mix = seededShuffle([...word], hashSeed(st.seed, st.pos, k++)).join(''); while (mix === word && k < 50);
  return mix;
}
function quizOptions(st) {
  const [, ok, ...bad] = QUIZ[st.deck[st.pos % st.deck.length]];
  const opts = seededShuffle([ok, ...bad], hashSeed(st.seed, 'q', st.pos));
  return { opts, right: opts.indexOf(ok) };
}
function forcaMask(st) {
  const [word] = FORCA_WORDS[st.deck[st.pos]];
  const show = st.over && st.wrong >= FORCA_MAX;
  return [...word].map(ch => (ch === ' ' || ch === '-' ? ch : show || st.guessed.includes(norm(ch)) ? ch : ''));
}

/** O que a página precisa pra desenhar a vez atual (nunca a resposta). */
function roundView(game, st) {
  const left = TIMED[game] ? Math.max(0, st.startedAt + TIMED[game] - Date.now()) : null;
  if (game === 'forca') {
    if (st.pos >= st.deck.length) return { pts: st.pts, solved: st.solved, wrong: st.wrong, over: true };
    const [word, hint] = FORCA_WORDS[st.deck[st.pos]];
    return { hint, letters: norm(word).replace(/[^A-Z]/g, '').length, mask: forcaMask(st), guessed: st.guessed, wrong: st.wrong, max: FORCA_MAX, pts: st.pts, solved: st.solved, over: st.over };
  }
  if (game === 'anagrama') return { mix: anagramaMix(st), clue: ANAGRAMA_HINTS[ANAGRAMA_WORDS[st.deck[st.pos % st.deck.length]]], hints: st.hints, pts: st.pts, solved: st.solved, left };
  return { q: QUIZ[st.deck[st.pos % st.deck.length]][0], opts: quizOptions(st).opts, pts: st.pts, streak: st.streak, mult: comboMult(st.streak), left };
}

async function loadRound(user, id) {
  const [r] = await sql`SELECT * FROM game_rounds WHERE id = ${String(id || '')}`;
  if (!r || Number(r.user_id) !== user.id) throw fail(404, 'Partida não encontrada. Abra o jogo de novo.');
  return { id: r.id, game: r.game, done: bool(r.done), st: JSON.parse(r.state) };
}
// só grava se a partida ainda está aberta: duas chamadas de "fim" ao mesmo tempo não gravam a pontuação duas vezes
async function saveRound(id, st, done = false) {
  const rows = await sql`UPDATE game_rounds SET state = ${JSON.stringify(st)}, done = ${done} WHERE id = ${id} AND done = ${false} RETURNING id`;
  if (!rows.length) throw fail(409, 'Essa partida já acabou.');
}

/** Abre uma partida. daily = é o desafio do dia: a ordem sai do dia + nº da partida de hoje (igual pra todo mundo). */
async function startRound(user, game, { daily = false } = {}) {
  if (!['forca', 'anagrama', 'quiz'].includes(game)) throw fail(400, 'Jogo inválido.');
  const now = Date.now(), day = today();
  // limpeza: partidas de mais de 2 dias não servem pra nada
  await sql`DELETE FROM game_rounds WHERE created_at < ${now - 2 * 86_400_000}`;
  let seed = randomSeed(), dailyN = null;
  if (daily) {
    const [{ n }] = await sql`SELECT COUNT(*) AS n FROM game_rounds WHERE user_id = ${user.id} AND game = ${game} AND daily_day = ${day}`;
    dailyN = Number(n);
    seed = hashSeed('daily', game, day, dailyN);
  }
  const list = game === 'forca' ? FORCA_WORDS : game === 'anagrama' ? ANAGRAMA_WORDS : QUIZ;
  let deck = seededShuffle(indices(list.length), seed);
  if (game === 'quiz' && !daily) {
    // não repete as perguntas das últimas partidas da pessoa: as já vistas vão pro fim do baralho
    const [row] = await sql`SELECT value FROM settings WHERE key = ${'quizseen:' + user.id}`;
    let seen = []; try { seen = row ? JSON.parse(row.value) : []; } catch {}
    const seenSet = new Set(seen);
    deck = [...deck.filter(i => !seenSet.has(i)), ...seen.filter(i => i < list.length)];
  }
  const st = { seed, deck, pos: 0, pts: 0, startedAt: now,
    ...(game === 'forca' && { guessed: '', wrong: 0, solved: 0, over: false }),
    ...(game === 'anagrama' && { hints: 0, solved: 0 }),
    ...(game === 'quiz' && { streak: 0, rights: 0, wrongs: 0, best: 0, seen: [] }) };
  const id = randomBytes(18).toString('base64url');
  await sql`INSERT INTO game_rounds (id, user_id, game, created_at, daily_day, state, done) VALUES (${id}, ${user.id}, ${game}, ${now}, ${daily ? day : null}, ${JSON.stringify(st)}, ${false})`;
  return { id, daily: dailyN, view: roundView(game, st) };
}

/** Uma jogada. Devolve { result, view, finalScore? } — finalScore quando a partida acabou (o router grava). */
async function playRound(user, id, body) {
  const r = await loadRound(user, id);
  return { game: r.game, ...(await play(user, r, body)) };
}
async function play(user, r, body) {
  const st = r.st, game = r.game, action = body?.action;
  if (r.done) throw fail(409, 'Essa partida já acabou.');
  const dur = TIMED[game], elapsed = Date.now() - st.startedAt;
  if (dur && action !== 'finish' && elapsed > dur + GRACE) throw fail(409, 'O tempo acabou.');

  if (action === 'finish') {
    // forca acaba sozinha (6 erros ou fim das palavras); os de tempo só fecham depois dos 60s
    if (!dur) throw fail(400, 'Jogada inválida.');
    if (elapsed < dur - GRACE) throw fail(409, 'Ainda tem tempo de jogo.');
    await saveRound(r.id, st, true);
    if (game === 'quiz') await rememberQuiz(user.id, st.seen);
    return { result: { pts: st.pts, ...(game === 'quiz' && { rights: st.rights, wrongs: st.wrongs, best: st.best }), ...(game === 'anagrama' && { solved: st.solved }) }, finalScore: st.pts };
  }

  if (game === 'forca') {
    const l = norm(body.letter || '');
    if (st.over || st.pos >= st.deck.length) throw fail(409, 'Essa partida já acabou.');
    if (l.length !== 1 || !ALPHA.includes(l)) throw fail(400, 'Letra inválida.');
    if (st.guessed.includes(l)) return { result: { repeat: true }, view: roundView(game, st) };
    const [word] = FORCA_WORDS[st.deck[st.pos]], plain = norm(word);
    st.guessed += l;
    const hit = plain.includes(l);
    const result = { hit };
    if (hit && [...plain].every(c => !ALPHA.includes(c) || st.guessed.includes(c))) {
      // palavra completa: letras da palavra + erros que sobraram; os erros seguem pra próxima, acertar tira um
      const gain = plain.replace(/[^A-Z]/g, '').length + (FORCA_MAX - st.wrong);
      st.pts += gain; st.solved++; st.wrong = Math.max(0, st.wrong - 1);
      Object.assign(result, { solved: true, gain, word });
      st.pos++; st.guessed = '';
      if (st.pos >= st.deck.length) st.over = true;
    } else if (!hit) {
      st.wrong++;
      if (st.wrong >= FORCA_MAX) { st.over = true; result.lost = true; result.word = word; }
    }
    await saveRound(r.id, st, st.over);
    return { result, view: roundView(game, st), finalScore: st.over ? st.pts : null };
  }

  if (game === 'anagrama') {
    const word = ANAGRAMA_WORDS[st.deck[st.pos % st.deck.length]];
    if (action === 'hint') {
      if (st.hints >= word.length - 1) return { result: { prefix: word.slice(0, st.hints) }, view: roundView(game, st) };
      st.hints++;
      await saveRound(r.id, st);
      return { result: { prefix: word.slice(0, st.hints) }, view: roundView(game, st) };
    }
    if (action === 'skip') { st.pos++; st.hints = 0; await saveRound(r.id, st); return { result: {}, view: roundView(game, st) }; }
    if (action !== 'answer') throw fail(400, 'Jogada inválida.');
    const guess = norm(body.guess || '').replace(/[^A-Z]/g, '');
    const sorted = w => [...w].sort().join('');
    // vale qualquer palavra da lista com as mesmas letras (ex.: outra ordem válida)
    if (!(sorted(guess) === sorted(word) && ANAGRAMA_WORDS.includes(guess))) return { result: { ok: false }, view: roundView(game, st) };
    const gain = Math.max(1, word.length - st.hints);
    st.pts += gain; st.solved++; st.pos++; st.hints = 0;
    await saveRound(r.id, st);
    return { result: { ok: true, gain }, view: roundView(game, st) };
  }

  // quiz
  if (action !== 'answer') throw fail(400, 'Jogada inválida.');
  const k = Number(body.choice);
  if (!Number.isInteger(k) || k < 0 || k > 3) throw fail(400, 'Alternativa inválida.');
  const { right } = quizOptions(st);
  st.seen.push(st.deck[st.pos % st.deck.length]);
  let result;
  if (k === right) {
    const m = comboMult(st.streak);
    st.pts += m; st.rights++; st.streak++; st.best = Math.max(st.best, st.streak);
    result = { ok: true, gain: m };
  } else {
    st.streak = 0; st.wrongs++; st.pts = Math.max(0, st.pts - 1);
    result = { ok: false, right };
  }
  st.pos++;
  await saveRound(r.id, st);
  return { result, view: roundView(game, st) };
}
async function rememberQuiz(userId, seenNow) {
  const key = 'quizseen:' + userId;
  const [row] = await sql`SELECT value FROM settings WHERE key = ${key}`;
  let seen = []; try { seen = row ? JSON.parse(row.value) : []; } catch {}
  seen = [...seen.filter(i => !seenNow.includes(i)), ...seenNow].slice(-Math.floor(QUIZ.length * 0.8));
  await sql`INSERT INTO settings (key, value) VALUES (${key}, ${JSON.stringify(seen)}) ON CONFLICT (key) DO UPDATE SET value = excluded.value`;
}

module.exports = { SERVER_GAMES, termoState, termoGuess, termoSecret, termoValidSet, termoEvaluate, startRound, playRound, TIMED };
