// ---------- telas ----------
function stop() { if (cleanup) { cleanup(); cleanup = null; } unseedDaily(); }
function swap(render) {
  // toda troca de tela passa por aqui: solta a cena 3D do título do jogo anterior
  const run = () => { dropHeadScene(); render(); };
  if (document.startViewTransition && !reduced) {
    // o navegador cancela a transição (aba oculta, janela redimensionada...) e rejeita as promessas; a tela já foi trocada, então não é erro
    const t = document.startViewTransition(run);
    t.ready.catch(() => {}); t.finished.catch(() => {}); t.updateCallbackDone.catch(() => {});
  } else run();
}
// cena 3D do card no ladrilho do título do jogo: desenhada parada (move só nos primeiros instantes), pra não disputar atenção com a partida
let headScene = null;
function dropHeadScene() { if (headScene) { headScene(); headScene = null; } }
function mountHeadScene(id) {
  if (!fx3dOn || !SCENES_3D[id]) return;
  loadLib(ZDOG_URL).then(() => {
    const tile = $('#gtile');
    if (!tile || currentView !== id || headScene) return;
    const stopScene = mountScene3d(id, tile, SMALL.matches ? 64 : 80);
    if (!stopScene) return;
    tile.classList.add('has3d');
    let done = false;
    headScene = () => { if (!done) { done = true; stopScene(); } };
    setTimeout(() => { if (!done) { done = true; stopScene(); } }, 2000); // congela: o canvas fica com o último quadro
  }).catch(() => {});
}
function announce(msg) { $('#live').textContent = msg; }

function recHtml(id) {
  const g = GAMES[id], top = bestPerPlayer(id)[0];
  const fr = top && flair.frames[top[0]]; // nome do recordista: branco, ou na cor da moldura de avatar dele
  return top ? `${icon('trophy')} <b${fr ? ` class="fr-${fr}"` : ''}>${esc(top[0])}</b> · ${fmt(g, top[1])}`
    : g.daily ? 'Ninguém jogou hoje' : seasonMode === 'all' ? 'Sem recorde — seja o primeiro' : `Ninguém jogou em ${seasonLabel().toLowerCase()}`;
}
function kingsHtml() {
  const kings = champions();
  return (kings.length
    ? '<ol>' + kings.map(([n, c], k) => `<li>${rankBadge(k + 1)} ${nameHtml(n)}${ticketStar(n)} <b>${c}</b> ${c > 1 ? 'recordes' : 'recorde'}</li>`).join('') + '</ol>'
    : '<p class="hint" style="text-align:left;margin:0">Ninguém tem recorde ainda.</p>');
}
// campeões dos meses que já acabaram
function hallHtml() {
  const hall = hallOfFame();
  if (!hall.length) return '';
  return '<div class="hall">' + hall.map(({ key, kings, games }) => {
    const [king] = kings;
    return `<details class="hall-month"><summary><span class="m">${monthName(key, true)}</span>
        ${king ? `<span>${icon('crown')} <b><a href="#" data-profile="${esc(king[0])}">${esc(king[0])}</a></b> · ${king[1]} ${king[1] > 1 ? 'recordes' : 'recorde'}</span>` : ''}</summary>
      <ul>${games.map(([id, [n, s]]) => `<li><span>${icon(GAMES[id].icon)} ${GAMES[id].name}</span><span>${esc(n)} · ${fmt(GAMES[id], s)}</span></li>`).join('')}</ul>
    </details>`;
  }).join('') + '</div>';
}
// destaque da semana no Geiko: quem mais resolveu tickets desde segunda (vem de /api/geiko/week)
let weekData = null;
const ticketStar = n => (weekData?.champion && n === weekData.champion.name ? ` <span class="tk" title="Quem mais resolveu tickets na semana">${icon('ticket')}</span>` : '');
async function loadWeek() {
  if (!me || localMode) return;
  try { weekData = await api('api/geiko/week'); } catch { weekData = null; }
}
// texto do destaque de tickets ('' se não há dados do Geiko); aparece na janela "Rankings"
function weekInnerHtml(d = weekData) {
  if (!d || (!d.champion && d.me == null)) return '';
  const list = d.people?.filter(p => p.count > 0).slice(0, 5);
  return `<span class="ic">${icon('ticket')}</span>
    <div><b>${d.champion ? `Destaque da semana: <a href="#" data-profile="${esc(d.champion.name)}">${esc(d.champion.name)}</a> — ${d.champion.count} ticket${d.champion.count > 1 ? 's' : ''} resolvido${d.champion.count > 1 ? 's' : ''}` : 'Ninguém resolveu ticket esta semana ainda'}</b>
      <small>${list?.length > 1 ? list.map((p, k) => `${k + 1}º ${esc(p.name)} ${p.count}`).join(' · ') + ' · ' : ''}${d.me != null ? `Você: ${d.me} desde segunda.` : ''} Quem mais resolver até sexta ganha o selo de ticket no ranking.</small></div>`;
}

