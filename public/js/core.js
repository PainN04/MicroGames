const $ = s => document.querySelector(s);
const main = $('#main');
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
// cópia embaralhada de verdade (Fisher-Yates). O sort(() => Math.random() - 0.5) deixa umas ordens mais prováveis que outras.
const shuffled = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// Conta logada (vem de /api/auth/me) e o resultado do bloqueio por fila do Geiko.
let me = null, gate = null, player = '';
let cleanup = null;

// ---------- placar ----------
// Aberto pelo server.js: salva no banco (SQLite). Se o envio falhar, guarda numa fila e reenvia depois.
// Aberto direto do arquivo (file://): ranking só no localStorage deste navegador.
const localMode = location.protocol === 'file:';
// começa com o ranking da última visita (mg_cache) pra desenhar o menu sem esperar a rede
let scores = localMode ? readJson('mg_scores', {}) : readJson('mg_cache', {}), online = false;
function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
// Termo, Forca, Anagrama e Quiz: a resposta fica no servidor (lib/rounds.js), então sem servidor não dá pra jogar.
function needsServer(el) {
  if (!localMode) return false;
  el.innerHTML = '<p class="hint">Esse jogo confere as respostas no servidor. Abra o MicroGame pelo endereço do site (ou npm run local).</p>';
  return true;
}
const localScores = () => readJson('mg_scores', {});
const pending = () => readJson('mg_pending', []);
// Lança erro com .rejected = true quando o servidor recusa a pontuação (4xx): não adianta reenviar.
async function postScore(entry) {
  const r = await fetch('api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
  if (!r.ok) {
    const err = new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    err.rejected = r.status >= 400 && r.status < 500;
    err.status = r.status;
    throw err;
  }
}
async function flushPending() {
  const queue = pending();
  while (queue.length) {
    try { await postScore(queue[0]); }
    catch (e) { if (!e.rejected) throw e; }
    queue.shift();
    localStorage.setItem('mg_pending', JSON.stringify(queue));
  }
}
// Ranking e prêmios do dia (jogo escolhido e molduras) baixam juntos — os dois são públicos.
function requestScores() {
  const get = url => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const req = { scores: get('api/scores'), flair: get('api/flair') };
  req.scores.catch(() => {}); req.flair.catch(() => {}); // o erro é tratado em fetchScores; isto só evita "promessa sem dono"
  return req;
}
// O boot já pede o ranking junto com o login (sem esperar /api/auth/me); a primeira ida ao menu aproveita esse pedido.
let scoresEarly = null;
async function fetchScores() {
  if (localMode) { scores = localScores(); online = false; }
  else {
    try {
      await flushPending();
      const req = scoresEarly || requestScores();
      scoresEarly = null;
      scores = await req.scores; online = true;
      try { flair = await req.flair; localStorage.setItem('mg_flair', JSON.stringify(flair)); } catch {} // jogo escolhido e molduras: falhar aqui não derruba o ranking
      crownMemo = monthKingsMemo = dailyTabMemo = undefined;
      try { localStorage.setItem('mg_cache', JSON.stringify(scores)); } catch {}
    } catch { online = false; }
  }
  const waiting = pending().length;
  $('#db').classList.toggle('on', online);
  $('#dbtxt').textContent = localMode ? 'ranking só neste navegador'
    : online ? 'ranking compartilhado'
    : `servidor fora do ar${waiting ? ` · ${waiting} pra enviar` : ''}`;
  // tudo certo = só a bolinha verde (o texto fica na dica); problema = mostra o texto
  $('#db').classList.toggle('compact', online && !waiting);
  $('#db').title = $('#dbtxt').textContent;
}
// ---------- temporadas ----------
// Cada mês é uma temporada: o ranking do mês começa zerado no dia 1º; o "Geral" guarda tudo desde o começo.
let seasonMode = localStorage.getItem('mg_season') === 'all' ? 'all' : 'month';
const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).getTime();
const monthKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthName = (key, withYear = false) => {
  const [y, m] = key.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' });
  return s[0].toUpperCase() + s.slice(1);
};
const seasonLabel = () => (seasonMode === 'all' ? 'Geral' : monthName(monthKey(Date.now())));
function setSeasonMode(mode) {
  seasonMode = mode;
  try { localStorage.setItem('mg_season', mode); } catch {}
}
/** Período: { since, until } em ms. Padrão: o modo escolhido (mês atual ou tudo). */
const currentRange = () => (seasonMode === 'all' ? {} : { since: monthStart() });

