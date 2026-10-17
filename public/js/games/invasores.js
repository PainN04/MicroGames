GAMES.invasores = {
  name: 'Invasores', icon: 'ghost', hue: 285, desc: 'Desvie dos tiros e destrua as naves. ←→ / A D ou arraste — o tiro é automático. 3 vidas.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 480, H = 560, PY = H - 40, COLS = 8, ROWS = 4, SX = 46, SY = 40;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Vidas<b id="v" class="lives">' + hearts(3) + '</b></span><span class="stat">Onda<b id="o">1</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v'), o: el.querySelector('#o') };
    return mountPhaser(el.querySelector('#pw'), W, H, {
      preload() {
        // duas cores de invasor: fantasma preenchido com o contorno (e os olhos) mais escuro
        this.load.image('invA', iconDataUrl('ghost', '#3b2a7a', 64, { fill: '#a993ff' }));
        this.load.image('invB', iconDataUrl('ghost', '#0f4a39', 64, { fill: '#5ff0ac' }));
      },
      create() {
        dotTexture(this);
        let px = W / 2, target = null, lives = 3, score = 0, wave = 1, alive = true, fireIn = 0, enemyFireIn = 1200, invuln = 0;
        let enemies = [], offX = 0, offY = 0, dir = 1;
        const shots = [], bombs = [];
        const g = this.add.graphics();
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 220 }, lifespan: 420, scale: { start: 1.1, end: 0 }, tint: [hex('--primary'), hex('--accent')], emitting: false });
        const buildWave = () => {
          for (const e of enemies) e.o.destroy();
          enemies = []; offX = 0; offY = 0; dir = 1;
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const o = this.add.image(0, 0, r < 2 ? 'invA' : 'invB').setDisplaySize(30, 30);
            enemies.push({ bx: 60 + c * SX, by: 70 + r * SY, row: r, alive: true, o });
          }
        };
        const gameOver = () => { alive = false; sfx.bad(); this.cameras.main.shake(300, 0.012); this.time.delayedCall(1000, () => done(score)); };
        const keys = this.input.keyboard.addKeys('LEFT,RIGHT,A,D');
        this.input.keyboard.addCapture('LEFT,RIGHT,SPACE');
        this.input.on('pointerdown', p => { target = p.x; });
        // mouse: segue o cursor; dedo: só enquanto está encostado
        this.input.on('pointermove', p => { if (p.isDown || !p.wasTouch) target = p.x; });
        buildWave();
        this.events.on('update', (time, delta) => {
          const dt = Math.min(delta, 50) / 1000;
          if (alive) {
            const dirKey = (keys.RIGHT.isDown || keys.D.isDown) - (keys.LEFT.isDown || keys.A.isDown);
            if (dirKey) { px += dirKey * 340 * dt; target = null; }
            else if (target !== null) px += Phaser.Math.Clamp(target - px, -420 * dt, 420 * dt);
            px = Phaser.Math.Clamp(px, 20, W - 20);
            invuln = Math.max(0, invuln - delta);
            // tiro automático
            fireIn -= delta;
            if (fireIn <= 0) { shots.push({ x: px, y: PY - 18 }); fireIn = 380; beep(880, 25, 'square', 0.012); }
            // formação anda de lado e desce ao bater na borda; acelera conforme sobram menos naves
            const living = enemies.filter(e => e.alive);
            const speed = 35 + (1 - living.length / enemies.length) * 140 + wave * 12;
            offX += dir * speed * dt;
            const xs = living.map(e => e.bx + offX);
            if (Math.max(...xs) > W - 20 && dir > 0) { dir = -1; offY += 16; }
            if (Math.min(...xs) < 20 && dir < 0) { dir = 1; offY += 16; }
            for (const e of enemies) if (e.alive) e.o.setPosition(e.bx + offX, e.by + offY);
            // naves de baixo de cada coluna atiram
            enemyFireIn -= delta;
            if (enemyFireIn <= 0 && living.length) {
              const shooters = Object.values(living.reduce((m, e) => ((!m[e.bx] || m[e.bx].by < e.by) && (m[e.bx] = e), m), {}));
              const s = shooters[rand(0, shooters.length - 1)];
              bombs.push({ x: s.bx + offX, y: s.by + offY + 14 });
              enemyFireIn = Math.max(320, 1000 - wave * 80) * (0.6 + Math.random() * 0.8);
            }
            for (const s of shots) {
              s.y -= 520 * dt;
              for (const e of enemies) {
                if (!e.alive || Math.abs(e.bx + offX - s.x) > 17 || Math.abs(e.by + offY - s.y) > 15) continue;
                e.alive = false; e.o.setVisible(false); s.y = -99;
                score += [30, 20, 10, 10][e.row] * wave;
                hud.p.textContent = score;
                burst.explode(14, e.bx + offX, e.by + offY);
                beep(220 + e.row * 40, 60, 'sawtooth', 0.025);
                break;
              }
            }
            for (const b of bombs) {
              b.y += (230 + wave * 15) * dt;
              if (!invuln && Math.abs(b.x - px) < 16 && Math.abs(b.y - PY) < 14) {
                b.y = H + 99;
                lives--; hud.v.innerHTML = hearts(lives);
                invuln = 1500; sfx.bad(); this.cameras.main.shake(180, 0.01);
                if (lives <= 0) return gameOver();
              }
            }
            if (living.some(e => e.by + offY > PY - 30)) return gameOver();
            if (!living.length) {
              wave++; hud.o.textContent = wave;
              floatText(this, W / 2, H / 2, `Onda ${wave}!`, '#7cffb0'); sfx.record();
              shots.length = 0; bombs.length = 0; buildWave();
            }
          }
          for (let i = shots.length - 1; i >= 0; i--) if (shots[i].y < -10) shots.splice(i, 1);
          for (let i = bombs.length - 1; i >= 0; i--) if (bombs[i].y > H + 10) bombs.splice(i, 1);
          g.clear();
          if (alive && !(invuln && Math.floor(time / 100) % 2)) g.fillStyle(hex('--green')).fillTriangle(px, PY - 16, px - 16, PY + 12, px + 16, PY + 12);
          g.fillStyle(hex('--yellow'));
          for (const s of shots) g.fillRect(s.x - 2, s.y - 8, 4, 12);
          g.fillStyle(hex('--red'));
          for (const b of bombs) g.fillCircle(b.x, b.y, 4);
        });
      },
    });
  }
};
