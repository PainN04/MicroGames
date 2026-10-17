// ---------- conquistas e perfil ----------
// Tudo calculado na página a partir do ranking (scores): nada novo no banco. Conquista vale pelo histórico todo.

/** Estatísticas de uma pessoa (pelo nome que aparece no ranking). */
function statsFor(name) {
  const plays = [];
  for (const id in GAMES) for (const s of scores[id] || []) if (s.name === name) plays.push({ id, ...s });
  plays.sort((a, b) => a.date - b.date);
  const games = new Set(plays.map(p => p.id));
  const rankIn = (id, range = {}) => { const i = bestPerPlayer(id, range).findIndex(([n]) => n === name); return i < 0 ? null : i + 1; };
  const firsts = Object.keys(GAMES).filter(id => rankIn(id) === 1).length;
  const podiums = Object.keys(GAMES).filter(id => (rankIn(id) || 99) <= 3).length;
  const monthsWon = hallOfFame().filter(m => m.kings[0]?.[0] === name).map(m => m.key);
  // desafios do dia ganhos (dias já encerrados, desde a primeira partida de todo mundo)
  let dailyWins = 0, dailyRun = 0, dailyStreak = 0;
  const first = Math.min(...Object.values(scores).flat().map(s => s.date), Date.now());
  for (let i = dayIndex(first); i < dayIndex(); i++) {
    if (bestPerPlayer(dailyGame(i), dayRange(i))[0]?.[0] === name) { dailyWins++; dailyRun++; dailyStreak = Math.max(dailyStreak, dailyRun); }
    else dailyRun = 0;
  }
  // maior sequência de dias úteis seguidos com partida (fim de semana não quebra a sequência)
  const days = [...new Set(plays.map(p => dayIndex(p.date)))].sort((a, b) => a - b);
  let streak = 0, cur = 0, prev = null;
  for (const d of days) {
    let gap = prev === null ? 1 : d - prev;
    if (prev !== null) for (let k = prev + 1; k < d; k++) { const wd = new Date(dayStart(k)).getDay(); if (wd === 0 || wd === 6) gap--; }
    cur = gap === 1 ? cur + 1 : 1;
    streak = Math.max(streak, cur);
    prev = d;
  }
  const hour = p => new Date(p.date).getHours();
  const late = plays.some(p => hour(p) >= 18);
  const early = plays.some(p => hour(p) < 8);
  const lunch = plays.some(p => hour(p) >= 12 && hour(p) < 14);
  const night = plays.some(p => hour(p) >= 22);
  const weekend = plays.some(p => [0, 6].includes(new Date(p.date).getDay()));
  const perDay = {};
  for (const p of plays) perDay[dayIndex(p.date)] = (perDay[dayIndex(p.date)] || 0) + 1;
  const maxInDay = Math.max(0, ...Object.values(perDay));
  const best = id => plays.filter(p => p.id === id).reduce((b, p) => (b === null || better(GAMES[id], p.score, b) ? p.score : b), null);
  return { plays, games, rankIn, firsts, podiums, monthsWon, dailyWins, dailyStreak, streak, late, early, lunch, night, weekend, maxInDay, daysPlayed: days.length, best };
}

