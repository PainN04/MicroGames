// ---------- tickets: o pessoal reporta problemas do site; só a conta dona lê (Administração > Tickets) ----------
const TICKET_KINDS = [
  ['bug', 'bug', 'Algo quebrou', 'Erro, tela travada, botão que não funciona'],
  ['jogo', 'gamepad-2', 'Problema num jogo', 'Regra, pontuação, ranking'],
  ['conta', 'user', 'Minha conta', 'Login, senha, perfil'],
  ['ideia', 'lightbulb', 'Sugestão', 'Uma ideia pra melhorar o site'],
  ['outro', 'ellipsis', 'Outra coisa', 'Qualquer outro assunto'],
];
const ticketKind = k => TICKET_KINDS.find(t => t[0] === k) || TICKET_KINDS[4];
const viewName = v => (GAMES[v]?.name || { menu: 'Menu', admin: 'Administração', records: 'Recordes', profile: 'Perfil' }[v] || '');
const ticketWhen = at => new Date(at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const ticketStatus = t => (t.status === 'done' ? `<span class="chip ok">${icon('circle-check')} resolvido</span>` : '<span class="chip warn">aberto</span>');

// balão com o número de tickets abertos no item "Tickets" do menu da conta e na aba da Administração
let openTickets = 0;
function setOpenTickets(n) {
  openTickets = Number(n) || 0;
  const txt = openTickets > 9 ? '9+' : String(openTickets);
  const b = $('#ticketsCnt');
  if (b) { b.textContent = txt; b.hidden = !openTickets; }
  const tab = $('[data-atab="tickets"] span');
  if (tab) tab.textContent = openTickets ? `Tickets (${openTickets})` : 'Tickets';
}

/** Janela de reportar um problema (ícone do topo ou "Reportar problema" no menu da conta). */
async function reportModal() {
  const view = currentView;
  const where = viewName(view);
  const { el, close } = modal(`<h2>${icon('report')} Reportar um problema</h2>
    <p class="note tk-lead">Só o administrador do site lê. Quando ele resolver, você recebe um aviso.</p>
    <form class="admin acc-form tk-form" autocomplete="off">
      <fieldset class="acc-role tk-kinds"><legend>O que aconteceu?</legend>${TICKET_KINDS.map(([k, ic, l, s], i) =>
        `<label><input type="radio" name="kind" value="${k}" required${i ? '' : ' checked'}><span>${icon(ic)}<b>${l}</b><small>${s}</small></span></label>`).join('')}</fieldset>
      <label class="tk-msg"><span>Conte o que aconteceu</span>
        <textarea name="message" rows="5" maxlength="1000" required minlength="5" placeholder="Ex.: no Sudoku, ao terminar o tabuleiro a tela ficou parada e o ponto não entrou."></textarea>
        <small class="tk-meta"><span>${where ? `${icon('map-pin')} Enviado de: ${esc(where)}` : ''}</span><span class="tk-count">0/1000</span></small>
      </label>
      <p class="err" role="alert"></p>
      <div class="acc-actions"><button type="button" class="btn ghost" data-cancel>Cancelar</button><button class="btn">${icon('send')} Enviar</button></div>
    </form>
    <div class="tk-mine" id="tkMine"></div>`, { wide: true });
  const f = el.querySelector('form'), ok = f.querySelector('button:not([type])'), ta = f.querySelector('textarea');
  el.querySelector('[data-cancel]').onclick = close;
  ta.oninput = () => { f.querySelector('.tk-count').textContent = `${ta.value.length}/1000`; };
  ta.focus();
  f.onsubmit = async e => {
    e.preventDefault();
    ok.disabled = true;
    const d = new FormData(f);
    try {
      await api('api/tickets', { method: 'POST', body: { kind: d.get('kind'), message: d.get('message'), view } });
      f.outerHTML = `<div class="empty-state tk-sent">${icon('circle-check')}<b>Recebido, valeu!</b><span>O administrador vai dar uma olhada. Quando resolver, aparece nos seus avisos.</span>
        <button class="btn" data-cancel>Fechar</button></div>`;
      el.querySelector('.tk-lead').remove();
      el.querySelector('[data-cancel]').onclick = close;
      el.querySelector('[data-cancel]').focus();
      loadMyTickets(el);
    } catch (err) { f.querySelector('.err').textContent = err.message; ok.disabled = false; }
  };
  loadMyTickets(el);
}
async function loadMyTickets(el) {
  const box = el.querySelector('#tkMine');
  try {
    const { tickets } = await api('api/tickets');
    box.innerHTML = tickets.length ? `<details${tickets.some(t => t.status === 'done' && t.reply) ? ' open' : ''}><summary>Seus tickets <span class="hint">${tickets.length}</span></summary>
      <ul class="tk-list compact">${tickets.map(t => `<li class="tk${t.status === 'done' ? ' done' : ''}">
        <div class="tk-top">${icon(ticketKind(t.kind)[1])}<b>${ticketKind(t.kind)[2]}</b>${ticketStatus(t)}<span class="hint">${ticketWhen(t.at)}</span></div>
        <p class="tk-text">${esc(t.message)}</p>
        ${t.reply ? `<p class="tk-reply">${icon('message-circle')}<span><b>Resposta</b>${esc(t.reply)}</span></p>` : ''}</li>`).join('')}</ul></details>` : '';
  } catch { box.innerHTML = ''; }
}

/* --- Administração > Tickets (só a conta dona; o servidor também confere) --- */
const TK_FILTERS = [['open', 'Abertos'], ['done', 'Resolvidos'], ['all', 'Todos']];
let tkFilter = 'open', tkData = [];
function ticketsPaneHtml() {
  return `<section class="glass" data-pane="tickets"${adminPane === 'tickets' ? '' : ' hidden'}>
    <div class="acc-head">
      <h2>Tickets <span class="hint" id="tkCount"></span></h2>
      <button class="btn ghost" id="tkReload">${icon('refresh-cw')} Atualizar</button>
    </div>
    <div class="seg acc-filter" role="group" aria-label="Mostrar">${TK_FILTERS.map(([k, l]) => `<button data-tkf="${k}" aria-pressed="${tkFilter === k}">${l}<span class="n" data-tkn="${k}"></span></button>`).join('')}</div>
    <p class="note">Problemas que o pessoal reportou pelo ícone ${icon('report')} do topo. Só você vê esta aba. Ao marcar como resolvido, quem mandou recebe um aviso (com a sua resposta, se escrever uma).</p>
    <ul class="tk-list" id="tkList"><li class="hint">Carregando...</li></ul>
  </section>`;
}
function bindTicketsPane() {
  $('#tkReload').onclick = loadTickets;
  main.querySelectorAll('[data-tkf]').forEach(b => b.onclick = () => {
    tkFilter = b.dataset.tkf;
    main.querySelectorAll('[data-tkf]').forEach(x => x.setAttribute('aria-pressed', x === b));
    renderTickets();
  });
}
async function loadTickets() {
  const box = $('#tkList');
  if (!box) return;
  try {
    ({ tickets: tkData } = await api('api/admin/tickets'));
    setOpenTickets(tkData.filter(t => t.status === 'open').length);
    renderTickets();
  } catch (err) { box.innerHTML = `<li class="err">${esc(err.message)}</li>`; }
}
function renderTickets() {
  const box = $('#tkList');
  if (!box) return;
  for (const [k] of TK_FILTERS) { const n = main.querySelector(`[data-tkn="${k}"]`); if (n) n.textContent = tkData.filter(t => k === 'all' || t.status === k).length; }
  $('#tkCount').textContent = `${tkData.length} no total`;
  const rows = tkData.filter(t => tkFilter === 'all' || t.status === tkFilter);
  if (!rows.length) {
    box.innerHTML = `<li class="empty-state">${icon('inbox')}<b>${tkFilter === 'open' ? 'Nenhum ticket aberto' : 'Nada por aqui'}</b><span>${tkFilter === 'open' ? 'Quando alguém reportar um problema, ele aparece aqui.' : 'Troque o filtro acima pra ver os outros.'}</span></li>`;
    return;
  }
  box.innerHTML = rows.map(t => {
    const [, ic, label] = ticketKind(t.kind), where = viewName(t.view);
    return `<li class="tk${t.status === 'done' ? ' done' : ''}" data-id="${t.id}">
      <div class="tk-top"><span class="tk-ic k-${t.kind}">${icon(ic)}</span><b>${label}</b>${ticketStatus(t)}
        <span class="hint">${ticketWhen(t.at)}</span></div>
      <p class="tk-text">${esc(t.message)}</p>
      <div class="tk-info"><span>${icon('user')} ${esc(t.name || 'conta apagada')}</span>${where ? `<span>${icon('map-pin')} ${esc(where)}</span>` : ''}${t.agent ? `<span title="${esc(t.agent)}">${icon('monitor')} ${esc(agentShort(t.agent))}</span>` : ''}</div>
      ${t.reply ? `<p class="tk-reply">${icon('message-circle')}<span><b>Sua resposta</b>${esc(t.reply)}</span></p>` : ''}
      <div class="actions">${t.status === 'open'
        ? `<button class="btn" data-tk="done">${icon('circle-check')}<span class="t">Resolver</span></button>`
        : `<button class="btn ghost" data-tk="open">${icon('rotate-ccw')}<span class="t">Reabrir</span></button>`}
        <button class="btn ghost icon-btn danger" data-tk="del" aria-label="Apagar ticket">${icon('trash-2')}</button></div>
    </li>`;
  }).join('');
  box.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => ticketAction(b.dataset.tk, tkData.find(t => t.id === +b.closest('li').dataset.id)));
}
// "Mozilla/5.0 (iPhone; ...) ... Safari" → "iPhone · Safari": dá pra saber o aparelho sem ler o texto inteiro
function agentShort(ua) {
  const dev = /iPhone|iPad|Android|Windows|Mac OS|Linux/.exec(ua)?.[0]?.replace('Mac OS', 'Mac') || '';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [dev, nav].filter(Boolean).join(' · ') || 'navegador';
}
async function ticketAction(act, t) {
  if (!t) return;
  if (act === 'done') {
    return adminFormModal(`${icon('circle-check')} Resolver ticket`,
      `<p class="tk-quote">${esc(t.message)}</p>
       <label class="tk-msg"><span>Resposta pra ${esc(t.name || 'a pessoa')} (opcional)</span>
         <textarea name="reply" rows="3" maxlength="500" placeholder="Ex.: Arrumei, já pode jogar de novo!"></textarea>
         <small>Vai junto no aviso de resolvido.</small></label>`,
      'Marcar como resolvido', async d => {
        await api('api/admin/tickets/update', { method: 'POST', body: { id: t.id, status: 'done', reply: d.get('reply') } });
        loadTickets();
      });
  }
  try {
    if (act === 'open') await api('api/admin/tickets/update', { method: 'POST', body: { id: t.id, status: 'open', reply: t.reply } });
    if (act === 'del') {
      if (!confirm('Apagar este ticket? Não dá pra desfazer.')) return;
      await api('api/admin/tickets/delete', { method: 'POST', body: { id: t.id } });
    }
    loadTickets();
  } catch (err) { alert(err.message); }
}
function showTickets() {
  adminPane = 'tickets';
  showAdmin();
}
