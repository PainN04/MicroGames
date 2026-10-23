GAMES.g2048 = {
  name: '2048', icon: 'grid-2x2', hue: 45, desc: 'Deslize (setas, WASD ou o dedo) e junte números iguais. 3 minutos ou até travar.',
  better: 'high', unit: 'pontos',
  start(el, done, pass) {
    const N = 4, DUR = 180;
    // peças como objetos com id: assim cada uma desliza da casa antiga pra nova e as que se juntam se encontram no meio
    let tiles = [], nextId = 0, score = 0, t0 = 0, iv, over = false, busy = null;
    // peças novas saem da semente da partida aberta no servidor, e os movimentos vão junto com a pontuação:
    // o servidor refaz a partida (lib/plays.js) e só aceita se der a mesma pontuação
    let rnd = null, moves = '';
    const gridOf = () => { const g = Array(N * N).fill(0); for (const t of tiles) if (!t.gone) g[t.i] = t.v; return g; };
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Maior<b id="m">2</b></span><span class="stat">Tempo<b id="t">3:00</b></span></div>
      <div class="g2048" id="b">${'<div class="slot"></div>'.repeat(N * N)}</div><p class="hint">O tempo começa no primeiro movimento.</p>`;
    const board = el.querySelector('#b');
    const style = v => {
      const k = Math.log2(v);
      return `background:oklch(${Math.max(48, 88 - k * 3.6)}% ${Math.min(0.2, 0.06 + k * 0.014)} ${(95 - k * 24 + 720) % 360});color:${v <= 4 ? '#1d1f2e' : '#fff'}`;
    };
    const place = t => { t.el.style.setProperty('--c', t.i % N); t.el.style.setProperty('--r', Math.floor(t.i / N)); };
    const paint = t => {
      t.el.firstChild.style.cssText = style(t.v);
      t.el.firstChild.textContent = t.v;
      t.el.dataset.d = String(t.v).length;
    };
    const spawn = i => {
      const t = { id: nextId++, v: rnd() < 0.9 ? 2 : 4, i, el: document.createElement('div') };
      t.el.className = 't pop'; t.el.innerHTML = '<i></i>';
      place(t); paint(t); board.append(t.el); tiles.push(t);
      return t;
    };
    const markMax = () => {
      const m = Math.max(...tiles.map(t => t.v));
      el.querySelector('#m').textContent = m;
      for (const t of tiles) t.el.classList.toggle('max', t.v === m && m >= 64);
    };
    const addTile = () => {
      const g = gridOf(), empty = g.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
      if (!empty.length) return null;
      return spawn(empty[Math.floor(rnd() * empty.length)]);
    };
    const lines = dir => Array.from({ length: N }, (_, a) => Array.from({ length: N }, (_, b) => {
      if (dir === 'L') return a * N + b;
      if (dir === 'R') return a * N + (N - 1 - b);
      if (dir === 'U') return b * N + a;
      return (N - 1 - b) * N + a;
    }));
    const canMove = () => { const g = gridOf(); return g.some((v, i) => !v || (i % N < N - 1 && g[i + 1] === v) || (i < N * (N - 1) && g[i + N] === v)); };
    const finish = () => { if (over) return; over = true; clearInterval(iv); done(score, moves); };
    // termina a animação anterior na hora (quem joga rápido não espera o deslize)
    const settle = () => { if (busy) { clearTimeout(busy.timer); busy.fn(); busy = null; } };
    const move = dir => {
      if (over || !rnd) return;
      settle();
      let moved = false;
      const byPos = new Map(tiles.map(t => [t.i, t])), merges = [];
      for (const idx of lines(dir)) {
        const line = idx.map(i => byPos.get(i)).filter(Boolean);
        let out = 0;
        for (let k = 0; k < line.length; k++) {
          const t = line[k], nx = line[k + 1], dest = idx[out++];
          if (nx && nx.v === t.v) {
            // os dois deslizam pra mesma casa; depois um some e o outro dobra
            if (t.i !== dest || nx.i !== dest) moved = true;
            t.i = dest; nx.i = dest; nx.gone = true; merges.push(t);
            score += t.v * 2; k++;
          } else { if (t.i !== dest) moved = true; t.i = dest; }
        }
      }
      if (!moved) return;
      moves += dir;
      if (!t0) {
        t0 = performance.now();
        iv = setInterval(() => {
          const left = Math.max(0, DUR - (performance.now() - t0) / 1000);
          el.querySelector('#t').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
          if (left <= 0) finish();
        }, 200);
      }
      for (const t of tiles) { t.el.classList.remove('pop', 'merge'); place(t); }
      el.querySelector('#p').textContent = score;
      merges.length ? beep(440 + Math.log2(Math.max(...merges.map(t => t.v * 2))) * 40, 60, 'triangle', 0.035) : beep(260, 25, 'sine', 0.02);
      const after = () => {
        for (const t of tiles) if (t.gone) t.el.remove();
        tiles = tiles.filter(t => !t.gone);
        for (const t of merges) { t.v *= 2; paint(t); void t.el.offsetWidth; t.el.classList.add('merge'); }
        if (merges.some(t => t.v >= 128)) popPoints(board, '+' + Math.max(...merges.map(t => t.v)), 'good');
        addTile(); markMax();
        if (!canMove()) { sfx.bad(); setTimeout(finish, 600); }
      };
      busy = { fn: after, timer: setTimeout(() => { busy = null; after(); }, 110) };
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
    // sem servidor (arquivo aberto direto, rede fora): semente qualquer, a partida só não vai pro ranking
    Promise.resolve(pass).then(p => {
      if (over) return;
      rnd = seededRandom(p ? p.seed : (Math.random() * 2 ** 32) >>> 0);
      addTile(); addTile(); markMax();
    });
    return () => { over = true; clearInterval(iv); if (busy) clearTimeout(busy.timer); window.removeEventListener('keydown', onKey); };
  }
};
