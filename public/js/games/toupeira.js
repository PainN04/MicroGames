// Desenhos próprios (ilustração em cores, não ícone de traço): toupeira, bomba e estrela
const MOLE_SPRITES = {
  mole: `<svg class="s-mole" viewBox="0 0 64 64" aria-hidden="true">
    <defs><radialGradient id="mlFur" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#b98458"/><stop offset="1" stop-color="#7a4d2c"/></radialGradient></defs>
    <circle cx="14" cy="22" r="6" fill="#7a4d2c"/><circle cx="50" cy="22" r="6" fill="#7a4d2c"/>
    <circle cx="14" cy="22" r="3" fill="#e9a79a"/><circle cx="50" cy="22" r="3" fill="#e9a79a"/>
    <path d="M10 78c0-34 9-56 22-56s22 22 22 56z" fill="url(#mlFur)"/>
    <ellipse cx="32" cy="43" rx="13" ry="10" fill="#f0b9a8"/>
    <ellipse cx="32" cy="37" rx="6.5" ry="4.6" fill="#d96a82"/><ellipse cx="30" cy="35.6" rx="2" ry="1.2" fill="#fff" opacity=".55"/>
    <path d="M32 41.5v3.5M27.5 46c2 1.8 7 1.8 9 0" stroke="#7a3b3b" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <circle cx="23" cy="29" r="4" fill="#1b1410"/><circle cx="41" cy="29" r="4" fill="#1b1410"/>
    <circle cx="24.3" cy="27.6" r="1.4" fill="#fff"/><circle cx="42.3" cy="27.6" r="1.4" fill="#fff"/>
    <g fill="#f4cbb8" stroke="#7a4d2c" stroke-width="1.2"><ellipse cx="14" cy="50" rx="7" ry="5"/><ellipse cx="50" cy="50" rx="7" ry="5"/></g>
    <g stroke="#7a4d2c" stroke-width="1.2" stroke-linecap="round"><path d="M10 51.5l-1.5 2.5M14 52.5v3M18 51.5l1.5 2.5M46 51.5l-1.5 2.5M50 52.5v3M54 51.5l1.5 2.5"/></g>
  </svg>`,
  bomb: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><radialGradient id="mbBody" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="#5b617d"/><stop offset=".55" stop-color="#2a2d3d"/><stop offset="1" stop-color="#0f1018"/></radialGradient></defs>
    <circle cx="30" cy="40" r="21" fill="url(#mbBody)"/>
    <ellipse cx="22" cy="31" rx="7" ry="4.6" transform="rotate(-35 22 31)" fill="#fff" opacity=".28"/>
    <rect x="23" y="14" width="14" height="9" rx="2.5" fill="#6b7190"/><rect x="23" y="14" width="14" height="3" rx="1.5" fill="#8a91b3"/>
    <path d="M32 14c1-5 6-6 10-9" stroke="#c9a36a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <g class="spark"><path d="M46 3l1.6 4.4L52 9l-4.4 1.6L46 15l-1.6-4.4L40 9l4.4-1.6z" fill="#ffd34d"/><circle cx="46" cy="9" r="2" fill="#fff"/></g>
    <path d="M44 30c4 3 6 8 5 13" stroke="#ff5c6c" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/>
  </svg>`,
  star: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="msStar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#ffab2e"/></linearGradient></defs>
    <path d="M32 6l7.6 16.2 17.6 2.2-13 12.2 3.4 17.4L32 45.1 16.4 54l3.4-17.4-13-12.2 17.6-2.2z" fill="url(#msStar)" stroke="#e08a00" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 14l4.2 9.4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
    <circle cx="25" cy="29" r="2.2" fill="#fff" opacity=".6"/>
  </svg>`,
};

