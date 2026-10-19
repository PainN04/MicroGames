// ---------- telas ----------
function stop() { if (cleanup) { cleanup(); cleanup = null; } }
function swap(render) {
  if (document.startViewTransition && !reduced) document.startViewTransition(render);
  else render();
}
function announce(msg) { $('#live').textContent = msg; }

function recHtml(id) {
  const g = GAMES[id], top = bestPerPlayer(id)[0];
  const fr = top && flair.frames[top[0]]; // nome do recordista: branco, ou na cor da moldura de avatar dele
  return top ? `${icon('trophy')} <b${fr ? ` class="fr-${fr}"` : ''}>${esc(top[0])}</b> · ${fmt(g, top[1])}`
    : seasonMode === 'all' ? 'Sem recorde — seja o primeiro' : `Ninguém jogou em ${seasonLabel().toLowerCase()}`;
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
  renderWeek();
}
// texto do destaque de tickets ('' se não há dados do Geiko); aparece na janela "Rankings"
function weekInnerHtml(d = weekData) {
  if (!d || (!d.champion && d.me == null)) return '';
  const list = d.people?.filter(p => p.count > 0).slice(0, 5);
  return `<span class="ic">${icon('ticket')}</span>
    <div><b>${d.champion ? `Destaque da semana: <a href="#" data-profile="${esc(d.champion.name)}">${esc(d.champion.name)}</a> — ${d.champion.count} ticket${d.champion.count > 1 ? 's' : ''} resolvido${d.champion.count > 1 ? 's' : ''}` : 'Ninguém resolveu ticket esta semana ainda'}</b>
      <small>${list?.length > 1 ? list.map((p, k) => `${k + 1}º ${esc(p.name)} ${p.count}`).join(' · ') + ' · ' : ''}${d.me != null ? `Você: ${d.me} desde segunda.` : ''} Quem mais resolver até sexta ganha o selo de ticket no ranking.</small></div>`;
}
function renderWeek() { /* o destaque dos tickets agora fica na janela "Rankings" (atalho do menu) */ }

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
    <div class="daily-side">${dailySideHtml()}</div>
    <div class="daily-champs champs" id="champs" hidden></div>`;
}
// ranking do dia (atualiza sozinho quando o placar chega, sem redesenhar o palco 3D)
function dailySideHtml() {
  const id = dailyGame(), g = GAMES[id], rows = bestPerPlayer(id, dayRange()).slice(0, 3);
  const wins = dailyWinsThisMonth().slice(0, 5);
  return `<h3>Ranking de hoje</h3>
      ${rows.length ? '<ol>' + rows.map(([n, s], k) => `<li class="${n === player ? 'me' : ''}">${rankBadge(k + 1)} ${nameHtml(n)} <b>${fmt(g, s)}</b></li>`).join('') + '</ol>'
        : '<p class="hint" style="text-align:left;margin:0">Ninguém jogou hoje ainda — saia na frente.</p>'}
      ${wins.length ? `<p class="hint wins">Vitórias em ${monthName(monthKey(Date.now())).toLowerCase()}: ${wins.map(([n, c]) => `${esc(n)} <b>${c}</b>`).join(' · ')}</p>` : ''}`;
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
// Jogos em destaque aparecem primeiro no menu; o resto segue a ordem do GAMES.
const FEATURED = ['blocos'];
const menuOrder = () => [...FEATURED, ...Object.keys(GAMES).filter(id => !FEATURED.includes(id))].map(id => [id, GAMES[id]]);
function renderMenu() {
  main.classList.remove('game-view');
  main.replaceChildren(heroNode);
  main.insertAdjacentHTML('beforeend', `
    <button class="crown-bar" id="crownBar" hidden></button>
    <section class="daily glass" id="daily" data-game="${dailyGame()}" style="--h:${GAMES[dailyGame()].hue}">${dailyHtml()}</section>
    <div class="strip" id="strip"${me ? '' : ' hidden'}></div>
    <div class="menu-bar"><h2>Jogos</h2><span class="hint">Ranking:</span>${seasonSeg()}</div>
    <section class="grid" aria-label="Jogos">` +
    menuOrder().map(([id, g], i) => `<button class="card glass" data-id="${id}" style="--h:${g.hue};--i:${i}" title="${esc(g.desc)}">
        <span class="icon">${icon(g.icon)}</span>
        <h3>${g.name}</h3>
        <span class="rec">${recHtml(id)}</span>
      </button>`).join('') + `</section>
