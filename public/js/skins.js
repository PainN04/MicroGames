// ---------- visual do site: Recreio, Console ou o Atual ----------
// Dois visuais novos pra escolher testando. O visual fica salvo neste navegador (mg_skin) e vai no <html data-skin>;
// o Recreio tem claro e escuro (mg_mode, <html data-mode>). O index.html põe os dois atributos antes do CSS (sem piscar).
// O CSS de cada um está em skins.css. Os menus montados aqui usam os mesmos ids do menu Atual (#daily, #strip,
// #dailyHead, #dtRemind, .card[data-id]...), então refreshMenu, renderStrip e renderDailyStatus valem pros três.
const SKIN = document.documentElement.dataset.skin || 'classic';
// categorias das fileiras (Recreio) e das abas (Console); jogo novo que não estiver em nenhuma cai em Arcade
const GAME_CATS = [
  ['arcade', 'Arcade', 'gamepad-2', ['sinuca', 'blocos', 'snake', 'comecome', 'invasores', 'pong', 'tijolos', 'voa', 'corredor', 'chuva', 'torre', 'ritmo']],
  ['rapidos', 'Rapidinhos', 'zap', ['reflexo', 'clique', 'mira', 'digitacao', 'cores', 'numeros', 'toupeira', 'matematica']],
  ['cabeca', 'Pra pensar', 'brain', ['memoria', 'minado', 'sudoku', 'g2048', 'ligue4', 'forca', 'quiz', 'anagrama']],
];
function catOf(id) {
  if (GAMES[id].daily) return 'daily';
  return (GAME_CATS.find(([, , , ids]) => ids.includes(id)) || GAME_CATS[0])[0];
}
const catOrder = key => menuOrder().filter(([id]) => catOf(id) === key);

/* ---------- troca de visual e de tema ---------- */
function setSkin(k) {
  if (k === SKIN) return;
  try { localStorage.setItem('mg_skin', k); } catch {}
  location.reload(); // o topo e o menu mudam de estrutura: recarregar é o jeito seguro (nunca no meio de uma partida: só pelo menu da conta)
}
function setMode(m) {
  document.documentElement.dataset.mode = m;
  try { localStorage.setItem('mg_mode', m); } catch {}
  paintModeControls();
}
const modeNow = () => document.documentElement.dataset.mode === 'light' ? 'light' : 'dark';
function paintModeControls() {
  const dark = modeNow() === 'dark';
  $('#mDark')?.setAttribute('aria-checked', dark);
  const b = $('#modeBtn');
  if (b) { b.innerHTML = icon(dark ? 'sun' : 'moon'); b.setAttribute('aria-label', dark ? 'Tema claro' : 'Tema escuro'); b.title = b.getAttribute('aria-label'); }
  // cor da barra do navegador no celular
  const light = SKIN === 'recreio' && !dark;
  $('meta[name="theme-color"]')?.setAttribute('content', light ? '#f6f1e7' : SKIN === 'recreio' ? '#16141f' : SKIN === 'console' ? '#07080d' : '#161625');
}
// matiz do fundo do Console (o jogo em destaque ou o da partida); transição suave no CSS (@property --skin-h)
function setSkinHue(h) { document.documentElement.style.setProperty('--skin-h', h); }

/* ---------- menu da conta: Visual do site e Tema escuro ---------- */
document.querySelectorAll('.skin-pick [data-skin]').forEach(b => {
  b.setAttribute('aria-checked', b.dataset.skin === SKIN);
  b.onclick = () => { toggleAcct(false); setSkin(b.dataset.skin); };
});
$('#mDark').hidden = SKIN !== 'recreio'; // o Console é sempre escuro e o Atual não tem tema claro
$('#mDark').onclick = () => setMode(modeNow() === 'dark' ? 'light' : 'dark');

