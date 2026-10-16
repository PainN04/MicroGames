// ---------- telas ----------
function stop() { if (cleanup) { cleanup(); cleanup = null; } }
function swap(render) {
  if (document.startViewTransition && !reduced) document.startViewTransition(render);
  else render();
}
function announce(msg) { $('#live').textContent = msg; }

function recHtml(id) {
  const g = GAMES[id], top = bestPerPlayer(id)[0];
  return top ? `🏆 <b>${esc(top[0])}</b> · ${fmt(g, top[1])}`
    : seasonMode === 'all' ? 'Sem recorde ainda — seja o primeiro' : `Ninguém jogou em ${seasonLabel().toLowerCase()} — seja o primeiro`;
}
function kingsHtml() {
  const kings = champions();
  const title = seasonMode === 'all' ? '👑 Quem manda no escritório (geral)' : `👑 Quem manda em ${seasonLabel().toLowerCase()}`;
  return `<h2>${title}</h2>` + (kings.length
    ? '<ol>' + kings.map(([n, c], k) => `<li>${['🥇', '🥈', '🥉'][k] || '•'} <a href="#" data-profile="${esc(n)}">${esc(n)}</a>${ticketStar(n)} — <b>${c}</b> ${c > 1 ? 'recordes' : 'recorde'}</li>`).join('') + '</ol>'
    : '<p class="hint" style="text-align:left">Ninguém tem recorde ainda.</p>')
    + (seasonMode === 'month' ? `<p class="hint" style="text-align:left;margin:var(--space-sm) 0 0">O ranking do mês zera no dia 1º. Quem tiver mais recordes no fim do mês entra no Hall da fama.</p>` : '');
}
// campeões dos meses que já acabaram
function hallHtml() {
  const hall = hallOfFame();
  if (!hall.length) return '';
  return '<h2>🏛️ Hall da fama</h2><div class="hall">' + hall.map(({ key, kings, games }) => {
    const [king] = kings;
    return `<details class="hall-month"><summary><span class="m">${monthName(key, true)}</span>
        ${king ? `<span>👑 <b><a href="#" data-profile="${esc(king[0])}">${esc(king[0])}</a></b> · ${king[1]} ${king[1] > 1 ? 'recordes' : 'recorde'}</span>` : ''}</summary>
      <ul>${games.map(([id, [n, s]]) => `<li><span>${GAMES[id].emoji} ${GAMES[id].name}</span><span>${esc(n)} · ${fmt(GAMES[id], s)}</span></li>`).join('')}</ul>
    </details>`;
  }).join('') + '</div>';
}
// destaque da semana no Geiko: quem mais resolveu tickets desde segunda (vem de /api/geiko/week)
let weekData = null;
const ticketStar = n => (weekData?.champion && n === weekData.champion.name ? ' <span title="Quem mais resolveu tickets na semana">🎫</span>' : '');
async function loadWeek() {
  if (!me || localMode) return;
  try { weekData = await api('api/geiko/week'); } catch { weekData = null; }
  renderWeek();
}
function renderWeek() {
  const box = $('#week');
  if (!box) return;
  const d = weekData;
  if (!d || (!d.champion && d.me == null)) { box.hidden = true; return; }
  box.hidden = false;
  const list = d.people?.filter(p => p.count > 0).slice(0, 5);
  box.innerHTML = `<span class="i" aria-hidden="true">🎫</span>
    <div><b>${d.champion ? `Destaque da semana: <a href="#" data-profile="${esc(d.champion.name)}">${esc(d.champion.name)}</a> — ${d.champion.count} ticket${d.champion.count > 1 ? 's' : ''} resolvido${d.champion.count > 1 ? 's' : ''}` : 'Ninguém resolveu ticket esta semana ainda'}</b>
      <small>${list?.length > 1 ? list.map((p, k) => `${k + 1}º ${esc(p.name)} ${p.count}`).join(' · ') + ' · ' : ''}${d.me != null ? `Você: ${d.me} desde segunda.` : ''} Quem mais resolver até sexta ganha o 🎫 no ranking.</small></div>`;
}