const ACHIEVEMENTS = [
  { id: 'estreia', icon: 'gamepad-2', name: 'Estreia', desc: 'Jogou a primeira partida', test: s => s.plays.length >= 1 },
  { id: 'maratona', icon: 'target', name: 'Maratonista', desc: '100 partidas', test: s => s.plays.length >= 100, progress: s => [s.plays.length, 100] },
  { id: 'explorador', icon: 'compass', name: 'Explorador', desc: 'Jogou 10 jogos diferentes', test: s => s.games.size >= 10, progress: s => [s.games.size, 10] },
  { id: 'completo', icon: 'globe', name: 'Zerou o menu', desc: `Jogou todos os ${Object.keys(GAMES).length} jogos`, test: s => s.games.size >= Object.keys(GAMES).length, progress: s => [s.games.size, Object.keys(GAMES).length] },
  { id: 'rei', icon: 'crown', name: 'Rei de um jogo', desc: 'Recorde geral em algum jogo', test: s => s.firsts >= 1 },
  { id: 'imperio', icon: 'castle', name: 'Império', desc: 'Recorde geral em 5 jogos', test: s => s.firsts >= 5, progress: s => [s.firsts, 5] },
  { id: 'podio', icon: 'medal', name: 'Sempre no pódio', desc: 'Top 3 geral em 10 jogos', test: s => s.podiums >= 10, progress: s => [s.podiums, 10] },
  { id: 'desafiante', icon: 'star', name: 'Desafiante', desc: 'Ganhou um desafio do dia', test: s => s.dailyWins >= 1 },
  { id: 'imbativel', icon: 'sparkles', name: 'Imbatível', desc: 'Ganhou 5 desafios do dia', test: s => s.dailyWins >= 5, progress: s => [s.dailyWins, 5] },
  { id: 'mes', icon: 'calendar', name: 'Campeão do mês', desc: 'Terminou um mês com mais recordes', test: s => s.monthsWon.length >= 1 },
  { id: 'constancia', icon: 'flame', name: 'Constância', desc: 'Jogou 5 dias úteis seguidos', test: s => s.streak >= 5, progress: s => [s.streak, 5] },
  { id: 'cedo', icon: 'coffee', name: 'Madrugador', desc: 'Jogou antes das 8h', test: s => s.early },
  { id: 'tresseguidas', icon: 'flame', name: 'Três seguidas', desc: 'Ganhou o desafio do dia 3 dias seguidos', test: s => s.dailyStreak >= 3, progress: s => [s.dailyStreak, 3] },
  { id: 'tarde', icon: 'moon', name: 'Hora extra', desc: 'Jogou depois das 18h', test: s => s.late },
  // ---- mais conquistas ----
  { id: 'veterano', icon: 'award', name: 'Veterano', desc: '500 partidas', test: s => s.plays.length >= 500, progress: s => [s.plays.length, 500] },
  { id: 'lenda', icon: 'trophy', name: 'Lenda da firma', desc: '1000 partidas', test: s => s.plays.length >= 1000, progress: s => [s.plays.length, 1000] },
  { id: 'colecionador', icon: 'blocks', name: 'Colecionador', desc: 'Jogou 15 jogos diferentes', test: s => s.games.size >= 15, progress: s => [s.games.size, 15] },
  { id: 'imperador', icon: 'landmark', name: 'Imperador', desc: 'Recorde geral em 10 jogos', test: s => s.firsts >= 10, progress: s => [s.firsts, 10] },
  { id: 'podio15', icon: 'medal', name: 'Pódio master', desc: 'Top 3 geral em 15 jogos', test: s => s.podiums >= 15, progress: s => [s.podiums, 15] },
  { id: 'dez', icon: 'party-popper', name: 'Dez desafios', desc: 'Ganhou 10 desafios do dia', test: s => s.dailyWins >= 10, progress: s => [s.dailyWins, 10] },
  { id: 'dobradinha', icon: 'zap', name: 'Dobradinha', desc: 'Ganhou o desafio do dia 2 dias seguidos', test: s => s.dailyStreak >= 2, progress: s => [s.dailyStreak, 2] },
  { id: 'bimes', icon: 'calendar', name: 'Bicampeão', desc: 'Foi campeão do mês 2 vezes', test: s => s.monthsWon.length >= 2, progress: s => [s.monthsWon.length, 2] },
  { id: 'const10', icon: 'flame', name: 'Imparável', desc: 'Jogou 10 dias úteis seguidos', test: s => s.streak >= 10, progress: s => [s.streak, 10] },
  { id: 'frequentador', icon: 'house', name: 'Frequentador', desc: 'Jogou em 20 dias diferentes', test: s => s.daysPlayed >= 20, progress: s => [s.daysPlayed, 20] },
  { id: 'fds', icon: 'sparkles', name: 'Sem folga', desc: 'Jogou num fim de semana', test: s => s.weekend },
  { id: 'almoco', icon: 'clock', name: 'Hora do almoço', desc: 'Jogou entre 12h e 14h', test: s => s.lunch },
  { id: 'coruja', icon: 'eye', name: 'Coruja', desc: 'Jogou depois das 22h', test: s => s.night },
  { id: 'maratonadia', icon: 'hourglass', name: 'Dia de maratona', desc: '30 partidas num só dia', test: s => s.maxInDay >= 30, progress: s => [s.maxInDay, 30] },
  { id: 'sudoku1', icon: 'grid-3x3', name: 'Mente afiada', desc: 'Resolveu um Sudoku', test: s => s.games.has('sudoku') },
  { id: 'sudoku10', icon: 'brain', name: 'Mestre do Sudoku', desc: 'Resolveu um Sudoku em até 10 minutos', test: s => { const b = s.best('sudoku'); return b !== null && b <= 600; } },
  { id: 'cobra', icon: 'worm', name: 'Cobra criada', desc: '30 pontos na Cobrinha', test: s => (s.best('snake') || 0) >= 30, progress: s => [s.best('snake') || 0, 30] },
  { id: 'gatilho', icon: 'target', name: 'Gatilho rápido', desc: 'Reflexo em até 220 ms', test: s => { const b = s.best('reflexo'); return b !== null && b <= 220; } },
];
const unlockedFor = name => { const s = statsFor(name); return new Set(ACHIEVEMENTS.filter(a => a.test(s)).map(a => a.id)); };