/* ---------- topo de cada visual ---------- */
const greetWord = () => { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
if (SKIN === 'recreio') {
  // menu lateral no PC (vira a barra de baixo no celular): Início, Diários e os atalhos de competição (#strip, js/social.js)
  const nav = document.createElement('nav');
  nav.className = 'side-nav';
  nav.setAttribute('aria-label', 'Navegação');
  nav.innerHTML = `<button class="side-btn" data-go="home">${icon('house')}<span>Início</span></button>
    <button class="side-btn" data-go="daily">${icon('calendar')}<span>Diários</span><span class="tab-dot" id="tabDot" hidden></span></button>
    <div class="hub side-hub" id="strip" hidden></div>`;
  $('header .logo').after(nav);
  nav.querySelector('[data-go="home"]').onclick = () => { if (currentView !== 'menu') showMenu(); else scrollTo({ top: 0, behavior: 'smooth' }); };
  nav.querySelector('[data-go="daily"]').onclick = () => goRow('daily');
  // botão de claro/escuro ao lado do som
  $('#mute').insertAdjacentHTML('afterend', '<button class="btn ghost icon-btn" id="modeBtn"></button>');
  $('#modeBtn').onclick = () => setMode(modeNow() === 'dark' ? 'light' : 'dark');
}
if (SKIN === 'console') {
  // relógio no canto, como na tela inicial de um videogame
  $('.who').insertAdjacentHTML('beforeend', '<span class="cs-clock" id="csClock" aria-hidden="true"></span>');
  const tick = () => { const c = $('#csClock'); if (c) c.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  tick(); setInterval(tick, 20_000);
}
paintModeControls();
// mostra o item da navegação lateral da tela atual
function paintSideNav() {
  document.querySelectorAll('.side-btn').forEach(b => b.classList.toggle('on', currentView === 'menu' && b.dataset.go === 'home'));
}
// vai até uma fileira do menu (abre o menu antes, se estiver numa partida)
function goRow(key) {
  if (currentView !== 'menu') showMenu();
  let tries = 0;
  const go = () => {
    const row = $(`#row-${key}`);
    if (row) row.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    else if (tries++ < 60) requestAnimationFrame(go);
  };
  requestAnimationFrame(go);
}

/* ---------- menus ---------- */
function skinMenuHtml() {
  heroNode.innerHTML = greetHtml();
  return SKIN === 'console' ? consoleMenuHtml() : recreioMenuHtml();
}
function greetHtml() {
  const first = player.split(' ')[0];
  const streak = me ? dailyTabStreak(me.name) : 0;
  return SKIN === 'console' ? '<h1 class="sr-only">MicroGame</h1>'
    : `<h1>${first ? `${greetWord()}, <em>${esc(first)}</em>` : 'Hora do <em>intervalo</em>'}</h1>
      ${streak ? `<span class="rc-streak" title="Dias seguidos jogando os jogos diários">${icon('flame')} ${streak} ${streak === 1 ? 'dia seguido' : 'dias seguidos'}</span>` : ''}`;
}

// Recreio: desafio do dia em destaque, "Na frente hoje" ao lado e fileiras por categoria
function recreioMenuHtml() {
  const id = dailyGame();
  const row = (key, label, ic, list, daily = false) => `<section class="rc-row" id="row-${key}" data-row="${key}" aria-labelledby="rh-${key}">
      <div class="rc-row-head"><h2 id="rh-${key}">${icon(ic)} ${label}</h2>${daily ? '' : `<span class="rc-count">${list.length} jogos</span>`}
        <span class="rc-arrows"><button class="rc-arr" data-dir="-1" aria-label="Voltar">${icon('chevron-left')}</button><button class="rc-arr" data-dir="1" aria-label="Avançar">${icon('chevron-right')}</button></span>
        <button class="link-btn rc-more" aria-expanded="false">Ver todos</button></div>
      ${daily ? '<div class="daily-head" id="dailyHead"></div>' : ''}
      <div class="grid rc-track${daily ? ' daily-grid' : ''}">${list.map(([gid, g], i) => cardHtml(gid, g, i, daily ? '<span class="ds-slot"></span>' : '')).join('')}</div>
    </section>`;
  return `<section class="daily rc-daily" id="daily" data-game="${id}" style="--h:${GAMES[id].hue}">
      <div class="rc-hero">${dailyInfoHtml()}${dailyStageHtml(SMALL.matches ? 120 : 220)}</div>
      <div class="daily-side">${dailySideHtml()}</div>
    </section>
    <div class="dt-remind glass" id="dtRemind" hidden></div>
    ${row('daily', 'Jogos diários', 'calendar', dailyOrder(), true)}
    ${GAME_CATS.map(([key, label, ic]) => row(key, label, ic, catOrder(key))).join('')}`;
}

// Console: destaque gigante do desafio, prateleira de ladrilhos com abas e os atalhos em botões redondos
let shelf = (() => { try { return localStorage.getItem('mg_shelf') || 'all'; } catch { return 'all'; } })();
function consoleMenuHtml() {
  const id = dailyGame(), g = GAMES[id];
  const tabs = [['all', 'Todos', 'grid-2x2'], ['daily', 'Diários', 'calendar'], ...GAME_CATS.map(([k, l, ic]) => [k, l, ic])];
  const list = [...dailyOrder(), ...menuOrder()];
  return `<section class="daily cs-hero" id="daily" data-game="${id}" style="--h:${g.hue}">
      <div class="daily-info">
        <span class="tag">${icon('flame')} Desafio de hoje · acaba em ${dailyHoursLeft()}h</span>
        <h2>${g.name}</h2>
        <p class="cs-desc">${firstSentence(g.desc)} Vale a sua melhor partida de hoje.</p>
        <div class="cs-meta" id="csMeta">${csMetaHtml()}</div>
        <div class="cs-cta"><button class="btn" id="dailyPlay">${icon('play')} Jogar</button><button class="btn ghost" data-rank="challenge">${icon('trophy')} Ranking</button></div>
        <div class="pick-row" id="pickRow">${pickRowHtml()}</div>
      </div>
      ${dailyStageHtml(SMALL.matches ? 200 : 340)}
    </section>
    <div class="dt-remind glass" id="dtRemind" hidden></div>
    <section class="cs-shelf" aria-label="Jogos">
      <div class="cs-tabs" role="tablist" aria-label="Categorias">${tabs.map(([k, l, ic]) => `<button role="tab" data-shelf="${k}" aria-selected="${k === shelf}">${icon(ic)} ${l}${k === 'daily' ? '<span class="tab-dot" id="tabDot" hidden></span>' : ''}</button>`).join('')}</div>
      <div class="daily-head" id="dailyHead"></div>
      <div class="grid cs-row daily-grid" data-z3d="${SMALL.matches ? 96 : 140}" data-fit="${SMALL.matches ? 0.78 : 0.82}">${list.map(([gid, gg], i) => cardHtml(gid, gg, i, gg.daily ? '<span class="ds-slot"></span>' : '')).join('')}</div>
    </section>
    <nav class="hub cs-dock" id="strip" aria-label="Competição"></nav>`;
}
// líder de hoje, sua melhor e quantos jogaram (embaixo do nome do jogo do desafio)
function csMetaHtml() {
  const id = dailyGame(), g = GAMES[id], list = bestPerPlayer(id, dayRange()), mine = list.find(([n]) => n === player);
  return `<div><small>Na frente</small><b>${list[0] ? `${esc(list[0][0])} · ${fmt(g, list[0][1])}` : 'Ninguém ainda'}</b></div>
    <div><small>Seu melhor hoje</small><b>${mine ? fmt(g, mine[1]) : '—'}</b></div>
    <div><small>Jogaram hoje</small><b>${list.length} ${list.length === 1 ? 'pessoa' : 'pessoas'}</b></div>`;
}
function paintShelf() {
  main.querySelectorAll('[data-shelf]').forEach(b => { const on = b.dataset.shelf === shelf; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  main.querySelectorAll('.cs-row .card').forEach(c => c.classList.toggle('off', shelf !== 'all' && catOf(c.dataset.id) !== shelf));
  const head = $('#dailyHead');
  if (head) head.hidden = shelf !== 'daily';
  const row = $('.cs-row');
  if (row) row.scrollLeft = 0;
}

// depois de desenhar o menu (renderMenu): botões das fileiras, abas da prateleira, fundo na cor do desafio
function bindSkinMenu() {
  setSkinHue(GAMES[dailyGame()].hue);
  paintSideNav();
  main.querySelectorAll('.rc-row').forEach(sec => {
    const track = sec.querySelector('.rc-track'), more = sec.querySelector('.rc-more');
    more.onclick = () => {
      const open = track.classList.toggle('wrap');
      more.setAttribute('aria-expanded', open);
      more.textContent = open ? 'Ver menos' : 'Ver todos';
      sec.classList.toggle('open', open);
    };
    sec.querySelectorAll('.rc-arr').forEach(b => b.onclick = () => track.scrollBy({ left: b.dataset.dir * track.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' }));
  });
  const tabs = main.querySelector('.cs-tabs');
  if (tabs) {
    tabs.querySelectorAll('[data-shelf]').forEach(b => b.onclick = () => {
      shelf = b.dataset.shelf;
      try { localStorage.setItem('mg_shelf', shelf); } catch {}
      paintShelf();
      if (shelf === 'daily') loadDailyStatus();
    });
    tabs.onkeydown = e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const all = [...tabs.querySelectorAll('[data-shelf]')], i = all.findIndex(b => b.dataset.shelf === shelf);
      const next = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      next.click(); next.focus();
    };
    paintShelf();
    // passar o mouse num ladrilho pinta o fundo com a cor daquele jogo; ao sair, volta pra do desafio
    const row = main.querySelector('.cs-row');
    row.addEventListener('pointerover', e => { const c = e.target.closest('.card'); if (c) setSkinHue(GAMES[c.dataset.id].hue); });
    row.addEventListener('focusin', e => { const c = e.target.closest('.card'); if (c) setSkinHue(GAMES[c.dataset.id].hue); });
    row.addEventListener('pointerleave', () => setSkinHue(GAMES[dailyGame()].hue));
  }
}
// quando o ranking chega (refreshMenu): saudação e números do destaque
function refreshSkinMenu() {
  if (SKIN === 'recreio' && heroNode.isConnected) heroNode.innerHTML = greetHtml();
  const meta = $('#csMeta');
  if (meta) meta.innerHTML = csMetaHtml();
}
// a partida apaga o item "Início" aceso
addEventListener('mg:fit', paintSideNav);
