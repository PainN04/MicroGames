GAMES.chuva = {
  name: 'Chuva de Bugs', emoji: '🐛', hue: 180, desc: 'Desvie dos bugs! Setas/AD ou arraste o dedo. Acelera com o tempo.',
  better: 'high', unit: 's', decimals: 1, phaser: true,
  start(el, done) {
    const W = 480, H = 520, PY = H - 44, PR = 16, BR = 12;
    el.innerHTML = '<div class="hud"><span class="stat">Tempo<b id="t">0.0s</b></span><span class="stat">Bugs<b id="b">0</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { t: el.querySelector('#t'), b: el.querySelector('#b') };
    const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        const emoji = (x, y, ch, size) => this.add.text(x, y, ch, { fontFamily: EMOJI_FONT, fontSize: size + 'px' }).setOrigin(0.5);
        let px = W / 2, target = null, started = false, alive = true, t = 0, spawnIn = 0, dodged = 0;
        const bugs = [];
        const player = emoji(px, PY, '💻', 36);
        const msg = this.add.text(W / 2, H / 2, 'Setas, A/D ou arraste pra começar', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '20px', color: '#c9cce0' }).setOrigin(0.5);
        const start = () => { if (!started && alive) { started = true; msg.destroy(); } };
        const keys = this.input.keyboard.addKeys('LEFT,RIGHT,A,D');
        this.input.keyboard.addCapture('LEFT,RIGHT');
        this.input.keyboard.on('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) start(); });
        this.input.on('pointerdown', p => { target = p.x; start(); });
        this.input.on('pointermove', p => { if (p.isDown) target = p.x; });
        this.input.on('pointerup', () => { target = null; });
        const die = () => {
          alive = false;
          player.setText('💥');
          sfx.bad();
          this.cameras.main.shake(260, 0.012);
          this.time.delayedCall(800, () => done(+t.toFixed(1)));
        };
        this.events.on('update', (time, delta) => {
          if (!started || !alive) return;
          const dt = Math.min(delta, 50) / 1000; // aba travada não dá tempo grátis
          t += dt;
          hud.t.textContent = t.toFixed(1) + 's';
          const dir = (keys.RIGHT.isDown || keys.D.isDown) - (keys.LEFT.isDown || keys.A.isDown);
          if (dir) { px += dir * 380 * dt; target = null; }
          else if (target !== null) px += Phaser.Math.Clamp(target - px, -480 * dt, 480 * dt);
          px = Phaser.Math.Clamp(px, PR, W - PR);
          player.x = px;
          const level = Math.min(t / 45, 1); // dificuldade máxima aos 45s
          spawnIn -= delta;
          if (spawnIn <= 0) {
            spawnIn = 650 - 470 * level;
            bugs.push({ o: emoji(rand(BR, W - BR), -20, '🐛', 26), vy: 170 + 330 * level + rand(0, 60), spin: (Math.random() - 0.5) * 6 });
          }
          for (const b of bugs) {
            b.o.y += b.vy * dt;
            b.o.rotation += b.spin * dt;
            if (Phaser.Math.Distance.Between(b.o.x, b.o.y, px, PY) < PR + BR) return die();
          }
          while (bugs.length && bugs[0].o.y > H + 30) { bugs.shift().o.destroy(); hud.b.textContent = ++dodged; }
        });
      },
    });
  }
};