function achievementsHtml(s) {
  return '<div class="ach-grid">' + ACHIEVEMENTS.map(a => {
    const on = a.test(s), [v, max] = a.progress?.(s) || [];
    return `<div class="ach ${on ? 'on' : ''}" title="${a.desc}">
      <span class="ic">${icon(on ? a.icon : 'lock')}</span>
      <span><b>${a.name}</b><small>${a.desc}${!on && max ? ` · ${Math.min(v, max)}/${max}` : ''}</small></span>
    </div>`;
  }).join('') + '</div>';
}

function showProfile(name = player) {
  if (!name) return;
  stop();
  currentView = 'profile';
  setTimeout(pingSession, 0);
  swap(() => {
    main.classList.remove('game-view');
    main.innerHTML = `<div class="admin profile">
      <div class="stage-head">
        <button class="btn ghost icon-btn back" id="back" aria-label="Voltar ao menu">${icon('arrow-left')}</button>
        <div class="title"><h2>${icon('user')} ${esc(name)}</h2><p>${name === player ? 'Seu perfil' : 'Perfil'} — recordes, posições e conquistas.</p></div>
      </div>
      <div id="prof"><p class="hint" style="text-align:left">Carregando...</p></div>
    </div>`;
    $('#back').onclick = showMenu;
    renderProfile(name);
    fetchScores().then(() => currentView === 'profile' && renderProfile(name));
  });
}

