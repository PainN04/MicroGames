GAMES.comecome = {
  name: 'Come-Come', icon: 'comecome', hue: 52, desc: 'Coma todas as bolinhas e fuja dos fantasmas. Bolas grandes deixam eles azuis: aí é você quem come! Setas, WASD, deslize ou os botões. A cereja no meio vale bônus e cada fase troca o labirinto. 3 vidas.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    // # parede · . bolinha · o bolinha grande · P onde o jogador começa · espaço = vazio. A linha 9 é um túnel que dá a volta.
    const MID = [
      '####.### # ###.####',
      '   #.#       #.#   ',
      '####.# ## ## #.####',
      '    .  #   #  .    ',
      '####.# ##### #.####',
      '   #.#       #.#   ',
      '####.# ##### #.####'];
    // 3 labirintos que se revezam a cada fase (o meio, com a casa dos fantasmas e o túnel, é igual nos 3)
    const MAZES = [
      ['###################',
        '#........#........#',
        '#o##.###.#.###.##o#',
        '#.................#',
        '#.##.#.#####.#.##.#',
        '#....#...#...#....#',
        ...MID,
        '#........#........#',
        '#.##.###.#.###.##.#',
        '#o.#.....P.....#.o#',
        '##.#.#.#####.#.#.##',
        '#....#...#...#....#',
        '#.######.#.######.#',
        '#.................#',
        '###################'],
      ['###################',
        '#.................#',
        '#.##.#.#####.#.##.#',
        '#o##.#...#...#.##o#',
        '#....###.#.###....#',
        '#.##.....#.....##.#',
        ...MID,
        '#........#........#',
        '#.###.##.#.##.###.#',
        '#o..#....P....#..o#',
        '###.#.#.###.#.#.###',
        '#.....#..#..#.....#',
        '#.###.##.#.##.###.#',
        '#.................#',
        '###################'],
      ['###################',
        '#........#........#',
        '#.#####.###.#####.#',
        '#o...............o#',
        '#.##.#.##.##.#.##.#',
        '#....#...#...#....#',
        ...MID,
        '#........#........#',
        '#.##.#.#####.#.##.#',
        '#o.#.#...P...#.#.o#',
        '##.#.###.#.###.#.##',
        '#.................#',
        '#.######.#.######.#',
        '#........#........#',
        '###################'],
    ];
    let MAZE = MAZES[0];
    const COLS = 19, ROWS = 21, T = 24, W = COLS * T, H = ROWS * T, TUNNEL = 9;
    const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const KEYS = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
    const arrow = (d, rot) => `<button class="dbtn" data-d="${d}" tabindex="-1" aria-label="${d}" style="--r:${rot}deg">${icon('arrow-left')}</button>`;
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Vidas<b id="v" class="lives">${hearts(3)}</b></span><span class="stat">Fase<b id="f">1</b></span></div>
      <div class="phaser-wrap" id="pw"></div>
      <div class="dpad flat" aria-hidden="true">${arrow('left', 0)}${arrow('up', 90)}${arrow('down', -90)}${arrow('right', 180)}</div>
      <p class="hint">Setas, WASD ou deslize pra começar</p>`;
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v'), f: el.querySelector('#f') };
    let turnTo = () => {};
    el.querySelectorAll('.dbtn').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); turnTo(b.dataset.d); }));

    // chão alcançável a partir do jogador (o resto vira parede), com a volta do túnel. Recalculado a cada labirinto.
    let start, floor;
    const loadFloor = () => {
      for (let y = 0; y < ROWS; y++) { const x = MAZE[y].indexOf('P'); if (x >= 0) start = [x, y]; }
      floor = MAZE.map(r => [...r].map(() => false));
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
    };
    loadFloor();
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
        // paredes em neon (contorno duplo só nas bordas que dão pro corredor), desenhadas uma vez por labirinto numa textura
        // (desenhar ~190 retângulos a cada quadro deixava o celular lento)
        const wallAt = (m, x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS && m[y][x] === '#';
        const wallTex = i => {
          const key = 'maze' + i;
          if (this.textures.exists(key)) return key;
          const m = MAZES[i], w = this.make.graphics({ x: 0, y: 0, add: false });
          w.fillStyle(0x0b0e2a);
          for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (m[y][x] === '#') w.fillRect(x * T, y * T, T, T);
          const edges = (inset, width, color, alpha) => {
            w.lineStyle(width, color, alpha);
            for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
              if (m[y][x] !== '#') continue;
              const X = x * T, Y = y * T, a = inset, z = T - inset;
              const open = (dx, dy) => !wallAt(m, x + dx, y + dy) && !(x + dx < 0 || x + dx >= COLS || y + dy < 0 || y + dy >= ROWS);
              // cada lado aberto vira uma linha; as pontas se estendem até a casa vizinha se ela também for parede com o mesmo lado aberto
              if (open(0, -1)) w.lineBetween(X + (wallAt(m, x - 1, y) ? 0 : a), Y + a, X + (wallAt(m, x + 1, y) ? T : z), Y + a);
              if (open(0, 1)) w.lineBetween(X + (wallAt(m, x - 1, y) ? 0 : a), Y + z, X + (wallAt(m, x + 1, y) ? T : z), Y + z);
              if (open(-1, 0)) w.lineBetween(X + a, Y + (wallAt(m, x, y - 1) ? 0 : a), X + a, Y + (wallAt(m, x, y + 1) ? T : z));
              if (open(1, 0)) w.lineBetween(X + z, Y + (wallAt(m, x, y - 1) ? 0 : a), X + z, Y + (wallAt(m, x, y + 1) ? T : z));
            }
          };
          const hue = [0x3d6bff, 0xb04dff, 0x18d1b0][i];
          edges(4, 7, hue, 0.18); // brilho
          edges(4, 2, hue, 1);
          edges(8, 1.2, hue, 0.55); // 2ª linha, por dentro
          // porta da casa dos fantasmas
          w.fillStyle(0xff9ee5, 0.9).fillRect(9 * T + 3, 8 * T + T / 2 - 2, T - 6, 3);
          w.generateTexture(key, W, H);
          w.destroy();
          return key;
        };
        const wallsImg = this.add.image(0, 0, wallTex(0)).setOrigin(0).setDepth(0);
        // fantasmas e jogador desenhados uma vez em texturas (corpo com sombra, saia ondulada e brilho)
        const ghostTex = (key, color) => {
          if (this.textures.exists(key)) return;
          const S = 44, c = S / 2, r = 18, k = this.make.graphics({ x: 0, y: 0, add: false });
          const body = (col, dx, dy, sc) => {
            k.fillStyle(col);
            k.fillCircle(c + dx, c - 3 + dy, r * sc);
            k.fillRect(c - r * sc + dx, c - 3 + dy, r * 2 * sc, r * sc + 2);
            for (let i = 0; i < 4; i++) k.fillCircle(c - r * sc + dx + (i + 0.5) * (r * 2 * sc / 4), c + r * sc - 1 + dy, r * sc / 4);
          };
          body(Phaser.Display.Color.ValueToColor(color).darken(35).color, 0, 1, 1);
          body(color, -1, 0, 0.93);
          k.fillStyle(0xffffff, 0.35).fillEllipse(c - 7, c - 12, 9, 5);
          k.generateTexture(key, S, S); k.destroy();
        };
        GHOST_COLORS.forEach((col, i) => ghostTex('gh' + i, col));
        ghostTex('ghs', 0x2d4bff); ghostTex('ghw', 0xe8ecff);
        const gimg = GHOST_COLORS.map((_, i) => this.add.image(0, 0, 'gh' + i).setDisplaySize(T + 2, T + 2).setDepth(9));
        // fruta bônus (cereja desenhada)
        if (!this.textures.exists('cherry')) {
          const k = this.make.graphics({ x: 0, y: 0, add: false });
          k.lineStyle(2.5, 0x3fae4a).beginPath().moveTo(11, 26).lineTo(22, 6).lineTo(31, 26).strokePath();
          k.fillStyle(0x3fae4a).fillEllipse(26, 7, 11, 5);
          for (const [x, y] of [[11, 30], [30, 30]]) {
            k.fillStyle(0x9b0d1f).fillCircle(x, y, 8); k.fillStyle(0xe8283c).fillCircle(x - 1, y - 1, 7);
            k.fillStyle(0xffffff, 0.7).fillCircle(x - 3.5, y - 3.5, 2);
          }
          k.generateTexture('cherry', 42, 40); k.destroy();
        }
        const fruit = this.add.image(9 * T + T / 2, 11 * T + T / 2, 'cherry').setDisplaySize(T + 4, T + 4).setDepth(5).setVisible(false);
        let fruitT = 0, eaten = 0;
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
          pellets.delete(k); left--; eaten++;
          if (eaten === 70 || eaten === 150) { fruit.setVisible(true); fruitT = 9.5; this.tweens.add({ targets: fruit, scale: { from: 0, to: fruit.scale }, duration: 250, ease: 'Back.out' }); }
          score += big ? 50 : 10; hud.p.textContent = score;
          if (big) { fright = frightTime(); chain = 0; sfx.good(); } else beep(pac.x % 2 ? 420 : 380, 30, 'square', 0.02);
          if (!left) {
            level++; hud.f.textContent = level;
            floatText(this, W / 2, 11 * T, `Fase ${level}!`, '#7cffb0'); sfx.record();
            MAZE = MAZES[(level - 1) % MAZES.length]; loadFloor();
            wallsImg.setTexture(wallTex((level - 1) % MAZES.length));
            fruit.setVisible(false); fruitT = 0; eaten = 0;
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
            // fruta: some depois de uns segundos; comer vale 100 por fase (até 1000)
            if (fruitT > 0) {
              fruitT -= dt;
              if (fruitT <= 0) fruit.setVisible(false);
              else if (pac.x === 9 && pac.y === 11) {
                const pts = Math.min(1000, 100 * level);
                score += pts; hud.p.textContent = score; fruitT = 0; fruit.setVisible(false);
                floatText(this, fruit.x, fruit.y - 10, '+' + pts, '#ff7a8a'); burst.setParticleTint(0xe8283c); burst.explode(16, fruit.x, fruit.y); sfx.coin();
              }
            }
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
            const [gx, gy] = pos(gh), scared = fright > 0 && !gh.eyes, img = gimg[gh.id];
            img.setVisible(!gh.eyes).setPosition(gx, gy + Math.sin(time / 120 + gh.id) * 0.8);
            if (!gh.eyes) img.setTexture(scared ? (flashing ? 'ghw' : 'ghs') : 'gh' + gh.id);
            if (scared) {
              g.fillStyle(flashing ? 0xff4d5e : 0xffffff).fillCircle(gx - 4, gy - 2, 2).fillCircle(gx + 4, gy - 2, 2);
              g.lineStyle(1.6, flashing ? 0xff4d5e : 0xffffff).beginPath();
              for (let i = 0; i <= 6; i++) g[i ? 'lineTo' : 'moveTo'](gx - 6 + i * 2, gy + 5 + (i % 2 ? -1.5 : 1.5));
              g.strokePath();
            } else {
              const ey = gh.eyes ? -2 : -3;
              g.fillStyle(0xffffff).fillEllipse(gx - 4, gy + ey, 6.4, 7.6).fillEllipse(gx + 4, gy + ey, 6.4, 7.6);
              g.fillStyle(0x1b2bd6).fillCircle(gx - 4 + gh.dx * 1.8, gy + ey + gh.dy * 1.8, 1.9).fillCircle(gx + 4 + gh.dx * 1.8, gy + ey + gh.dy * 1.8, 1.9);
            }
          }
          const [px, py] = pos(pac), face = Math.atan2(pac.dy || 0, pac.dx || 1);
          const open = (running && alive && (pac.dx || pac.dy) ? 0.12 + 0.55 * Math.abs(Math.sin(time / 70)) : 0.4) * (dead ? 0 : 1);
          if (dead) {
            const k = 1 - dead / 1000; // some aos poucos
            g.fillStyle(0xffe14d).slice(px, py, T / 2 - 1, -Math.PI / 2 + k * Math.PI, -Math.PI / 2 - k * Math.PI + Math.PI * 2, false).fillPath();
          } else {
            g.fillStyle(0xc99a00).slice(px + 1, py + 1, T / 2 - 1, face + open, face + Math.PI * 2 - open, false).fillPath();
            g.fillStyle(0xffe14d).slice(px, py, T / 2 - 1.5, face + open, face + Math.PI * 2 - open, false).fillPath();
            g.fillStyle(0xfff6c2, 0.8).fillCircle(px - 3, py - 4, 2.2);
          }
        });
      },
    });
  }
};
