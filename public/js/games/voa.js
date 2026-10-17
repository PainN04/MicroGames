GAMES.voa = {
  name: 'Voa Voa', icon: 'bird', hue: 275, desc: 'Toque, clique ou Espaço pra bater as asas. Passe entre os canos! Entre eles aparecem estrela (+3), escudo (aguenta 1 batida) e relógio (câmera lenta 3s). Depois de 20 pontos os canos começam a se mexer.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 420, H = 560, R = 14, BX = 120, PIPE_W = 64, SLOW_TIME = 3, SLOW_FACTOR = 0.55, SHIELD_GRACE = 1.2;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Bônus<b id="b" class="bonus-hud">—</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { p: el.querySelector('#p'), b: el.querySelector('#b') };
    const col = { bird: hex('--yellow'), beak: hex('--accent'), pipe: hex('--green'), cap: 0x1e8a55, star: 0xffd34d, shield: 0x4dc3ff, slow: 0xa98bff };
    // círculo (cx, cy, r) encosta no retângulo [x0..x1] × [y0..y1]?
    const hitsRect = (cx, cy, r, x0, y0, x1, y1) => {
      const nx = Phaser.Math.Clamp(cx, x0, x1), ny = Phaser.Math.Clamp(cy, y0, y1);
      return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
    };
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        let y = H / 2, vy = 0, started = false, alive = true, pts = 0, passed = 0, made = 0, spawnIn = 0, clock = 0;
        let shield = false, grace = 0, slow = 0;
        const pipes = [], items = []; // item: { x, y, kind: 'star' | 'shield' | 'slow', ph }
        const gfx = this.add.graphics();
        const fxg = this.add.graphics().setDepth(5); // itens, escudo e a cortina da câmera lenta
        const bird = this.add.container(BX, y, [
          this.add.circle(0, 0, R, col.bird),
          this.add.circle(5, -4, 4, 0xffffff), this.add.circle(6, -4, 2, 0x161625),
          this.add.triangle(R + 1, 2, 0, -4, 0, 4, 9, 0, col.beak),
        ]).setDepth(4);
        const trail = this.add.particles(0, 0, 'dot', { speed: 40, angle: { min: 160, max: 200 }, lifespan: 300, scale: { start: 0.7, end: 0 }, tint: col.bird, emitting: false });
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 220 }, lifespan: 520, scale: { start: 1.2, end: 0 }, emitting: false }).setDepth(6);
        const msg = this.add.text(W / 2, H / 2 + 70, 'Toque ou Espaço pra voar', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '22px', color: '#c9cce0' }).setOrigin(0.5);
        const flap = () => {
          if (!alive) return;
          if (!started) { started = true; msg.destroy(); }
          vy = -330;
          trail.explode(5, BX - R, y);
          beep(520, 50, 'triangle', 0.04);
        };
        const setPts = n => { pts = n; hud.p.textContent = pts; };
        const bonusHud = () => {
          const parts = [];
          if (shield) parts.push('escudo');
          if (slow > 0) parts.push('lento ' + Math.ceil(slow) + 's');
          hud.b.textContent = parts.length ? parts.join(' · ') : '—';
        };
        const die = () => {
          alive = false;
          sfx.bad();
          this.cameras.main.shake(260, 0.012);
          this.cameras.main.flash(200, 255, 80, 100);
          this.time.delayedCall(800, () => done(pts));
        };
        // bateu com escudo: gasta o escudo e fica "fantasma" um instante pra sair do cano
        const shieldHit = () => {
          shield = false; grace = SHIELD_GRACE;
          burst.setParticleTint(col.shield); burst.explode(22, BX, y);
          this.cameras.main.shake(160, 0.008);
          beep(240, 140, 'sawtooth', 0.05); beep(480, 90, 'triangle', 0.04);
          floatText(this, BX, y - 36, 'Escudo!', '#7ad7ff');
          bonusHud();
        };
        const collect = it => {
          burst.setParticleTint(col[it.kind]); burst.explode(it.kind === 'star' ? 26 : 18, it.x, it.y);
          if (it.kind === 'star') {
            setPts(pts + 3);
            floatText(this, it.x, it.y - 20, '+3', '#ffd34d');
            [880, 1175, 1568].forEach((f, k) => setTimeout(() => beep(f, 110, 'triangle', 0.05), k * 70)); // arpejo da estrela
          } else if (it.kind === 'shield') {
            shield = true;
            floatText(this, it.x, it.y - 20, 'Escudo', '#7ad7ff');
            beep(330, 120, 'sine', 0.06); setTimeout(() => beep(660, 160, 'sine', 0.06), 90);
          } else {
            slow = SLOW_TIME;
            floatText(this, it.x, it.y - 20, 'Câmera lenta', '#c9b3ff');
            beep(700, 140, 'triangle', 0.05); setTimeout(() => beep(350, 220, 'triangle', 0.05), 110);
          }
          bonusHud();
        };
        this.input.keyboard.addCapture('SPACE,UP');
        this.input.keyboard.on('keydown', e => { if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key) && !e.repeat) flap(); });
        this.input.on('pointerdown', flap);

        // ---- desenho dos itens (sem imagens: tudo em formas) ----
        const star = (g, cx, cy, ro, ri, rot) => {
          const pts5 = [];
          for (let k = 0; k < 10; k++) { const a = rot - Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? ri : ro; pts5.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
          g.fillPoints(pts5, true);
        };
        const drawItem = (g, it, t) => {
          const pulse = 1 + Math.sin(t * 6 + it.ph) * 0.1, c = col[it.kind];
          g.fillStyle(c, 0.22).fillCircle(it.x, it.y, 25 * pulse); // brilho
          g.fillStyle(c, 0.12).fillCircle(it.x, it.y, 34 * pulse);
          if (it.kind === 'star') { g.fillStyle(0xffe27a); star(g, it.x, it.y, 17 * pulse, 7.5, t * 1.5 + it.ph); g.fillStyle(0xffffff, 0.8).fillCircle(it.x - 3, it.y - 3, 2); }
          else if (it.kind === 'shield') {
            g.fillStyle(c).fillCircle(it.x, it.y, 15 * pulse);
            g.fillStyle(0xffffff).fillPoints([{ x: it.x - 6, y: it.y - 6 }, { x: it.x + 6, y: it.y - 6 }, { x: it.x + 6, y: it.y + 1 }, { x: it.x, y: it.y + 8 }, { x: it.x - 6, y: it.y + 1 }], true);
            g.fillStyle(c).fillRect(it.x - 1, it.y - 4, 2, 8);
          } else {
            g.fillStyle(c).fillCircle(it.x, it.y, 15 * pulse);
            g.lineStyle(2.2, 0xffffff).strokeCircle(it.x, it.y, 8).lineBetween(it.x, it.y, it.x, it.y - 6).lineBetween(it.x, it.y, it.x + 4.5, it.y + 2);
          }
        };

        this.events.on('update', (time, delta) => {
          const rdt = Math.min(delta, 50) / 1000; // tempo real
          // câmera lenta: o mundo anda mais devagar (volta ao normal no último meio segundo)
          let ts = 1;
          if (slow > 0) { slow -= rdt; ts = slow > 0.5 ? SLOW_FACTOR : SLOW_FACTOR + (1 - SLOW_FACTOR) * (1 - Math.max(0, slow) / 0.5); if (slow <= 0) { slow = 0; bonusHud(); } else if (Math.ceil(slow * 2) !== Math.ceil((slow + rdt) * 2)) bonusHud(); }
          if (grace > 0) grace -= rdt;
          const dt = rdt * ts;
          if (started && alive) {
            clock += dt;
            vy = Math.min(vy + 1100 * dt, 600);
            y += vy * dt;
            if (y < R) { y = R; vy = 0; }
            const speed = Math.min(170 + passed * 3, 260);
            spawnIn -= delta * ts;
            if (spawnIn <= 0) {
              // vão estreita devagar (mínimo 124); depois de 20 canos passados, parte deles sobe e desce
              const gap = Math.max(124, 176 - passed * 1.1), mover = passed >= 20 && Math.random() < Math.min(0.9, 0.35 + (passed - 20) * 0.03);
              const base = rand(110, H - 110), amp = mover ? Math.min(55, 22 + (passed - 20) * 2) : 0;
              const prev = pipes[pipes.length - 1], x = W + PIPE_W;
              pipes.push({ x, gapY: base, base, amp, ph: Math.random() * 6.28, gap, scored: false });
              made++;
              spawnIn = 1500 * 170 / speed; // mesma distância entre canos mesmo acelerando
              // itens raros no meio do caminho entre o cano anterior e este (não nos primeiros canos)
              if (prev && made > 3) {
                const r = Math.random(), kind = r < 0.14 ? 'star' : r < 0.2 && !shield ? 'shield' : r < 0.26 ? 'slow' : null;
                if (kind) items.push({ kind, x: x - 127 /* metade da distância entre canos (255px) */, y: Phaser.Math.Clamp((prev.base + base) / 2 + rand(-25, 25), 60, H - 60), ph: Math.random() * 6 });
              }
            }
            for (const p of pipes) {
              p.x -= speed * dt;
              if (p.amp) p.gapY = Phaser.Math.Clamp(p.base + Math.sin(clock * 1.7 + p.ph) * p.amp, p.gap / 2 + 30, H - p.gap / 2 - 30);
              const x0 = p.x - PIPE_W / 2, x1 = p.x + PIPE_W / 2, top = p.gapY - p.gap / 2, bot = p.gapY + p.gap / 2;
              if (grace <= 0 && (hitsRect(BX, y, R - 2, x0, 0, x1, top) || hitsRect(BX, y, R - 2, x0, bot, x1, H))) {
                if (shield) shieldHit(); else { die(); break; }
              }
              if (!p.scored && x1 < BX - R) {
                p.scored = true; passed++; setPts(pts + 1);
                floatText(this, BX, y - 30, '+1', '#7cffb0'); sfx.good();
              }
            }
            for (let i = items.length - 1; i >= 0; i--) {
              const it = items[i];
              it.x -= speed * dt;
              if (alive && Math.hypot(it.x - BX, it.y - y) < R + 16) { collect(it); items.splice(i, 1); }
              else if (it.x < -40) items.splice(i, 1);
            }
            while (pipes.length && pipes[0].x < -PIPE_W) pipes.shift();
            if (y > H - R) {
              if (shield) { y = H - R; vy = -420; shieldHit(); } else die();
            }
          } else if (!started) y = H / 2 + Math.sin(time / 250) * 8; // flutuando antes de começar
          bird.y = y;
          bird.rotation = started ? Phaser.Math.Clamp(vy / 600, -0.5, 1.2) : 0;
          bird.alpha = grace > 0 ? (Math.floor(time / 80) % 2 ? 0.35 : 1) : 1;
          gfx.clear();
          for (const p of pipes) {
            const x0 = p.x - PIPE_W / 2, top = p.gapY - p.gap / 2, bot = p.gapY + p.gap / 2;
            gfx.fillStyle(col.pipe).fillRect(x0, 0, PIPE_W, top).fillRect(x0, bot, PIPE_W, H - bot);
            gfx.fillStyle(col.cap).fillRect(x0 - 4, top - 18, PIPE_W + 8, 18).fillRect(x0 - 4, bot, PIPE_W + 8, 18);
          }
          fxg.clear();
          const t = time / 1000;
          for (const it of items) drawItem(fxg, it, t);
          if (shield) { fxg.lineStyle(3, col.shield, 0.85 + Math.sin(t * 8) * 0.15).strokeCircle(BX, y, R + 7); fxg.fillStyle(col.shield, 0.12).fillCircle(BX, y, R + 7); }
          if (slow > 0) { fxg.fillStyle(col.slow, 0.1).fillRect(0, 0, W, H); fxg.fillStyle(col.slow, 0.9).fillRect(0, 0, W * Math.min(1, slow / SLOW_TIME), 4); }
        });
      },
    });
  }
};