function renderProfile(name) {
  const box = $('#prof');
  if (!box) return;
  const s = statsFor(name);
  if (!s.plays.length) { box.innerHTML = '<section class="glass"><p class="hint" style="text-align:left">Ainda não jogou nenhuma partida.</p></section>'; return; }
  const MONTH = { since: monthStart() };
  const unlocked = ACHIEVEMENTS.filter(a => a.test(s)).length;
  const kpis = `<div class="kpis">
    <div class="kpi glass"><div class="l">Partidas</div><div class="v">${s.plays.length}</div><span class="d">desde ${new Date(s.plays[0].date).toLocaleDateString('pt-BR')}</span></div>
    <div class="kpi glass"><div class="l">Recordes gerais</div><div class="v">${s.firsts}</div><span class="d">${s.podiums} no pódio</span></div>
    <div class="kpi glass"><div class="l">Desafios do dia ganhos</div><div class="v">${s.dailyWins}</div>${dailyStreakOf(name) > 1 ? `<span class="d">${icon('flame')} ${dailyStreakOf(name)} seguidas agora</span>` : ''}${s.monthsWon.length ? `<span class="d">${icon('calendar')} campeão de ${s.monthsWon.map(k => monthName(k)).join(', ')}</span>` : ''}</div>
    <div class="kpi glass"><div class="l">Conquistas</div><div class="v">${unlocked}/${ACHIEVEMENTS.length}</div></div>
  </div>`;
  // partidas por semana (últimas 12): 1 série, 1 cor, rótulo só no maior
  const weekMs = 7 * DAY_MS, now = Date.now();
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = now - (11 - i) * weekMs, start = end - weekMs;
    return { start, v: s.plays.filter(p => p.date > start && p.date <= end).length };
  });
  const wmax = Math.max(1, ...weeks.map(w => w.v)), nice = wmax <= 4 ? wmax : Math.ceil(wmax / 4) * 4, top = weeks.findIndex(w => w.v === wmax);
  const label = w => new Date(w.start + DAY_MS).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const chart = `<section class="glass report" style="margin-top:var(--space-md);padding:var(--space-md)"><h2>Partidas por semana</h2>
    <div class="cols" role="img" aria-label="Partidas por semana nas últimas 12 semanas">
      ${[nice, nice / 2].map(v => `<div class="grid" style="bottom:${(v / nice) * 100}%"><span>${Number.isInteger(v) ? v : v.toFixed(1)}</span></div>`).join('')}
      ${weeks.map((w, i) => `<div class="c" tabindex="0" data-tip="semana de ${label(w)}: ${w.v} partida${w.v === 1 ? '' : 's'}">
        <i style="height:${(w.v / nice) * 100}%"></i>${i === top && w.v ? `<b style="bottom:${(w.v / nice) * 100}%">${w.v}</b>` : ''}</div>`).join('')}
    </div>
    <div class="xlabels">${weeks.map((w, i) => `<span>${i % 3 === 0 || i === 11 ? label(w) : ''}</span>`).join('')}</div>
  </section>`;
  const rows = menuOrder().map(([id, g]) => {
    const mine = s.plays.filter(p => p.id === id);
    if (!mine.length) return `<tr class="dim"><td>${icon(g.icon)} ${g.name}</td><td colspan="4" class="hint">não jogou ainda</td></tr>`;
    const best = mine.reduce((b, p) => (better(g, p.score, b) ? p.score : b), mine[0].score);
    const pos = s.rankIn(id), posM = s.rankIn(id, MONTH), medal = p => (p ? rankBadge(p) : '—');
    return `<tr><td>${icon(g.icon)} ${g.name}</td><td><b>${fmt(g, best)}</b></td><td>${medal(pos)}</td><td>${medal(posM)}</td><td>${mine.length}</td></tr>`;
  }).join('');
  box.innerHTML = kpis
    + `<section class="glass" style="margin-top:var(--space-md)"><h2>${icon('award')} Conquistas</h2>${achievementsHtml(s)}</section>`
    + (name === player && me ? framesHtml(s) : '')
    + chart
    + `<section class="glass" style="margin-top:var(--space-md)"><h2>Recordes</h2>
      <table class="tickets users prof-table"><thead><tr><th>Jogo</th><th>Melhor</th><th>Geral</th><th>${monthName(monthKey(now))}</th><th>Partidas</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  bindVizTips(box);
  if (name === player && me) bindFrames(name);
}

// nomes nos rankings abrem o perfil
document.addEventListener('click', e => {
  const el = e.target.closest('[data-profile]');
  if (!el) return;
  e.preventDefault();
  showProfile(el.dataset.profile);
});
