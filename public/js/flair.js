// ---------- prêmios do desafio do dia ----------
// Quem ganhou o desafio de ontem: coroa ao lado do nome durante o dia, aviso de parabéns com confete, o direito de
// escolher o jogo de amanhã, e molduras de avatar (bronze, prata, ouro, diamante) por vitórias. Tudo sai das partidas;
// só a escolha do jogo e a moldura escolhida ficam no servidor (flair.picks / flair.frames, vindos de /api/flair).
const FRAME_DEFS = [['bronze', 'Bronze', 1], ['silver', 'Prata', 3], ['gold', 'Ouro', 7], ['diamond', 'Diamante', 15]];

/** Quem ganhou o desafio do dia i (e com quanto): { name, score, game } ou null se ninguém jogou. */
function dailyWinnerOf(i) {
  const game = dailyGame(i), top = bestPerPlayer(game, dayRange(i))[0];
  return top ? { name: top[0], score: top[1], game } : null;
}
/** Nome de quem ganhou o desafio de ontem (tem a coroa hoje). */
function crownHolder() {
  if (crownMemo === undefined) crownMemo = dailyWinnerOf(dayIndex() - 1)?.name || null;
  return crownMemo;
}
/** Quantos dias seguidos (até ontem) essa pessoa ganhou o desafio. */
function dailyStreakOf(name) {
  let n = 0;
  while (n < 400 && dailyWinnerOf(dayIndex() - 1 - n)?.name === name) n++;
  return n;
}
const isCrowned = name => !!name && crownHolder() === name;

/** Nome clicável (abre o perfil), com a cor da moldura e a coroa de quem ganhou ontem. `extra` entra dentro do link. */
function nameHtml(n, { cls = '', extra = '' } = {}) {
  const fr = flair.frames[n];
  return `<a href="#" class="nm ${cls}${fr ? ' fr-' + fr : ''}" data-profile="${esc(n)}">${esc(n)}${isCrowned(n) ? ` <span class="crown" title="Ganhou o desafio de ontem">${icon('crown')}</span>` : ''}${monthBadge(n)}${extra}</a>`;
}
// selo fixo de quem já foi campeão do mês (com quantas vezes, se foi mais de uma)
function monthBadge(n) {
  const won = monthsWonBy(n);
  if (!won.length) return '';
  return ` <span class="mbadge" title="Campeão do mês: ${won.map(k => monthName(k, true)).join(', ')}">${icon('medal')}${won.length > 1 ? `<small>${won.length}</small>` : ''}</span>`;
}

/** Moldura e coroa no avatar do cabeçalho (a própria pessoa). */
function applyMeFlair() {
  const av = $('#pav');
  if (!av) return;
  av.dataset.frame = me?.frame || '';
  av.classList.toggle('crowned', !!me && isCrowned(me.name));
}

// ----- campeões dos últimos dias (mural do menu) -----
const dayLabel = i => new Date(dayStart(i)).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '');
function champsHtml() {
  const rows = [];
  for (let k = 1; k <= 7; k++) {
    const w = dailyWinnerOf(dayIndex() - k);
    if (!w) continue;
    const g = GAMES[w.game];
    rows.push(`<li><span class="d">${dayLabel(dayIndex() - k)}</span><span class="g">${icon(g.icon)} ${g.name}</span><span class="w">${nameHtml(w.name)}</span><b>${fmt(g, w.score)}</b></li>`);
  }
  const streak = crownHolder() ? dailyStreakOf(crownHolder()) : 0;
  // os 3 mais recentes aparecem; o resto abre em "ver mais"
  const list = rows.map((r, i) => (i >= 3 ? r.replace('<li>', '<li class="more">') : r)).join('');
  return rows.length ? `<div class="champs-head${rows.length <= 3 ? ' few' : ''}"><h3>${icon('crown')} Últimos campeões${streak > 1 ? ` <small class="streak">${icon('flame')} ${esc(crownHolder())} · ${streak} seguidas</small>` : ''}</h3>
    ${rows.length > 1 ? '<button class="link-btn" id="champsMore" aria-expanded="false">ver mais</button>' : ''}</div><ol>${list}</ol>` : '';
}
let champsOpen = false;
/** Desenha os últimos campeões dentro do card do desafio (some se ninguém ganhou ainda). */
function renderChamps() {
  const box = $('#champs');
  if (!box) return;
  const h = champsHtml();
  box.innerHTML = h; box.hidden = !h;
  box.classList.toggle('open', champsOpen);
  const b = $('#champsMore');
  if (b) { b.textContent = champsOpen ? 'ver menos' : 'ver mais'; b.setAttribute('aria-expanded', champsOpen); b.onclick = () => { champsOpen = !champsOpen; renderChamps(); }; }
}

// ----- escolher o jogo de amanhã (só quem ganhou ontem) -----
const canPickTomorrow = () => !!me && !me.mustChange && isCrowned(me.name);
function pickRowHtml() {
  const tomorrow = dayIndex() + 1, pick = flair.picks[tomorrow];
  const chosenToday = flair.picks[dayIndex()];
  const parts = [];
  if (chosenToday?.by) parts.push(`<span class="chosen">${icon('crown')} Hoje: escolhido por <b>${esc(chosenToday.by)}</b></span>`);
  if (canPickTomorrow()) {
    parts.push(pick && GAMES[pick.game]
      ? `<button class="btn ghost" id="pickBtn">${icon('crown')} Amanhã: ${GAMES[pick.game].name} · trocar</button>`
      : `<button class="btn ghost" id="pickBtn">${icon('crown')} Escolher o jogo de amanhã</button>`);
  } else if (pick && GAMES[pick.game]) {
    parts.push(`<span class="chosen">Amanhã: ${icon(GAMES[pick.game].icon)} <b>${GAMES[pick.game].name}</b> (escolha de ${esc(pick.by)})</span>`);
  }
  return parts.join('');
}
function bindPick() { $('#pickBtn') && ($('#pickBtn').onclick = pickModal); }
function refreshPickRow() { const row = $('#pickRow'); if (row) { row.innerHTML = pickRowHtml(); bindPick(); } }

