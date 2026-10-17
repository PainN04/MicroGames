GAMES.torre = {
  name: 'Torre', icon: 'tower-control', hue: 195, desc: 'Clique, toque ou Espaço pra soltar o bloco na torre. O que passar da borda é cortado. Acertos perfeitos aumentam o bloco.',
  better: 'high', unit: 'andares', phaser: true,
  start(el, done) {
    const W = 400, H = 600, BH = 26, BASE_W = 220, BASE_Y = H - 70, TOP_SCREEN = 250;
    el.innerHTML = '<div class="hud"><span class="stat">Andares<b id="a">0</b></span><span class="stat">Perfeitos seguidos<b id="c">0</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { a: el.querySelector('#a'), c: el.querySelector('#c') };
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        const color = i => Phaser.Display.Color.HSLToColor(((190 + i * 11) % 360) / 360, 0.62, 0.6).color;
        const blocks = [{ x: (W - BASE_W) / 2, w: BASE_W }], falling = [];
        let cur = { x: -BASE_W / 2, w: BASE_W, dir: 1 }, speed = 170, floors = 0, combo = 0, alive = true, cam = 0, camTarget = 0;
        const g = this.add.graphics();
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 40, max: 160 }, lifespan: 420, scale: { start: 1, end: 0 }, tint: 0xffffff, emitting: false });
        const yOf = i => BASE_Y - i * BH - cam; // i = andar (0 = base)
        const msg = this.add.text(W / 2, 140, 'Clique pra soltar', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '22px', color: '#c9cce0' }).setOrigin(0.5);
        const gameOver = () => {
          alive = false;
          sfx.bad();
          this.cameras.main.shake(250, 0.01);
          this.time.delayedCall(1000, () => done(floors));
        };
        const drop = () => {
          if (!alive) return;
          msg.setVisible(false);
          const prev = blocks.at(-1), i = blocks.length;
          const left = Math.max(cur.x, prev.x), right = Math.min(cur.x + cur.w, prev.x + prev.w);
          if (right - left <= 0) { falling.push({ x: cur.x, y: yOf(i), w: cur.w, vy: 0, c: color(i) }); return gameOver(); }
          let nx = left, nw = right - left;
          if (Math.abs(cur.x - prev.x) < 5) {
            // perfeito: encaixa, e a partir do 3º seguido o bloco cresce um pouco
            combo++;
            nx = prev.x; nw = prev.w;
            if (combo >= 3 && nw < BASE_W) { const grow = Math.min(10, BASE_W - nw); nx = Phaser.Math.Clamp(nx - grow / 2, 0, W - nw - grow); nw += grow; }
            burst.explode(14, nx + nw / 2, yOf(i));
            floatText(this, nx + nw / 2, yOf(i) - 10, combo >= 3 ? 'Perfeito! +' : 'Perfeito!', '#ffd34d');
            beep(660 + Math.min(combo, 8) * 50, 90, 'triangle', 0.05);
          } else {
            combo = 0;
            const cut = cur.x < prev.x ? { x: cur.x, w: prev.x - cur.x } : { x: right, w: cur.x + cur.w - right };
            falling.push({ ...cut, y: yOf(i), vy: 0, c: color(i) });
            beep(330, 60, 'triangle', 0.04);
          }
          blocks.push({ x: nx, w: nw });
          floors++;
          hud.a.textContent = floors; hud.c.textContent = combo;
          speed = Math.min(430, 170 + floors * 7);
          const fromLeft = blocks.length % 2 === 0;
          cur = { x: fromLeft ? -nw / 2 : W - nw / 2, w: nw, dir: fromLeft ? 1 : -1 };
          camTarget = Math.min(0, (BASE_Y - blocks.length * BH) - TOP_SCREEN);
        };
        this.input.keyboard.addCapture('SPACE');
        this.input.keyboard.on('keydown', e => { if (e.key === ' ' && !e.repeat) drop(); });
        this.input.on('pointerdown', drop);
        this.events.on('update', (time, delta) => {
          const dt = Math.min(delta, 50) / 1000;
          if (alive) {
            cur.x += cur.dir * speed * dt;
            if (cur.x < -cur.w / 2) { cur.x = -cur.w / 2; cur.dir = 1; }
            if (cur.x > W - cur.w / 2) { cur.x = W - cur.w / 2; cur.dir = -1; }
          }
          cam += (camTarget - cam) * Math.min(1, dt * 6);
          for (const f of falling) { f.vy += 1100 * dt; f.y += f.vy * dt; }
          while (falling.length && falling[0].y > H + 60) falling.shift();
          g.clear();
          blocks.forEach((b, i) => { const y = yOf(i); if (y < H + BH) g.fillStyle(color(i)).fillRect(b.x, y, b.w, BH - 2); });
          if (alive) g.fillStyle(color(blocks.length)).fillRect(cur.x, yOf(blocks.length), cur.w, BH - 2);
          for (const f of falling) g.fillStyle(f.c, 0.8).fillRect(f.x, f.y, f.w, BH - 2);
        });
      },
    });
  }
};