// toupeira dourada: o mesmo desenho com pelagem de ouro (gradiente com outro id pra não colidir)
MOLE_SPRITES.gold = MOLE_SPRITES.mole.replace(/mlFur/g, 'mlGold').replace('#b98458', '#fff0a0').replace(/#7a4d2c/g, '#d9962b').replace('class="s-mole"', 'class="s-mole s-gold"');

GAMES.toupeira = {
  name: 'Toupeira', icon: 'hammer', hue: 35, desc: 'Acerte as toupeiras em 30s. Estrela vale 3, a toupeira dourada (rara e rápida) vale 5, bomba tira 3. Acertos seguidos fazem combo: a cada 5 sobe o multiplicador (até x4); bomba ou toupeira que escapa zera. Teclado numérico também vale.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    const DUR = 30;
    let pts = 0, t0 = 0, iv, over = false;
    const timers = [], state = Array(9).fill(null); // state[i] = { kind, timer } enquanto algo está pra fora
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat combo">Combo<b id="cb">x1</b></span><span class="stat">Tempo<b id="t">${DUR}s</b></span></div>
      <p class="hint" id="h">Prepare-se...</p>
      <div class="moles">${Array.from({ length: 9 }, (_, i) => `<button class="hole" data-i="${i}" aria-label="buraco ${i + 1}"><span></span></button>`).join('')}</div>`;
    const holes = [...el.querySelectorAll('.hole')];
    const combo = makeCombo(el.querySelector('#cb'));
    const elapsed = () => (performance.now() - t0) / 1000;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    function hide(i, escaped = false) {
      if (!state[i]) return;
      if (escaped && state[i].kind !== 'bomb') combo.miss(); // toupeira que fugiu sem ser acertada quebra o combo
      clearTimeout(state[i].timer);
      state[i] = null;
      holes[i].classList.remove('up');
    }
    function pop() {
      const free = state.map((s, i) => s ? -1 : i).filter(i => i >= 0);
      if (!free.length) return;
      const i = free[rand(0, free.length - 1)], tt = elapsed(), r = Math.random();
      const kind = tt > 8 && r < 0.15 ? 'bomb' : r > 0.96 ? 'gold' : r > 0.9 ? 'star' : 'mole';
      holes[i].querySelector('span').innerHTML = MOLE_SPRITES[kind];
      holes[i].classList.add('up');
      const stay = Math.max(550, 1000 - tt * 15) * (kind === 'gold' ? 0.7 : 1); // a dourada some mais rápido
      state[i] = { kind, timer: setTimeout(() => hide(i, true), stay) };
    }
    function spawnLoop() {
      if (over) return;
      pop();
      if (elapsed() > 12 && Math.random() < 0.35) pop(); // depois de 12s às vezes saem duas
      later(spawnLoop, Math.max(380, 750 - elapsed() * 12));
    }
    function whack(i) {
      if (over || !t0 || !state[i]) return; // buraco vazio não faz nada
      const kind = state[i].kind, base = { bomb: -3, star: 3, gold: 5, mole: 1 }[kind];
      const gain = base > 0 ? base * combo.hit() : (combo.miss(), base);
      pts = Math.max(0, pts + gain);
      el.querySelector('#p').textContent = pts;
      const cls = gain > 0 ? 'hit' : 'boom';
      holes[i].classList.add(cls);
      later(() => holes[i].classList.remove(cls), 180);
      if (kind === 'gold') { [1046, 1318, 1568].forEach((f, k) => setTimeout(() => beep(f, 90, 'triangle', 0.05), k * 60)); holes[i].classList.add('gold'); later(() => holes[i].classList.remove('gold'), 260); }
      else if (gain > 0) beep(gain > 1 ? 1046 : 784, 70, 'triangle'); else sfx.boom();
      hide(i);
    }
    holes.forEach((h, i) => h.onpointerdown = e => { e.preventDefault(); whack(i); });
    // martelada: o cursor de martelo desce por um instante a cada clique
    const board = el.querySelector('.moles');
    board.addEventListener('pointerdown', () => { board.classList.add('swing'); later(() => board.classList.remove('swing'), 130); });
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
