GAMES.mira = {
  name: 'Mira', emoji: '🎯', hue: 50, desc: 'Acerte 20 alvos o mais rápido possível. Erro = +0,5s. Funciona no toque.',
  better: 'low', unit: 's', decimals: 2, phaser: true,
  // Phaser. Mesma regra de antes (20 alvos de 48px, erro = +0,5s, tempo conta do 1º acerto) pra manter o ranking justo.
  start(el, done) {
    const W = 640, H = 360, R = 24, TOTAL = 20;
    el.innerHTML = '<div class="hud"><span class="stat">Alvos<b id="h">0/20</b></span><span class="stat">Erros<b id="m">0</b></span><span class="stat">Tempo<b id="t">0.00s</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { h: el.querySelector('#h'), m: el.querySelector('#m'), t: el.querySelector('#t') };
    const red = hex('--red'), white = hex('--text'), border = hex('--border-strong');
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        let hits = 0, miss = 0, t0 = 0, over = false;
        const elapsed = () => (performance.now() - t0) / 1000 + miss * 0.5;
        dotTexture(this);
        const grid = this.add.graphics().lineStyle(1, border, 0.25);
        for (let x = 40; x < W; x += 40) grid.lineBetween(x, 0, x, H);
        for (let y = 40; y < H; y += 40) grid.lineBetween(0, y, W, y);
        const target = this.add.container(0, 0, [
          this.add.circle(0, 0, R, red), this.add.circle(0, 0, R * 0.72, white),
          this.add.circle(0, 0, R * 0.45, red), this.add.circle(0, 0, R * 0.16, white),
        ]);
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
            if (!t0) t0 = performance.now();
            hud.h.textContent = ++hits + '/' + TOTAL;
            burst.explode(18, target.x, target.y);
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
            this.cameras.main.shake(90, 0.004);
            beep(160, 90, 'square', 0.03);
          }
        });
        this.events.on('update', () => { if (t0 && !over) hud.t.textContent = elapsed().toFixed(2) + 's'; });
        place();
      },
    });
  }
};