// quadro do desafio do dia (topo do menu)
function dailyHtml() {
  const id = dailyGame(), g = GAMES[id];
  const hoursLeft = Math.max(1, Math.ceil((dayStart(dayIndex() + 1) - Date.now()) / 3_600_000));
  return `<div class="daily-stage" data-id="${id}"><span class="icon">${icon(g.icon)}</span></div>
    <div class="daily-info">
      <span class="tag">${icon('star')} Desafio de hoje · acaba em ${hoursLeft}h</span>
      <h2>${g.name}</h2>
      <p class="hint">Vale a sua melhor partida de hoje. Amanhã é outro jogo.</p>
      <button class="btn" id="dailyPlay">${icon('play')} Jogar</button>
      <div class="pick-row" id="pickRow">${pickRowHtml()}</div>
    </div>
    <div class="daily-side">${dailySideHtml()}</div>`;
}
// top 3 do desafio de hoje (atualiza sozinho quando o placar chega, sem redesenhar o palco 3D); o resto fica na janela Rankings
function dailySideHtml() {
  const id = dailyGame(), g = GAMES[id], list = bestPerPlayer(id, dayRange()), rows = list.slice(0, 3);
  const mine = list.findIndex(([n]) => n === player);
  return `<h3>Na frente hoje</h3>
      ${rows.length ? '<ol>' + rows.map(([n, s], k) => `<li class="${n === player ? 'me' : ''}">${rankBadge(k + 1)} ${nameHtml(n)} <b>${fmt(g, s)}</b></li>`).join('') + '</ol>'
        : '<p class="hint" style="text-align:left;margin:0">Ninguém jogou ainda. Saia na frente.</p>'}
      ${mine >= 3 ? `<p class="hint dmine">Você: ${mine + 1}º · ${fmt(g, list[mine][1])}</p>` : ''}
      <button class="link-btn" data-rank="challenge">Ranking completo e campeões</button>`;
}
// aba "Desafio do dia" da janela Rankings: o top 10 de hoje, as vitórias do mês e os campeões da semana
function challengeRankHtml() {
  const id = dailyGame(), g = GAMES[id], rows = bestPerPlayer(id, dayRange()).slice(0, 10);
  const wins = dailyWinsThisMonth().slice(0, 8);
  return `<h3 class="rk-sub">${icon(g.icon)} ${g.name} <small class="hint">hoje</small></h3>
    ${rows.length ? '<ol class="rk-list">' + rows.map(([n, s], k) => `<li class="${n === player ? 'me' : ''}">${rankBadge(k + 1)} ${nameHtml(n, { cls: 'name' })} <b>${fmt(g, s)}</b></li>`).join('') + '</ol>'
      : '<p class="hint" style="text-align:left">Ninguém jogou o desafio hoje ainda.</p>'}
    ${wins.length ? `<p class="hint rk-wins">Vitórias em ${monthName(monthKey(Date.now())).toLowerCase()}: ${wins.map(([n, c]) => `${esc(n)} <b>${c}</b>`).join(' · ')}</p>` : ''}
    ${champsHtml()}`;
}
function bindDaily() { $('#dailyPlay') && ($('#dailyPlay').onclick = () => play(dailyGame())); bindPick(); }
function seasonSeg() {
  return `<div class="seg season-seg" role="group" aria-label="Ranking">
    ${[['month', `${icon('calendar')} ${monthName(monthKey(Date.now()))}`], ['all', `${icon('landmark')} Geral`]].map(([m, l]) => `<button data-season="${m}" aria-pressed="${seasonMode === m}">${l}</button>`).join('')}
  </div>`;
}
function bindSeasonSeg(root, onChange) {
  root.querySelectorAll('[data-season]').forEach(b => b.onclick = () => {
    setSeasonMode(b.dataset.season);
    root.querySelectorAll('[data-season]').forEach(x => x.setAttribute('aria-pressed', x.dataset.season === seasonMode));
    onChange();
  });
}
// Desenha o menu na hora com o ranking que já temos (cache da última visita) — não espera a API (LCP).
// Reaproveita o .hero que veio no HTML: recriar o maior elemento da tela contaria como um LCP novo (mais tarde).
const heroNode = main.querySelector('.hero');
// atalhos do menu pra uma aba da janela Rankings (o top 3 do desafio e a linha do ranking dos diários)
main.addEventListener('click', e => { const b = e.target.closest('[data-rank]'); if (b) rankingsModal(b.dataset.rank); });
// Jogos em destaque aparecem primeiro no menu; o resto segue a ordem do GAMES.
const FEATURED = ['blocos', 'sinuca'];
const menuOrder = () => [...FEATURED, ...Object.keys(GAMES).filter(id => !FEATURED.includes(id) && !GAMES[id].daily)].map(id => [id, GAMES[id]]);
// aba "Jogos diários": uma partida por dia em cada um, a mesma pra todo mundo (DAILY_TAB em daily.js)
const dailyOrder = () => DAILY_TAB.filter(id => GAMES[id]).map(id => [id, GAMES[id]]);
let menuTab = (() => { try { return localStorage.getItem('mg_tab') === 'daily' ? 'daily' : 'main'; } catch { return 'main'; } })();
function setMenuTab(tab) {
  menuTab = tab;
  try { localStorage.setItem('mg_tab', tab); } catch {}
  main.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  main.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
}
// como está cada jogo diário hoje pra quem está logado (GET /api/diarios)
let dailyStatus = { day: null, games: {} };
async function loadDailyStatus() {
  if (!me || localMode) return;
  try { dailyStatus = await api('api/diarios'); } catch {}
  renderDailyStatus();
}
function dailyStatusHtml(id) {
  const st = dailyStatus.games[id];
  if (!me) return `<span class="ds">${icon('calendar')} Entre pra jogar</span>`;
  if (!st) return `<span class="ds new">${icon('play')} Novo hoje</span>`;
  if (!st.over) return `<span class="ds going">${icon('hourglass')} Em andamento</span>`;
  return st.won ? `<span class="ds won">${icon('circle-check')} Feito · ${fmt(GAMES[id], st.score)}</span>` : `<span class="ds lost">${icon('x')} Não foi hoje</span>`;
}
function renderDailyStatus() {
  if (currentView !== 'menu') return;
  for (const [id] of dailyOrder()) { const el = $(`.card[data-id="${id}"] .ds-slot`); if (el) el.innerHTML = dailyStatusHtml(id); }
  const left = me ? dailyOrder().filter(([id]) => !dailyStatus.games[id]?.over).length : 0;
  const dot = $('#tabDot');
  if (dot) { dot.hidden = !left; dot.textContent = left; dot.title = `${left} jogo${left > 1 ? 's' : ''} diário${left > 1 ? 's' : ''} pra jogar hoje`; }
  const head = $('#dailyHead');
  if (head) {
    const ms = dayStart(dayIndex() + 1) - Date.now(), h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60;
    const total = dailyOrder().length, feitos = total - left;
    const streak = me ? dailyTabStreak(me.name) : 0;
    head.innerHTML = `<span>${icon('calendar')} Desafios novos em <b>${h}h${String(m).padStart(2, '0')}</b></span>${me ? `<span class="prog"><i style="--p:${feitos / total * 100}%"></i></span><span><b>${feitos}/${total}</b> feitos hoje</span>` : ''}`
      + (streak ? `<span class="dt-streak${dailyStatus.games && Object.keys(dailyStatus.games).length ? '' : ' risk'}" title="Dias seguidos jogando os jogos diários">${icon('flame')} <b>${streak}</b> ${streak === 1 ? 'dia' : 'dias seguidos'}</span>` : '')
      + dailyRankLine()
      + (me && feitos ? `<button class="btn ghost dt-share" id="dtShare">${icon('upload')} Compartilhar meu dia</button>` : '');
    head.querySelector('#dtShare')?.addEventListener('click', shareDailyDay);
  }
  renderDailyRemind(left);
}
/** Resumo do dia nos jogos diários, pra colar no grupo: feitos, pontos, posição, sequência e cada jogo. */
function dailyShareText() {
  const games = dailyOrder().map(([id, g]) => [g, dailyStatus.games[id]]).filter(([, st]) => st?.over);
  const pts = games.reduce((t, [, st]) => t + (st.won ? st.score : 0), 0);
  const pos = dailyTabStandings().findIndex(r => r.name === me.name) + 1, streak = dailyTabStreak(me.name);
  const d = new Date();
  return [`MicroGame · Jogos diários ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    `${games.length}/${dailyOrder().length} jogos · ${pts.toLocaleString('pt-BR')} pontos${pos ? ` · ${pos}º lugar` : ''}`,
    ...(streak > 1 ? [`🔥 ${streak} dias seguidos`] : []),
    '',
    ...games.map(([g, st]) => (st.won ? `✅ ${g.name} ${st.score}` : `❌ ${g.name}`))].join('\n');
}
async function shareDailyDay() {
  const text = dailyShareText(), b = $('#dtShare');
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); if (b) b.innerHTML = `${icon('circle-check')} Copiado!`; announce('Resumo do dia copiado'); }
  } catch (err) { if (err?.name !== 'AbortError') modal(`<h2>${icon('upload')} Seu dia</h2><textarea class="dt-share-txt" readonly rows="10">${esc(text)}</textarea>`); }
}
// lembrete: à noite (a partir das 18h), se ainda tem jogo diário pra fazer hoje. Some por hoje no X.
function renderDailyRemind(left) {
  const bar = $('#dtRemind');
  if (!bar) return;
  const key = String(dayIndex());
  let dismissed = false;
  try { dismissed = localStorage.getItem('mg_remind') === key; } catch {}
  const hour = new Date().getHours();
  if (!me || localMode || dismissed || hour < 18 || !left || !dailyStatus.day) { bar.hidden = true; return; }
  const ms = dayStart(dayIndex() + 1) - Date.now(), h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60;
  const streak = dailyTabStreak(me.name), playedToday = Object.keys(dailyStatus.games).length > 0;
  bar.hidden = false;
  bar.innerHTML = `<span class="ic">${icon('hourglass')}</span><span class="tx"><span>${left === dailyOrder().length ? 'Você ainda não jogou os diários hoje' : `Faltam <b>${left}</b> jogo${left > 1 ? 's' : ''} diário${left > 1 ? 's' : ''}`} · o dia vira em <b>${h}h${String(m).padStart(2, '0')}</b></span>
    ${streak && !playedToday ? `<small>${icon('flame')} Jogue um pra não perder a sequência de ${streak} ${streak === 1 ? 'dia' : 'dias'}</small>` : ''}</span>
    <button class="btn" id="dtGo">Jogar</button><button class="dt-x" id="dtX" aria-label="Fechar lembrete por hoje">${icon('x')}</button>`;
  bar.querySelector('#dtGo').onclick = () => { setMenuTab('daily'); $('#panel-daily')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  bar.querySelector('#dtX').onclick = () => { try { localStorage.setItem('mg_remind', key); } catch {} bar.hidden = true; };
}
// ranking à parte dos jogos diários: soma dos pontos de hoje em todos eles, zera à meia-noite
function dailyRankHtml() {
  const rows = dailyTabStandings(), total = dailyOrder().length;
  const [champ] = dailyTabStandings(dayIndex() - 1);
  const mine = rows.findIndex(r => r.name === player);
  const list = rows.slice(0, 10);
  return `<div class="dr-head"><h3>${icon('trophy')} Ranking de hoje</h3><span class="hint">soma dos pontos nos jogos diários · zera à meia-noite</span></div>`
    + (list.length
      ? '<ol>' + list.map((r, k) => `<li class="${r.name === player ? 'me' : ''}">${rankBadge(k + 1)}${nameHtml(r.name, { cls: 'name' })}<span class="dr-n">${r.games}/${total}</span><b>${r.pts.toLocaleString('pt-BR')}</b></li>`).join('') + '</ol>'
        + (mine >= 10 ? `<p class="hint dr-me">Você está em ${mine + 1}º com ${rows[mine].pts.toLocaleString('pt-BR')} pontos</p>` : '')
      : '<p class="empty">Ninguém jogou hoje ainda. Saia na frente!</p>')
    + (champ ? `<p class="dr-champ">${icon('crown')} Ontem: ${nameHtml(champ.name)} com <b>${champ.pts.toLocaleString('pt-BR')}</b> pontos</p>` : '');
}
// na aba dos diários, o ranking vira uma linha só (quem lidera + a sua posição); a lista inteira abre na janela Rankings
function dailyRankLine() {
  const rows = dailyTabStandings(), mine = rows.findIndex(r => r.name === player);
  const lead = rows[0] ? `1º <b>${esc(rows[0].name)}</b> ${rows[0].pts.toLocaleString('pt-BR')}${mine > 0 ? ` · você ${mine + 1}º` : ''}` : 'Ranking do dia';
  return `<button class="dt-rank" data-rank="daily" title="Ver o ranking dos jogos diários">${icon('trophy')}<span>${lead}</span>${icon('chevron-right')}</button>`;
}
const cardHtml = (id, g, i, extra = '') => `<button class="card glass" data-id="${id}" style="--h:${g.hue};--i:${i}" title="${esc(g.desc)}">
        <span class="icon">${icon(g.icon)}</span>
        <h3>${g.name}</h3>
        <span class="rec">${recHtml(id)}</span>${extra}
      </button>`;
function renderMenu() {
  main.classList.remove('game-view');
  main.replaceChildren(heroNode);
  main.insertAdjacentHTML('beforeend', `
    <section class="daily glass" id="daily" data-game="${dailyGame()}" style="--h:${GAMES[dailyGame()].hue}">${dailyHtml()}</section>
    <nav class="hub glass" id="strip" aria-label="Competição"></nav>
    <div class="dt-remind glass" id="dtRemind" hidden></div>
    <div class="menu-bar">
      <div class="tabs" role="tablist" aria-label="Jogos">
        <button role="tab" id="tab-main" data-tab="main" aria-controls="panel-main">${icon('gamepad-2')} Jogos</button>
        <button role="tab" id="tab-daily" data-tab="daily" aria-controls="panel-daily">${icon('calendar')} Jogos diários<span class="tab-dot" id="tabDot" hidden></span></button>
      </div></div>
    <section class="grid" id="panel-main" data-panel="main" role="tabpanel" aria-labelledby="tab-main">` +
    menuOrder().map(([id, g], i) => cardHtml(id, g, i)).join('') + `</section>
    <section id="panel-daily" data-panel="daily" role="tabpanel" aria-labelledby="tab-daily">
      <div class="daily-head glass" id="dailyHead"></div>
      <div class="grid daily-grid">` + dailyOrder().map(([id, g], i) => cardHtml(id, g, i, '<span class="ds-slot"></span>')).join('') + `</div>
      <p class="hint daily-note">Uma partida por dia em cada jogo, a mesma pra todo mundo. A resposta muda à meia-noite.</p>
    </section>
`);
  main.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { setMenuTab(b.dataset.tab); if (b.dataset.tab === 'daily') loadDailyStatus(); });
  // setas trocam de aba (padrão de tablist)
  main.querySelector('.tabs').onkeydown = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = menuTab === 'main' ? 'daily' : 'main';
    setMenuTab(next); main.querySelector(`[data-tab="${next}"]`).focus();
  };
  setMenuTab(menuTab);
  renderDailyStatus();
  renderStrip();
  main.querySelectorAll('.card').forEach(c => c.onclick = () => play(c.dataset.id));
  bindDaily();
  // card do jogo do dia ganha um selo
  const dc = $(`.card[data-id="${dailyGame()}"]`);
  if (dc) { dc.classList.add('is-daily'); dc.insertAdjacentHTML('beforeend', `<span class="daily-badge" title="Desafio de hoje">${icon('star')}</span>`); }
  renderGate();
  prefetchPhaser();
  enhanceCards();
}
// Quando o ranking novo chega, só troca os textos (sem redesenhar nem reanimar os cards).
function refreshMenu() {
  if (!$('#daily')) return;
  for (const id in GAMES) { const rec = $(`.card[data-id="${id}"] .rec`); if (rec) rec.innerHTML = recHtml(id); }
  renderStrip();
  const side = $('#daily .daily-side');
  if (side) side.innerHTML = dailySideHtml();
  refreshPickRow();
  applyMeFlair();
  renderDailyStatus();
}
async function showMenu() {
  stop();
  const changed = currentView !== 'menu';
  currentView = 'menu';
  if (changed) setTimeout(pingSession, 0);
  swap(renderMenu);
  const week = loadWeek(); // tickets da semana (Geiko) em paralelo com o ranking — só aparecem na janela "Rankings"
  await Promise.all([fetchScores(), loadSocial(), loadDailyStatus()]);
  // o jogo do dia mudou depois que o servidor respondeu (ex.: o vencedor de ontem escolheu o de hoje): redesenha o menu
  if (currentView === 'menu' && $('#daily') && $('#daily').dataset.game !== dailyGame()) renderMenu();
  if (currentView === 'menu') { refreshMenu(); maybeCongrats(); maybeDailyTabCongrats(); }
  checkVersion();
  if (me && !me.mustChange) refreshGate();
  await week;
  if (currentView === 'menu') refreshMenu();
}

function boardHtml(id) {
  const g = GAMES[id], all = bestPerPlayer(id), rows = all.slice(0, 10);
  const mine = all.findIndex(([n]) => n === player);
  const num = v => (g.decimals ? v.toFixed(g.decimals) : v.toLocaleString('pt-BR'));
  // a unidade (pontos, s, cliques...) aparece uma vez no topo da coluna; nas linhas fica só o número, e sobra espaço pro nome
  const row = ([n, s], k) => `<li class="${n === player ? 'me' : ''}${k < 3 ? ` top t${k + 1}` : ''}"><span class="pos">${rankBadge(k + 1)}</span>${nameHtml(n, { cls: 'name', extra: ticketStar(n) })}<span class="sc">${num(s)}</span>${rxButton(id, n)}${rxChips(id, n)}</li>`;
  return (g.daily ? `<h3>${icon('trophy')} Ranking</h3><p class="hint board-reset">Só de hoje: zera à meia-noite</p>` : `<h3>${icon('trophy')} Ranking</h3>${seasonSeg()}`)
    + (g.boardNote ? `<p class="hint board-note">${g.boardNote}</p>` : '') + (rows.length
    ? `<div class="bd-cols" aria-hidden="true"><span>${all.length} ${all.length > 1 ? 'jogadores' : 'jogador'}</span><span>${esc(g.unit)}</span></div>`
      + '<ol>' + rows.map(row).join('') + '</ol>'
      // fora do top 10: a sua linha fica embaixo, separada
      + (mine >= 10 ? `<ol class="bd-me" start="${mine + 1}">${row(all[mine], mine)}</ol>` : '')
    : `<div class="board-empty">${icon('trophy')}<b>${g.daily ? 'Ninguém jogou hoje ainda' : seasonMode === 'all' ? 'Ninguém jogou ainda' : `Ninguém jogou em ${seasonLabel().toLowerCase()} ainda`}</b><span>Sua partida já entra aqui.</span></div>`)
    + (me && !g.daily ? `<button class="btn ghost board-duel" data-duel="${id}">${icon('swords')} Desafiar alguém</button>` : '');
}
// desenha o ranking da partida e liga o seletor Mês/Geral
function renderBoard(id) {
  const b = $('#board');
  if (!b) return;
  b.innerHTML = boardHtml(id);
  bindSeasonSeg(b, () => renderBoard(id));
  bindReactions(b, id);
  b.querySelector('[data-duel]')?.addEventListener('click', () => duelsModal({ game: id }));
}

function play(id) {
  if (!localMode && !me) return loginModal();
  if (me?.mustChange) return passwordModal(true);
  if (gate?.blocked) return gateDialog();
  stop();
  currentView = id;
  setTimeout(pingSession, 0); // avisa o painel "online" que trocou de jogo
  const g = GAMES[id];
  swap(() => {
    main.innerHTML = `<div class="layout">
      <section class="stage game-stage glass" style="--h:${g.hue};--art:${stageArt(id, g.hue)}">
        <div class="stage-head">
          <button class="btn ghost icon-btn back" id="back" aria-label="Voltar ao menu">${icon('arrow-left')}</button>
          <span class="gtile" id="gtile" aria-hidden="true">${icon(g.icon)}</span>
          <div class="title"><h2>${g.name}</h2><p title="${esc(g.desc)}">${firstSentence(g.desc)}</p></div>
          <div class="head-acts">
            <button class="btn ghost" id="how" aria-label="Como jogar" title="Como jogar">${icon('circle-help')}<span>Como jogar</span></button>
            ${g.daily ? '' : `<button class="btn ghost" id="restart" aria-label="Reiniciar">${icon('rotate-ccw')}<span>Reiniciar</span></button>`}
          </div>
        </div>
        <div class="game" id="game"></div>
      </section>
      <aside class="board glass" id="board" style="--h:${g.hue}">${boardHtml(id)}</aside>
    </div>`;
    $('#back').onclick = showMenu;
    if (g.daily) setMenuTab('daily'); // voltar ao menu cai na aba dos diários
    else $('#restart').onclick = () => play(id);
    $('#how').onclick = () => { if (!HOWTO[id]) return; stop(); const el = $('#game'); el.innerHTML = ''; cleanup = showHowto(id, el, () => play(id)); };
    mountHeadScene(id);
    renderBoard(id);
    fetchScores().then(() => renderBoard(id));
    loadSocial().then(() => currentView === id && renderBoard(id));
    main.classList.add('game-view');
    main.dataset.game = id; // o CSS pode dar mais largura a um jogo (a Sinuca deitada no PC)
    window.scrollTo(0, 0);
    fitGame();
    const el = $('#game');
    partSummary = null;
    let pass = null; // partida aberta no servidor (jogos de arcade)
    const onDone = async (score, proof) => {
      stop();
      if (!el.isConnected) return; // saiu da partida (voltou ao menu, trocou de tela) antes de terminar
      // done(null, 'motivo'): partida acabou sem pontuação (ex.: explodiu no Campo Minado) — nada é salvo
      if (score === null) {
        el.innerHTML = `<div class="result lost">${resultArt(g, 'bomb')}<h3 class="res-title">Fim de jogo</h3>
          <p class="hint res-why">${esc(proof || 'Não completou, nada foi salvo.')}</p>
          <div class="res-actions"><button class="btn" id="again">${icon('rotate-ccw')} Jogar de novo</button><button class="btn ghost" id="resMenu">Menu</button></div></div>`;
        $('#again').onclick = () => play(id);
        $('#resMenu').onclick = showMenu;
        $('#again').focus();
        cleanup = mountResultArt(id, el);
        return;
      }
      // compara com o geral e com o mês, independente do que o ranking está mostrando
      const ALL = {}, MONTH = { since: monthStart() };
      const mine = range => bestPerPlayer(id, range).find(([n]) => n === player);
      const prev = mine(ALL), prevMonth = mine(MONTH);
      const hadAch = unlockedFor(player);
      const cheat = g.check?.(score, proof);
      const status = cheat || await saveScore(id, score, proof, pass);
      if (!el.isConnected) return; // trocou de tela enquanto salvava: o resultado já foi enviado, só não há onde mostrar
      const ok = status === 'ok' || status === 'queued';
      const record = ok && (!prev || better(g, score, prev[1]));
      const monthBest = ok && (!prevMonth || better(g, score, prevMonth[1]));
      const leads = range => { const top = bestPerPlayer(id, range)[0]; return top && top[0] === player && top[1] === score; };
      // jogo diário: uma partida por dia e ranking só de hoje, então não tem recorde nem mês
      const todayLead = ok && g.daily && leads(dayRange());
      const champ = !g.daily && record && leads(ALL);
      const monthChamp = !g.daily && monthBest && leads(MONTH);
      const dailyLead = ok && id === dailyGame() && leads(dayRange());
      const month = monthName(monthKey(Date.now())).toLowerCase();
      const hasAch = ok ? unlockedFor(player) : hadAch;
      const newAch = ACHIEVEMENTS.filter(x => !hadAch.has(x.id) && hasAch.has(x.id));
      renderBoard(id);
      const summary = partSummary; partSummary = null;
      // o jogo pode mostrar outro número em destaque (Ritmo: a pontuação da música; score = a geral, que vai pro ranking)
      const shown = proof && typeof proof === 'object' ? proof.shown : null;
      el.innerHTML = `<div class="result">${resultArt(g)}
        <span class="label">${shown ? esc(shown.label) : 'Resultado'}</span>
        <span class="score">${fmt(g, shown ? shown.score : score)}</span>
        ${status === 'login' ? `<span class="badge warn">${icon('key-round')} Você não estava logado — entre pra salvar este resultado.</span><button class="btn" id="loginSave">Entrar e salvar</button>`
          : !ok ? `<span class="badge warn">${icon('bot')} Não valeu: ${esc(status)}. Resultado não foi salvo.</span>`
          : g.daily ? (todayLead ? `<span class="badge">${icon('crown')} Em 1º hoje!</span>` : '')
          : champ ? `<span class="badge">${icon('crown')} Recorde geral!</span>`
          : monthChamp ? `<span class="badge">${icon('calendar')} Liderando ${month}!</span>`
          : dailyLead ? `<span class="badge">${icon('star')} Liderando o desafio de hoje!</span>`
          : record ? `<span class="badge">${icon('party-popper')} Novo recorde pessoal!</span>`
          : monthBest ? `<span class="badge">${icon('trending-up')} Seu melhor de ${month}!</span>`
          : prev ? `<span class="hint">Seu recorde: ${fmt(g, prev[1])}${prevMonth ? ` · em ${month}: ${fmt(g, prevMonth[1])}` : ''}</span>` : ''}
        ${ok ? placeLine(g, id, score) : ''}
        ${summary?.length ? `<dl class="part-sum">${summary.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
        ${newAch.length ? `<div class="ach-row"><span class="ach-h">${newAch.length > 1 ? `${newAch.length} conquistas novas` : 'Conquista nova'}</span>
          <div>${newAch.map(x => `<span class="badge ach-new">${icon(x.icon)} ${x.name}</span>`).join('')}</div></div>` : ''}
        ${status === 'queued' ? `<span class="badge warn">${icon('triangle-alert')} Servidor fora do ar: resultado guardado, envio automático quando ele voltar</span>` : ''}
        <div class="res-actions">${g.daily
          ? `<button class="btn" id="again">${icon('calendar')} Outros jogos diários</button><button class="btn ghost" id="resRank">${icon('trophy')} Ranking de hoje</button>`
          : `<button class="btn" id="again">${icon('rotate-ccw')} Jogar de novo</button><button class="btn ghost" id="resMenu">Menu</button>`}</div>
        ${g.daily ? '<span class="hint">Volte amanhã pra um desafio novo.</span>' : ''}
      </div>`;
      announce(`Resultado: ${fmt(g, score)}. ${!ok ? 'Não foi salvo.' : !g.daily && record ? 'Novo recorde!' : ''}`);
      if (g.daily ? todayLead : record || monthChamp || dailyLead) { confetti(); sfx.record(); }
      $('#again').onclick = () => (g.daily ? showMenu() : play(id));
      $('#resMenu')?.addEventListener('click', showMenu);
      $('#resRank')?.addEventListener('click', () => rankingsModal('daily'));
      $('#again').focus();
      cleanup = mountResultArt(id, el);
      $('#loginSave')?.addEventListener('click', () => { setMe(null); loginModal(); });
    };
    // 1ª vez no jogo: "Como jogar"; jogos com tempo: contagem 3, 2, 1; jogo do desafio: sequência igual pra todo mundo
    prepareGame(id, el, () => { seedDaily(id); pass = openPlay(id); cleanup = g.start(el, onDone, pass); });
  });
}

