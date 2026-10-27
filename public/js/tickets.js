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
const TK_IMG_MAX = 3;
const tkImg = id => `api/tickets/image?id=${id}`;

/** Reduz a imagem no navegador (até 1600px no lado maior, WebP ou JPEG) pra caber no limite do servidor (~900 KB). */
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    for (const [side, q] of [[1600, 0.85], [1280, 0.75], [960, 0.65]]) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // PNG com fundo transparente não fica preto no JPEG
      g.drawImage(img, 0, 0, c.width, c.height);
      let data = c.toDataURL('image/webp', q);
      if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', q); // Safari antigo não gera WebP
      if (data.length < 1_150_000) return data;
    }
    throw new Error('grande demais');
  } finally { URL.revokeObjectURL(url); }
}
/** Área "Anexar imagem" (escolher, arrastar ou colar), igual no formulário de reportar e na resposta do admin. */
const attachHtml = hint => `<div class="tk-att"><div class="tk-drop" tabindex="-1">
    <div class="tk-thumbs"></div>
    <label class="tk-add">${icon('image-plus')}<span><b>Anexar imagem</b><small>${hint} Até ${TK_IMG_MAX}: escolha, arraste ou cole (Ctrl+V).</small></span>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label>
  </div></div>`;
/** Liga a área de anexo dentro de `f`; devolve a lista (viva) de imagens já reduzidas. */
function bindAttach(f) {
  const shots = [];
  const thumbs = f.querySelector('.tk-thumbs'), drop = f.querySelector('.tk-drop'), file = f.querySelector('input[type=file]');
  const drawShots = () => {
    thumbs.innerHTML = shots.map((s, i) => `<span class="tk-shot"><img src="${s}" alt="Imagem ${i + 1}"><button type="button" class="tk-rm" data-rm="${i}" aria-label="Tirar imagem ${i + 1}">${icon('x')}</button></span>`).join('');
    thumbs.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { shots.splice(+b.dataset.rm, 1); drawShots(); });
    f.querySelector('.tk-add').hidden = shots.length >= TK_IMG_MAX;
  };
  const addFiles = async files => {
    const err = f.querySelector('.err');
    if (err) err.textContent = '';
    for (const fl of [...files].filter(x => x.type.startsWith('image/'))) {
      if (shots.length >= TK_IMG_MAX) { if (err) err.textContent = `No máximo ${TK_IMG_MAX} imagens.`; break; }
      try { shots.push(await shrinkImage(fl)); drawShots(); } catch { if (err) err.textContent = 'Não consegui ler essa imagem.'; }
    }
  };
  file.onchange = () => { addFiles(file.files); file.value = ''; };
  const onPaste = e => { if (!f.isConnected) return document.removeEventListener('paste', onPaste); const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } };
  document.addEventListener('paste', onPaste);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); };
  return shots;
}
/** Imagem de um ticket em tamanho grande (Administração > Tickets). */
function imageModal(id, t, reply) {
  const ids = (reply ? t?.replyImages : t?.images) || [id];
  let i = Math.max(0, ids.indexOf(id));
  const { el } = modal(`<div class="tk-view"><img alt="Imagem anexada ao ticket"></div>
    <div class="acc-actions tk-view-nav">${ids.length > 1 ? `<button class="btn ghost icon-btn" data-step="-1" aria-label="Imagem anterior">${icon('chevron-left')}</button><span class="hint"></span><button class="btn ghost icon-btn" data-step="1" aria-label="Próxima imagem">${icon('chevron-right')}</button>` : ''}
      <a class="btn ghost" target="_blank" rel="noopener">${icon('download')} Tamanho real</a><button class="btn" data-close>Fechar</button></div>`, { wide: true });
  const show = () => {
    el.querySelector('img').src = el.querySelector('a').href = tkImg(ids[i]);
    const n = el.querySelector('.tk-view-nav .hint'); if (n) n.textContent = `${i + 1} de ${ids.length}`;
  };
  el.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { i = (i + +b.dataset.step + ids.length) % ids.length; show(); });
  el.querySelector('[data-close]').onclick = () => el.remove();
  show();
}
const ticketStatus = t => (t.status === 'done' ? `<span class="chip ok">${icon('circle-check')} resolvido</span>` : '<span class="chip warn">aberto</span>');

