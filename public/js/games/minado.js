GAMES.minado = {
  name: 'Campo Minado', icon: 'bomb', hue: 135, desc: 'Abra todas as casas sem mina. Clique abre; botão direito, toque longo ou o modo marcar marca. Clicar num número com as bandeiras certas em volta abre os vizinhos. O 1º clique é sempre seguro.',
  better: 'low', unit: 's', decimals: 1,
  start(el, done) {
    const N = 9, MINES = 10;
    let mines = null, t0 = 0, iv, over = false, flagMode = false, longPress = null, longFired = false;
    const open = new Set(), flags = new Set();
    el.innerHTML = `<div class="hud"><span class="stat">Minas<b id="m">${MINES}</b></span><span class="stat">Tempo<b id="t">0.0s</b></span></div>
      <div class="mines" id="mf">${Array.from({ length: N * N }, (_, i) => `<button class="mc" data-i="${i}" aria-label="casa ${i + 1}"></button>`).join('')}</div>
      <button class="btn ghost" id="flag" aria-pressed="false">${icon('flag')} <span>Modo marcar: desligado</span></button>`;
    const cells = [...el.querySelectorAll('.mc')];
    const around = i => {
      const r = Math.floor(i / N), c = i % N, out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc);
      }
      return out;
    };
    const count = i => around(i).filter(j => mines.has(j)).length;
    const placeMines = first => {
      // o 1º clique e os vizinhos nunca têm mina (abre uma área pra começar)
      const safe = new Set([first, ...around(first)]);
      const pool = cells.map((_, i) => i).filter(i => !safe.has(i));
      mines = new Set();
      while (mines.size < MINES) mines.add(pool.splice(rand(0, pool.length - 1), 1)[0]);
    };
    const elapsed = () => (performance.now() - t0) / 1000;
    const lose = i => {
      over = true; clearInterval(iv);
      for (const m of mines) { cells[m].innerHTML = icon('bomb', { cls: 'bomb' }); cells[m].classList.add('open'); }
      cells[i].classList.add('boom');
      sfx.bad();
      setTimeout(() => done(null, 'Explodiu! Partida perdida não vai pro ranking — tenta de novo.'), 1000);
    };
    const reveal = i => {
      if (over || open.has(i) || flags.has(i)) return;
      if (!mines) {
        placeMines(i);
        t0 = performance.now();
        iv = setInterval(() => el.querySelector('#t').textContent = elapsed().toFixed(1) + 's', 100);
      }
      if (mines.has(i)) return lose(i);
      const stack = [i];
      while (stack.length) {
        const j = stack.pop();
        if (open.has(j) || flags.has(j)) continue;
        open.add(j);
        const n = count(j);
        cells[j].classList.add('open');
        if (n) { cells[j].textContent = n; cells[j].classList.add('n' + n); }
        else stack.push(...around(j));
      }
      beep(520, 30, 'triangle', 0.025);
      if (open.size === N * N - MINES) {
        over = true; clearInterval(iv);
        const score = +elapsed().toFixed(1);
        el.querySelector('#t').textContent = score.toFixed(1) + 's';
        for (const m of mines) cells[m].innerHTML = icon('flag', { cls: 'flag' });
        setTimeout(() => done(score), 500);
      }
    };
    // "chording": clicar num número já aberto, com as bandeiras certas em volta, abre todos os vizinhos de uma vez
    const chord = i => {
      if (over || !open.has(i)) return false;
      const n = count(i), near = around(i);
      if (!n || near.filter(j => flags.has(j)).length !== n) return false;
      for (const j of near) if (!open.has(j) && !flags.has(j)) { reveal(j); if (over) break; }
      return true;
    };
    const toggleFlag = i => {
      if (over || open.has(i)) return;
      flags.has(i) ? flags.delete(i) : flags.add(i);
      cells[i].innerHTML = flags.has(i) ? icon('flag', { cls: 'flag' }) : '';
      el.querySelector('#m').textContent = MINES - flags.size;
      beep(700, 30, 'sine', 0.02);
    };
    cells.forEach((cell, i) => {
      cell.oncontextmenu = e => { e.preventDefault(); toggleFlag(i); };
      cell.onpointerdown = e => {
        if (e.button === 2) return;
        longFired = false;
        longPress = setTimeout(() => { longFired = true; toggleFlag(i); }, 450);
      };
      cell.onpointerup = cell.onpointerleave = () => clearTimeout(longPress);
      cell.onclick = () => { if (longFired) { longFired = false; return; } if (chord(i)) return; flagMode ? toggleFlag(i) : reveal(i); };
    });
    el.querySelector('#flag').onclick = e => {
      flagMode = !flagMode;
      const b = e.currentTarget;
      b.querySelector('span').textContent = `Modo marcar: ${flagMode ? 'ligado' : 'desligado'}`;
      b.setAttribute('aria-pressed', flagMode);
    };
    return () => { over = true; clearInterval(iv); clearTimeout(longPress); };
  }
};