// "Você está em 4º de 12 em outubro · faltam 30 pontos pro 3º" (ranking do mês, melhor partida de cada um; jogo diário: só hoje)
function placeLine(g, id, score) {
  const list = bestPerPlayer(id, g.daily ? dayRange() : { since: monthStart() });
  const pos = list.findIndex(([n]) => n === player);
  if (pos < 0) return '';
  const month = monthName(monthKey(Date.now())).toLowerCase();
  let txt = `Você está em <b>${pos + 1}º de ${list.length}</b> ${g.daily ? 'hoje' : `em ${month}`}`;
  if (pos > 0) {
    const [, above] = list[pos - 1], mine = list[pos][1];
    const gap = Math.abs(above - mine);
    txt += ` · faltam <b>${fmt(g, +(g.decimals ? gap.toFixed(g.decimals) : gap) || (g.decimals ? 1 / 10 ** g.decimals : 1))}</b> pro ${pos}º`;
  }
  return `<span class="hint place">${txt}</span>`;
}

function confetti() {
  if (reduced) return;
  const colors = ['--primary', '--accent', '--yellow', '--green', '--blue'].map(css);
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px');
    c.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
    c.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
    c.style.animationDelay = Math.random() * .25 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3200);
  }
}

// ---------- conta: login, senha, menu ----------
// Chamada à API em JSON. Lança Error com a mensagem do servidor (e .status) quando não dá certo.
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.reason === 'other-device') kicked(j.error);
  if (!r.ok) throw Object.assign(new Error(j.error || `Erro ${r.status}`), { status: r.status, reason: j.reason });
  return j;
}

