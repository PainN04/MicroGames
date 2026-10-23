// ---------- painel admin ----------
const PRIO_FIELDS = [['URG', 'Urgente'], ['ALT', 'Alta'], ['MED', 'Média'], ['NOR', 'Normal'], ['BAI', 'Baixa'], ['none', 'Sem prioridade']];

// partes do Painel, cada uma numa aba
const ADMIN_PANES = [['online', 'eye', 'Online'], ['contas', 'user', 'Contas'], ['duplas', 'users', 'Duplas'], ['geiko', 'clock', 'Fila do Geiko'], ['respostas', 'key-round', 'Respostas do dia']];
let adminPane = 'online';

function showAdmin() {
  if (me?.role !== 'admin') return;
  stop();
  currentView = 'admin';
  setTimeout(pingSession, 0);
  swap(() => {
    main.classList.remove('game-view');
    main.innerHTML = `<div class="admin">
      <div class="stage-head">
        <button class="btn ghost icon-btn back" id="back" aria-label="Voltar ao menu">${icon('arrow-left')}</button>
        <div class="title"><h2>${icon('settings')} Administração</h2><p>Contas de quem joga, vínculo com o Geiko e a regra de bloqueio por fila.</p></div>
      </div>
      ${adminTabsHtml(adminPane)}
      <section class="glass" data-pane="online"${adminPane === 'online' ? '' : ' hidden'}>
        <div class="acc-head">
          <h2><span class="live-dot"></span>Online agora <span class="hint" id="onCount"></span></h2>
          <span class="hint on-auto">${icon('refresh-cw')} atualiza a cada 15s</span>
        </div>
        <p class="note">Quem está com o site aberto e visível. Quem minimiza ou troca de aba sai da lista em ~1 min.</p>
        <ul class="acc-list" id="onlineList"><li class="hint">Carregando...</li></ul>
        <div id="seenList"></div>
      </section>
      <section class="glass" data-pane="contas"${adminPane === 'contas' ? '' : ' hidden'}>
        <div class="acc-head">
          <h2>Contas <span class="hint" id="accCount"></span></h2>
          <label class="acc-search">${icon('search')}<input type="search" id="accQ" placeholder="Buscar conta" aria-label="Buscar conta"></label>
          <button class="btn" id="accNew">${icon('user-plus')} Nova conta</button>
        </div>
        <div class="seg acc-filter" role="group" aria-label="Mostrar">${ACC_FILTERS.map(([k, l]) => `<button data-accf="${k}" aria-pressed="${accFilter === k}">${l}<span class="n" data-accn="${k}"></span></button>`).join('')}</div>
        <ul class="acc-list" id="usersList"><li class="hint">Carregando...</li></ul>
      </section>
      <section class="glass" data-pane="duplas"${adminPane === 'duplas' ? '' : ' hidden'}>
        <div class="acc-head">
          <h2>Duplas <span class="hint" id="duoCount"></span></h2>
          <button class="btn" id="duoNew">${icon('users')} Nova dupla</button>
        </div>
        <p class="note">Os próprios jogadores formam as duplas (convite + aceite). Aqui você modera: troca um nome inadequado, muda desde quando as partidas contam ou desfaz a dupla.</p>
        <ul class="acc-list" id="duosAdmin"><li class="hint">Carregando...</li></ul>
      </section>
      <section class="glass" data-pane="geiko"${adminPane === 'geiko' ? '' : ' hidden'}>
        <h2>Regra de bloqueio</h2>
        <p class="note">Cada ticket aberto do atendente vale um peso. Se a soma passar do limite, os jogos ficam bloqueados. Quem não tem ID do Geiko nunca é bloqueado.</p>
        <form id="rulesForm"><p class="hint" style="text-align:left">Carregando...</p></form>
      </section>
      <section class="glass" data-pane="geiko"${adminPane === 'geiko' ? '' : ' hidden'}>
        <h2>Testar ID do Geiko</h2>
        <p class="note">Confere a fila de um atendente com a regra atual (útil pra validar o vínculo antes de criar a conta).</p>
        <form class="geiko-test" id="testForm"><label class="acc-search">${icon('search')}<input name="geikoId" inputmode="numeric" pattern="\\d+" required placeholder="ID do Geiko" aria-label="ID do Geiko"></label><button class="btn ghost">Testar</button></form>
        <div id="testOut" style="margin-top:var(--space-sm)"></div>
      </section>
      <section class="glass" data-pane="respostas"${adminPane === 'respostas' ? '' : ' hidden'}>
        <div class="acc-head">
          <h2>Respostas do dia <span class="hint" id="ansDay"></span></h2>
          <div class="ans-nav">
            <button class="btn ghost icon-btn" id="ansPrev" aria-label="Dia anterior">${icon('chevron-left')}</button>
            <button class="btn ghost" id="ansToday">${icon('calendar')} Hoje</button>
            <button class="btn ghost icon-btn" id="ansNext" aria-label="Próximo dia">${icon('chevron-right')}</button>
          </div>
        </div>
        <p class="note">A resposta de cada jogo diário e o que cada pessoa mandou. A resposta fica borrada até você tocar nela, pra não estragar o seu jogo.</p>
        <div class="ans-grid" id="ansList"><p class="hint">Carregando...</p></div>
      </section>
    </div>`;
    $('#back').onclick = showMenu;
    $('#ansPrev').onclick = () => loadAnswers(ansDay - 1);
    $('#ansNext').onclick = () => loadAnswers(ansDay + 1);
    $('#ansToday').onclick = () => loadAnswers(null);
    if (adminPane === 'respostas') loadAnswers(ansDay);
    $('#accNew').onclick = () => accountModal();
    $('#accQ').oninput = renderUsers;
    main.querySelectorAll('[data-accf]').forEach(b => b.onclick = () => {
      accFilter = b.dataset.accf;
      main.querySelectorAll('[data-accf]').forEach(x => x.setAttribute('aria-pressed', x === b));
      renderUsers();
    });
    $('#testForm').onsubmit = async e => {
      e.preventDefault();
      const id = new FormData(e.target).get('geikoId');
      $('#testOut').innerHTML = '<p class="hint" style="text-align:left">Consultando o Geiko...</p>';
      $('#testOut').innerHTML = await previewHtml(id);
    };
    loadUsers();
    loadRules();
    loadOnline();
    loadAdminDuos();
  });
}

// ---------- duplas (moderação) ----------
const DUO_SINCE = [['all', 'rotate-ccw', 'O começo', 'Tudo que os dois já jogaram'], ['month', 'calendar', 'O início do mês', 'Só as partidas deste mês'], ['now', 'play', 'Agora', 'Só daqui pra frente']];
const duoSinceField = cur => `<fieldset class="acc-role duo-since"><legend>As partidas contam desde</legend>${DUO_SINCE.map(([v, ic, l, s]) =>
  `<label><input type="radio" name="since" value="${v}" required${v === cur ? ' checked' : ''}><span>${icon(ic)}<b>${l}</b><small>${s}</small></span></label>`).join('')}</fieldset>`;

/** Janela com um formulário curto da administração: `send(dados)` faz a chamada; se der erro, ele aparece na própria janela. */
function adminFormModal(title, fields, okLabel, send, { danger = false } = {}) {
  const { el, close } = modal(`<h2>${title}</h2>
    <form class="admin acc-form" autocomplete="off">${fields}<p class="err"></p>
      <div class="acc-actions"><button type="button" class="btn ghost" data-cancel>Cancelar</button><button class="btn${danger ? ' danger' : ''}">${okLabel}</button></div>
    </form>`, { wide: true });
  const f = el.querySelector('form'), ok = f.querySelector('button:not([type])');
  el.querySelector('[data-cancel]').onclick = close;
  f.querySelector('input:not([type=radio]), select')?.focus();
  f.onsubmit = async e => {
    e.preventDefault();
    ok.disabled = true;
    try { await send(new FormData(f)); close(); }
    catch (err) { f.querySelector('.err').textContent = err.message; ok.disabled = false; }
  };
  return el;
}