// jogos diários têm ranking à parte, do dia: zera à meia-noite (o seletor Mês/Geral vale só pros jogos principais)
const mainGames = () => Object.keys(GAMES).filter(id => !GAMES[id].daily);
const rangeFor = id => (GAMES[id]?.daily ? dayRange() : currentRange());
function bestPerPlayer(gameId, { since = 0, until = Infinity } = rangeFor(gameId)) {
  const g = GAMES[gameId];
  const best = {};
  for (const s of scores[gameId] || []) {
    if (s.date < since || s.date >= until) continue;
    if (!(s.name in best) || better(g, s.score, best[s.name])) best[s.name] = s.score;
  }
  return Object.entries(best).sort((a, b) => better(g, a[1], b[1]) ? -1 : 1);
}
/** Quem tem mais recordes no período (desempate: mais 2º lugares). [[nome, recordes, vices]] */
function champions(range = currentRange()) {
  const count = {};
  for (const id of mainGames()) {
    const [first, second] = bestPerPlayer(id, range);
    if (first) (count[first[0]] ||= [0, 0])[0]++;
    if (second) (count[second[0]] ||= [0, 0])[1]++;
  }
  return Object.entries(count).filter(([, [w]]) => w > 0).map(([n, [w, s]]) => [n, w, s])
    .sort((a, b) => b[1] - a[1] || b[2] - a[2]);
}
// ---------- desafio do dia ----------
// Um jogo por dia, igual pra todo mundo (sai da data, sem servidor). A cada 20 dias passa por todos os jogos,
// numa ordem embaralhada diferente a cada ciclo. Vale a melhor partida feita no próprio dia.
const DAY_MS = 86_400_000;
const dayIndex = (t = Date.now()) => Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / DAY_MS);
const dayStart = i => { const t = i * DAY_MS; return t + new Date(t).getTimezoneOffset() * 60_000; };
// o sorteio (daily.js) + o jogo que o vencedor de ontem escolheu pra hoje (flair.picks, vem do servidor)
let flair = (() => { try { return JSON.parse(localStorage.getItem('mg_flair')) || { picks: {}, frames: {} }; } catch { return { picks: {}, frames: {} }; } })();
let crownMemo; // quem ganhou o desafio de ontem (recalculado quando o placar muda)
let monthKingsMemo; // nome → meses que ganhou (idem)
function dailyGame(i = dayIndex()) { return scheduledGame(Object.keys(GAMES), i, flair.picks); }
const dayRange = (i = dayIndex()) => ({ since: dayStart(i), until: dayStart(i + 1) });
/** Quem ganhou cada desafio dos dias já encerrados deste mês: [[nome, vitórias]] */
function dailyWinsThisMonth() {
  const wins = {};
  for (let i = dayIndex(monthStart()); i < dayIndex(); i++) {
    const top = bestPerPlayer(dailyGame(i), dayRange(i))[0];
    if (top) wins[top[0]] = (wins[top[0]] || 0) + 1;
  }
  return Object.entries(wins).sort((a, b) => b[1] - a[1]);
}

