GAMES.corredor = {
  name: 'Corredor', icon: 'corredor', hue: 45, desc: 'Corra sem parar! Toque, clique ou Espaço/↑ pra pular; segure ↓ (ou toque na parte de baixo) pra abaixar. Cactos pedem pulo; pássaros altos, abaixar. Cada vez mais rápido.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 480, H = 300, GY = 250, GRAV = 2300, JUMP = -820;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Velocidade<b id="v">1.0x</b></span></div><div class="phaser-wrap" id="pw"></div><p class="hint">Espaço/toque = pular · ↓ ou parte de baixo da tela = abaixar</p>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v') };
    const col = { sky: 0x1d1f2e, ground: 0x4a4f6e, me: hex('--yellow'), cactus: hex('--green'), bird: hex('--red'), cloud: 0x2a2d44, dust: 0x8a8fb0 };
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        const X = 80; // posição fixa do corredor
        let y = GY, vy = 0, ducking = false, started = false, alive = true, dist = 0, speed = 300, spawnIn = 900, tick = 0;
        let obs = [];
        const clouds = Array.from({ length: 4 }, (_, i) => ({ x: i * 140 + rand(0, 60), y: rand(30, 110), w: rand(40, 70) }));
        const marks = Array.from({ length: 14 }, (_, i) => ({ x: i * 40 + rand(0, 20), w: rand(4, 14), dy: rand(6, 22) }));
        const g = this.add.graphics();
        const dust = this.add.particles(0, 0, 'dot', { speed: { min: 20, max: 60 }, angle: { min: 190, max: 250 }, lifespan: 260, scale: { start: 0.5, end: 0 }, tint: col.dust, emitting: false });
        const msg = this.add.text(W / 2, 110, 'Toque ou Espaço pra correr', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '20px', color: '#c9cce0' }).setOrigin(0.5);
        const onGround = () => y >= GY;
        const jump = () => {
          if (!alive) return;
          if (!started) { started = true; msg.destroy(); }
          if (onGround() && !ducking) { vy = JUMP; dust.explode(5, X, GY); beep(560, 70, 'triangle', 0.04); }
        };
        const die = () => {
          alive = false; sfx.bad();
          this.cameras.main.shake(240, 0.012); this.cameras.main.flash(180, 255, 80, 100);
          this.time.delayedCall(800, () => done(Math.floor(dist / 10)));
        };
        this.input.keyboard.addCapture('SPACE,UP,DOWN');
        this.input.keyboard.on('keydown', e => {
          if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key) && !e.repeat) jump();
          if (['ArrowDown', 's', 'S'].includes(e.key)) { ducking = true; if (!started) jump(); if (!onGround()) vy = Math.max(vy, 500); } // abaixar no ar = cai rápido
        });
        this.input.keyboard.on('keyup', e => { if (['ArrowDown', 's', 'S'].includes(e.key)) ducking = false; });
        this.input.on('pointerdown', p => { if (p.y > H * 0.68 && started) { ducking = true; if (!onGround()) vy = Math.max(vy, 500); } else jump(); });
        this.input.on('pointerup', () => { ducking = false; });
        const spawn = () => {
          const birdOk = dist > 1800 && Math.random() < 0.3;
          if (birdOk) {
            // alto (abaixar) ou baixo (pular)
            const high = Math.random() < 0.55;
            obs.push({ kind: 'bird', x: W + 30, w: 34, h: 20, y: high ? GY - 30 : GY - 8, flap: 0 });
          } else {
            const n = rand(1, speed > 420 ? 3 : 2), h = rand(30, 52);
            obs.push({ kind: 'cactus', x: W + 30, w: 16 * n + (n - 1) * 3, h, y: GY, n });
          }
          // tempo (real) até o próximo: a distância cresce com a velocidade, então sempre dá pra pousar e pular de novo
          spawnIn = 800 + Math.random() * 800;
        };
        this.events.on('update', (time, delta) => {
          const dt = Math.min(delta, 50) / 1000;
          tick += dt;
          if (started && alive) {
            speed = Math.min(640, 300 + dist / 22);
            dist += speed * dt;
            vy += GRAV * dt; y += vy * dt;
            if (y >= GY) { y = GY; vy = 0; }
            spawnIn -= delta;
            if (spawnIn <= 0) spawn();
            for (const o of obs) { o.x -= speed * dt; if (o.kind === 'bird') o.flap += dt * 10; }
            obs = obs.filter(o => o.x > -60);
            hud.p.textContent = Math.floor(dist / 10);
            hud.v.textContent = (speed / 300).toFixed(1) + 'x';
            // caixa do corredor (um pouco menor que o desenho = perdoa bordas)
            const hh = ducking && onGround() ? 22 : 42, bx0 = X - 10, bx1 = X + 10, by0 = y - hh + 3, by1 = y - 2;
            for (const o of obs) {
              const ox0 = o.x - o.w / 2 + 3, ox1 = o.x + o.w / 2 - 3, oy1 = o.y - 2, oy0 = o.y - o.h + 3;
              if (bx0 < ox1 && bx1 > ox0 && by0 < oy1 && by1 > oy0) { die(); break; }
            }
          }
          const sp = started && alive ? speed : 0;
          for (const c of clouds) { c.x -= sp * dt * 0.25; if (c.x < -80) { c.x = W + rand(0, 80); c.y = rand(30, 110); } }
          for (const m of marks) { m.x -= sp * dt; if (m.x < -20) { m.x = W + rand(0, 40); m.w = rand(4, 14); m.dy = rand(6, 22); } }
          g.clear();
          g.fillStyle(col.cloud);
          for (const c of clouds) g.fillRoundedRect(c.x, c.y, c.w, 12, 6);
          g.fillStyle(col.ground).fillRect(0, GY, W, 3);
          for (const m of marks) g.fillRect(m.x, GY + m.dy, m.w, 2);
          for (const o of obs) {
            if (o.kind === 'cactus') {
              for (let i = 0; i < o.n; i++) {
                const cx = o.x - o.w / 2 + i * 19, ch = o.h - (i % 2) * 8;
                g.fillStyle(col.cactus).fillRoundedRect(cx, GY - ch, 16, ch, 5).fillRect(cx - 5, GY - ch * 0.62, 5, 10).fillRect(cx + 16, GY - ch * 0.5, 5, 10);
              }
            } else {
              const up = Math.sin(o.flap) > 0;
              g.fillStyle(col.bird).fillRoundedRect(o.x - 17, o.y - 20, 34, 12, 6).fillTriangle(o.x - 17, o.y - 14, o.x - 28, o.y - 18, o.x - 17, o.y - 10);
              g.fillTriangle(o.x - 4, o.y - 16, o.x + 8, o.y - 16, o.x + 2, o.y - (up ? 34 : 4));
              g.fillStyle(0xffffff).fillCircle(o.x + 8, o.y - 16, 2.2);
            }
          }
          // corredor
          const duck = ducking && onGround(), run = Math.floor(tick * 14) % 2;
          g.fillStyle(col.me);
          if (duck) {
            g.fillRoundedRect(X - 16, y - 22, 34, 16, 6).fillCircle(X + 14, y - 20, 8);
            g.fillRect(X - 8 + (started && run ? 4 : 0), y - 8, 6, 8).fillRect(X + 4 - (started && run ? 4 : 0), y - 8, 6, 8);
            g.fillStyle(0x161625).fillCircle(X + 17, y - 22, 1.8);
          } else {
            g.fillRoundedRect(X - 10, y - 36, 20, 24, 7).fillCircle(X + 3, y - 38, 9);
            const air = !onGround(), a = air ? 3 : (started && alive ? (run ? 5 : -5) : 0);
            g.fillRect(X - 7 + a, y - 14, 6, 14).fillRect(X + 2 - a, y - 14, 6, 14);
            g.fillStyle(0x161625).fillCircle(X + 6, y - 40, 1.8);
          }
        });
      },
    });
  }
};
