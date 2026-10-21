GAMES.mira = {
  name: 'Mira', icon: 'crosshair', hue: 50, desc: 'Acerte 20 alvos o mais rápido possível. Erro = +0,5s. Funciona no toque.',
  better: 'low', unit: 's', decimals: 2, phaser: true,
  // Phaser. Mesma regra de antes (20 alvos de 48px, erro = +0,5s, tempo conta do 1º acerto) pra manter o ranking justo.
  start(el, done) {
    const W = 640, H = 360, R = 24, TOTAL = 20;
    el.innerHTML = '<div class="hud"><span class="stat">Alvos<b id="h">0/20</b></span><span class="stat">Erros<b id="m">0</b></span><span class="stat">Tempo<b id="t">0.00s</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { h: el.querySelector('#h'), m: el.querySelector('#m'), t: el.querySelector('#t') };
    const red = hex('--red'), white = 0xf4f1ea;
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        // o tempo soma os quadros da cena: com o jogo pausado (trocou de aba) a cena não roda e o relógio para junto
        let hits = 0, miss = 0, t0 = 0, run = 0, frameAt = 0, over = false;
        const elapsed = () => (run + (t0 ? Math.min(performance.now() - frameAt, 100) : 0)) / 1000 + miss * 0.5;
        dotTexture(this);
        // estande de tiro: parede de madeira com faixas, luz vindo de cima e marcações de distância
        const mk = (key, w, h, draw) => { if (this.textures.exists(key)) return; const k = this.make.graphics({ x: 0, y: 0, add: false }); draw(k); k.generateTexture(key, w, h); k.destroy(); };
        mk('mi_bg', W, H, k => {
          for (let y = 0; y < H; y += 30) {
            k.fillStyle(y / 30 % 2 ? 0x3a2a22 : 0x42302a).fillRect(0, y, W, 30);
            k.fillStyle(0x000000, 0.25).fillRect(0, y + 28, W, 2);
            for (let i = 0; i < 6; i++) k.fillStyle(0x000000, 0.08).fillRect(Math.random() * W, y + 6 + Math.random() * 18, rand(40, 160), 1);
          }
          for (let x = 80; x < W; x += 160) { k.fillStyle(0xffffff, 0.04).fillRect(x, 0, 2, H); }
          for (let r = 0; r < 6; r++) k.fillStyle(0xfff1d0, 0.05).fillEllipse(W / 2, -20, W * (1.6 - r * 0.22), H * (1.4 - r * 0.2)); // luz do teto
          k.fillStyle(0x000000, 0.35).fillRect(0, H - 6, W, 6);
        });
        this.add.image(0, 0, 'mi_bg').setOrigin(0);
        // alvo com volume: sombra, anéis com borda, brilho; desenhado no dobro da resolução
        mk('mi_tgt', 120, 120, k => {
          const c = 58;
          k.fillStyle(0x000000, 0.35).fillCircle(c + 5, c + 7, 48);
          [[48, red], [41, white], [34, red], [26, white], [18, red], [9, 0xffd34d]].forEach(([r, col], i) => {
            const C = Phaser.Display.Color.ValueToColor(col);
            k.fillStyle(C.clone().darken(25).color).fillCircle(c, c, r);
            k.fillStyle(col).fillCircle(c - 1, c - 1.5, r - 2.5);
          });
          k.fillStyle(0xffffff, 0.35).fillEllipse(c - 18, c - 20, 26, 14);
        });
        const holes = this.add.graphics(); // marcas de tiro que erraram (somem devagar)
        const marks = [];
        const target = this.add.image(0, 0, 'mi_tgt').setScale(0.5);
        const burst = this.add.particles(0, 0, 'dot', {
          speed: { min: 80, max: 260 }, lifespan: 420, scale: { start: 1.1, end: 0 }, tint: [red, white], emitting: false,
        });
        const place = () => {
          target.setPosition(rand(R, W - R), rand(R, H - R)).setScale(0.2);
          this.tweens.add({ targets: target, scale: 1, duration: 140, ease: 'Back.Out' });
        };
        this.input.on('pointerdown', p => {
          if (over) return;
          // área de acerto = círculo de 24px de raio, mesmo durante a animação de entrada
          if (Phaser.Math.Distance.Between(p.x, p.y, target.x, target.y) <= R) {
            if (!t0) { t0 = 1; run = 0; frameAt = performance.now(); }
            hud.h.textContent = ++hits + '/' + TOTAL;
            burst.explode(18, target.x, target.y);
            // anel que se espalha no acerto
            const ring = this.add.circle(target.x, target.y, R, 0xffffff, 0).setStrokeStyle(3, 0xffd34d);
            this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 320, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
            sfx.good();
            if (hits === TOTAL) {
              over = true;
              const score = +elapsed().toFixed(2);
              target.destroy();
              hud.t.textContent = score.toFixed(2) + 's';
              this.time.delayedCall(350, () => done(score));
            } else place();
          } else if (t0) {
            hud.m.textContent = ++miss;
            floatText(this, p.x, p.y, '+0,5s', '#ff6b8a');
            marks.push({ x: p.x, y: p.y, a: 1 }); if (marks.length > 14) marks.shift();
            this.cameras.main.shake(90, 0.004);
            beep(160, 90, 'square', 0.03);
          }
        });
        this.events.on('update', (time, delta) => {
          holes.clear();
          for (const m of marks) {
            m.a = Math.max(0.25, m.a - delta / 6000);
            holes.fillStyle(0x000000, 0.55 * m.a).fillCircle(m.x, m.y, 4.5);
            holes.fillStyle(0x1a110c, m.a).fillCircle(m.x, m.y, 3);
            holes.lineStyle(1, 0xd9b48a, 0.4 * m.a).strokeCircle(m.x, m.y, 5.5);
          }
          if (t0 && !over) { const now = performance.now(); run += Math.min(now - frameAt, 100); frameAt = now; hud.t.textContent = elapsed().toFixed(2) + 's'; }
        });
        place();
      },
    });
  }
};