async function loadAdminDuos() {
  const box = $('#duosAdmin');
  if (!box) return;
  try {
    const [{ duos }, { users }] = await Promise.all([api('api/admin/duos'), api('api/admin/users')]);
    const byId = new Map(users.map(u => [u.id, u]));
    // nova dupla: só quem está livre (ativo e fora de qualquer dupla)
    const busy = new Set(duos.flatMap(d => [d.aId, d.bId]));
    const free = users.filter(u => u.active && !busy.has(u.id)).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
    const add = $('#duoNew');
    add.disabled = free.length < 2;
    add.title = free.length < 2 ? 'Precisa de pelo menos duas pessoas fora de dupla' : '';
    add.onclick = () => {
      const opts = '<option value="">Escolha…</option>' + free.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
      adminFormModal(`${icon('users')} Nova dupla`, `
        <div class="duo-pair"><label>Pessoa 1<select name="aId" required>${opts}</select></label><span class="duo-amp" aria-hidden="true">&amp;</span><label>Pessoa 2<select name="bId" required>${opts}</select></label></div>
        <small>Só aparecem pessoas que não estão em dupla nem com convite aberto. A dupla criada aqui já nasce ativa, sem convite.</small>
        <label>Nome da dupla<input name="name" maxlength="24" placeholder="ex.: Os Imbatíveis" required></label>
        ${duoSinceField('all')}`, 'Criar dupla', async f => {
        await api('api/admin/duos', { method: 'POST', body: { aId: Number(f.get('aId')), bId: Number(f.get('bId')), name: f.get('name'), since: f.get('since') } });
        loadAdminDuos();
      });
    };
    const active = duos.filter(d => d.status === 'active').length;
    $('#duoCount').textContent = duos.length ? `${active} ${active === 1 ? 'ativa' : 'ativas'}${duos.length > active ? ` · ${duos.length - active} convite${duos.length - active > 1 ? 's' : ''}` : ''}` : '';
    const av = (id, name) => avatarHtml(byId.get(id)?.avatar) || accInitials(name);
    box.innerHTML = duos.map(d => {
      const on = d.status === 'active';
      return `<li class="acc duo" data-id="${d.id}">
        <span class="duo-av">${av(d.aId, d.a)}${av(d.bId, d.b)}</span>
        <span class="acc-who"><b>${esc(d.name)}</b><small>${esc(d.a)} &amp; ${esc(d.b)}</small></span>
        <span class="acc-chips">${on ? `<span class="chip ok">Ativa</span><span class="chip">${icon('calendar')} conta desde ${d.since === 0 ? 'o começo' : new Date(d.since).toLocaleDateString('pt-BR')}</span>` : '<span class="chip warn">Convite aberto</span>'}</span>
        <span class="actions">
          <button class="btn ghost" data-duo="rename" aria-label="Renomear ${esc(d.name)}">${icon('pencil')}<span class="t">Renomear</span></button>
          ${on ? `<button class="btn ghost" data-duo="since" aria-label="Mudar desde quando conta">${icon('calendar')}<span class="t">Início</span></button>` : ''}
          <button class="btn ghost danger" data-duo="end" aria-label="Desfazer ${esc(d.name)}">${icon('x')}<span class="t">Desfazer</span></button>
        </span></li>`;
    }).join('') || `<li class="empty-state">${icon('users')}<b>Nenhuma dupla ainda</b><span>Quando alguém aceitar um convite, a dupla aparece aqui.</span></li>`;
    box.querySelectorAll('[data-duo]').forEach(b => b.onclick = () => {
      const d = duos.find(x => String(x.id) === b.closest('li').dataset.id), url = `api/admin/duos/${d.id}`;
      if (b.dataset.duo === 'rename') adminFormModal(`${icon('pencil')} Renomear dupla`,
        `<label>Novo nome<input name="name" maxlength="24" value="${esc(d.name)}" required></label><small>${esc(d.a)} e ${esc(d.b)} veem o nome novo na hora.</small>`,
        'Salvar', async f => { await api(`${url}/rename`, { method: 'POST', body: { name: f.get('name') } }); loadAdminDuos(); });
      else if (b.dataset.duo === 'since') adminFormModal(`${icon('calendar')} Desde quando conta`,
        `<p>Escolha quais partidas de ${esc(d.a)} e ${esc(d.b)} entram na pontuação de <b>${esc(d.name)}</b>.</p>${duoSinceField(d.since === 0 ? 'all' : '')}`,
        'Salvar', async f => { await api(`${url}/since`, { method: 'POST', body: { since: f.get('since') } }); loadAdminDuos(); });
      else adminFormModal(`${icon('x')} Desfazer ${esc(d.name)}?`,
        `<p>${esc(d.a)} e ${esc(d.b)} deixam de ser dupla e os dois são avisados.</p>`,
        'Desfazer dupla', async () => { await api(`${url}/end`, { method: 'POST', body: {} }); loadAdminDuos(); }, { danger: true });
    });
  } catch (err) { box.innerHTML = `<li class="err">${esc(err.message)}</li>`; }
}

