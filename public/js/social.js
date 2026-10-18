// ---------- social e competição ----------
// Reações nos recordes, duelos de 24h, torneio semanal, ranking por equipe e o resumo da semana.
// O servidor (lib/social.js) decide tudo que vale; aqui só se desenha. `social` = resposta de /api/social (só logado).
let social = null;
async function loadSocial() {
  if (localMode || !me || me.mustChange) { social = null; return null; }
  try { social = await api('api/social'); } catch { /* sem rede: mantém o último */ }
  const n = social?.duels?.open?.length || 0;
  const b = $('#duelsCnt');
  if (b) { b.textContent = n; b.hidden = !n; }
  setDuoBadge();
  return social;
}
const dayLabelBR = ms => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
/** "3 dias", "5 h", "20 min" */
function leftText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 2880 ? `${Math.floor(m / 1440)} dias` : m >= 120 ? `${Math.round(m / 60)} h` : `${Math.max(1, m)} min`;
}

/* ---------- reações nos recordes (lista do ranking de cada jogo) ---------- */
function rxChips(id, name) {
  const slot = social?.reactions?.[id]?.[name];
  if (!slot) return '';
  return `<div class="rx-row">${Object.entries(slot.counts).map(([e, n]) => `<span class="rxc${slot.mine === e ? ' mine' : ''}">${e}<i>${n}</i></span>`).join('')}</div>`;
}
/** Botão "reagir" da linha do ranking (vazio na linha da própria pessoa ou sem login). */
function rxButton(id, name) {
  if (!me || !social || name === player) return '<span class="rx-gap"></span>';
  return `<button class="rx-add" data-rx="${id}" data-name="${esc(name)}" aria-label="Reagir ao recorde de ${esc(name)}" title="Reagir">${icon('smile')}</button>`;
}
function bindReactions(root, id) {
  root.querySelectorAll('.rx-add').forEach(btn => btn.onclick = () => {
    const li = btn.closest('li'), open = li.querySelector('.rx-pick');
    root.querySelectorAll('.rx-pick').forEach(p => p.remove());
    if (open) return;
    const name = btn.dataset.name, mine = social?.reactions?.[id]?.[name]?.mine;
    li.insertAdjacentHTML('beforeend', `<div class="rx-pick" role="group" aria-label="Reagir ao recorde de ${esc(name)}">${(social?.emojis || []).map(e => `<button class="${mine === e ? 'on' : ''}" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`);
    li.querySelectorAll('.rx-pick button').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try {
        await api('api/reactions', { method: 'POST', body: { game: id, target: name, emoji: mine === b.dataset.e ? null : b.dataset.e } });
        if (mine !== b.dataset.e) sfx.good();
        await loadSocial();
        if (currentView === id) renderBoard(id);
      } catch (err) { b.disabled = false; announce(err.message); }
    });
  });
}

/* ---------- torneio semanal (abre numa janela; o menu só mostra o atalho) ---------- */
function tourneyBodyHtml() {
  const t = social?.tourney;
  if (!t || !t.on) return '<p>O torneio semanal ainda não começou.</p>';
  const range = { since: t.start, until: t.end };
  const games = t.games.filter(id => GAMES[id]).map(id => {
    const g = GAMES[id], list = bestPerPlayer(id, range), top = list[0], mineIdx = list.findIndex(([n]) => n === player);
    return `<button class="tgame" data-id="${id}" style="--h:${g.hue}">
      <span class="ic">${icon(g.icon)}</span><b>${g.name}</b>
      <small>${top ? `${icon('crown')} ${esc(top[0])} · ${fmt(g, top[1])}` : 'ninguém jogou ainda'}</small>
      <small class="you">${mineIdx >= 0 ? `você: ${mineIdx + 1}º · ${fmt(g, list[mineIdx][1])}` : 'você ainda não jogou'}</small></button>`;
  }).join('');
  const stand = t.standings.slice(0, 5), lastTop = t.last?.top?.[0];
  return `<div class="t-head"><h2>${icon('trophy')} Torneio da semana</h2>
      <span class="tag">${dayLabelBR(t.start)} – ${dayLabelBR(t.end - 1)} · acaba em ${leftText(t.end - Date.now())}</span></div>
    <div class="t-body">
      <div class="tgames">${games}</div>
      <div class="tstand">
        <h3>Classificação</h3>
        ${stand.length ? `<ol>${stand.map((r, k) => `<li class="${r.name === player ? 'me' : ''}">${rankBadge(k + 1)} ${nameHtml(r.name)} <b>${r.points} pts</b></li>`).join('')}</ol>`
          : '<p class="hint" style="text-align:left;margin:0">Ninguém pontuou ainda — jogue um dos 3 jogos e saia na frente.</p>'}
        ${t.mineRank && t.mineRank > 5 ? `<p class="hint">Você está em ${t.mineRank}º com ${t.mine.points} pts.</p>` : ''}
      </div>
    </div>
    <p class="hint t-rules">Vale a sua melhor partida da semana em cada jogo. Por jogo: 1º ${t.points[0]} pts, 2º ${t.points[1]}, 3º ${t.points[2]}, 4º ${t.points[3]}, 5º ${t.points[4]}, 6º ${t.points[5]}, depois 1 ponto. Quem somar mais leva o troféu.
      ${lastTop ? `<br>${icon('crown')} Semana passada: <b>${esc(lastTop.name)}</b> (${lastTop.points} pts).` : ''}</p>`;
}
async function tourneyModal() {
  if (!me) return loginModal();
  await loadSocial();
  const { el, close } = modal(`<div class="tourney-body">${tourneyBodyHtml()}</div><button class="btn ghost" id="tClose">Fechar</button>`, { wide: true });
  el.querySelector('#tClose').onclick = close;
  el.querySelectorAll('.tgame').forEach(b => b.onclick = () => { close(); play(b.dataset.id); });
}

/* ---------- atalhos do menu: torneio, duplas, duelos e resumo (uma faixa compacta) ---------- */
function renderStrip() {
  const box = $('#strip');
  if (!box) return;
  if (!me) { box.hidden = true; return; }
  box.hidden = false;
  const t = social?.tourney, my = social?.myDuo, open = social?.duels?.open?.length || 0;
  const pill = (id, ic, label, sub, hot = false) => `<button class="act${hot ? ' hot' : ''}" data-act="${id}"><span class="ic">${icon(ic)}</span><span class="tx"><b>${label}</b><small>${sub}</small></span></button>`;
  const pills = [];
  if (!social || t?.on) pills.push(pill('tourney', 'trophy', 'Torneio', !social ? '…' : t.mineRank ? `você: ${t.mineRank}º · ${t.mine.points} pts` : 'sem pontos ainda'));
  pills.push(pill('duos', 'users', 'Duplas', !social ? '…' : (my.state === 'active' ? esc(my.name) : { none: 'formar dupla', out: 'convite enviado', in: 'convite pra você!' }[my.state]), my?.state === 'in'));
  pills.push(pill('duels', 'swords', 'Duelos', !social ? '…' : open ? `${open} em andamento` : 'desafiar alguém', open > 0));
  pills.push(pill('recap', 'calendar', 'Minha semana', !social ? '…' : `${recapStats().plays} partida${recapStats().plays === 1 ? '' : 's'}`));
  box.innerHTML = pills.join('');
  const go = { tourney: tourneyModal, duos: duosModal, duels: () => duelsModal(), recap: async () => { await loadSocial(); recapModal(); } };
  box.querySelectorAll('[data-act]').forEach(b => b.onclick = go[b.dataset.act]);
}

/* ---------- duplas ---------- */
/** A dupla ativa de uma pessoa (pelo nome), ou null. */
const duoOfName = name => (social?.duos || []).find(d => d.aName === name || d.bName === name) || null;
/** Melhor partida de uma pessoa num jogo dentro de uma janela de tempo (null = não jogou). */
function bestIn(id, name, since, until = Infinity) {
  let best = null;
  for (const s of scores[id] || []) if (s.name === name && s.date >= since && s.date < until && (best === null || better(GAMES[id], s.score, best))) best = s.score;
  return best;
}
// Por jogo: a dupla só entra se OS DOIS jogaram (depois de formada); a nota é a média das melhores partidas dos dois.
// As 3 melhores duplas do jogo ganham 3, 2 e 1 pontos. Conta o período escolhido (mês ou geral).
function duoStandings(range = currentRange()) {
  const duos = (social?.duos || []).map(d => ({ ...d, pts: 0, podiums: 0, firsts: 0 }));
  if (!duos.length) return [];
  for (const id in GAMES) {
    const g = GAMES[id], entries = [];
    for (const d of duos) {
      const since = Math.max(range.since || 0, d.since ?? d.formedAt ?? 0);
      const x = bestIn(id, d.aName, since, range.until), y = bestIn(id, d.bName, since, range.until);
      if (x != null && y != null) entries.push({ d, v: (x + y) / 2 });
    }
    entries.sort((p, q) => (p.v === q.v ? 0 : better(g, p.v, q.v) ? -1 : 1));
    entries.slice(0, 3).forEach((e, i) => { e.d.pts += 3 - i; e.d.podiums++; if (!i) e.d.firsts++; });
  }
  return duos.sort((p, q) => q.pts - p.pts || q.firsts - p.firsts || p.name.localeCompare(q.name, 'pt-BR'));
}
function duosBodyHtml() {
  const rows = duoStandings().slice(0, 10), my = social.myDuo;
  const cta = { none: 'Formar dupla', out: 'Convite enviado', in: 'Convite pra você!', active: 'Minha dupla' }[my.state];
  return `<div class="kings-head"><h2>${icon('users')} Duplas <small class="hint">${seasonMode === 'all' ? 'geral' : seasonLabel().toLowerCase()}</small></h2>
      <button class="btn ${my.state === 'in' ? '' : 'ghost'}" id="duoOpen">${cta}</button></div>
    ${rows.length ? `<ol>${rows.map((r, k) => `<li class="${my.state === 'active' && r.id === my.id ? 'me' : ''}">${rankBadge(k + 1)} <b class="tn">${esc(r.name)}</b> <span class="tp">${r.pts} pts</span>
      <small>${esc(r.aName)} & ${esc(r.bName)} · ${r.firsts} jogo${r.firsts === 1 ? '' : 's'} em 1º · ${r.podiums} pódio${r.podiums === 1 ? '' : 's'}</small></li>`).join('')}</ol>`
      : '<p class="hint" style="text-align:left;margin:0">Ninguém formou dupla ainda. Chame um colega e escolham um nome!</p>'}
    <p class="hint t-rules">Cada um chama quem quiser e dá o nome que quiser à dupla. Em cada jogo, a dupla só pontua se <b>os dois</b> jogaram (depois de formada, ou desde quando o admin definiu); vale a média das melhores partidas dos dois. As 3 melhores duplas do jogo ganham 3, 2 e 1 pontos. Segue o filtro Mês/Geral do menu.</p>`;
}
async function duosModal() {
  if (!me) return loginModal();
  await loadSocial();
  if (!social) return duoModal();
  const { el, close } = modal(`<div class="teams">${duosBodyHtml()}</div><button class="btn ghost" id="dsClose">Fechar</button>`, { wide: true });
  el.querySelector('#dsClose').onclick = close;
  el.querySelector('#duoOpen').onclick = () => { close(); duoModal(); };
}
function setDuoBadge() {
  const b = $('#duoCnt');
  if (b) { const n = social?.myDuo?.state === 'in' ? 1 : 0; b.textContent = n; b.hidden = !n; }
}
async function duoModal(pre = {}) {
  if (!me) return loginModal();
  await loadSocial();
  if (!social) return modal(`<h2>${icon('users')} Dupla</h2><p>Não deu pra carregar agora. Tente de novo em instantes.</p><button class="btn" onclick="this.closest('.modal').remove()">Ok</button>`);
  const my = social.myDuo, partner = my.state === 'none' ? null : (my.aId === me.id ? my.bName : my.aName);
  let body;
  if (my.state === 'active') {
    body = `<p>Você e <b>${esc(partner)}</b> formam a dupla <b>${esc(my.name)}</b> desde ${dayLabelBR(my.formedAt)}.</p>
      <form id="duoRename" class="admin"><label>Nome da dupla<input name="name" maxlength="24" value="${esc(my.name)}" required></label><p class="err" id="duoErr"></p>
      <button class="btn">Salvar nome</button></form>
      <button class="btn ghost" id="duoLeave">Sair da dupla</button>`;
  } else if (my.state === 'out') {
    body = `<p>Convite enviado pra <b>${esc(partner)}</b>, com o nome <b>${esc(my.name)}</b>. Aguardando a resposta — o convite vale por mais ${leftText(my.expiresAt - Date.now())}.</p><p class="err" id="duoErr"></p>
      <button class="btn ghost" id="duoCancel">Cancelar convite</button>`;
  } else if (my.state === 'in') {
    body = `<p><b>${esc(partner)}</b> te chamou pra formar a dupla <b>${esc(my.name)}</b>. Vale por mais ${leftText(my.expiresAt - Date.now())}.</p><p class="err" id="duoErr"></p>
      <div class="recap-btns"><button class="btn" id="duoYes">${icon('circle-check')} Aceitar</button><button class="btn ghost" id="duoNo">Recusar</button></div>`;
  } else {
    const free = social.people.filter(p => p.id !== me.id && p.free).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
    body = free.length ? `<p class="hint" style="text-align:left">Chame um colega pra formar dupla e escolham o nome. Ele precisa aceitar (o convite vale 48h).</p>
      <form id="duoForm" class="admin"><label>Quem você quer chamar<select name="partner" required><option value="">Escolha…</option>${free.map(p => `<option value="${p.id}"${pre.partner === p.name ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>Nome da dupla<input name="name" maxlength="24" placeholder="ex.: Os Imbatíveis" required></label><p class="err" id="duoErr"></p>
      <button class="btn">${icon('users')} Chamar pra dupla</button></form>`
      : '<p>Todo mundo já está em dupla ou com convite aberto. Quando alguém ficar livre, aparece aqui.</p>';
  }
  const { el, close } = modal(`<h2>${icon('users')} Minha dupla</h2>${body}
    <details class="duo-how"><summary>Como a pontuação funciona</summary><p>Em cada jogo, a dupla só entra no ranking se <b>os dois</b> jogaram depois de formada. A nota é a <b>média</b> das melhores partidas dos dois. As 3 melhores duplas do jogo ganham 3, 2 e 1 pontos, e a soma nos jogos define a classificação (mês ou geral). Partidas de antes da dupla não contam, a não ser que o admin tenha criado a dupla valendo desde antes.</p></details>
    <button class="btn ghost" id="duoClose">Fechar</button>`);
  el.querySelector('#duoClose').onclick = close;
  const call = async (path, bodyObj, after) => {
    const err = el.querySelector('#duoErr');
    if (err) err.textContent = '';
    try { await api(path, { method: 'POST', body: bodyObj || {} }); await loadSocial(); setDuoBadge(); if (currentView === 'menu') refreshMenu(); after ? after() : (close(), duoModal()); }
    catch (e) { if (err) err.textContent = e.message; else announce(e.message); }
  };
  el.querySelector('#duoForm')?.addEventListener('submit', e => { e.preventDefault(); const f = new FormData(e.target); call('api/duos', { partnerId: Number(f.get('partner')), name: f.get('name') }); });
  el.querySelector('#duoRename')?.addEventListener('submit', e => { e.preventDefault(); call(`api/duos/${my.id}/rename`, { name: new FormData(e.target).get('name') }); });
  el.querySelector('#duoLeave')?.addEventListener('click', () => { if (confirm(`Sair da dupla ${my.name}? Ela é desfeita pros dois e os pontos dela se perdem.`)) call(`api/duos/${my.id}/leave`); });
  el.querySelector('#duoCancel')?.addEventListener('click', () => call(`api/duos/${my.id}/cancel`));
  el.querySelector('#duoYes')?.addEventListener('click', () => { sfx.good(); call(`api/duos/${my.id}/accept`); });
  el.querySelector('#duoNo')?.addEventListener('click', () => call(`api/duos/${my.id}/decline`));
}

/* ---------- duelos ---------- */
const duelGames = () => Object.keys(GAMES).filter(id => id !== 'termo');
function duelRowHtml(d) {
  const g = GAMES[d.game];
  if (!g) return '';
  const left = d.endsAt - Date.now();
  return `<div class="duel" data-id="${d.id}">
    <span class="ic">${icon('swords')}</span>
    <div><b>Você × ${esc(d.vs)}</b> · ${icon(g.icon)} ${g.name}
      <small>você ${d.mine != null ? fmt(g, d.mine) : 'ainda não jogou'} · ${esc(d.vs)} ${d.theirs != null ? fmt(g, d.theirs) : 'ainda não jogou'} · acaba em ${leftText(left)}${d.byMe ? '' : ' · te desafiou'}</small></div>
    <div class="acts"><button class="btn" data-play="${d.game}">${icon('play')} Jogar</button><button class="btn ghost" data-cancel="${d.id}" aria-label="Cancelar duelo">${icon('x')}</button></div></div>`;
}
const RESULT_TXT = { win: 'Ganhou', lose: 'Perdeu', draw: 'Empate' };
function duelDoneHtml(d) {
  const g = GAMES[d.game];
  if (!g) return '';
  return `<div class="duel done ${d.result}"><span class="ic">${icon(d.result === 'win' ? 'trophy' : 'swords')}</span>
    <div><b>${RESULT_TXT[d.result]}</b> contra ${esc(d.vs)} · ${g.name}<small>${d.mine != null ? fmt(g, d.mine) : '—'} × ${d.theirs != null ? fmt(g, d.theirs) : '—'}</small></div></div>`;
}
async function duelsModal(pre = {}) {
  if (!me) return loginModal();
  await loadSocial();
  if (!social) return modal(`<h2>${icon('swords')} Duelos</h2><p>Não deu pra carregar agora. Tente de novo em instantes.</p><button class="btn" onclick="this.closest('.modal').remove()">Ok</button>`);
  const others = social.people.filter(p => p.id !== me.id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const defGame = pre.game && GAMES[pre.game] ? pre.game : GAMES[currentView] ? currentView : dailyGame();
  const wins = social.duelWins?.[player] || 0;
  const { el, close } = modal(`<h2>${icon('swords')} Duelos</h2>
    <p class="hint" style="text-align:left">Desafie alguém num jogo. Por 24 horas, vale a <b>melhor partida de cada um</b> naquele jogo (só conta jogar depois do desafio). Quem fizer mais leva. ${wins ? `Você já ganhou <b>${wins}</b>.` : ''}</p>
    <div id="dOpen">${social.duels.open.length ? social.duels.open.map(duelRowHtml).join('') : '<p class="hint" style="text-align:left">Nenhum duelo em andamento.</p>'}</div>
    <form id="dForm" class="admin duel-form">
      <label>Contra quem<select name="opp" required><option value="">Escolha…</option>${others.map(p => `<option value="${p.id}"${pre.opponent === p.name ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>Jogo<select name="game">${duelGames().map(id => `<option value="${id}"${id === defGame ? ' selected' : ''}>${esc(GAMES[id].name)}</option>`).join('')}</select></label>
      <p class="err" id="dErr"></p>
      <button class="btn">${icon('swords')} Desafiar</button>
    </form>
    ${social.duels.recent.length ? `<h3 class="d-sub">Últimos resultados</h3><div id="dDone">${social.duels.recent.map(duelDoneHtml).join('')}</div>` : ''}
    <button class="btn ghost" id="dClose">Fechar</button>`, { wide: true });
  el.querySelector('#dClose').onclick = close;
  el.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { close(); play(b.dataset.play); });
  el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
    if (!confirm('Cancelar esse duelo? A outra pessoa é avisada.')) return;
    try { await api(`api/duels/${b.dataset.cancel}/cancel`, { method: 'POST', body: {} }); close(); duelsModal(pre); } catch (err) { el.querySelector('#dErr').textContent = err.message; }
  });
  el.querySelector('#dForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target), btn = e.target.querySelector('button');
    btn.disabled = true; el.querySelector('#dErr').textContent = '';
    try {
      await api('api/duels', { method: 'POST', body: { opponentId: Number(f.get('opp')), game: f.get('game') } });
      sfx.good(); close(); duelsModal(pre);
    } catch (err) { el.querySelector('#dErr').textContent = err.message; btn.disabled = false; }
  };
}

/* ---------- resumo da semana (com imagem pra compartilhar) ---------- */
function recapRange() {
  const t = social?.tourney;
  if (t) return { since: t.start, end: t.end };
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // segunda 00h (horário local)
  return { since: d.getTime(), end: d.getTime() + 7 * DAY_MS };
}
function recapStats() {
  const { since, end } = recapRange(), now = Date.now();
  const mine = [], before = {};
  for (const id in GAMES) for (const s of scores[id] || []) {
    if (s.name !== player) continue;
    if (s.date >= since && s.date < end) mine.push({ id, ...s });
    else if (s.date < since && (!(id in before) || better(GAMES[id], s.score, before[id]))) before[id] = s.score;
  }
  const bestWeek = {}, count = {};
  for (const p of mine) { count[p.id] = (count[p.id] || 0) + 1; if (!(p.id in bestWeek) || better(GAMES[p.id], p.score, bestWeek[p.id])) bestWeek[p.id] = p.score; }
  const personal = Object.keys(bestWeek).filter(id => !(id in before) || better(GAMES[id], bestWeek[id], before[id])).length;
  const leading = Object.keys(GAMES).filter(id => bestPerPlayer(id, {})[0]?.[0] === player).length;
  let dailyWins = 0;
  for (let i = dayIndex(since); i < Math.min(dayIndex(), dayIndex(end)); i++) if (dailyWinnerOf(i)?.name === player) dailyWins++;
  const duelWins = (social?.duels?.recent || []).filter(d => d.result === 'win' && d.endsAt >= since && d.endsAt < end).length;
  const fav = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  const days = new Set(mine.map(p => dayIndex(p.date))).size;
  const t = social?.tourney;
  return { since, end: Math.min(end, now), endFull: end, plays: mine.length, games: Object.keys(count).length, days, personal, leading, dailyWins, duelWins,
    tourney: t?.on && t.mine ? { rank: t.mineRank, points: t.mine.points } : null, fav: fav ? { id: fav[0], n: fav[1] } : null };
}
function drawRecap(st) {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), FONT = 'Space Grotesk, system-ui, -apple-system, Segoe UI, sans-serif';
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#161625'); bg.addColorStop(0.55, '#2a1d4a'); bg.addColorStop(1, '#3a2236');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  glow(180, 160, 520, 'rgba(160,124,255,.28)'); glow(940, 1180, 560, 'rgba(255,138,92,.2)');
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  // marca
  g.textBaseline = 'alphabetic'; g.font = `700 54px ${FONT}`; g.fillStyle = '#ffffff'; g.fillText('Micro', 72, 118);
  const mw = g.measureText('Micro').width, grad = g.createLinearGradient(72 + mw, 0, 72 + mw + 170, 0); grad.addColorStop(0, '#a07cff'); grad.addColorStop(1, '#ff8a5c');
  g.fillStyle = grad; g.fillText('Game', 72 + mw, 118);
  g.font = `500 34px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.6)'; g.textAlign = 'right';
  g.fillText(`${dayLabelBR(st.since)} – ${dayLabelBR(st.endFull - 1)}`, W - 72, 116); g.textAlign = 'left';
  // título e nome
  g.font = `700 112px ${FONT}`; g.fillStyle = '#ffffff'; g.fillText('Minha semana', 72, 290);
  g.font = `700 64px ${FONT}`; g.fillStyle = '#ffd34d'; g.fillText(player, 72, 372);
  const duo = social?.myDuo?.state === 'active' ? social.myDuo : null;
  if (duo) { g.font = `500 38px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.65)'; g.fillText(`Dupla ${duo.name}`, 72, 426); }
  // 6 números
  const tiles = [
    [st.plays, st.plays === 1 ? 'partida jogada' : 'partidas jogadas'],
    [st.games, st.games === 1 ? 'jogo diferente' : 'jogos diferentes'],
    [st.personal, st.personal === 1 ? 'recorde pessoal' : 'recordes pessoais'],
    [st.leading, st.leading === 1 ? 'recorde geral' : 'recordes gerais'],
    [st.tourney ? `${st.tourney.rank}º` : '—', st.tourney ? `no torneio · ${st.tourney.points} pts` : 'no torneio'],
    [st.dailyWins + st.duelWins, `${st.dailyWins} desafio${st.dailyWins === 1 ? '' : 's'} do dia · ${st.duelWins} duelo${st.duelWins === 1 ? '' : 's'}`],
  ];
  const tw = 456, th = 212, gx = 72, gy = 480, gap = 30;
  tiles.forEach(([big, label], i) => {
    const x = gx + (i % 2) * (tw + gap), y = gy + Math.floor(i / 2) * (th + gap);
    rr(x, y, tw, th, 36); g.fillStyle = 'rgba(255,255,255,.07)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.14)'; g.stroke();
    g.font = `700 100px ${FONT}`; g.fillStyle = i === 4 ? '#ffd34d' : '#ffffff'; g.fillText(String(big), x + 36, y + 118);
    g.font = `500 28px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.68)';
    const words = label.split(' · '); words.forEach((w, k) => g.fillText(w, x + 36, y + 160 + k * 34));
  });
  // destaque + rodapé
  const fy = gy + 3 * (th + gap) + 52;
  g.font = `500 38px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillText(st.fav ? `Mais jogado: ${GAMES[st.fav.id].name} (${st.fav.n}×)` : 'Bora jogar essa semana!', 72, fy);
  g.font = `500 32px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.5)';
  g.fillText(`${st.days} dia${st.days === 1 ? '' : 's'} jogando · ${location.host}`, 72, fy + 52);
  return c;
}
function recapModal() {
  if (!me) return loginModal();
  const st = recapStats(), canvas = drawRecap(st);
  const { el, close } = modal(`<h2>${icon('calendar')} Minha semana</h2>
    <img class="recap-img" alt="Resumo da semana: ${st.plays} partidas, ${st.personal} recordes pessoais" width="270" height="338">
    <div class="recap-btns"><button class="btn" id="rcShare">${icon('upload')} Compartilhar</button><button class="btn ghost" id="rcClose">Fechar</button></div>
    <p class="hint" id="rcMsg"></p>`);
  const img = el.querySelector('.recap-img');
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    img.src = url;
    const done = () => URL.revokeObjectURL(url);
    el.querySelector('#rcClose').onclick = () => { done(); close(); };
    el.querySelector('#rcShare').onclick = async () => {
      const file = new File([blob], 'minha-semana-microgame.png', { type: 'image/png' }), msg = el.querySelector('#rcMsg');
      try {
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Minha semana no MicroGame' });
        else { const a = Object.assign(document.createElement('a'), { href: url, download: file.name }); document.body.append(a); a.click(); a.remove(); msg.textContent = 'Imagem baixada.'; }
      } catch (err) { if (err.name !== 'AbortError') msg.textContent = 'Não deu pra compartilhar: ' + err.message; }
    };
  }, 'image/png');
  el.querySelector('#rcClose').onclick = close;
}