/** Meses que já terminaram e tiveram partidas, do mais novo pro mais velho, com campeão e recordistas de cada jogo. */
function hallOfFame() {
  const months = new Set();
  for (const id in GAMES) for (const s of scores[id] || []) months.add(monthKey(s.date));
  months.delete(monthKey(Date.now()));
  return [...months].sort().reverse().map(key => {
    const [y, m] = key.split('-').map(Number);
    const range = { since: new Date(y, m - 1, 1).getTime(), until: new Date(y, m, 1).getTime() };
    const games = mainGames().map(id => [id, bestPerPlayer(id, range)[0]]).filter(([, top]) => top);
    return { key, kings: champions(range), games };
  });
}
/** Meses (chave AAAA-MM) em que a pessoa terminou como campeã — o selo fixo do perfil e dos rankings. */
function monthsWonBy(name) {
  if (monthKingsMemo === undefined) {
    monthKingsMemo = {};
    for (const m of hallOfFame()) { const k = m.kings[0]?.[0]; if (k) (monthKingsMemo[k] ||= []).push(m.key); }
  }
  return monthKingsMemo[name] || [];
}
// ---------- jogos diários: ranking do dia, sequência e campeão ----------
// Uma passada só pelas partidas dos jogos diários: dia → nome → { pts, games } (melhor partida de cada jogo).
// Conta a partir do dia em que a aba nasceu (22/10/2026); antes disso o Termo era desafio do dia.
const DAILY_TAB_START = 20748;
let dailyTabMemo; // zerado quando o placar muda (junto com crownMemo)
function dailyTabIndex() {
  if (dailyTabMemo) return dailyTabMemo;
  const best = new Map(); // "dia|jogo|nome" → pontos
  for (const id of DAILY_TAB) {
    if (!GAMES[id]) continue;
    for (const s of scores[id] || []) {
      const d = dayIndex(s.date);
      if (d < DAILY_TAB_START) continue;
      const k = `${d}|${id}|${s.name}`;
      if (!best.has(k) || s.score > best.get(k)) best.set(k, s.score);
    }
  }
  const byDay = new Map();
  for (const [k, pts] of best) {
    const [d, , name] = k.split('|');
    const day = byDay.get(+d) || byDay.set(+d, new Map()).get(+d);
    const t = day.get(name) || day.set(name, { name, pts: 0, games: 0 }).get(name);
    t.pts += pts; t.games++;
  }
  return (dailyTabMemo = byDay);
}
/** Ranking dos jogos diários num dia: soma os pontos de cada pessoa em todos eles. [{ name, pts, games }] */
function dailyTabStandings(i = dayIndex()) {
  return [...(dailyTabIndex().get(i)?.values() || [])].sort((a, b) => b.pts - a.pts || b.games - a.games || a.name.localeCompare(b.name, 'pt-BR'));
}
/** Campeão dos jogos diários num dia já encerrado (o 1º do ranking daquele dia). */
const dailyTabChampOf = i => (i < dayIndex() ? dailyTabStandings(i)[0] || null : null);
/** Dias seguidos jogando pelo menos um jogo diário. Se ainda não jogou hoje, a sequência de ontem continua valendo. */
function dailyTabStreak(name) {
  const idx = dailyTabIndex(), played = i => idx.get(i)?.has(name);
  let i = dayIndex();
  if (!played(i)) i--;
  let n = 0;
  while (played(i - n)) n++;
  return n;
}
/** Maior sequência e quantos dias foi campeão dos diários: { best, wins } */
function dailyTabRecord(name) {
  const idx = dailyTabIndex(), days = [...idx.keys()].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null, wins = 0;
  for (const d of days) {
    if (!idx.get(d).has(name)) continue;
    run = prev === d - 1 ? run + 1 : 1; prev = d; best = Math.max(best, run);
  }
  for (const d of days) if (dailyTabChampOf(d)?.name === name) wins++;
  return { best, wins };
}
function better(g, a, b) { return g.better === 'low' ? a < b : a > b; }
// Jogos de arcade: a partida é aberta no servidor quando começa (lib/plays.js) e a pontuação só vale com o id dela,
// uma vez só e no relógio do servidor. Termo, Forca, Anagrama, Quiz e os diários o servidor já confere sozinho.
const SERVER_SCORED = new Set(['termo', 'forca', 'anagrama', 'quiz']);
function openPlay(id) {
  if (localMode || GAMES[id].daily || SERVER_SCORED.has(id)) return Promise.resolve(null);
  return fetch('api/plays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: id, daily: dailySeeded }) })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
}
// Retorna 'ok' (salvou), 'queued' (servidor fora, reenvia depois) ou a mensagem de recusa do servidor.
// pass = a partida aberta por openPlay (promessa de { id, seed } ou null).
async function saveScore(gameId, score, proof, pass) {
  // jogos conferidos no servidor (Termo, Forca, Anagrama, Quiz): ele mesmo já gravou; proof.saved = 'ok' ou o motivo da recusa
  if (proof && typeof proof === 'object' && 'saved' in proof) { await fetchScores(); return proof.saved || 'ok'; }
  const entry = { game: gameId, player, score, proof, play: (await pass)?.id };
  if (localMode) {
    const all = localScores();
    (all[gameId] = all[gameId] || []).push({ name: player, score, date: Date.now() });
    localStorage.setItem('mg_scores', JSON.stringify(all));
    scores = all;
    return 'ok';
  }
  try {
    await postScore(entry);
    await fetchScores();
    return 'ok';
  } catch (e) {
    // sem login (sessão expirou, ou página antiga aberta antes do login existir): guarda e salva depois de entrar
    if (e.status === 401) { unsavedScore = { gameId, score, proof, pass }; return 'login'; }
    if (e.rejected) return e.message;
    localStorage.setItem('mg_pending', JSON.stringify([...pending(), entry]));
    // mostra no ranking local enquanto não sobe pro servidor
    (scores[gameId] = scores[gameId] || []).push({ name: player, score, date: Date.now() });
    await fetchScores();
    return 'queued';
  }
}
function fmt(g, v) { return (g.decimals ? v.toFixed(g.decimals) : v) + ' ' + g.unit; }

// ---------- som ----------
// Bipes sintetizados (Web Audio), sem arquivos. Botão de som no topo liga/desliga.
let muted = localStorage.getItem('mg_mute') === '1';
let audioCtx = null;
function beep(freq, ms = 90, type = 'sine', vol = 0.07) {
  if (muted) return;
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + ms / 1000);
  } catch {}
}
// ruído filtrado (explosão, batida): sem arquivo, gerado na hora
function noise(ms = 300, vol = 0.12, freq = 900) {
  if (muted) return;
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime, len = Math.ceil(audioCtx.sampleRate * ms / 1000);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = audioCtx.createBufferSource(), filt = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
    src.buffer = buf; filt.type = 'lowpass'; filt.frequency.setValueAtTime(freq, t); filt.frequency.exponentialRampToValueAtTime(80, t + ms / 1000);
    gain.gain.value = vol;
    src.connect(filt).connect(gain).connect(audioCtx.destination);
    src.start(t);
  } catch {}
}
// som que sobe ou desce de tom (pulo, moeda, power-up)
function sweep(from, to, ms = 150, type = 'square', vol = 0.04) {
  if (muted) return;
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(from, t); osc.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
    gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(audioCtx.destination); osc.start(t); osc.stop(t + ms / 1000);
  } catch {}
}
// vibração no celular (mesmo botão do som: mudo = sem vibrar)
function buzz(pattern) { if (!muted && navigator.vibrate) try { navigator.vibrate(pattern); } catch {} }
const sfx = {
  good: () => { beep(880, 70, 'triangle'); buzz(8); },
  bad: () => { beep(130, 220, 'sawtooth', 0.05); buzz(60); },
  record: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 140, 'triangle'), i * 90)); buzz([30, 50, 30, 50, 60]); },
  boom: () => { noise(420, 0.16, 1400); beep(70, 300, 'sine', 0.08); buzz([80, 40, 120]); }, // morreu / explodiu
  hit: () => { noise(90, 0.08, 2500); buzz(15); }, // batida seca (tijolo, nave)
  jump: () => sweep(320, 720, 140, 'square', 0.03),
  coin: () => { sweep(988, 1319, 60, 'square', 0.03); setTimeout(() => sweep(1319, 1760, 120, 'square', 0.03), 60); buzz(10); },
  power: () => { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => beep(f, 90, 'square', 0.03), i * 55)); buzz([20, 30, 20]); },
};
function renderMute() {
  $('#mute').innerHTML = icon(muted ? 'volume-x' : 'volume-2');
  $('#mute').setAttribute('aria-label', muted ? 'Ligar som' : 'Desligar som');
}

