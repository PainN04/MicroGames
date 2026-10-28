// ---------- prêmios do desafio do dia ----------
// Quem ganhou o desafio de ontem: coroa ao lado do nome durante o dia, aviso de parabéns com confete, o direito de
// escolher o jogo de amanhã, e molduras de avatar (bronze, prata, ouro, diamante) por vitórias. Tudo sai das partidas;
// só a escolha do jogo e a moldura escolhida ficam no servidor (flair.picks / flair.frames, vindos de /api/flair).
// Aqui também ficam o avatar pré-pronto e o título que cada um escolhe (flair.avatars / flair.titles).
const FRAME_DEFS = [['bronze', 'Bronze', 1], ['silver', 'Prata', 3], ['gold', 'Ouro', 7], ['diamond', 'Diamante', 15]];
// molduras liberadas por conquista (a mesma lista fica em lib/flair.js, ACH_FRAMES)
const ACH_FRAME_DEFS = [['fogo', 'Fogo', 'const10'], ['neon', 'Neon', 'maratona'], ['esmeralda', 'Esmeralda', 'podio'],
  ['arcoiris', 'Arco-íris', 'completo'], ['real', 'Real', 'imperio'],
  // jogos diários: campeão do Ranking de hoje e sequência de dias jogando
  ['aurora', 'Aurora', 'campdiario'], ['brasa', 'Brasa', 'diario7']];

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
// campeão dos jogos diários de ontem (1º do Ranking de hoje quando o dia acabou): selo ao lado do nome durante o dia
const isDailyTabChamp = name => !!name && dailyTabChampOf(dayIndex() - 1)?.name === name;

/** Nome clicável (abre o perfil), com a cor da moldura e a coroa de quem ganhou ontem. `extra` entra dentro do link. */
function nameHtml(n, { cls = '', extra = '' } = {}) {
  const fr = flair.frames[n];
  return `<a href="#" class="nm ${cls}${fr ? ' fr-' + fr : ''}" data-profile="${esc(n)}">${avatarHtml(flair.avatars?.[n])}<span class="nm-t">${esc(n)}</span>${isCrowned(n) ? ` <span class="crown" title="Ganhou o desafio de ontem">${icon('crown')}</span>` : ''}${isDailyTabChamp(n) ? ` <span class="dt-seal" title="Campeão dos jogos diários de ontem">${icon('calendar')}</span>` : ''}${monthBadge(n)}${extra}</a>`;
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
  const a = parseAvatar(me?.avatar);
  av.innerHTML = a ? avatarImg(a) : icon('user');
  av.classList.toggle('has-pa', !!a);
  av.style.setProperty('--h', a ? a.hue : '');
  av.classList.toggle('crowned', !!me && isCrowned(me.name));
}

// ----- campeões dos últimos dias (aba "Desafio do dia" da janela Rankings) -----
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
  return rows.length ? `<div class="champs"><h3>${icon('crown')} Últimos campeões${streak > 1 ? ` <small class="streak">${icon('flame')} ${esc(crownHolder())} · ${streak} seguidas</small>` : ''}</h3>
    <ol>${rows.join('')}</ol></div>` : '';
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
      modal(`<h2>${icon('circle-check')} Combinado!</h2><p>Amanhã o desafio do dia é <b>${GAMES[pick.game].name}</b>, escolha sua.</p><button class="btn" data-ok>Ok</button>`);
    } catch (err) { el.querySelector('#pickErr').textContent = err.message; }
  });
}

