GAMES.voa = {
  name: 'Voa Voa', emoji: '🐦', hue: 275, desc: 'Toque, clique ou Espaço pra bater as asas. Passe entre os canos!',
  better: 'high', unit: 'canos', phaser: true,
  start(el, done) {
    const W = 420, H = 560, R = 14, BX = 120, PIPE_W = 64;
    el.innerHTML = '<div class="hud"><span class="stat">Canos<b id="p">0</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = el.querySelector('#p');
    const col = { bird: hex('--yellow'), beak: hex('--accent'), pipe: hex('--green'), cap: 0x1e8a55 };
    // círculo (cx, cy, r) encosta no retângulo [x0..x1] × [y0..y1]?
    const hitsRect = (cx, cy, r, x0, y0, x1, y1) => {
      const nx = Phaser.Math.Clamp(cx, x0, x1), ny = Phaser.Math.Clamp(cy, y0, y1);
      return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
    };
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        let y = H / 2, vy = 0, started = false, alive = true, pts = 0, spawnIn = 0;
        const pipes = [];
        const gfx = this.add.graphics();
        const bird = this.add.container(BX, y, [
          this.add.circle(0, 0, R, col.bird),
          this.add.circle(5, -4, 4, 0xffffff), this.add.circle(6, -4, 2, 0x161625),
          this.add.triangle(R + 1, 2, 0, -4, 0, 4, 9, 0, col.beak),
        ]);
        const trail = this.add.particles(0, 0, 'dot', { speed: 40, angle: { min: 160, max: 200 }, lifespan: 300, scale: { start: 0.7, end: 0 }, tint: col.bird, emitting: false });
        const msg = this.add.text(W / 2, H / 2 + 70, 'Toque ou Espaço pra voar', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '22px', color: '#c9cce0' }).setOrigin(0.5);
        const flap = () => {
          if (!alive) return;
          if (!started) { started = true; msg.destroy(); }
          vy = -330;
          trail.explode(5, BX - R, y);
          beep(520, 50, 'triangle', 0.04);
        };
        const die = () => {
          alive = false;
          sfx.bad();
          this.cameras.main.shake(260, 0.012);
          this.cameras.main.flash(200, 255, 80, 100);
          this.time.delayedCall(800, () => done(pts));
        };
        this.input.keyboard.addCapture('SPACE,UP');
        this.input.keyboard.on('keydown', e => { if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key) && !e.repeat) flap(); });
        this.input.on('pointerdown', flap);
        this.events.on('update', (time, delta) => {
          const dt = Math.min(delta, 50) / 1000;
          if (started && alive) {
            vy = Math.min(vy + 1100 * dt, 600);
            y += vy * dt;
            if (y < R) { y = R; vy = 0; }
            const speed = Math.min(170 + pts * 3, 260);
            spawnIn -= delta;
            if (spawnIn <= 0) {
              pipes.push({ x: W + PIPE_W, gapY: rand(110, H - 110), gap: Math.max(130, 170 - pts * 2), scored: false });
              spawnIn = 1500 * 170 / speed; // mesma distância entre canos mesmo acelerando
            }
            for (const p of pipes) {
              p.x -= speed * dt;
              const x0 = p.x - PIPE_W / 2, x1 = p.x + PIPE_W / 2, top = p.gapY - p.gap / 2, bot = p.gapY + p.gap / 2;
              if (hitsRect(BX, y, R - 2, x0, 0, x1, top) || hitsRect(BX, y, R - 2, x0, bot, x1, H)) { die(); break; }
              if (!p.scored && x1 < BX - R) {
                p.scored = true; hud.textContent = ++pts;
                floatText(this, BX, y - 30, '+1', '#7cffb0'); sfx.good();
              }
            }
            while (pipes.length && pipes[0].x < -PIPE_W) pipes.shift();
            if (y > H - R) die();
          } else if (!started) y = H / 2 + Math.sin(time / 250) * 8; // flutuando antes de começar
          bird.y = y;
          bird.rotation = started ? Phaser.Math.Clamp(vy / 600, -0.5, 1.2) : 0;
          gfx.clear();
          for (const p of pipes) {
            const x0 = p.x - PIPE_W / 2, top = p.gapY - p.gap / 2, bot = p.gapY + p.gap / 2;
            gfx.fillStyle(col.pipe).fillRect(x0, 0, PIPE_W, top).fillRect(x0, bot, PIPE_W, H - bot);
            gfx.fillStyle(col.cap).fillRect(x0 - 4, top - 18, PIPE_W + 8, 18).fillRect(x0 - 4, bot, PIPE_W + 8, 18);
          }
        });
      },
    });
  }
};