// Erro de JavaScript no navegador de alguém vai pro servidor (aparece no Relatório). No máximo 5 por página e sem repetir.
const sentErrors = new Set();
function reportError(message, source) {
  message = String(message || '').slice(0, 500);
  if (!me || !message || sentErrors.has(message) || sentErrors.size >= 5) return;
  sentErrors.add(message);
  const view = currentView === 'records' || currentView === 'report' ? 'admin' : currentView;
  fetch('api/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, source, view }) }).catch(() => {});
}
addEventListener('error', e => {
  if (!e.message) return; // erro carregando imagem/script: sem mensagem útil
  reportError(e.message, e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`);
});
addEventListener('unhandledrejection', e => {
  const r = e.reason;
  if (r?.status) return; // erro de API já tratado na tela (401, 423...)
  reportError(r?.message || String(r), r?.stack);
});

// Uma conta = um aparelho: se alguém logou com esta conta em outro lugar, este aparelho sai na hora.
function kicked(msg) {
  if (!me) return;
  stop();
  setMe(null); gate = null;
  showMenu();
  loginModal(msg || 'Sua conta entrou em outro dispositivo — só dá pra usar em um por vez.');
}
// texto de um aviso (balão e lista usam o mesmo): recorde tomado, reação, duelo, torneio
function noteHtml(n) {
  const g = GAMES[n.game];
  switch (n.kind) {
    case 'reaction': return `<b>${esc(n.by)}</b> reagiu ${n.emoji} ao seu recorde no ${g.name}<small>${fmt(g, n.score)}</small>`;
    case 'duel_new': return `<b>${esc(n.by)}</b> te desafiou pra um duelo de ${g.name}<small>vale a melhor partida até ${untilText(n.until).replace('até ', '')} · toque pra ver</small>`;
    case 'duel_end': return `Duelo de ${g.name} contra <b>${esc(n.vs)}</b>: ${{ win: 'você ganhou!', lose: 'você perdeu', draw: 'empate' }[n.result]}<small>${n.mine != null ? fmt(g, n.mine) : 'sem partida'} × ${n.theirs != null ? fmt(g, n.theirs) : 'sem partida'}</small>`;
    case 'duel_cancel': return `<b>${esc(n.by)}</b> cancelou o duelo de ${g.name}`;
    case 'duo_invite': return `<b>${esc(n.by)}</b> te chamou pra formar a dupla <b>${esc(n.name)}</b><small>toque pra responder · vale até ${untilText(n.until).replace('até ', '')}</small>`;
    case 'duo_record': return `<b>${esc(n.by)}</b>, da sua dupla <b>${esc(n.name)}</b>, ${n.scope === 'geral' ? 'bateu o recorde geral' : `assumiu a liderança de ${monthName(monthKey(n.at)).toLowerCase()}`} no ${g.name}<small>${fmt(g, n.score)} · toque pra jogar também</small>`;
    case 'duo_admin_new': return `O admin formou a dupla <b>${esc(n.name)}</b> entre você e <b>${esc(n.with)}</b>`;
    case 'duo_accept': return `<b>${esc(n.by)}</b> aceitou formar a dupla <b>${esc(n.name)}</b> com você`;
    case 'duo_decline': return `<b>${esc(n.by)}</b> recusou o convite pra dupla ${esc(n.name)}`;
    case 'duo_cancel': return `<b>${esc(n.by)}</b> cancelou o convite pra dupla ${esc(n.name)}`;
    case 'duo_left': return n.by === 'o admin' ? `A dupla <b>${esc(n.name)}</b> foi desfeita pelo admin` : `<b>${esc(n.by)}</b> saiu da dupla ${esc(n.name)}`;
    case 'ticket': return `Seu ticket foi resolvido: <b>${esc(n.about)}</b>${n.about.length >= 60 ? '…' : ''}<small>${n.reply ? esc(n.reply) : 'toque pra ver seus tickets'}</small>`;
    case 'tourney': return `Torneio da semana (${dayLabelBR(n.start)} – ${dayLabelBR(n.end - 1)}): você ficou em <b>${n.rank}º</b> com ${n.points} pontos`;
    default: {
      const where = n.kind === 'geral' ? 'o recorde geral' : `a liderança de ${monthName(monthKey(n.at)).toLowerCase()}`;
      return `<b>${esc(n.by)}</b> tomou ${where} no ${g.name}<small>${fmt(g, n.score)} (o seu era ${fmt(g, n.old)}) · toque pra revidar</small>`;
    }
  }
}
const isDuoNote = n => String(n.kind || '').startsWith('duo_');
const noteIcon = n => (n.kind === 'duo_record' ? 'trophy' : isDuoNote(n) ? 'users' : { reaction: 'smile', tourney: 'trophy', ticket: 'circle-check' }[n.kind] || 'swords');
const noteKnown = n => (n.kind === 'duo_record' ? !!GAMES[n.game] : n.kind === 'tourney' || n.kind === 'ticket' || isDuoNote(n) || !!GAMES[n.game]);
/** O que acontece ao tocar no aviso. */
function noteAct(n) {
  // duelo acabado: abre já com a revanche preenchida (mesmo jogo, mesma pessoa) — é só apertar Desafiar
  if (n.kind === 'duel_end') return duelsModal({ game: n.game, opponent: n.vs });
  if (n.kind === 'duel_new' || n.kind === 'duel_cancel') return duelsModal({ game: n.game });
  if (n.kind === 'duo_record') return play(n.game);
  if (n.kind === 'tourney') return showMenu();
  if (n.kind === 'ticket') return showReportPage();
  if (isDuoNote(n)) return duoModal();
  play(n.game);
}
const noteAgo = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} d`; };

// número de avisos ainda não abertos: balão no botão da conta + contagem no item "Avisos" do menu
function setUnread(n) {
  n = Number(n) || 0;
  const txt = n > 9 ? '9+' : String(n);
  for (const id of ['nbadge', 'notesCnt']) { const b = $('#' + id); if (b) { b.textContent = txt; b.hidden = !n; } }
  $('#acctBtn')?.setAttribute('aria-label', n ? `Conta, ${n} aviso${n > 1 ? 's' : ''} novo${n > 1 ? 's' : ''}` : 'Conta');
}
async function openNotes() {
  let notes = [];
  try { ({ notes } = await api('api/notifications')); } catch (err) { return modal(`<h2>Avisos</h2><p class="err">${esc(err.message)}</p><button class="btn" onclick="this.closest('.modal').remove()">Ok</button>`); }
  const rows = notes.filter(noteKnown);
  const { el, close } = modal(`<h2>${icon('bell')} Avisos</h2>
    ${rows.length ? `<div class="note-list">${rows.map((n, i) => `<button class="note-row${n.unread ? ' new' : ''}" data-i="${i}">
      <span class="ic">${icon(noteIcon(n))}</span><span>${noteHtml(n)}<small class="when">${noteAgo(Date.now() - n.at)}</small></span></button>`).join('')}</div>`
      : `<div class="empty-state">${icon('bell')}<b>Nenhum aviso por enquanto</b><span>Quando alguém passar um recorde seu, reagir a ele ou te desafiar, aparece aqui.</span></div>`}
    <button class="btn ghost" id="notesClose">Fechar</button>`);
  el.querySelector('#notesClose').onclick = close;
  el.querySelectorAll('.note-row').forEach(b => { b.onclick = () => { close(); noteAct(rows[b.dataset.i]); }; });
  if (notes.some(n => n.unread)) { setUnread(0); api('api/notifications/read', { method: 'POST', body: {} }).catch(() => {}); }
}

// avisos que chegam no ping: "Fulano tomou seu recorde" (somem sozinhos; clicar abre o jogo)
function showNotes(notes) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  for (const n of notes) {
    if (!noteKnown(n)) continue;
    const t = document.createElement('button');
    t.className = 'toast glass' + (['reaction', 'tourney', 'ticket', 'duo_accept', 'duo_admin_new', 'duo_record'].includes(n.kind) || (n.kind === 'duel_end' && n.result === 'win') ? ' good' : '');
    t.innerHTML = `<span class="ic">${icon(noteIcon(n))}</span><span>${noteHtml(n)}</span>`;
    t.onclick = () => { t.remove(); noteAct(n); };
    box.appendChild(t);
    setTimeout(() => t.remove(), 12_000);
  }
  notes.some(n => ['reaction', 'tourney', 'ticket', 'duo_invite', 'duo_accept', 'duo_admin_new', 'duo_record'].includes(n.kind) || (n.kind === 'duel_end' && n.result === 'win')) ? sfx.good?.() : sfx.bad?.();
}
async function pingSession() {
  if (!me || document.hidden) return;
  try {
    const { block, notes, unread } = await api('api/auth/ping?view=' + encodeURIComponent(currentView === 'records' || currentView === 'report' ? 'admin' : currentView));
    if (notes?.length) { showNotes(notes); loadSocial().then(() => currentView === 'menu' && refreshMenu()); }
    setUnread(unread);
    // admin bloqueou (ou liberou): atualiza; se estava jogando, encerra a partida
    if (!!block !== !!gate?.manual) {
      const playing = GAMES[currentView];
      await refreshGate(true);
      if (block && playing) { stop(); showMenu(); gateDialog(); }
    }
  }
  catch (err) { if (err.status === 401) kicked(err.reason === 'other-device' ? err.message : 'Sua sessão expirou. Entre de novo.'); }
}
setInterval(pingSession, 20_000);
addEventListener('visibilitychange', () => { if (!document.hidden) pingSession(); });

// Janela modal genérica. `locked` = não fecha com Esc/clique fora (login e troca de senha obrigatória).
function modal(html, { locked = false, wide = false } = {}) {
  $('.modal')?.remove();
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="box glass${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  if (!locked) {
    m.addEventListener('click', e => { if (e.target === m) close(); });
    // no documento (não só na janela): trocar de aba dentro dela redesenha o botão focado e o foco volta pro <body>
    const onKey = e => { if (!m.isConnected) return document.removeEventListener('keydown', onKey); if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
  }
  m.querySelector('input, button')?.focus();
  return { el: m, close };
}

function setMe(user) {
  me = user;
  if (!user) setUnread(0);
  player = user?.name || '';
  $('#pname').textContent = player || '—';
  $('#acctWho').innerHTML = user ? `<b>${esc(user.name)}</b>${user.role === 'admin' ? 'Administrador' : 'Jogador'}` : '';
  $('#mAdmin').hidden = $('#sepAdmin').hidden = user?.role !== 'admin';
  $('#mReport').hidden = !user;
  applyMeFlair();
}

function passwordModal(forced) {
  const { el, close } = modal(`
    <h2>${icon('key-round')} ${forced ? 'Crie sua senha' : 'Trocar senha'}</h2>
    <p>${forced ? 'Primeiro acesso: troque a senha temporária por uma sua.' : 'Mínimo de 8 caracteres.'}</p>
    <form id="pf">
      <input class="txt" name="current" type="password" autocomplete="current-password" placeholder="${forced ? 'senha temporária' : 'senha atual'}" required>
      <input class="txt" name="next" type="password" autocomplete="new-password" placeholder="nova senha (mín. 8)" minlength="8" required>
      <input class="txt" name="again" type="password" autocomplete="new-password" placeholder="repita a nova senha" required>
      <p class="err" id="perr"></p>
      <button class="btn">Salvar senha</button>
      ${forced ? '' : '<button type="button" class="btn ghost" id="pcancel">Cancelar</button>'}
    </form>`, { locked: forced });
  el.querySelector('#pcancel')?.addEventListener('click', close);
  el.querySelector('#pf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('next') !== f.get('again')) return (el.querySelector('#perr').textContent = 'As senhas novas não batem.');
    try {
      const { user } = await api('api/auth/password', { method: 'POST', body: { current: f.get('current'), next: f.get('next') } });
      close();
      setMe(user);
      if (forced) { await saveUnsaved(); await refreshGate(); showMenu(); }
    } catch (err) { el.querySelector('#perr').textContent = err.message; }
  };
}

// Partida que terminou sem login e ficou esperando: depois de entrar, salva na conta.
let unsavedScore = null;
async function saveUnsaved() {
  if (!unsavedScore || !me || me.mustChange) return;
  const { gameId, score, proof, pass } = unsavedScore;
  unsavedScore = null;
  const status = await saveScore(gameId, score, proof, pass);
  const g = GAMES[gameId];
  modal(`<h2>${status === 'ok' || status === 'queued' ? `${icon('circle-check')} Resultado salvo` : `${icon('triangle-alert')} Não deu pra salvar`}</h2>
    <p>${g.name}: <b>${fmt(g, score)}</b>${status === 'ok' || status === 'queued' ? ' — já está no ranking.' : ' — ' + esc(status)}</p>
    <button class="btn" onclick="this.closest('.modal').remove()">Ok</button>`);
}

async function afterLogin(user) {
  setMe(user);
  pingSession(); // já traz o número de avisos novos
  if (user.canEditRecords) api('api/auth/me').then(r => setOpenTickets(r.openTickets)).catch(() => {});
  if (user.mustChange) return passwordModal(true);
  await saveUnsaved();
  await refreshGate();
  showMenu();
}

async function logout() {
  await api('api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
  setMe(null); gate = null;
  stop(); showMenu();
  loginModal();
}

// ---------- bloqueio por fila do Geiko ----------
async function refreshGate(force = false) {
  if (!me || me.mustChange) { gate = null; renderGate(); return null; }
  try { gate = await api('api/gate' + (force ? '?force=1' : '')); } catch { /* sem rede: mantém o último */ }
  renderGate();
  return gate;
}

const fmtW = n => String(n).replace('.', ',');
// "até 14:30", "até 16/10 09:00" ou "até o admin liberar"
function untilText(ms) {
  if (!ms || ms > 1e15) return 'até o admin liberar';
  const d = new Date(ms), today = new Date().toDateString() === d.toDateString();
  return 'até ' + (today ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
// Status da fila do Geiko: selo pequeno no header (só pra quem tem ID do Geiko ou foi bloqueado pelo admin);
// clicar abre o painel com os detalhes.
const gateVisible = () => !!gate && (!!gate.manual || (gate.linked && gate.enabled));
function gatePillHtml() {
  if (gate.manual) return `${icon('lock')} <span>Bloqueado</span>`;
  if (gate.error) return `${icon('triangle-alert')} <span>Geiko</span>`;
  return `${icon(gate.blocked ? 'lock' : 'circle-check')} <span>${fmtW(gate.total)}<small>/${fmtW(gate.limit)}</small></span>`;
}
function gatePopHtml() {
  if (gate.manual) {
    return `<b>${icon('lock')} Jogos bloqueados pelo admin</b>
      <p>Bloqueado ${untilText(gate.manual.until)}.${gate.manual.reason ? ` Motivo: ${esc(gate.manual.reason)}` : ''}</p>
      <div class="acts"><button class="btn ghost" id="gateRefresh">${icon('refresh-cw')} Atualizar</button></div>`;
  }
  const pct = Math.min(100, gate.limit ? (gate.total / gate.limit) * 100 : 100);
  if (gate.free) {
    return `<b>${icon('circle-check')} Horário livre</b>
      <p>Fora do expediente todo mundo joga, com ou sem ticket aberto. A fila volta a contar ${untilText(gate.free.until).replace('até', 'às')}.
        ${gate.error ? '' : `Sua fila agora: <b>${fmtW(gate.total)}</b> de ${fmtW(gate.limit)} pontos.`}</p>
      <div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <div class="acts"><button class="btn ghost" id="gateSee">Ver tickets</button><button class="btn ghost" id="gateRefresh">${icon('refresh-cw')} Atualizar</button></div>`;
  }
  return `<b>${gate.blocked ? icon('lock') + ' Jogos bloqueados' : icon('circle-check') + ' Liberado pra jogar'}</b>
    <p>${gate.error ? esc(gate.error) : `Sua fila no Geiko soma <b>${fmtW(gate.total)}</b> pontos — o limite é ${fmtW(gate.limit)}. ${gateHint()}`}</p>
    <div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <div class="acts"><button class="btn ghost" id="gateSee">Ver tickets</button><button class="btn ghost" id="gateRefresh">${icon('refresh-cw')} Atualizar</button></div>`;
}
function toggleGatePop(open = $('#gatePop').hidden) {
  const pop = $('#gatePop');
  if (open) { // fixo logo abaixo do selo, alinhado à direita dele, sem sair da tela
    const r = $('#gatePill').getBoundingClientRect();
    pop.style.top = r.bottom + 8 + 'px';
    pop.style.right = Math.max(16, innerWidth - r.right) + 'px';
  }
  pop.hidden = !open;
  $('#gatePill').setAttribute('aria-expanded', open);
}
document.addEventListener('click', e => { if (!e.target.closest('.gate-wrap') && !$('#gatePop').hidden) toggleGatePop(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#gatePop').hidden) { toggleGatePop(false); $('#gatePill').focus(); } });
// Bloqueado: o menor número de tickets que, resolvidos, liberam (os mais pesados primeiro).
// Liberado: quanto ainda cabe na fila antes de bloquear.
function gateHint() {
  const over = Math.round((gate.total - gate.limit) * 100) / 100;
  if (!gate.blocked) {
    const room = Math.round((gate.limit - gate.total) * 100) / 100;
    return room > 0 ? `Ainda ${room > 1 ? 'cabem' : 'cabe'} <b>${fmtW(room)}</b> ponto${room > 1 ? 's' : ''} na fila antes de bloquear.` : 'No limite: mais um ticket e bloqueia.';
  }
  const sorted = [...(gate.tickets || [])].sort((a, b) => b.weight - a.weight);
  const pick = [];
  let cut = 0;
  for (const t of sorted) { if (cut >= over) break; pick.push(t); cut += t.weight; }
  if (cut < over || !pick.length) return 'Resolva os tickets pra liberar.';
  const ids = pick.slice(0, 3).map(t => `#${t.id}`).join(', ') + (pick.length > 3 ? '…' : '');
  return `${pick.length <= 2 ? 'Falta pouco: resolva' : 'Resolva'} <b>${pick.length} ticket${pick.length > 1 ? 's' : ''}</b> (${ids}) pra liberar.`;
}
function renderGate() {
  const show = gateVisible();
  $('#gateWrap').hidden = !show;
  if (show) {
    const pill = $('#gatePill');
    pill.className = `gate-pill ${gate.blocked ? 'blocked' : gate.error ? 'warn' : 'ok'}`;
    pill.innerHTML = gatePillHtml();
    pill.title = gate.blocked ? 'Jogos bloqueados — clique pra ver' : gate.free ? 'Horário livre — clique pra ver' : 'Sua fila no Geiko — clique pra ver';
    pill.onclick = () => toggleGatePop();
    const pop = $('#gatePop');
    pop.className = `gate-pop glass ${gate.blocked ? 'blocked' : 'ok'}`;
    pop.innerHTML = gatePopHtml();
    $('#gateSee')?.addEventListener('click', () => { toggleGatePop(false); gateDialog(); });
    $('#gateRefresh')?.addEventListener('click', async e => { e.stopPropagation(); e.target.disabled = true; await refreshGate(true); toggleGatePop(true); });
  } else toggleGatePop(false);
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('locked', !!gate?.blocked));
}

function ticketsTable(tickets) {
  if (!tickets.length) return '<p class="hint" style="text-align:left">Nenhum ticket aberto.</p>';
  return `<div class="scroll"><table class="tickets"><thead><tr><th>Ticket</th><th>Prioridade</th><th>Status</th><th style="text-align:right">Peso</th></tr></thead><tbody>
    ${tickets.map(t => `<tr><td>#${t.id}${t.reason ? `<br><span class="tag">${esc(t.reason)}</span>` : ''}</td><td>${esc(t.priority)}</td><td>${esc(t.status)}</td><td class="w">${fmtW(t.weight)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function gateDialog() {
  if (!gate) return;
  if (gate.manual) {
    const { el, close } = modal(`<h2>${icon('lock')} Jogos bloqueados</h2>
      <p>O admin bloqueou seus jogos ${untilText(gate.manual.until)}.</p>
      ${gate.manual.reason ? `<p><b>Motivo:</b> ${esc(gate.manual.reason)}</p>` : ''}
      <button class="btn" id="gclose">Ok</button>`);
    return (el.querySelector('#gclose').onclick = close);
  }
  const { el, close } = modal(`
    <h2>${gate.blocked ? icon('lock') + ' Fila cheia' : 'Sua fila no Geiko'}</h2>
    <p>Cada ticket tem um peso: sem prioridade ou sem interação pesa mais; aguardando o cliente pesa menos.
      Soma atual <b>${fmtW(gate.total)}</b>, limite <b>${fmtW(gate.limit)}</b>.${gate.free ? ` Agora é horário livre: liberado ${untilText(gate.free.until)}.` : ''}</p>
    ${ticketsTable(gate.tickets)}
    <button class="btn" id="gclose">Fechar</button>`, { wide: true });
  el.querySelector('#gclose').onclick = close;
}

