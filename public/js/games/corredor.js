GAMES.corredor = {
  name: 'Corredor', icon: 'corredor', hue: 35, desc: 'Seja o pássaro mais rápido do deserto! Toque, clique ou Espaço/↑ pra pular; segure ↓ (ou toque na parte de baixo) pra abaixar. Cactos pedem pulo; urubus altos, abaixar. Cada vez mais rápido.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 480, H = 300, GY = 250, GRAV = 2300, JUMP = -820;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Velocidade<b id="v">1.0x</b></span></div><div class="phaser-wrap" id="pw"></div><p class="hint">Espaço/toque = pular · ↓ ou parte de baixo da tela = abaixar</p>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v') };
    // Tema: deserto ao entardecer. O corredor é um pássaro de crista que gira as pernas feito roda; urubus voam baixo.
    const col = {
      skyTop: 0x2c2a5e, skyBot: 0xf5a25d, sun: 0xffd37a, sunGlow: 0xffb45c, mesaFar: 0xc4664a, mesaNear: 0x8f4431,
      cloud: 0xffd2a8, sand: 0xe3aa66, sandDark: 0xc98a4c, pebble: 0xa86d3a, dust: 0xf0d6ac,
      body: 0x4f63d8, bodyDark: 0x2f3597, belly: 0xd5dcff, beak: 0xf2b53a, leg: 0xf0973a, eye: 0x161625,
      cactus: 0x3f9a4f, cactusDark: 0x2b7339, flower: 0xff6f91, vulture: 0x2e2433, vultureWing: 0x4a3d52, head: 0xd9776e, ruff: 0xeee6dc,
      weed: 0x9c6b36,
    };
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        const X = 80; // posição fixa do corredor
        let y = GY, vy = 0, ducking = false, started = false, alive = true, dist = 0, speed = 300, spawnIn = 900, tick = 0, trail = 0;
        let obs = [];
        // céu e sol não mexem: pinta uma vez só
        const sky = this.add.graphics();
        // degradê em faixas (fillGradientStyle só funciona no WebGL; assim fica igual no canvas também)
        const top = Phaser.Display.Color.ValueToColor(col.skyTop), bot = Phaser.Display.Color.ValueToColor(col.skyBot), BANDS = 25;
        for (let i = 0; i < BANDS; i++) {
          const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, BANDS - 1, i);
          sky.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillRect(0, Math.floor(i * GY / BANDS), W, Math.ceil(GY / BANDS) + 1);
        }
        sky.fillStyle(col.sunGlow, 0.18).fillCircle(360, 168, 74).fillStyle(col.sunGlow, 0.3).fillCircle(360, 168, 56);
        sky.fillStyle(col.sun).fillCircle(360, 168, 42);
        const clouds = Array.from({ length: 3 }, (_, i) => ({ x: i * 180 + rand(0, 60), y: rand(26, 90), w: rand(50, 90) }));
        // duas camadas de morros de topo chato (mesas), cada uma num ritmo: dá profundidade
        const mesas = (n, step, hMin, hMax) => Array.from({ length: n }, (_, i) => ({ x: i * step + rand(0, 40), w: rand(70, 130), h: rand(hMin, hMax) }));
        const far = mesas(5, 130, 40, 75), near = mesas(4, 170, 18, 38);
        const marks = Array.from({ length: 14 }, (_, i) => ({ x: i * 40 + rand(0, 20), w: rand(3, 8), dy: rand(8, 44) }));
        const weed = { x: W + 200, rot: 0 }; // bola de feno rolando lá atrás, só enfeite
        const g = this.add.graphics();
        const dust = this.add.particles(0, 0, 'dot', { speed: { min: 20, max: 70 }, angle: { min: 170, max: 230 }, lifespan: 380, scale: { start: 0.9, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: col.dust, emitting: false });
        const msg = this.add.text(W / 2, 96, 'Toque ou Espaço pra correr', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#fff4e0', stroke: '#2c2a5e', strokeThickness: 4 }).setOrigin(0.5);
        const onGround = () => y >= GY;
        const jump = () => {
          if (!alive) return;
          if (!started) { started = true; msg.destroy(); }
          if (onGround() && !ducking) { vy = JUMP; dust.explode(8, X - 4, GY); beep(560, 70, 'triangle', 0.04); }
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
            obs.push({ kind: 'cactus', x: W + 30, w: 16 * n + (n - 1) * 3, h, y: GY, n, flower: Math.random() < 0.35 });
          }
          // tempo (real) até o próximo: a distância cresce com a velocidade, então sempre dá pra pousar e pular de novo
          spawnIn = 800 + Math.random() * 800;
        };
        const drawMesas = (list, color, k, sp, dt) => {
          g.fillStyle(color);
          for (const m of list) {
            m.x -= sp * dt * k;
            if (m.x + m.w < 0) { m.x = W + rand(0, 60); m.w = rand(70, 130); }
            g.fillPoints([{ x: m.x, y: GY }, { x: m.x + 10, y: GY - m.h }, { x: m.x + m.w - 10, y: GY - m.h }, { x: m.x + m.w, y: GY }], true);
          }
        };
        const saguaro = (cx, ch, flower) => {
          // tronco + dois braços em L, com vincos verticais
          g.fillStyle(col.cactus).fillRoundedRect(cx, GY - ch, 16, ch, 7);
          g.fillRoundedRect(cx - 8, GY - ch * 0.62, 8, 6, 3).fillRoundedRect(cx - 8, GY - ch * 0.62 - 12, 6, 16, 3);
          g.fillRoundedRect(cx + 16, GY - ch * 0.48, 8, 6, 3).fillRoundedRect(cx + 18, GY - ch * 0.48 - 10, 6, 14, 3);
          g.fillStyle(col.cactusDark).fillRect(cx + 5, GY - ch + 6, 1.5, ch - 8).fillRect(cx + 10, GY - ch + 6, 1.5, ch - 8);
          if (flower) g.fillStyle(col.flower).fillCircle(cx + 8, GY - ch + 1, 3.5);
        };
        const vulture = o => {
          // urubu de frente pro corredor: cabeça careca à esquerda, asa batendo
          const up = Math.sin(o.flap) > 0, cy = o.y - 14;
          g.fillStyle(col.vulture).fillEllipse(o.x + 3, cy, 30, 12).fillTriangle(o.x + 16, cy - 3, o.x + 26, cy - 1, o.x + 16, cy + 4);
          g.fillStyle(col.ruff).fillCircle(o.x - 10, cy - 2, 4.5);
          g.fillStyle(col.head).fillCircle(o.x - 15, cy - 4, 4.5).fillTriangle(o.x - 19, cy - 6, o.x - 25, cy - 2, o.x - 18, cy - 1);
          g.fillStyle(0xffffff).fillCircle(o.x - 16, cy - 5, 1.6);
          g.fillStyle(col.vultureWing).fillTriangle(o.x - 4, cy - 2, o.x + 12, cy - 2, o.x + 8, up ? cy - 24 : cy + 14);
        };
        const runner = (duck, air) => {
          const run = started && alive && !air;
          const legs = (hx, hy, r) => {
            if (run) {
              // pernas giram tão rápido que viram uma roda
              g.lineStyle(2, col.leg, 0.35).strokeCircle(hx, hy, r);
              g.lineStyle(2.5, col.leg, 1);
              for (let i = 0; i < 3; i++) { const a = tick * 28 + i * 2.1; g.lineBetween(hx, hy, hx + Math.cos(a) * r, hy + Math.sin(a) * r); }
            } else if (air) {
              g.lineStyle(2.5, col.leg, 1).lineBetween(hx, hy - r * 0.6, hx - 9, hy + 1).lineBetween(hx + 2, hy - r * 0.6, hx - 5, hy + 4);
            } else {
              g.lineStyle(2.5, col.leg, 1).lineBetween(hx - 3, hy - r, hx - 4, y).lineBetween(hx + 3, hy - r, hx + 4, y);
            }
          };
          const eye = (ex, ey) => {
            g.fillStyle(0xffffff).fillCircle(ex, ey, 3.2);
            if (alive) g.fillStyle(col.eye).fillCircle(ex + 1, ey, 1.6);
            else g.lineStyle(1.5, col.eye, 1).lineBetween(ex - 2, ey - 2, ex + 2, ey + 2).lineBetween(ex - 2, ey + 2, ex + 2, ey - 2);
          };
          if (duck) {
            legs(X, y - 6, 6);
            g.fillStyle(col.bodyDark).fillTriangle(X - 12, y - 16, X - 36, y - 20, X - 34, y - 14);
            g.fillStyle(col.body).fillEllipse(X, y - 14, 34, 13);
            g.fillStyle(col.belly).fillEllipse(X + 2, y - 10, 22, 6);
            g.fillStyle(col.bodyDark).fillTriangle(X + 10, y - 20, X - 4, y - 25, X + 2, y - 18);
            g.fillStyle(col.body).fillCircle(X + 16, y - 16, 6.5);
            g.fillStyle(col.beak).fillTriangle(X + 21, y - 18, X + 21, y - 13, X + 34, y - 15);
            eye(X + 17, y - 18);
          } else {
            legs(X, y - 9, 9);
            const tilt = air ? -4 : 0; // no pulo o rabo sobe
            g.fillStyle(col.bodyDark).fillTriangle(X - 8, y - 28, X - 34, y - 46 + tilt, X - 29, y - 50 + tilt).fillTriangle(X - 8, y - 28, X - 29, y - 50 + tilt, X - 4, y - 33);
            g.fillStyle(col.body).fillEllipse(X - 1, y - 24, 26, 17);
            g.fillStyle(col.belly).fillEllipse(X + 4, y - 20, 14, 9);
            g.fillStyle(col.body).fillTriangle(X + 1, y - 30, X + 12, y - 30, X + 9, y - 40).fillCircle(X + 8, y - 39, 7.5);
            // crista: três penas pra trás
            g.fillStyle(col.bodyDark).fillTriangle(X + 4, y - 44, X - 9, y - 52, X + 2, y - 40).fillTriangle(X + 6, y - 45, X - 4, y - 56, X + 4, y - 41).fillTriangle(X + 8, y - 46, X + 2, y - 57, X + 6, y - 42);
            g.fillStyle(col.beak).fillTriangle(X + 13, y - 42, X + 13, y - 36, X + 29, y - 38);
            eye(X + 10, y - 41);
          }
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
            // rastro de poeira atrás dos pés
            if (onGround() && (trail -= delta) <= 0) { dust.emitParticleAt(X - 10, GY - 3, 1); trail = 45; }
          }
          const sp = started && alive ? speed : 0;
          for (const c of clouds) { c.x -= sp * dt * 0.06 + dt * 6; if (c.x < -100) { c.x = W + rand(0, 80); c.y = rand(26, 90); } }
          for (const m of marks) { m.x -= sp * dt; if (m.x < -20) { m.x = W + rand(0, 40); m.w = rand(3, 8); m.dy = rand(8, 44); } }
          weed.x -= sp * dt * 0.55 + dt * 40; weed.rot -= dt * 8;
          if (weed.x < -30) weed.x = W + rand(200, 900);
          g.clear();
          g.fillStyle(col.cloud, 0.55);
          for (const c of clouds) g.fillEllipse(c.x, c.y, c.w, 10).fillEllipse(c.x + c.w * 0.2, c.y - 5, c.w * 0.5, 9);
          drawMesas(far, col.mesaFar, 0.08, sp, dt);
          drawMesas(near, col.mesaNear, 0.2, sp, dt);
          // bola de feno: círculo com uns riscos girando
          const wy = GY - 9 - Math.abs(Math.sin(weed.rot * 0.5)) * 6;
          g.lineStyle(1.5, col.weed, 1).strokeCircle(weed.x, wy, 8);
          for (let i = 0; i < 3; i++) { const a = weed.rot + i * 1.05; g.lineBetween(weed.x - Math.cos(a) * 8, wy - Math.sin(a) * 8, weed.x + Math.cos(a) * 8, wy + Math.sin(a) * 8); }
          // chão de areia
          g.fillStyle(col.sand).fillRect(0, GY, W, H - GY);
          g.fillStyle(col.sandDark).fillRect(0, GY, W, 3);
          g.fillStyle(col.pebble);
          for (const m of marks) g.fillEllipse(m.x, GY + m.dy, m.w, m.w * 0.6);
          for (const o of obs) {
            if (o.kind === 'cactus') {
              for (let i = 0; i < o.n; i++) saguaro(o.x - o.w / 2 + i * 19, o.h - (i % 2) * 8, o.flower && i === 0);
            } else vulture(o);
          }
          // sombra do corredor encolhe quando ele sobe
          const sh = Math.max(0.35, 1 - (GY - y) / 160);
          g.fillStyle(0x000000, 0.18).fillEllipse(X, GY + 2, 26 * sh, 5 * sh);
          runner(ducking && onGround(), !onGround());
        });
      },
    });
  }
};
