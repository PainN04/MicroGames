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
  return social;
}
const teamOf = name => social?.teams?.[name] || null;
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

/* ---------- torneio semanal (seção do menu) ---------- */
function renderTourney() {
  const box = $('#tourney');
  if (!box) return;
  const t = social?.tourney;
  if (!t || !t.on) { box.hidden = true; return; }
  box.hidden = false;
  const range = { since: t.start, until: t.end };
  const games = t.games.filter(id => GAMES[id]).map(id => {
    const g = GAMES[id], list = bestPerPlayer(id, range), top = list[0], mineIdx = list.findIndex(([n]) => n === player);
    return `<button class="tgame" data-id="${id}" style="--h:${g.hue}">
      <span class="ic">${icon(g.icon)}</span><b>${g.name}</b>
      <small>${top ? `${icon('crown')} ${esc(top[0])} · ${fmt(g, top[1])}` : 'ninguém jogou ainda'}</small>
      <small class="you">${mineIdx >= 0 ? `você: ${mineIdx + 1}º · ${fmt(g, list[mineIdx][1])}` : 'você ainda não jogou'}</small></button>`;
  }).join('');
  const stand = t.standings.slice(0, 5);
  const lastTop = t.last?.top?.[0];
  box.innerHTML = `<div class="t-head"><h2>${icon('trophy')} Torneio da semana</h2>
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
      ${lastTop ? `<br>${icon('crown')} Semana passada: <b>${esc(lastTop.name)}</b> (${lastTop.points} pts).` : ''}</p>
    <div class="t-btns"><button class="btn ghost" id="recapOpen">${icon('calendar')} Minha semana</button><button class="btn ghost" id="duelsOpen">${icon('swords')} Duelos</button></div>`;
  box.querySelectorAll('.tgame').forEach(b => b.onclick = () => play(b.dataset.id));
  $('#recapOpen').onclick = recapModal;
  $('#duelsOpen').onclick = () => duelsModal();
}

/* ---------- ranking por equipe ---------- */
// por jogo, os 3 primeiros dão 3/2/1 pontos pra equipe de cada um (conta o período escolhido: mês ou geral)
function teamStandings(range = currentRange()) {
  if (!social) return [];
  const teams = {};
  const slot = t => (teams[t] ||= { team: t, pts: 0, firsts: 0, members: 0 });
  for (const p of social.people) if (p.team) slot(p.team).members++;
  for (const id in GAMES) bestPerPlayer(id, range).slice(0, 3).forEach(([n], i) => { const t = teamOf(n); if (t) { slot(t).pts += 3 - i; if (!i) slot(t).firsts++; } });
  return Object.values(teams).sort((a, b) => b.pts - a.pts || b.firsts - a.firsts || a.team.localeCompare(b.team, 'pt-BR'));
}
function renderTeams() {
  const box = $('#teams');
  if (!box) return;
  const rows = teamStandings();
  if (rows.length < 1) { box.hidden = true; return; }
  box.hidden = false;
  const mine = me?.team;
  box.innerHTML = `<div class="kings-head"><h2>${icon('users')} Equipes <small class="hint">${seasonMode === 'all' ? 'geral' : seasonLabel().toLowerCase()}</small></h2></div>
    <ol>${rows.map((r, k) => `<li class="${r.team === mine ? 'me' : ''}">${rankBadge(k + 1)} <b class="tn">${esc(r.team)}</b> <span class="tp">${r.pts} pts</span>
      <small>${r.firsts} recorde${r.firsts === 1 ? '' : 's'} · ${r.members} pessoa${r.members === 1 ? '' : 's'}</small></li>`).join('')}</ol>
    <p class="hint t-rules">Em cada jogo, o 1º lugar dá 3 pontos pra equipe dele, o 2º dá 2 e o 3º dá 1.</p>`;
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
      <label>Contra quem<select name="opp" required><option value="">Escolha…</option>${others.map(p => `<option value="${p.id}"${pre.opponent === p.name ? ' selected' : ''}>${esc(p.name)}${p.team ? ' · ' + esc(p.team) : ''}</option>`).join('')}</select></label>
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
  const team = me?.team;
  if (team) { g.font = `500 38px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.65)'; g.fillText(team, 72, 426); }
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