`);
  renderCrown(); renderChamps(); renderStrip();
  main.querySelectorAll('.card').forEach(c => c.onclick = () => play(c.dataset.id));
  bindSeasonSeg(main.querySelector('.menu-bar'), refreshMenu);
  bindDaily();
  renderWeek();
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
  renderCrown();
  renderStrip();
  const side = $('#daily .daily-side');
  if (side) side.innerHTML = dailySideHtml();
  renderChamps();
  refreshPickRow();
  applyMeFlair();
}
async function showMenu() {
  stop();
  const changed = currentView !== 'menu';
  currentView = 'menu';
  if (changed) setTimeout(pingSession, 0);
  swap(renderMenu);
  const week = loadWeek(); // tickets da semana (Geiko) em paralelo com o ranking — só aparecem na janela "Rankings"
  await Promise.all([fetchScores(), loadSocial()]);
  // o jogo do dia mudou depois que o servidor respondeu (ex.: o vencedor de ontem escolheu o de hoje): redesenha o menu
  if (currentView === 'menu' && $('#daily') && $('#daily').dataset.game !== dailyGame()) renderMenu();
  if (currentView === 'menu') { refreshMenu(); maybeCongrats(); }
  checkVersion();
  if (me && !me.mustChange) refreshGate();
  await week;
  if (currentView === 'menu') refreshMenu();
}

function boardHtml(id) {
  const g = GAMES[id], rows = bestPerPlayer(id).slice(0, 10);
  return `<h3>${icon('trophy')} Ranking</h3>${seasonSeg()}` + (rows.length
    ? '<ol>' + rows.map(([n, s], k) => `<li class="${n === player ? 'me' : ''}"><span class="pos">${rankBadge(k + 1)}</span>${nameHtml(n, { cls: 'name', extra: ticketStar(n) })}<span class="sc">${fmt(g, s)}</span>${rxButton(id, n)}${rxChips(id, n)}</li>`).join('') + '</ol>'
    : `<p class="empty">${seasonMode === 'all' ? 'Ninguém jogou ainda.' : `Ninguém jogou em ${seasonLabel().toLowerCase()} ainda.`}</p>`)
    + (me ? `<button class="btn ghost board-duel" data-duel="${id}">${icon('swords')} Desafiar alguém</button>` : '');
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
      <section class="stage glass" style="--h:${g.hue}">
        <div class="stage-head">
          <button class="btn ghost icon-btn back" id="back" aria-label="Voltar ao menu">${icon('arrow-left')}</button>
          <div class="title"><h2>${icon(g.icon)}${g.name}</h2><p>${g.desc}</p></div>
          <button class="btn ghost" id="restart" aria-label="Reiniciar">${icon('rotate-ccw')}<span>Reiniciar</span></button>
        </div>
        <div class="game" id="game"></div>
      </section>
      <aside class="board glass" id="board">${boardHtml(id)}</aside>
    </div>`;
    $('#back').onclick = showMenu;
    $('#restart').onclick = () => play(id);
    renderBoard(id);
    fetchScores().then(() => renderBoard(id));
    loadSocial().then(() => currentView === id && renderBoard(id));
    main.classList.add('game-view');
    window.scrollTo(0, 0);
    fitGame();
    const el = $('#game');
    cleanup = g.start(el, async (score, proof) => {
      stop();
      // done(null, 'motivo'): partida acabou sem pontuação (ex.: explodiu no Campo Minado) — nada é salvo
      if (score === null) {
        el.innerHTML = `<div class="result"><span class="label">Fim de jogo</span><span class="score">${icon('bomb', { cls: 'big' })}</span>
          <span class="hint">${esc(proof || 'Não completou — nada foi salvo.')}</span><button class="btn" id="again">Jogar de novo</button></div>`;
        $('#again').onclick = () => play(id);
        $('#again').focus();
        return;
      }
      // compara com o geral e com o mês, independente do que o ranking está mostrando
      const ALL = {}, MONTH = { since: monthStart() };
      const mine = range => bestPerPlayer(id, range).find(([n]) => n === player);
      const prev = mine(ALL), prevMonth = mine(MONTH);
      const hadAch = unlockedFor(player);
      const cheat = g.check?.(score, proof);
      const status = cheat || await saveScore(id, score, proof);
      const ok = status === 'ok' || status === 'queued';
      const record = ok && (!prev || better(g, score, prev[1]));
      const monthBest = ok && (!prevMonth || better(g, score, prevMonth[1]));
      const leads = range => { const top = bestPerPlayer(id, range)[0]; return top && top[0] === player && top[1] === score; };
      const champ = record && leads(ALL);
      const monthChamp = monthBest && leads(MONTH);
      const dailyLead = ok && id === dailyGame() && leads(dayRange());
      const month = monthName(monthKey(Date.now())).toLowerCase();
      const hasAch = ok ? unlockedFor(player) : hadAch;
      const newAch = ACHIEVEMENTS.filter(x => !hadAch.has(x.id) && hasAch.has(x.id));
      renderBoard(id);
      el.innerHTML = `<div class="result">
        <span class="label">Resultado</span>
        <span class="score">${fmt(g, score)}</span>
        ${status === 'login' ? `<span class="badge warn">${icon('key-round')} Você não estava logado — entre pra salvar este resultado.</span><button class="btn" id="loginSave">Entrar e salvar</button>`
          : !ok ? `<span class="badge warn">${icon('bot')} Não valeu: ${esc(status)}. Resultado não foi salvo.</span>`
          : champ ? `<span class="badge">${icon('crown')} Recorde geral!</span>`
          : monthChamp ? `<span class="badge">${icon('calendar')} Liderando ${month}!</span>`
          : dailyLead ? `<span class="badge">${icon('star')} Liderando o desafio de hoje!</span>`
          : record ? `<span class="badge">${icon('party-popper')} Novo recorde pessoal!</span>`
          : monthBest ? `<span class="badge">${icon('trending-up')} Seu melhor de ${month}!</span>`
          : prev ? `<span class="hint">Seu recorde: ${fmt(g, prev[1])}${prevMonth ? ` · em ${month}: ${fmt(g, prevMonth[1])}` : ''}</span>` : ''}
        ${newAch.map(x => `<span class="badge ach-new">${icon(x.icon)} Conquista nova: ${x.name}</span>`).join('')}
        ${status === 'queued' ? `<span class="badge warn">${icon('triangle-alert')} Servidor fora do ar — resultado guardado, envio automático quando ele voltar</span>` : ''}
        <button class="btn" id="again">Jogar de novo</button>
      </div>`;
      announce(`Resultado: ${fmt(g, score)}. ${!ok ? 'Não foi salvo.' : record ? 'Novo recorde!' : ''}`);
      if (record || monthChamp || dailyLead) { confetti(); sfx.record(); }
      $('#again').onclick = () => play(id);
      $('#again').focus();
      $('#loginSave')?.addEventListener('click', () => { setMe(null); loginModal(); });
    });
  });
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
    case 'duel_end': return `Duelo de ${g.name} contra <b>${esc(n.vs)}</b>: ${{ win: 'você ganhou! 🏆', lose: 'você perdeu', draw: 'empate' }[n.result]}<small>${n.mine != null ? fmt(g, n.mine) : 'sem partida'} × ${n.theirs != null ? fmt(g, n.theirs) : 'sem partida'}</small>`;
    case 'duel_cancel': return `<b>${esc(n.by)}</b> cancelou o duelo de ${g.name}`;
    case 'duo_invite': return `<b>${esc(n.by)}</b> te chamou pra formar a dupla <b>${esc(n.name)}</b><small>toque pra responder · vale até ${untilText(n.until).replace('até ', '')}</small>`;
    case 'duo_admin_new': return `O admin formou a dupla <b>${esc(n.name)}</b> entre você e <b>${esc(n.with)}</b> 🎉`;
    case 'duo_accept': return `<b>${esc(n.by)}</b> aceitou formar a dupla <b>${esc(n.name)}</b> com você 🎉`;
    case 'duo_decline': return `<b>${esc(n.by)}</b> recusou o convite pra dupla ${esc(n.name)}`;
    case 'duo_cancel': return `<b>${esc(n.by)}</b> cancelou o convite pra dupla ${esc(n.name)}`;
    case 'duo_left': return n.by === 'o admin' ? `A dupla <b>${esc(n.name)}</b> foi desfeita pelo admin` : `<b>${esc(n.by)}</b> saiu da dupla ${esc(n.name)}`;
    case 'tourney': return `Torneio da semana (${dayLabelBR(n.start)} – ${dayLabelBR(n.end - 1)}): você ficou em <b>${n.rank}º</b> com ${n.points} pontos${n.rank === 1 ? ' 🏆' : ''}`;
    default: {
      const where = n.kind === 'geral' ? 'o recorde geral' : `a liderança de ${monthName(monthKey(n.at)).toLowerCase()}`;
      return `<b>${esc(n.by)}</b> tomou ${where} no ${g.name}<small>${fmt(g, n.score)} (o seu era ${fmt(g, n.old)}) · toque pra revidar</small>`;
    }
  }
}
const isDuoNote = n => String(n.kind || '').startsWith('duo_');
const noteIcon = n => (isDuoNote(n) ? 'users' : { reaction: 'smile', tourney: 'trophy' }[n.kind] || 'swords');
const noteKnown = n => n.kind === 'tourney' || isDuoNote(n) || !!GAMES[n.game];
/** O que acontece ao tocar no aviso. */
function noteAct(n) {
  if (n.kind === 'duel_new' || n.kind === 'duel_end' || n.kind === 'duel_cancel') return duelsModal({ game: n.game });
  if (n.kind === 'tourney') return showMenu();
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
      : '<p>Nenhum aviso por enquanto. Quando alguém passar um recorde seu, reagir a ele ou te desafiar, aparece aqui.</p>'}
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
    t.className = 'toast glass' + (['reaction', 'tourney', 'duo_accept', 'duo_admin_new'].includes(n.kind) || (n.kind === 'duel_end' && n.result === 'win') ? ' good' : '');
    t.innerHTML = `<span class="ic">${icon(noteIcon(n))}</span><span>${noteHtml(n)}</span>`;
    t.onclick = () => { t.remove(); noteAct(n); };
    box.appendChild(t);
    setTimeout(() => t.remove(), 12_000);
  }
  notes.some(n => ['reaction', 'tourney', 'duo_invite', 'duo_accept', 'duo_admin_new'].includes(n.kind) || (n.kind === 'duel_end' && n.result === 'win')) ? sfx.good?.() : sfx.bad?.();
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
    m.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
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
  $('#mAdmin').hidden = user?.role !== 'admin';
  $('#mRecords').hidden = !user?.canEditRecords;
  $('#mReport').hidden = user?.role !== 'admin';
  applyMeFlair();
}