// ----- parabéns com confete (uma vez por dia, pra quem ganhou ontem) -----
// campeão dos jogos diários de ontem: parabéns uma vez (no dia seguinte), com confete
function maybeDailyTabCongrats() {
  if (localMode || !me || me.mustChange || !isDailyTabChamp(me.name)) return;
  if (document.querySelector('.modal')) return; // já tem outro aviso aberto (ex.: ganhou o desafio do dia também): fica pra próxima volta ao menu
  const key = String(dayIndex());
  try { if (localStorage.getItem('mg_dtcongrats') === key) return; localStorage.setItem('mg_dtcongrats', key); } catch {}
  const champ = dailyTabChampOf(dayIndex() - 1), wins = dailyTabRecord(me.name).wins;
  const colors = ['#5ff0ac', '#4dc3ff', '#b79bff', '#ffd34d', '#ff8a5c'];
  const confetti = Array.from({ length: 36 }, () => `<i style="--x:${rand(0, 100)}%;--d:${(rand(0, 18) / 10 + 1.6).toFixed(1)}s;--l:${(rand(0, 12) / 10).toFixed(1)}s;--c:${colors[rand(0, 4)]};--r:${rand(-40, 40)}deg"></i>`).join('');
  const { el, close } = modal(`<div class="confetti" aria-hidden="true">${confetti}</div>
    <h2>${icon('calendar')} Você ganhou os jogos diários de ontem!</h2>
    <p><b>${champ.pts.toLocaleString('pt-BR')}</b> pontos em ${champ.games} jogo${champ.games > 1 ? 's' : ''}${wins > 1 ? ` · ${wins}ª vez campeão` : ''}.</p>
    <p>Hoje o selo verde fica ao lado do seu nome, e a moldura Aurora está liberada no seu perfil.</p>
    <button class="btn" id="dtcOk">Valeu!</button>`);
  sfx.good?.();
  el.querySelector('#dtcOk').onclick = close;
}
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
  return `<section class="glass"><h2>${icon('sparkles')} Molduras de avatar</h2>
    <p class="note">As quatro primeiras liberam com desafios do dia ganhos, as outras com conquistas. A moldura aparece no seu avatar e dá cor ao seu nome nos rankings. Você tem ${wins} vitória${wins === 1 ? '' : 's'}.</p>
    <div class="frame-list">${FRAME_DEFS.map(([k, label, need]) => {
      const on = wins >= need, using = me?.frame === k;
      return `<button class="frame fr-${k}${using ? ' using' : ''}" data-frame="${k}" ${on ? '' : 'disabled'}><span class="demo" data-frame="${k}">${icon(on ? 'user' : 'lock')}</span>
        <b>${label}</b><small>${using ? 'em uso' : on ? 'usar' : `${need} vitória${need > 1 ? 's' : ''}`}</small></button>`;
    }).join('')}${ACH_FRAME_DEFS.map(([k, label, ach]) => {
      const a = ACHIEVEMENTS.find(x => x.id === ach), on = a.test(s), using = me?.frame === k;
      return `<button class="frame fr-${k}${using ? ' using' : ''}" data-frame="${k}" ${on ? '' : 'disabled'} title="${on ? label : `Libera com a conquista “${a.name}”`}"><span class="demo" data-frame="${k}">${icon(on ? 'user' : 'lock')}</span>
        <b>${label}</b><small>${using ? 'em uso' : on ? 'usar' : a.name}</small></button>`;
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

// ----- avatar pré-pronto e título (perfil) -----
const avatarImg = a => `<img src="img/avatars/${a.id}.svg" alt="" loading="lazy" decoding="async">`;
/** Bolinha com o avatar escolhido ("id:cor"); '' se não escolheu nenhum. */
function avatarHtml(v, cls = '') {
  const a = parseAvatar(v);
  return a ? `<span class="pa${cls ? ' ' + cls : ''}" style="--h:${a.hue}" aria-hidden="true">${avatarImg(a)}</span>` : '';
}
/** Título que essa pessoa escolheu, se ela ainda tem a conquista: o item de ACHIEVEMENTS ou null. */
function titleOf(name, s) {
  const a = ACHIEVEMENTS.find(x => x.id === flair.titles?.[name]);
  return a && a.test(s) ? a : null;
}
let lookHue = null; // cor escolhida antes de escolher o avatar
// aba do "Personalizar" no perfil
const LOOK_TABS = [['avatar', 'smile', 'Avatar'], ['molduras', 'sparkles', 'Molduras'], ['destaques', 'star', 'Título e vitrine'], ['cor', 'palette', 'Cor do app']];
let lookTab = 'avatar';
function lookHtml(s) {
  const tabs = `<div class="seg view-tabs sub" role="tablist" aria-label="Personalizar">${LOOK_TABS.map(([k, ic, l]) =>
    `<button role="tab" data-look="${k}" aria-selected="${lookTab === k}">${icon(ic)} ${l}</button>`).join('')}</div>`;
  const body = lookTab === 'molduras' ? framesHtml(s) : lookTab === 'destaques' ? lookHighlightsHtml(s) : lookTab === 'cor' ? lookThemeHtml() : lookAvatarHtml(s);
  return tabs + body;
}
function lookAvatarHtml(s) {
  const cur = parseAvatar(me?.avatar), hue = lookHue ?? cur?.hue ?? AVATAR_HUES[0];
  const achOf = id => ACHIEVEMENTS.find(a => a.id === id);
  const achBtn = a => {
    const ok = !a.ach || achOf(a.ach)?.test(s);
    return avtBtn(a, hue, cur, ok, ok ? a.name : achOf(a.ach).name, `Libera com a conquista “${achOf(a.ach)?.name}”`);
  };
  return `<section class="glass"><h2>${icon('smile')} Avatar</h2>
    <p class="note">O avatar aparece no topo, no perfil e ao lado do seu nome nos rankings. Os com cadeado liberam com conquistas.</p>
    <div class="hue-list" aria-label="Cor do fundo">${AVATAR_HUES.map(h => `<button class="hue${h === hue ? ' on' : ''}" data-hue="${h}" style="--h:${h}" aria-label="Cor de fundo" aria-pressed="${h === hue}"></button>`).join('')}</div>
    <h3 class="avt-sub">${icon('user')} Personagens</h3>
    <div class="avatar-list">${AVATARS.filter(a => !a.id.startsWith('i-')).map(achBtn).join('')}<button class="avt${cur ? '' : ' using'}" data-avatar=""><span class="pa big none">${icon('user')}</span><small>Nenhum</small></button></div>
    <h3 class="avt-sub">${icon('sparkles')} Ícones</h3>
    <div class="avatar-list">${AVATARS.filter(a => a.id.startsWith('i-')).map(achBtn).join('')}</div>
    <h3 class="avt-sub">${icon('gamepad-2')} Jogos <small>jogue uma partida pra liberar o do jogo</small></h3>
    <div class="avatar-list">${menuOrder().map(([id, g]) => avtBtn({ id: 'jogo-' + id, game: id }, hue, cur, s.games.has(id), g.name, `Jogue ${g.name} pra liberar`)).join('')}</div></section>`;
}
function lookHighlightsHtml(s) {
  const titles = ACHIEVEMENTS.filter(a => a.test(s));
  const sc = me?.showcase || {};
  return `<section class="glass"><h2>${icon('star')} Título e vitrine</h2>
    <h3 class="avt-sub">${icon('award')} Título <small>uma conquista sua, junto do nome no perfil</small></h3>
    <select class="title-sel" id="titlePick"><option value="">Sem título</option>${titles.map(a => `<option value="${a.id}"${me?.title === a.id ? ' selected' : ''}>${a.name}</option>`).join('')}</select>
    <h3 class="avt-sub">${icon('star')} Vitrine <small>até 3 conquistas e o jogo do coração, em destaque no seu perfil</small></h3>
    <div class="showcase-pick">${[0, 1, 2].map(i => `<select class="scAch" aria-label="Conquista ${i + 1}"><option value="">—</option>${titles.map(a => `<option value="${a.id}"${sc.ach?.[i] === a.id ? ' selected' : ''}>${a.name}</option>`).join('')}</select>`).join('')}
      <select id="scGame" aria-label="Jogo do coração"><option value="">Jogo do coração: nenhum</option>${menuOrder().map(([id, g]) => `<option value="${id}"${sc.game === id ? ' selected' : ''}>${g.name}</option>`).join('')}</select></div>
    <h3 class="avt-sub">${icon('pencil')} Frase <small>até 60 letras, embaixo do seu nome no perfil</small></h3>
    <form class="bio-pick" id="bioForm"><input class="txt" id="bioInput" maxlength="60" placeholder="Ex.: rei do Sudoku nas horas vagas" value="${esc(me?.bio || '')}"><button class="btn ghost" type="submit">Salvar</button></form></section>`;
}
function lookThemeHtml() {
  return `<section class="glass"><h2>${icon('palette')} Cor do app</h2>
    <p class="note">Muda a cor de destaque do site. Fica salva só neste navegador.</p>
    <div class="theme-list">${THEMES.map(([k, label, h1, h2]) => `<button class="theme${k === themeNow() ? ' on' : ''}" data-theme="${k}" style="--t1:oklch(70% 0.19 ${h1});--t2:oklch(74% 0.17 ${h2})" aria-pressed="${k === themeNow()}"><i></i>${label}</button>`).join('')}</div></section>`;
}
function avtBtn(a, hue, cur, ok, label, lockedTip) {
  return `<button class="avt${cur?.id === a.id ? ' using' : ''}" data-avatar="${a.id}" ${ok ? '' : 'disabled'} title="${ok ? label : lockedTip}">
    <span class="pa big" style="--h:${hue}">${ok ? avatarImg(a) : icon('lock')}</span><small>${label}</small></button>`;
}
async function saveLook(body, name) {
  try {
    const r = await api('api/profile/look', { method: 'POST', body });
    me = { ...me, ...r };
    for (const [k, map] of [['avatar', 'avatars'], ['title', 'titles'], ['showcase', 'showcases'], ['bio', 'bios']]) {
      flair[map] ||= {};
      if (r[k]) flair[map][me.name] = r[k]; else delete flair[map][me.name];
    }
    try { localStorage.setItem('mg_flair', JSON.stringify(flair)); } catch {}
    applyMeFlair();
    renderProfile(name);
  } catch (err) { alert(err.message); }
}
function bindLook(name) {
  document.querySelectorAll('[data-look]').forEach(b => b.onclick = () => { lookTab = b.dataset.look; renderProfile(name); });
  bindFrames(name);
  const cur = () => parseAvatar(me?.avatar);
  document.querySelectorAll('.hue-list .hue').forEach(b => b.onclick = () => {
    lookHue = Number(b.dataset.hue);
    if (cur()) saveLook({ avatar: `${cur().id}:${lookHue}` }, name); else renderProfile(name);
  });
  document.querySelectorAll('.avatar-list .avt').forEach(b => b.onclick = () => {
    const id = b.dataset.avatar, hue = lookHue ?? cur()?.hue ?? AVATAR_HUES[0];
    saveLook({ avatar: id ? `${id}:${hue}` : null }, name);
  });
  $('#titlePick')?.addEventListener('change', e => saveLook({ title: e.target.value || null }, name));
  const saveShowcase = () => saveLook({ showcase: { ach: [...document.querySelectorAll('.scAch')].map(x => x.value).filter(Boolean), game: $('#scGame').value || null } }, name);
  document.querySelectorAll('.scAch').forEach(x => x.onchange = saveShowcase);
  $('#scGame') && ($('#scGame').onchange = saveShowcase);
  $('#bioForm') && ($('#bioForm').onsubmit = e => { e.preventDefault(); saveLook({ bio: $('#bioInput').value }, name); });
  document.querySelectorAll('.theme-list .theme').forEach(b => b.onclick = () => { setTheme(b.dataset.theme); renderProfile(name); });
}

// ----- vitrine e frase (perfil de qualquer pessoa) -----
function showcaseHtml(name, s) {
  const sc = flair.showcases?.[name];
  const achs = (sc?.ach || []).map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(a => a && a.test(s));
  const g = sc?.game && GAMES[sc.game];
  if (!achs.length && !g) return '';
  const best = g && s.best(sc.game);
  return `<section class="glass showcase" style="margin-top:var(--space-md)"><h2>${icon('star')} Vitrine</h2><div class="showcase-row">
    ${g ? `<div class="sc-game" style="--h:${g.hue}"><span class="ic">${icon(g.icon)}</span><span><small>${icon('heart')} Jogo do coração</small><b>${g.name}</b>${best !== null ? `<small>melhor: ${fmt(g, best)}</small>` : ''}</span></div>` : ''}
    ${achs.map(a => `<div class="ach on" title="${a.desc}"><span class="ic">${icon(a.icon)}</span><span><b>${a.name}</b><small>${a.desc}</small></span></div>`).join('')}
  </div></section>`;
}
function bioHtml(name) {
  const bio = flair.bios?.[name];
  if (!bio) return '';
  const canDel = me?.role === 'admin' && name !== player;
  return `“${esc(bio)}”${canDel ? ` <button class="link-btn" id="bioDel" title="Apagar a frase dessa pessoa">${icon('trash-2')} apagar</button>` : ''}`;
}
function bindBioDel(name) {
  $('#bioDel') && ($('#bioDel').onclick = async () => {
    if (!confirm(`Apagar a frase do perfil de ${name}?`)) return;
    try {
      await api('api/admin/bio', { method: 'POST', body: { name } });
      delete flair.bios[name];
      renderProfile(name);
    } catch (err) { alert(err.message); }
  });
}

// ----- cor de destaque do app (só neste navegador) -----
const THEMES = [['roxo', 'Roxo', 290, 35], ['oceano', 'Oceano', 235, 190], ['floresta', 'Floresta', 150, 95], ['por-do-sol', 'Pôr do sol', 25, 70],
  ['rosa', 'Rosa', 350, 300], ['ciano', 'Ciano', 200, 150], ['ouro', 'Ouro', 85, 40], ['vermelho', 'Vermelho', 20, 350]];
function themeNow() { try { return localStorage.getItem('mg_theme') || 'roxo'; } catch { return 'roxo'; } }
function applyTheme(k = themeNow()) {
  const t = THEMES.find(x => x[0] === k) || THEMES[0], root = document.documentElement.style;
  if (t[0] === 'roxo') { root.removeProperty('--primary'); root.removeProperty('--accent'); return; }
  root.setProperty('--primary', `oklch(70% 0.19 ${t[2]})`);
  root.setProperty('--accent', `oklch(74% 0.17 ${t[3]})`);
}
function setTheme(k) { try { localStorage.setItem('mg_theme', k); } catch {} applyTheme(k); }
applyTheme();