// ---------- quem está online ----------
const ago = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`; };
const viewLabel = v => GAMES[v] ? `${icon(GAMES[v].icon)} jogando <b>${GAMES[v].name}</b>` : v === 'admin' ? `${icon('settings')} na administração` : `${icon('house')} no menu`;
async function loadOnline() {
  const box = $('#onlineList');
  if (!box) return;
  try {
    const { now, online, recent } = await api('api/admin/online');
    const av = p => avatarHtml(p.avatar) || accInitials(p.name);
    $('#onCount').textContent = `${online.length} ${online.length === 1 ? 'pessoa' : 'pessoas'}`;
    box.innerHTML = online.map(p => `<li class="acc on" data-id="${p.id}">
        <span class="acc-av">${av(p)}</span>
        <span class="acc-who"><b>${esc(p.name)}</b><small class="on-where">${viewLabel(p.view)} · há ${ago(now - p.since)}</small></span>
        <span class="acc-chips">${p.id === me.id ? '<span class="chip">Você</span>' : ''}${p.block ? `<span class="chip bad">${icon('lock')} Bloqueada ${untilText(p.block.until)}</span>` : ''}</span>
        <span class="actions">${p.id === me.id ? '' : p.block
          ? `<button class="btn ghost" data-act="unblock" aria-label="Desbloquear ${esc(p.name)}">${icon('lock-open')}<span class="t">Desbloquear</span></button>`
          : `<button class="btn ghost" data-act="block" aria-label="Bloquear ${esc(p.name)}">${icon('lock')}<span class="t">Bloquear</span></button>`}</span>
      </li>`).join('') || `<li class="empty-state">${icon('moon')}<b>Ninguém online agora</b><span>Quem abrir o site aparece aqui em segundos.</span></li>`;
    $('#seenList').innerHTML = recent.length ? `<h3 class="seen-h">Visto nas últimas 24h <span class="hint">${recent.length}</span></h3>
      <ul class="seen-list">${recent.map(p => `<li><span class="acc-av">${av(p)}</span><span><b>${esc(p.name)}</b><small>${new Date(p.lastSeen).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${GAMES[p.view] ? ' · ' + GAMES[p.view].name : ''}</small></span></li>`).join('')}</ul>` : '';
    box.querySelectorAll('[data-act]').forEach(b => b.onclick = () => userAction(b.dataset.act, online.find(p => p.id === +b.closest('li').dataset.id)));
  } catch (err) { box.innerHTML = `<li class="err">${esc(err.message)}</li>`; }
}
// ---------- editor de recordes (só admin) ----------
const recState = { mode: 'game', game: FEATURED[0], userId: null };
function showRecords() {
  if (!me?.canEditRecords) return; // só a conta dona (o servidor também confere)
  stop();
  currentView = 'records';
  setTimeout(pingSession, 0);
  if (location.hash !== '#recordes') history.replaceState(null, '', '#recordes');
  swap(() => {
    main.classList.remove('game-view');
    main.innerHTML = `<div class="admin">
      <div class="stage-head">
        <button class="btn ghost icon-btn back" id="back" aria-label="Voltar ao menu">${icon('arrow-left')}</button>
        <div class="title"><h2>${icon('settings')} Administração</h2>
          <p>Mudar aqui altera o ranking na hora. Pra abrir direto numa aba nova: <a href="${location.pathname}#recordes" target="_blank" style="color:var(--primary)">${esc(location.host)}/#recordes</a></p></div>
      </div>
      ${adminTabsHtml('records')}
      <section class="glass">
        <div class="rec-head">
          <div class="seg" role="group" aria-label="Ver"><button data-recmode="game">${icon('gamepad-2')} Por jogo</button><button data-recmode="user">${icon('user')} Por pessoa</button></div>
          <label class="rec-pick"><span id="recPickName">Jogo</span><select id="recPick"></select></label>
        </div>
        <p class="note rec-msg" id="recMsg" role="status"></p>
        <ul class="rec-list" id="recTable"><li class="hint">Carregando...</li></ul>
      </section>
      <section class="glass">
        <div class="row" style="justify-content:space-between;margin-bottom:var(--space-sm)">
          <div><h3 style="margin:0">${icon('database')} Backups</h3>
            <p class="hint" style="text-align:left;margin:0">Cópia automática todo dia e antes de editar recordes. Guarda as 30 mais novas.</p></div>
          <span class="bk-actions"><button class="btn ghost" id="bkNow">Fazer backup agora</button>
            <button class="btn ghost" id="bkDown">${icon('download')} Baixar backup agora</button></span>
        </div>
        <div id="bkList"><p class="hint" style="text-align:left">Carregando...</p></div>
      </section>
    </div>`;
    $('#bkNow').onclick = async e => {
      e.target.disabled = true;
      try { await api('api/admin/backups', { method: 'POST', body: {} }); await loadBackups('Backup feito.'); }
      catch (err) { alert(err.message); } finally { e.target.disabled = false; }
    };
    $('#bkDown').onclick = async e => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const { id } = await api('api/admin/backups', { method: 'POST', body: {} });
        const a = document.createElement('a'); a.href = `api/admin/backups/download?id=${id}`; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
        await loadBackups('Backup feito e baixado.');
      } catch (err) { alert(err.message); } finally { btn.disabled = false; }
    };
    loadBackups();
    $('#back').onclick = () => { history.replaceState(null, '', location.pathname); showMenu(); };
    main.querySelectorAll('[data-recmode]').forEach(b => b.onclick = () => { recState.mode = b.dataset.recmode; renderRecords(); });
    $('#recPick').onchange = e => { recState.mode === 'game' ? (recState.game = e.target.value) : (recState.userId = +e.target.value); renderRecords(); };
    loadRecords();
  });
}

let recData = { records: [], users: [] };
async function loadRecords(msg = '') {
  try {
    const [{ records }, { users }] = await Promise.all([api('api/admin/records'), api('api/admin/users')]);
    recData = { records, users: users.filter(u => u.active) };
    recState.userId ??= recData.users[0]?.id ?? null;
    renderRecords();
    if (msg) $('#recMsg').textContent = msg;
  } catch (err) { $('#recTable') && ($('#recTable').innerHTML = `<p class="err">${esc(err.message)}</p>`); }
}

function renderRecords() {
  const box = $('#recTable');
  if (!box) return;
  $('#recMsg').textContent = '';
  main.querySelectorAll('[data-recmode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.recmode === recState.mode));
  const pick = $('#recPick');
  // campo do valor com a unidade do jogo grudada
  const valueField = (id, v, enabled = true) => `<label class="rec-field"><input type="number" step="any" min="0" class="rec-v" value="${v ?? ''}" ${enabled ? '' : 'disabled'} aria-label="Recorde (${GAMES[id].unit})"><span>${GAMES[id].unit}</span></label>`;
  const count = n => `<span class="rec-n">${n ? `${n} ${n === 1 ? 'partida' : 'partidas'}` : '<span class="hint">sem partidas</span>'}</span>`;
  const del = '<button class="btn ghost icon-btn danger" data-act="del" aria-label="Apagar as partidas">' + icon('trash-2') + '</button>';
  if (recState.mode === 'game') {
    $('#recPickName').textContent = 'Jogo';
    pick.innerHTML = menuOrder().map(([id, g]) => `<option value="${id}" ${id === recState.game ? 'selected' : ''}>${g.name}</option>`).join('');
    const g = GAMES[recState.game];
    const rows = recData.records.filter(r => r.game === recState.game).sort((a, b) => (better(g, a.best, b.best) ? -1 : 1));
    const have = new Set(rows.map(r => r.userId));
    const free = recData.users.filter(u => !have.has(u.id));
    const avOf = r => avatarHtml(recData.users.find(u => u.id === r.userId)?.avatar) || accInitials(r.name);
    box.innerHTML = rows.map((r, i) => `<li class="rec" data-game="${recState.game}" data-user="${r.userId ?? ''}" data-name="${esc(r.name)}">
        ${rankBadge(i + 1)}<span class="acc-av">${avOf(r)}</span>
        <span class="acc-who"><b>${esc(r.name)}</b>${r.userId == null ? '<small>sem conta</small>' : ''}</span>
        ${valueField(recState.game, r.best, r.userId != null)}${count(r.count)}
        <span class="actions">${r.userId != null ? '<button class="btn ghost" data-act="save">Salvar</button>' : ''}${del}</span></li>`).join('')
      || `<li class="empty-state">${icon('trophy')}<b>Ninguém tem recorde em ${g.name} ainda</b><span>Adicione um abaixo, se precisar.</span></li>`;
    if (free.length) box.insertAdjacentHTML('beforeend', `<li class="rec add" data-game="${recState.game}">
        <span class="rec-plus" aria-hidden="true">+</span>
        <label class="rec-who">Adicionar recorde pra<select class="rec-u">${free.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>
        ${valueField(recState.game, '')}<span class="actions"><button class="btn" data-act="add">Adicionar</button></span></li>`);
  } else {
    $('#recPickName').textContent = 'Pessoa';
    pick.innerHTML = recData.users.map(u => `<option value="${u.id}" ${u.id === recState.userId ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
    const mine = new Map(recData.records.filter(r => r.userId === recState.userId).map(r => [r.game, r]));
    box.innerHTML = menuOrder().map(([id, g]) => {
      const r = mine.get(id);
      return `<li class="rec by-user${r ? '' : ' none'}" data-game="${id}" data-user="${recState.userId}">
        <span class="rec-game" style="--h:${g.hue}" aria-hidden="true">${icon(g.icon)}</span>
        <span class="acc-who"><b>${g.name}</b></span>
        ${valueField(id, r?.best)}${count(r?.count)}
        <span class="actions"><button class="btn ghost" data-act="save">${r ? 'Salvar' : 'Adicionar'}</button>${r ? del : ''}</span></li>`;
    }).join('');
  }
  // zerar tudo de uma vez: o ranking do jogo escolhido ou todos os pontos da pessoa escolhida
  const u = recData.users.find(x => x.id === recState.userId);
  const wipe = recState.mode === 'game' ? `Zerar o ranking de ${GAMES[recState.game].name}` : u ? `Zerar todos os pontos de ${esc(u.name)}` : '';
  if (wipe) box.insertAdjacentHTML('beforeend', `<li class="rec-wipe"><button class="btn ghost danger" id="recWipe">${icon('trash-2')} ${wipe}</button></li>`);
  $('#recWipe') && ($('#recWipe').onclick = clearRecords);
  box.querySelectorAll('[data-act]').forEach(b => b.onclick = () => recordAction(b));
  // valor mexido: o Salvar daquela linha fica em destaque
  box.querySelectorAll('.rec:not(.add) .rec-v').forEach(inp => inp.oninput = () => inp.closest('.rec').classList.toggle('changed', inp.value !== inp.defaultValue));
}

async function recordAction(btn) {
  const row = btn.closest('[data-game]'), game = row.dataset.game, g = GAMES[game];
  const act = btn.dataset.act;
  const userId = act === 'add' ? +row.querySelector('.rec-u').value : row.dataset.user ? +row.dataset.user : null;
  const who = act === 'add' ? row.querySelector('.rec-u').selectedOptions[0].textContent
    : row.dataset.name || recData.users.find(u => u.id === userId)?.name || '';
  try {
    if (act === 'del') {
      if (!confirm(`Apagar TODAS as partidas de ${who} em ${g.name}? Não dá pra desfazer.`)) return;
      const { removed } = await api('api/admin/records/delete', { method: 'POST', body: { game, userId, name: row.dataset.name } });
      await loadRecords(`${who}: ${removed} partida(s) apagada(s) em ${g.name}.`);
    } else {
      const raw = row.querySelector('.rec-v').value;
      if (raw === '') return alert('Digite um valor.');
      const value = Number(raw);
      const { removed } = await api('api/admin/records', { method: 'PUT', body: { game, userId, value } });
      await loadRecords(`${who} — ${g.name}: recorde agora é ${fmt(g, value)}${removed ? ` (${removed} partida(s) melhor(es) removida(s))` : ''}.`);
    }
    fetchScores(); // atualiza o ranking que o resto da página mostra
  } catch (err) { alert(err.message); }
}

