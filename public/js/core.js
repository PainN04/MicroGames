const $ = s => document.querySelector(s);
const main = $('#main');
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
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
async function fetchScores() {
  if (localMode) { scores = localScores(); online = false; }
  else {
    try {
      await flushPending();
      const r = await fetch('api/scores');
      if (!r.ok) throw new Error(r.status);
      scores = await r.json(); online = true;
      try { localStorage.setItem('mg_cache', JSON.stringify(scores)); } catch {}
    } catch { online = false; }
  }
  const waiting = pending().length;
  $('#db').classList.toggle('on', online);
  $('#dbtxt').textContent = localMode ? 'ranking só neste navegador'
    : online ? 'ranking compartilhado'
    : `servidor fora do ar${waiting ? ` · ${waiting} pra enviar` : ''}`;
}
function bestPerPlayer(gameId) {
  const g = GAMES[gameId];
  const best = {};
  for (const s of scores[gameId] || []) {
    if (!(s.name in best) || better(g, s.score, best[s.name])) best[s.name] = s.score;
  }
  return Object.entries(best).sort((a, b) => better(g, a[1], b[1]) ? -1 : 1);
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
// Bipes sintetizados (Web Audio), sem arquivos. Botão 🔊 no topo liga/desliga.
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
  $('#mute').textContent = muted ? '🔇' : '🔊';
  $('#mute').setAttribute('aria-label', muted ? 'Ligar som' : 'Desligar som');
}

// ---------- Phaser ----------
// ~1 MB: só baixa quando alguém abre a Cobrinha ou a Mira (no menu, fica pré-buscado em segundo plano).
const PHASER_URL = 'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js';
let phaserLoading = null;
function loadPhaser() {
  return phaserLoading ??= new Promise((resolve, reject) => {
    if (window.Phaser) return resolve();
    const s = document.createElement('script');
    s.src = PHASER_URL;
    s.onload = resolve;
    s.onerror = () => { phaserLoading = null; s.remove(); reject(new Error('Não deu pra carregar o Phaser. Confere a internet e tenta de novo.')); };
    document.head.append(s);
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
  }).catch(e => { if (!dead) wrap.innerHTML = `<p class="hint">⚠️ ${esc(e.message)}</p>`; });
  return () => { dead = true; removeEventListener('mg:fit', size); game?.destroy(true); };
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

// tela atual: "menu", "admin", "records", "report" ou o id do jogo
let currentView = 'menu';

// ---------- jogos ----------
// cada jogo fica em js/games/<id>.js e se registra aqui (a ordem dos <script> é a ordem do menu)
const GAMES = {};
