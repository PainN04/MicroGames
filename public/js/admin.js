// ---------- painel admin ----------
const PRIO_FIELDS = [['URG', 'Urgente'], ['ALT', 'Alta'], ['MED', 'Média'], ['NOR', 'Normal'], ['BAI', 'Baixa'], ['none', 'Sem prioridade']];

// partes do Painel, cada uma numa aba
const ADMIN_PANES = [['online', 'eye', 'Online'], ['contas', 'users', 'Contas'], ['duplas', 'users', 'Duplas'], ['geiko', 'clock', 'Fila do Geiko']];
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
      ${adminTabsHtml('admin')}
      <div class="seg view-tabs sub" role="tablist" aria-label="Painel">${ADMIN_PANES.map(([k, ic, l]) => `<button role="tab" data-pane-btn="${k}" aria-selected="${adminPane === k}" aria-pressed="${adminPane === k}">${icon(ic)} ${l}</button>`).join('')}</div>
      <section class="glass" data-pane="online"${adminPane === 'online' ? '' : ' hidden'}>
        <h2><span class="live-dot"></span>Online agora <span class="hint" id="onCount" style="font-size:var(--fs-sm)"></span></h2>
        <p class="note">Quem está com o site aberto e visível (atualiza a cada 15s). Quem minimiza ou troca de aba sai da lista em ~1 min.</p>
        <div id="onlineList"><p class="hint" style="text-align:left">Carregando...</p></div>
      </section>
      <section class="glass" data-pane="contas"${adminPane === 'contas' ? '' : ' hidden'}>
        <h2>Contas</h2>
        <form class="row" id="newUser" autocomplete="off">
          <label>Nome (aparece no ranking)<input name="name" maxlength="40" required></label>
          <label>Usuário (login)<input name="username" maxlength="32" pattern="[A-Za-z0-9._\\-]{3,32}" required></label>
          <label>ID do Geiko<input name="geikoId" inputmode="numeric" pattern="\\d*" placeholder="vazio = sem fila"></label>
          <label>Papel<select name="role"><option value="player">Jogador</option><option value="admin">Admin</option></select></label>
          <button class="btn">+ Criar conta</button>
        </form>
        <p class="err" id="nuErr" style="color:oklch(80% 0.14 18)"></p>
        <div class="scroll" style="max-height:none"><table class="tickets users" id="usersTable"><tbody><tr><td>Carregando...</td></tr></tbody></table></div>
      </section>
      <section class="glass" data-pane="duplas"${adminPane === 'duplas' ? '' : ' hidden'}>
        <h2>Duplas</h2>
        <p class="note">As duplas são formadas pelos próprios jogadores (convite + aceite). Aqui você só modera: renomear um nome inadequado ou desfazer uma dupla.</p>
        <form class="row" id="duoNew" autocomplete="off">
          <label>Pessoa 1<select name="aId" required></select></label>
          <label>Pessoa 2<select name="bId" required></select></label>
          <label>Nome da dupla<input name="name" maxlength="24" placeholder="ex.: Os Imbatíveis" required></label>
          <label>As partidas contam desde<select name="since"><option value="all">o começo (todas)</option><option value="month">o início do mês</option><option value="now">agora</option></select></label>
          <button class="btn">+ Criar dupla</button>
        </form>
        <p class="err" id="duoNewErr" style="color:oklch(80% 0.14 18)"></p>
        <p class="note">A dupla criada aqui já nasce ativa (sem convite). Em "As partidas contam desde" você escolhe se vale tudo que os dois já jogaram, só o mês, ou só daqui pra frente. Só aparecem pessoas que não estão em dupla nem com convite aberto.</p>
        <div id="duosAdmin"><p class="hint" style="text-align:left">Carregando...</p></div>
      </section>
      <section class="glass" data-pane="geiko"${adminPane === 'geiko' ? '' : ' hidden'}>
        <h2>Regra de bloqueio</h2>
        <p class="note">Cada ticket aberto do atendente vale um peso. Se a soma passar do limite, os jogos ficam bloqueados.
          Peso = prioridade × multiplicador (sem interação ou status de espera). Quem não tem ID do Geiko nunca é bloqueado.</p>
        <form id="rulesForm"><p class="hint" style="text-align:left">Carregando...</p></form>
      </section>
      <section class="glass" data-pane="geiko"${adminPane === 'geiko' ? '' : ' hidden'}>
        <h2>Testar ID do Geiko</h2>
        <p class="note">Confere a fila de um atendente com a regra atual (útil pra validar o vínculo antes de criar a conta).</p>
        <form class="row" id="testForm"><label>ID do Geiko<input name="geikoId" inputmode="numeric" pattern="\\d+" required></label><button class="btn ghost">Testar</button></form>
        <div id="testOut" style="margin-top:var(--space-sm)"></div>
      </section>
    </div>`;
    $('#back').onclick = showMenu;
    main.querySelectorAll('[data-pane-btn]').forEach(b => b.onclick = () => {
      adminPane = b.dataset.paneBtn;
      main.querySelectorAll('[data-pane-btn]').forEach(x => { x.setAttribute('aria-pressed', x === b); x.setAttribute('aria-selected', x === b); });
      main.querySelectorAll('[data-pane]').forEach(sec => { sec.hidden = sec.dataset.pane !== adminPane; });
    });
    $('#newUser').onsubmit = createUser;
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
async function loadAdminDuos() {
  const box = $('#duosAdmin');
  if (!box) return;
  try {
    const [{ duos }, { users }] = await Promise.all([api('api/admin/duos'), api('api/admin/users')]);
    // formulário de criação: só quem está livre (ativo e fora de qualquer dupla)
    const busy = new Set(duos.flatMap(d => [d.aId, d.bId]));
    const free = users.filter(u => u.active && !busy.has(u.id)).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
    const opts = '<option value="">Escolha…</option>' + free.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
    for (const n of ['aId', 'bId']) { const sel = document.querySelector(`#duoNew select[name=${n}]`); if (sel) sel.innerHTML = opts; }
    const form = $('#duoNew');
    if (form) form.onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), err = $('#duoNewErr');
      err.textContent = '';
      try {
        await api('api/admin/duos', { method: 'POST', body: { aId: Number(f.get('aId')), bId: Number(f.get('bId')), name: f.get('name'), since: f.get('since') } });
        e.target.reset();
        loadAdminDuos();
      } catch (e2) { err.textContent = e2.message; }
    };
    box.innerHTML = duos.length ? `<div class="scroll" style="max-height:none"><table class="tickets users"><thead><tr><th>Dupla</th><th>Pessoas</th><th>Situação</th><th>Conta desde</th><th></th></tr></thead><tbody>${duos.map(d => `<tr data-id="${d.id}">
        <td>${esc(d.name)}</td><td>${esc(d.a)} & ${esc(d.b)}</td><td>${d.status === 'active' ? 'ativa' : 'convite aberto'}</td>
        <td>${d.status === 'active' ? (d.since === 0 ? 'o começo' : new Date(d.since).toLocaleDateString('pt-BR')) : '—'}</td>
        <td><div class="actions"><button class="btn ghost" data-duo="rename">Renomear</button><button class="btn ghost" data-duo="since">Início</button><button class="btn ghost" data-duo="end">Desfazer</button></div></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="hint" style="text-align:left">Nenhuma dupla ainda.</p>';
    box.querySelectorAll('[data-duo]').forEach(b => b.onclick = async () => {
      const row = b.closest('tr'), id = row.dataset.id, d = duos.find(x => String(x.id) === id);
      try {
        if (b.dataset.duo === 'since') {
          const pick = prompt('Desde quando as partidas dos dois contam pra essa dupla?\n\n1 = o começo (todas as partidas)\n2 = o início do mês\n3 = agora (só daqui pra frente)', '1');
          if (pick == null) return;
          const mode = { 1: 'all', 2: 'month', 3: 'now' }[String(pick).trim()];
          if (!mode) return alert('Digite 1, 2 ou 3.');
          await api(`api/admin/duos/${id}/since`, { method: 'POST', body: { since: mode } });
        } else if (b.dataset.duo === 'rename') {
          const name = prompt('Novo nome da dupla:', d.name);
          if (name == null) return;
          await api(`api/admin/duos/${id}/rename`, { method: 'POST', body: { name } });
        } else {
          if (!confirm(`Desfazer a dupla ${d.name}? Os dois são avisados.`)) return;
          await api(`api/admin/duos/${id}/end`, { method: 'POST', body: {} });
        }
        loadAdminDuos();
      } catch (err) { alert(err.message); }
    });
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

