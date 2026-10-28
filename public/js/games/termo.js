// Estatísticas do Termo de quem está jogando (sai das partidas guardadas neste navegador, uma chave por dia)
function termoStats(name, today) {
  const days = {};
  for (let i = 0; i < localStorage.length; i++) {
    const m = localStorage.key(i).match(/^mg_termo_(.+)_(\d+)$/);
    if (!m || m[1] !== name) continue;
    try { const st = JSON.parse(localStorage.getItem(localStorage.key(i))); if (st?.over) days[+m[2]] = st; } catch {}
  }
  const list = Object.entries(days).map(([d, st]) => [+d, st]);
  const wins = list.filter(([, st]) => st.won);
  const dist = [1, 2, 3, 4, 5, 6].map(n => wins.filter(([, st]) => st.guesses.length === n).length);
  let streak = 0;
  for (let d = days[today] ? today : today - 1; days[d]?.won; d--) streak++;
  let best = 0, run = 0;
  for (const [d, st] of list.sort((a, b) => a[0] - b[0])) { run = st.won && days[d - 1]?.won ? run + 1 : st.won ? 1 : 0; best = Math.max(best, run); }
  const top = Math.max(1, ...dist);
  return [
    ['Jogos', list.length],
    ['Vitórias', list.length ? Math.round(wins.length / list.length * 100) + '%' : '—'],
    ['Sequência', streak],
    ['Melhor sequência', best],
    ['Tentativas 1–6', `<span class="bars">${dist.map(n => `<i style="height:${4 + n / top * 30}px" title="${n}"></i>`).join('')}</span>`],
  ];
}

// Edita a linha atual do Termo (e do Dueto, Quarteto e Octeto): cells tem os quadrados ('' = vazio) e sel o escolhido.
// Tocar num quadrado escolhe onde a próxima letra entra; escrever põe a letra ali e pula pro próximo vazio.
function termoEdit({ cells, sel }, k) {
  const n = cells.length, c = cells.slice();
  if (k === '←') return { cells: c, sel: Math.max(0, sel - 1) };
  if (k === '→') return { cells: c, sel: Math.min(n - 1, sel + 1) };
  if (k === 'home') return { cells: c, sel: 0 };
  if (k === 'end') return { cells: c, sel: n - 1 };
  if (k === 'del') { c[sel] = ''; return { cells: c, sel }; }
  if (k === '⌫') {
    if (c[sel]) { c[sel] = ''; return { cells: c, sel }; }
    const p = Math.max(0, sel - 1); c[p] = ''; return { cells: c, sel: p };
  }
  if (!/^[A-Z]$/.test(k)) return { cells: c, sel };
  c[sel] = k;
  for (let d = 1; d < n; d++) { const i = (sel + d) % n; if (!c[i]) return { cells: c, sel: i }; }
  return { cells: c, sel: Math.min(n - 1, sel + 1) };
}
// Teclas do teclado físico que mexem no quadrado escolhido (setas, Home, End, Delete).
const TERMO_NAV = { ArrowLeft: '←', ArrowRight: '→', Home: 'home', End: 'end', Delete: 'del' };

