GAMES.toupeira = {
  name: 'Toupeira', emoji: '🐹', hue: 35, desc: 'Acerte as toupeiras em 30s. ⭐ vale 3, 💣 tira 3. Teclado numérico também vale.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    const DUR = 30;
    let pts = 0, t0 = 0, iv, over = false;
    const timers = [], state = Array(9).fill(null); // state[i] = { kind, timer } enquanto algo está pra fora
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Tempo<b id="t">${DUR}s</b></span></div>
      <p class="hint" id="h">Prepare-se...</p>
      <div class="moles">${Array.from({ length: 9 }, (_, i) => `<button class="hole" data-i="${i}" aria-label="buraco ${i + 1}"><span></span></button>`).join('')}</div>`;
    const holes = [...el.querySelectorAll('.hole')];
    const elapsed = () => (performance.now() - t0) / 1000;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    function hide(i) {
      if (!state[i]) return;
      clearTimeout(state[i].timer);
      state[i] = null;
      holes[i].classList.remove('up');
    }
    function pop() {
      const free = state.map((s, i) => s ? -1 : i).filter(i => i >= 0);
      if (!free.length) return;
      const i = free[rand(0, free.length - 1)], tt = elapsed(), r = Math.random();
      const kind = tt > 8 && r < 0.15 ? 'bomb' : r > 0.9 ? 'star' : 'mole';
      holes[i].querySelector('span').textContent = { bomb: '💣', star: '⭐', mole: '🐹' }[kind];
      holes[i].classList.add('up');
      state[i] = { kind, timer: setTimeout(() => hide(i), Math.max(550, 1000 - tt * 15)) };
    }
    function spawnLoop() {
      if (over) return;
      pop();
      if (elapsed() > 12 && Math.random() < 0.35) pop(); // depois de 12s às vezes saem duas
      later(spawnLoop, Math.max(380, 750 - elapsed() * 12));
    }
    function whack(i) {
      if (over || !t0 || !state[i]) return; // buraco vazio não faz nada
      const gain = { bomb: -3, star: 3, mole: 1 }[state[i].kind];
      pts = Math.max(0, pts + gain);
      el.querySelector('#p').textContent = pts;
      const cls = gain > 0 ? 'hit' : 'boom';
      holes[i].classList.add(cls);
      later(() => holes[i].classList.remove(cls), 180);
      if (gain > 0) beep(gain > 1 ? 1046 : 784, 70, 'triangle'); else sfx.bad();
      hide(i);
    }
    holes.forEach((h, i) => h.onpointerdown = e => { e.preventDefault(); whack(i); });
    const NUMPAD = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 }; // mesmo desenho do teclado numérico
    const onKey = e => { if (e.key in NUMPAD && !e.repeat) whack(NUMPAD[e.key]); };
    window.addEventListener('keydown', onKey);
    ['3', '2', '1'].forEach((c, k) => later(() => { el.querySelector('#h').textContent = c; beep(440, 80, 'triangle', 0.04); }, 300 + k * 600));
    later(() => {
      el.querySelector('#h').textContent = 'Vai!';
      beep(880, 120, 'triangle', 0.05);
      t0 = performance.now();
      iv = setInterval(() => {
        const left = DUR - elapsed();
        el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
        if (left <= 0) { over = true; clearInterval(iv); state.forEach((_, i) => hide(i)); done(pts); }
      }, 100);
      spawnLoop();
    }, 300 + 3 * 600);
    return () => {
      over = true;
      clearInterval(iv);
      timers.forEach(clearTimeout);
      state.forEach(s => s && clearTimeout(s.timer));
      window.removeEventListener('keydown', onKey);
    };
  }
};
