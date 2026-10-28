// ---------- visual do site (Recreio): menu lateral, saudação e fileiras de jogos ----------
// Claro ou escuro (mg_mode, <html data-mode>) e menu lateral recolhido no PC (mg_side, <html class="side-mini">).
// O index.html aplica os dois antes do CSS (sem piscar); o CSS está em recreio.css.
// O menu usa os ids que o resto do app procura (#daily, #strip, #dailyHead, #dtRemind, #tabDot, .card[data-id]),
// então refreshMenu, renderStrip e renderDailyStatus atualizam os textos sem redesenhar nada.

// categorias das fileiras; jogo novo que não estiver em nenhuma cai em Arcade
const GAME_CATS = [
  ['arcade', 'Arcade', 'gamepad-2', ['sinuca', 'blocos', 'snake', 'comecome', 'invasores', 'pong', 'tijolos', 'voa', 'corredor', 'chuva', 'torre', 'ritmo']],
  ['rapidos', 'Rapidinhos', 'zap', ['reflexo', 'clique', 'mira', 'digitacao', 'cores', 'numeros', 'toupeira', 'matematica']],
  ['cabeca', 'Pra pensar', 'brain', ['memoria', 'minado', 'sudoku', 'g2048', 'ligue4', 'forca', 'quiz', 'anagrama']],
];
const catOf = id => (GAME_CATS.find(([, , , ids]) => ids.includes(id)) || GAME_CATS[0])[0];
const catOrder = key => menuOrder().filter(([id]) => catOf(id) === key);

/* ---------- tema claro/escuro ---------- */
const modeNow = () => document.documentElement.dataset.mode === 'light' ? 'light' : 'dark';
function setMode(m) {
  document.documentElement.dataset.mode = m;
  try { localStorage.setItem('mg_mode', m); } catch {}
  paintMode();
}
const toggleMode = () => setMode(modeNow() === 'dark' ? 'light' : 'dark');
function paintMode() {
  const dark = modeNow() === 'dark';
  $('#mDark').setAttribute('aria-checked', dark);
  const b = $('#modeBtn');
  b.innerHTML = icon(dark ? 'sun' : 'moon');
  b.setAttribute('aria-label', dark ? 'Tema claro' : 'Tema escuro');
  b.title = b.getAttribute('aria-label');
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16141f' : '#f6f1e7'); // barra do navegador no celular
}

/* ---------- menu lateral (PC) / barra de baixo (celular) ---------- */
// Início, Diários e os atalhos de competição (#strip: Rankings, Torneio, Duplas, Duelos, desenhados por renderStrip)
const sideNav = document.createElement('nav');
sideNav.className = 'side-nav';
sideNav.setAttribute('aria-label', 'Navegação');
sideNav.innerHTML = `<button class="side-btn" data-go="home" title="Início">${icon('house')}<span>Início</span></button>
  <button class="side-btn" data-go="daily" title="Jogos diários">${icon('calendar')}<span>Diários</span><span class="tab-dot" id="tabDot" hidden></span></button>
  <div class="hub side-hub" id="strip" hidden></div>`;
$('header .logo').after(sideNav);
// Início mostra o menu inteiro; Diários mostra só os jogos diários (e volta pra lá ao sair de uma partida)
let menuOnly = null;
function showMenuPart(only) {
  menuOnly = only;
  if (currentView !== 'menu') showMenu();
  else { paintMenuPart(); scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); }
}
sideNav.querySelector('[data-go="home"]').onclick = () => showMenuPart(null);
sideNav.querySelector('[data-go="daily"]').onclick = () => showMenuPart('daily');
$('#home').addEventListener('click', () => { menuOnly = null; }, true); // o logo também volta pro menu inteiro
// recolhido, os atalhos ficam só com o ícone: o nome vai pra dica
new MutationObserver(() => sideNav.querySelectorAll('.hub-btn').forEach(b => { b.title = b.querySelector('b')?.textContent || ''; }))
  .observe($('#strip'), { childList: true });
// botão de recolher/abrir o menu lateral (só no PC; fica salvo)
$('header .logo').insertAdjacentHTML('afterend', `<button class="side-fold" id="sideFold" aria-controls="main"></button>`);
function paintFold() {
  const mini = document.documentElement.classList.contains('side-mini'), b = $('#sideFold');
  b.innerHTML = icon(mini ? 'chevron-right' : 'chevron-left');
  b.setAttribute('aria-label', mini ? 'Abrir o menu lateral' : 'Recolher o menu lateral');
  b.title = b.getAttribute('aria-label');
  b.setAttribute('aria-expanded', !mini);
}
$('#sideFold').onclick = () => {
  const mini = document.documentElement.classList.toggle('side-mini');
  try { localStorage.setItem('mg_side', mini ? 'mini' : 'open'); } catch {}
  paintFold();
  if (currentView !== 'menu') setTimeout(fitGame, 320); // o jogo ganha (ou perde) a largura do menu, depois da animação
};
paintFold();
// botão de claro/escuro ao lado do som (e a chave "Tema escuro" no menu da conta)
$('#mute').insertAdjacentHTML('afterend', '<button class="btn ghost icon-btn" id="modeBtn"></button>');
$('#modeBtn').onclick = toggleMode;
$('#mDark').onclick = toggleMode;
paintMode();