function loginModal(msg = '') {
  const { el, close } = modal(`
    <h2>Entrar</h2><p>Use o usuário e a senha que o admin te passou. Cada conta funciona em um aparelho por vez — entrar aqui desconecta os outros.</p>
    <form id="lf">
      <input class="txt" name="username" autocomplete="username" placeholder="usuário" aria-label="Usuário" required>
      <input class="txt" name="password" type="password" autocomplete="current-password" placeholder="senha" aria-label="Senha" required>
      <p class="err" id="lerr">${esc(msg)}</p>
      <button class="btn">Entrar</button>
    </form>`, { locked: true });
  el.querySelector('#lf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target), btn = e.target.querySelector('button');
    btn.disabled = true; el.querySelector('#lerr').textContent = '';
    try {
      const { user } = await api('api/auth/login', { method: 'POST', body: { username: f.get('username'), password: f.get('password') } });
      close();
      await afterLogin(user);
    } catch (err) {
      el.querySelector('#lerr').textContent = err.message;
      btn.disabled = false;
    }
  };
}

function passwordModal(forced) {
  const { el, close } = modal(`
    <h2>${forced ? 'Crie sua senha' : 'Trocar senha'}</h2>
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
  const { gameId, score, proof } = unsavedScore;
  unsavedScore = null;
  const status = await saveScore(gameId, score, proof);
  const g = GAMES[gameId];
  modal(`<h2>${status === 'ok' || status === 'queued' ? `${icon('circle-check')} Resultado salvo` : `${icon('triangle-alert')} Não deu pra salvar`}</h2>
    <p>${g.name}: <b>${fmt(g, score)}</b>${status === 'ok' || status === 'queued' ? ' — já está no ranking.' : ' — ' + esc(status)}</p>
    <button class="btn" onclick="this.closest('.modal').remove()">Ok</button>`);
}

async function afterLogin(user) {
  setMe(user);
  pingSession(); // já traz o número de avisos novos
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

