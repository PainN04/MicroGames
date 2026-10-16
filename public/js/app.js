// ---------- telas ----------
function stop() { if (cleanup) { cleanup(); cleanup = null; } }
function swap(render) {
  if (document.startViewTransition && !reduced) document.startViewTransition(render);
  else render();
}
function announce(msg) { $('#live').textContent = msg; }

function champions() {
  const count = {};
  for (const id in GAMES) { const top = bestPerPlayer(id)[0]; if (top) count[top[0]] = (count[top[0]] || 0) + 1; }
  return Object.entries(count).sort((a, b) => b[1] - a[1]);
}

function recHtml(id) {
  const g = GAMES[id], top = bestPerPlayer(id)[0];
  return top ? `🏆 <b>${esc(top[0])}</b> · ${fmt(g, top[1])}` : 'Sem recorde ainda — seja o primeiro';
}
function kingsHtml() {
  const kings = champions();
  return '<h2>👑 Quem manda no escritório</h2>' + (kings.length
    ? '<ol>' + kings.map(([n, c], k) => `<li>${['🥇', '🥈', '🥉'][k] || '•'} ${esc(n)} — <b>${c}</b> ${c > 1 ? 'recordes' : 'recorde'}</li>`).join('') + '</ol>'
    : '<p class="hint" style="text-align:left">Ninguém tem recorde ainda.</p>');
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
    <section class="grid" aria-label="Jogos">` +
    menuOrder().map(([id, g], i) => `<button class="card glass" data-id="${id}" style="--h:${g.hue};--i:${i}">
        <span class="icon" aria-hidden="true">${g.emoji}</span>
        <h3>${g.name}</h3><p>${g.desc}</p>
        <span class="rec">${recHtml(id)}</span>
      </button>`).join('') + `</section>
    <section class="kings glass" id="kings">${kingsHtml()}</section>`);
  main.querySelectorAll('.card').forEach(c => c.onclick = () => play(c.dataset.id));
  renderGate();
  prefetchPhaser();
}
// Quando o ranking novo chega, só troca os textos (sem redesenhar nem reanimar os cards).
function refreshMenu() {
  if (!$('#kings')) return;
  for (const id in GAMES) { const rec = $(`.card[data-id="${id}"] .rec`); if (rec) rec.innerHTML = recHtml(id); }
  $('#kings').innerHTML = kingsHtml();
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
}

function boardHtml(id) {
  const g = GAMES[id], rows = bestPerPlayer(id).slice(0, 10);
  return `<h3>🏆 Ranking</h3>` + (rows.length
    ? '<ol>' + rows.map(([n, s], k) => `<li class="${n === player ? 'me' : ''}"><span class="pos">${['🥇', '🥈', '🥉'][k] || k + 1}</span><span class="name">${esc(n)}</span><span>${fmt(g, s)}</span></li>`).join('') + '</ol>'
    : '<p class="empty">Ninguém jogou ainda.</p>');
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
    fetchScores().then(() => $('#board') && ($('#board').innerHTML = boardHtml(id)));
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
      const prev = bestPerPlayer(id).find(([n]) => n === player);
      const cheat = g.check?.(score, proof);
      const status = cheat || await saveScore(id, score, proof);
      const ok = status === 'ok' || status === 'queued';
      const record = ok && (!prev || better(g, score, prev[1]));
      const top = bestPerPlayer(id)[0];
      const champ = record && top && top[0] === player && top[1] === score;
      $('#board').innerHTML = boardHtml(id);
      el.innerHTML = `<div class="result">
        <span class="label">Resultado</span>
        <span class="score">${fmt(g, score)}</span>
        ${status === 'login' ? '<span class="badge warn">🔑 Você não estava logado — entre pra salvar este resultado.</span><button class="btn" id="loginSave">Entrar e salvar</button>'
          : !ok ? `<span class="badge warn">🤖 Não valeu: ${esc(status)}. Resultado não foi salvo.</span>`
          : champ ? '<span class="badge">👑 Recorde geral!</span>'
          : record ? '<span class="badge">🎉 Novo recorde pessoal!</span>'
          : prev ? `<span class="hint">Seu recorde: ${fmt(g, prev[1])}</span>` : ''}
        ${status === 'queued' ? '<span class="badge warn">⚠️ Servidor fora do ar — resultado guardado, envio automático quando ele voltar</span>' : ''}
        <button class="btn" id="again">Jogar de novo</button>
      </div>`;
      announce(`Resultado: ${fmt(g, score)}. ${!ok ? 'Não foi salvo.' : record ? 'Novo recorde!' : ''}`);
      if (record) { confetti(); sfx.record(); }
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
async function pingSession() {
  if (!me || document.hidden) return;
  try {
    const { block } = await api('api/auth/ping?view=' + encodeURIComponent(currentView === 'records' || currentView === 'report' ? 'admin' : currentView));
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
      <p>${gate.error ? esc(gate.error) : `Sua fila no Geiko soma <b>${fmtW(gate.total)}</b> pontos — o limite é ${fmtW(gate.limit)}. ${gate.blocked ? 'Resolva os tickets pra liberar.' : ''}`}</p>
      <div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div>
    </div>
    <button class="btn ghost" id="gateSee">Ver tickets</button>
    <button class="btn ghost" id="gateRefresh">↻ Atualizar</button>`;
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