// quadro do desafio do dia (topo do menu)
function dailyHtml() {
  const id = dailyGame(), g = GAMES[id], rows = bestPerPlayer(id, dayRange()).slice(0, 3);
  const wins = dailyWinsThisMonth().slice(0, 5);
  const hoursLeft = Math.max(1, Math.ceil((dayStart(dayIndex() + 1) - Date.now()) / 3_600_000));
  return `<div class="daily-main">
      <span class="icon" aria-hidden="true">${g.emoji}</span>
      <div><span class="tag">⭐ Desafio de hoje · acaba em ${hoursLeft}h</span><h2>${g.name}</h2>
        <p class="hint" style="text-align:left;margin:0">Vale a sua melhor partida de hoje. Amanhã é outro jogo.</p></div>
      <button class="btn" id="dailyPlay">Jogar</button>
    </div>
    <div class="daily-side">
      ${rows.length ? '<ol>' + rows.map(([n, s], k) => `<li class="${n === player ? 'me' : ''}">${['🥇', '🥈', '🥉'][k]} <a href="#" data-profile="${esc(n)}">${esc(n)}</a> <b>${fmt(g, s)}</b></li>`).join('') + '</ol>'
        : '<p class="hint" style="text-align:left;margin:0">Ninguém jogou hoje ainda — saia na frente.</p>'}
      ${wins.length ? `<p class="hint" style="text-align:left;margin:var(--space-xs) 0 0">Vitórias em ${monthName(monthKey(Date.now())).toLowerCase()}: ${wins.map(([n, c]) => `${esc(n)} <b>${c}</b>`).join(' · ')}</p>` : ''}
    </div>`;
}
function bindDaily() { $('#dailyPlay') && ($('#dailyPlay').onclick = () => play(dailyGame())); }
function seasonSeg() {
  return `<div class="seg season-seg" role="group" aria-label="Ranking">
    ${[['month', `🗓️ ${monthName(monthKey(Date.now()))}`], ['all', '🏛️ Geral']].map(([m, l]) => `<button data-season="${m}" aria-pressed="${seasonMode === m}">${l}</button>`).join('')}
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
    <section class="gate glass" id="gate" hidden aria-live="polite"></section>
    <section class="daily glass" id="daily" style="--h:${GAMES[dailyGame()].hue}">${dailyHtml()}</section>
    <section class="week glass" id="week" hidden></section>
    <div class="menu-bar"><span class="hint">Ranking:</span>${seasonSeg()}</div>
    <section class="grid" aria-label="Jogos">` +
    menuOrder().map(([id, g], i) => `<button class="card glass" data-id="${id}" style="--h:${g.hue};--i:${i}">
        <span class="icon" aria-hidden="true">${g.emoji}</span>
        <h3>${g.name}</h3><p>${g.desc}</p>
        <span class="rec">${recHtml(id)}</span>
      </button>`).join('') + `</section>
    <section class="kings glass" id="kings">${kingsHtml()}</section>
    <section class="kings glass" id="hall">${hallHtml()}</section>`);
  $('#hall').hidden = !$('#hall').innerHTML;
  main.querySelectorAll('.card').forEach(c => c.onclick = () => play(c.dataset.id));
  bindSeasonSeg(main.querySelector('.menu-bar'), refreshMenu);
  bindDaily();
  renderWeek();
  // card do jogo do dia ganha um selo
  $(`.card[data-id="${dailyGame()}"]`)?.classList.add('is-daily');
  renderGate();
  prefetchPhaser();
}
// Quando o ranking novo chega, só troca os textos (sem redesenhar nem reanimar os cards).
function refreshMenu() {
  if (!$('#kings')) return;
  for (const id in GAMES) { const rec = $(`.card[data-id="${id}"] .rec`); if (rec) rec.innerHTML = recHtml(id); }
  $('#kings').innerHTML = kingsHtml();
  $('#daily').innerHTML = dailyHtml();
  bindDaily();
  $('#hall').innerHTML = hallHtml();
  $('#hall').hidden = !$('#hall').innerHTML;
}

async function showMenu() {
  stop();
  const changed = currentView !== 'menu';
  currentView = 'menu';
  if (changed) setTimeout(pingSession, 0);
  swap(renderMenu);
  await fetchScores();
  if (currentView === 'menu') refreshMenu();
  checkVersion();
  if (me && !me.mustChange) refreshGate();
  await loadWeek();
  if (currentView === 'menu') refreshMenu();
}