function pickModal() {
  const tomorrow = dayIndex() + 1, current = flair.picks[tomorrow]?.game || dailyGame(tomorrow);
  const { el, close } = modal(`<h2>${icon('crown')} Escolha o jogo de amanhã</h2>
    <p>Você ganhou o desafio de ontem. O jogo que escolher vira o desafio de todo mundo amanhã, com o seu nome no card.</p>
    <div class="pick-grid">${menuOrder().map(([id, g]) => `<button class="pick${id === current ? ' on' : ''}" data-id="${id}" style="--h:${g.hue}">
      <span class="ic">${icon(g.icon)}</span>${g.name}</button>`).join('')}</div>
    <p class="err" id="pickErr"></p><button class="btn ghost" id="pickClose">Fechar</button>`, { wide: true });
  el.querySelector('#pickClose').onclick = close;
  el.querySelectorAll('.pick').forEach(b => b.onclick = async () => {
    try {
      const { pick } = await api('api/daily/pick', { method: 'POST', body: { game: b.dataset.id } });
      flair.picks[tomorrow] = pick;
      try { localStorage.setItem('mg_flair', JSON.stringify(flair)); } catch {}
      close(); refreshPickRow();
      modal(`<h2>${icon('circle-check')} Combinado!</h2><p>Amanhã o desafio do dia é <b>${GAMES[pick.game].name}</b>, escolha sua.</p><button class="btn" onclick="this.closest('.modal').remove()">Ok</button>`);
    } catch (err) { el.querySelector('#pickErr').textContent = err.message; }
  });
}

// ----- parabéns com confete (uma vez por dia, pra quem ganhou ontem) -----
function maybeCongrats() {
  if (localMode || !me || me.mustChange || !isCrowned(me.name)) return;
  const key = String(dayIndex());
  try { if (localStorage.getItem('mg_congrats') === key) return; localStorage.setItem('mg_congrats', key); } catch {}
  const w = dailyWinnerOf(dayIndex() - 1), g = GAMES[w.game], streak = dailyStreakOf(me.name);
  const colors = ['#ffd34d', '#ff8a5c', '#a98bff', '#5ff0ac', '#4dc3ff', '#ff6b8a'];
  const confetti = Array.from({ length: 36 }, () => `<i style="--x:${rand(0, 100)}%;--d:${(rand(0, 18) / 10 + 1.6).toFixed(1)}s;--l:${(rand(0, 12) / 10).toFixed(1)}s;--c:${colors[rand(0, 5)]};--r:${rand(-40, 40)}deg"></i>`).join('');
  const { el, close } = modal(`<div class="confetti" aria-hidden="true">${confetti}</div>
    <h2>${icon('crown')} Você ganhou o desafio de ontem!</h2>
    <p>${g.name}: <b>${fmt(g, w.score)}</b>${streak > 1 ? ` — ${icon('flame')} <b>${streak}</b> dias seguidos como campeão` : ''}.</p>
    <p>Hoje você usa a coroa ao lado do nome e escolhe o jogo do desafio de amanhã.</p>
    <button class="btn" id="cgPick">${icon('crown')} Escolher o jogo de amanhã</button><button class="btn ghost" id="cgLater">Depois</button>`);
  sfx.good?.();
  el.querySelector('#cgLater').onclick = close;
  el.querySelector('#cgPick').onclick = () => { close(); pickModal(); };
}

// ----- molduras de avatar (perfil) -----
function framesHtml(s) {
  const wins = s.dailyWins;
  return `<section class="glass" style="margin-top:var(--space-md)"><h2>${icon('sparkles')} Molduras de avatar</h2>
    <p class="note">Ganhe desafios do dia pra liberar. A moldura aparece no seu avatar e dá cor ao seu nome nos rankings. Você tem ${wins} vitória${wins === 1 ? '' : 's'}.</p>
    <div class="frame-list">${FRAME_DEFS.map(([k, label, need]) => {
      const on = wins >= need, using = me?.frame === k;
      return `<button class="frame fr-${k}${using ? ' using' : ''}" data-frame="${k}" ${on ? '' : 'disabled'}><span class="demo" data-frame="${k}">${icon(on ? 'user' : 'lock')}</span>
        <b>${label}</b><small>${using ? 'em uso' : on ? 'usar' : `${need} vitória${need > 1 ? 's' : ''}`}</small></button>`;
    }).join('')}<button class="frame${me?.frame ? '' : ' using'}" data-frame=""><span class="demo">${icon('x')}</span><b>Sem moldura</b><small>${me?.frame ? 'tirar' : 'em uso'}</small></button></div></section>`;
}
function bindFrames(name) {
  document.querySelectorAll('.frame-list .frame').forEach(b => b.onclick = async () => {
    try {
      const { frame } = await api('api/profile/frame', { method: 'POST', body: { frame: b.dataset.frame || null } });
      me = { ...me, frame };
      if (frame) flair.frames[me.name] = frame; else delete flair.frames[me.name];
      try { localStorage.setItem('mg_flair', JSON.stringify(flair)); } catch {}
      applyMeFlair();
      renderProfile(name);
    } catch (err) { alert(err.message); }
  });
}