// "+3" subindo e sumindo em cima de um elemento (jogos de tela, como o floatText dos de Phaser). kind: 'bad' = vermelho
function popPoints(target, text, kind = '') {
  if (!target?.isConnected) return;
  const r = target.getBoundingClientRect();
  const s = Object.assign(document.createElement('span'), { className: 'pop-pts ' + kind, textContent: text });
  s.style.left = r.left + r.width / 2 + scrollX + 'px';
  s.style.top = r.top + scrollY + 'px';
  document.body.append(s);
  setTimeout(() => s.remove(), 800);
}

// confete saindo do meio de um elemento (acertou a palavra, completou o bloco...)
function confetti(target, n = 22) {
  if (!target?.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = target.getBoundingClientRect(), cols = ['#ffd34d', '#5ce1ff', '#7cffb0', '#ff6b8a', '#c9b3ff'];
  for (let i = 0; i < n; i++) {
    const s = Object.assign(document.createElement('i'), { className: 'confetti' });
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
    s.style.cssText = `left:${r.left + r.width / 2 + scrollX}px;top:${r.top + r.height / 2 + scrollY}px;background:${cols[i % cols.length]};`
      + `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 40}px;--r:${rand(-540, 540)}deg`;
    document.body.append(s);
    setTimeout(() => s.remove(), 900);
  }
}
// letra (ou peça) voando de um elemento pra outro: um clone que desliza por cima da página
function flyTo(from, to, text) {
  if (!from?.isConnected || !to?.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const s = Object.assign(document.createElement('span'), { className: 'fly', textContent: text });
  s.style.cssText = `left:${a.left + scrollX}px;top:${a.top + scrollY}px;width:${a.width}px;height:${a.height}px;`
    + `--tx:${b.left + Math.min(b.width - 20, 14 + to.value?.length * 14 || b.width / 2) - a.left - a.width / 2}px;--ty:${b.top + b.height / 2 - a.top - a.height / 2}px`;
  document.body.append(s);
  setTimeout(() => s.remove(), 300);
}

// ---------- combo ----------
// Jogos de reflexo: a cada 5 acertos seguidos o multiplicador sobe (x1 → x4). Errar zera. `stat` é o <b> do placar.
const COMBO_STEP = 5, COMBO_MAX = 4;
const comboMult = streak => Math.min(COMBO_MAX, 1 + Math.floor(streak / COMBO_STEP));
function makeCombo(stat) {
  let streak = 0;
  const show = () => { stat.textContent = 'x' + comboMult(streak) + (streak ? ' · ' + streak : ''); stat.parentElement.classList.toggle('hot', comboMult(streak) > 1); };
  show();
  return {
    get mult() { return comboMult(streak); },
    get streak() { return streak; },
    /** Acertou: devolve o multiplicador que vale pra ESTE acerto (o de antes de subir). */
    hit() {
      const m = comboMult(streak);
      streak++;
      show();
      if (comboMult(streak) > m) {
        stat.classList.remove('up'); void stat.offsetWidth; stat.classList.add('up');
        [660, 880, 1175].forEach((f, k) => setTimeout(() => beep(f, 90, 'triangle', 0.04), k * 60)); // sobe de nível: som próprio
      }
      return m;
    },
    miss() { if (streak) { streak = 0; show(); } },
  };
}

// ---------- Phaser ----------
// ~1 MB: só baixa quando alguém abre um jogo de arcade (no menu, fica pré-buscado em segundo plano).
// Vem do próprio site (public/vendor); a CDN só entra se o arquivo local falhar — redes de empresa às vezes bloqueiam o jsdelivr.
const PHASER_URL = 'vendor/phaser.min.js';
const PHASER_CDN = 'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js';
let phaserLoading = null;
function loadPhaser() {
  const load = src => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(); };
    document.head.append(s);
  });
  return phaserLoading ??= window.Phaser ? Promise.resolve()
    : load(PHASER_URL).catch(() => load(PHASER_CDN)).catch(() => {
      phaserLoading = null;
      throw new Error('Não deu pra carregar o Phaser. Confere a internet e tenta de novo.');
    });
}
function prefetchPhaser() {
  if (window.Phaser || $('link[data-phaser]')) return;
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1500));
  idle(() => document.head.insertAdjacentHTML('beforeend', `<link rel="prefetch" as="script" href="${PHASER_URL}" data-phaser>`));
}
// Cria o jogo dentro de `wrap` (que já reserva o espaço). Retorna a função de limpeza.
// O tamanho na tela encolhe pra caber na largura E na altura que sobram (placar e dicas continuam visíveis).
// res > 1: o canvas tem res× mais pixels que o tamanho do jogo (fica nítido em tela de alta densidade);
// a cena dá setZoom(res) na câmera e continua desenhando nas coordenadas de sempre
function mountPhaser(wrap, width, height, scene, { res = 1 } = {}) {
  let game = null, dead = false, fpsTimer = 0;
  wrap.style.maxWidth = width + 'px';
  wrap.style.aspectRatio = `${width} / ${height}`;
  wrap.innerHTML = '<p class="hint">Carregando...</p>';
  const size = () => {
    const box = wrap.parentElement, cs = getComputedStyle(box);
    const gap = parseFloat(cs.rowGap) || 0;
    const others = [...box.children].filter(c => c !== wrap).reduce((sum, c) => sum + c.offsetHeight + gap, 0);
    const maxH = (parseFloat(cs.getPropertyValue('--avail')) || height) - others;
    const scale = Math.max(0.35, Math.min(1, box.clientWidth / width, maxH / height));
    // !important: nada (CSS do layout, Phaser) pode esticar a caixa além do tamanho calculado
    wrap.style.setProperty('width', Math.floor(width * scale) + 'px', 'important');
    wrap.style.setProperty('height', Math.floor(height * scale) + 'px', 'important');
    game?.scale.refresh();
  };
  size();
  addEventListener('mg:fit', size);
  loadPhaser().then(() => {
    if (dead) return;
    wrap.innerHTML = '';
    game = new Phaser.Game({
      // modo leve: canvas 2D. Sem placa de vídeo, o WebGL é desenhado pelo processador e fica bem mais lento que o 2D
      // (o que se perde é só o tint: partícula e nuvem saem sem a cor por cima)
      type: perf.lite ? Phaser.CANVAS : Phaser.AUTO, parent: wrap, width: Math.round(width * res), height: Math.round(height * res), backgroundColor: '#1d1f2e', banner: false,
      audio: { noAudio: true },
      // expandParent: false — senão o Phaser às vezes troca a altura da caixa pra 100% e o jogo estoura a tela
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, expandParent: false },
      scene,
    });
    // depois de esquentar, confere se o jogo está rodando liso; lento = liga o modo leve pros próximos jogos
    fpsTimer = setTimeout(() => { if (!dead && game.loop) perf.reportFps(game.loop.actualFps); }, 6000);
  }).catch(e => { if (!dead) wrap.innerHTML = `<p class="hint">${icon('triangle-alert')} ${esc(e.message)}</p>`; });
  // Pausa sozinho quando a pessoa troca de aba, de janela ou bloqueia o celular (antes o jogo seguia e ela morria sem ver).
  // Para as cenas (física, tempo e animações da cena congelam) e só volta quando ela clica em Continuar.
  let paused = [];
  const pause = () => {
    if (!game || dead || paused.length) return;
    paused = game.scene.getScenes(true);
    if (!paused.length) return;
    paused.forEach(s => s.scene.pause());
    const ov = document.createElement('div');
    ov.className = 'pause-ov';
    ov.innerHTML = `<p>Jogo pausado</p><button class="btn">${icon('play')} Continuar</button>`;
    ov.querySelector('button').onclick = e => { e.stopPropagation(); resume(); };
    wrap.append(ov);
    ov.querySelector('button').focus();
  };
  const resume = () => {
    paused.forEach(s => s.scene.isPaused() && s.scene.resume());
    paused = [];
    wrap.querySelector('.pause-ov')?.remove();
  };
  const onHide = () => { if (document.hidden) pause(); };
  document.addEventListener('visibilitychange', onHide);
  addEventListener('blur', pause);
  return () => {
    dead = true; clearTimeout(fpsTimer); removeEventListener('mg:fit', size);
    document.removeEventListener('visibilitychange', onHide); removeEventListener('blur', pause);
    game?.destroy(true);
  };
}
// Altura que sobra pro #game até o fim da tela (com a página no topo) → variável CSS --avail.
// Os jogos em HTML usam no CSS; os em Phaser, no mountPhaser (evento mg:fit).
function fitGame() {
  const el = $('#game');
  if (!el) return;
  const top = el.getBoundingClientRect().top + scrollY;
  el.style.setProperty('--avail', Math.max(240, Math.floor(innerHeight - top - 40)) + 'px');
  dispatchEvent(new Event('mg:fit'));
}
let fitTimer = 0;
addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitGame, 120); });
// Cor CSS (inclusive oklch) → número 0xRRGGBB que o Phaser entende.
function hex(cssVar) {
  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  c.fillStyle = css(cssVar); c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return (r << 16) | (g << 8) | b;
}
// Textura de pontinho branco pras partículas (pintada com `tint`).
function dotTexture(scene) {
  if (scene.textures.exists('dot')) return;
  scene.add.graphics().fillStyle(0xffffff).fillCircle(4, 4, 4).generateTexture('dot', 8, 8).destroy();
}
// ---------- kit de arte dos jogos de arcade ----------
// Mesma técnica do Corredor: cada desenho é pintado uma vez num canvas 2D (degradê, contorno, brilho) no dobro da
// resolução e vira textura do Phaser. Nada de imagem baixada nem emoji.
function artKit(scene, R = 2) {
  const TAU = Math.PI * 2;
  const tex = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return key;
    const t = scene.textures.createCanvas(key, Math.ceil(w * R), Math.ceil(h * R)), c = t.getContext();
    c.save(); c.scale(R, R); draw(c, w, h); c.restore(); t.refresh();
    return key;
  };
  const lin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
  const rad = (c, x, y, r0, r1, stops) => { const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); };
  /** cor #rrggbb clareada (amt > 0) ou escurecida (amt < 0) */
  const tone = (hexColor, amt) => {
    const n = typeof hexColor === 'number' ? hexColor : parseInt(hexColor.slice(1), 16);
    const ch = sh => { const v = (n >> sh) & 255; return Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt)); };
    return '#' + [16, 8, 0].map(sh => ch(sh).toString(16).padStart(2, '0')).join('');
  };
  /** bloco com relevo: topo claro, base escura, brilho em cima e contorno — tijolo, peça, botão */
  const bevel = (c, x, y, w, h, r, color, { line = 'rgba(10,10,25,.55)', depth = 0.18 } = {}) => {
    rr(c, x, y, w, h, r); c.fillStyle = lin(c, 0, y, 0, y + h, [[0, tone(color, 0.35)], [0.45, color], [1, tone(color, -0.35)]]); c.fill();
    c.lineWidth = 1.2; c.strokeStyle = line; c.stroke();
    rr(c, x + 2, y + 1.5, w - 4, Math.max(2, h * depth), r * 0.6); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
  };
  /** bolinha brilhante (bola, fruta, power-up) */
  const orb = (c, x, y, r, color) => {
    ell(c, x, y, r, r); c.fillStyle = rad(c, x - r * 0.35, y - r * 0.4, r * 0.1, r * 1.1, [[0, tone(color, 0.75)], [0.45, color], [1, tone(color, -0.45)]]); c.fill();
    ell(c, x - r * 0.35, y - r * 0.42, r * 0.32, r * 0.2, -0.6); c.fillStyle = 'rgba(255,255,255,.75)'; c.fill();
  };
  /** fundo do jogo: degradê vertical + vinheta + estrelinhas/pontos opcionais */
  const backdrop = (key, w, h, top, bottom, { stars = 0, grid = 0 } = {}) => tex(key, w, h, c => {
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, top], [1, bottom]]); c.fillRect(0, 0, w, h);
    for (let i = 0; i < stars; i++) { c.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.5})`; const s = Math.random() < 0.12 ? 1.6 : 0.9; c.fillRect(Math.random() * w, Math.random() * h, s, s); }
    if (grid) { c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = 1; for (let x = grid; x < w; x += grid) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = grid; y < h; y += grid) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } }
    c.fillStyle = rad(c, w / 2, h / 2, Math.min(w, h) * 0.3, Math.max(w, h) * 0.75, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.45)']]); c.fillRect(0, 0, w, h);
  });
  return { R, TAU, tex, lin, rad, rr, ell, tone, bevel, orb, backdrop };
}

function floatText(scene, x, y, text, color) {
  const t = scene.add.text(x, y, text, { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold', color }).setOrigin(0.5);
  scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 650, ease: 'Cubic.Out', onComplete: () => t.destroy() });
}

// Resumo da partida que o jogo manda junto com o resultado (os 3 tempos do Reflexo, precisão da Digitação...).
// Cada jogo chama summarize([[rótulo, valor], ...]) antes do done(); a tela de resultado mostra e zera.
let partSummary = null;
function summarize(rows) { partSummary = rows; }

// tela atual: "menu", "admin", "records", "report" ou o id do jogo
let currentView = 'menu';

// ---------- jogos ----------
// cada jogo fica em js/games/<id>.js e se registra aqui (a ordem dos <script> é a ordem do menu)
const GAMES = {};
