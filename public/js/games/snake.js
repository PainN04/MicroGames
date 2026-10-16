GAMES.snake = {
  name: 'Cobrinha', icon: 'worm', hue: 150, desc: 'Setas, WASD ou deslize o dedo. Acelera a cada fruta!',
  better: 'high', unit: 'pontos', phaser: true,
  // Phaser. Lógica em grade (20×20) igual à de antes; o desenho desliza entre as casas.
  start(el, done) {
    const N = 20, S = 24, W = N * S;
    const STEP_START = 120, STEP_MIN = 70, STEP_DEC = 3;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Velocidade<b id="v">1.0x</b></span></div><div class="phaser-wrap" id="pw"></div><p class="hint">Setas, WASD ou deslize o dedo pra começar</p>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v') };
    const col = { tile: 0x24273a, food: hex('--red'), body: hex('--green'), head: hex('--yellow') };
    const KEYS = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
    return mountPhaser(el.querySelector('#pw'), W, W, {
      create() {
        let snake = [{ x: 10, y: 10 }], from = snake, dir = null, queue = [], food, pts = 0;
        let step = STEP_START, acc = 0, started = false, alive = true;
        dotTexture(this);
        const board = this.add.graphics().fillStyle(col.tile);
        for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x + y) % 2) board.fillRect(x * S, y * S, S, S);
        const foodDot = this.add.circle(0, 0, S / 2 - 4, col.food);
        this.tweens.add({ targets: foodDot, scale: 1.25, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.InOut' });
        const body = this.add.graphics();
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 200 }, lifespan: 450, scale: { start: 1, end: 0 }, tint: col.food, emitting: false });
        const msg = this.add.text(W / 2, W / 2 + 56, 'Aperte uma seta', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '22px', color: '#c9cce0' }).setOrigin(0.5);

        const placeFood = () => {
          do food = { x: rand(0, N - 1), y: rand(0, N - 1) }; while (snake.some(s => s.x === food.x && s.y === food.y));
          foodDot.setPosition(food.x * S + S / 2, food.y * S + S / 2);
        };
        const turn = k => {
          if (!alive) return;
          const last = queue.at(-1) || dir;
          if (last && last[0] === -k[0] && last[1] === -k[1]) return;
          if (last && last[0] === k[0] && last[1] === k[1]) return;
          if (queue.length < 3) queue.push(k);
          if (!started) { started = true; msg.destroy(); }
        };
        const die = () => {
          alive = false;
          sfx.bad();
          this.cameras.main.shake(260, 0.012);
          this.cameras.main.flash(200, 255, 80, 100);
          this.time.delayedCall(750, () => done(pts));
        };
        const tick = () => {
          if (queue.length) dir = queue.shift();
          const h = { x: snake[0].x + dir[0], y: snake[0].y + dir[1] };
          if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N || snake.some(s => s.x === h.x && s.y === h.y)) return die();
          // `from[i]` = onde o segmento i estava antes do passo (o desenho desliza de from[i] até snake[i]).
          from = snake.map(s => ({ ...s }));
          snake.unshift(h);
          if (h.x === food.x && h.y === food.y) {
            hud.p.textContent = ++pts;
            step = Math.max(STEP_MIN, step - STEP_DEC);
            hud.v.textContent = (STEP_START / step).toFixed(1) + 'x';
            burst.explode(16, foodDot.x, foodDot.y);
            floatText(this, foodDot.x, foodDot.y - 10, '+1', '#7cffb0');
            beep(660 + pts * 12, 70, 'triangle');
            placeFood();
          } else snake.pop();
        };
        const draw = t => {
          body.clear();
          for (let i = snake.length - 1; i >= 0; i--) {
            // ao crescer, o segmento novo do rabo não tem from[i]: nasce parado onde o rabo estava
            const s = snake[i], f = from[i] ?? from.at(-1);
            const x = (f.x + (s.x - f.x) * t) * S, y = (f.y + (s.y - f.y) * t) * S;
            body.fillStyle(i ? col.body : col.head).fillRoundedRect(x + 2, y + 2, S - 4, S - 4, 7);
          }
        };

        this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
        this.input.keyboard.on('keydown', e => { const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (k) turn(k); });
        let sx = 0, sy = 0;
        this.input.on('pointerdown', p => { sx = p.x; sy = p.y; });
        this.input.on('pointerup', p => {
          const dx = p.x - sx, dy = p.y - sy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
          turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
        });
        this.events.on('update', (time, delta) => {
          if (started && alive) {
            acc += delta;
            while (acc >= step && alive) { acc -= step; tick(); }
          }
          draw(started && alive ? Math.min(1, acc / step) : 1);
        });
        placeFood();
      },
    });
  }
};
