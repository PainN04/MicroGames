GAMES.comecome = {
  name: 'Come-Come', icon: 'comecome', hue: 52, desc: 'Coma todas as bolinhas e fuja dos fantasmas. Bolas grandes deixam eles azuis: aí é você quem come! Setas, WASD, deslize ou os botões. 3 vidas.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    // # parede · . bolinha · o bolinha grande · P onde o jogador começa · espaço = vazio. A linha 9 é um túnel que dá a volta.
    const MAZE = [
      '###################',
      '#........#........#',
      '#o##.###.#.###.##o#',
      '#.................#',
      '#.##.#.#####.#.##.#',
      '#....#...#...#....#',
      '####.### # ###.####',
      '   #.#       #.#   ',
      '####.# ## ## #.####',
      '    .  #   #  .    ',
      '####.# ##### #.####',
      '   #.#       #.#   ',
      '####.# ##### #.####',
      '#........#........#',
      '#.##.###.#.###.##.#',
      '#o.#.....P.....#.o#',
      '##.#.#.#####.#.#.##',
      '#....#...#...#....#',
      '#.######.#.######.#',
      '#.................#',
      '###################'];
    const COLS = 19, ROWS = 21, T = 24, W = COLS * T, H = ROWS * T, TUNNEL = 9;
    const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const KEYS = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
    const arrow = (d, rot) => `<button class="dbtn" data-d="${d}" aria-label="${d}" style="--r:${rot}deg">${icon('arrow-left')}</button>`;
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Vidas<b id="v" class="lives">${hearts(3)}</b></span><span class="stat">Fase<b id="f">1</b></span></div>
      <div class="phaser-wrap" id="pw"></div>
      <div class="dpad flat" aria-hidden="true">${arrow('left', 0)}${arrow('up', 90)}${arrow('down', -90)}${arrow('right', 180)}</div>
      <p class="hint">Setas, WASD ou deslize pra começar</p>`;
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v'), f: el.querySelector('#f') };
    let turnTo = () => {};
    el.querySelectorAll('.dbtn').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); turnTo(b.dataset.d); }));

    // chão alcançável a partir do jogador (o resto vira parede), com a volta do túnel
    const start = (() => { for (let y = 0; y < ROWS; y++) { const x = MAZE[y].indexOf('P'); if (x >= 0) return [x, y]; } })();
    const floor = MAZE.map(r => [...r].map(() => false));
    {
      const q = [start]; floor[start[1]][start[0]] = true;
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of Object.values(DIR)) {
          let nx = x + dx; const ny = y + dy;
          if (ny < 0 || ny >= ROWS) continue;
          if (nx < 0 || nx >= COLS) { if (y !== TUNNEL) continue; nx = (nx + COLS) % COLS; }
          if (MAZE[ny][nx] === '#' || floor[ny][nx]) continue;
          floor[ny][nx] = true; q.push([nx, ny]);
        }
      }
    }
    const free = (x, y) => y >= 0 && y < ROWS && x >= 0 && x < COLS && floor[y][x];
    /** Dá pra sair de (x,y) na direção d? Devolve a casa de chegada ou null. */
    const nextTile = (x, y, d) => {
      let nx = x + d[0]; const ny = y + d[1];
      if (nx < 0 || nx >= COLS) { if (y !== TUNNEL) return null; nx = (nx + COLS) % COLS; }
      return free(nx, ny) ? [nx, ny] : null;
    };
    const ROOM = [[8, 9], [9, 9], [10, 9]];
    const CORNERS = [[17, 0], [1, 0], [17, 20], [1, 20]];
    const GHOST_COLORS = [0xff4d5e, 0xff9ee5, 0x4dd9ff, 0xffa94d];

    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        // paredes: desenhadas uma vez numa textura (desenhar ~190 retângulos a cada quadro deixava o celular lento)
        const walls = this.make.graphics({ x: 0, y: 0, add: false });
        walls.fillStyle(0x2b3a8f);
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (MAZE[y][x] === '#') walls.fillRoundedRect(x * T + 2, y * T + 2, T - 4, T - 4, 6);
        walls.fillStyle(0x3d52c4);
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (MAZE[y][x] === '#' && (y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1)) walls.fillRoundedRect(x * T + 2, y * T + 2, T - 4, T - 4, 6);
        walls.generateTexture('maze', W, H);
        walls.destroy();
        this.add.image(0, 0, 'maze').setOrigin(0).setDepth(0);
        const g = this.add.graphics().setDepth(10);
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 40, max: 140 }, lifespan: 350, scale: { start: 0.9, end: 0 }, emitting: false }).setDepth(15);
        const msg = this.add.text(W / 2, 11 * T + T / 2, 'Aperte uma seta', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '22px', color: '#ffe27a', backgroundColor: '#1d1f2e' }).setOrigin(0.5).setPadding(8, 2).setDepth(20);

        let pellets, left, score = 0, lives = 3, level = 1, alive = true, running = false, freeze = 0, fright = 0, chain = 0, clock = 0, want = null, dead = 0;
        const fillPellets = () => {
          if (pellets) for (const it of pellets.values()) { this.tweens.killTweensOf(it.img); it.img.destroy(); }
          pellets = new Map(); left = 0;
          for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const c = MAZE[y][x];
            if (!((c === '.' || c === 'o') && floor[y][x])) continue;
            const big = c === 'o', img = this.add.image(x * T + T / 2, y * T + T / 2, 'dot').setTint(0xffd9a8).setScale(big ? 1.9 : 0.6).setDepth(1);
            if (big) this.tweens.add({ targets: img, alpha: 0.25, yoyo: true, repeat: -1, duration: 260 });
            pellets.set(x + ',' + y, { big, img }); left++;
          }
        };
        const mk = (x, y, dx = 0, dy = 0) => ({ x, y, dx, dy, t: 0 });
        let pac, ghosts;
        const resetPositions = () => {
          pac = mk(start[0], start[1]); want = null; running = false; chain = 0; fright = 0;
          ghosts = [
            { ...mk(9, 7, -1, 0), id: 0, out: false, wait: 0 },
            { ...mk(ROOM[0][0], ROOM[0][1]), id: 1, out: false, wait: 2 },
            { ...mk(ROOM[1][0], ROOM[1][1]), id: 2, out: false, wait: 5 },
            { ...mk(ROOM[2][0], ROOM[2][1]), id: 3, out: false, wait: 8 },
          ];
          msg.setVisible(true);
        };
        fillPellets(); resetPositions();

        const pacSpeed = () => 6.2;
        const ghostSpeed = gh => (gh.eyes ? 7 : fright > 0 ? 3.2 : Math.min(6.6, 5.2 + level * 0.25));
        const frightTime = () => Math.max(2.5, 7.5 - level * 0.9);

        const setWant = name => {
          if (!alive || !DIR[name]) return;
          want = DIR[name];
          if (!running) { running = true; msg.setVisible(false); }
        };
        turnTo = setWant;
        const reverse = e => { // virar pra trás no meio da casa: troca a casa de origem
          const from = [(e.x + e.dx + COLS) % COLS, e.y + e.dy];
          e.x = from[0]; e.y = from[1]; e.dx = -e.dx; e.dy = -e.dy; e.t = 1 - e.t;
        };

        const chooseGhost = gh => {
          const dirs = Object.values(DIR).filter(d => nextTile(gh.x, gh.y, d));
          let opts = dirs.filter(d => !(d[0] === -gh.dx && d[1] === -gh.dy));
          if (!opts.length) opts = dirs;
          if (!opts.length) return [0, 0];
          if (fright > 0 && gh.out) return opts[rand(0, opts.length - 1)];
          let target;
          if (!gh.out) target = [9, 6];
          else {
            const chase = (clock % 27) < 20;
            const ahead = n => [pac.x + pac.dx * n, pac.y + pac.dy * n];
            if (!chase) target = CORNERS[gh.id];
            else if (gh.id === 0) target = [pac.x, pac.y];
            else if (gh.id === 1) target = ahead(4);
            else if (gh.id === 2) target = [pac.x - pac.dx * 4, pac.y - pac.dy * 4];
            else target = Math.hypot(gh.x - pac.x, gh.y - pac.y) > 7 ? [pac.x, pac.y] : CORNERS[3];
          }
          let best = opts[0], bd = Infinity;
          for (const d of opts) {
            const n = nextTile(gh.x, gh.y, d), dist = (n[0] - target[0]) ** 2 + (n[1] - target[1]) ** 2 + Math.random() * 0.01;
            if (dist < bd) { bd = dist; best = d; }
          }
          return best;
        };

        const eat = () => {
          const k = pac.x + ',' + pac.y;
          if (!pellets.has(k)) return;
          const { big, img } = pellets.get(k);
          this.tweens.killTweensOf(img); img.destroy();
          pellets.delete(k); left--;
          score += big ? 50 : 10; hud.p.textContent = score;
          if (big) { fright = frightTime(); chain = 0; sfx.good(); } else beep(pac.x % 2 ? 420 : 380, 30, 'square', 0.02);
          if (!left) {
            level++; hud.f.textContent = level;
            floatText(this, W / 2, 11 * T, `Fase ${level}!`, '#7cffb0'); sfx.record();
            fillPellets(); resetPositions(); freeze = 1000;
          }
        };

        const die = () => {
          alive = false; lives--; hud.v.innerHTML = hearts(lives);
          sfx.boom(); this.cameras.main.shake(220, 0.01);
          if (lives <= 0) { msg.setText('Fim de jogo').setVisible(true); this.time.delayedCall(900, () => done(score)); return; }
          dead = 1000;
        };

        const advance = (e, dt, onArrive, choose) => {
          e.t += dt * (e.speed || 1);
          while (e.t >= 1) {
            e.t -= 1;
            const n = nextTile(e.x, e.y, [e.dx, e.dy]);
            if (!n) { e.t = 0; e.dx = e.dy = 0; break; }
            e.x = n[0]; e.y = n[1];
            onArrive(e);
            const d = choose(e);
            e.dx = d[0]; e.dy = d[1];
            if (!e.dx && !e.dy) { e.t = 0; break; }
          }
        };

        this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
        this.input.keyboard.on('keydown', e => { const n = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (n) setWant(n); });
        let sx = 0, sy = 0;
        this.input.on('pointerdown', p => { sx = p.x; sy = p.y; });
        this.input.on('pointermove', p => {
          if (!p.isDown) return;
          const dx = p.x - sx, dy = p.y - sy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
          setWant(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
          sx = p.x; sy = p.y;
        });

        const pos = e => {
          let px = (e.x + e.dx * e.t + 0.5) * T;
          if (px < 0) px += W; else if (px > W) px -= W;
          return [px, (e.y + e.dy * e.t + 0.5) * T];
        };

        this.events.on('update', (time, delta) => {
          const dt = Math.min(delta, 50) / 1000;
          if (dead > 0) { dead -= delta; if (dead <= 0) { dead = 0; alive = true; resetPositions(); } }
          if (alive && running && freeze <= 0) {
            clock += dt;
            if (fright > 0) fright -= dt;
            // jogador
            pac.speed = pacSpeed();
            if (want) {
              if (!pac.dx && !pac.dy) { if (nextTile(pac.x, pac.y, want)) { pac.dx = want[0]; pac.dy = want[1]; pac.t = 0; } }
              else if (want[0] === -pac.dx && want[1] === -pac.dy) reverse(pac);
            }
            advance(pac, dt, eat, e => (want && nextTile(e.x, e.y, want) ? want : nextTile(e.x, e.y, [e.dx, e.dy]) ? [e.dx, e.dy] : [0, 0]));
            // fantasmas
            for (const gh of ghosts) {
              if (gh.wait > 0) { gh.wait -= dt; if (gh.wait > 0) continue; }
              gh.speed = ghostSpeed(gh);
              if (!gh.dx && !gh.dy) { const d = chooseGhost(gh); gh.dx = d[0]; gh.dy = d[1]; }
              advance(gh, dt, e => { if (e.y <= 6) { e.out = true; e.eyes = false; } }, chooseGhost);
            }
            // encontro
            const [ppx, ppy] = pos(pac);
            for (const gh of ghosts) {
              const [gx, gy] = pos(gh);
              if (gh.eyes || Math.hypot(gx - ppx, gy - ppy) > T * 0.62) continue; // só os olhos voltando pra casa não machucam
              if (fright > 0) {
                chain++;
                const pts = 100 * 2 ** chain; // 200, 400, 800, 1600
                score += pts; hud.p.textContent = score;
                floatText(this, gx, gy - 8, '+' + pts, '#7ad7ff'); burst.setParticleTint(0x4d79ff); burst.explode(14, gx, gy);
                beep(700 + chain * 120, 120, 'triangle');
                Object.assign(gh, mk(9, 9), { out: false, eyes: true, wait: 2.5 });
              } else { die(); break; }
            }
          } else if (freeze > 0) freeze -= delta;

          // desenho
          g.clear();
          const flashing = fright > 0 && fright < 2 && Math.floor(time / 180) % 2;
          for (const gh of ghosts) {
            const [gx, gy] = pos(gh), r = T / 2 - 2;
            const scared = fright > 0 && !gh.eyes;
            if (gh.eyes) {
              g.fillStyle(0xffffff).fillCircle(gx - 4, gy - 2, 3.4).fillCircle(gx + 4, gy - 2, 3.4);
              g.fillStyle(0x161625).fillCircle(gx - 4 + gh.dx * 1.6, gy - 2 + gh.dy * 1.6, 1.8).fillCircle(gx + 4 + gh.dx * 1.6, gy - 2 + gh.dy * 1.6, 1.8);
              continue;
            }
            g.fillStyle(scared ? (flashing ? 0xffffff : 0x2d4bff) : GHOST_COLORS[gh.id]);
            g.fillRoundedRect(gx - r, gy - r, r * 2, r * 2 + 1, { tl: r, tr: r, bl: 3, br: 3 });
            g.fillStyle(0xffffff);
            if (scared) {
              g.fillCircle(gx - 4, gy - 2, 2).fillCircle(gx + 4, gy - 2, 2);
              g.fillRect(gx - 6, gy + 4, 12, 2);
            } else {
              g.fillCircle(gx - 4, gy - 3, 3.4).fillCircle(gx + 4, gy - 3, 3.4);
              g.fillStyle(0x161625).fillCircle(gx - 4 + gh.dx * 1.6, gy - 3 + gh.dy * 1.6, 1.8).fillCircle(gx + 4 + gh.dx * 1.6, gy - 3 + gh.dy * 1.6, 1.8);
            }
          }
          const [px, py] = pos(pac), face = Math.atan2(pac.dy || 0, pac.dx || 1);
          const open = (running && alive && (pac.dx || pac.dy) ? 0.12 + 0.55 * Math.abs(Math.sin(time / 70)) : 0.4) * (dead ? 0 : 1);
          if (dead) {
            const k = 1 - dead / 1000; // some aos poucos
            g.fillStyle(0xffe14d).slice(px, py, T / 2 - 1, -Math.PI / 2 + k * Math.PI, -Math.PI / 2 - k * Math.PI + Math.PI * 2, false).fillPath();
          } else {
            g.fillStyle(0xffe14d).slice(px, py, T / 2 - 1, face + open, face + Math.PI * 2 - open, false).fillPath();
          }
        });
      },
    });
  }
};
