GAMES.invasores = {
  name: 'Invasores', icon: 'invasores', hue: 285, desc: 'Desvie dos tiros e destrua as naves. ←→ / A D ou arraste — o tiro é automático. Se esconda atrás das barreiras (elas se desgastam) e acerte a nave-mãe lá em cima pra ganhar bônus. 3 vidas.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 480, H = 560, PY = H - 40, COLS = 8, ROWS = 4, SX = 46, SY = 40, BLK = 6;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Vidas<b id="v" class="lives">' + hearts(3) + '</b></span><span class="stat">Onda<b id="o">1</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v'), o: el.querySelector('#o') };
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        const art = artKit(this);
        dotTexture(this);
        // ---------- arte ----------
        this.add.image(0, 0, art.backdrop('iv_bg', W, H, '#120c2e', '#05040f', { stars: 160 })).setOrigin(0);
        // planeta no canto, pra dar profundidade
        this.add.image(W - 70, H - 150, art.tex('iv_planet', 120, 120, c => {
          art.ell(c, 60, 60, 52, 52); c.fillStyle = art.rad(c, 40, 38, 6, 60, [[0, '#7b6cff'], [0.6, '#3b2a7a'], [1, '#140c33']]); c.fill();
          c.strokeStyle = 'rgba(180,160,255,.35)'; c.lineWidth = 3; art.ell(c, 60, 62, 70, 14, -0.25); c.stroke();
        })).setAlpha(0.55);
        // invasor de 2 quadros (pernas e braços mexem), em 3 cores por linha
        const ALIEN = [
          ['..X....X..', '...X..X...', '..XXXXXX..', '.XX.XX.XX.', 'XXXXXXXXXX', 'X.XXXXXX.X', 'X.X....X.X', '...XX.XX..'],
          ['..X....X..', 'X..X..X..X', 'X.XXXXXX.X', 'XXX.XX.XXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..X....X..', '.X......X.'],
        ];
        const ALIEN_COLORS = ['#ff7ad9', '#a993ff', '#5ff0ac', '#5ff0ac'];
        ALIEN_COLORS.forEach((col, r) => [0, 1].forEach(f => art.tex(`iv_a${r}_${f}`, 32, 26, c => {
          const px = 3;
          ALIEN[f].forEach((row, y) => [...row].forEach((ch, x) => {
            if (ch !== 'X') return;
            c.fillStyle = art.lin(c, 0, y * px + 1, 0, y * px + px + 1, [[0, art.tone(col, 0.35)], [1, art.tone(col, -0.2)]]);
            c.fillRect(1 + x * px, 1 + y * px, px, px);
          }));
          c.fillStyle = '#10131c'; c.fillRect(1 + 3 * px, 1 + 3 * px, px, px); c.fillRect(1 + 6 * px, 1 + 3 * px, px, px); // olhos
          c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(1 + 3 * px, 1 + 3 * px, 1, 1); c.fillRect(1 + 6 * px, 1 + 3 * px, 1, 1);
        })));
        art.tex('iv_ship', 40, 34, c => {
          c.beginPath(); c.moveTo(20, 1); c.lineTo(27, 14); c.lineTo(38, 24); c.lineTo(38, 30); c.lineTo(2, 30); c.lineTo(2, 24); c.lineTo(13, 14); c.closePath();
          c.fillStyle = art.lin(c, 0, 0, 0, 30, [[0, '#d9fff0'], [0.5, '#3ddc97'], [1, '#14704a']]); c.fill();
          c.lineWidth = 1.4; c.strokeStyle = '#0b2e22'; c.stroke();
          art.ell(c, 20, 15, 4, 6); c.fillStyle = art.rad(c, 19, 13, 1, 6, [[0, '#ffffff'], [1, '#4dc3ff']]); c.fill();
          c.fillStyle = '#ff8a5c'; c.fillRect(8, 30, 6, 3); c.fillRect(26, 30, 6, 3);
        });
        art.tex('iv_ufo', 56, 26, c => {
          art.ell(c, 28, 9, 11, 9); c.fillStyle = art.rad(c, 25, 5, 1, 12, [[0, '#ffffff'], [1, '#7fe7ff']]); c.fill();
          art.ell(c, 28, 16, 27, 8); c.fillStyle = art.lin(c, 0, 8, 0, 24, [[0, '#ffb3c6'], [0.5, '#ff4d6d'], [1, '#7a1230']]); c.fill();
          c.lineWidth = 1.3; c.strokeStyle = '#3a0716'; c.stroke();
          for (let i = 0; i < 5; i++) { art.ell(c, 10 + i * 9, 17, 2.2, 2.2); c.fillStyle = '#ffe27a'; c.fill(); }
        });
        art.tex('iv_shot', 6, 16, c => { art.rr(c, 1, 0, 4, 16, 2); c.fillStyle = art.lin(c, 0, 0, 0, 16, [[0, '#ffffff'], [0.4, '#ffe27a'], [1, 'rgba(255,170,60,0)']]); c.fill(); });
        art.tex('iv_bomb', 10, 14, c => { art.orb(c, 5, 8, 4.5, '#ff5d73'); c.fillStyle = 'rgba(255,120,140,.4)'; c.fillRect(3.5, 0, 3, 4); });

        let px = W / 2, target = null, lives = 3, score = 0, wave = 1, alive = true, fireIn = 0, enemyFireIn = 1200, invuln = 0, frame = 0, frameT = 0;
        let enemies = [], offX = 0, offY = 0, dir = 1, ufo = null, ufoIn = 9000;
        const shots = [], bombs = [];
        // barreiras: blocos de 6px que somem com tiro (dos dois lados)
        let walls = [];
        const wallG = this.add.graphics();
        const BUNKER = ['..XXXXXX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXX....XXX', 'XX......XX'];
        const buildWalls = () => {
          walls = [];
          for (let k = 0; k < 4; k++) {
            const x0 = 48 + k * ((W - 96) / 3) - 30;
            BUNKER.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') walls.push({ x: x0 + x * BLK, y: PY - 92 + y * BLK, hp: 2 }); }));
          }
        };
        const hitWall = (x, y, r = 3) => {
          for (const b of walls) {
            if (b.hp > 0 && x + r > b.x && x - r < b.x + BLK && y + r > b.y && y - r < b.y + BLK) { b.hp--; return true; }
          }
          return false;
        };
        const g = this.add.graphics();
        const ship = this.add.image(px, PY, 'iv_ship').setDisplaySize(40, 34);
        const ufoImg = this.add.image(-100, 40, 'iv_ufo').setDisplaySize(56, 26).setVisible(false);
        const shotImgs = [], bombImgs = [];
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 220 }, lifespan: 420, scale: { start: 1.1, end: 0 }, tint: [hex('--primary'), hex('--accent')], emitting: false });
        const flame = this.add.particles(0, 0, 'dot', { speed: { min: 30, max: 70 }, angle: { min: 80, max: 100 }, lifespan: 220, scale: { start: 0.7, end: 0 }, tint: [0xff8a5c, 0xffd34d], frequency: 40, quantity: 2 });
        const buildWave = () => {
          for (const e of enemies) e.o.destroy();
          enemies = []; offX = 0; offY = 0; dir = 1;
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const o = this.add.image(0, 0, `iv_a${r}_0`).setDisplaySize(32, 26);
            enemies.push({ bx: 60 + c * SX, by: 90 + r * SY, row: r, alive: true, o });
          }
          buildWalls();
        };
        const gameOver = () => { alive = false; flame.stop(); sfx.boom(); burst.explode(30, px, PY); ship.setVisible(false); this.cameras.main.shake(300, 0.012); this.time.delayedCall(1000, () => done(score)); };
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
            // passo de animação: mais rápido quando a formação acelera
            frameT += delta;
            if (frameT > Math.max(140, 600 - speed * 2)) { frameT = 0; frame ^= 1; for (const e of enemies) if (e.alive) e.o.setTexture(`iv_a${e.row}_${frame}`); }
            for (const e of enemies) if (e.alive) e.o.setPosition(e.bx + offX, e.by + offY);
            // invasor que encosta na barreira apaga o pedaço
            for (const e of living) for (const b of walls) if (b.hp > 0 && Math.abs(e.bx + offX - b.x - 3) < 16 && Math.abs(e.by + offY - b.y - 3) < 13) b.hp = 0;
            // nave-mãe: passa de vez em quando lá em cima; vale 100 a 300 × onda
            ufoIn -= delta;
            if (!ufo && ufoIn <= 0) { const fromLeft = Math.random() < 0.5; ufo = { x: fromLeft ? -40 : W + 40, v: fromLeft ? 110 : -110 }; ufoImg.setVisible(true); }
            if (ufo) {
              ufo.x += ufo.v * dt; ufoImg.setPosition(ufo.x, 44 + Math.sin(time / 200) * 3);
              if (Math.floor(time / 180) % 2) beep(ufo.v > 0 ? 330 : 300, 30, 'sine', 0.01);
              if (ufo.x < -60 || ufo.x > W + 60) { ufo = null; ufoImg.setVisible(false); ufoIn = rand(12000, 20000); }
            }
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
              if (hitWall(s.x, s.y, 2)) { s.y = -99; continue; }
              if (ufo && Math.abs(ufo.x - s.x) < 26 && Math.abs(44 - s.y) < 14) {
                const bonus = [100, 150, 200, 300][rand(0, 3)] * wave;
                score += bonus; hud.p.textContent = score; s.y = -99;
                burst.explode(40, ufo.x, 44); floatText(this, ufo.x, 70, '+' + bonus, '#ffd34d'); sfx.coin(); sfx.hit();
                ufo = null; ufoImg.setVisible(false); ufoIn = rand(12000, 20000);
                continue;
              }
              for (const e of enemies) {
                if (!e.alive || Math.abs(e.bx + offX - s.x) > 17 || Math.abs(e.by + offY - s.y) > 15) continue;
                e.alive = false; s.y = -99;
                this.tweens.add({ targets: e.o, scale: 0, angle: 90, duration: 160, onComplete: () => e.o.setVisible(false) });
                score += [30, 20, 10, 10][e.row] * wave;
                hud.p.textContent = score;
                burst.explode(14, e.bx + offX, e.by + offY);
                sfx.hit();
                break;
              }
            }
            for (const b of bombs) {
              b.y += (230 + wave * 15) * dt;
              if (hitWall(b.x, b.y, 3)) { b.y = H + 99; continue; }
              if (!invuln && Math.abs(b.x - px) < 16 && Math.abs(b.y - PY) < 14) {
                b.y = H + 99;
                lives--; hud.v.innerHTML = hearts(lives);
                if (lives <= 0) return gameOver();
                invuln = 1500; sfx.boom(); burst.explode(20, px, PY); this.cameras.main.shake(180, 0.01);
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
          ship.setPosition(px, PY).setVisible(alive && !(invuln && Math.floor(time / 100) % 2));
          flame.setPosition(px, PY + 18);
          const sync = (imgs, list, key) => {
            while (imgs.length < list.length) imgs.push(this.add.image(0, 0, key));
            imgs.forEach((img, i) => { const o = list[i]; img.setVisible(!!o); if (o) img.setPosition(o.x, o.y); });
          };
          sync(shotImgs, shots, 'iv_shot'); sync(bombImgs, bombs, 'iv_bomb');
          g.clear();
          wallG.clear();
          for (const b of walls) if (b.hp > 0) wallG.fillStyle(b.hp > 1 ? 0x3ddc97 : 0x1e8a55).fillRect(b.x, b.y, BLK - 0.5, BLK - 0.5);
        });
      },
    });
  }
};
