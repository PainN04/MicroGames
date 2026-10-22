GAMES.corredor = {
  name: 'Corredor', icon: 'corredor', hue: 35, desc: 'Seja o pássaro mais rápido do deserto! Toque, clique ou Espaço/↑ pra pular; segure ↓ (ou toque na parte de baixo) pra abaixar. Cactos e urubus baixos pedem pulo; bando de urubus no alto, abaixar. Cada vez mais rápido.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 480, H = 300, GY = 250, GRAV = 2300, JUMP = -820, ZOOM = 1.5;
    // texto nítido com o zoom; no canvas 2D (modo leve) o Phaser desenha o texto de alta resolução grande demais, então lá fica 1x
    const TEXT_RES = perf.lite ? 1 : 2 * ZOOM;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Velocidade<b id="v">1.0x</b></span></div><div class="phaser-wrap" id="pw"></div><p class="hint">Espaço/toque = pular · ↓ ou parte de baixo da tela = abaixar</p>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v') };
    // O mundo continua 480x300; a câmera dá zoom e as texturas são pintadas no dobro da resolução, pra ficar nítido.
    return mountPhaser(el.querySelector('#pw'), W * ZOOM, H * ZOOM, {
      create() {
        const scene = this;
        const art = makeArt(scene);
        scene.cameras.main.setZoom(ZOOM).centerOn(W / 2, H / 2);
        const X = 80; // posição fixa do corredor
        let y = GY, vy = 0, ducking = false, started = false, alive = true, dist = 0, speed = 300, spawnIn = 900, tick = 0, trail = 0, wasAir = false, milestone = 500;
        let obs = [], nextFlock = false;

        // ---------- cenário (de trás pra frente) ----------
        scene.add.image(0, 0, 'cr_sky').setOrigin(0).setScale(0.5);
        const night = scene.add.image(0, 0, 'cr_night').setOrigin(0).setScale(0.5).setAlpha(0);
        const clouds = [0, 1, 2].map(i => scene.add.image(i * 190 + rand(0, 60), rand(28, 95), 'cr_cloud' + i).setScale(0.5).setAlpha(0.9));
        // camada que rola em loop: duas cópias lado a lado
        const strip = (key, k, oy = 1) => ({ k, imgs: [0, 1].map(i => scene.add.image(i * W, GY, key).setOrigin(0, oy).setScale(0.5)), x: 0 });
        const layers = [strip('cr_far', 0.05), strip('cr_mid', 0.14), strip('cr_near', 0.32)];
        const weed = scene.add.image(W + 300, GY - 9, 'cr_weed').setScale(0.5);
        const ground = strip('cr_ground', 1, 0);
        layers.push(ground);
        const obsLayer = scene.add.layer();
        const shadow = scene.add.image(X, GY + 2, 'cr_shadow').setScale(0.5);
        const me = scene.add.image(X, GY, 'cr_idle').setOrigin(0.5, art.footY).setScale(0.5);
        const dust = scene.add.particles(0, 0, 'cr_puff', { speed: { min: 20, max: 70 }, angle: { min: 175, max: 235 }, lifespan: 420, scale: { start: 0.45, end: 0.9 }, alpha: { start: 0.7, end: 0 }, emitting: false });
        const shade = scene.add.rectangle(0, 0, W, H, 0x0d1240).setOrigin(0).setAlpha(0); // escurece tudo à noite
        const txt = (yy, s, size) => scene.add.text(W / 2, yy, s, { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: size + 'px', fontStyle: 'bold', color: '#fff4e0', stroke: '#2a1f4f', strokeThickness: 5 }).setOrigin(0.5).setResolution(TEXT_RES);
        const msg = txt(96, 'Toque ou Espaço pra correr', 20);
        scene.tweens.add({ targets: msg, scale: 1.06, yoyo: true, repeat: -1, duration: 650, ease: 'Sine.InOut' });

        const onGround = () => y >= GY;
        const jump = () => {
          if (!alive) return;
          if (!started) { started = true; msg.destroy(); }
          if (onGround() && !ducking) { vy = JUMP; dust.explode(6, X - 4, GY); beep(560, 70, 'triangle', 0.04); }
        };
        const die = () => {
          alive = false; sfx.bad();
          scene.cameras.main.shake(240, 0.012); scene.cameras.main.flash(180, 255, 80, 100);
          scene.time.delayedCall(800, () => done(Math.floor(dist / 10)));
        };
        scene.input.keyboard.addCapture('SPACE,UP,DOWN');
        scene.input.keyboard.on('keydown', e => {
          if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key) && !e.repeat) jump();
          if (['ArrowDown', 's', 'S'].includes(e.key)) { ducking = true; if (!started) jump(); if (!onGround()) vy = Math.max(vy, 500); } // abaixar no ar = cai rápido
        });
        scene.input.keyboard.on('keyup', e => { if (['ArrowDown', 's', 'S'].includes(e.key)) ducking = false; });
        scene.input.on('pointerdown', p => { if (p.worldY > H * 0.68 && started) { ducking = true; if (!onGround()) vy = Math.max(vy, 500); } else jump(); });
        scene.input.on('pointerup', () => { ducking = false; });

        const put = img => { obsLayer.add(img); return img.setScale(0.5); };
        const spawn = () => {
          if (nextFlock) {
            // bando no alto: do peito até bem acima do pulo máximo, então não dá pra pular; só passa abaixado
            const o = { kind: 'flock', x: W + 30, w: 34, h: 128, y: GY - 30, birds: [] };
            [GY - 42, GY - 88, GY - 134].forEach((by, i) => o.birds.push({ img: put(scene.add.image(0, by, 'cr_vul0')), dy: by, dx: i % 2 ? 6 : -2, flap: rand(0, 6) }));
            obs.push(o);
          } else if (dist > 1800 && Math.random() < 0.18) {
            // urubu sozinho rente ao chão: pula
            const o = { kind: 'bird', x: W + 30, w: 34, h: 20, y: GY - 8, birds: [] };
            o.birds.push({ img: put(scene.add.image(0, GY - 18, 'cr_vul0')), dy: GY - 18, dx: 0, flap: 0 });
            obs.push(o);
          } else {
            const n = rand(1, speed > 420 ? 3 : 2), h = rand(30, 52);
            const o = { kind: 'cactus', x: W + 30, w: 16 * n + (n - 1) * 3, h, y: GY, imgs: [] };
            for (let i = 0; i < n; i++) o.imgs.push(put(scene.add.image(0, GY + 1, art.cactus(h - (i % 2) * 8, rand(0, 3))).setOrigin(0.5, 1)));
            obs.push(o);
          }
          // tempo (real) até o próximo: a distância cresce com a velocidade, então sempre dá pra pousar e pular de novo.
          // Antes de um bando, um respiro a mais pra dar tempo de pousar e abaixar.
          nextFlock = dist > 1800 && Math.random() < 0.2;
          spawnIn = 800 + Math.random() * 800 + (nextFlock ? 250 : 0);
        };
        const place = (o, dt) => {
          if (o.imgs) o.imgs.forEach((img, i) => img.setX(o.x - o.w / 2 + 8 + i * 19));
          else o.birds.forEach(b => {
            b.flap += dt * 9;
            b.img.setPosition(o.x + b.dx, b.dy + Math.sin(b.flap * 0.5) * 1.5).setTexture('cr_vul' + [0, 1, 2, 1][Math.floor(b.flap) % 4]);
          });
        };
        const drop = o => (o.imgs || o.birds.map(b => b.img)).forEach(img => img.destroy());

        scene.events.on('update', (time, delta) => {
          const dt = Math.min(delta, 50) / 1000;
          tick += dt;
          if (started && alive) {
            speed = Math.min(640, 300 + dist / 22);
            dist += speed * dt;
            vy += GRAV * dt; y += vy * dt;
            if (y >= GY) { y = GY; vy = 0; }
            spawnIn -= delta;
            if (spawnIn <= 0) spawn();
            for (const o of obs) o.x -= speed * dt;
            obs = obs.filter(o => o.x > -60 || drop(o));
            const pts = Math.floor(dist / 10);
            hud.p.textContent = pts;
            hud.v.textContent = (speed / 300).toFixed(1) + 'x';
            if (pts >= milestone) {
              const t = txt(70, milestone + '!', 26);
              scene.tweens.add({ targets: t, y: 50, alpha: 0, duration: 900, ease: 'Cubic.Out', onComplete: () => t.destroy() });
              [784, 1047].forEach((f, i) => setTimeout(() => beep(f, 90, 'triangle', 0.035), i * 80));
              milestone += 500;
            }
            // caixa do corredor (um pouco menor que o desenho = perdoa bordas)
            const hh = ducking && onGround() ? 22 : 42, bx0 = X - 10, bx1 = X + 10, by0 = y - hh + 3, by1 = y - 2;
            for (const o of obs) {
              const ox0 = o.x - o.w / 2 + 3, ox1 = o.x + o.w / 2 - 3, oy1 = o.y - 2, oy0 = o.y - o.h + 3;
              if (bx0 < ox1 && bx1 > ox0 && by0 < oy1 && by1 > oy0) { die(); break; }
            }
            // rastro de poeira atrás dos pés e "tranco" ao pousar
            if (onGround() && (trail -= delta) <= 0) { dust.emitParticleAt(X - 12, GY - 3, 1); trail = 55; }
            if (wasAir && onGround()) { dust.explode(5, X, GY); me.setScale(0.56, 0.44); scene.tweens.add({ targets: me, scaleX: 0.5, scaleY: 0.5, duration: 140 }); }
          }
          wasAir = !onGround();
          obs.forEach(o => place(o, dt));
          const sp = started && alive ? speed : 0;
          for (const L of layers) {
            L.x = (L.x - sp * dt * L.k) % W;
            L.imgs[0].x = L.x; L.imgs[1].x = L.x + W;
          }
          clouds.forEach((c, i) => { c.x -= sp * dt * 0.03 + dt * (5 + i * 2); if (c.x < -80) c.setPosition(W + rand(20, 120), rand(28, 95)); });
          weed.x -= sp * dt * 0.5 + dt * 45; weed.rotation -= dt * 7; weed.y = GY - 9 - Math.abs(Math.sin(tick * 3.5)) * 7;
          if (weed.x < -30) weed.x = W + rand(300, 1200);
          // dia → noite → dia conforme a distância
          const n = (dist % 9000) / 9000, nightA = Phaser.Math.Clamp((1 - Math.cos(n * Math.PI * 2)) / 2 * 1.5 - 0.3, 0, 1);
          night.setAlpha(nightA); shade.setAlpha(nightA * 0.32);
          const tint = c => { const a = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0xffffff), Phaser.Display.Color.ValueToColor(c), 100, nightA * 100); return Phaser.Display.Color.GetColor(a.r, a.g, a.b); };
          clouds.forEach(c => c.setTint(tint(0x7a7fb8)));
          layers.slice(0, 3).forEach(L => L.imgs.forEach(img => img.setTint(tint(0x9a9ad0))));
          // corredor
          const duck = ducking && onGround(), air = !onGround(), f = Math.floor(tick * 18) % 6;
          me.setY(y).setTexture(!alive ? 'cr_dead' : duck ? (started ? 'cr_duck' + f : 'cr_duck0') : air ? 'cr_jump' : started ? 'cr_run' + f : 'cr_idle');
          me.setAngle(air && alive ? Phaser.Math.Clamp(vy / 60, -10, 12) : 0);
          if (!started) me.setY(GY - Math.abs(Math.sin(tick * 3)) * 1.5);
          const s = Math.max(0.35, 1 - (GY - y) / 160);
          shadow.setScale(0.5 * s).setAlpha(0.3 + 0.7 * s);
        });
      },
    });

    // ---------- arte: tudo pintado em canvas 2D (degradês, contornos, sombras) no dobro da resolução ----------
    function makeArt(scene) {
      const R = 2, TAU = Math.PI * 2;
      const tex = (key, w, h, draw) => {
        if (scene.textures.exists(key)) return key;
        const t = scene.textures.createCanvas(key, w * R, h * R), c = t.getContext();
        c.save(); c.scale(R, R); draw(c, w, h); c.restore(); t.refresh();
        return key;
      };
      const lin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, s]) => g.addColorStop(o, s)); return g; };
      const rad = (c, x, y, r0, r1, stops) => { const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, s]) => g.addColorStop(o, s)); return g; };
      const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); };
      const paint = (c, fill, line = INK, lw = 1.4) => { c.fillStyle = fill; c.fill(); if (line) { c.strokeStyle = line; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); } };
      // repete o desenho nas bordas pra a faixa emendar sem costura
      const wrap = (w, fn) => [-w, 0, w].forEach(fn);
      const INK = '#1b1640';

      // céu do entardecer com sol
      tex('cr_sky', W, GY + 2, (c, w, h) => {
        c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#1d1a4a'], [0.32, '#4b2c72'], [0.58, '#b5486e'], [0.8, '#f08458'], [1, '#ffc27a']]); c.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.45})`; c.fillRect(Math.random() * w, Math.random() * h * 0.35, 1, 1); }
        c.fillStyle = rad(c, 335, 178, 10, 140, [[0, 'rgba(255,214,140,.75)'], [0.35, 'rgba(255,170,110,.3)'], [1, 'rgba(255,150,100,0)']]); c.fillRect(0, 0, w, h);
        ell(c, 335, 178, 38, 38); c.fillStyle = lin(c, 0, 140, 0, 216, [[0, '#fff3c4'], [0.6, '#ffd27a'], [1, '#ff9f5a']]); c.fill();
        c.fillStyle = 'rgba(240,120,110,.55)'; // faixas de calor cortando o sol
        [190, 199, 207].forEach((yy, i) => c.fillRect(290, yy, 90, 2 + i));
      });
      tex('cr_night', W, GY + 2, (c, w, h) => {
        c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#060821'], [0.55, '#18205a'], [1, '#4a3f86']]); c.fillRect(0, 0, w, h);
        for (let i = 0; i < 110; i++) { c.fillStyle = `rgba(255,255,240,${0.3 + Math.random() * 0.7})`; const s = Math.random() < 0.1 ? 1.6 : 0.9; c.fillRect(Math.random() * w, Math.random() * h * 0.7, s, s); }
        c.fillStyle = rad(c, 110, 62, 4, 60, [[0, 'rgba(220,230,255,.35)'], [1, 'rgba(220,230,255,0)']]); c.fillRect(0, 0, w, h);
        ell(c, 110, 62, 17, 17); c.fillStyle = '#f4f1dc'; c.fill();
        ell(c, 117, 57, 15, 15); c.fillStyle = '#121a4c'; c.fill(); // lua crescente
      });
      [0, 1, 2].forEach(i => tex('cr_cloud' + i, 70 + i * 18, 26, (c, w, h) => {
        // nuvem baixa e comprida: corcovas que se sobrepõem, base reta, iluminada por baixo
        const lumps = [[0.18, 6], [0.36, 10 + i], [0.55, 8], [0.72, 9 - i], [0.86, 5]];
        c.beginPath();
        for (const [fx, r] of lumps) { const cx = w * fx; c.moveTo(cx + r * 1.4, h - 6); c.ellipse(cx, h - 6, r * 1.4, r, 0, Math.PI, TAU); }
        c.rect(w * 0.12, h - 7, w * 0.78, 4); c.ellipse(w * 0.5, h - 4, w * 0.42, 2.5, 0, 0, TAU);
        c.fillStyle = lin(c, 0, h - 18, 0, h - 2, [[0, '#ffe7d6'], [0.6, '#f7b7b0'], [1, '#e98b9c']]); c.fill();
      }));

      // mesas ao longe: topo achatado, face clara, estratos e névoa na base
      const mesas = (key, h, n, hMin, hMax, top, base, shadeCol, haze) => tex(key, W, h, (c, w) => {
        const list = Array.from({ length: n }, (_, i) => ({ x: i * w / n + rand(-15, 15), mw: rand(70, 150), mh: rand(hMin, hMax) }));
        for (const m of list) wrap(w, off => {
          const x = m.x + off, t = h - m.mh, sl = 10 + rand(0, 6);
          c.beginPath(); c.moveTo(x, h); c.lineTo(x + sl * 0.6, t + 8); c.lineTo(x + sl, t); c.lineTo(x + m.mw - sl, t); c.lineTo(x + m.mw - sl * 0.4, t + 10); c.lineTo(x + m.mw, h); c.closePath();
          c.fillStyle = lin(c, 0, t, 0, h, [[0, top], [1, base]]); c.fill();
          c.save(); c.clip();
          c.fillStyle = shadeCol; c.fillRect(x + m.mw * 0.62, t, m.mw, m.mh); // lado na sombra
          c.fillStyle = 'rgba(255,220,180,.18)'; c.fillRect(x, t, m.mw, 2.5); // borda iluminada
          c.strokeStyle = 'rgba(70,20,30,.18)'; c.lineWidth = 1;
          for (let s = t + 10; s < h; s += 7 + rand(0, 5)) { c.beginPath(); c.moveTo(x, s); c.lineTo(x + m.mw, s + rand(-1, 1)); c.stroke(); }
          c.restore();
        });
        c.fillStyle = lin(c, 0, h * 0.35, 0, h, [[0, 'rgba(0,0,0,0)'], [1, haze]]); c.fillRect(0, 0, w, h);
      });
      mesas('cr_far', 110, 4, 55, 100, '#e28a6c', '#c0606a', 'rgba(120,40,80,.22)', 'rgba(250,160,120,.75)');
      mesas('cr_mid', 70, 5, 22, 55, '#b8513d', '#8b3a3c', 'rgba(60,15,30,.25)', 'rgba(230,130,100,.45)');
      // horizonte: arbustos e cactos pequenos em silhueta
      tex('cr_near', W, 34, (c, w, h) => {
        c.fillStyle = '#6c3446';
        for (let i = 0; i < 14; i++) {
          const x0 = rand(0, w), kind = rand(0, 2);
          wrap(w, off => {
            const x = x0 + off;
            if (kind === 0) { c.fillRect(x, h - 22, 5, 22); c.fillRect(x - 4, h - 15, 3, 8); c.fillRect(x + 6, h - 18, 3, 9); c.fillRect(x - 4, h - 9, 13, 2.5); }
            else { c.beginPath(); for (let k = 0; k < 4; k++) c.arc(x + k * 4, h - 3 - (k % 2) * 2, 4 + (k % 2), 0, TAU); c.fill(); }
          });
        }
        c.fillRect(0, h - 2, w, 2);
      });
      // chão de areia: degradê, borda clara, ondinhas, pedras com sombra e tufos secos
      tex('cr_ground', W, H - GY, (c, w, h) => {
        c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#f4c27f'], [0.25, '#e5a865'], [1, '#c3834a']]); c.fillRect(0, 0, w, h);
        c.fillStyle = '#ffe0a6'; c.fillRect(0, 0, w, 2); c.fillStyle = '#b8743f'; c.fillRect(0, 2, w, 1.2);
        c.strokeStyle = 'rgba(160,90,40,.28)'; c.lineWidth = 1;
        for (let i = 0; i < 26; i++) { const x0 = rand(0, w), y0 = rand(8, h - 4), l = rand(14, 40); wrap(w, off => { c.beginPath(); c.moveTo(x0 + off, y0); c.quadraticCurveTo(x0 + off + l / 2, y0 - 2, x0 + off + l, y0); c.stroke(); }); }
        for (let i = 0; i < 34; i++) {
          const x0 = rand(0, w), y0 = rand(7, h - 3), r = rand(10, 30) / 10;
          wrap(w, off => { ell(c, x0 + off + 0.6, y0 + 0.8, r, r * 0.6); c.fillStyle = 'rgba(110,60,25,.35)'; c.fill(); ell(c, x0 + off, y0, r, r * 0.65); c.fillStyle = ['#b98656', '#a07048', '#cf9d68'][i % 3]; c.fill(); ell(c, x0 + off - r * 0.3, y0 - r * 0.25, r * 0.4, r * 0.25); c.fillStyle = 'rgba(255,235,200,.5)'; c.fill(); });
        }
        c.strokeStyle = '#a77a3c'; c.lineWidth = 1;
        for (let i = 0; i < 7; i++) { const x0 = rand(0, w), y0 = rand(5, 12); wrap(w, off => { for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x0 + off, y0); c.lineTo(x0 + off + k * 2.2, y0 - 4 - (2 - Math.abs(k)) * 1.5); c.stroke(); } }); }
      });
      tex('cr_weed', 22, 22, c => {
        c.strokeStyle = '#8a5a2b'; c.lineWidth = 1;
        for (let i = 0; i < 16; i++) { c.beginPath(); c.arc(11 + rand(-3, 3), 11 + rand(-3, 3), rand(4, 9), Math.random() * TAU, Math.random() * TAU + 2); c.stroke(); }
        c.strokeStyle = '#c08a4c'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(11, 11, rand(3, 8), Math.random() * TAU, Math.random() * TAU + 1.5); c.stroke(); }
      });
      tex('cr_shadow', 32, 8, c => { ell(c, 16, 4, 15, 3.5); c.fillStyle = rad(c, 16, 4, 1, 15, [[0, 'rgba(60,20,10,.45)'], [1, 'rgba(60,20,10,0)']]); c.fill(); });
      tex('cr_puff', 16, 16, c => { c.fillStyle = rad(c, 8, 8, 1, 8, [[0, 'rgba(255,236,205,.95)'], [1, 'rgba(255,236,205,0)']]); c.fillRect(0, 0, 16, 16); });

      // ---------- o pássaro corredor ----------
      // origem: ponto entre os pés. Canvas 84x66, pés em (42, 63).
      const RW = 84, RH = 66, FX = 42, FY = 63;
      const BODY = (c, y0, y1) => lin(c, 0, y0, 0, y1, [[0, '#8fa0ff'], [0.5, '#4d5fd6'], [1, '#2b3390']]);
      const feather = (c, x0, y0, x1, y1, wdt, fill) => {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny);
        c.beginPath(); c.moveTo(x0, y0);
        c.quadraticCurveTo(mx + nx / l * wdt, my + ny / l * wdt, x1, y1);
        c.quadraticCurveTo(mx - nx / l * wdt, my - ny / l * wdt, x0, y0);
        paint(c, fill, INK, 1.1);
      };
      const eye = (c, x, y, dead) => {
        ell(c, x - 4.5, y + 0.6, 3, 1.6); c.fillStyle = '#ff6a3d'; c.fill(); // pele laranja atrás do olho
        ell(c, x, y, 3.3, 3.5); paint(c, '#ffffff', INK, 1);
        if (dead) { c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - 1.8, y - 1.8); c.lineTo(x + 1.8, y + 1.8); c.moveTo(x - 1.8, y + 1.8); c.lineTo(x + 1.8, y - 1.8); c.stroke(); return; }
        ell(c, x + 1, y + 0.2, 1.8, 2); c.fillStyle = '#14112e'; c.fill();
        ell(c, x + 1.6, y - 0.7, 0.7, 0.7); c.fillStyle = '#fff'; c.fill();
        c.strokeStyle = INK; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x - 3, y - 4.2); c.lineTo(x + 3.2, y - 2.9); c.stroke(); // sobrancelha decidida
      };
      const beak = (c, x, y, len) => {
        c.beginPath(); c.moveTo(x, y - 2.4); c.quadraticCurveTo(x + len * 0.6, y - 2.8, x + len, y + 0.6); c.lineTo(x + 1, y + 0.8); c.closePath(); paint(c, '#ffd04f', INK, 1.1);
        c.beginPath(); c.moveTo(x + 1, y + 0.8); c.lineTo(x + len - 1.5, y + 1); c.quadraticCurveTo(x + len * 0.5, y + 3.4, x + 1, y + 2.6); c.closePath(); paint(c, '#e79a22', INK, 1.1);
      };
      const speckles = (c, pts) => { c.fillStyle = 'rgba(220,228,255,.85)'; pts.forEach(([x, y]) => { ell(c, x, y, 1.1, 0.7, -0.4); c.fill(); }); };
      const LEG = '#ff9b3a', LEG_D = '#c96a1c';
      const legWheel = (c, hx, hy, r, f) => {
        // pernas tão rápidas que viram uma roda borrada
        ell(c, hx, hy, r, r); c.fillStyle = 'rgba(255,155,58,.22)'; c.fill();
        c.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const a = f * (TAU / 18) + k * TAU / 3;
          c.strokeStyle = k ? 'rgba(255,155,58,.55)' : LEG; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(a) * r, hy + Math.sin(a) * r); c.stroke();
          ell(c, hx + Math.cos(a) * r, hy + Math.sin(a) * r, 2, 1.3, a); c.fillStyle = k ? 'rgba(201,106,28,.6)' : LEG_D; c.fill();
        }
        c.strokeStyle = 'rgba(255,190,120,.6)'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(hx, hy, r + 1.5, Math.PI * 0.55 + f * 0.35, Math.PI * 1.1 + f * 0.35); c.stroke();
        c.lineCap = 'butt';
      };
      const leg = (c, pts, col) => {
        c.lineCap = 'round'; c.lineJoin = 'round';
        c.strokeStyle = INK; c.lineWidth = 3.4; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
        c.strokeStyle = col; c.lineWidth = 2; c.stroke();
        c.lineCap = 'butt';
      };
      const standing = (c, legs, { tailUp = 0, dead = false, lean = 0 } = {}) => {
        c.translate(FX, FY);
        legs(c);
        c.rotate(lean);
        // rabo comprido: duas penas
        feather(c, -6, -28, -38, -48 - tailUp, 4.2, lin(c, -38, -50, -6, -28, [[0, '#1f2570'], [1, '#3a46b0']]));
        feather(c, -6, -29, -36, -42 - tailUp, 3.6, lin(c, -36, -44, -6, -28, [[0, '#2a3290'], [1, '#4d5fd6']]));
        ell(c, -36.5, -46 - tailUp, 1.4, 1); c.fillStyle = '#e8ecff'; c.fill();
        // corpo, barriga e asa
        ell(c, -1, -24, 14, 9.8, -0.28); paint(c, BODY(c, -34, -14));
        ell(c, 4, -19.5, 8.5, 5.5, -0.35); c.fillStyle = lin(c, 0, -25, 0, -14, [[0, '#eef0ff'], [1, '#b9c3f2']]); c.fill();
        ell(c, -5, -25.5, 9.5, 5.5, -0.2); paint(c, lin(c, 0, -31, 0, -20, [[0, '#3e4cc0'], [1, '#262d86']]), INK, 1.1);
        speckles(c, [[-9, -26], [-5, -28], [-1, -25.5], [-7, -23], [-11, -24.5]]);
        // pescoço e cabeça
        c.beginPath(); c.moveTo(1, -30); c.quadraticCurveTo(5, -38, 6, -44); c.lineTo(13, -42); c.quadraticCurveTo(12, -34, 9, -28); c.closePath(); paint(c, BODY(c, -46, -28));
        // crista: penas pra trás
        feather(c, 6, -46, -7, -56 + (dead ? 4 : 0), 2.4, '#2b3390');
        feather(c, 7, -47, -2, -60 + (dead ? 6 : 0), 2.4, '#3a46b0');
        feather(c, 9, -47, 4, -59 + (dead ? 3 : 0), 2.2, '#5566dd');
        ell(c, 9, -41.5, 7.6, 7); paint(c, BODY(c, -49, -34));
        beak(c, 14.5, -41, 17);
        eye(c, 11, -43, dead);
      };
      tex('cr_idle', RW, RH, c => standing(c, c => { leg(c, [[-2, -12], [-3, 0], [1, 0]], LEG_D); leg(c, [[2, -12], [3, 0], [7, 0]], LEG); }));
      tex('cr_dead', RW, RH, c => standing(c, c => { leg(c, [[-2, -12], [-4, 0], [0, 0]], LEG_D); leg(c, [[2, -12], [4, 0], [8, 0]], LEG); }, { dead: true }));
      tex('cr_jump', RW, RH, c => standing(c, c => { leg(c, [[-1, -13], [-7, -8], [-13, -10]], LEG_D); leg(c, [[2, -13], [-3, -6], [-9, -6]], LEG); }, { tailUp: 5 }));
      for (let f = 0; f < 6; f++) tex('cr_run' + f, RW, RH, c => standing(c, c => legWheel(c, 0, -9, 9, f), { lean: 0.06 }));
      // abaixado: corpo comprido rente ao chão, crista deitada
      for (let f = 0; f < 6; f++) tex('cr_duck' + f, RW, RH, c => {
        c.translate(FX, FY);
        legWheel(c, 1, -6, 6, f);
        feather(c, -12, -15, -41, -20, 3.4, lin(c, -41, -20, -12, -15, [[0, '#1f2570'], [1, '#3a46b0']]));
        feather(c, -12, -14, -38, -15, 2.8, '#4d5fd6');
        ell(c, 0, -13, 17, 7.5); paint(c, BODY(c, -21, -6));
        ell(c, 4, -9.5, 10, 3.6); c.fillStyle = '#d9defa'; c.fill();
        ell(c, -3, -14.5, 10, 4.5, -0.05); paint(c, '#2f3897', INK, 1.1);
        speckles(c, [[-8, -15], [-3, -16.5], [1, -14], [-10, -13]]);
        feather(c, 15, -21, 2, -24, 2, '#2b3390');
        feather(c, 16, -21, 4, -26, 2, '#4d5fd6');
        ell(c, 17, -16, 6.8, 6.3); paint(c, BODY(c, -23, -10));
        beak(c, 22, -16, 15);
        eye(c, 19, -18);
      });

      // ---------- urubu (de frente pro corredor) ----------
      // 3 quadros de asa: 0 = em cima, 1 = meio, 2 = embaixo. Centro do corpo em (30, 24).
      const VK = '#140d18';
      [-20, -3, 15].forEach((tipY, fr) => tex('cr_vul' + fr, 60, 50, c => {
        c.translate(30, 24);
        const wing = (dy, fill, under) => {
          c.beginPath(); c.moveTo(-4, -2);
          c.quadraticCurveTo(2, tipY * 0.6 + dy - 3, 6, tipY + dy);
          for (let k = 0; k < 3; k++) { const fx = 8 + k * 3.2, fy = tipY + dy + (tipY < 0 ? 2 : -2) * k; c.lineTo(fx, fy); c.lineTo(fx + 1.4, fy + (tipY < 0 ? 4 : -4)); }
          c.quadraticCurveTo(14, tipY * 0.35 + dy, 11, 0); c.closePath();
          paint(c, fill, VK, 1.1);
          if (under) { c.save(); c.clip(); c.strokeStyle = 'rgba(200,190,210,.55)'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(9, 0); c.quadraticCurveTo(13, tipY * 0.4, 12, tipY + 1); c.stroke(); c.restore(); }
        };
        wing(-1, '#2a2030'); // asa de trás
        c.beginPath(); c.moveTo(13, -3); c.lineTo(25, -2); c.lineTo(24, 2); c.lineTo(13, 3); c.closePath(); paint(c, '#2e2434', VK, 1.1); // rabo
        ell(c, 3, 0, 13.5, 6.8); paint(c, lin(c, 0, -7, 0, 7, [[0, '#56465f'], [1, '#221828']]), VK, 1.2);
        wing(1, lin(c, 0, tipY, 0, 0, [[0, '#2f2537'], [1, '#4b3e55']]), true);
        // gola branca fofinha
        c.beginPath(); for (let k = 0; k < 6; k++) c.arc(-9 + Math.cos(k) * 2.5, -1.5 + Math.sin(k * 1.3) * 2.5, 2.6, 0, TAU); paint(c, '#efe7dc', null);
        // cabeça careca e bico curvo
        c.beginPath(); c.moveTo(-10, -2); c.quadraticCurveTo(-13, -6, -15, -6); c.lineTo(-13, -1); c.closePath(); paint(c, '#d77468', VK, 1);
        ell(c, -16, -6, 4.6, 4.1); paint(c, rad(c, -17, -7.5, 0.5, 5, [[0, '#f3a196'], [1, '#c45e57']]), VK, 1.1);
        c.beginPath(); c.moveTo(-19.5, -7.5); c.quadraticCurveTo(-25, -7, -25.5, -3.5); c.quadraticCurveTo(-23, -4.6, -20, -4); c.closePath(); paint(c, '#f1e2c4', VK, 1);
        ell(c, -17, -7, 1.5, 1.5); c.fillStyle = '#fff'; c.fill(); ell(c, -17.4, -7, 0.8, 0.8); c.fillStyle = VK; c.fill();
      }));

      // ---------- cactos saguaro (gerados sob demanda por altura e variação) ----------
      const cactus = (h, v) => tex(`cr_cac_${h}_${v}`, 40, h + 6, (c, w, hh) => {
        const bx = 12, bw = 16, base = hh - 2, top = base - h;
        ell(c, w / 2, base, 13, 2.4); c.fillStyle = 'rgba(90,40,15,.3)'; c.fill();
        const trunk = () => { c.beginPath(); c.moveTo(bx, base); c.lineTo(bx, top + bw / 2); c.arc(bx + bw / 2, top + bw / 2, bw / 2, Math.PI, 0); c.lineTo(bx + bw, base); c.closePath(); };
        const armL = 0.42 + (v % 2) * 0.16, armR = 0.32 + ((v >> 1) % 2) * 0.2;
        const arms = () => {
          c.beginPath();
          c.moveTo(bx + 2, base - h * armL); c.lineTo(bx - 5, base - h * armL); c.lineTo(bx - 5, base - h * armL - 11 - (v % 3) * 2);
          if (h > 34 || v !== 1) { c.moveTo(bx + bw - 2, base - h * armR); c.lineTo(bx + bw + 5, base - h * armR); c.lineTo(bx + bw + 5, base - h * armR - 9 - v * 1.5); }
        };
        c.lineCap = 'round'; c.lineJoin = 'round';
        arms(); c.strokeStyle = '#163f20'; c.lineWidth = 9.6; c.stroke();
        trunk(); c.strokeStyle = '#163f20'; c.lineWidth = 2.6; c.stroke();
        arms(); c.strokeStyle = '#4daa58'; c.lineWidth = 7; c.stroke();
        arms(); c.strokeStyle = 'rgba(150,230,140,.45)'; c.lineWidth = 2; c.stroke();
        trunk(); c.fillStyle = lin(c, bx, 0, bx + bw, 0, [[0, '#4fae5b'], [0.3, '#6fcf72'], [0.65, '#3d9a4c'], [1, '#246b36']]); c.fill();
        c.save(); trunk(); c.clip();
        [[bx + 4, 'rgba(30,90,45,.5)'], [bx + 8, 'rgba(30,90,45,.45)'], [bx + 12, 'rgba(20,70,35,.5)'], [bx + 3, 'rgba(180,250,170,.35)']].forEach(([x, col]) => { c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.moveTo(x, top + 3); c.lineTo(x, base); c.stroke(); });
        c.strokeStyle = 'rgba(255,248,215,.85)'; c.lineWidth = 0.6;
        for (let sy = top + 6; sy < base - 2; sy += 5) [bx + 4, bx + 8, bx + 12].forEach((x, k) => { const yy = sy + (k % 2) * 2.5; c.beginPath(); c.moveTo(x - 1.4, yy - 1); c.lineTo(x, yy); c.lineTo(x + 1.4, yy - 1); c.stroke(); });
        c.restore();
        if (v === 3) { // flor no topo
          for (let k = 0; k < 5; k++) { ell(c, bx + bw / 2 + Math.cos(k * TAU / 5) * 2.4, top + 0.5 + Math.sin(k * TAU / 5) * 2.4, 2.1, 2.1); c.fillStyle = '#ff6f91'; c.fill(); }
          ell(c, bx + bw / 2, top + 0.5, 1.4, 1.4); c.fillStyle = '#ffe36b'; c.fill();
        }
        c.lineCap = 'butt';
      });

      return { cactus, footY: FY / RH };
    }
  }
};