// acende o item da tela atual (nenhum durante a partida)
function paintSideNav() {
  sideNav.querySelectorAll('.side-btn').forEach(b => b.classList.toggle('on', currentView === 'menu' && b.dataset.go === (menuOnly || 'home')));
}
// só os diários: o resto do menu some (CSS) e a fileira vira grade com todos os jogos
function paintMenuPart() {
  const only = currentView === 'menu' && menuOnly === 'daily';
  main.classList.toggle('only-daily', only);
  const sec = $('#row-daily');
  if (sec) {
    const track = sec.querySelector('.rc-track'), more = sec.querySelector('.rc-more');
    track.classList.toggle('wrap', only);
    sec.classList.toggle('open', only);
    more.setAttribute('aria-expanded', only);
    more.textContent = only ? 'Ver menos' : 'Ver todos';
  }
  paintSideNav();
}
addEventListener('mg:fit', paintMenuPart);
// vai até uma fileira do menu (abre o menu antes, se estiver numa partida)
function goRow(key) {
  if (key === 'daily') return showMenuPart('daily');
  if (currentView !== 'menu') showMenu();
  let tries = 0;
  const go = () => {
    const row = $(`#row-${key}`);
    if (row) row.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    else if (tries++ < 60) requestAnimationFrame(go);
  };
  requestAnimationFrame(go);
}

/* ---------- menu: saudação, desafio do dia e fileiras ---------- */
const greetWord = () => { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
function greetHtml() {
  const first = player.split(' ')[0], streak = me ? dailyTabStreak(me.name) : 0;
  return `<h1>${first ? `${greetWord()}, <em>${esc(first)}</em>` : 'Hora do <em>intervalo</em>'}</h1>
    ${streak ? `<span class="rc-streak" title="Dias seguidos jogando os jogos diários">${icon('flame')} ${streak} ${streak === 1 ? 'dia seguido' : 'dias seguidos'}</span>` : ''}`;
}
// quando o login ou o ranking chegam (refreshMenu)
function refreshGreeting() { if (heroNode.isConnected) heroNode.innerHTML = greetHtml(); }

function menuHtml() {
  heroNode.innerHTML = greetHtml();
  const id = dailyGame();
  const row = (key, label, ic, list, daily = false) => `<section class="rc-row" id="row-${key}" aria-labelledby="rh-${key}">
      <div class="rc-row-head"><h2 id="rh-${key}">${icon(ic)} ${label}</h2>${daily ? '' : `<span class="rc-count">${list.length} jogos</span>`}
        <span class="rc-arrows"><button class="rc-arr" data-dir="-1" aria-label="Voltar">${icon('chevron-left')}</button><button class="rc-arr" data-dir="1" aria-label="Avançar">${icon('chevron-right')}</button></span>
        <button class="link-btn rc-more" aria-expanded="false">Ver todos</button></div>
      ${daily ? '<div class="daily-head" id="dailyHead"></div>' : ''}
      <div class="grid rc-track${daily ? ' daily-grid' : ''}">${list.map(([gid, g], i) => cardHtml(gid, g, i, daily ? '<span class="ds-slot"></span>' : '')).join('')}</div>
      ${daily ? '<p class="hint daily-note">Uma partida por dia em cada jogo, a mesma pra todo mundo. A resposta muda à meia-noite.</p>' : ''}
    </section>`;
  return `<section class="daily rc-daily" id="daily" data-game="${id}" style="--h:${GAMES[id].hue}">
      <div class="rc-hero">${dailyInfoHtml()}${dailyStageHtml(SMALL.matches ? 120 : 220)}</div>
      <div class="daily-side">${dailySideHtml()}</div>
    </section>
    <div class="dt-remind glass" id="dtRemind" hidden></div>
    ${row('daily', 'Jogos diários', 'calendar', dailyOrder(), true)}
    ${GAME_CATS.map(([key, label, ic]) => row(key, label, ic, catOrder(key))).join('')}`;
}
// depois de desenhar o menu: setas e "Ver todos" de cada fileira
function bindMenuRows() {
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
  paintMenuPart();
}
