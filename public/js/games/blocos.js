GAMES.blocos = {
  name: 'Blocos', icon: 'blocks', hue: 255, desc: 'Estilo Tetris. ←→ move, ↑ gira, ↓ desce, Espaço solta. No celular: toque gira, arraste move, deslize pra baixo solta.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const COLS = 10, ROWS = 20, S = 26, BW = COLS * S, W = BW + 130, H = ROWS * S;
    const DAS = 170, ARR = 50, LOCK_MS = 450, MAX_LOCK_RESETS = 15;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Linhas<b id="l">0</b></span><span class="stat">Nível<b id="v">1</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { p: el.querySelector('#p'), l: el.querySelector('#l'), v: el.querySelector('#v') };
    const SHAPES = {
      I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
      O: [[1, 1], [1, 1]],
      T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
      S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
      Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
      J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
      L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    };
    const COLORS = { I: hex('--blue'), O: hex('--yellow'), T: hex('--primary'), S: hex('--green'), Z: hex('--red'), J: 0x5b7cfa, L: hex('--accent') };
    const rotate = m => m[0].map((_, i) => m.map(r => r[i]).reverse()); // sentido horário
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0)); // 0 ou a letra da peça
        let bag = [], cur = null, next = null, score = 0, lines = 0, level = 1, alive = true;
        let fallAcc = 0, lockAcc = 0, lockResets = 0;
        const held = { dir: 0, t: 0, down: false, downT: 0 };
        const g = this.add.graphics();
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 220 }, lifespan: 420, scale: { start: 1, end: 0 }, emitting: false });
        const font = { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '14px', color: '#9aa0b4' };
        this.add.text(BW + 65, 18, 'PRÓXIMA', font).setOrigin(0.5);

        // "saco de 7": as 7 peças saem embaralhadas antes de alguma repetir (sem seca de peça I)
        const fromBag = () => {
          if (!bag.length) { bag = Object.keys(SHAPES); for (let i = 6; i > 0; i--) { const j = rand(0, i); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
          return bag.pop();
        };
        const fits = (m, px, py) => m.every((row, y) => row.every((v, x) => {
          if (!v) return true;
          const gx = px + x, gy = py + y;
          return gx >= 0 && gx < COLS && gy < ROWS && (gy < 0 || !grid[gy][gx]);
        }));
        const resetLock = () => { if (lockResets < MAX_LOCK_RESETS) { lockAcc = 0; lockResets++; } };
        const gameOver = () => {
          alive = false;
          sfx.bad();
          this.cameras.main.shake(300, 0.012);
          this.time.delayedCall(900, () => done(score));
        };
        const spawn = () => {
          const type = next || fromBag();
          next = fromBag();
          const m = SHAPES[type].map(r => [...r]);
          cur = { type, m, x: Math.floor((COLS - m[0].length) / 2), y: type === 'I' ? -1 : 0 };
          fallAcc = 0; lockAcc = 0; lockResets = 0;
          if (!fits(cur.m, cur.x, cur.y)) gameOver();
        };
        const move = (dx, dy) => {
          if (!alive || !fits(cur.m, cur.x + dx, cur.y + dy)) return false;
          cur.x += dx; cur.y += dy;
          if (dx) resetLock();
          return true;
        };
        const turn = () => {
          if (!alive) return;
          const m = rotate(cur.m);
          // "chute de parede": tenta encaixar deslocando um pouco pros lados/pra cima
          for (const ky of [0, -1]) for (const kx of [0, -1, 1, -2, 2]) {
            if (fits(m, cur.x + kx, cur.y + ky)) { cur.m = m; cur.x += kx; cur.y += ky; resetLock(); beep(600, 35, 'triangle', 0.03); return; }
          }
        };
        const lock = () => {
          let overTop = false;
          cur.m.forEach((row, y) => row.forEach((v, x) => {
            if (!v) return;
            if (cur.y + y < 0) overTop = true; else grid[cur.y + y][cur.x + x] = cur.type;
          }));
          if (overTop) return gameOver();
          const full = [];
          grid.forEach((row, y) => { if (row.every(Boolean)) full.push(y); });
          if (full.length) {
            for (const y of full) for (let x = 0; x < COLS; x++) {
              burst.setParticleTint(COLORS[grid[y][x]]);
              burst.explode(3, x * S + S / 2, y * S + S / 2);
            }
            for (const y of full) { grid.splice(y, 1); grid.unshift(Array(COLS).fill(0)); } // de cima pra baixo: índices abaixo não mudam
            score += [0, 100, 300, 500, 800][full.length] * level;
            lines += full.length;
            level = Math.floor(lines / 10) + 1;
            if (full.length === 4) { floatText(this, BW / 2, H / 2, 'TETRA!', '#ffd34d'); this.cameras.main.shake(200, 0.008); sfx.record(); }
            else { floatText(this, BW / 2, full[0] * S, `+${full.length} linha${full.length > 1 ? 's' : ''}`, '#7cffb0'); sfx.good(); }
          } else beep(220, 40, 'triangle', 0.03);
          spawn();
        };
        const softDrop = () => { if (move(0, 1)) { score += 1; fallAcc = 0; } };
        const hardDrop = () => {
          if (!alive) return;
          let d = 0;
          while (move(0, 1)) d++;
          score += d * 2;
          lock();
        };

        // teclado: 1º toque move na hora; segurando, repete depois de DAS a cada ARR
        this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
        const keys = this.input.keyboard.addKeys('LEFT,RIGHT,DOWN,A,D,S');
        this.input.keyboard.on('keydown', e => {
          if (!alive || e.repeat) return;
          const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
          if (k === 'ArrowLeft' || k === 'a') { move(-1, 0); held.dir = -1; held.t = 0; }
          else if (k === 'ArrowRight' || k === 'd') { move(1, 0); held.dir = 1; held.t = 0; }
          else if (k === 'ArrowDown' || k === 's') { softDrop(); held.downT = 0; }
          else if (k === 'ArrowUp' || k === 'w' || k === 'x') turn();
          else if (k === ' ') hardDrop();
        });
        // toque: tocar gira; arrastar pro lado move célula a célula; deslizar rápido pra baixo solta
        let touch = null;
        this.input.on('pointerdown', p => { touch = { x0: p.x, y0: p.y, lastX: p.x, moved: false, t: performance.now() }; });
        this.input.on('pointermove', p => {
          if (!touch || !p.isDown || !alive) return;
          while (p.x - touch.lastX >= S) { move(1, 0); touch.lastX += S; touch.moved = true; }
          while (touch.lastX - p.x >= S) { move(-1, 0); touch.lastX -= S; touch.moved = true; }
        });
        this.input.on('pointerup', p => {
          if (!touch || !alive) return;
          const dx = p.x - touch.x0, dy = p.y - touch.y0;
          if (dy > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) hardDrop();
          else if (!touch.moved && Math.abs(dx) < 12 && Math.abs(dy) < 12) turn();
          touch = null;
        });

        const cell = (x, y, color, alpha = 1, size = S, ox = 0, oy = 0) =>
          g.fillStyle(color, alpha).fillRoundedRect(ox + x * size + 1, oy + y * size + 1, size - 2, size - 2, 5);
        const draw = () => {
          g.clear();
          g.fillStyle(0x1d1f2e).fillRect(0, 0, BW, H);
          g.fillStyle(0x161625).fillRect(BW, 0, W - BW, H);
          g.lineStyle(1, 0xffffff, 0.04);
          for (let x = 1; x < COLS; x++) g.lineBetween(x * S, 0, x * S, H);
          for (let y = 1; y < ROWS; y++) g.lineBetween(0, y * S, BW, y * S);
          grid.forEach((row, y) => row.forEach((t, x) => { if (t) cell(x, y, COLORS[t]); }));
          if (cur && alive) {
            let gy = cur.y;
            while (fits(cur.m, cur.x, gy + 1)) gy++;
            cur.m.forEach((row, y) => row.forEach((v, x) => { if (v && gy + y >= 0) cell(cur.x + x, gy + y, COLORS[cur.type], 0.22); }));
            cur.m.forEach((row, y) => row.forEach((v, x) => { if (v && cur.y + y >= 0) cell(cur.x + x, cur.y + y, COLORS[cur.type]); }));
          }
          if (next) {
            const m = SHAPES[next], size = 20;
            const ox = BW + 65 - (m[0].length * size) / 2, oy = 70 - (m.length * size) / 2;
            m.forEach((row, y) => row.forEach((v, x) => { if (v) cell(x, y, COLORS[next], 1, size, ox, oy); }));
          }
        };

        this.events.on('update', (time, delta) => {
          if (alive) {
            // repetição ao segurar
            const leftDown = keys.LEFT.isDown || keys.A.isDown, rightDown = keys.RIGHT.isDown || keys.D.isDown;
            if ((held.dir === -1 && leftDown) || (held.dir === 1 && rightDown)) {
              held.t += delta;
              while (held.t >= DAS) { move(held.dir, 0); held.t -= ARR; }
            } else held.dir = 0;
            if (keys.DOWN.isDown || keys.S.isDown) {
              held.downT += delta;
              while (held.downT >= ARR * 1.5) { softDrop(); held.downT -= ARR * 1.5; }
            }
            // gravidade + tempo pra deslizar a peça no chão antes de travar
            const interval = Math.max(90, 800 - (level - 1) * 70);
            if (fits(cur.m, cur.x, cur.y + 1)) {
              lockAcc = 0;
              fallAcc += delta;
              if (fallAcc >= interval) { fallAcc = 0; cur.y++; }
            } else {
              lockAcc += delta;
              if (lockAcc >= LOCK_MS) lock();
            }
            hud.p.textContent = score; hud.l.textContent = lines; hud.v.textContent = level;
          }
          draw();
        });
        spawn();
      },
    });
  }
};
