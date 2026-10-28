GAMES.pong = {
  name: 'Pong', icon: 'pong', hue: 205, desc: 'Rebata a bola e passe pela máquina. Mouse, dedo ou ←→ movem a raquete. A bola e a máquina ficam mais rápidas a cada ponto. Bater com a raquete andando dá efeito: a bola faz curva. 3 vidas.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 420, H = 560, PW = 80, PH = 12, R = 8, PY = H - 36, AY = 36;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Vidas<b id="v" class="lives">' + hearts(3) + '</b></span><span class="stat">Bola<b id="s">1,0x</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v'), s: el.querySelector('#s') };
    const col = { me: 0xe8eaf6, cpu: hex('--red'), ball: hex('--yellow'), line: 0x34384f };
    const BASE = 300, MAX = 640;
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        dotTexture(this);
        let px = W / 2, ax = W / 2, target = null, bx = W / 2, by = H / 2, vx = 0, vy = 0;
        let lives = 3, score = 0, alive = true, waiting = true, serveIn = 0, aimErr = 0, hits = 0, spin = 0, lastPx = px, padV = 0;
        const hist = [];
        // ---------- arte ----------
        const art = artKit(this);
        this.add.image(0, 0, art.backdrop('pg_bg', W, H, '#14183a', '#080a1c', { grid: 28 })).setOrigin(0).setDisplaySize(W, H);
        const big = this.add.text(W / 2, H / 2, '0', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '150px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.05);
        const padTex = (key, col) => art.tex(key, PW + 16, PH + 16, c => {
          c.shadowColor = col; c.shadowBlur = 10;
          art.rr(c, 8, 8, PW, PH, PH / 2); c.fillStyle = art.lin(c, 0, 8, 0, 8 + PH, [[0, art.tone(col, 0.6)], [0.5, col], [1, art.tone(col, -0.35)]]); c.fill();
          c.shadowBlur = 0; art.rr(c, 14, 10, PW - 12, 3, 2); c.fillStyle = 'rgba(255,255,255,.7)'; c.fill();
        });
        padTex('pg_me', '#e8eaf6'); padTex('pg_cpu', '#ff5d73');
        art.tex('pg_ball', R * 2 + 12, R * 2 + 12, c => { c.shadowColor = '#ffd34d'; c.shadowBlur = 8; art.orb(c, R + 6, R + 6, R, '#ffe27a'); });
        const g = this.add.graphics();
        // texturas são pintadas no dobro da resolução: setDisplaySize deixa o desenho do tamanho da hitbox
        const meImg = this.add.image(px, PY, 'pg_me').setDisplaySize(PW + 16, PH + 16), cpuImg = this.add.image(ax, AY, 'pg_cpu').setDisplaySize(PW + 16, PH + 16);
        const ballImg = this.add.image(bx, by, 'pg_ball').setDisplaySize(R * 2 + 12, R * 2 + 12);
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 180 }, lifespan: 360, scale: { start: 0.9, end: 0 }, emitting: false });
        const msg = this.add.text(W / 2, H / 2 + 60, 'Toque ou Espaço pra começar', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '20px', color: '#c9cce0' }).setOrigin(0.5);
        // velocidade de saque cresce com os pontos; cada rebatida na rali acelera mais um pouco
        const speedNow = () => Math.min(MAX, BASE + score * 16);
        // a máquina: anda no máximo X px/s (cresce com os pontos) e mira com um erro que diminui
        const aiSpeed = () => Math.min(430, 170 + score * 14);
        const serve = () => {
          bx = W / 2; by = H / 2; hits = 0;
          const a = Phaser.Math.DegToRad(rand(-28, 28)), s = speedNow();
          vx = s * Math.sin(a); vy = s * Math.cos(a); // desce, na direção do jogador
          aimErr = rand(-30, 30);
          waiting = false;
        };
        const reset = () => { waiting = true; vx = vy = 0; spin = 0; bx = W / 2; by = H / 2; serveIn = 700; hist.length = 0; };
        const speedHud = () => { hud.s.textContent = dec((Math.hypot(vx, vy) / BASE), 1) + 'x'; };
        const point = who => {
          if (who === 'me') {
            score++; hud.p.textContent = score; big.setText(score);
            this.tweens.add({ targets: big, alpha: 0.18, duration: 120, yoyo: true });
            floatText(this, bx, 90, '+1', '#7cffb0'); sfx.good();
          } else {
            lives--; hud.v.innerHTML = hearts(lives);
            sfx.boom(); this.cameras.main.shake(180, 0.008);
            if (lives <= 0) { alive = false; msg.setText('Fim de jogo').setVisible(true); this.time.delayedCall(850, () => done(score)); return; }
          }
          reset();
        };
        const bounce = (padX, dirY) => {
          const rel = Phaser.Math.Clamp((bx - padX) / (PW / 2), -1, 1), ang = rel * Phaser.Math.DegToRad(58);
          hits++;
          const sp = Math.min(MAX + 60, speedNow() * (1 + Math.min(hits, 10) * 0.03));
          vx = sp * Math.sin(ang); vy = dirY * sp * Math.cos(ang);
          // efeito: a raquete andando na hora da batida faz a bola curvar pro lado do movimento
          const pv = dirY < 0 ? padV : 0;
          spin = Phaser.Math.Clamp(pv * 0.9, -700, 700);
          if (Math.abs(spin) > 250) floatText(this, bx, by - 20, 'efeito!', '#c9b3ff');
          aimErr = rand(-30, 30) * Math.max(0.15, 1 - score * 0.04); // a máquina erra menos a mira com o tempo
          burst.setParticleTint(dirY < 0 ? col.me : col.cpu); burst.explode(8, bx, by);
          beep(dirY < 0 ? 330 : 260, 40, 'triangle', 0.03);
        };
        const keys = this.input.keyboard.addKeys('LEFT,RIGHT,A,D');
        this.input.keyboard.addCapture('LEFT,RIGHT,SPACE');
        const begin = () => { if (!alive || !msg.visible || lives < 1) return; msg.setVisible(false); reset(); };
        this.input.keyboard.on('keydown', e => { if (e.key === ' ' && !e.repeat) begin(); });
        this.input.on('pointermove', p => { target = p.x; });
        this.input.on('pointerdown', p => { target = p.x; begin(); });
        this.events.on('update', (time, delta) => {
          const dt = Math.min(delta, 50) / 1000;
          padV = (px - lastPx) / Math.max(dt, 0.001); lastPx = px;
          if (alive && !msg.visible) {
            const dir = (keys.RIGHT.isDown || keys.D.isDown) - (keys.LEFT.isDown || keys.A.isDown);
            if (dir) { px += dir * 560 * dt; target = null; }
            else if (target !== null) px += Phaser.Math.Clamp(target - px, -1100 * dt, 1100 * dt);
            px = Phaser.Math.Clamp(px, PW / 2, W - PW / 2);
            // máquina: persegue a bola (com erro de mira) só quando ela vem; senão volta pro meio
            const goal = vy < 0 && !waiting ? bx + aimErr : W / 2;
            ax += Phaser.Math.Clamp(goal - ax, -aiSpeed() * dt, aiSpeed() * dt);
            ax = Phaser.Math.Clamp(ax, PW / 2, W - PW / 2);
            if (waiting) { serveIn -= delta; if (serveIn <= 0) serve(); }
            else {
              const steps = Math.max(1, Math.ceil(Math.hypot(vx, vy) * dt / 5));
              for (let s = 0; s < steps && !waiting && alive; s++) {
                const h = dt / steps;
                vx += spin * h; spin *= Math.pow(0.35, h); // a curva vai perdendo força
                bx += vx * h; by += vy * h;
                if (bx < R) { bx = R; vx = Math.abs(vx); beep(200, 25, 'sine', 0.02); }
                if (bx > W - R) { bx = W - R; vx = -Math.abs(vx); beep(200, 25, 'sine', 0.02); }
                if (vy > 0 && by + R >= PY - PH / 2 && by - R <= PY + PH / 2 && bx >= px - PW / 2 - R && bx <= px + PW / 2 + R) { by = PY - PH / 2 - R; bounce(px, -1); }
                else if (vy < 0 && by - R <= AY + PH / 2 && by + R >= AY - PH / 2 && bx >= ax - PW / 2 - R && bx <= ax + PW / 2 + R) { by = AY + PH / 2 + R; bounce(ax, 1); }
                else if (by < -R) point('me');
                else if (by > H + R) point('cpu');
              }
              speedHud();
            }
          }
          g.clear();
          g.fillStyle(col.line, 0.6);
          for (let x = 8; x < W; x += 24) g.fillRect(x, H / 2 - 2, 12, 4);
          // rastro da bola (roxo quando tem efeito)
          if (!waiting) { hist.push(bx, by); if (hist.length > 20) hist.splice(0, 2); }
          const trailCol = Math.abs(spin) > 150 ? 0xc9b3ff : col.ball;
          for (let i = 0; i < hist.length; i += 2) g.fillStyle(trailCol, (i / hist.length) * 0.4).fillCircle(hist[i], hist[i + 1], R * (0.3 + 0.7 * i / hist.length));
          meImg.setPosition(px, PY); cpuImg.setPosition(ax, AY); ballImg.setPosition(bx, by);
        });
      },
    });
  }
};