async function clearRecords() {
  const byGame = recState.mode === 'game', g = GAMES[recState.game];
  const u = recData.users.find(x => x.id === recState.userId);
  const n = recData.records.filter(r => byGame ? r.game === recState.game : r.userId === recState.userId).reduce((a, r) => a + r.count, 0);
  const what = byGame ? `TODAS as partidas de ${g.name}, de todo mundo` : `TODOS os pontos de ${u.name}, em todos os jogos (a conta continua)`;
  if (!confirm(`Apagar ${what}? São ${n} partida(s). Antes sai uma cópia na lista de backups, de onde dá pra restaurar.`)) return;
  try {
    const { removed } = await api('api/admin/records/clear', { method: 'POST', body: byGame ? { game: recState.game } : { userId: recState.userId } });
    await loadRecords(`${byGame ? g.name : u.name}: ${removed} partida(s) apagada(s).`);
    loadBackups();
    fetchScores();
  } catch (err) { alert(err.message); }
}

async function loadBackups(msg = '') {
  const box = $('#bkList');
  if (!box) return;
  try {
    const { backups, canImport } = await api('api/admin/backups');
    const when = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const importBox = canImport ? `<div class="import-box"><div><b>${icon('upload')} Importar backup da produção</b>
        <p class="hint" style="text-align:left;margin:2px 0 0">Neste ambiente de teste: baixe o backup na produção e escolha o arquivo aqui. Troca as partidas e as contas daqui (nada muda na produção).</p></div>
        <label class="btn ghost" for="bkFile">Escolher arquivo...</label><input type="file" id="bkFile" accept=".json,application/json" hidden></div>` : '';
    box.innerHTML = importBox + (msg ? `<p class="note" style="margin:0 0 var(--space-sm)">${esc(msg)}</p>` : '') + (backups.length
      ? `<table class="tickets users"><thead><tr><th>Quando</th><th>Motivo</th><th>Partidas</th><th>Contas</th><th></th></tr></thead><tbody>
        ${backups.map(b => `<tr data-id="${b.id}"><td>${when(b.at)}</td><td>${esc(b.reason)}</td><td>${b.scores}</td><td>${b.users}</td>
          <td><div class="actions"><a class="btn ghost" href="api/admin/backups/download?id=${b.id}" download>Baixar</a>
          <button class="btn ghost" data-act="restore">Restaurar partidas</button></div></td></tr>`).join('')}</tbody></table>`
      : '<p class="hint" style="text-align:left">Nenhuma cópia ainda.</p>');
    const fileInput = box.querySelector('#bkFile');
    if (fileInput) fileInput.onchange = async () => {
      const f = fileInput.files[0];
      if (!f) return;
      let data;
      try { data = JSON.parse(await f.text()); } catch { fileInput.value = ''; return alert('Esse arquivo não é um backup válido (JSON).'); }
      if (!Array.isArray(data?.scores) || !Array.isArray(data?.users)) { fileInput.value = ''; return alert('Esse arquivo não é um backup do MicroGame.'); }
      if (!confirm(`Importar "${f.name}"?\n\nIsso TROCA as partidas (${data.scores.length}) e as contas (${data.users.length}) deste ambiente de teste pelas do arquivo. Nada muda na produção. Antes é feita uma cópia do estado atual.\n\nDepois você entra de novo com o usuário e a senha da produção.`)) { fileInput.value = ''; return; }
      try {
        const r = await api('api/admin/backups/import', { method: 'POST', body: data });
        alert(`Importado: ${r.scores} partidas e ${r.users} contas. Entre de novo com a conta da produção.`);
        location.reload();
      } catch (err) { alert(err.message); fileInput.value = ''; }
    };
    box.querySelectorAll('[data-act="restore"]').forEach(b => b.onclick = async () => {
      const id = +b.closest('tr').dataset.id, bk = backups.find(x => x.id === id);
      if (!confirm(`Trocar TODAS as partidas de agora pelas ${bk.scores} da cópia de ${when(bk.at)}?\n\nAntes disso é feita uma cópia do estado atual, então dá pra desfazer.`)) return;
      try {
        const { scores } = await api('api/admin/backups/restore', { method: 'POST', body: { id } });
        fetchScores(); await loadRecords(); await loadBackups(`Restaurado: ${scores} partidas.`);
      } catch (err) { alert(err.message); }
    });
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

// ---------- relatório (admin) ----------
const reportState = { days: 7 };
function showReport() {
  if (me?.role !== 'admin') return;
  stop();
  currentView = 'report';
  setTimeout(pingSession, 0);
  swap(() => {
    main.classList.remove('game-view');
    main.innerHTML = `<div class="admin report">
      <div class="stage-head">
        <button class="btn ghost icon-btn back" id="back" aria-label="Voltar ao menu">${icon('arrow-left')}</button>
        <div class="title"><h2>${icon('settings')} Administração</h2><p>Quanto o pessoal está jogando — por pessoa, por jogo, por dia e por hora.</p></div>
      </div>
      ${adminTabsHtml('report')}
      <div class="row" style="justify-content:space-between">
        <div class="seg" role="group" aria-label="Período">
          ${[[1, 'Hoje'], [7, '7 dias'], [30, '30 dias'], [0, 'Tudo']].map(([d, l]) => `<button data-days="${d}" aria-pressed="${reportState.days === d}">${l}</button>`).join('')}
        </div>
        <button class="btn ghost" id="csv">${icon('download')} Exportar CSV</button>
      </div>
      <div id="rep"><p class="hint" style="text-align:left">Carregando...</p></div>
      <section class="glass" style="margin-top:var(--space-md)" id="workplay"></section>
      <section class="glass" style="margin-top:var(--space-md)" id="errs"></section>
    </div>`;
    $('#back').onclick = showMenu;
    loadErrors();
    loadWorkplay();
    // só os botões de período: '.seg button' pegava também as abas da Administração e travava a troca de aba
    main.querySelectorAll('[data-days]').forEach(b => b.onclick = () => {
      reportState.days = +b.dataset.days;
      main.querySelectorAll('[data-days]').forEach(x => x.setAttribute('aria-pressed', x === b));
      loadReport();
    });
    loadReport();
  });
}

// jogo × trabalho na semana: partidas, tickets resolvidos no Geiko e fila de agora, por pessoa vinculada
async function loadWorkplay(force = false) {
  const box = $('#workplay');
  if (!box) return;
  box.innerHTML = `<h2>${icon('ticket')} Jogo × trabalho (semana)</h2><p class="hint" style="text-align:left">Consultando o Geiko...</p>`;
  try {
    const d = await api('api/admin/workplay' + (force ? '?force=1' : ''));
    const since = new Date(d.since).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    box.innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0">${icon('ticket')} Jogo × trabalho (semana)</h2>
        <button class="btn ghost" id="wpRefresh">${icon('refresh-cw')} Atualizar</button></div>
      <p class="hint" style="text-align:left;margin:var(--space-xs) 0 var(--space-sm)">Desde ${since}. Tickets resolvidos = finalizados no Geiko. Fila = soma dos pesos de agora (a mesma conta do bloqueio).
        ${d.at ? `Consultado há ${ago(Date.now() - d.at)}.` : ''}</p>
      ${d.error ? `<p class="err">${esc(d.error)}</p>` : ''}
      ${d.people.length ? `<table class="tickets users"><thead><tr><th>Pessoa</th><th>Tickets resolvidos</th><th>Partidas</th><th>Fila agora</th></tr></thead><tbody>
        ${d.people.map((p, k) => `<tr><td>${k === 0 && p.closed ? icon('ticket') + ' ' : ''}${esc(p.name)}</td><td><b>${p.closed}</b></td><td>${p.plays}</td>
          <td>${p.queue == null ? '<span class="hint">—</span>' : `${fmtW(p.queue)}${p.blocked ? ` <span class="tag">${icon('lock')} bloqueado</span>` : ''}`}</td></tr>`).join('')}</tbody></table>`
        : '<p class="hint" style="text-align:left">Ninguém com ID do Geiko vinculado.</p>'}`;
    $('#wpRefresh').onclick = () => loadWorkplay(true);
  } catch (err) { box.innerHTML = `<h2>${icon('ticket')} Jogo × trabalho (semana)</h2><p class="err">${esc(err.message)}</p>`; }
}

// erros que aconteceram no navegador do pessoal (todo o período; guarda os 300 mais novos)
async function loadErrors() {
  const box = $('#errs');
  if (!box) return;
  try {
    const { errors } = await api('api/admin/errors');
    box.innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0">${icon('triangle-alert')} Erros no navegador</h2>
      ${errors.length ? '<button class="btn ghost" id="errClear">Limpar lista</button>' : ''}</div>
      ${errors.length ? `<table class="tickets users" style="margin-top:var(--space-sm)"><thead><tr><th>Erro</th><th>Vezes</th><th>Onde</th><th>Quem</th><th>Último</th></tr></thead><tbody>
        ${errors.map(e => `<tr><td><code style="white-space:pre-wrap;word-break:break-word">${esc(e.message)}</code>${e.source ? `<br><span class="hint">${esc(e.source.split('\n')[0])}</span>` : ''}</td>
          <td>${e.count}</td><td>${e.views.map(v => GAMES[v] ? GAMES[v].name : v).join(', ') || '—'}</td>
          <td>${esc(e.people.join(', ')) || '—'}</td><td>há ${ago(Date.now() - e.last)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="hint" style="text-align:left;margin:var(--space-xs) 0 0">Nenhum erro registrado.</p>'}`;
    $('#errClear') && ($('#errClear').onclick = async () => {
      if (!confirm('Apagar a lista de erros?')) return;
      try { await api('api/admin/errors/clear', { method: 'POST', body: {} }); loadErrors(); } catch (err) { alert(err.message); }
    });
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

let reportData = null;
async function loadReport() {
  const box = $('#rep');
  if (!box) return;
  box.style.opacity = reportData ? 0.5 : 1; // mantém o anterior meio apagado enquanto carrega (sem pulo)
  try {
    reportData = await api(`api/admin/report?days=${reportState.days}&tz=${-new Date().getTimezoneOffset()}`);
    renderReport();
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  box.style.opacity = 1;
}

function renderReport() {
  const d = reportData, box = $('#rep');
  const games = menuOrder();
  const periodo = { 1: 'hoje', 7: 'nos últimos 7 dias', 30: 'nos últimos 30 dias', 0: 'desde o começo' }[d.days];
  const prevLabel = { 1: 'ontem', 7: '7 dias anteriores', 30: '30 dias anteriores' }[d.days];
  const topGame = Object.entries(d.byGame).sort((a, b) => b[1] - a[1])[0];
  const top = d.people[0];
  let delta = '';
  if (d.prevTotal !== null) {
    const diff = d.total - d.prevTotal;
    delta = d.prevTotal === 0 ? (d.total ? `<span class="d up">▲ novo — ${prevLabel}: 0</span>` : `<span class="d">igual a ${prevLabel}</span>`)
      : `<span class="d ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '▲' : diff < 0 ? '▼' : '='} ${Math.abs(Math.round(diff / d.prevTotal * 100))}% vs ${prevLabel} (${d.prevTotal})</span>`;
  }
  const kpis = `<div class="kpis">
    <div class="kpi glass"><div class="l">Partidas ${periodo}</div><div class="v">${d.total.toLocaleString('pt-BR')}</div>${delta}</div>
    <div class="kpi glass"><div class="l">Pessoas que jogaram</div><div class="v">${d.people.length}</div></div>
    <div class="kpi glass"><div class="l">Jogo mais jogado</div><div class="v">${topGame ? `${GAMES[topGame[0]].name}` : '—'}</div>${topGame ? `<span class="d">${topGame[1]} partidas</span>` : ''}</div>
    <div class="kpi glass"><div class="l">Quem mais jogou</div><div class="v">${top ? esc(top.name) : '—'}</div>${top ? `<span class="d">${top.total} partidas</span>` : ''}</div>
  </div>`;
  if (!d.total) { box.innerHTML = kpis + '<section class="glass" style="margin-top:var(--space-md)"><p class="hint" style="text-align:left">Ninguém jogou nesse período.</p></section>'; return; }

  // heatmap pessoa × jogo: mais partidas = tom mais claro da mesma rampa azul
  const max = Math.max(...d.people.flatMap(p => Object.values(p.games)));
  const step = n => Math.min(5, 1 + Math.floor((n / max) * 4.999));
  const cell = (n, who, g) => n
    ? `<td style="background:var(--heat-${step(n)});color:${step(n) >= 4 ? '#0b0b0b' : '#fff'}" data-tip="${esc(who)} · ${GAMES[g].name}: ${n} partida${n > 1 ? 's' : ''}">${n}</td>`
    : `<td class="z" data-tip="${esc(who)} · ${GAMES[g].name}: nenhuma">·</td>`;
  const colTot = games.map(([g]) => d.byGame[g] || 0);
  const heat = `<section class="glass" style="margin-top:var(--space-md)">
    <h2>Partidas por pessoa e jogo</h2>
    <div class="heat-wrap"><table class="heat">
      <thead><tr><th></th>${games.map(([id, g]) => `<th title="${g.name}" data-tip="${g.name}">${icon(g.icon)}</th>`).join('')}<th style="font-size:var(--fs-xs)">Total</th><th style="font-size:var(--fs-xs);text-align:left">Jogou por último</th></tr></thead>
      <tbody>${d.people.map(p => `<tr><th>${esc(p.name)}</th>${games.map(([g]) => cell(p.games[g] || 0, p.name, g)).join('')}
        <td class="tot">${p.total}</td><td class="last">há ${ago(Date.now() - p.last)} · ${GAMES[p.lastGame] ? GAMES[p.lastGame].name : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th style="text-align:left;color:var(--text)">Total</th>${colTot.map(n => `<td>${n || '·'}</td>`).join('')}<td>${d.total}</td><td></td></tr></tfoot>
    </table></div>
    <div class="heat-legend">menos ${[1, 2, 3, 4, 5].map(i => `<i style="background:var(--heat-${i})"></i>`).join('')} mais <span style="margin-left:8px">(máximo numa célula: ${max})</span></div>
  </section>`;

  // colunas (1 série, 1 cor): rótulo só no maior valor; o resto fica no eixo, na dica e na tabela
  const columns = (items, labelEvery, tipOf, title) => {
    const m = Math.max(1, ...items.map(i => i.v)), maxIdx = items.findIndex(i => i.v === m);
    const nice = m <= 4 ? m : Math.ceil(m / 4) * 4;
    return `<div class="cols" role="img" aria-label="${title}">
      ${[nice, nice / 2].map(v => `<div class="grid" style="bottom:${(v / nice) * 100}%"><span>${Number.isInteger(v) ? v : v.toFixed(1)}</span></div>`).join('')}
      ${items.map((it, i) => `<div class="c" tabindex="0" data-tip="${tipOf(it)}" aria-label="${tipOf(it)}">
        <i style="height:${(it.v / nice) * 100}%"></i>${i === maxIdx && it.v ? `<b style="bottom:${(it.v / nice) * 100}%">${it.v}</b>` : ''}</div>`).join('')}
    </div>
    <div class="xlabels">${items.map((it, i) => `<span>${i % labelEvery === 0 || i === items.length - 1 ? it.l : ''}</span>`).join('')}</div>
    <details><summary>Ver como tabela</summary><table class="tickets" style="margin-top:6px">${items.map(it => `<tr><td>${it.full || it.l}</td><td class="w">${it.v}</td></tr>`).join('')}</table></details>`;
  };
  const fmtDay = s => { const [y, mo, dd] = s.split('-'); return `${dd}/${mo}`; };
  const weekday = s => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const days = d.byDay.map(x => ({ l: fmtDay(x.day), full: `${weekday(x.day)} ${fmtDay(x.day)}`, v: x.count }));
  const hours = d.byHour.map((v, h) => ({ l: `${h}h`, full: `${h}h–${h + 1}h`, v }));
  const charts = `<div class="kpis" style="margin-top:var(--space-md);grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))">
    ${days.length > 1 ? `<section class="glass" style="padding:var(--space-md)"><h2>Partidas por dia</h2>
      ${columns(days, Math.ceil(days.length / 8), it => `${it.full}: ${it.v} partida${it.v === 1 ? '' : 's'}`, 'Partidas por dia')}</section>` : ''}
    <section class="glass" style="padding:var(--space-md)"><h2>Horário de pico</h2>
      ${columns(hours, 3, it => `${it.full}: ${it.v} partida${it.v === 1 ? '' : 's'}`, 'Partidas por hora do dia')}</section>
  </div>`;
  const ranked = games.map(([g, gg]) => ({ g, gg, n: d.byGame[g] || 0 })).sort((a, b) => b.n - a.n);
  const hmax = Math.max(1, ranked[0].n);
  const hbars = `<section class="glass" style="margin-top:var(--space-md)"><h2>Jogos mais jogados</h2>
    <div class="hbars">${ranked.map(r => `<span>${icon(r.gg.icon)} ${r.gg.name}</span><span class="t" data-tip="${r.gg.name}: ${r.n} partidas"><i style="width:${(r.n / hmax) * 100}%"></i></span><span class="n">${r.n}</span>`).join('')}</div>
  </section>`;
  box.innerHTML = kpis + heat + charts + hbars;
  bindVizTips(box);
}

// dica que segue o mouse (e o foco do teclado) em qualquer [data-tip]
function bindVizTips(root) {
  let tip = $('.viz-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'viz-tip'; tip.hidden = true; document.body.appendChild(tip); }
  const show = (el, x, y) => { tip.textContent = el.dataset.tip; tip.hidden = false; tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, x + 12) + 'px'; tip.style.top = Math.max(8, y - tip.offsetHeight - 10) + 'px'; };
  root.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mousemove', e => show(el, e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => (tip.hidden = true));
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); });
    el.addEventListener('blur', () => (tip.hidden = true));
  });
}

document.addEventListener('click', e => {
  if (e.target.id !== 'csv' || !reportData) return;
  // CSV da tabela pessoa × jogo (abre no Excel: separador ; e BOM pra acentuar certo)
  const games = menuOrder();
  const lines = [['Pessoa', ...games.map(([, g]) => g.name), 'Total'].join(';'),
    ...reportData.people.map(p => [p.name, ...games.map(([g]) => p.games[g] || 0), p.total].join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `microgame-relatorio-${reportState.days || 'tudo'}d.csv` });
  a.click(); URL.revokeObjectURL(a.href);
});

// enquanto o painel estiver aberto e visível, atualiza a lista
setInterval(() => { if (currentView === 'admin' && !document.hidden && !$('.modal')) { loadOnline(); } }, 15_000);

async function previewHtml(geikoId) {
  try {
    const g = await api('api/admin/preview?geikoId=' + encodeURIComponent(geikoId));
    if (g.error) return `<p class="err">${esc(g.error)}</p>`;
    return `<p style="margin:0 0 8px"><b>${g.blocked ? icon('lock') + ' Bloqueado' : icon('circle-check') + ' Liberado'}</b> — ${g.tickets.length} tickets, soma <b>${fmtW(g.total)}</b> (limite ${fmtW(g.limit)})</p>${ticketsTable(g.tickets)}`;
  } catch (err) { return `<p class="err">${esc(err.message)}</p>`; }
}

function tempPasswordDialog(name, pass, username) {
  // mensagem pronta pra mandar no chat (com o login quando é conta nova)
  const msg = `Seu acesso ao MicroGame: ${location.origin}${location.pathname}\n${username ? `Usuário: ${username}\n` : ''}Senha temporária: ${pass}\nNo primeiro login você cria a sua senha.`;
  const { el, close } = modal(`
    <h2>${icon('key-round')} Senha temporária</h2>
    <p>Passe pra <b>${esc(name)}</b>. No primeiro login a pessoa cria a própria senha. <b>Ela não aparece de novo.</b></p>
    <div class="secret">${esc(pass)}</div>
    <textarea class="dt-share-txt" readonly rows="5" aria-label="Mensagem pronta">${esc(msg)}</textarea>
    <button class="btn ghost" id="copyPass">${icon('copy')} Copiar mensagem</button>
    <button class="btn" id="okPass">Pronto</button>`, { locked: true });
  el.querySelector('#copyPass').onclick = async e => { await navigator.clipboard?.writeText(msg).catch(() => {}); e.currentTarget.innerHTML = `${icon('circle-check')} Copiado`; };
  el.querySelector('#okPass').onclick = close;
}

// ---------- contas ----------
const ACC_FILTERS = [['all', 'Todas'], ['player', 'Jogadores'], ['admin', 'Admins'], ['blocked', 'Bloqueadas'], ['off', 'Desativadas']];
let accFilter = 'all', accUsers = [];
const accMatch = {
  all: u => u.active, player: u => u.active && u.role === 'player', admin: u => u.active && u.role === 'admin',
  blocked: u => u.active && !!u.block, off: u => !u.active,
};
// "Ana Beatriz Souza" -> "ana.souza" (sem acento, minúsculo): sugestão de login enquanto digita o nome
function suggestUsername(name) {
  const p = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).filter(Boolean);
  return (p.length > 1 ? `${p[0]}.${p[p.length - 1]}` : p[0] || '').slice(0, 32);
}

/** Janela de criar (sem `u`) ou editar conta: os mesmos campos, com explicação de cada um. */
function accountModal(u = null) {
  const self = u && u.id === me.id, role = u?.role || 'player';
  const { el, close } = modal(`
    <h2>${icon(u ? 'pencil' : 'user-plus')} ${u ? `Editar ${esc(u.name)}` : 'Nova conta'}</h2>
    <form id="accForm" class="admin acc-form" autocomplete="off">
      <label>Nome<input name="name" maxlength="40" value="${esc(u?.name || '')}" required placeholder="ex.: Ana Beatriz"><small>É o que aparece no ranking.</small></label>
      <label>Usuário<input name="username" maxlength="32" pattern="[A-Za-z0-9._\\-]{3,32}" value="${esc(u?.username || '')}" required placeholder="ex.: ana.beatriz" autocapitalize="off" spellcheck="false"><small>Usado pra entrar. Letras, números, ponto, hífen ou _ (3 a 32).</small></label>
      <label>ID do Geiko<input name="geikoId" inputmode="numeric" pattern="\\d*" value="${esc(u?.geikoId || '')}" placeholder="opcional"><small>Com o ID, a fila de tickets da pessoa pode bloquear os jogos. Sem ID, nunca bloqueia.</small></label>
      <fieldset class="acc-role"${self ? ' disabled' : ''}><legend>Papel</legend>
        <label><input type="radio" name="role" value="player"${role === 'player' ? ' checked' : ''}><span>${icon('gamepad-2')}<b>Jogador</b><small>Joga e aparece no ranking</small></span></label>
        <label><input type="radio" name="role" value="admin"${role === 'admin' ? ' checked' : ''}><span>${icon('shield')}<b>Admin</b><small>Também abre a Administração</small></span></label>
      </fieldset>
      ${self ? '<p class="hint" style="text-align:left">Você não pode mudar o seu próprio papel.</p>' : ''}
      <p class="err" id="accErr"></p>
      <div class="acc-actions"><button type="button" class="btn ghost" id="accCancel">Cancelar</button><button class="btn">${u ? 'Salvar' : 'Criar conta'}</button></div>
      ${u ? '' : '<p class="hint" style="text-align:left">Ao criar, aparece uma senha temporária pra passar pra pessoa. No primeiro login ela cria a própria senha.</p>'}
    </form>`, { wide: true });
  const f = el.querySelector('#accForm'), name = f.elements.name, user = f.elements.username;
  // login sugerido a partir do nome, até a pessoa mexer no campo de usuário
  let touched = !!u;
  user.addEventListener('input', () => { touched = true; });
  name.addEventListener('input', () => { if (!touched) user.value = suggestUsername(name.value); });
  el.querySelector('#accCancel').onclick = close;
  name.focus();
  f.onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    if (self) delete body.role;
    const btn = f.querySelector('button:not([type])');
    btn.disabled = true;
    try {
      if (u) {
        const { user: saved } = await api(`api/admin/users/${u.id}`, { method: 'PATCH', body });
        if (saved.id === me.id) setMe({ ...me, ...saved });
        close(); loadUsers();
      } else {
        const { user: made, tempPassword } = await api('api/admin/users', { method: 'POST', body });
        close(); loadUsers();
        tempPasswordDialog(made.name, tempPassword, made.username);
      }
    } catch (err) { el.querySelector('#accErr').textContent = err.message; btn.disabled = false; }
  };
}

async function loadUsers() {
  if (!$('#usersList')) return;
  try {
    ({ users: accUsers } = await api('api/admin/users'));
    renderUsers();
    loadOnline(); // bloquear/desbloquear também muda a lista de online
  } catch (err) { $('#usersList').innerHTML = `<li class="err">${esc(err.message)}</li>`; }
}
function renderUsers() {
  const list = $('#usersList');
  if (!list) return;
  const q = ($('#accQ')?.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [k] of ACC_FILTERS) { const n = main.querySelector(`[data-accn="${k}"]`); if (n) n.textContent = accUsers.filter(accMatch[k]).length; }
  $('#accCount').textContent = `${accUsers.filter(x => x.active).length} ativas`;
  const shown = accUsers.filter(accMatch[accFilter]).filter(x => !q || norm(x.name).includes(q) || norm(x.username).includes(q));
  list.innerHTML = shown.map(u => {
    const owner = u.canEditRecords && u.id !== me.id;
    const chips = [
      u.role === 'admin' ? `<span class="chip admin">${icon('shield')} Admin</span>` : '',
      u.id === me.id ? '<span class="chip">Você</span>' : '',
      u.mustChange ? '<span class="chip warn" title="Ainda não trocou a senha temporária">Senha temporária</span>' : '',
      u.block ? `<span class="chip bad" title="${esc(u.block.reason || '')}">${icon('lock')} Bloqueada ${untilText(u.block.until)}</span>` : '',
      !u.active ? '<span class="chip off">Desativada</span>' : '',
      u.geikoId ? `<span class="chip">Geiko ${esc(u.geikoId)}</span>` : '',
    ].join('');
    return `<li class="acc${u.active ? '' : ' off'}" data-id="${u.id}">
      <span class="acc-av">${avatarHtml(u.avatar) || accInitials(u.name)}</span>
      <span class="acc-who"><b>${esc(u.name)}</b><small>@${esc(u.username)}</small></span>
      <span class="acc-chips">${chips}</span>
      <span class="actions">${owner ? '<span class="hint">conta do dono</span>' : `
        ${u.id === me.id ? '' : u.block ? `<button class="btn ghost" data-act="unblock" aria-label="Desbloquear ${esc(u.name)}">${icon('lock-open')}<span class="t">Desbloquear</span></button>` : `<button class="btn ghost" data-act="block" aria-label="Bloquear ${esc(u.name)}">${icon('lock')}<span class="t">Bloquear</span></button>`}
        <button class="btn ghost" data-act="edit" aria-label="Editar ${esc(u.name)}">${icon('pencil')}<span class="t">Editar</span></button>
        <span class="acc-more"><button class="btn ghost icon-btn" data-more aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações de ${esc(u.name)}">${icon('ellipsis')}</button>
          <span class="acc-menu glass" role="menu" hidden>
            ${u.geikoId ? `<button role="menuitem" data-act="test">${icon('clock')} Ver fila no Geiko</button>` : ''}
            <button role="menuitem" data-act="reset">${icon('key-round')} Gerar nova senha</button>
            ${u.id === me.id ? '' : `<button role="menuitem" data-act="toggle" class="${u.active ? 'danger' : ''}">${icon(u.active ? 'x' : 'refresh-cw')} ${u.active ? 'Desativar conta' : 'Reativar conta'}</button>`}
          </span></span>`}
      </span></li>`;
  }).join('') || `<li class="empty-state">${icon('search')}<b>Nenhuma conta aqui</b><span>${q ? 'Ninguém com esse nome ou usuário.' : 'Troque o filtro acima.'}</span></li>`;
  list.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { closeAccMenus(); userAction(b.dataset.act, accUsers.find(u => u.id === +b.closest('li').dataset.id)); });
  list.querySelectorAll('[data-more]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const menu = b.nextElementSibling, open = menu.hidden;
    closeAccMenus();
    menu.hidden = !open; b.setAttribute('aria-expanded', open);
  });
}
// sem avatar escolhido: as iniciais num círculo com uma cor tirada do nome
function accInitials(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const ini = name.trim().split(/\s+/).map(w => w[0]).filter(Boolean);
  return `<span class="acc-ini" style="--h:${h}" aria-hidden="true">${esc((ini[0] || '?') + (ini.length > 1 ? ini[ini.length - 1] : '')).toUpperCase()}</span>`;
}
function closeAccMenus() {
  document.querySelectorAll('.acc-menu').forEach(m => { m.hidden = true; m.previousElementSibling?.setAttribute('aria-expanded', 'false'); });
}
document.addEventListener('click', e => { if (!e.target.closest('.acc-more')) closeAccMenus(); });

async function userAction(act, u) {
  if (act === 'unblock') {
    try { await api(`api/admin/users/${u.id}/unblock`, { method: 'POST', body: {} }); loadUsers(); }
    catch (err) { alert(err.message); }
  }
  if (act === 'block') {
    const endOfDay = () => { const d = new Date(); d.setHours(23, 59, 0, 0); return Math.max(1, Math.round((d - Date.now()) / 60000)); };
    const { el, close } = modal(`
      <h2>${icon('lock')} Bloquear ${esc(u.name)}</h2>
      <p>A pessoa continua entrando e vendo o ranking, mas não joga. Se estiver jogando, a partida é encerrada em até ~20s.</p>
      <form id="bf" class="admin">
        <label>Por quanto tempo
          <select name="minutes">
            <option value="15">15 minutos</option><option value="30">30 minutos</option><option value="60" selected>1 hora</option>
            <option value="120">2 horas</option><option value="eod">Até o fim do dia</option><option value="0">Até eu desbloquear</option>
          </select></label>
        <label>Motivo (opcional — a pessoa vê)<input name="reason" maxlength="120" placeholder="ex.: fila de tickets cheia"></label>
        <p class="err" id="berr"></p>
        <button class="btn">Bloquear</button>
        <button type="button" class="btn ghost" id="bcancel">Cancelar</button>
      </form>`, { wide: true });
    el.querySelector('#bcancel').onclick = close;
    el.querySelector('#bf').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), v = f.get('minutes');
      try {
        await api(`api/admin/users/${u.id}/block`, { method: 'POST', body: { minutes: v === 'eod' ? endOfDay() : Number(v), reason: f.get('reason') } });
        close(); loadUsers();
      } catch (err) { el.querySelector('#berr').textContent = err.message; }
    };
  }
  if (act === 'test') {
    const { el, close } = modal(`<h2>Fila de ${esc(u.name)}</h2><div id="pv"><p>Consultando o Geiko...</p></div><button class="btn" id="pvc">Fechar</button>`, { wide: true });
    el.querySelector('#pvc').onclick = close;
    el.querySelector('#pv').innerHTML = await previewHtml(u.geikoId);
  }
  if (act === 'reset') {
    if (!confirm(`Gerar uma nova senha temporária pra ${u.name}? A senha atual deixa de funcionar e a pessoa é deslogada.`)) return;
    try { const { tempPassword } = await api(`api/admin/users/${u.id}/reset-password`, { method: 'POST', body: {} }); loadUsers(); tempPasswordDialog(u.name, tempPassword); }
    catch (err) { alert(err.message); }
  }
  if (act === 'toggle') {
    if (u.active && !confirm(`Desativar ${u.name}? A pessoa é deslogada e não consegue mais entrar.`)) return;
    try { await api(`api/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); loadUsers(); }
    catch (err) { alert(err.message); }
  }
  if (act === 'edit') accountModal(u);
}

// interruptor (checkbox com role="switch") com título e explicação ao lado
const ruleSwitch = (name, on, title, desc) => `<label class="sw-row"><span class="sw-txt"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span>
  <input type="checkbox" role="switch" name="${name}"${on ? ' checked' : ''}><span class="sw" aria-hidden="true"></span></label>`;

async function loadRules() {
  const form = $('#rulesForm');
  if (!form) return;
  try {
    const { rules, situations } = await api('api/admin/rules');
    const sitEntries = Object.entries(situations).sort((a, b) => a[1].localeCompare(b[1]));
    const num = (name, value, step, extra = '') => `<input type="number" name="${name}" step="${step}" min="0" value="${value}" ${extra}>`;
    form.innerHTML = `
      <div class="set-grid">
        <div class="set-card">
          ${ruleSwitch('enabled', rules.enabled, 'Bloqueio por fila', 'Com a soma da fila acima do limite, os jogos ficam bloqueados.')}
          <label class="set-inline set-dep">Bloqueia quando a soma passar de ${num('limit', rules.limit, 0.25)}</label>
        </div>
        <div class="set-card">
          ${ruleSwitch('fh_enabled', rules.freeHours.enabled, 'Horário livre', 'Nesse horário (Brasília) todo mundo joga, mesmo com ticket aberto. O bloqueio manual continua valendo.')}
          <div class="set-inline set-dep"><label>Das ${num('fh_from', rules.freeHours.from, 1, 'max="23" aria-label="Livre a partir das (hora)"')}</label><label>às ${num('fh_to', rules.freeHours.to, 1, 'max="23" aria-label="Até as (hora)"')} h</label></div>
          <label class="chk set-dep"><input type="checkbox" name="fh_weekends"${rules.freeHours.weekends ? ' checked' : ''}> Sábado e domingo o dia todo</label>
        </div>
        <div class="set-card wide">
          <h3>Peso de cada ticket</h3>
          <p class="note">Peso = prioridade × multiplicador. Ticket com interação do atendente e fora dos status de espera fica só com o peso da prioridade.</p>
          <div class="prio-grid">${PRIO_FIELDS.map(([k, label]) => `<label class="prio p-${k}"><span>${label}</span>${num('p_' + k, rules.priority[k], 0.25)}</label>`).join('')}</div>
          <div class="mult-grid">
            <label class="mult"><span><b>× Sem interação</b><small>O atendente ainda não mexeu no ticket</small></span>${num('noInteractionMult', rules.noInteractionMult, 0.05)}</label>
            <label class="mult"><span><b>× Status de espera</b><small>O ticket depende de outra pessoa (status marcados abaixo)</small></span>${num('waitingClientMult', rules.waitingClientMult, 0.05)}</label>
          </div>
          <p class="weight-ex" id="weightEx" aria-live="polite"></p>
          <fieldset class="sit-chips"><legend>Status de espera</legend>
            ${sitEntries.length ? sitEntries.map(([id, name]) => `<label><input type="checkbox" name="sit" value="${id}"${rules.waitingClientSituationIds.includes(+id) ? ' checked' : ''}><span>${icon('circle-check')}${esc(name)}</span></label>`).join('')
              : '<span class="hint">Não consegui buscar os status no Geiko agora.</span>'}
          </fieldset>
        </div>
        <div class="set-card wide">
          ${ruleSwitch('weeklyPublic', rules.weeklyPublic, 'Ranking de tickets da semana pra todos', 'Desligado: todo mundo vê só quem mais resolveu; os números de cada um ficam no Relatório.')}
        </div>
      </div>
      <div class="save-bar"><span id="rulesMsg" class="hint" role="status"></span><button class="btn">Salvar regra</button></div>`;
    // exemplo com os números que estão na tela (muda enquanto digita)
    const showExample = () => {
      const v = n => Number(form.elements[n].value) || 0, p = v('p_URG'), lim = v('limit');
      $('#weightEx').innerHTML = `Exemplo, ticket <b>Urgente</b>: com interação pesa <b>${fmtW(p)}</b>, sem interação <b>${fmtW(+(p * v('noInteractionMult')).toFixed(2))}</b>, em espera <b>${fmtW(+(p * v('waitingClientMult')).toFixed(2))}</b>. Limite: <b>${fmtW(lim)}</b>.`;
    };
    showExample();
    form.oninput = () => { showExample(); form.classList.add('dirty'); $('#rulesMsg').textContent = 'Alterações não salvas'; };
    form.onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(form);
      const body = {
        enabled: f.get('enabled') === 'on',
        weeklyPublic: f.get('weeklyPublic') === 'on',
        limit: f.get('limit'),
        priority: Object.fromEntries(PRIO_FIELDS.map(([k]) => [k, f.get('p_' + k)])),
        noInteractionMult: f.get('noInteractionMult'),
        waitingClientMult: f.get('waitingClientMult'),
        freeHours: { enabled: f.get('fh_enabled') === 'on', weekends: f.get('fh_weekends') === 'on', from: f.get('fh_from'), to: f.get('fh_to') },
        // sem a lista do Geiko na tela, mantém a que já estava salva
        waitingClientSituationIds: sitEntries.length ? f.getAll('sit').map(Number) : rules.waitingClientSituationIds,
      };
      try {
        await api('api/admin/rules', { method: 'PUT', body });
        form.classList.remove('dirty');
        $('#rulesMsg').textContent = 'Regra salva. Vale a partir da próxima consulta de cada um.';
        refreshGate(true);
      } catch (err) { $('#rulesMsg').textContent = err.message; }
    };
  } catch (err) { form.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}
// uma barra só com todas as abas: as partes do Painel, o Relatório e os Recordes (este só pra conta dona)
function adminTabsHtml(cur) {
  const tabs = [...ADMIN_PANES, ['report', 'chart-column', 'Relatório'], ['records', 'wrench', 'Recordes']].filter(([k]) => k !== 'records' || me?.canEditRecords);
  return `<nav class="adm-tabs" role="tablist" aria-label="Administração">${tabs.map(([k, ic, l]) =>
    `<button role="tab" data-atab="${k}" aria-selected="${cur === k}">${icon(ic)}<span>${l}</span></button>`).join('')}</nav>`;
}
function setAdminPane(k) {
  adminPane = k;
  main.querySelectorAll('[data-atab]').forEach(x => x.setAttribute('aria-selected', x.dataset.atab === k));
  main.querySelectorAll('[data-pane]').forEach(sec => { sec.hidden = sec.dataset.pane !== k; });
  if (k === 'respostas') loadAnswers(ansDay);
}

// ---------- respostas do dia (gabarito dos jogos diários + o que cada um mandou) ----------
let ansDay = null; // null = hoje
const ansDate = d => new Date(d * 86_400_000 + 43_200_000).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' });
const ansPegs = code => `<span class="ans-pegs">${code.map(c => `<i class="sn-peg k${c}"><span>${c + 1}</span></i>`).join('')}</span>`;
async function loadAnswers(day) {
  const box = $('#ansList');
  if (!box) return;
  box.style.opacity = 0.5;
  try {
    const d = await api('api/admin/daily-answers' + (day == null ? '' : `?day=${day}`));
    ansDay = d.day === d.today ? null : d.day;
    $('#ansDay').textContent = d.day === d.today ? `hoje, ${ansDate(d.day)}` : ansDate(d.day);
    $('#ansNext').disabled = d.day >= d.today;
    $('#ansToday').disabled = d.day === d.today;
    box.innerHTML = d.games.map(g => {
      const name = GAMES[g.game]?.name || g.game, won = g.players.filter(p => p.won).length;
      const key = `${g.text ? `<p class="ans-text">${esc(g.text)}</p>` : ''}${g.pegs ? ansPegs(g.pegs) : ''}
        ${(g.sections || []).map(s => `${s.title ? `<h4>${esc(s.title)}</h4>` : ''}<div class="ans-words">${s.words.map(w =>
          `<span class="chip${w.star ? ' admin' : ''}"${w.clue ? ` title="${esc(w.clue)}"` : ''}>${w.star ? icon('star') : ''}${esc(w.w)}</span>${w.clue ? `<span class="ans-clue">${esc(w.clue)}</span>` : ''}`).join('')}</div>`).join('')}`;
      const status = p => (p.won ? `<span class="chip ok">${icon('circle-check')} acertou</span>` : p.over ? '<span class="chip bad">não acertou</span>' : '<span class="chip warn">jogando</span>');
      return `<article class="ans-card">
        <div class="ans-head">${icon(g.game)}<h3>${esc(name)}</h3><span class="hint">${g.players.length ? `${g.players.length} jogaram · ${won} acertaram` : 'ninguém jogou'}</span></div>
        <button class="ans-key" aria-label="Mostrar a resposta de ${esc(name)}">${key}</button>
        ${g.players.length ? `<details><summary>O que cada um mandou</summary><ul class="ans-players">${g.players.map(p => `<li>
          <div class="ans-who"><b>${esc(p.name)}</b>${status(p)}${p.score ? `<span class="hint">${p.score} pts</span>` : ''}</div>
          <div class="ans-sent">${p.pegs ? p.pegs.map(ansPegs).join('') : (p.sent || []).map(x => `<span>${esc(String(x))}</span>`).join('') || '<span class="hint">nada ainda</span>'}</div></li>`).join('')}</ul></details>` : ''}
      </article>`;
    }).join('');
    box.querySelectorAll('.ans-key').forEach(b => b.onclick = () => { b.classList.add('open'); b.removeAttribute('aria-label'); });
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  box.style.opacity = 1;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-atab]');
  if (!b || b.getAttribute('aria-selected') === 'true') return;
  const k = b.dataset.atab;
  if (k === 'report') showReport();
  else if (k === 'records') showRecords();
  else if (currentView === 'admin') setAdminPane(k);
  else { adminPane = k; showAdmin(); }
});

// menu da conta (topo)
function toggleAcct(open = $('#acctMenu').hidden) {
  $('#acctMenu').hidden = !open;
  $('#acctBtn').setAttribute('aria-expanded', open);
}
document.addEventListener('click', e => { if (!e.target.closest('.acct')) toggleAcct(false); });

function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

