// Equação: o Termo com números. Descubra a conta do dia (8 símbolos, tipo 12+35=47) em 6 tentativas. Cada palpite
// tem que ser uma conta certa; o servidor (lib/diarios.js) confere e devolve as cores. × e ÷ valem antes de + e −.
GAMES.equacao = {
  name: 'Equação', icon: 'equacao', hue: 160, daily: true,
  desc: 'Descubra a conta do dia em 6 tentativas. Cada palpite tem 8 símbolos e precisa ser uma conta certa (tipo 12+35=47). Verde: lugar certo; amarelo: está na conta em outro lugar. Uma partida por dia.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    if (needsServer(el)) return;
    const LEN = 8, ROWS = 6, SHOW = { '*': '×', '/': '÷', '-': '−' }, EMOJI = { g: '🟩', y: '🟨', x: '⬛' };
    const show = ch => SHOW[ch] || ch;
    let v = null, cur = '', busy = true, alive = true, saved = 'ok', timers = [];
    el.innerHTML = `<div class="hud"><span class="stat">Tentativa<b id="en">1/${ROWS}</b></span></div>
      <div class="tm eq" id="eb">${Array.from({ length: ROWS * LEN }, () => '<div class="tm-t"></div>').join('')}</div>
      <p class="hint" id="emsg" aria-live="polite"></p>
      <div class="tm-kb eq-kb" id="kb">${['1234567890', '+-*/=↵⌫'].map(r => `<div>${[...r].map(k => `<button class="tm-k${k === '↵' || k === '⌫' ? ' wide' : ''}" data-k="${k}" ${k === '↵' ? 'aria-label="Enviar"' : k === '⌫' ? 'aria-label="Apagar"' : ''}>${k === '↵' ? 'Enviar' : show(k)}</button>`).join('')}</div>`).join('')}</div>
      <div class="row-btns" id="eend" hidden></div>`;
    const tiles = [...el.querySelectorAll('#eb .tm-t')], msg = el.querySelector('#emsg'), say = t => { msg.textContent = t; };
    const paintRow = (r, animate) => {
      const g = v.guesses[r];
      for (let i = 0; i < LEN; i++) {
        const t = tiles[r * LEN + i];
        t.textContent = show(g.guess[i]); t.classList.remove('on');
        if (animate) { t.style.setProperty('--d', i * 0.12 + 's'); t.classList.add('flip'); timers.push(setTimeout(() => t.classList.add(g.res[i]), i * 120 + 250)); }
        else t.classList.add(g.res[i]);
      }
    };
    const paintKeys = () => {
      const rank = { x: 1, y: 2, g: 3 }, best = {};
      v.guesses.forEach(g => [...g.guess].forEach((ch, i) => { if (!best[ch] || rank[g.res[i]] > rank[best[ch]]) best[ch] = g.res[i]; }));
      el.querySelectorAll('.tm-k').forEach(k => { k.classList.remove('g', 'y', 'x'); if (best[k.dataset.k]) k.classList.add(best[k.dataset.k]); });
    };
    const showCur = () => {
      const r = v.guesses.length;
      for (let i = 0; i < LEN; i++) { const t = tiles[r * LEN + i]; if (!t) return; t.textContent = cur[i] ? show(cur[i]) : ''; t.classList.toggle('on', !!cur[i]); }
    };
    const hud = () => { el.querySelector('#en').textContent = `${Math.min(v.guesses.length + (v.over ? 0 : 1), ROWS)}/${ROWS}`; };
    const endPanel = () => {
      el.querySelector('#kb').hidden = true;
      const box = el.querySelector('#eend');
      box.hidden = false;
      box.innerHTML = `<p class="eq-ans">A conta era <b>${[...v.answer].map(show).join('')}</b></p><button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
      const share = () => `Equação MicroGame ${v.won ? v.guesses.length : 'X'}/${ROWS}\n` + v.guesses.map(g => g.res.map(c => EMOJI[c]).join('')).join('\n');
      box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(share()); say('Resultado copiado!'); } catch { say(share().replace(/\n/g, ' ')); } };
      say(v.won ? `Acertou em ${v.guesses.length}/${ROWS}: ${v.score} pontos.` : 'Não foi dessa vez. Volte amanhã pra outra conta!');
    };
    say('Carregando...');
    api('api/diarios/equacao').then(nv => {
      if (!alive) return;
      v = nv; busy = false; say('');
      v.guesses.forEach((_, r) => paintRow(r, false)); paintKeys(); hud();
      if (v.over) endPanel(); else showCur();
    }).catch(err => { if (alive) say(err.message); });

    const shake = () => {
      const r = v.guesses.length;
      tiles.slice(r * LEN, r * LEN + LEN).forEach(t => { t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope'); });
      beep(160, 100, 'square', 0.03);
    };
    const submit = async () => {
      if (busy || !v || v.over) return;
      if (cur.length < LEN) { say('Use os 8 espaços'); shake(); return; }
      busy = true;
      let nv;
      try { nv = await api('api/diarios/equacao', { method: 'POST', body: { guess: cur } }); }
      catch (err) { if (!alive) return; busy = false; say(err.message); shake(); return; }
      if (!alive) return;
      v = nv; cur = ''; if (nv.saved) saved = nv.saved;
      const r = v.guesses.length - 1;
      paintRow(r, true); say(''); hud();
      timers.push(setTimeout(() => {
        paintKeys();
        if (v.won) {
          tiles.slice(r * LEN, r * LEN + LEN).forEach((t, i) => { t.style.setProperty('--d', i * 0.07 + 's'); t.classList.remove('flip'); void t.offsetWidth; t.classList.add('bounce'); });
          sfx.record(); summarize([['Tentativas', `${v.guesses.length}/${ROWS}`]]);
          timers.push(setTimeout(() => alive && done(v.score, { saved }), 1100));
        } else if (v.over) { sfx.bad(); endPanel(); }
        else { busy = false; showCur(); }
      }, LEN * 120 + 350));
    };
    const press = k => {
      if (busy || !v || v.over) return;
      if (k === '↵') return submit();
      if (k === '⌫') cur = cur.slice(0, -1);
      else if (/^[\d+\-*/=]$/.test(k) && cur.length < LEN) cur += k;
      say(''); showCur();
    };
    el.querySelectorAll('.tm-k').forEach(b => b.onclick = () => press(b.dataset.k));
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); press('↵'); }
      else if (e.key === 'Backspace') press('⌫');
      else { const k = { x: '*', X: '*', '×': '*', '÷': '/', '−': '-' }[e.key] || e.key; if (/^[\d+\-*/=]$/.test(k)) { e.preventDefault(); press(k); } }
    };
    addEventListener('keydown', onKey);
    return () => { alive = false; removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
  }
};
