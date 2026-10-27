GAMES.chuva = {
  name: 'Chuva de Bugs', icon: 'bug', hue: 180, desc: 'Desvie dos bugs! Setas/AD ou arraste o dedo. Acelera com o tempo. Tem bug rápido, bug que anda em zigue-zague e bugão; o café deixa tudo lento por 3s.',
  better: 'high', unit: 's', decimals: 1, phaser: true,
  start(el, done) {
    const W = 480, H = 520, PY = H - 44, PR = 16;
    el.innerHTML = '<div class="hud"><span class="stat">Tempo<b id="t">0,0s</b></span><span class="stat">Bugs<b id="b">0</b></span><span class="stat">Café<b id="c" class="bonus-hud">—</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { t: el.querySelector('#t'), b: el.querySelector('#b'), c: el.querySelector('#c') };
    // tipos de bug: raio de colisão, tamanho, velocidade (× a base), cor
    const KINDS = {
      bug: { r: 12, size: 28, speed: 1, color: '#5ff0ac', dark: '#14704a' },
      fast: { r: 10, size: 22, speed: 1.6, color: '#ff8a5c', dark: '#8a3216' },
      zig: { r: 11, size: 26, speed: 0.9, color: '#c9b3ff', dark: '#4b2c90' },
      big: { r: 20, size: 46, speed: 0.75, color: '#ff5d73', dark: '#7a1230' },
    };
    const SLOW = 3, SLOW_FACTOR = 0.45;
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        const art = artKit(this);
        // ---------- arte ----------
        // fundo: editor de código escuro com linhas coloridas rolando (duas cópias pra emendar)
        const CODE_H = 520;
        art.tex('cb_code', W, CODE_H, (c, w, h) => {
          c.fillStyle = art.lin(c, 0, 0, 0, h, [[0, '#0f1426'], [1, '#141a33']]); c.fillRect(0, 0, w, h);
          c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(0, 0, 34, h);
          const cols = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#ffcb6b', '#5c6370'];
          for (let y = 14, n = 1; y < h; y += 17, n++) {
            c.fillStyle = 'rgba(255,255,255,.18)'; c.font = '9px monospace'; c.fillText(String(n).padStart(3, ' '), 6, y + 3);
            let x = 44 + (n * 7 % 4) * 14;
            const parts = 2 + (n * 13 % 5);
            for (let k = 0; k < parts && x < w - 20; k++) {
              const len = 14 + ((n * 31 + k * 17) % 70);
              c.fillStyle = cols[(n + k * 3) % cols.length]; c.globalAlpha = 0.16; art.rr(c, x, y - 3, len, 5, 2.5); c.fill();
              x += len + 8;
            }
            c.globalAlpha = 1;
          }
        });
        const code = [0, 1].map(i => this.add.image(0, i * CODE_H, 'cb_code').setOrigin(0));
        this.add.image(0, 0, art.tex('cb_vig', W, H, (c, w, h) => { c.fillStyle = art.rad(c, w / 2, h / 2, h * 0.3, h * 0.8, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.55)']]); c.fillRect(0, 0, w, h); })).setOrigin(0).setDepth(1);
        // notebook do jogador: tela acesa com código, teclado e reflexo
        art.tex('cb_laptop', 44, 36, c => {
          art.rr(c, 6, 2, 32, 22, 3); c.fillStyle = '#2a2f4a'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#0b0d1a'; c.stroke();
          art.rr(c, 8.5, 4.5, 27, 17, 2); c.fillStyle = art.lin(c, 0, 4, 0, 21, [[0, '#2be3a0'], [1, '#0e7a5a']]); c.fill();
          c.fillStyle = 'rgba(255,255,255,.75)'; [7, 10, 13, 16].forEach((y, i) => c.fillRect(11 + (i % 2) * 3, y, 10 + (i * 5 % 9), 1.4));
          c.beginPath(); c.moveTo(2, 25); c.lineTo(42, 25); c.lineTo(38, 33); c.lineTo(6, 33); c.closePath();
          c.fillStyle = art.lin(c, 0, 25, 0, 33, [[0, '#c9d3ff'], [1, '#6f78c9']]); c.fill(); c.strokeStyle = '#0b0d1a'; c.stroke();
          c.fillStyle = 'rgba(20,25,50,.5)'; for (let i = 0; i < 6; i++) c.fillRect(9 + i * 4.4, 27, 3, 1.5);
          c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.moveTo(10, 5); c.lineTo(18, 5); c.lineTo(10, 15); c.fill();
        });
        art.tex('cb_boom', 48, 48, c => {
          for (const [r, col] of [[22, '#ff5d3a'], [16, '#ffb03a'], [9, '#fff3b0']]) {
            c.beginPath();
            for (let k = 0; k < 18; k++) { const a = k / 18 * art.TAU, rr = k % 2 ? r * 0.6 : r; c.lineTo(24 + Math.cos(a) * rr, 24 + Math.sin(a) * rr); }
            c.closePath(); c.fillStyle = col; c.fill();
          }
        });
        // bug desenhado: corpo com brilho, cabeça, 6 patas e antenas
        Object.entries(KINDS).forEach(([k, d]) => art.tex('cb_' + k, 40, 40, c => {
          c.strokeStyle = d.dark; c.lineWidth = 2.2; c.lineCap = 'round';
          for (const s of [-1, 1]) for (const y of [16, 22, 28]) { c.beginPath(); c.moveTo(20 + s * 7, y); c.lineTo(20 + s * 15, y + (y - 22) * 0.6 - 2); c.stroke(); }
          c.beginPath(); c.moveTo(17, 9); c.quadraticCurveTo(13, 2, 9, 3); c.moveTo(23, 9); c.quadraticCurveTo(27, 2, 31, 3); c.stroke();
          art.ell(c, 20, 11, 6, 5); c.fillStyle = art.tone(d.color, -0.3); c.fill();
          art.ell(c, 20, 23, 10, 12); c.fillStyle = art.rad(c, 16, 18, 2, 14, [[0, art.tone(d.color, 0.55)], [0.6, d.color], [1, d.dark]]); c.fill();
          c.lineWidth = 1.2; c.strokeStyle = d.dark; c.stroke();
          c.beginPath(); c.moveTo(20, 12); c.lineTo(20, 34); c.strokeStyle = 'rgba(0,0,0,.35)'; c.stroke();
          art.ell(c, 17, 9.5, 1.6, 1.6); c.fillStyle = '#fff'; c.fill(); art.ell(c, 23, 9.5, 1.6, 1.6); c.fill();
        }));
        art.tex('cb_coffee', 34, 34, c => {
          art.ell(c, 17, 17, 16, 16); c.fillStyle = 'rgba(255,211,77,.18)'; c.fill();
          art.rr(c, 9, 12, 14, 15, 3); c.fillStyle = art.lin(c, 9, 0, 23, 0, [[0, '#ffffff'], [1, '#c9cfe6']]); c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#3b2a1a'; c.stroke();
          c.beginPath(); c.arc(24, 19, 3.5, -1.3, 1.3); c.lineWidth = 2; c.stroke();
          art.ell(c, 16, 12.5, 6.5, 2); c.fillStyle = '#6b3f1d'; c.fill();
          c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.3; for (const x of [13, 18]) { c.beginPath(); c.moveTo(x, 9); c.quadraticCurveTo(x - 2, 6, x, 3); c.stroke(); }
        });
        dotTexture(this);

        const sprite = (x, y, key, size) => this.add.image(x, y, key).setDisplaySize(size, size).setDepth(2);
        let px = W / 2, target = null, started = false, alive = true, t = 0, spawnIn = 0, dodged = 0, slow = 0, coffeeIn = 9000;
        const bugs = [], items = [];
        const player = this.add.image(px, PY, 'cb_laptop').setDisplaySize(44, 36).setDepth(3);
        const shadow = this.add.ellipse(px, PY + 20, 40, 8, 0x000000, 0.35).setDepth(2);
        const curtain = this.add.rectangle(0, 0, W, H, 0xa98bff, 0).setOrigin(0).setDepth(4);
        const msg = this.add.text(W / 2, H / 2, 'Setas, A/D ou arraste pra começar', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '20px', color: '#c9cce0' }).setOrigin(0.5).setDepth(5);
        const sparks = this.add.particles(0, 0, 'dot', { speed: { min: 40, max: 160 }, lifespan: 400, scale: { start: 0.8, end: 0 }, tint: [0xffd34d, 0xffffff], emitting: false }).setDepth(4);
        const start = () => { if (!started && alive) { started = true; msg.destroy(); } };
        const keys = this.input.keyboard.addKeys('LEFT,RIGHT,A,D');
        this.input.keyboard.addCapture('LEFT,RIGHT');
        this.input.keyboard.on('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) start(); });
        this.input.on('pointerdown', p => { target = p.x; start(); });
        this.input.on('pointermove', p => { if (p.isDown) target = p.x; });
        this.input.on('pointerup', () => { target = null; });
        const coffeeHud = () => { hud.c.textContent = slow > 0 ? 'lento ' + Math.ceil(slow) + 's' : '—'; };
        const die = () => {
          alive = false;
          player.setTexture('cb_boom').setDisplaySize(52, 52);
          sfx.boom();
          this.cameras.main.shake(260, 0.012);
          this.time.delayedCall(800, () => done(+t.toFixed(1)));
        };
        this.events.on('update', (time, delta) => {
          const rdt = Math.min(delta, 50) / 1000; // aba travada não dá tempo grátis
          if (slow > 0) { slow = Math.max(0, slow - rdt); coffeeHud(); }
          const ts = slow > 0.4 ? SLOW_FACTOR : slow > 0 ? SLOW_FACTOR + (1 - SLOW_FACTOR) * (1 - slow / 0.4) : 1;
          curtain.setAlpha(slow > 0 ? 0.08 : 0);
          const dt = rdt * ts;
          for (const img of code) { img.y += (started && alive ? 40 + t * 2 : 12) * dt; if (img.y >= CODE_H) img.y -= CODE_H * 2; }
          if (!started || !alive) return;
          t += rdt; // o tempo da pontuação é o real (câmera lenta não dá ponto extra)
          hud.t.textContent = dec(t, 1) + 's';
          const dir = (keys.RIGHT.isDown || keys.D.isDown) - (keys.LEFT.isDown || keys.A.isDown);
          if (dir) { px += dir * 380 * rdt; target = null; }
          else if (target !== null) px += Phaser.Math.Clamp(target - px, -480 * rdt, 480 * rdt);
          px = Phaser.Math.Clamp(px, PR, W - PR);
          player.x = px; shadow.x = px;
          player.setAngle(dir * 6 || Phaser.Math.Clamp((target ?? px) - px, -6, 6));
          const level = Math.min(t / 45, 1); // dificuldade máxima aos 45s
          spawnIn -= delta * ts;
          if (spawnIn <= 0) {
            spawnIn = 650 - 470 * level;
            // os tipos especiais aparecem aos poucos: rápido depois de 8s, zigue-zague depois de 15s, bugão depois de 22s
            const r = Math.random();
            const kind = t > 22 && r < 0.12 ? 'big' : t > 15 && r < 0.3 ? 'zig' : t > 8 && r < 0.48 ? 'fast' : 'bug';
            const d = KINDS[kind], x = rand(d.r, W - d.r);
            bugs.push({ kind, x, x0: x, y: -24, r: d.r, o: sprite(x, -24, 'cb_' + kind, d.size), vy: (170 + 330 * level + rand(0, 60)) * d.speed, ph: Math.random() * 6, spin: kind === 'zig' ? 0 : (Math.random() - 0.5) * 3 });
          }
          // café: de tempos em tempos cai um; pegou, câmera lenta
          coffeeIn -= delta;
          if (coffeeIn <= 0) { coffeeIn = rand(9000, 15000); const x = rand(30, W - 30); items.push({ x, y: -20, o: sprite(x, -20, 'cb_coffee', 34) }); }
          for (const b of bugs) {
            b.y += b.vy * dt;
            if (b.kind === 'zig') { b.ph += dt * 4; b.x = Phaser.Math.Clamp(b.x0 + Math.sin(b.ph) * 70, b.r, W - b.r); b.o.setAngle(Math.cos(b.ph) * 30); }
            else b.o.rotation += b.spin * dt;
            b.o.setPosition(b.x, b.y);
            if (Phaser.Math.Distance.Between(b.x, b.y, px, PY) < PR + b.r - 2) return die();
          }
          for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            it.y += 160 * dt; it.o.setPosition(it.x, it.y).setAngle(Math.sin(time / 150) * 10);
            if (Phaser.Math.Distance.Between(it.x, it.y, px, PY) < PR + 16) {
              slow = SLOW; coffeeHud(); sparks.explode(24, it.x, it.y);
              floatText(this, it.x, it.y - 20, 'Café! Tudo lento', '#ffd34d'); sfx.power();
              it.o.destroy(); items.splice(i, 1);
            } else if (it.y > H + 30) { it.o.destroy(); items.splice(i, 1); }
          }
          for (let i = bugs.length - 1; i >= 0; i--) if (bugs[i].y > H + 30) { bugs[i].o.destroy(); bugs.splice(i, 1); hud.b.textContent = ++dodged; }
        });
      },
    });
  }
};