function boardHtml(id) {
  const g = GAMES[id], rows = bestPerPlayer(id).slice(0, 10);
  return `<h3>🏆 Ranking</h3>${seasonSeg()}` + (rows.length
    ? '<ol>' + rows.map(([n, s], k) => `<li class="${n === player ? 'me' : ''}"><span class="pos">${['🥇', '🥈', '🥉'][k] || k + 1}</span><a class="name" href="#" data-profile="${esc(n)}">${esc(n)}${ticketStar(n)}</a><span>${fmt(g, s)}</span></li>`).join('') + '</ol>'
    : `<p class="empty">${seasonMode === 'all' ? 'Ninguém jogou ainda.' : `Ninguém jogou em ${seasonLabel().toLowerCase()} ainda.`}</p>`);
}
// desenha o ranking da partida e liga o seletor Mês/Geral
function renderBoard(id) {
  const b = $('#board');
  if (!b) return;
  b.innerHTML = boardHtml(id);
  bindSeasonSeg(b, () => renderBoard(id));
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
          <button class="btn ghost" id="back" aria-label="Voltar ao menu">←</button>
          <div class="title"><h2><span aria-hidden="true">${g.emoji}</span>${g.name}</h2><p>${g.desc}</p></div>
          <button class="btn ghost" id="restart">↻ Reiniciar</button>
        </div>
        <div class="game" id="game"></div>
      </section>
      <aside class="board glass" id="board">${boardHtml(id)}</aside>
    </div>`;
    $('#back').onclick = showMenu;
    $('#restart').onclick = () => play(id);
    renderBoard(id);
    fetchScores().then(() => renderBoard(id));
    main.classList.add('game-view');
    window.scrollTo(0, 0);
    fitGame();
    const el = $('#game');
    cleanup = g.start(el, async (score, proof) => {
      stop();
      // done(null, 'motivo'): partida acabou sem pontuação (ex.: explodiu no Campo Minado) — nada é salvo
      if (score === null) {
        el.innerHTML = `<div class="result"><span class="label">Fim de jogo</span><span class="score">💥</span>
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
        ${status === 'login' ? '<span class="badge warn">🔑 Você não estava logado — entre pra salvar este resultado.</span><button class="btn" id="loginSave">Entrar e salvar</button>'
          : !ok ? `<span class="badge warn">🤖 Não valeu: ${esc(status)}. Resultado não foi salvo.</span>`
          : champ ? '<span class="badge">👑 Recorde geral!</span>'
          : monthChamp ? `<span class="badge">🗓️ Liderando ${month}!</span>`
          : dailyLead ? '<span class="badge">⭐ Liderando o desafio de hoje!</span>'
          : record ? '<span class="badge">🎉 Novo recorde pessoal!</span>'
          : monthBest ? `<span class="badge">📈 Seu melhor de ${month}!</span>`
          : prev ? `<span class="hint">Seu recorde: ${fmt(g, prev[1])}${prevMonth ? ` · em ${month}: ${fmt(g, prevMonth[1])}` : ''}</span>` : ''}
        ${newAch.map(x => `<span class="badge ach-new">🏅 Conquista nova: ${x.icon} ${x.name}</span>`).join('')}
        ${status === 'queued' ? '<span class="badge warn">⚠️ Servidor fora do ar — resultado guardado, envio automático quando ele voltar</span>' : ''}
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
// avisos que chegam no ping: "Fulano tomou seu recorde" (somem sozinhos; clicar abre o jogo)
function showNotes(notes) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  for (const n of notes) {
    const g = GAMES[n.game];
    if (!g) continue;
    const where = n.kind === 'geral' ? 'o recorde geral' : `a liderança de ${monthName(monthKey(n.at)).toLowerCase()}`;
    const t = document.createElement('button');
    t.className = 'toast glass';
    t.innerHTML = `<span class="i" aria-hidden="true">😈</span><span><b>${esc(n.by)}</b> tomou ${where} no ${g.emoji} ${g.name}
      <small>${fmt(g, n.score)} (o seu era ${fmt(g, n.old)}) · toque pra revidar</small></span>`;
    t.onclick = () => { t.remove(); play(n.game); };
    box.appendChild(t);
    setTimeout(() => t.remove(), 12_000);
  }
  sfx.bad?.();
}
async function pingSession() {
  if (!me || document.hidden) return;
  try {
    const { block, notes } = await api('api/auth/ping?view=' + encodeURIComponent(currentView === 'records' || currentView === 'report' ? 'admin' : currentView));
    if (notes?.length) showNotes(notes);
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
  player = user?.name || '';
  $('#pname').textContent = player || '—';
  $('#mAdmin').hidden = user?.role !== 'admin';
  $('#mRecords').hidden = !user?.canEditRecords;
  $('#mReport').hidden = user?.role !== 'admin';
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
  modal(`<h2>${status === 'ok' || status === 'queued' ? '✅ Resultado salvo' : '⚠️ Não deu pra salvar'}</h2>
    <p>${g.name}: <b>${fmt(g, score)}</b>${status === 'ok' || status === 'queued' ? ' — já está no ranking.' : ' — ' + esc(status)}</p>
    <button class="btn" onclick="this.closest('.modal').remove()">Ok</button>`);
}

async function afterLogin(user) {
  setMe(user);
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
  if (!me || me.mustChange) return (gate = null);
  try { gate = await api('api/gate' + (force ? '?force=1' : '')); } catch { /* sem rede: mantém o último */ }
  if (currentView === 'menu') renderGate();
  return gate;
}

const fmtW = n => String(n).replace('.', ',');
// "até 14:30", "até 16/10 09:00" ou "até o admin liberar"
function untilText(ms) {
  if (!ms || ms > 1e15) return 'até o admin liberar';
  const d = new Date(ms), today = new Date().toDateString() === d.toDateString();
  return 'até ' + (today ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function gateHtml() {
  if (gate?.manual) {
    return `<div class="msg"><b>🔒 Jogos bloqueados pelo admin</b>
      <p>Bloqueado ${untilText(gate.manual.until)}.${gate.manual.reason ? ` Motivo: ${esc(gate.manual.reason)}` : ''}</p></div>
      <button class="btn ghost" id="gateRefresh">↻ Atualizar</button>`;
  }
  if (!gate || !gate.linked || !gate.enabled) return '';
  const pct = Math.min(100, gate.limit ? (gate.total / gate.limit) * 100 : 100);
  return `<div class="msg">
      <b>${gate.blocked ? '🔒 Jogos bloqueados' : '✅ Liberado pra jogar'}</b>
      <p>${gate.error ? esc(gate.error) : `Sua fila no Geiko soma <b>${fmtW(gate.total)}</b> pontos — o limite é ${fmtW(gate.limit)}. ${gateHint()}`}</p>
      <div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div>
    </div>
    <button class="btn ghost" id="gateSee">Ver tickets</button>
    <button class="btn ghost" id="gateRefresh">↻ Atualizar</button>`;
}
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
  return `${pick.length <= 2 ? 'Falta pouco: resolva' : 'Pra liberar, resolva'} <b>${pick.length} ticket${pick.length > 1 ? 's' : ''}</b> (${ids}) pra liberar.`;
}
function renderGate() {
  const box = $('#gate');
  if (box) {
    const html = gateHtml();
    box.hidden = !html;
    box.className = `gate glass ${gate?.blocked ? 'blocked' : 'ok'}`;
    box.innerHTML = html;
    $('#gateSee')?.addEventListener('click', () => gateDialog());
    $('#gateRefresh')?.addEventListener('click', async e => { e.target.disabled = true; await refreshGate(true); });
  }
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('locked', !!gate?.blocked));
}

function ticketsTable(tickets) {
  if (!tickets.length) return '<p class="hint" style="text-align:left">Nenhum ticket aberto. 🎉</p>';
  return `<div class="scroll"><table class="tickets"><thead><tr><th>Ticket</th><th>Prioridade</th><th>Status</th><th style="text-align:right">Peso</th></tr></thead><tbody>
    ${tickets.map(t => `<tr><td>#${t.id}${t.reason ? `<br><span class="tag">${esc(t.reason)}</span>` : ''}</td><td>${esc(t.priority)}</td><td>${esc(t.status)}</td><td class="w">${fmtW(t.weight)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function gateDialog() {
  if (!gate) return;
  if (gate.manual) {
    const { el, close } = modal(`<h2>🔒 Jogos bloqueados</h2>
      <p>O admin bloqueou seus jogos ${untilText(gate.manual.until)}.</p>
      ${gate.manual.reason ? `<p><b>Motivo:</b> ${esc(gate.manual.reason)}</p>` : ''}
      <button class="btn" id="gclose">Ok</button>`);
    return (el.querySelector('#gclose').onclick = close);
  }
  const { el, close } = modal(`
    <h2>${gate.blocked ? '🔒 Fila cheia' : 'Sua fila no Geiko'}</h2>
    <p>Cada ticket tem um peso: sem prioridade ou sem interação pesa mais; aguardando o cliente pesa menos.
      Soma atual <b>${fmtW(gate.total)}</b>, limite <b>${fmtW(gate.limit)}</b>.</p>
    ${ticketsTable(gate.tickets)}
    <button class="btn" id="gclose">Fechar</button>`, { wide: true });
  el.querySelector('#gclose').onclick = close;
}

