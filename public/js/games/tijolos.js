GAMES.tijolos = {
  name: 'Quebra-Tijolos', icon: 'brick-wall', hue: 0, desc: 'Rebata a bola e quebre os tijolos. Cada fase tem um desenho; tijolos escuros pedem 2 ou 3 batidas. Pegue os itens que caem: raquete grande, 3 bolas e bola lenta. Mouse, dedo ou ←→ movem; clique ou Espaço lança. 3 vidas.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 480, H = 560, PH = 14, PY = H - 40, R = 7, COLS = 8, ROWS = 7, BW = 52, BH = 18, GAP = 4, TOP = 64;
    const LEFT = (W - (COLS * BW + (COLS - 1) * GAP)) / 2, MAX_SPEED = 560, PW_BASE = 84, PW_WIDE = 132;
    // desenho de cada fase: . vazio, 1 a 3 = batidas pra quebrar. Depois da última, repete com +1 batida nos de cima.
    const LAYOUTS = [
      ['11111111', '11111111', '11111111', '11111111', '11111111', '11111111', '........'],
      ['...22...', '..2112..', '.211112.', '21111112', '.211112.', '..2112..', '...22...'],
      ['2.2.2.2.', '.1.1.1.1', '2.2.2.2.', '.1.1.1.1', '2.2.2.2.', '.1.1.1.1', '........'],
      ['33333333', '1......1', '1.2222.1', '1.2..2.1', '1.2222.1', '1......1', '11111111'],
      ['1......1', '21....12', '321..123', '.321123.', '..3223..', '...33...', '........'],
      ['22.22.22', '22.22.22', '........', '11111111', '13311331', '11111111', '........'],
    ];
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Vidas<b id="v" class="lives">' + hearts(3) + '</b></span><span class="stat">Fase<b id="f">1</b></span><span class="stat">Item<b id="it" class="bonus-hud">—</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v'), f: el.querySelector('#f'), it: el.querySelector('#it') };
    const ROW_COLORS = ['#ff5d73', '#ff8a4d', '#ffd34d', '#5fe08f', '#4dc3ff', '#8b6cff', '#ff7ad9'];
    const ITEMS = { wide: { color: '#4dc3ff', label: 'Raquete grande' }, multi: { color: '#ffd34d', label: '3 bolas' }, slow: { color: '#a98bff', label: 'Bola lenta' } };
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        const art = artKit(this);
        dotTexture(this);
        // ---------- arte ----------
        this.add.image(0, 0, art.backdrop('tj_bg', W, H, '#1a1d3a', '#0d0f1f', { grid: 32, stars: 30 })).setOrigin(0);
        ROW_COLORS.forEach((col, r) => [1, 2, 3].forEach(hp => {
          // tijolo de várias batidas: cor mais escura e rebites; o rachado aparece por cima conforme apanha
          art.tex(`tj_b${r}_${hp}`, BW, BH, c => {
            art.bevel(c, 0.5, 0.5, BW - 1, BH - 1, 5, hp === 1 ? col : art.tone(col, -0.25 * (hp - 1)));
            if (hp > 1) { c.fillStyle = 'rgba(255,255,255,.55)'; for (const x of [6, BW - 6]) { art.ell(c, x, BH / 2 + 1, 1.8, 1.8); c.fill(); } }
          });
        }));
        art.tex('tj_crack', BW, BH, c => {
          c.strokeStyle = 'rgba(10,10,25,.7)'; c.lineWidth = 1.3; c.lineCap = 'round';
          c.beginPath(); c.moveTo(BW * 0.3, 1); c.lineTo(BW * 0.38, BH * 0.45); c.lineTo(BW * 0.3, BH * 0.7); c.lineTo(BW * 0.42, BH - 1);
          c.moveTo(BW * 0.38, BH * 0.45); c.lineTo(BW * 0.55, BH * 0.4); c.lineTo(BW * 0.7, BH * 0.65); c.stroke();
        });
        const paddleTex = w => art.tex('tj_pad' + w, w, PH, c => {
          art.rr(c, 0.5, 0.5, w - 1, PH - 1, PH / 2); c.fillStyle = art.lin(c, 0, 0, 0, PH, [[0, '#ffffff'], [0.5, '#c9cfff'], [1, '#6f78c9']]); c.fill();
          c.lineWidth = 1.2; c.strokeStyle = '#2a2f66'; c.stroke();
          for (const x of [8, w - 8]) { art.rr(c, x - 4, 2, 8, PH - 4, 3); c.fillStyle = '#ff6b8a'; c.fill(); }
          art.rr(c, 6, 2, w - 12, 3, 2); c.fillStyle = 'rgba(255,255,255,.8)'; c.fill();
        });
        paddleTex(PW_BASE); paddleTex(PW_WIDE);
        art.tex('tj_ball', R * 2 + 2, R * 2 + 2, c => art.orb(c, R + 1, R + 1, R, '#ffe27a'));
        Object.entries(ITEMS).forEach(([k, it]) => art.tex('tj_it_' + k, 30, 18, c => {
          art.bevel(c, 0.5, 0.5, 29, 17, 8, it.color);
          c.fillStyle = '#10131c'; c.font = 'bold 11px Space Grotesk, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText({ wide: '↔', multi: '×3', slow: '≈' }[k], 15, 9.5);
        }));

        let px = W / 2, target = null, lives = 3, score = 0, level = 1, alive = true, bricks = [], balls = [], drops = [];
        let pw = PW_BASE, wideT = 0, slowT = 0;
        const brickLayer = this.add.layer(), dropLayer = this.add.layer(), ballImgs = [];
        const paddle = this.add.image(px, PY, 'tj_pad' + PW_BASE).setDisplaySize(PW_BASE, PH);
        const trail = this.add.graphics();
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 220 }, lifespan: 420, scale: { start: 1, end: 0 }, emitting: false });
        const msg = this.add.text(W / 2, H / 2 + 40, 'Clique ou Espaço pra lançar', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '20px', color: '#c9cce0' }).setOrigin(0.5);
        const build = () => {
          bricks.forEach(b => { b.img.destroy(); b.crack.destroy(); });
          bricks = [];
          const lay = LAYOUTS[(level - 1) % LAYOUTS.length], extra = Math.floor((level - 1) / LAYOUTS.length);
          lay.forEach((row, r) => [...row].forEach((ch, c) => {
            if (ch === '.') return;
            const hp = Math.min(3, +ch + (r < 3 ? extra : 0)), x = LEFT + c * (BW + GAP), y = TOP + r * (BH + GAP);
            const img = brickLayer.add(this.add.image(x, y, `tj_b${r}_${hp}`).setOrigin(0).setDisplaySize(BW, BH));
            const crack = brickLayer.add(this.add.image(x, y, 'tj_crack').setOrigin(0).setDisplaySize(BW, BH).setVisible(false));
            // entram caindo, um de cada vez
            img.y -= 30; img.alpha = 0;
            this.tweens.add({ targets: img, y, alpha: 1, duration: 260, delay: (r * COLS + c) * 12, ease: 'Back.Out' });
            bricks.push({ x, y, row: r, hp, max: hp, alive: true, img, crack });
          }));
        };
        const baseSpeed = () => (330 + (level - 1) * 30) * (slowT > 0 ? 0.7 : 1);
        const newBall = () => ({ x: px, y: PY - PH / 2 - R - 1, vx: 0, vy: 0, stuck: true, hist: [] });
        const resetBall = () => { balls = [newBall()]; msg.setVisible(true); };
        const launch = () => {
          const b = balls.find(b => b.stuck);
          if (!b || !alive) return;
          b.stuck = false; msg.setVisible(false);
          const a = Phaser.Math.DegToRad(rand(-30, 30)), s = baseSpeed();
          b.vx = s * Math.sin(a); b.vy = -s * Math.cos(a);
        };
        const itemHud = () => {
          const parts = [];
          if (wideT > 0) parts.push('grande ' + Math.ceil(wideT) + 's');
          if (slowT > 0) parts.push('lenta ' + Math.ceil(slowT) + 's');
          hud.it.textContent = parts.join(' · ') || '—';
        };
        // textura é pintada no dobro da resolução: setDisplaySize mantém o desenho do tamanho da hitbox
        const setWidth = w => { pw = w; paddle.setTexture('tj_pad' + w).setDisplaySize(w, PH); };
        const loseLife = () => {
          lives--;
          hud.v.innerHTML = hearts(lives);
          sfx.boom();
          this.cameras.main.shake(200, 0.01);
          drops.forEach(d => d.img.destroy()); drops = [];
          wideT = slowT = 0; setWidth(PW_BASE); itemHud();
          if (lives <= 0) { alive = false; balls = []; msg.setText('Fim de jogo').setVisible(true); this.time.delayedCall(900, () => done(score)); }
          else resetBall();
        };
        const collect = kind => {
          sfx.power();
          floatText(this, px, PY - 30, ITEMS[kind].label, ITEMS[kind].color);
          if (kind === 'wide') { wideT = 10; setWidth(PW_WIDE); }
          else if (kind === 'slow') { slowT = 8; for (const b of balls) { b.vx *= 0.7; b.vy *= 0.7; } }
          else {
            // 3 bolas: duas novas saindo da bola mais alta, abrindo em leque
            const src = balls.filter(b => !b.stuck).sort((a, b) => a.y - b.y)[0];
            if (src) for (const ang of [-25, 25]) {
              const sp = Math.hypot(src.vx, src.vy), a = Math.atan2(src.vx, -src.vy) + Phaser.Math.DegToRad(ang);
              balls.push({ x: src.x, y: src.y, vx: sp * Math.sin(a), vy: -Math.abs(sp * Math.cos(a)), stuck: false, hist: [] });
            }
          }
          itemHud();
        };
        const hitBrick = (b, ball) => {
          b.hp--;
          score += 5;
          if (b.hp > 0) {
            b.crack.setVisible(true).setAlpha(1 - b.hp / b.max + 0.25);
            b.img.setTint(0xdddddd); this.time.delayedCall(70, () => b.img.clearTint());
            sfx.hit();
          } else {
            b.alive = false;
            score += (ROWS - b.row) * 10 * b.max;
            this.tweens.add({ targets: [b.img, b.crack], scale: 0, alpha: 0, angle: rand(-25, 25), duration: 180, ease: 'Back.In' });
            burst.setParticleTint(Phaser.Display.Color.HexStringToColor(ROW_COLORS[b.row]).color);
            burst.explode(12, b.x + BW / 2, b.y + BH / 2);
            beep(500 + (ROWS - b.row) * 60, 50, 'triangle', 0.035);
            if (Math.random() < 0.12) {
              const kind = ['wide', 'multi', 'slow'][rand(0, 2)];
              drops.push({ kind, x: b.x + BW / 2, y: b.y + BH / 2, img: dropLayer.add(this.add.image(b.x + BW / 2, b.y + BH / 2, 'tj_it_' + kind).setDisplaySize(30, 18)) });
            }
          }
          hud.p.textContent = score;
          const sp = Math.hypot(ball.vx, ball.vy);
          if (sp < MAX_SPEED) { ball.vx *= 1.015; ball.vy *= 1.015; }
        };
        const keys = this.input.keyboard.addKeys('LEFT,RIGHT,A,D');
        this.input.keyboard.addCapture('LEFT,RIGHT,SPACE');
        this.input.keyboard.on('keydown', e => { if (e.key === ' ' && !e.repeat) launch(); });
        this.input.on('pointermove', p => { target = p.x; });
        this.input.on('pointerdown', p => { target = p.x; launch(); });
        build(); resetBall();
        this.events.on('update', (time, delta) => {
          const dt = Math.min(delta, 50) / 1000;
          if (alive) {
            if (wideT > 0 && (wideT -= dt) <= 0) { wideT = 0; setWidth(PW_BASE); }
            if (slowT > 0 && (slowT -= dt) <= 0) { slowT = 0; for (const b of balls) { b.vx /= 0.7; b.vy /= 0.7; } }
            if (Math.floor(time / 250) !== Math.floor((time - delta) / 250)) itemHud();
            const dir = (keys.RIGHT.isDown || keys.D.isDown) - (keys.LEFT.isDown || keys.A.isDown);
            if (dir) { px += dir * 560 * dt; target = null; }
            else if (target !== null) px += Phaser.Math.Clamp(target - px, -1000 * dt, 1000 * dt);
            px = Phaser.Math.Clamp(px, pw / 2, W - pw / 2);
            for (const ball of balls) {
              if (ball.stuck) { ball.x = px; ball.y = PY - PH / 2 - R - 1; continue; }
              // passos pequenos pra bola rápida não atravessar tijolo
              const steps = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 5));
              for (let s = 0; s < steps && !ball.out; s++) {
                const h = dt / steps;
                ball.x += ball.vx * h; ball.y += ball.vy * h;
                if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); }
                if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); }
                if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); }
                if (ball.vy > 0 && ball.y + R >= PY - PH / 2 && ball.y - R <= PY + PH / 2 && ball.x >= px - pw / 2 - R && ball.x <= px + pw / 2 + R) {
                  // onde bate na raquete define o ângulo (até 60°)
                  const rel = Phaser.Math.Clamp((ball.x - px) / (pw / 2), -1, 1), sp = Math.hypot(ball.vx, ball.vy), ang = rel * Phaser.Math.DegToRad(60);
                  ball.vx = sp * Math.sin(ang); ball.vy = -sp * Math.cos(ang); ball.y = PY - PH / 2 - R;
                  this.tweens.add({ targets: paddle, scaleY: 0.35, duration: 60, yoyo: true, onComplete: () => paddle.setDisplaySize(pw, PH) });
                  beep(330, 40, 'triangle', 0.03);
                }
                for (const b of bricks) {
                  if (!b.alive) continue;
                  const nx = Phaser.Math.Clamp(ball.x, b.x, b.x + BW), ny = Phaser.Math.Clamp(ball.y, b.y, b.y + BH);
                  if ((ball.x - nx) ** 2 + (ball.y - ny) ** 2 >= R * R) continue;
                  const overlapX = Math.min(ball.x + R - b.x, b.x + BW - (ball.x - R)), overlapY = Math.min(ball.y + R - b.y, b.y + BH - (ball.y - R));
                  if (overlapX < overlapY) ball.vx = -ball.vx; else ball.vy = -ball.vy;
                  hitBrick(b, ball);
                  break;
                }
                if (ball.y > H + R) ball.out = true;
              }
              ball.hist.push(ball.x, ball.y); if (ball.hist.length > 16) ball.hist.splice(0, 2);
            }
            if (balls.length && balls.every(b => b.out)) loseLife();
            else balls = balls.filter(b => !b.out);
            for (const d of drops) {
              d.y += 150 * dt; d.img.setPosition(d.x, d.y).setAngle(Math.sin(time / 120) * 8);
              if (d.y + 9 >= PY - PH / 2 && d.y - 9 <= PY + PH / 2 && Math.abs(d.x - px) <= pw / 2 + 15) { d.got = true; collect(d.kind); }
            }
            drops = drops.filter(d => { if (d.got || d.y > H + 20) { d.img.destroy(); return false; } return true; });
            if (alive && bricks.every(b => !b.alive)) {
              level++; hud.f.textContent = level;
              floatText(this, W / 2, H / 2, `Fase ${level}!`, '#7cffb0');
              sfx.record();
              drops.forEach(d => d.img.destroy()); drops = [];
              build(); resetBall();
            }
          }
          paddle.setPosition(px, PY);
          // bolas com rastro brilhante
          trail.clear();
          for (const ball of balls) {
            for (let i = 0; i < ball.hist.length; i += 2) trail.fillStyle(0xffd34d, (i / ball.hist.length) * 0.35).fillCircle(ball.hist[i], ball.hist[i + 1], R * (0.4 + i / ball.hist.length * 0.6));
          }
          ballImgs.forEach((img, i) => { const b = balls[i]; img.setVisible(!!b); if (b) img.setPosition(b.x, b.y); });
          while (ballImgs.length < balls.length) ballImgs.push(this.add.image(0, 0, 'tj_ball').setDisplaySize(R * 2 + 2, R * 2 + 2));
        });
      },
    });
  }
};
