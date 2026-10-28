// ---------- social e competição ----------
// Reações nos recordes, duelos de 24h, torneio semanal, ranking por equipe e o resumo da semana.
// O servidor (lib/social.js) decide tudo que vale; aqui só se desenha. `social` = resposta de /api/social (só logado).
let social = null;
async function loadSocial() {
  if (localMode || !me || me.mustChange) { social = null; return null; }
  try { social = await api('api/social'); } catch { /* sem rede: mantém o último */ }
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

/* ---------- telas de competição: Rankings, Torneio, Duplas e Duelos abrem como telas inteiras (igual ao perfil) ---------- */
// head = título e botões ao lado do voltar; bind(el) liga os botões depois de desenhar. Abrir de novo a mesma tela só redesenha.
function compPage(view, head, body, bind) {
  const again = currentView === view;
  stop();
  currentView = view;
  if (!again) setTimeout(pingSession, 0);
  const render = () => {
    main.classList.remove('game-view');
    main.innerHTML = `<div class="admin comp-page comp-${view}">
      <div class="stage-head"><button class="btn ghost icon-btn back" id="back" aria-label="Voltar ao menu">${icon('arrow-left')}</button>${head}</div>
      ${body}</div>`;
    $('#back').onclick = showMenu;
    bind?.(main.firstElementChild);
    paintSideNav();
  };
  if (again) render();
  else { swap(render); scrollTo(0, 0); }
}
const compTitle = (ic, title, sub) => `<div class="title"><h1>${icon(ic)} ${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;

/* ---------- peças das telas de competição: pódio, números do topo e listas com barra ---------- */
// avatar grande do pódio: o escolhido, ou as iniciais num círculo com a cor tirada do nome
function podAvatar(name) {
  const a = parseAvatar(flair.avatars?.[name]);
  if (a) return `<span class="pd-av" style="--h:${a.hue}">${avatarImg(a)}</span>`;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const ini = name.trim().split(/\s+/).map(w => w[0]).filter(Boolean);
  return `<span class="pd-av ini" style="--h:${h}" aria-hidden="true">${esc(((ini[0] || '?') + (ini.length > 1 ? ini[ini.length - 1] : '')).toUpperCase())}</span>`;
}
/** Pódio (2º, 1º, 3º). rows: [{ name, av?, title?, sub?, cells?: [[rótulo, valor]], big, unit, me? }] — `av` troca o avatar (ex.: os dois da dupla). */
function podiumHtml(rows, { title, ic = 'trophy', note = '', lead = '' } = {}) {
  if (!rows.length) return '';
  const card = (r, k) => r ? `<div class="pd p${k + 1}${r.me ? ' me' : ''}">
      ${k === 0 ? `<span class="pd-crown">${icon('crown')}</span>` : ''}
      <div class="pd-top">${r.av ?? podAvatar(r.name)}<span class="rank r${k + 1}">${k + 1}</span></div>
      ${r.title ? `<b class="pd-n">${r.title}</b>` : `<a href="#" class="pd-n" data-profile="${esc(r.name)}">${esc(r.name)}</a>`}
      ${r.sub ? `<small class="pd-sub">${r.sub}</small>` : ''}
      ${k === 0 && lead ? `<span class="pd-lead">${lead}</span>` : ''}
      ${r.cells?.length ? `<div class="pd-cells" style="--n:${r.cells.length}">${r.cells.map(([l, v]) => `<span><small>${l}</small><b>${v}</b></span>`).join('')}</div>` : ''}
      <div class="pd-total"><b>${r.big}</b> <small>${r.unit}</small></div>
    </div>` : '<div class="pd empty"></div>';
  return `<section class="glass podium"><div class="pd-head"><h2 class="comp-sub">${icon(ic)} ${title}</h2>${note ? `<span class="hint">${note}</span>` : ''}</div>
    <div class="pd-row">${card(rows[1], 1)}${card(rows[0], 0)}${card(rows[2], 2)}</div></section>`;
}
/** Números do topo da tela: [[ícone, número, rótulo, cor (matiz)]] */
const statTiles = items => `<div class="kpis">${items.map(([ic, v, l, h = 290]) => `<div class="kpi" style="--h:${h}"><span class="ic">${icon(ic)}</span><span><b>${v}</b><small>${l}</small></span></div>`).join('')}</div>`;
/** Classificação depois do pódio (do 4º em diante), com barra proporcional ao 1º. rows: [{ name, val, sub?, pct, me? }] */
function restListHtml(rows, from = 4) {
  if (!rows.length) return '';
  return `<ol class="rest" start="${from}">${rows.map((r, k) => `<li class="${r.me ? 'me' : ''}">${rankBadge(from + k)}<span class="rs-n">${r.label ?? nameHtml(r.name)}${r.sub ? `<small>${r.sub}</small>` : ''}</span>
    <span class="rs-bar"><i style="width:${Math.max(4, Math.round(r.pct * 100))}%"></i></span><b>${r.val}</b></li>`).join('')}</ol>`;
}
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
// partidas no período (só jogos principais): quantas no total, por jogo e por pessoa
function playStats(range = currentRange()) {
  const since = range.since || 0, until = range.until ?? Infinity, byGame = {}, byName = {};
  let total = 0;
  for (const id of mainGames()) for (const s of scores[id] || []) {
    if (s.date < since || s.date >= until) continue;
    total++; byGame[id] = (byGame[id] || 0) + 1; byName[s.name] = (byName[s.name] || 0) + 1;
  }
  return { total, byGame, byName, players: Object.keys(byName).length };
}
// dias seguidos jogando qualquer coisa (vale até ontem: a sequência só quebra se passar um dia inteiro sem jogar)
function playStreaks() {
  const days = {};
  for (const id in GAMES) for (const s of scores[id] || []) (days[s.name] ||= new Set()).add(dayIndex(s.date));
  const today = dayIndex(), out = [];
  for (const [name, set] of Object.entries(days)) {
    let d = set.has(today) ? today : today - 1, n = 0;
    while (set.has(d)) { n++; d--; }
    if (n >= 2) out.push({ name, n, today: set.has(today) });
  }
  return out.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'pt-BR'));
}
// quem subiu nos recordes em 7 dias: posição de hoje × posição de uma semana atrás (no mesmo período)
function climbers(range = currentRange()) {
  const weekAgo = Date.now() - 7 * DAY_MS;
  const now = champions(range), before = champions({ since: range.since || 0, until: weekAgo });
  const pos = list => new Map(list.map(([n], i) => [n, i + 1]));
  const pb = pos(before);
  return now.map(([n, w], i) => ({ name: n, pos: i + 1, was: pb.get(n) || null, w, gained: w - (before.find(x => x[0] === n)?.[1] || 0) }))
    .filter(r => r.gained > 0 || (r.was && r.was > r.pos))
    .sort((a, b) => ((b.was || 99) - b.pos) - ((a.was || 99) - a.pos) || b.gained - a.gained).slice(0, 5);
}

/* ---------- torneio semanal ---------- */
function tourneyBodyHtml() {
  const t = social?.tourney;
  if (!t || !t.on) return `<section class="glass"><div class="empty-state">${icon('trophy')}<b>O torneio semanal ainda não começou</b><span>Quando começar, os 3 jogos da semana aparecem aqui.</span></div></section>`;
  const range = { since: t.start, until: t.end };
  const games = t.games.filter(id => GAMES[id]).map(id => {
    const g = GAMES[id], list = bestPerPlayer(id, range), top = list[0], mineIdx = list.findIndex(([n]) => n === player);
    return `<button class="tgame" data-id="${id}" style="--h:${g.hue}">
      <span class="tg-art" aria-hidden="true"><span class="tg-tile">${icon(g.icon)}</span></span>
      <span class="tg-tx"><b>${g.name}</b>
      <small>${top ? `${icon('crown')} ${esc(top[0])} · ${fmt(g, top[1])}` : 'ninguém jogou ainda'}</small>
      <small class="you">${mineIdx >= 0 ? `você: ${mineIdx + 1}º · ${fmt(g, list[mineIdx][1])}` : 'você ainda não jogou'}</small></span></button>`;
  }).join('');
  const stand = t.standings.slice(0, 10), lastTop = t.last?.top?.[0], ids = t.games.filter(id => GAMES[id]);
  // pontos de cada pessoa em cada jogo (pela posição dela no jogo)
  const ptsIn = (r, id) => (r.ranks?.[id] ? t.points[r.ranks[id] - 1] ?? 1 : null);
  const short = id => GAMES[id].name.split(' ')[0];
  const rows = stand.map(r => ({ name: r.name, big: r.points, unit: 'pts totais', me: r.name === player, sub: `${r.played} de ${ids.length} jogos`,
    cells: ids.map(id => [short(id), ptsIn(r, id) != null ? `${ptsIn(r, id)} pts` : '—']) }));
  const gap = stand.length > 1 ? stand[0].points - stand[1].points : 0;
  const lead = stand.length > 1 ? (gap ? `Líder isolado · +${gap} pts` : 'Empatado na frente') : '';
  const leftDays = Math.max(0, Math.ceil((t.end - Date.now()) / DAY_MS));
  const table = stand.length ? `<div class="t-table" role="table" aria-label="Classificação do torneio" style="--n:${ids.length}">
      <div class="tt-row tt-head" role="row"><span role="columnheader">#</span><span role="columnheader">Jogador</span>${ids.map(id => `<span role="columnheader" style="--h:${GAMES[id].hue}">${icon(GAMES[id].icon)} ${short(id)}</span>`).join('')}<span role="columnheader">Total</span></div>
      ${stand.map((r, k) => `<div class="tt-row${r.name === player ? ' me' : ''}" role="row"><span role="cell">${rankBadge(k + 1)}</span><span role="cell">${nameHtml(r.name)}</span>
        ${ids.map(id => `<span role="cell" class="tt-g">${r.ranks?.[id] ? `<b>${ptsIn(r, id)}</b><small>${r.ranks[id]}º · ${fmt(GAMES[id], r.scores[id])}</small>` : '<small>—</small>'}</span>`).join('')}
        <span role="cell" class="tt-t">${r.points}</span></div>`).join('')}</div>`
    : '<p class="hint" style="text-align:left;margin:0">Ninguém pontuou ainda. Jogue um dos 3 jogos e saia na frente.</p>';
  return `${statTiles([['hourglass', leftDays === 1 ? '1 dia' : `${leftDays} dias`, `pra acabar · ${dayLabelBR(t.end - 1)}`, 30], ['users', t.players, 'jogadores pontuando', 210],
      ['medal', t.mineRank ? `${t.mineRank}º` : '—', t.mine ? `você · ${t.mine.points} pts` : 'você ainda não pontuou', 70],
      ['crown', lastTop ? esc(lastTop.name) : '—', lastTop ? `campeão da semana passada · ${lastTop.points} pts` : 'campeão da semana passada', 290]])}
    ${rows.length ? podiumHtml(rows.slice(0, 3), { title: 'Pódio provisório da semana', ic: 'trophy', note: `${plural(t.players, 'jogador pontuando', 'jogadores pontuando')}`, lead }) : ''}
    <div class="t-body">
      <section class="glass"><h2 class="comp-sub">${icon('gamepad-2')} Jogos da semana</h2><div class="tgames">${games}</div>
        <details class="duo-how"><summary>Como pontua</summary><p>Vale a sua melhor partida da semana em cada jogo. Por jogo: 1º ${t.points[0]} pts, 2º ${t.points[1]}, 3º ${t.points[2]}, 4º ${t.points[3]}, 5º ${t.points[4]}, 6º ${t.points[5]}, depois 1 ponto. Quem somar mais leva o troféu.</p></details></section>
      <section class="glass tstand">
        <h2 class="comp-sub">${icon('trophy')} Classificação</h2>
        ${table}
        ${t.mineRank && t.mineRank > 10 ? `<p class="hint">Você está em ${t.mineRank}º com ${t.mine.points} pts.</p>` : ''}
      </section>
    </div>`;
}
async function tourneyModal() {
  if (!me) return loginModal();
  await loadSocial();
  const t = social?.tourney;
  compPage('torneio', compTitle('trophy', 'Torneio da semana', t?.on ? `${dayLabelBR(t.start)} a ${dayLabelBR(t.end - 1)} · acaba em ${leftText(t.end - Date.now())}` : 'Três jogos por semana, quem somar mais leva o troféu.'),
    tourneyBodyHtml(), el => { el.querySelectorAll('.tgame').forEach(b => b.onclick = () => play(b.dataset.id)); mountTourneyArt(el); });
}
// os jogos da semana ganham a cena 3D do card do menu (cards3d.js); sem 3D (ou sem internet), fica o ícone num ladrilho com volume
async function mountTourneyArt(el) {
  if (!fx3dOn) return;
  try { await loadLib(ZDOG_URL); } catch { return; }
  if (currentView !== 'torneio' || !el.isConnected) return;
  const size = SMALL.matches ? 76 : 96;
  const offs = [...el.querySelectorAll('.tgame')].map(b => mountScene3d(b.dataset.id, b.querySelector('.tg-art'), size)).filter(Boolean);
  if (!offs.length) return;
  const prev = cleanup;
  cleanup = () => { offs.forEach(f => f()); prev?.(); };
}

/* ---------- barra de competição (menu): atalhos sem listas — os rankings ficam todos na tela "Rankings" ---------- */
function renderStrip() {
  const box = $('#strip');
  if (!box) return;
  const t = social?.tourney, my = social?.myDuo, open = social?.duels?.open?.length || 0;
  const btn = (id, ic, label, sub, hot = false) => `<button class="hub-btn${hot ? ' hot' : ''}" data-act="${id}"${id === 'rank' ? ' id="rankBtn"' : ''}><span class="ic">${icon(ic)}</span><span class="tx"><b>${label}</b><small>${sub}</small></span></button>`;
  // quem lidera o período (se ninguém tem recorde no começo do mês, mostra o geral)
  let kings = champions(), label = seasonMode === 'all' ? 'no geral' : `em ${seasonLabel().toLowerCase()}`;
  if (!kings.length) { kings = champions({}); label = 'no geral'; }
  const lead = kings[0] ? `${esc(kings[0][0])} lidera ${label}` : 'recordes, desafio e diários';
  let html = btn('rank', 'crown', 'Rankings', lead);
  if (me) {
    if (!social || t?.on) html += btn('tourney', 'trophy', 'Torneio', !social ? '…' : `acaba em ${leftText(t.end - Date.now())}${t.mineRank ? ` · você ${t.mineRank}º` : ''}`);
    html += btn('duos', 'users', 'Duplas', !social ? '…' : { none: 'formar uma dupla', out: 'convite enviado', in: 'você tem um convite!' }[my.state] || esc(my.name || 'sua dupla'), my?.state === 'in');
    html += btn('duels', 'swords', 'Duelos', !social ? '…' : open ? `${open} em andamento` : 'desafiar alguém', open > 0);
  }
  box.hidden = false;
  box.innerHTML = html;
  box.style.setProperty('--n', box.children.length);
  const go = { rank: () => rankingsModal(), tourney: tourneyModal, duos: duosModal, duels: () => duelsModal() };
  box.querySelectorAll('[data-act]').forEach(b => { b.onclick = go[b.dataset.act]; });
}

/* ---------- rankings (tela): tudo que é placar geral fica aqui, em abas ---------- */
let rankTab = 'kings';
function rankingsModal(tab = rankTab) {
  const hall = hallHtml(), week = weekInnerHtml();
  const tabs = [['kings', 'crown', 'Recordes'], ['challenge', 'star', 'Desafio do dia'], ['daily', 'calendar', 'Jogos diários'],
    hall && ['hall', 'landmark', 'Hall da fama'], week && ['week', 'ticket', 'Tickets']].filter(Boolean);
  const bodyOf = t => t === 'kings' ? kingsTabHtml() : t === 'challenge' ? challengeTabHtml() : t === 'daily' ? dailyTabHtml()
    : t === 'hall' ? `<section class="glass">${hall}</section>` : `<section class="glass"><div class="week">${week}</div></section>`;
  if (!tabs.some(([t]) => t === tab)) tab = 'kings';
  rankTab = tab;
  compPage('rankings', compTitle('crown', 'Rankings', 'Recordes, desafio do dia, jogos diários e campeões.'),
    `<div class="seg rk-tabs" role="tablist" aria-label="Rankings">${tabs.map(([t, ic, l]) => `<button role="tab" data-rk="${t}" aria-selected="${tab === t}">${icon(ic)} ${l}</button>`).join('')}</div>
    <div class="rk-body"></div>`, el => {
      const body = el.querySelector('.rk-body');
      // troca de aba / de período só refaz o miolo
      const paint = () => {
        body.innerHTML = bodyOf(rankTab);
        bindSeasonSeg(body, paint);
        body.querySelectorAll('[data-play]').forEach(b => b.onclick = () => play(b.dataset.play));
      };
      el.querySelectorAll('[data-rk]').forEach(b => b.onclick = () => {
        rankTab = b.dataset.rk;
        el.querySelectorAll('[data-rk]').forEach(x => x.setAttribute('aria-selected', x === b));
        paint();
      });
      paint();
    });
}

// aba Recordes: números do período, pódio de quem tem mais recordes, o resto da lista e, ao lado, os mais jogados, as sequências e quem subiu
function kingsTabHtml() {
  const range = currentRange(), kings = champions(range), st = playStats(range), per = seasonMode === 'all' ? 'no geral' : `em ${seasonLabel().toLowerCase()}`;
  const top = Object.entries(st.byGame).sort((a, b) => b[1] - a[1]), streaks = playStreaks(), up = climbers(range);
  const week = Date.now() - 7 * DAY_MS;
  const fresh = mainGames().filter(id => { const [b] = bestPerPlayer(id, range); return b && (scores[id] || []).some(s => s.name === b[0] && s.score === b[1] && s.date >= week); }).length;
  const rows = kings.map(([n, w, v]) => ({ name: n, big: w, unit: w === 1 ? 'recorde' : 'recordes', me: n === player,
    sub: `${plural(st.byName[n] || 0, 'partida', 'partidas')} ${per}`, cells: [['Recordes', w], ['2º lugares', v], ['Partidas', st.byName[n] || 0]] }));
  const lead = kings.length > 1 ? (kings[0][1] > kings[1][1] ? `Líder isolado · +${kings[0][1] - kings[1][1]}` : 'Empatado na frente') : '';
  const side = `<div class="rk-side">
      <section class="glass mini-card"><h3>${icon('chart-column')} Mais jogados ${per}</h3>
        ${top.length ? `<ol class="bars">${top.slice(0, 6).map(([id, n]) => `<li style="--h:${GAMES[id].hue}"><span class="ic">${icon(GAMES[id].icon)}</span><span class="bn">${GAMES[id].name}<i style="width:${Math.round(n / top[0][1] * 100)}%"></i></span><b>${n}</b></li>`).join('')}</ol>`
          : '<p class="hint">Ninguém jogou ainda.</p>'}</section>
      <section class="glass mini-card"><h3>${icon('flame')} Em sequência</h3>
        ${streaks.length ? `<ol class="mini-list">${streaks.slice(0, 5).map(r => `<li class="${r.name === player ? 'me' : ''}">${nameHtml(r.name)}<b class="fire">${r.n} dias</b>${r.today ? '' : `<small title="Ainda não jogou hoje">em risco</small>`}</li>`).join('')}</ol>`
          : '<p class="hint">Jogue dois dias seguidos pra aparecer aqui.</p>'}</section>
      <section class="glass mini-card"><h3>${icon('trending-up')} Quem subiu na semana</h3>
        ${up.length ? `<ol class="mini-list">${up.map(r => `<li class="${r.name === player ? 'me' : ''}">${nameHtml(r.name)}<b class="up">${r.was ? (r.was > r.pos ? `${r.was}º → ${r.pos}º` : `${r.pos}º`) : `entrou em ${r.pos}º`}</b><small>${r.gained > 0 ? `+${r.gained} recorde${r.gained > 1 ? 's' : ''}` : ''}</small></li>`).join('')}</ol>`
          : '<p class="hint">Ninguém mudou de posição nos últimos 7 dias.</p>'}</section>
    </div>`;
  return `${statTiles([['gamepad-2', st.total.toLocaleString('pt-BR'), `partidas ${per}`, 290], ['users', st.players, 'jogadores', 210],
      ['star', fresh, 'recordes batidos em 7 dias', 70], ['flame', streaks[0] ? `${streaks[0].n} dias` : '—', streaks[0] ? `maior sequência: ${esc(streaks[0].name)}` : 'maior sequência', 30]])}
    <div class="rk-grid"><div class="rk-main">${seasonSeg()}
      ${rows.length ? podiumHtml(rows.slice(0, 3), { title: `Pódio dos recordes`, ic: 'crown', note: `quem é o 1º em mais jogos ${per}`, lead })
        + (rows.length > 3 ? `<section class="glass">${restListHtml(rows.slice(3, 10).map(r => ({ ...r, val: `${r.big} <small>${r.unit}</small>`, sub: `${r.cells[1][1]} em 2º · ${r.sub}`, pct: r.big / rows[0].big })))}</section>` : '')
        : `<section class="glass"><div class="empty-state">${icon('crown')}<b>Ninguém tem recorde ${per}</b><span>Jogue qualquer jogo e saia na frente.</span></div></section>`}
    </div>${side}</div>`;
}
// aba Desafio do dia: pódio de hoje, o resto, as vitórias do mês e os campeões dos últimos dias
function challengeTabHtml() {
  const id = dailyGame(), g = GAMES[id], list = bestPerPlayer(id, dayRange()), r = dayRange(), plays = {};
  for (const s of scores[id] || []) if (s.date >= r.since && s.date < r.until) plays[s.name] = (plays[s.name] || 0) + 1;
  const wins = dailyWinsThisMonth(), winsOf = Object.fromEntries(wins), mine = list.findIndex(([n]) => n === player);
  const rows = list.map(([n, s]) => ({ name: n, big: (g.decimals ? dec(s, g.decimals) : s.toLocaleString('pt-BR')), unit: g.unit, me: n === player,
    sub: `${plural(plays[n] || 0, 'tentativa', 'tentativas')} hoje`, cells: [['Tentativas', plays[n] || 0], ['Vitórias no mês', winsOf[n] || 0]] }));
  const total = Object.values(plays).reduce((a, b) => a + b, 0);
  return `${statTiles([[g.icon, g.name, 'jogo de hoje', g.hue], ['hourglass', `${dailyHoursLeft()}h`, 'pra acabar', 30], ['users', list.length, 'jogando hoje', 210],
      ['medal', mine >= 0 ? `${mine + 1}º` : '—', mine >= 0 ? 'sua posição' : 'você ainda não jogou', 70]])}
    <div class="rk-grid"><div class="rk-main">
      ${rows.length ? podiumHtml(rows.slice(0, 3), { title: `Pódio de hoje · ${g.name}`, ic: 'star', note: `${plural(total, 'partida', 'partidas')} hoje · vale a melhor de cada um`, lead: 'Ganha a coroa amanhã' })
        + (rows.length > 3 ? `<section class="glass">${restListHtml(rows.slice(3, 10).map((x, k) => ({ ...x, val: fmt(g, list[k + 3][1]), pct: g.better === 'low' ? list[0][1] / list[k + 3][1] : list[k + 3][1] / list[0][1] })))}</section>` : '')
        : `<section class="glass"><div class="empty-state">${icon('star')}<b>Ninguém jogou o desafio hoje</b><span>Quem fizer a melhor partida até meia-noite ganha a coroa.</span><button class="btn" data-play="${id}">${icon('play')} Jogar ${g.name}</button></div></section>`}
      ${champsHtml() ? `<section class="glass champs-card">${champsHtml()}</section>` : ''}
    </div><div class="rk-side">
      ${wins.length ? `<section class="glass mini-card"><h3>${icon('medal')} Vitórias em ${monthName(monthKey(Date.now())).toLowerCase()}</h3><ol class="mini-list">${wins.slice(0, 6).map(([n, c]) => `<li class="${n === player ? 'me' : ''}">${nameHtml(n)}<b>${c}</b></li>`).join('')}</ol></section>` : ''}
    </div></div>`;
}
// aba Jogos diários: pódio da soma de hoje, o resto, o campeão de ontem e quem joga todo dia
function dailyTabHtml() {
  const list = dailyTabStandings(), total = dailyOrder().length, [champ] = dailyTabStandings(dayIndex() - 1), mine = list.findIndex(r => r.name === player);
  const rows = list.map(r => ({ name: r.name, big: r.pts.toLocaleString('pt-BR'), unit: 'pts', me: r.name === player, sub: `${r.games}/${total} jogos feitos`,
    cells: [['Jogos', `${r.games}/${total}`], ['Sequência', `${dailyTabStreak(r.name)} d`]] }));
  const streaks = [...new Set([...list.map(r => r.name), ...dailyTabStandings(dayIndex() - 1).map(r => r.name)])].map(n => ({ n, d: dailyTabStreak(n) })).filter(x => x.d > 1).sort((a, b) => b.d - a.d).slice(0, 5);
  return `${statTiles([['calendar', total, 'jogos diários hoje', 290], ['users', list.length, 'jogando hoje', 210],
      ['medal', mine >= 0 ? `${mine + 1}º` : '—', mine >= 0 ? `você · ${list[mine].pts.toLocaleString('pt-BR')} pts` : 'você ainda não jogou', 70], ['flame', me ? `${dailyTabStreak(player)} d` : '—', 'sua sequência nos diários', 30]])}
    <div class="rk-grid"><div class="rk-main">
      ${rows.length ? podiumHtml(rows.slice(0, 3), { title: 'Pódio dos diários de hoje', ic: 'calendar', note: 'soma dos pontos em todos os diários · zera à meia-noite', lead: 'Campeão do dia' })
        + (rows.length > 3 ? `<section class="glass">${restListHtml(rows.slice(3, 10).map(x => ({ ...x, val: `${x.big} <small>pts</small>`, pct: list[rows.indexOf(x)].pts / list[0].pts })))}</section>` : '')
        : `<section class="glass"><div class="empty-state">${icon('calendar')}<b>Ninguém jogou os diários hoje</b><span>Cada jogo diário vale pontos; quem somar mais até meia-noite é o campeão.</span></div></section>`}
    </div><div class="rk-side">
      ${champ ? `<section class="glass mini-card"><h3>${icon('crown')} Campeão de ontem</h3><ol class="mini-list"><li>${nameHtml(champ.name)}<b>${champ.pts.toLocaleString('pt-BR')} pts</b></li></ol></section>` : ''}
      <section class="glass mini-card"><h3>${icon('flame')} Joga todo dia</h3>${streaks.length ? `<ol class="mini-list">${streaks.map(x => `<li class="${x.n === player ? 'me' : ''}">${nameHtml(x.n)}<b class="fire">${x.d} dias</b></li>`).join('')}</ol>` : '<p class="hint">Ninguém com sequência ainda.</p>'}</section>
    </div></div>`;
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
// games = [{ id, entries: [{ d, v, pts }] }] (as duplas que entraram em cada jogo, da melhor pra pior)
function duoBoard(range = currentRange()) {
  const duos = (social?.duos || []).map(d => ({ ...d, pts: 0, podiums: 0, firsts: 0 })), games = [];
  if (!duos.length) return { duos, games };
  for (const id of mainGames()) {
    const g = GAMES[id], entries = [];
    for (const d of duos) {
      const since = Math.max(range.since || 0, d.since ?? d.formedAt ?? 0);
      const x = bestIn(id, d.aName, since, range.until), y = bestIn(id, d.bName, since, range.until);
      if (x != null && y != null) entries.push({ d, v: (x + y) / 2, pts: 0 });
    }
    entries.sort((p, q) => (p.v === q.v ? 0 : better(g, p.v, q.v) ? -1 : 1));
    entries.slice(0, 3).forEach((e, i) => { e.pts = 3 - i; e.d.pts += e.pts; e.d.podiums++; if (!i) e.d.firsts++; });
    games.push({ id, entries });
  }
  duos.sort((p, q) => q.pts - p.pts || q.firsts - p.firsts || p.name.localeCompare(q.name, 'pt-BR'));
  return { duos, games };
}
const duoStandings = range => duoBoard(range).duos;
// a média dos dois pode ter meio ponto
const fmtAvg = (g, v) => (g.decimals ? dec(v, g.decimals) : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })) + ' ' + g.unit;
function duosBodyHtml() {
  const { duos, games } = duoBoard(), my = social.myDuo, mine = d => my.state === 'active' && d.id === my.id;
  const rows = duos.slice(0, 10);
  const played = games.filter(x => x.entries.length).sort((a, b) => b.entries.length - a.entries.length || GAMES[a.id].name.localeCompare(GAMES[b.id].name, 'pt-BR'));
  const idle = games.filter(x => !x.entries.length);
  const pod = duos.filter(d => d.pts > 0).slice(0, 3).map(d => ({ name: d.aName, title: esc(d.name), av: `<span class="pd-duo">${podAvatar(d.aName)}${podAvatar(d.bName)}</span>`,
    sub: `${esc(d.aName)} & ${esc(d.bName)}`, me: mine(d), big: d.pts, unit: 'pts',
    cells: [['Jogos em 1º', d.firsts], ['Pódios', d.podiums], ['Jogos', games.filter(x => x.entries.some(e => e.d.id === d.id)).length]] }));
  const myPos = my.state === 'active' ? duos.findIndex(mine) + 1 : 0;
  const gap = duos.length > 1 ? duos[0].pts - duos[1].pts : 0;
  const head = statTiles([['users', duos.length, duos.length === 1 ? 'dupla formada' : 'duplas formadas', 210], ['gamepad-2', `${played.length}/${games.length}`, 'jogos com dupla pontuando', 290],
    ['medal', myPos ? `${myPos}º` : '—', myPos ? `${esc(my.name)} · ${duos[myPos - 1].pts} pts` : 'você não tem dupla', 70],
    ['trophy', duos[0]?.pts ? esc(duos[0].name) : '—', duos[0]?.pts ? `lidera com ${duos[0].pts} pts` : 'ninguém pontuou', 30]])
    + podiumHtml(pod, { title: `Pódio das duplas ${seasonMode === 'all' ? 'no geral' : `em ${seasonLabel().toLowerCase()}`}`, ic: 'users', note: '3, 2 e 1 pontos pras 3 melhores duplas de cada jogo', lead: pod.length > 1 ? (gap ? `Na frente por ${gap} pts` : 'Empatadas na frente') : '' });
  const gameCard = ({ id, entries }) => {
    const g = GAMES[id];
    return `<div class="dg" style="--h:${g.hue}"><div class="dg-head"><span class="ic">${icon(g.icon)}</span><b>${g.name}</b></div>
      <ol>${entries.map((e, k) => `<li class="${mine(e.d) ? 'me' : ''}">${rankBadge(k + 1)}<span class="dn">${esc(e.d.name)}<small>média ${fmtAvg(g, e.v)}</small></span><b class="${e.pts ? '' : 'zero'}">${e.pts ? `+${e.pts}` : '0'} pts</b></li>`).join('')}</ol></div>`;
  };
  return `${head}<div class="duo-cols">
    <section class="glass teams"><h2 class="comp-sub">${icon('trophy')} Classificação</h2>
    ${rows.length ? restListHtml(rows.map(r => ({ label: `<b class="tn">${esc(r.name)}</b>`, me: mine(r), val: `${r.pts} <small>pts</small>`, pct: rows[0].pts ? r.pts / rows[0].pts : 0,
      sub: `${esc(r.aName)} & ${esc(r.bName)} · ${r.firsts} em 1º · ${r.podiums} pódio${r.podiums === 1 ? '' : 's'}` })), 1)
      : '<p class="hint" style="text-align:left;margin:0">Ninguém formou dupla ainda. Chame um colega e escolham um nome!</p>'}
    <details class="duo-how"><summary>Como funciona</summary><p>Cada um chama quem quiser e dá o nome que quiser à dupla. Em cada jogo, a dupla só pontua se <b>os dois</b> jogaram (depois de formada, ou desde quando o admin definiu); vale a média das melhores partidas dos dois. As 3 melhores duplas do jogo ganham 3, 2 e 1 pontos. Vale o período escolhido em Rankings (mês ou geral).</p></details>
    </section>
    <section class="glass duo-games"><h2 class="comp-sub">${icon('gamepad-2')} Pontos em cada jogo</h2>
      ${played.length ? `<div class="dg-grid">${played.map(gameCard).join('')}</div>` : '<p class="hint" style="text-align:left;margin:0">Nenhuma dupla pontuou ainda: a dupla entra num jogo quando os dois jogam.</p>'}
      ${played.length && idle.length ? `<p class="hint dg-idle">Sem dupla pontuando: ${idle.map(x => GAMES[x.id].name).join(', ')}.</p>` : ''}
    </section></div>`;
}
async function duosModal() {
  if (!me) return loginModal();
  await loadSocial();
  if (!social) return duoModal();
  const my = social.myDuo, cta = { none: 'Formar dupla', out: 'Convite enviado', in: 'Convite pra você!', active: 'Minha dupla' }[my.state];
  compPage('duplas', compTitle('users', 'Duplas', `Ranking das duplas ${seasonMode === 'all' ? 'no geral' : `em ${seasonLabel().toLowerCase()}`}: os pontos de cada dupla em cada jogo.`)
    + `<button class="btn ${my.state === 'in' ? '' : 'ghost'}" id="duoOpen">${icon('users')} <span>${cta}</span></button>`,
    duosBodyHtml(), el => { el.querySelector('#duoOpen').onclick = () => duoModal(); });
}
function setDuoBadge() {
  const b = $('#duoCnt');
  if (b) { const n = social?.myDuo?.state === 'in' ? 1 : 0; b.textContent = n; b.hidden = !n; }
}
async function duoModal(pre = {}) {
  if (!me) return loginModal();
  await loadSocial();
  if (!social) return modal(`<h2>${icon('users')} Dupla</h2><p>Não deu pra carregar agora. Tente de novo em instantes.</p><button class="btn" data-ok>Ok</button>`);
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
      : `<div class="empty-state">${icon('users')}<b>Ninguém livre agora</b><span>Todo mundo já está em dupla ou com convite aberto. Quando alguém ficar livre, aparece aqui.</span></div>`;
  }
  const { el, close } = modal(`<h2>${icon('users')} Minha dupla</h2>${body}
    <details class="duo-how"><summary>Como a pontuação funciona</summary><p>Em cada jogo, a dupla só entra no ranking se <b>os dois</b> jogaram depois de formada. A nota é a <b>média</b> das melhores partidas dos dois. As 3 melhores duplas do jogo ganham 3, 2 e 1 pontos, e a soma nos jogos define a classificação (mês ou geral). Partidas de antes da dupla não contam, a não ser que o admin tenha criado a dupla valendo desde antes.</p></details>
    <button class="btn ghost" id="duoClose">Fechar</button>`);
  el.querySelector('#duoClose').onclick = close;
  const call = async (path, bodyObj, after) => {
    const err = el.querySelector('#duoErr');
    if (err) err.textContent = '';
    try { await api(path, { method: 'POST', body: bodyObj || {} }); await loadSocial(); setDuoBadge(); if (currentView === 'menu') refreshMenu(); if (currentView === 'duplas') duosModal(); after ? after() : (close(), duoModal()); }
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
const duelGames = () => Object.keys(GAMES).filter(id => !GAMES[id].daily);
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
    <div><b>${RESULT_TXT[d.result]}</b> contra ${esc(d.vs)} · ${g.name}<small>${d.mine != null ? fmt(g, d.mine) : '—'} × ${d.theirs != null ? fmt(g, d.theirs) : '—'}</small></div>
    ${d.vsId != null && duelGames().includes(d.game) ? `<div class="acts"><button class="btn ghost" data-rematch="${d.vsId}" data-game="${d.game}">${icon('rotate-ccw')} Revanche</button></div>` : ''}</div>`;
}
// números dos meus duelos (dos últimos resultados que o servidor manda), o maior rival e o pódio de quem mais ganhou
function duelsHeadHtml() {
  const recent = social.duels.recent, all = [...social.duels.open, ...recent];
  const n = k => recent.filter(d => d.result === k).length, w = n('win'), l = n('lose'), e = n('draw');
  const vs = {};
  for (const d of all) vs[d.vs] = (vs[d.vs] || 0) + 1;
  const [rival] = Object.entries(vs).sort((a, b) => b[1] - a[1]);
  const rivalScore = rival && recent.filter(d => d.vs === rival[0]).reduce((s, d) => (d.result === 'win' ? [s[0] + 1, s[1]] : d.result === 'lose' ? [s[0], s[1] + 1] : s), [0, 0]);
  const wins = Object.entries(social.duelWins || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  const pod = wins.slice(0, 3).map(([name, c]) => ({ name, big: c, unit: c === 1 ? 'vitória' : 'vitórias', me: name === player, sub: 'em duelos' }));
  return statTiles([['trophy', social.duelWins?.[player] || 0, 'vitórias no total', 150],
      ['swords', recent.length ? `${w}-${e}-${l}` : '—', recent.length ? `vitórias, empates e derrotas nos últimos ${recent.length}` : 'nenhum duelo terminado', 290],
      ['gauge', recent.length ? `${Math.round(w / recent.length * 100)}%` : '—', 'aproveitamento', 70],
      ['target', rival ? esc(rival[0]) : '—', rival ? `maior rival · ${rivalScore[0]} a ${rivalScore[1]}` : 'maior rival', 20]])
    + (pod.length ? podiumHtml(pod, { title: 'Quem mais ganhou duelos', ic: 'swords', note: 'vitórias somadas de todos os duelos', lead: wins.length > 1 && wins[0][1] > wins[1][1] ? `+${wins[0][1] - wins[1][1]} de vantagem` : '' }) : '');
}
async function duelsModal(pre = {}) {
  if (!me) return loginModal();
  const from = currentView; // o jogo de onde veio (pra já deixar escolhido)
  await loadSocial();
  if (!social) return modal(`<h2>${icon('swords')} Duelos</h2><p>Não deu pra carregar agora. Tente de novo em instantes.</p><button class="btn" data-ok>Ok</button>`);
  const others = social.people.filter(p => p.id !== me.id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const defGame = pre.game && GAMES[pre.game] ? pre.game : GAMES[from] && !GAMES[from].daily ? from : dailyGame();
  const wins = social.duelWins?.[player] || 0;
  compPage('duelos', compTitle('swords', 'Duelos', `Desafie alguém num jogo: por 24 horas vale a melhor partida de cada um (só conta jogar depois do desafio).${wins ? ` Você já ganhou ${wins}.` : ''}`),
    duelsHeadHtml() + `<div class="duel-cols">
      <div class="duel-main">
        <section class="glass"><h2 class="comp-sub">${icon('swords')} Em andamento</h2>
          <div id="dOpen">${social.duels.open.length ? social.duels.open.map(duelRowHtml).join('') : `<div class="empty-state">${icon('swords')}<b>Nenhum duelo em andamento</b><span>Escolha alguém e um jogo em Novo duelo.</span></div>`}</div></section>
        ${social.duels.recent.length ? `<section class="glass"><h2 class="comp-sub">${icon('trophy')} Últimos resultados</h2><div id="dDone">${social.duels.recent.map(duelDoneHtml).join('')}</div></section>` : ''}
      </div>
      <section class="glass"><h2 class="comp-sub">${icon('target')} Novo duelo</h2>
        <form id="dForm" class="admin duel-form">
          <label>Contra quem<select name="opp" required><option value="">Escolha…</option>${others.map(p => `<option value="${p.id}"${pre.opponent === p.name ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
          <label>Jogo<select name="game">${duelGames().map(id => `<option value="${id}"${id === defGame ? ' selected' : ''}>${esc(GAMES[id].name)}</option>`).join('')}</select></label>
          <p class="err" id="dErr"></p>
          <button class="btn">${icon('swords')} Desafiar</button>
        </form></section>
    </div>`, el => {
      const err = el.querySelector('#dErr'), again = () => duelsModal(pre);
      el.querySelectorAll('[data-play]').forEach(b => b.onclick = () => play(b.dataset.play));
      el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
        if (!confirm('Cancelar esse duelo? A outra pessoa é avisada.')) return;
        try { await api(`api/duels/${b.dataset.cancel}/cancel`, { method: 'POST', body: {} }); again(); } catch (e) { err.textContent = e.message; }
      });
      // revanche com um toque: mesmo jogo, mesma pessoa
      el.querySelectorAll('[data-rematch]').forEach(b => b.onclick = async () => {
        b.disabled = true; err.textContent = '';
        try {
          await api('api/duels', { method: 'POST', body: { opponentId: Number(b.dataset.rematch), game: b.dataset.game } });
          sfx.good(); again();
        } catch (e) { err.textContent = e.message; b.disabled = false; }
      });
      el.querySelector('#dForm').onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(e.target), btn = e.target.querySelector('button');
        btn.disabled = true; err.textContent = '';
        try {
          await api('api/duels', { method: 'POST', body: { opponentId: Number(f.get('opp')), game: f.get('game') } });
          sfx.good(); again();
        } catch (e2) { err.textContent = e2.message; btn.disabled = false; }
      };
    });
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
  const leading = mainGames().filter(id => bestPerPlayer(id, {})[0]?.[0] === player).length;
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
