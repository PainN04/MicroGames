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
      crownMemo = monthKingsMemo = undefined;
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

function bestPerPlayer(gameId, { since = 0, until = Infinity } = currentRange()) {
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
  for (const id in GAMES) {
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
    const games = Object.keys(GAMES).map(id => [id, bestPerPlayer(id, range)[0]]).filter(([, top]) => top);
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
function better(g, a, b) { return g.better === 'low' ? a < b : a > b; }
// Retorna 'ok' (salvou), 'queued' (servidor fora, reenvia depois) ou a mensagem de recusa do servidor.
async function saveScore(gameId, score, proof) {
  const entry = { game: gameId, player, score, proof };
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
    if (e.status === 401) { unsavedScore = { gameId, score, proof }; return 'login'; }
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
const sfx = {
  good: () => beep(880, 70, 'triangle'),
  bad: () => beep(130, 220, 'sawtooth', 0.05),
  record: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 140, 'triangle'), i * 90)),
};
function renderMute() {
  $('#mute').innerHTML = icon(muted ? 'volume-x' : 'volume-2');
  $('#mute').setAttribute('aria-label', muted ? 'Ligar som' : 'Desligar som');
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
function mountPhaser(wrap, width, height, scene) {
  let game = null, dead = false;
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
      type: Phaser.AUTO, parent: wrap, width, height, backgroundColor: '#1d1f2e', banner: false,
      audio: { noAudio: true },
      // expandParent: false — senão o Phaser às vezes troca a altura da caixa pra 100% e o jogo estoura a tela
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, expandParent: false },
      scene,
    });
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
    dead = true; removeEventListener('mg:fit', size);
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
