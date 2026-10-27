// Cruzadinha: mini palavras cruzadas 5×5. Cada palavra tem uma dica; quem cruza ajuda a achar a outra.
// As letras certas ficam no servidor (lib/diarios.js): a grade cheia vai pra lá e volta certa ou não.
// "Conferir" marca as casas erradas, mas custa pontos. O tempo conta desde que a grade aparece.
GAMES.cruzadinha = {
  name: 'Cruzadinha', icon: 'cruzadinha', hue: 330, daily: true,
  desc: 'Mini palavras cruzadas 5×5: preencha a grade com as respostas das dicas, na horizontal e na vertical. Quanto mais rápido, mais pontos; conferir as letras custa pontos. Uma partida por dia.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    if (needsServer(el)) return;
    let v = null, S = 5, L = [], cur = -1, dir = 'A', busy = true, alive = true, saved = 'ok', timers = [], tick = 0, wrong = new Set(), lastSent = '', saveT = 0;
    let queue = Promise.resolve();
    el.innerHTML = `<div class="hud"><span class="stat">Tempo<b id="wt">0:00</b></span><span class="stat">Conferidas<b id="wc">0</b></span></div>
      <div class="cw-clue" id="wq"><button class="cw-nav" id="wprev" aria-label="Dica anterior">${icon('chevron-left')}</button><p aria-live="polite"><b></b><span></span></p><button class="cw-nav" id="wnext" aria-label="Próxima dica">${icon('chevron-right')}</button></div>
      <div class="cw-grid" id="wg" role="group" aria-label="Grade da cruzadinha"></div>
      <p class="hint" id="wmsg" aria-live="polite"></p>
      <div class="tm-kb" id="kb">${['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM⌫'].map(r => `<div>${[...r].map(k => `<button class="tm-k${k === '⌫' ? ' wide' : ''}" data-k="${k}" ${k === '⌫' ? 'aria-label="Apagar"' : ''}>${k}</button>`).join('')}</div>`).join('')}</div>
      <div class="row-btns" id="wbtns"><button class="btn ghost" id="wchk">${icon('circle-check')} Conferir</button><button class="btn ghost" id="wgive">${icon('flag')} Desistir</button></div>
      <div class="cw-lists" id="wl"></div>`;
    const msg = el.querySelector('#wmsg'), say = t => { msg.textContent = t; };
    const grid = el.querySelector('#wg');
    const slots = () => [...v.across.map(s => ({ ...s, dir: 'A' })), ...v.down.map(s => ({ ...s, dir: 'D' }))];
    const slotAt = (i, d) => slots().find(s => s.dir === d && s.cells.includes(i));
    const black = i => v.black.includes(i);
    const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    const paint = () => {
      const sl = cur >= 0 ? slotAt(cur, dir) : null;
      grid.querySelectorAll('.cw-c').forEach((c, i) => {
        if (black(i)) return;
        const ch = v.over && v.answer ? v.answer[i] : L[i];
        c.querySelector('i').textContent = ch === ' ' ? '' : ch;
        c.classList.toggle('cur', i === cur && !v.over);
        c.classList.toggle('in', !!sl && sl.cells.includes(i) && !v.over);
        c.classList.toggle('bad', wrong.has(i) && !v.over);
        c.classList.toggle('miss', !!v.over && !v.won && L[i] !== v.answer?.[i]);
      });
      const q = el.querySelector('#wq p');
      if (sl && !v.over) { q.querySelector('b').textContent = `${sl.n}${sl.dir === 'A' ? 'H' : 'V'}`; q.querySelector('span').textContent = sl.clue; }
      el.querySelectorAll('#wl li').forEach(li => {
        li.classList.toggle('on', !!sl && li.dataset.k === sl.dir + sl.n);
        const s = slots().find(x => x.dir + x.n === li.dataset.k);
        li.classList.toggle('ok', s.cells.every(k => L[k] !== ' '));
      });
      el.querySelector('#wc').textContent = v.checks;
    };
    const clock = () => { if (v && !v.over) el.querySelector('#wt').textContent = fmt(Math.max(0, Math.floor((Date.now() - v.startedAt) / 1000))); };
    const endPanel = () => {
      clearInterval(tick); clearTimeout(saveT);
      el.querySelector('#kb').hidden = true;
      el.querySelector('#wq').hidden = true;
      const box = el.querySelector('#wbtns');
      box.innerHTML = `<button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
      const share = () => `Cruzadinha MicroGame: ${v.won ? `resolvida, ${v.score} pontos` : 'não foi dessa vez'}${v.checks ? ` (${v.checks} conferida${v.checks > 1 ? 's' : ''})` : ''}`;
      box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(share()); say('Resultado copiado!'); } catch { say(share()); } };
      say(v.won ? `${v.score} pontos. Volte amanhã!` : 'As letras certas estão na grade. Volte amanhã!');
      paint();
    };
    // uma chamada por vez: o servidor recusa duas jogadas em cima da mesma partida
    const send = body => (queue = queue.then(async () => {
      try { const nv = await api('api/diarios/cruzadinha', { method: 'POST', body }); if (nv.saved) saved = nv.saved; return nv; }
      catch (err) { if (alive) say(err.message); return null; }
    }));
    const word = () => L.join('');
    const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(() => { if (alive && v && !v.over && word() !== lastSent) { lastSent = word(); send({ action: 'save', letters: word() }); } }, 2000); };
    const submit = async () => {
      if (busy || v.over) return;
      busy = true; clearTimeout(saveT); lastSent = word();
      const nv = await send({ letters: word() });
      if (!alive) return;
      busy = false;
      if (!nv) return;
      v = nv;
      if (v.won) {
        busy = true; clearInterval(tick); sfx.record(); paint();
        grid.classList.add('win');
        const s = Math.floor((Date.now() - v.startedAt) / 1000);
        summarize([['Tempo', fmt(s)], ['Conferidas', String(v.checks)]]);
        timers.push(setTimeout(() => alive && done(v.score, { saved }), 1100));
      } else { say('Quase! Ainda tem alguma letra errada.'); sfx.bad(); grid.classList.remove('nope'); void grid.offsetWidth; grid.classList.add('nope'); }
    };

    const firstEmpty = s => s.cells.find(k => L[k] === ' ');
    const goSlot = (s, empty = true) => { dir = s.dir; cur = (empty && firstEmpty(s)) ?? s.cells[0]; paint(); };
    const nextSlot = (step = 1) => {
      const all = slots(), now = slotAt(cur, dir), at = all.findIndex(s => s.dir === now.dir && s.n === now.n);
      for (let k = 1; k <= all.length; k++) { const s = all[(at + step * k + all.length * 2) % all.length]; if (firstEmpty(s) !== undefined || k === all.length) return goSlot(s); }
    };
    const setCell = i => {
      if (black(i)) return;
      if (i === cur) dir = dir === 'A' ? 'D' : 'A';
      else { cur = i; if (!slotAt(i, dir)) dir = dir === 'A' ? 'D' : 'A'; }
      if (!slotAt(cur, dir)) dir = dir === 'A' ? 'D' : 'A';
      paint();
    };
    const type = ch => {
      if (busy || !v || v.over || cur < 0) return;
      L[cur] = ch; wrong.delete(cur); say('');
      beep(560, 25, 'triangle', 0.02);
      const s = slotAt(cur, dir), k = s.cells.indexOf(cur);
      const after = s.cells.slice(k + 1).find(c => L[c] === ' ');
      if (!L.includes(' ')) { paint(); submit(); return; }
      if (after !== undefined) cur = after;
      else if (k + 1 < s.cells.length && firstEmpty(s) === undefined) cur = s.cells[k + 1];
      else if (firstEmpty(s) !== undefined) cur = firstEmpty(s);
      else { nextSlot(); saveSoon(); return; }
      paint(); saveSoon();
    };
    const erase = () => {
      if (busy || !v || v.over || cur < 0) return;
      const s = slotAt(cur, dir), k = s.cells.indexOf(cur);
      if (L[cur] === ' ' && k > 0) cur = s.cells[k - 1];
      L[cur] = ' '; wrong.delete(cur);
      paint(); saveSoon();
    };
    const move = (dr, dc) => {
      if (!v || v.over || cur < 0) return;
      const nd = dr ? 'D' : 'A';
      if (nd !== dir && slotAt(cur, nd)) { dir = nd; paint(); return; }
      let r = Math.floor(cur / S), c = cur % S;
      for (;;) { r += dr; c += dc; if (r < 0 || r >= S || c < 0 || c >= S) return; if (!black(r * S + c)) break; }
      cur = r * S + c; if (!slotAt(cur, dir)) dir = dir === 'A' ? 'D' : 'A'; paint();
    };

    say('Carregando...');
    api('api/diarios/cruzadinha').then(nv => {
      if (!alive) return;
      v = nv; S = v.size; busy = false; say('');
      L = [...v.letters]; lastSent = word(); wrong = new Set(v.wrong);
      grid.style.setProperty('--n', S);
      grid.innerHTML = L.map((_, i) => (black(i) ? '<div class="cw-c blk" aria-hidden="true"></div>'
        : `<div class="cw-c" data-i="${i}">${v.nums[i] ? `<small>${v.nums[i]}</small>` : ''}<i></i></div>`)).join('');
      const list = (t, arr, d) => `<div><h4>${t}</h4><ol>${arr.map(s => `<li data-k="${d}${s.n}"><b>${s.n}</b> ${esc(s.clue)}</li>`).join('')}</ol></div>`;
      el.querySelector('#wl').innerHTML = list('Horizontais', v.across, 'A') + list('Verticais', v.down, 'D');
      el.querySelectorAll('#wl li').forEach(li => li.onclick = () => { if (!v.over) goSlot(slots().find(s => s.dir + s.n === li.dataset.k)); });
      if (v.over) return endPanel();
      goSlot(slots()[0]);
      tick = setInterval(clock, 500); clock();
    }).catch(err => { if (alive) say(err.message); });

    grid.addEventListener('pointerdown', e => {
      const c = e.target.closest('.cw-c');
      if (!c || !v || v.over || c.classList.contains('blk')) return;
      e.preventDefault(); setCell(+c.dataset.i);
    });
    el.querySelector('#wprev').onclick = () => v && !v.over && nextSlot(-1);
    el.querySelector('#wnext').onclick = () => v && !v.over && nextSlot(1);
    el.querySelectorAll('#kb .tm-k').forEach(b => b.onclick = () => (b.dataset.k === '⌫' ? erase() : type(b.dataset.k)));
    el.querySelector('#wchk').onclick = async () => {
      if (busy || !v || v.over) return;
      const b = el.querySelector('#wchk');
      if (!b.dataset.sure) {
        b.dataset.sure = '1'; b.innerHTML = `${icon('circle-check')} Conferir? (-60 pts)`;
        timers.push(setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.innerHTML = `${icon('circle-check')} Conferir`; } }, 3500));
        return;
      }
      delete b.dataset.sure; b.innerHTML = `${icon('circle-check')} Conferir`;
      busy = true; clearTimeout(saveT); lastSent = word();
      const nv = await send({ action: 'check', letters: word() });
      if (!alive) return;
      busy = false;
      if (!nv) return;
      v = nv; wrong = new Set(v.wrong);
      const n = nv.result?.wrong || 0;
      say(n ? `${n} letra${n > 1 ? 's' : ''} errada${n > 1 ? 's' : ''} marcada${n > 1 ? 's' : ''} em vermelho` : 'Tudo certo até aqui!');
      n ? beep(200, 90, 'square', 0.03) : sfx.good();
      paint();
    };
    el.querySelector('#wgive').onclick = async () => {
      if (busy || !v || v.over) return;
      const b = el.querySelector('#wgive');
      if (!b.dataset.sure) {
        b.dataset.sure = '1'; b.innerHTML = `${icon('flag')} Desistir mesmo?`;
        timers.push(setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.innerHTML = `${icon('flag')} Desistir`; } }, 3500));
        return;
      }
      busy = true; clearTimeout(saveT);
      const nv = await send({ action: 'giveup', letters: word() });
      if (!alive) return;
      busy = false;
      if (!nv) return;
      v = nv; sfx.bad(); endPanel();
    };
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || !v || v.over) return;
      const k = e.key;
      if (k === 'Backspace') { e.preventDefault(); erase(); }
      else if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1); }
      else if (k === 'ArrowRight') { e.preventDefault(); move(0, 1); }
      else if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0); }
      else if (k === 'ArrowDown') { e.preventDefault(); move(1, 0); }
      else if (k === 'Tab' || k === 'Enter') { e.preventDefault(); nextSlot(e.shiftKey ? -1 : 1); }
      else if (k === ' ') { e.preventDefault(); if (cur >= 0) setCell(cur); }
      else { const l = k.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); if (/^[A-Z]$/.test(l)) { e.preventDefault(); type(l); } }
    };
    addEventListener('keydown', onKey);
    return () => {
      alive = false; removeEventListener('keydown', onKey); clearInterval(tick); timers.forEach(clearTimeout); clearTimeout(saveT);
      // sai no meio: guarda o que já foi escrito
      if (v && !v.over && word() !== lastSent) send({ action: 'save', letters: word() });
    };
  }
};
