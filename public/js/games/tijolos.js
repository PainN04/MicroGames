GAMES.tijolos = {
  name: 'Quebra-Tijolos', icon: 'brick-wall', hue: 0, desc: 'Rebata a bola e quebre os tijolos. Mouse, dedo ou ←→ movem; clique ou Espaço lança. 3 vidas.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 480, H = 560, PW = 84, PH = 12, PY = H - 40, R = 7, COLS = 8, ROWS = 6, BW = 52, BH = 18, GAP = 4, TOP = 70;
    const LEFT = (W - (COLS * BW + (COLS - 1) * GAP)) / 2, MAX_SPEED = 560;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Vidas<b id="v" class="lives">' + hearts(3) + '</b></span><span class="stat">Fase<b id="f">1</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v'), f: el.querySelector('#f') };
    const rowColor = ['--red', '--accent', '--yellow', '--green', '--blue', '--primary'].map(hex);
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        let px = W / 2, target = null, bx = 0, by = 0, vx = 0, vy = 0, stuck = true, lives = 3, score = 0, level = 1, alive = true, bricks = [];
        const g = this.add.graphics();
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 200 }, lifespan: 380, scale: { start: 1, end: 0 }, emitting: false });
        const msg = this.add.text(W / 2, H / 2 + 40, 'Clique ou Espaço pra lançar', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '20px', color: '#c9cce0' }).setOrigin(0.5);
        const build = () => { bricks = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bricks.push({ x: LEFT + c * (BW + GAP), y: TOP + r * (BH + GAP), row: r, alive: true }); };
        const baseSpeed = () => 330 + (level - 1) * 30;
        const resetBall = () => { stuck = true; vx = vy = 0; msg.setVisible(true); };
        const launch = () => {
          if (!stuck || !alive) return;
          stuck = false; msg.setVisible(false);
          const a = Phaser.Math.DegToRad(rand(-30, 30)), s = baseSpeed();
          vx = s * Math.sin(a); vy = -s * Math.cos(a);
        };
        const loseLife = () => {
          lives--;
          hud.v.innerHTML = hearts(lives);
          sfx.bad();
          this.cameras.main.shake(200, 0.01);
          if (lives <= 0) { alive = false; msg.setText('Fim de jogo').setVisible(true); this.time.delayedCall(900, () => done(score)); }
          else resetBall();
        };
        const keys = this.input.keyboard.addKeys('LEFT,RIGHT,A,D');
        this.input.keyboard.addCapture('LEFT,RIGHT,SPACE');
        this.input.keyboard.on('keydown', e => { if (e.key === ' ' && !e.repeat) launch(); });
        this.input.on('pointermove', p => { target = p.x; });
        this.input.on('pointerdown', p => { target = p.x; launch(); });
        build();
        this.events.on('update', (time, delta) => {
          const dt = Math.min(delta, 50) / 1000;
          if (alive) {
            const dir = (keys.RIGHT.isDown || keys.D.isDown) - (keys.LEFT.isDown || keys.A.isDown);
            if (dir) { px += dir * 560 * dt; target = null; }
            else if (target !== null) px += Phaser.Math.Clamp(target - px, -1000 * dt, 1000 * dt);
            px = Phaser.Math.Clamp(px, PW / 2, W - PW / 2);
            if (stuck) { bx = px; by = PY - PH / 2 - R - 1; }
            else {
              // passos pequenos pra bola rápida não atravessar tijolo
              const steps = Math.max(1, Math.ceil(Math.hypot(vx, vy) * dt / 5));
              for (let s = 0; s < steps && !stuck && alive; s++) {
                const h = dt / steps;
                bx += vx * h; by += vy * h;
                if (bx < R) { bx = R; vx = Math.abs(vx); }
                if (bx > W - R) { bx = W - R; vx = -Math.abs(vx); }
                if (by < R) { by = R; vy = Math.abs(vy); }
                if (vy > 0 && by + R >= PY - PH / 2 && by - R <= PY + PH / 2 && bx >= px - PW / 2 - R && bx <= px + PW / 2 + R) {
                  // onde bate na raquete define o ângulo (até 60°)
                  const rel = Phaser.Math.Clamp((bx - px) / (PW / 2), -1, 1), sp = Math.hypot(vx, vy), ang = rel * Phaser.Math.DegToRad(60);
                  vx = sp * Math.sin(ang); vy = -sp * Math.cos(ang); by = PY - PH / 2 - R;
                  beep(330, 40, 'triangle', 0.03);
                }
                for (const b of bricks) {
                  if (!b.alive) continue;
                  const nx = Phaser.Math.Clamp(bx, b.x, b.x + BW), ny = Phaser.Math.Clamp(by, b.y, b.y + BH);
                  if ((bx - nx) ** 2 + (by - ny) ** 2 >= R * R) continue;
                  b.alive = false;
                  const overlapX = Math.min(bx + R - b.x, b.x + BW - (bx - R)), overlapY = Math.min(by + R - b.y, b.y + BH - (by - R));
                  if (overlapX < overlapY) vx = -vx; else vy = -vy;
                  score += (ROWS - b.row) * 10;
                  hud.p.textContent = score;
                  const sp = Math.hypot(vx, vy);
                  if (sp < MAX_SPEED) { vx *= 1.015; vy *= 1.015; }
                  burst.setParticleTint(rowColor[b.row]);
                  burst.explode(10, b.x + BW / 2, b.y + BH / 2);
                  beep(500 + (ROWS - b.row) * 60, 50, 'triangle', 0.035);
                  break;
                }
                if (by > H + R) { loseLife(); break; }
              }
              if (alive && bricks.every(b => !b.alive)) {
                level++; hud.f.textContent = level;
                floatText(this, W / 2, H / 2, `Fase ${level}!`, '#7cffb0');
                sfx.record();
                build(); resetBall();
              }
            }
          }
          g.clear();
          for (const b of bricks) if (b.alive) g.fillStyle(rowColor[b.row]).fillRoundedRect(b.x, b.y, BW, BH, 5);
          g.fillStyle(0xe8eaf6).fillRoundedRect(px - PW / 2, PY - PH / 2, PW, PH, 6);
          g.fillStyle(hex('--yellow')).fillCircle(bx, by, R);
        });
      },
    });
  }
};