// número de tickets abertos na aba Tickets da Administração
let openTickets = 0;
function setOpenTickets(n) {
  openTickets = Number(n) || 0;
  const tab = $('[data-atab="tickets"] span');
  if (tab) tab.textContent = openTickets ? `Tickets (${openTickets})` : 'Tickets';
}

/** Tela de reportar um problema ("Reportar problema" no menu da conta). É uma tela própria (não janela): o formulário é alto. */
function showReportPage() {
  if (!me) return;
  const view = currentView === 'reportar' ? null : currentView;
  const where = viewName(view);
  stop();
  currentView = 'reportar';
  setTimeout(pingSession, 0);
  swap(() => {
    main.classList.remove('game-view');
    main.innerHTML = `<div class="admin tk-page">
      <div class="stage-head">
        <button class="btn ghost icon-btn back" id="back" aria-label="Voltar ao menu">${icon('arrow-left')}</button>
        <div class="title"><h2>${icon('report')} Reportar um problema</h2><p>Só o administrador do site lê. Quando ele resolver, você recebe um aviso.</p></div>
      </div>
      <div class="tk-cols">
      <section class="glass tk-main">
    <form class="admin acc-form tk-form" autocomplete="off">
      <fieldset class="acc-role tk-kinds"><legend>O que aconteceu?</legend>${TICKET_KINDS.map(([k, ic, l, s], i) =>
        `<label><input type="radio" name="kind" value="${k}" required${i ? '' : ' checked'}><span>${icon(ic)}<b>${l}</b><small>${s}</small></span></label>`).join('')}</fieldset>
      <label class="tk-msg"><span>Conte o que aconteceu</span>
        <textarea name="message" rows="5" maxlength="1000" required minlength="5" placeholder="Ex.: no Sudoku, ao terminar o tabuleiro a tela ficou parada e o ponto não entrou."></textarea>
        <small class="tk-meta"><span>${where ? `${icon('map-pin')} Enviado de: ${esc(where)}` : ''}</span><span class="tk-count">0/1000</span></small>
      </label>
      ${attachHtml('Print da tela ajuda muito.')}
      <p class="err" role="alert"></p>
      <div class="acc-actions"><button type="button" class="btn ghost" data-cancel>Cancelar</button><button class="btn">${icon('send')} Enviar</button></div>
    </form>
      </section>
      <section class="glass tk-side"><h3>${icon('inbox')} Seus tickets</h3><div class="tk-mine" id="tkMine"><p class="hint" style="text-align:left">Carregando...</p></div></section>
      </div>
    </div>`;
    bindReportForm(main, view);
  });
}
function bindReportForm(el, view) {
  const close = showMenu;
  $('#back').onclick = showMenu;
  const f = el.querySelector('form'), ok = f.querySelector('button:not([type])'), ta = f.querySelector('textarea');
  el.querySelector('[data-cancel]').onclick = close;
  const shots = bindAttach(f); // data URLs já reduzidas
  ta.oninput = () => { f.querySelector('.tk-count').textContent = `${ta.value.length}/1000`; };
  ta.focus();
  f.onsubmit = async e => {
    e.preventDefault();
    ok.disabled = true;
    const d = new FormData(f);
    try {
      await api('api/tickets', { method: 'POST', body: { kind: d.get('kind'), message: d.get('message'), view, images: shots } });
      f.outerHTML = `<div class="empty-state tk-sent">${icon('circle-check')}<b>Recebido, valeu!</b><span>O administrador vai dar uma olhada. Quando resolver, aparece nos seus avisos.</span>
        <span class="tk-sent-actions"><button class="btn ghost" data-again>${icon('report')} Reportar outro</button><button class="btn" data-cancel>Voltar ao menu</button></span></div>`;
      el.querySelector('[data-cancel]').onclick = close;
      el.querySelector('[data-again]').onclick = showReportPage;
      el.querySelector('[data-cancel]').focus();
      loadMyTickets(el);
    } catch (err) { f.querySelector('.err').textContent = err.message; ok.disabled = false; }
  };
  loadMyTickets(el);
}
async function loadMyTickets(el) {
  const box = el.querySelector('#tkMine');
  if (!box) return;
  try {
    const { tickets } = await api('api/tickets');
    box.innerHTML = tickets.length ? `<ul class="tk-list compact">${tickets.map(t => `<li class="tkt${t.status === 'done' ? ' done' : ''}">
        <div class="tk-top">${icon(ticketKind(t.kind)[1])}<b>${ticketKind(t.kind)[2]}</b>${ticketStatus(t)}<span class="hint">${ticketWhen(t.at)}</span></div>
        <p class="tk-text">${esc(t.message)}</p>
        ${t.images.length ? `<div class="tk-imgs">${t.images.map(id => `<a href="${tkImg(id)}" target="_blank" rel="noopener"><img src="${tkImg(id)}" alt="Imagem anexada" loading="lazy"></a>`).join('')}</div>` : ''}
        ${t.reply || t.replyImages.length ? `<p class="tk-reply">${icon('message-circle')}<span><b>Resposta</b>${esc(t.reply || '')}</span></p>` : ''}
        ${t.replyImages.length ? `<div class="tk-imgs">${t.replyImages.map(id => `<a href="${tkImg(id)}" target="_blank" rel="noopener"><img src="${tkImg(id)}" alt="Imagem da resposta" loading="lazy"></a>`).join('')}</div>` : ''}</li>`).join('')}</ul>` : `<div class="empty-state">${icon('report')}<b>Nenhum ticket ainda</b><span>Os problemas que você mandar aparecem aqui, com a resposta do administrador.</span></div>`;
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
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
    <p class="note">Problemas que o pessoal reportou em "Reportar problema", no menu da conta. Só você vê esta aba. Ao marcar como resolvido, quem mandou recebe um aviso (com a sua resposta, se escrever uma).</p>
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
    return `<li class="tkt${t.status === 'done' ? ' done' : ''}" data-id="${t.id}">
      <div class="tk-top"><span class="tk-ic k-${t.kind}">${icon(ic)}</span><b>${label}</b>${ticketStatus(t)}
        <span class="hint">${ticketWhen(t.at)}</span></div>
      <p class="tk-text">${esc(t.message)}</p>
      ${t.images.length ? `<div class="tk-imgs">${t.images.map((id, i) => `<button type="button" data-img="${id}" aria-label="Ver imagem ${i + 1}"><img src="${tkImg(id)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
      <div class="tk-info"><span>${icon('user')} ${esc(t.name || 'conta apagada')}</span>${where ? `<span>${icon('map-pin')} ${esc(where)}</span>` : ''}${t.agent ? `<span title="${esc(t.agent)}">${icon('monitor')} ${esc(agentShort(t.agent))}</span>` : ''}</div>
      ${t.reply || t.replyImages.length ? `<p class="tk-reply">${icon('message-circle')}<span><b>Sua resposta</b>${esc(t.reply || '')}</span></p>` : ''}
      ${t.replyImages.length ? `<div class="tk-imgs">${t.replyImages.map((id, i) => `<button type="button" data-img="${id}" data-reply="1" aria-label="Ver imagem da resposta ${i + 1}"><img src="${tkImg(id)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
      <div class="actions">${t.status === 'open'
        ? `<button class="btn" data-tk="done">${icon('circle-check')}<span class="t">Resolver</span></button>`
        : `<button class="btn ghost" data-tk="open">${icon('rotate-ccw')}<span class="t">Reabrir</span></button>`}
        <button class="btn ghost icon-btn danger" data-tk="del" aria-label="Apagar ticket">${icon('trash-2')}</button></div>
    </li>`;
  }).join('');
  box.querySelectorAll('[data-img]').forEach(b => b.onclick = () => imageModal(+b.dataset.img, tkData.find(t => t.id === +b.closest('li').dataset.id), b.dataset.reply));
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
    let shots = [];
    return adminFormModal(`${icon('circle-check')} Resolver ticket`,
      `<p class="tk-quote">${esc(t.message)}</p>
       <label class="tk-msg"><span>Resposta pra ${esc(t.name || 'a pessoa')} (opcional)</span>
         <textarea name="reply" rows="3" maxlength="500" placeholder="Ex.: Arrumei, já pode jogar de novo!"></textarea>
         <small>Vai junto no aviso de resolvido.</small></label>
       ${attachHtml('Um print do que mudou, por exemplo.')}`,
      'Marcar como resolvido', async d => {
        await api('api/admin/tickets/update', { method: 'POST', body: { id: t.id, status: 'done', reply: d.get('reply'), images: shots } });
        loadTickets();
      }, { onOpen: f => { shots = bindAttach(f); } });
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
