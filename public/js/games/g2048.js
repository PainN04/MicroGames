GAMES.g2048 = {
  name: '2048', emoji: '🧮', hue: 45, desc: 'Deslize (setas, WASD ou o dedo) e junte números iguais. 3 minutos ou até travar.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    const N = 4, DUR = 180;
    let grid = Array(N * N).fill(0), score = 0, t0 = 0, iv, over = false;
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Maior<b id="m">2</b></span><span class="stat">Tempo<b id="t">3:00</b></span></div>
      <div class="g2048" id="b"></div><p class="hint">O tempo começa no primeiro movimento.</p>`;
    const board = el.querySelector('#b');
    const style = v => {
      if (!v) return '';
      const k = Math.log2(v);
      return `background:oklch(${Math.max(48, 88 - k * 3.6)}% ${Math.min(0.2, 0.06 + k * 0.014)} ${(95 - k * 24 + 720) % 360});color:${v <= 4 ? '#1d1f2e' : '#fff'}`;
    };
    const render = (fresh = new Set(), merged = new Set()) => {
      board.innerHTML = grid.map((v, i) => `<div class="t${fresh.has(i) ? ' pop' : ''}${merged.has(i) ? ' merge' : ''}" style="${style(v)}">${v || ''}</div>`).join('');
      el.querySelector('#m').textContent = Math.max(...grid);
    };
    const addTile = () => {
      const empty = grid.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
      if (!empty.length) return -1;
      const i = empty[rand(0, empty.length - 1)];
      grid[i] = Math.random() < 0.9 ? 2 : 4;
      return i;
    };
    const lines = dir => Array.from({ length: N }, (_, a) => Array.from({ length: N }, (_, b) => {
      if (dir === 'L') return a * N + b;
      if (dir === 'R') return a * N + (N - 1 - b);
      if (dir === 'U') return b * N + a;
      return (N - 1 - b) * N + a;
    }));
    const canMove = () => grid.some((v, i) => !v
      || (i % N < N - 1 && grid[i + 1] === v) || (i < N * (N - 1) && grid[i + N] === v));
    const finish = () => { if (over) return; over = true; clearInterval(iv); done(score); };
    const move = dir => {
      if (over) return;
      let moved = false;
      const merged = new Set();
      for (const idx of lines(dir)) {
        const vals = idx.map(i => grid[i]).filter(Boolean), out = [];
        for (let k = 0; k < vals.length; k++) {
          if (vals[k] === vals[k + 1]) { out.push(vals[k] * 2); score += vals[k] * 2; merged.add(idx[out.length - 1]); k++; }
          else out.push(vals[k]);
        }
        idx.forEach((i, k) => { const nv = out[k] || 0; if (grid[i] !== nv) moved = true; grid[i] = nv; });
      }
      if (!moved) return;
      if (!t0) {
        t0 = performance.now();
        iv = setInterval(() => {
          const left = Math.max(0, DUR - (performance.now() - t0) / 1000);
          el.querySelector('#t').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
          if (left <= 0) finish();
        }, 200);
      }
      el.querySelector('#p').textContent = score;
      merged.size ? beep(440 + Math.log2(Math.max(...[...merged].map(i => grid[i]))) * 40, 60, 'triangle', 0.035) : beep(260, 25, 'sine', 0.02);
      const fresh = addTile();
      render(new Set([fresh]), merged);
      if (!canMove()) { sfx.bad(); setTimeout(finish, 600); }
    };
    const KEYS = { ArrowLeft: 'L', a: 'L', ArrowRight: 'R', d: 'R', ArrowUp: 'U', w: 'U', ArrowDown: 'D', s: 'D' };
    const onKey = e => {
      const d = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!d) return;
      e.preventDefault();
      move(d);
    };
    let sx = 0, sy = 0;
    board.onpointerdown = e => { sx = e.clientX; sy = e.clientY; };
    board.onpointerup = e => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
    };
    window.addEventListener('keydown', onKey);
    const a = addTile(), b = addTile();
    render(new Set([a, b]));
    return () => { over = true; clearInterval(iv); window.removeEventListener('keydown', onKey); };
  }
};