GAMES.termo = {
  name: 'Termo', icon: 'termo', hue: 150, daily: true, desc: 'A palavra do dia: 5 letras, 6 tentativas, igual pra todo mundo. Verde = letra certa no lugar certo, amarelo = existe em outro lugar, cinza = não tem. Toque em qualquer quadrado da linha pra pôr a letra ali. Só vale a primeira partida de cada dia. Acertar rápido e em poucas tentativas rende mais pontos.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    // a palavra do dia fica no servidor: cada tentativa vai pra lá e volta com as cores (a palavra só aparece no fim)
    if (needsServer(el)) return;
    const ROWS = 6, LEN = 5;
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    let day = null, st = { guesses: [], over: false, won: false, score: 0 }, view = null;
    const EMOJI = { g: '🟩', y: '🟨', x: '⬛' };
    const KEY = () => `mg_termo_${player}_${day}`;
    // cópia local só pras estatísticas (sequência, distribuição) — quem manda é o servidor
    const save = () => { try { localStorage.setItem(KEY(), JSON.stringify(st)); } catch {} };
    const fromView = v => { view = v; day = v.day; st = { guesses: v.guesses.map(g => g.guess), over: v.over, won: v.won, score: v.score, sent: true }; save(); };

    let cells = Array(LEN).fill(''), sel = 0, busy = false, timers = [];
    const cur = () => cells.join('');
    const tryNo = () => (st.over ? st.guesses.length : Math.min(st.guesses.length + 1, ROWS));
    el.innerHTML = `<div class="hud"><span class="stat">Tentativa<b id="n">1/${ROWS}</b></span><span class="stat">Palavra nº<b id="dn">…</b></span></div>
      <div class="tm" id="tm" aria-live="polite">${Array.from({ length: ROWS * LEN }, () => '<div class="tm-t"></div>').join('')}</div>
      <p class="hint" id="tmsg"></p>
      <div class="tm-kb" id="kb">${['QWERTYUIOP', 'ASDFGHJKL', '↵ZXCVBNM⌫'].map(r => `<div>${[...r].map(k => `<button class="tm-k${k === '↵' || k === '⌫' ? ' wide' : ''}" data-k="${k}" ${k === '↵' ? 'aria-label="Enviar"' : k === '⌫' ? 'aria-label="Apagar"' : ''}>${k}</button>`).join('')}</div>`).join('')}</div>
      <div class="row-btns" id="tmend" hidden></div>`;
    const tiles = [...el.querySelectorAll('.tm-t')], msg = el.querySelector('#tmsg');
    const kbKey = l => el.querySelector(`.tm-k[data-k="${l}"]`);
    const say = t => { msg.textContent = t; };
    const paintRow = (r, row, animate) => {
      const guess = row.guess, res = row.res;
      for (let i = 0; i < LEN; i++) {
        const t = tiles[r * LEN + i];
        // letra certa no lugar certo mostra o acento da palavra (o servidor manda)
        t.textContent = row.letters[i];
        const apply = () => { t.classList.add(res[i]); };
        if (animate) { t.style.setProperty('--d', i * 0.22 + 's'); t.classList.add('flip'); timers.push(setTimeout(apply, i * 220 + 250)); } else apply();
        const k = kbKey(guess[i]);
        if (k) { const rank = { x: 1, y: 2, g: 3 }, was = k.dataset.s; if (!was || rank[res[i]] > rank[was]) { k.dataset.s = res[i]; if (animate) timers.push(setTimeout(() => k.classList.remove('g', 'y', 'x') || k.classList.add(res[i]), 1500)); else { k.classList.remove('g', 'y', 'x'); k.classList.add(res[i]); } } }
      }
    };
    const showCur = () => {
      const r = st.guesses.length;
      tiles.forEach(t => { t.classList.remove('sel'); t.removeAttribute('role'); t.removeAttribute('aria-label'); });
      if (st.over) return;
      for (let i = 0; i < LEN; i++) {
        const t = tiles[r * LEN + i]; if (!t) return;
        t.textContent = cells[i]; t.classList.toggle('on', !!cells[i]); t.classList.toggle('sel', i === sel);
        t.setAttribute('role', 'button'); t.setAttribute('aria-label', `Quadrado ${i + 1}${cells[i] ? ': ' + cells[i] : ', vazio'}`);
      }
    };
    const shareText = () => `Termo MicroGame ${st.won ? st.guesses.length : 'X'}/${ROWS}\n` + view.guesses.map(g => g.res.map(c => EMOJI[c]).join('')).join('\n');
    const endPanel = () => {
      const box = el.querySelector('#tmend');
      el.querySelector('#kb').hidden = true;
      box.hidden = false;
      box.innerHTML = `<dl class="part-sum">${termoStats(player, day).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
      say(st.won ? `Você acertou em ${st.guesses.length}/${ROWS}: ${st.score} pontos. Volte amanhã pra uma palavra nova!` : `A palavra era ${view.word}. Volte amanhã pra uma palavra nova!`);
      box.querySelector('#shr').onclick = async () => {
        try { await navigator.clipboard.writeText(shareText()); say('Resultado copiado!'); } catch { say(shareText().replace(/\n/g, ' · ')); }
      };
    };

    let alive = true, saved = 'ok';
    const send = () => { summarize(termoStats(player, day)); done(st.score, { saved }); };
    // estado de hoje vem do servidor (voltou ao jogo, recarregou, ou jogou em outro aparelho)
    const paintAll = () => {
      view.guesses.forEach((g, r) => paintRow(r, g, false));
      el.querySelector('#n').textContent = tryNo() + '/' + ROWS;
      el.querySelector('#dn').textContent = day % 1000;
    };
    busy = true;
    say('Carregando...');
    api('api/termo').then(v => {
      if (!alive) return;
      fromView(v); paintAll(); say(''); busy = false;
      if (st.over) endPanel(); else showCur();
    }).catch(err => { if (alive) say(err.message); });

    const submit = async () => {
      if (busy) return;
      if (cells.some(c => !c)) { say('Faltam letras'); shake(); return; }
      const guess = cur();
      busy = true;
      let v;
      try { v = await api('api/termo/guess', { method: 'POST', body: { guess } }); }
      catch (err) { if (!alive) return; busy = false; say(err.message); if (err.status === 422 || err.status === 400) shake(); return; }
      if (!alive) return;
      const r = st.guesses.length;
      fromView(v); cells = Array(LEN).fill(''); sel = 0; showCur();
      if (v.saved) saved = v.saved;
      paintRow(r, v.guesses[r], true);
      say('');
      timers.push(setTimeout(() => {
        el.querySelector('#n').textContent = tryNo() + '/' + ROWS;
        if (st.won) {
          sfx.record();
          // a linha certa pula, uma letra de cada vez
          tiles.slice(r * LEN, r * LEN + LEN).forEach((t, i) => { t.style.setProperty('--d', i * 0.09 + 's'); t.classList.remove('flip'); void t.offsetWidth; t.classList.add('bounce'); });
          timers.push(setTimeout(send, 900));
        }
        else if (st.over) { sfx.bad(); endPanel(); }
        else { busy = false; showCur(); }
      }, LEN * 220 + 350));
    };
    const shake = () => { const row = tiles.slice(st.guesses.length * LEN, st.guesses.length * LEN + LEN); row.forEach(t => { t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope'); }); beep(160, 100, 'square', 0.03); };
    const press = k => {
      if (busy || st.over) return;
      if (k === '↵') return submit();
      ({ cells, sel } = termoEdit({ cells, sel }, k));
      say(''); showCur();
    };
    el.querySelectorAll('.tm-k').forEach(b => b.onclick = () => press(b.dataset.k));
    // tocar num quadrado da linha atual escolhe onde a próxima letra entra
    el.querySelector('#tm').onclick = e => {
      if (busy || st.over) return;
      const i = tiles.indexOf(e.target.closest('.tm-t')) - st.guesses.length * LEN;
      if (i >= 0 && i < LEN) { sel = i; showCur(); }
    };
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); press('↵'); }
      else if (e.key === 'Backspace') press('⌫');
      else if (TERMO_NAV[e.key]) { e.preventDefault(); press(TERMO_NAV[e.key]); }
      else { const l = norm(e.key); if (l.length === 1 && /[A-Z]/.test(l)) press(l); }
    };
    addEventListener('keydown', onKey);
    return () => { alive = false; removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
  }
};
