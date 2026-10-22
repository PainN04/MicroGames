GAMES.forca = {
  name: 'Forca', icon: 'forca', hue: 20, desc: 'Descubra a palavra de TI ou do escritório antes de errar 6 letras. Os erros continuam na próxima palavra: cada acerto tira só um. Letra do teclado ou toque nas letras. Errou 6, acabou.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    // as palavras ficam no servidor (lib/words.js): a página só recebe a dica e as letras já descobertas
    if (needsServer(el)) return;
    const MAX = 6, ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    let round = null, mask = [], guessed = new Set(), wrong = 0, pts = 0, solved = 0, locked = true, timers = [], alive = true, lost = false;
    // forca desenhada em SVG: cada erro mostra mais uma parte do boneco
    // boneco colorido (cabeça, camiseta, braços, calça) e um rosto que muda de humor conforme os erros
    const SKIN = 'fill:#f4cba8;stroke:#7a4d2c;stroke-width:3', ARM = 'stroke:#e8b48f;stroke-width:6', LEG = 'stroke:#3d4a8f;stroke-width:7';
    const PARTS = [`<circle cx="150" cy="62" r="16" style="${SKIN}"/>`, '<path d="M150 79v50" style="stroke:#5ce1ff;stroke-width:11"/>',
      `<path d="M146 90l-24 24" style="${ARM}"/>`, `<path d="M154 90l24 24" style="${ARM}"/>`, `<path d="M147 128l-20 40" style="${LEG}"/>`, `<path d="M153 128l20 40" style="${LEG}"/>`];
    const FACE = n => {
      const eye = 'fill:#1b1410;stroke:none', line = 'stroke:#1b1410;stroke-width:2.2;fill:none';
      if (n >= MAX) return `<path d="M141 55l6 6M147 55l-6 6M153 55l6 6M159 55l-6 6" style="${line}"/><path d="M143 72q7-5 14 0" style="${line}"/>`; // olhos em X
      const eyes = n >= 5 ? `<circle cx="144" cy="58" r="3" style="fill:#fff;stroke:#1b1410;stroke-width:1.2"/><circle cx="156" cy="58" r="3" style="fill:#fff;stroke:#1b1410;stroke-width:1.2"/><circle cx="144" cy="58.5" r="1.3" style="${eye}"/><circle cx="156" cy="58.5" r="1.3" style="${eye}"/>`
        : `<circle cx="144" cy="58" r="2.2" style="${eye}"/><circle cx="156" cy="58" r="2.2" style="${eye}"/>`;
      const brows = n >= 3 ? `<path d="M140 52l7 2M160 52l-7 2" style="${line}"/>` : '';
      const mouth = n <= 2 ? `<path d="M143 66q7 6 14 0" style="${line}"/>` : n <= 4 ? `<path d="M144 69h12" style="${line}"/>` : `<ellipse cx="150" cy="69" rx="3.5" ry="4.5" style="${eye}"/>`;
      const sweat = n >= 4 ? '<path d="M166 50q3 5 0 7q-3-2 0-7z" style="fill:#7ad7ff;stroke:none"/>' : '';
      return eyes + brows + mouth + sweat;
    };
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Palavras<b id="w">0</b></span><span class="stat">Erros<b id="e">0/${MAX}</b></span></div>
      <svg class="gallows" viewBox="0 0 220 190" aria-hidden="true"><g class="base"><rect x="14" y="178" width="134" height="9" rx="3" style="fill:#5a3d24;stroke:none"/><rect x="46" y="12" width="12" height="168" rx="3" style="fill:#8a5a2b;stroke:none"/><rect x="50" y="12" width="3" height="166" style="fill:#b07a45;stroke:none"/><rect x="46" y="9" width="112" height="11" rx="3" style="fill:#8a5a2b;stroke:none"/><path d="M58 46L86 20" style="stroke:#6b4a2b;stroke-width:7"/><path d="M150 20v27" style="stroke:#c9a36a;stroke-width:3;stroke-dasharray:4 2"/></g><g class="body" id="body"></g></svg>
      <p class="hint" id="hint"></p>
      <div class="wordline" id="wl" aria-live="polite"></div>
      <div class="keys" id="keys">${[...ALPHA].map(l => `<button class="key" data-l="${l}">${l}</button>`).join('')}</div>`;
    const wl = el.querySelector('#wl'), keys = [...el.querySelectorAll('.key')];
    const draw = () => {
      el.querySelector('#body').innerHTML = PARTS.slice(0, wrong).join('') + (wrong ? `<g class="face">${FACE(wrong)}</g>` : '');
      el.querySelector('#body').classList.toggle('dead', wrong >= MAX);
      el.querySelector('#e').textContent = wrong + '/' + MAX;
      // cada palavra num grupo que não quebra no meio (no celular, "PLACA DE VÍDEO" vai pra mais de uma linha)
      const words = [[]];
      for (const ch of mask) ch === ' ' ? words.push([]) : words[words.length - 1].push(ch);
      wl.innerHTML = words.map(w => '<span class="wd">' + w.map(ch => (ch === '-' ? '<span class="gap">-</span>' : `<span class="lt">${esc(ch)}</span>`)).join('') + '</span>').join('');
      wl.classList.toggle('lost', lost);
    };
    // mostra a vez que o servidor mandou (palavra nova ou a mesma depois de uma letra)
    const show = v => {
      mask = v.mask || []; wrong = v.wrong ?? wrong; pts = v.pts ?? pts; solved = v.solved ?? solved;
      guessed = new Set(v.guessed || '');
      keys.forEach(k => { const l = k.dataset.l; k.disabled = guessed.has(l); if (!guessed.has(l)) k.className = 'key'; });
      if (v.hint) el.querySelector('#hint').textContent = 'Dica: ' + v.hint + ' · ' + v.letters + ' letras';
      el.querySelector('#p').textContent = pts; el.querySelector('#w').textContent = solved;
      draw();
    };
    const finish = saved => { locked = true; timers.push(setTimeout(() => done(pts, { saved }), 400)); };
    const fail = err => { if (!alive) return; el.querySelector('#hint').textContent = err.message; };
    const guess = async l => {
      if (locked || guessed.has(l) || !ALPHA.includes(l)) return;
      guessed.add(l); locked = true;
      const key = keys[ALPHA.indexOf(l)];
      key.disabled = true;
      let r;
      try { r = await api('api/rounds/' + round, { method: 'POST', body: { action: 'letter', letter: l } }); }
      catch (err) { guessed.delete(l); key.disabled = false; locked = false; return fail(err); }
      if (!alive) return;
      const { result, view } = r;
      if (result.hit) {
        key.classList.add('ok'); sfx.good();
        if (result.solved) {
          // palavra completa: mostra ela inteira um instante e vem a próxima
          mask = [...result.word]; pts = view.pts; solved = view.solved; wrong = view.wrong; draw();
          el.querySelector('#p').textContent = pts; el.querySelector('#w').textContent = solved;
          floatLabel('+' + result.gain);
          timers.push(setTimeout(() => { if (view.over) return finish(r.saved); show(view); locked = false; }, 900));
          return;
        }
      } else {
        key.classList.add('no'); beep(150, 140, 'square', 0.03);
        if (result.lost) { lost = true; mask = [...result.word]; wrong = view.wrong; sfx.bad(); draw(); timers.push(setTimeout(() => finish(r.saved), 1500)); return; }
      }
      show(view); locked = false;
    };
    const floatLabel = txt => {
      const s = Object.assign(document.createElement('span'), { className: 'fl-pts', textContent: txt });
      wl.append(s); timers.push(setTimeout(() => s.remove(), 900));
    };
    keys.forEach(k => k.onclick = () => guess(k.dataset.l));
    const onKey = e => { if (e.ctrlKey || e.metaKey || e.altKey) return; const l = norm(e.key); if (l.length === 1) guess(l); };
    addEventListener('keydown', onKey);
    api('api/rounds', { method: 'POST', body: { game: 'forca', daily: dailySeeded } })
      .then(r => { if (!alive) return; round = r.id; show(r.view); locked = false; })
      .catch(fail);
    return () => { alive = false; locked = true; removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
  }
};