// ---------- quem está online ----------
const ago = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`; };
const viewLabel = v => GAMES[v] ? `${icon('gamepad-2')} jogando <b>${GAMES[v].name}</b>` : v === 'admin' ? `${icon('settings')} no painel admin` : `${icon('house')} no menu`;
async function loadOnline() {
  const box = $('#onlineList');
  if (!box) return;
  try {
    const { now, online, recent } = await api('api/admin/online');
    $('#onCount').textContent = `· ${online.length} ${online.length === 1 ? 'pessoa' : 'pessoas'}`;
    box.innerHTML = (online.length
      ? `<table class="tickets users"><tbody>${online.map(p => `<tr data-id="${p.id}">
          <td><b>${esc(p.name)}</b>${p.id === me.id ? ' <span class="tag">• você</span>' : ''}${p.block ? ` <span class="tag" style="color:var(--red)">${icon('lock')} ${untilText(p.block.until)}</span>` : ''}</td>
          <td>${viewLabel(p.view)} <span class="hint">há ${ago(now - p.since)}</span></td>
          <td><div class="actions">${p.id === me.id ? '' : p.block ? `<button class="btn ghost" data-act="unblock">${icon('lock-open')} Desbloquear</button>` : `<button class="btn ghost" data-act="block">${icon('lock')} Bloquear</button>`}</div></td>
        </tr>`).join('')}</tbody></table>`
      : '<p class="hint" style="text-align:left">Ninguém online agora.</p>')
      + (recent.length ? `<p class="note" style="margin:var(--space-sm) 0 0">Visto nas últimas 24h: ${recent.map(p =>
          `${esc(p.name)} <span class="hint">(${new Date(p.lastSeen).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${GAMES[p.view] ? ', ' + GAMES[p.view].name : ''})</span>`).join(' · ')}</p>` : '');
    box.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      await userAction(b.dataset.act, online.find(p => p.id === +b.closest('tr').dataset.id));
    });
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
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
        <div class="row" style="margin-bottom:var(--space-sm)">
          <label>Ver<select id="recMode"><option value="game">Por jogo</option><option value="user">Por pessoa</option></select></label>
          <label><span id="recPickName">Jogo</span><select id="recPick"></select></label>
          <span class="hint" id="recMsg"></span>
        </div>
        <div id="recTable"><p class="hint" style="text-align:left">Carregando...</p></div>
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
    $('#recMode').value = recState.mode;
    $('#recMode').onchange = e => { recState.mode = e.target.value; renderRecords(); };
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
  const pick = $('#recPick');
  const unitOf = id => `<span class="hint">${GAMES[id].unit}</span>`;
  const valueInput = (v, enabled = true) => `<input type="number" step="any" min="0" class="rec-v" value="${v ?? ''}" ${enabled ? '' : 'disabled'} style="width:8em">`;
  if (recState.mode === 'game') {
    $('#recPickName').textContent = 'Jogo';
    pick.innerHTML = menuOrder().map(([id, g]) => `<option value="${id}" ${id === recState.game ? 'selected' : ''}>${g.name}</option>`).join('');
    const g = GAMES[recState.game];
    const rows = recData.records.filter(r => r.game === recState.game).sort((a, b) => (better(g, a.best, b.best) ? -1 : 1));
    const have = new Set(rows.map(r => r.userId));
    const free = recData.users.filter(u => !have.has(u.id));
    box.innerHTML = `<table class="tickets users"><thead><tr><th>#</th><th>Pessoa</th><th>Recorde</th><th>Partidas</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr data-game="${recState.game}" data-user="${r.userId ?? ''}" data-name="${esc(r.name)}">
        <td>${rankBadge(i + 1)}</td><td>${esc(r.name)}${r.userId == null ? ' <span class="tag">• sem conta</span>' : ''}</td>
        <td>${valueInput(r.best, r.userId != null)} ${unitOf(recState.game)}</td><td>${r.count}</td>
        <td><div class="actions">${r.userId != null ? '<button class="btn ghost" data-act="save">Salvar</button>' : ''}<button class="btn ghost" data-act="del">Apagar</button></div></td></tr>`).join('')
        || '<tr><td colspan="5" class="hint">Ninguém tem recorde nesse jogo ainda.</td></tr>'}
      </tbody></table>
      ${free.length ? `<div class="row" style="margin-top:var(--space-sm)" data-game="${recState.game}">
        <label>Adicionar recorde pra<select class="rec-u">${free.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>
        <label>Valor (${g.unit})${valueInput('')}</label><button class="btn" data-act="add">+ Adicionar</button></div>` : ''}`;
  } else {
    $('#recPickName').textContent = 'Pessoa';
    pick.innerHTML = recData.users.map(u => `<option value="${u.id}" ${u.id === recState.userId ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
    const mine = new Map(recData.records.filter(r => r.userId === recState.userId).map(r => [r.game, r]));
    box.innerHTML = `<table class="tickets users"><thead><tr><th>Jogo</th><th>Recorde</th><th>Partidas</th><th></th></tr></thead><tbody>
      ${menuOrder().map(([id, g]) => {
        const r = mine.get(id);
        return `<tr data-game="${id}" data-user="${recState.userId}">
          <td>${g.name}</td><td>${valueInput(r?.best)} ${unitOf(id)}</td><td>${r ? r.count : '<span class="hint">—</span>'}</td>
          <td><div class="actions"><button class="btn ghost" data-act="save">${r ? 'Salvar' : '+ Adicionar'}</button>${r ? '<button class="btn ghost" data-act="del">Apagar</button>' : ''}</div></td></tr>`;
      }).join('')}</tbody></table>`;
  }
  box.querySelectorAll('[data-act]').forEach(b => b.onclick = () => recordAction(b));
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
    main.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
      reportState.days = +b.dataset.days;
      main.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
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

function tempPasswordDialog(name, pass) {
  const { el, close } = modal(`
    <h2>Senha temporária</h2>
    <p>Passe pra <b>${esc(name)}</b>. No primeiro login a pessoa cria a própria senha. <b>Ela não aparece de novo.</b></p>
    <div class="secret">${esc(pass)}</div>
    <button class="btn ghost" id="copyPass">Copiar</button>
    <button class="btn" id="okPass">Pronto</button>`, { locked: true });
  el.querySelector('#copyPass').onclick = async e => { await navigator.clipboard?.writeText(pass).catch(() => {}); e.target.textContent = 'Copiado ✓'; };
  el.querySelector('#okPass').onclick = close;
}

async function createUser(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#nuErr').textContent = '';
  try {
    const { user, tempPassword } = await api('api/admin/users', { method: 'POST', body: Object.fromEntries(f) });
    e.target.reset();
    loadUsers();
    tempPasswordDialog(user.name, tempPassword);
  } catch (err) { $('#nuErr').textContent = err.message; }
}

async function loadUsers() {
  const table = $('#usersTable');
  if (!table) return;
  try {
    const { users } = await api('api/admin/users');
    table.innerHTML = `<thead><tr><th>Nome</th><th>Usuário</th><th>ID Geiko</th><th>Papel</th><th></th></tr></thead><tbody>` +
      users.map(u => `<tr class="${u.active ? '' : 'off'}" data-id="${u.id}">
        <td>${esc(u.name)}${u.mustChange ? ' <span class="tag" title="Ainda não trocou a senha temporária">• senha temporária</span>' : ''}${u.active ? '' : ' <span class="tag">• desativada</span>'}${u.block ? ` <span class="tag" style="color:var(--red)" title="${esc(u.block.reason || '')}">${icon('lock')} bloqueado ${untilText(u.block.until)}</span>` : ''}</td>
        <td>${esc(u.username)}</td>
        <td>${u.geikoId ? esc(u.geikoId) : '<span class="hint">—</span>'}</td>
        <td><span class="pill-role ${u.role}">${u.role === 'admin' ? 'Admin' : 'Jogador'}</span></td>
        <td><div class="actions">${u.canEditRecords && u.id !== me.id ? '<span class="hint">conta do dono</span>' : `
          ${u.id === me.id ? '' : u.block ? `<button class="btn ghost" data-act="unblock">${icon('lock-open')} Desbloquear</button>` : `<button class="btn ghost" data-act="block">${icon('lock')} Bloquear</button>`}
          ${u.geikoId ? '<button class="btn ghost" data-act="test">Fila</button>' : ''}
          <button class="btn ghost" data-act="edit">Editar</button>
          <button class="btn ghost" data-act="reset">Nova senha</button>
          ${u.id === me.id ? '' : `<button class="btn ghost" data-act="toggle">${u.active ? 'Desativar' : 'Reativar'}</button>`}`}
        </div></td></tr>`).join('') + '</tbody>';
    table.querySelectorAll('[data-act]').forEach(b => b.onclick = () => userAction(b.dataset.act, users.find(u => u.id === +b.closest('tr').dataset.id)));
    loadOnline(); // bloquear/desbloquear também muda a lista de online
  } catch (err) { table.innerHTML = `<tbody><tr><td class="err">${esc(err.message)}</td></tr></tbody>`; }
}

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
  if (act === 'edit') {
    const { el, close } = modal(`
      <h2>Editar conta</h2>
      <form id="ef" class="admin">
        <label>Nome (aparece no ranking)<input name="name" maxlength="40" value="${esc(u.name)}" required></label>
        <label>Usuário (login)<input name="username" maxlength="32" value="${esc(u.username)}" required></label>
        <label>ID do Geiko (vazio = sem fila, nunca bloqueia)<input name="geikoId" inputmode="numeric" value="${esc(u.geikoId || '')}"></label>
        <label>Papel<select name="role" ${u.id === me.id ? 'disabled' : ''}><option value="player">Jogador</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></label>
        <p class="err" id="eerr"></p>
        <button class="btn">Salvar</button>
        <button type="button" class="btn ghost" id="ecancel">Cancelar</button>
      </form>`, { wide: true });
    el.querySelector('#ecancel').onclick = close;
    el.querySelector('#ef').onsubmit = async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      if (u.id === me.id) delete body.role;
      try {
        const { user } = await api(`api/admin/users/${u.id}`, { method: 'PATCH', body });
        if (user.id === me.id) setMe({ ...me, ...user });
        close(); loadUsers();
      } catch (err) { el.querySelector('#eerr').textContent = err.message; }
    };
  }
}

async function loadRules() {
  const form = $('#rulesForm');
  if (!form) return;
  try {
    const { rules, situations } = await api('api/admin/rules');
    const sitEntries = Object.entries(situations).sort((a, b) => a[1].localeCompare(b[1]));
    form.innerHTML = `
      <div class="row" style="margin-bottom:var(--space-sm)">
        <label class="checks"><label><input type="checkbox" name="enabled" ${rules.enabled ? 'checked' : ''}> Bloqueio ligado</label>
          <label title="Desligado: todo mundo vê só quem mais resolveu; os números de cada um ficam no Relatório"><input type="checkbox" name="weeklyPublic" ${rules.weeklyPublic ? 'checked' : ''}> Mostrar ranking de tickets da semana pra todos</label></label>
        <label>Bloqueia quando a soma passar de<input type="number" name="limit" step="0.25" min="0" value="${rules.limit}"></label>
      </div>
      <p class="note" style="margin-bottom:6px">Horário livre (Brasília) — nesse horário o site libera pra todo mundo, mesmo com ticket aberto. O bloqueio manual continua valendo.</p>
      <div class="row" style="margin-bottom:var(--space-sm)">
        <label class="checks"><label><input type="checkbox" name="fh_enabled" ${rules.freeHours.enabled ? 'checked' : ''}> Horário livre ligado</label>
          <label><input type="checkbox" name="fh_weekends" ${rules.freeHours.weekends ? 'checked' : ''}> Sábado e domingo o dia todo</label></label>
        <label>Livre a partir das (h)<input type="number" name="fh_from" step="1" min="0" max="23" value="${rules.freeHours.from}"></label>
        <label>Até as (h)<input type="number" name="fh_to" step="1" min="0" max="23" value="${rules.freeHours.to}"></label>
      </div>
      <p class="note" style="margin-bottom:6px">Peso por prioridade</p>
      <div class="row" style="margin-bottom:var(--space-sm)">
        ${PRIO_FIELDS.map(([k, label]) => `<label>${label}<input type="number" name="p_${k}" step="0.25" min="0" value="${rules.priority[k]}"></label>`).join('')}
      </div>
      <div class="row" style="margin-bottom:var(--space-sm)">
        <label>× sem interação do atendente<input type="number" name="noInteractionMult" step="0.05" min="0" value="${rules.noInteractionMult}"></label>
        <label>× status de espera (abaixo)<input type="number" name="waitingClientMult" step="0.05" min="0" value="${rules.waitingClientMult}"></label>
      </div>
      <p class="note" style="margin-bottom:6px">Status de espera — ticket com interação nesses status pesa menos (o atendente depende de outra pessoa):</p>
      <div class="checks" style="margin-bottom:var(--space-sm)">
        ${sitEntries.length ? sitEntries.map(([id, name]) => `<label><input type="checkbox" name="sit" value="${id}" ${rules.waitingClientSituationIds.includes(+id) ? 'checked' : ''}> ${esc(name)}</label>`).join('')
          : '<span class="hint">Não consegui buscar os status no Geiko agora.</span>'}
      </div>
      <div class="row"><button class="btn">Salvar regra</button><span id="rulesMsg" class="hint"></span></div>`;
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
      try { await api('api/admin/rules', { method: 'PUT', body }); $('#rulesMsg').textContent = 'Regra salva — vale a partir da próxima consulta de cada um.'; refreshGate(true); }
      catch (err) { $('#rulesMsg').textContent = err.message; }
    };
  } catch (err) { form.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

// abas da administração: Painel, Relatório e Recordes (este só pra conta dona)
function adminTabsHtml(cur) {
  const tabs = [['admin', 'settings', 'Painel'], ['report', 'chart-column', 'Relatório'], ['records', 'wrench', 'Recordes']].filter(([k]) => k !== 'records' || me?.canEditRecords);
  return `<div class="seg view-tabs" role="tablist" aria-label="Administração">${tabs.map(([k, ic, l]) =>
    `<button role="tab" data-atab="${k}" aria-selected="${cur === k}" aria-pressed="${cur === k}">${icon(ic)} ${l}</button>`).join('')}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-atab]');
  if (b && b.getAttribute('aria-pressed') !== 'true') ({ admin: showAdmin, report: showReport, records: showRecords })[b.dataset.atab]?.();
});

// menu da conta (topo)
function toggleAcct(open = $('#acctMenu').hidden) {
  $('#acctMenu').hidden = !open;
  $('#acctBtn').setAttribute('aria-expanded', open);
}
document.addEventListener('click', e => { if (!e.target.closest('.acct')) toggleAcct(false); });

function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

