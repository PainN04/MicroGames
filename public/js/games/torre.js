GAMES.torre = {
  name: 'Torre', icon: 'torre', hue: 195, desc: 'Clique, toque ou Espaço pra soltar o bloco na torre. O que passar da borda é cortado. Acertos perfeitos aumentam o bloco.',
  better: 'high', unit: 'andares', phaser: true,
  start(el, done) {
    const W = 400, H = 600, BH = 26, BASE_W = 220, BASE_Y = H - 70, TOP_SCREEN = 250;
    el.innerHTML = '<div class="hud"><span class="stat">Andares<b id="a">0</b></span><span class="stat">Perfeitos seguidos<b id="c">0</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { a: el.querySelector('#a'), c: el.querySelector('#c') };
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        // começa quente (coral, laranja, amarelo) pra destacar no céu azul; o azul só chega quando o céu já virou pôr do sol
        const color = i => Phaser.Display.Color.HSLToColor(((10 + i * 11) % 360) / 360, 0.7, 0.58).color;
        const blocks = [{ x: (W - BASE_W) / 2, w: BASE_W }], falling = [];
        let cur = { x: -BASE_W / 2, w: BASE_W, dir: 1 }, speed = 170, floors = 0, combo = 0, alive = true, cam = 0, camTarget = 0;
        const sky = this.add.graphics(), g = this.add.graphics(), fx = this.add.graphics();
        // céu muda com a altura: dia → pôr do sol → noite → espaço (estrelas aparecem lá em cima)
        const SKY = [[0, 0x8fd3ff, 0x4aa3e8], [0.3, 0xffc39a, 0xe86f8a], [0.6, 0x4a3a8f, 0x1d1b4f], [1, 0x07071a, 0x000008]].map(([t, a, b]) => [t, Phaser.Display.Color.ValueToColor(a), Phaser.Display.Color.ValueToColor(b)]);
        const mix = (a, b, k) => { const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, k * 100); return Phaser.Display.Color.GetColor(c.r, c.g, c.b); };
        const skyAt = t => { let i = 0; while (i < SKY.length - 2 && t > SKY[i + 1][0]) i++; const [t0, a0, b0] = SKY[i], [t1, a1, b1] = SKY[i + 1], k = Phaser.Math.Clamp((t - t0) / (t1 - t0), 0, 1); return [mix(a0, a1, k), mix(b0, b1, k)]; };
        const stars = Array.from({ length: 70 }, () => [Math.random() * W, Math.random() * H, Math.random() * 1.3 + 0.3]);
        const clouds = Array.from({ length: 4 }, (_, i) => ({ x: Math.random() * W, y: 80 + i * 130, w: rand(70, 130), s: rand(6, 16) }));
        let wave = -1; // instante do último perfeito: uma onda de luz desce pela torre
        const D = 12, DY = 7; // profundidade do bloco (3D isométrico)
        const block = (x, y, w, c, a = 1, lit = 0) => {
          const h = BH - 2, col = Phaser.Display.Color.ValueToColor(c), top = col.clone().lighten(18).color, side = col.clone().darken(22).color;
          g.fillStyle(side, a).fillPoints([{ x: x + w, y }, { x: x + w + D, y: y - DY }, { x: x + w + D, y: y - DY + h }, { x: x + w, y: y + h }], true);
          g.fillStyle(top, a).fillPoints([{ x, y }, { x: x + D, y: y - DY }, { x: x + w + D, y: y - DY }, { x: x + w, y }], true);
          g.fillStyle(c, a).fillRect(x, y, w, h);
          g.fillStyle(0xffffff, 0.22 * a).fillRect(x, y, w, 2);
          // janelinhas: acesas à noite
          for (let wx = x + 8; wx < x + w - 10; wx += 18) g.fillStyle(night > 0.4 ? 0xffe08a : 0x0b1b2e, (night > 0.4 ? 0.85 : 0.22) * a).fillRect(wx, y + 7, 8, 9);
          if (lit > 0) g.fillStyle(0xffffff, lit * 0.6 * a).fillRect(x, y, w, h);
        };
        let night = 0;
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
            burst.explode(14, nx + nw / 2, yOf(i)); wave = time0();
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
        let clockMs = 0; const time0 = () => clockMs;
        this.events.on('update', (time, delta) => {
          clockMs = time;
          const dt = Math.min(delta, 50) / 1000;
          if (alive) {
            cur.x += cur.dir * speed * dt;
            if (cur.x < -cur.w / 2) { cur.x = -cur.w / 2; cur.dir = 1; }
            if (cur.x > W - cur.w / 2) { cur.x = W - cur.w / 2; cur.dir = -1; }
          }
          cam += (camTarget - cam) * Math.min(1, dt * 6);
          for (const f of falling) { f.vy += 1100 * dt; f.y += f.vy * dt; }
          while (falling.length && falling[0].y > H + 60) falling.shift();
          // céu, estrelas, nuvens e chão
          const ht = Phaser.Math.Clamp(-cam / (BH * 70), 0, 1);
          night = Phaser.Math.Clamp((ht - 0.45) * 3, 0, 1);
          const [c0, c1] = skyAt(ht);
          sky.clear();
          for (let yy = 0; yy < H; yy += 20) sky.fillStyle(mix(Phaser.Display.Color.ValueToColor(c1), Phaser.Display.Color.ValueToColor(c0), yy / H)).fillRect(0, yy, W, 20);
          if (ht > 0.4) for (const [sx, sy, r] of stars) sky.fillStyle(0xffffff, Phaser.Math.Clamp((ht - 0.4) * 2.5, 0, 1) * (0.5 + 0.5 * Math.sin(time / 400 + sx))).fillCircle(sx, sy, r);
          for (const c of clouds) {
            c.x += c.s * dt; if (c.x > W + 80) c.x = -c.w - 20;
            const cy = (c.y - cam * 0.35) % (H + 200) - 100;
            sky.fillStyle(0xffffff, 0.5 * (1 - night)).fillEllipse(c.x, cy, c.w, c.w * 0.32).fillEllipse(c.x + c.w * 0.25, cy - 8, c.w * 0.55, c.w * 0.3);
          }
          const gy = BASE_Y + BH - 2 - cam;
          if (gy < H) { sky.fillStyle(0x3f8f4f).fillRect(0, gy, W, H - gy); sky.fillStyle(0x56b366).fillRect(0, gy, W, 6); sky.fillStyle(0x2d6b3a).fillRect(0, gy + 18, W, H); }
          g.clear();
          const since = wave < 0 ? 1e9 : time - wave;
          blocks.forEach((b, i) => {
            const y = yOf(i);
            if (y > H + BH || y < -BH * 2) return;
            const k = since / 28 - (blocks.length - 1 - i); // a onda desce um andar a cada 28ms
            block(b.x, y, b.w, color(i), 1, k >= 0 && k < 3 ? (1 - k / 3) : 0);
          });
          if (alive) block(cur.x, yOf(blocks.length), cur.w, color(blocks.length));
          for (const f of falling) block(f.x, f.y, f.w, f.c, 0.85);
        });
      },
    });
  }
};
