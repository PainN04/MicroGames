GAMES.corredor = {
  name: 'Corredor', icon: 'corredor', hue: 35, desc: 'Seja o pássaro mais rápido do deserto! Toque, clique ou Espaço/↑ pra pular (segure pra ir mais alto); pegue moedas (+25); segure ↓ (ou toque na parte de baixo) pra abaixar. Cactos e urubus baixos pedem pulo; bando de urubus no alto, abaixar. Cada vez mais rápido.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 480, H = 300, GY = 250, GRAV = 2300, JUMP = -820, ZOOM = 1.5;
    // texto nítido com o zoom; no canvas 2D (modo leve) o Phaser desenha o texto de alta resolução grande demais, então lá fica 1x
    const TEXT_RES = perf.lite ? 1 : 2 * ZOOM;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Velocidade<b id="v">1,0x</b></span></div><div class="phaser-wrap" id="pw"></div><p class="hint">Espaço/toque = pular (segure pra ir mais alto) · ↓ ou parte de baixo da tela = abaixar</p>';
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v') };
    // O mundo continua 480x300; a câmera dá zoom e as texturas são pintadas no dobro da resolução, pra ficar nítido.
    return mountPhaser(el.querySelector('#pw'), W * ZOOM, H * ZOOM, {
      create() {
        const scene = this;
        const art = makeArt(scene);
        scene.cameras.main.setZoom(ZOOM).centerOn(W / 2, H / 2);
        const X = 80; // posição fixa do corredor
        let y = GY, vy = 0, ducking = false, started = false, alive = true, dist = 0, speed = 300, spawnIn = 900, tick = 0, trail = 0, wasAir = false, milestone = 500;
        let obs = [], nextFlock = false, coins = [], bonus = 0, held = false, airT = 0;
        const score = () => Math.floor(dist / 10) + bonus;

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
        // coiote de enfeite: de vez em quando entra pela esquerda, persegue um pouco, cansa e fica pra trás (não encosta em nada)
        const coyImg = scene.add.image(-60, GY + 1, 'cr_coy0').setOrigin(0.5, 48 / 50).setScale(0.44).setVisible(false);
        const coy = { st: 'off', x: -60, y: 0, vy: 0, t: rand(9, 15), hold: 0, f: 0, dust: 0 };
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
          if (onGround() && !ducking) { vy = JUMP; held = true; airT = 0; dust.explode(6, X - 4, GY); sfx.jump(); }
        };
        const die = () => {
          alive = false; sfx.boom();
          scene.cameras.main.shake(240, 0.012); scene.cameras.main.flash(180, 255, 80, 100);
          scene.time.delayedCall(800, () => done(score()));
        };
        scene.input.keyboard.addCapture('SPACE,UP,DOWN');
        scene.input.keyboard.on('keydown', e => {
          if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key) && !e.repeat) jump();
          if (['ArrowDown', 's', 'S'].includes(e.key)) { ducking = true; if (!started) jump(); if (!onGround()) vy = Math.max(vy, 500); } // abaixar no ar = cai rápido
        });
        scene.input.keyboard.on('keyup', e => { if (['ArrowDown', 's', 'S'].includes(e.key)) ducking = false; if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key)) held = false; });
        scene.input.on('pointerdown', p => { if (p.worldY > H * 0.68 && started) { ducking = true; if (!onGround()) vy = Math.max(vy, 500); } else jump(); });
        scene.input.on('pointerup', () => { ducking = false; held = false; });

        const put = img => { obsLayer.add(img); return img.setScale(0.5); };
        if (!scene.textures.exists('cr_coin')) { // moeda desenhada: borda escura, face dourada, brilho
          const k = scene.make.graphics({ x: 0, y: 0, add: false });
          k.fillStyle(0xa86a00).fillCircle(16, 16, 15); k.fillStyle(0xffc21a).fillCircle(16, 15, 13);
          k.fillStyle(0xffe27a).fillCircle(16, 15, 9); k.fillStyle(0xe0a000).fillRect(14, 9, 4, 12);
          k.fillStyle(0xffffff, 0.75).fillEllipse(10, 9, 6, 4);
          k.generateTexture('cr_coin', 32, 32); k.destroy();
        }
        // fileira de moedas no meio do caminho até o próximo obstáculo: no chão ou no alto (aí precisa pular)
        const coinRow = gap => {
          const high = Math.random() < 0.5, cy = high ? GY - 92 : GY - 18, x0 = W + 30 + gap / 2 - 22;
          for (let i = 0; i < 3; i++) {
            const img = scene.add.image(x0 + i * 22, cy - (high ? Math.sin((i + 0.5) / 3 * Math.PI) * 14 : 0), 'cr_coin').setScale(0.42);
            obsLayer.add(img);
            coins.push({ img, ph: i * 0.6 });
          }
        };
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
          if (!nextFlock && Math.random() < 0.4) coinRow(spawnIn / 1000 * speed);
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
            // pulo variável: soltou cedo, o pulo corta (mínimo garantido de 0,1s pra ainda passar pelos cactos)
            if (!onGround()) airT += dt;
            if (!held && vy < -250 && airT > 0.1) vy = -250;
            vy += GRAV * dt; y += vy * dt;
            if (y >= GY) { y = GY; vy = 0; }
            spawnIn -= delta;
            if (spawnIn <= 0) spawn();
            for (const o of obs) o.x -= speed * dt;
            obs = obs.filter(o => o.x > -60 || drop(o));
            const pts = Math.floor(dist / 10);
            hud.p.textContent = score();
            hud.v.textContent = dec((speed / 300), 1) + 'x';
            if (pts >= milestone) {
              const t = txt(70, milestone + '!', 26);
              scene.tweens.add({ targets: t, y: 50, alpha: 0, duration: 900, ease: 'Cubic.Out', onComplete: () => t.destroy() });
              [784, 1047].forEach((f, i) => setTimeout(() => beep(f, 90, 'triangle', 0.035), i * 80));
              milestone += 500;
            }
            // caixa do corredor (um pouco menor que o desenho = perdoa bordas)
            const hh = ducking && onGround() ? 22 : 42, bx0 = X - 10, bx1 = X + 10, by0 = y - hh + 3, by1 = y - 2;
            for (const c of coins) {
              c.img.x -= speed * dt; c.ph += dt * 6;
              c.img.setScale(0.42 * Math.abs(Math.cos(c.ph)) + 0.04, 0.42); // gira
              if (Math.abs(c.img.x - X) < 16 && c.img.y > by0 - 8 && c.img.y < by1 + 8) {
                bonus += 25; c.dead = true; sfx.coin();
                const t = scene.add.text(c.img.x, c.img.y - 6, '+25', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#ffe27a', stroke: '#5a3a00', strokeThickness: 3 }).setOrigin(0.5).setResolution(TEXT_RES);
                scene.tweens.add({ targets: t, y: t.y - 22, alpha: 0, duration: 600, onComplete: () => t.destroy() });
              }
              if (c.img.x < -20) c.dead = true;
            }
            coins = coins.filter(c => !c.dead || c.img.destroy());
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
          // coiote
          if (started && alive) {
            if (coy.st === 'off' && (coy.t -= dt) <= 0) { coy.st = 'in'; coy.x = -45; coyImg.setVisible(true); }
            else if (coy.st === 'in') { coy.x += 55 * dt; if (coy.x >= 18) { coy.st = 'chase'; coy.hold = rand(3, 5); } }
            else if (coy.st === 'chase') { coy.x = 18 + Math.sin(tick * 1.7) * 3; if ((coy.hold -= dt) <= 0) coy.st = 'out'; }
            else if (coy.st === 'out') { coy.x -= 32 * dt; if (coy.x < -45) { coy.st = 'off'; coyImg.setVisible(false); coy.t = rand(16, 30); } }
            if (coy.st !== 'off') {
              coy.f += dt * (coy.st === 'out' ? 8 : 15);
              // pula os cactos e o urubu baixo, igual ao corredor
              if (coy.y === 0 && obs.some(o => o.kind !== 'flock' && o.x - o.w / 2 - coy.x > 4 && o.x - o.w / 2 - coy.x < 34)) coy.vy = -540;
              coy.vy += GRAV * dt; coy.y = Math.min(0, coy.y + coy.vy * dt); if (coy.y === 0) coy.vy = 0;
              if (coy.y === 0 && coy.st !== 'out' && (coy.dust -= delta) <= 0) { dust.emitParticleAt(coy.x - 6, GY - 3, 1); coy.dust = 90; }
            }
          }
          coyImg.setPosition(coy.x, GY + 1 + coy.y).setTexture((coy.st === 'out' ? 'cr_coy_t' : 'cr_coy') + (coy.y < 0 ? 0 : Math.floor(coy.f) % 4));
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
        // pele nua atrás do olho, como no papa-léguas de verdade: azul e laranja
        ell(c, x - 4.8, y + 0.4, 3.4, 1.9, 0.1); c.fillStyle = '#5b8cff'; c.fill();
        ell(c, x - 6.4, y + 0.8, 2, 1.4, 0.1); c.fillStyle = '#ff6a3d'; c.fill();
        ell(c, x, y, 3.6, 3.8); paint(c, '#ffffff', INK, 1);
        if (dead) { c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - 1.8, y - 1.8); c.lineTo(x + 1.8, y + 1.8); c.moveTo(x - 1.8, y + 1.8); c.lineTo(x + 1.8, y - 1.8); c.stroke(); return; }
        ell(c, x + 1.1, y + 0.3, 2, 2.2); c.fillStyle = '#14112e'; c.fill();
        ell(c, x + 1.8, y - 0.6, 0.8, 0.8); c.fillStyle = '#fff'; c.fill();
        ell(c, x + 0.4, y + 1.6, 0.4, 0.4); c.fillStyle = 'rgba(255,255,255,.7)'; c.fill();
        c.save(); ell(c, x, y, 3.6, 3.8); c.clip(); c.fillStyle = '#3a46b0'; c.fillRect(x - 4, y - 5, 8, 2.6); c.restore(); // pálpebra: olhar decidido
        c.strokeStyle = INK; c.lineWidth = 1.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 3.4, y - 4.4); c.lineTo(x + 3.4, y - 2.6); c.stroke(); c.lineCap = 'butt';
      };
      const beak = (c, x, y, len) => {
        c.beginPath(); c.moveTo(x, y - 2.4); c.quadraticCurveTo(x + len * 0.6, y - 2.9, x + len, y + 0.6); c.lineTo(x + 1, y + 0.8); c.closePath(); paint(c, lin(c, 0, y - 3, 0, y + 1, [[0, '#ffe07a'], [1, '#ffc23a']]), INK, 1.1);
        c.beginPath(); c.moveTo(x + 1, y + 0.8); c.lineTo(x + len - 1.5, y + 1); c.quadraticCurveTo(x + len * 0.5, y + 3.4, x + 1, y + 2.6); c.closePath(); paint(c, '#e79a22', INK, 1.1);
        c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x + 2.5, y - 1.6); c.quadraticCurveTo(x + len * 0.45, y - 2, x + len * 0.7, y - 1); c.stroke();
        ell(c, x + 3.2, y - 0.6, 0.9, 0.45); c.fillStyle = '#9a5a10'; c.fill(); // narina
      };
      // escamas claras nas costas (penas com borda clara, no lugar das pintinhas)
      const scallops = (c, pts, col = 'rgba(205,215,255,.75)') => { c.strokeStyle = col; c.lineWidth = 0.9; c.lineCap = 'round'; pts.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 1.9, 0.15, Math.PI - 0.15); c.stroke(); }); c.lineCap = 'butt'; };
      const LEG = '#ff9b3a', LEG_D = '#c96a1c';
      const toes = (c, x, y, col, k = 1) => { // pé com dedos em X (dois pra frente, dois pra trás)
        c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 2.6;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 4.5 * k, y); c.moveTo(x, y); c.lineTo(x + 3 * k, y - 1.4); c.moveTo(x, y); c.lineTo(x - 3 * k, y); c.stroke();
        c.strokeStyle = col; c.lineWidth = 1.4; c.stroke(); c.lineCap = 'butt';
      };
      const legWheel = (c, hx, hy, r, f) => {
        // pernas tão rápidas que viram uma roda borrada (com os pés aparecendo)
        ell(c, hx, hy, r, r); c.fillStyle = 'rgba(255,155,58,.28)'; c.fill();
        c.strokeStyle = 'rgba(201,106,28,.55)'; c.lineWidth = 1.3; c.stroke();
        c.lineCap = 'round';
        for (let k = 0; k < 4; k++) {
          const a = f * (TAU / 24) + k * TAU / 4, ex = hx + Math.cos(a) * r, ey = hy + Math.sin(a) * r;
          c.strokeStyle = k ? 'rgba(255,155,58,.6)' : LEG; c.lineWidth = k ? 2 : 2.6;
          c.beginPath(); c.moveTo(hx, hy); c.lineTo(ex, ey); c.stroke();
          ell(c, ex, ey, 2.6, 1.4, a + Math.PI / 2); c.fillStyle = k ? 'rgba(201,106,28,.65)' : LEG_D; c.fill();
        }
        c.strokeStyle = 'rgba(255,225,170,.8)'; c.lineWidth = 1.4;
        c.beginPath(); c.arc(hx, hy, r + 1.8, Math.PI * 0.5 + f * 0.4, Math.PI * 1.15 + f * 0.4); c.stroke();
        c.lineCap = 'butt';
      };
      const leg = (c, pts, col) => {
        c.lineCap = 'round'; c.lineJoin = 'round';
        c.strokeStyle = INK; c.lineWidth = 3.4; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
        c.strokeStyle = col; c.lineWidth = 2; c.stroke();
        c.lineCap = 'butt';
      };
      const speedLines = (c, x, ys) => { c.lineCap = 'round'; ys.forEach(([y, l], i) => { c.strokeStyle = `rgba(255,255,255,${0.7 - i * 0.12})`; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x - l, y); c.lineTo(x, y); c.stroke(); }); c.lineCap = 'butt'; };
      // pena do rabo com ponta branca e listras claras
      const tailFeather = (c, x0, y0, x1, y1, w, dark, light) => {
        feather(c, x0, y0, x1, y1, w, lin(c, x1, y1, x0, y0, [[0, dark], [1, light]]));
        c.save(); feather(c, x0, y0, x1, y1, w, 'rgba(0,0,0,0)'); c.clip();
        c.strokeStyle = 'rgba(160,175,255,.45)'; c.lineWidth = 0.9;
        [0.35, 0.55, 0.72].forEach(t => { const mx = x0 + (x1 - x0) * t, my = y0 + (y1 - y0) * t, nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny); c.beginPath(); c.moveTo(mx + nx / l * w, my + ny / l * w); c.lineTo(mx - nx / l * w, my - ny / l * w); c.stroke(); });
        c.restore();
        ell(c, x1 + (x0 - x1) * 0.06, y1 + (y0 - y1) * 0.06, 1.8, 1.2, Math.atan2(y1 - y0, x1 - x0)); c.fillStyle = '#f2f4ff'; c.fill();
      };
      const standing = (c, legs, { tailUp = 0, dead = false, lean = 0, run = false } = {}) => {
        c.translate(FX, FY);
        if (run) speedLines(c, -14, [[-30, 12], [-23, 16], [-16, 9]]);
        legs(c);
        c.rotate(lean);
        // rabo comprido: três penas listradas com ponta branca
        tailFeather(c, -6, -28, -39, -49 - tailUp, 4.2, '#1a1f66', '#3a46b0');
        tailFeather(c, -6, -29, -37, -43 - tailUp, 3.8, '#232a80', '#4d5fd6');
        tailFeather(c, -6, -27, -33, -37 - tailUp * 0.6, 3.2, '#1f2570', '#3a46b0');
        // corpo, barriga e asa
        ell(c, -1, -24, 14, 9.8, -0.28); paint(c, BODY(c, -34, -14));
        ell(c, 4, -19.5, 8.5, 5.5, -0.35); c.fillStyle = lin(c, 0, -25, 0, -14, [[0, '#f4f5ff'], [1, '#c3cbf5']]); c.fill();
        c.strokeStyle = 'rgba(120,135,210,.5)'; c.lineWidth = 0.8; [[2, -21], [5, -19], [7, -22]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 1.5, y + 1.5); c.stroke(); });
        scallops(c, [[-8, -30], [-3, -31.5], [2, -30.5]]);
        // asa: coberteiras + três penas de voo com borda clara
        [[-1, -24, -20, -21, '#232a80'], [-1, -25.5, -19, -24, '#2b3390'], [-1, -27, -17, -27.5, '#3340a0']].forEach(([x0, y0, x1, y1, f]) => {
          feather(c, x0, y0, x1, y1, 2.6, f);
          c.strokeStyle = 'rgba(190,200,255,.6)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x0 - 3, y0 + 0.4); c.lineTo(x1 + 2, y1 + 0.6); c.stroke();
        });
        ell(c, -3, -26, 8, 5, -0.2); paint(c, lin(c, 0, -31, 0, -21, [[0, '#4656c8'], [1, '#283090']]), INK, 1.1);
        scallops(c, [[-7, -26], [-3, -27.5], [0, -25.5], [-5, -23.5]]);
        // pescoço com garganta clara e listrinhas
        c.beginPath(); c.moveTo(1, -30); c.quadraticCurveTo(5, -38, 6, -44); c.lineTo(13, -42); c.quadraticCurveTo(12, -34, 9, -28); c.closePath(); paint(c, BODY(c, -46, -28));
        c.save(); c.beginPath(); c.moveTo(1, -30); c.quadraticCurveTo(5, -38, 6, -44); c.lineTo(13, -42); c.quadraticCurveTo(12, -34, 9, -28); c.closePath(); c.clip();
        c.beginPath(); c.moveTo(13.5, -42); c.quadraticCurveTo(12, -34, 9, -27); c.lineTo(6.5, -28); c.quadraticCurveTo(9.5, -35, 10, -42); c.closePath(); c.fillStyle = '#e6eaff'; c.fill();
        c.strokeStyle = 'rgba(30,36,110,.55)'; c.lineWidth = 0.7; [[9.5, -39], [9, -35.5], [8, -32]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 1.6, y + 0.9); c.stroke(); });
        c.restore();
        // crista: quatro penas pra trás, com pontinha clara (deita com o vento quando corre)
        const blow = run ? 4 : 0;
        [[6, -46, -8, -55 + blow, 2.4, '#232a80'], [7, -47, -4, -59.5 + blow * 1.2, 2.4, '#2b3390'], [8, -47.5, 0, -61 + blow * 1.4, 2.3, '#3a46b0'], [9.5, -47.5, 5, -59.5 + blow * 1.5, 2.1, '#5566dd']].forEach(([x0, y0, x1, y1, w, f]) => {
          if (dead) y1 += 5;
          feather(c, x0, y0, x1, y1, w, f);
          ell(c, x1 + (x0 - x1) * 0.12, y1 + (y0 - y1) * 0.12, 1, 0.7); c.fillStyle = 'rgba(210,220,255,.9)'; c.fill();
        });
        ell(c, 9, -41.5, 7.6, 7); paint(c, BODY(c, -49, -34));
        c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.2; c.beginPath(); c.arc(9, -41.5, 5.6, Math.PI * 1.1, Math.PI * 1.55); c.stroke(); // brilho na cabeça
        beak(c, 14.5, -41, 17);
        eye(c, 11, -43, dead);
      };
      const stand = c => { leg(c, [[-2, -12], [-3, 0]], LEG_D); toes(c, -3, 0, LEG_D); leg(c, [[2, -12], [3, 0]], LEG); toes(c, 3, 0, LEG); };
      tex('cr_idle', RW, RH, c => standing(c, stand));
      tex('cr_dead', RW, RH, c => standing(c, stand, { dead: true }));
      tex('cr_jump', RW, RH, c => standing(c, c => { leg(c, [[-1, -13], [-7, -8], [-13, -10]], LEG_D); leg(c, [[2, -13], [-3, -6], [-9, -6]], LEG); }, { tailUp: 5 }));
      for (let f = 0; f < 6; f++) tex('cr_run' + f, RW, RH, c => standing(c, c => legWheel(c, 0, -9.5, 9.5, f), { lean: 0.12, run: true, tailUp: -2 }));
      // abaixado: corpo comprido rente ao chão, crista deitada
      for (let f = 0; f < 6; f++) tex('cr_duck' + f, RW, RH, c => {
        c.translate(FX, FY);
        speedLines(c, -22, [[-19, 10], [-13, 14], [-7, 8]]);
        legWheel(c, 1, -6, 6, f);
        tailFeather(c, -12, -15, -42, -20, 3.4, '#1a1f66', '#3a46b0');
        tailFeather(c, -12, -14, -38, -15, 2.8, '#232a80', '#4d5fd6');
        ell(c, 0, -13, 17, 7.5); paint(c, BODY(c, -21, -6));
        ell(c, 4, -9.5, 10, 3.6); c.fillStyle = '#e0e5fb'; c.fill();
        ell(c, -3, -14.5, 10, 4.5, -0.05); paint(c, lin(c, 0, -19, 0, -10, [[0, '#4656c8'], [1, '#283090']]), INK, 1.1);
        scallops(c, [[-8, -15], [-3, -16.5], [1, -14], [-10, -13]]);
        feather(c, 15, -21, 1, -23.5, 2, '#232a80');
        feather(c, 16, -21, 3, -26, 2, '#3a46b0');
        feather(c, 17, -21.5, 7, -27, 1.8, '#5566dd');
        ell(c, 17, -16, 6.8, 6.3); paint(c, BODY(c, -23, -10));
        c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.1; c.beginPath(); c.arc(17, -16, 5, Math.PI * 1.1, Math.PI * 1.55); c.stroke();
        beak(c, 22, -16, 15);
        eye(c, 19, -18);
      });

      // ---------- coiote (só de enfeite: às vezes aparece correndo atrás do corredor e cansa) ----------
      // Canvas 76x50, pés em (38, 48). cr_coy0-3 = galope, cr_coy_t0-3 = cansado (língua de fora).
      const FUR = (c, y0, y1) => lin(c, 0, y0, 0, y1, [[0, '#e0b47a'], [0.45, '#c08f58'], [1, '#93683f']]);
      const FUR_FAR = (c, y0, y1) => lin(c, 0, y0, 0, y1, [[0, '#9c7348'], [1, '#6e4d30']]);
      const CREAM = '#f6e6c8';
      // pata com forma: polígono afinando pelos pontos (quadril → joelho → jarrete → pé), com ponta arredondada
      const limb = (c, pts, ws, fill) => {
        const L = [], Rr = [];
        pts.forEach((p, i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
          L.push([p[0] + nx * ws[i] / 2, p[1] + ny * ws[i] / 2]); Rr.push([p[0] - nx * ws[i] / 2, p[1] - ny * ws[i] / 2]);
        });
        c.beginPath(); c.moveTo(L[0][0], L[0][1]);
        for (let i = 1; i < L.length; i++) { const m = [(L[i - 1][0] + L[i][0]) / 2, (L[i - 1][1] + L[i][1]) / 2]; c.quadraticCurveTo(L[i - 1][0], L[i - 1][1], m[0], m[1]); }
        const e = pts[pts.length - 1]; c.lineTo(L[L.length - 1][0], L[L.length - 1][1]);
        c.arc(e[0], e[1], ws[ws.length - 1] / 2, Math.atan2(L[L.length - 1][1] - e[1], L[L.length - 1][0] - e[0]), Math.atan2(Rr[Rr.length - 1][1] - e[1], Rr[Rr.length - 1][0] - e[0]));
        for (let i = Rr.length - 1; i > 0; i--) { const m = [(Rr[i][0] + Rr[i - 1][0]) / 2, (Rr[i][1] + Rr[i - 1][1]) / 2]; c.quadraticCurveTo(Rr[i][0], Rr[i][1], m[0], m[1]); }
        c.lineTo(Rr[0][0], Rr[0][1]); c.closePath();
        paint(c, fill, INK, 1.1);
      };
      const paw = (c, [x, y], dir = 1) => { ell(c, x + dir * 1.4, y + 0.2, 2.9, 1.6); paint(c, '#5b4030', INK, 0.9); c.strokeStyle = 'rgba(255,230,200,.35)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x + dir * 2.2, y - 0.8); c.lineTo(x + dir * 2.4, y + 1); c.stroke(); };
      // galope em 4 quadros: [quadril, joelho, jarrete, pé] e [ombro, cotovelo, punho, pé]
      const GALLOP = [
        { bob: -3, back: [[-10, -19], [-15, -13], [-22, -11], [-28, -8]], front: [[10, -20], [16, -15], [23, -13], [29, -11]] },
        { bob: -1, back: [[-10, -19], [-4, -13], [-6, -6], [-1, -2]], front: [[10, -20], [9, -13], [6, -7], [2, -3]] },
        { bob: 0, back: [[-10, -19], [-8, -11], [-14, -5], [-12, 0]], front: [[10, -20], [15, -14], [20, -9], [25, -6]] },
        { bob: 1, back: [[-10, -19], [-13, -12], [-19, -7], [-22, -1]], front: [[10, -20], [11, -12], [10, -5], [13, 0]] },
      ];
      const coyote = (c, f, tired) => {
        c.translate(38, 48);
        const G = GALLOP[f], bob = G.bob, hy = tired ? 4 : 0, tl = tired ? 8 : 0;
        const at = (pts, dx = 0) => pts.map(([x, y], i) => [x + dx, y + (i === 0 ? bob : i === 1 ? bob * 0.5 : 0)]);
        // patas do lado de lá
        const farB = GALLOP[(f + 1) % 4].back, farF = GALLOP[(f + 1) % 4].front;
        limb(c, at(farB, 3), [7, 4.8, 3.4, 3.2], FUR_FAR(c, -20, 0)); paw(c, at(farB, 3)[3]);
        limb(c, at(farF, -3), [6, 4.2, 3.2, 3], FUR_FAR(c, -20, 0)); paw(c, at(farF, -3)[3]);
        c.save(); c.translate(0, bob);
        // rabo peludo: tufos na borda, barriga clara e ponta preta
        c.beginPath(); c.moveTo(-14, -24);
        c.bezierCurveTo(-22, -28 + tl * 0.5, -30, -27 + tl, -38, -21 + tl * 1.3);
        [[-36.5, -19.5], [-37.5, -17.5], [-35, -16.5], [-35.5, -14.6], [-31, -15.2], [-29.5, -13.6], [-25, -15.6], [-22, -14.6]].forEach(([x, y]) => c.lineTo(x, y + tl * (0.6 + (x + 38) / -40 * 0.6)));
        c.quadraticCurveTo(-18, -17, -14, -18); c.closePath();
        paint(c, lin(c, -38, 0, -14, 0, [[0, '#2a221d'], [0.18, '#3a2e26'], [0.3, '#a07548'], [1, '#c8975e']]), INK, 1.1);
        c.strokeStyle = 'rgba(245,225,190,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-17, -18.5); c.quadraticCurveTo(-24, -17.5 + tl * 0.6, -29, -16.5 + tl * 0.9); c.stroke();
        c.strokeStyle = 'rgba(70,45,25,.45)'; c.lineWidth = 0.8;
        [[-20, -24 + tl * 0.4], [-25, -23.5 + tl * 0.6], [-29.5, -22 + tl * 0.8]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y + 1.6); c.stroke(); });
        // corpo: anca redonda, cintura fina, peito fundo
        const body = () => { c.beginPath(); c.moveTo(-15, -23.5);
          c.bezierCurveTo(-12, -28.5, -2, -28.5, 5, -27.5); c.bezierCurveTo(10, -27, 14, -25.5, 16, -21.5);
          c.bezierCurveTo(17, -18, 15, -15.5, 11, -15); c.quadraticCurveTo(3, -16.5, -3, -16);
          c.bezierCurveTo(-9, -14, -15, -14.5, -17, -18); c.quadraticCurveTo(-18, -21.5, -15, -23.5); c.closePath(); };
        body(); paint(c, FUR(c, -29, -14), INK, 1.2);
        c.save(); body(); c.clip();
        c.beginPath(); c.moveTo(16, -21); c.bezierCurveTo(15, -16, 8, -14, 0, -15.5); c.lineTo(-4, -13); c.lineTo(17, -13); c.closePath(); c.fillStyle = CREAM; c.fill(); // peito e barriga clara
        c.beginPath(); c.moveTo(-16, -25); c.bezierCurveTo(-8, -29.5, 4, -29.5, 12, -27); c.lineTo(12, -25.6); c.bezierCurveTo(4, -27.6, -8, -27.6, -16, -23); c.closePath(); c.fillStyle = 'rgba(80,60,45,.5)'; c.fill(); // faixa grisalha nas costas
        c.strokeStyle = 'rgba(90,60,35,.5)'; c.lineWidth = 0.8;
        [[-11, -25.4], [-6, -26.2], [-1, -26.4], [4, -26]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 2, y + 2.3); c.stroke(); });
        c.restore();
        c.restore();
        // patas do lado de cá
        limb(c, at(G.back), [8.5, 5.8, 3.8, 3.4], FUR(c, -20, 0)); paw(c, at(G.back)[3]);
        limb(c, at(G.front), [7, 4.8, 3.6, 3.2], FUR(c, -20, 0)); paw(c, at(G.front)[3]);
        c.save(); c.translate(0, bob);
        // coxa e ombro cobrem o encaixe das patas no corpo
        ell(c, -10.5, -19.5, 7, 6.6, 0.3); c.fillStyle = FUR(c, -29, -14); c.fill();
        c.strokeStyle = INK; c.lineWidth = 1.1; c.beginPath(); c.ellipse(-10.5, -19.5, 7, 6.6, 0.3, Math.PI * 0.35, Math.PI * 1.02); c.stroke();
        c.strokeStyle = 'rgba(70,45,25,.5)'; c.lineWidth = 0.9; c.beginPath(); c.ellipse(-10.5, -19.5, 7, 6.6, 0.3, -Math.PI * 0.35, Math.PI * 0.35); c.stroke();
        ell(c, 10, -20.5, 5.4, 5.8, -0.2); c.fillStyle = FUR(c, -29, -14); c.fill();
        c.strokeStyle = INK; c.lineWidth = 1.1; c.beginPath(); c.ellipse(10, -20.5, 5.4, 5.8, -0.2, -Math.PI * 0.05, Math.PI * 0.6); c.stroke();
        // pescoço com juba
        c.beginPath(); c.moveTo(6, -27); c.bezierCurveTo(10, -31 + hy, 14, -33 + hy, 19, -33.5 + hy);
        c.lineTo(22, -25 + hy); c.bezierCurveTo(19, -22 + hy * 0.5, 17, -19, 15, -17); c.quadraticCurveTo(11, -20, 6, -27); c.closePath(); paint(c, FUR(c, -34, -17), INK, 1.1);
        c.beginPath(); c.moveTo(21.5, -25 + hy); [[19.5, -23 + hy * 0.6], [20, -21 + hy * 0.4], [17.5, -20], [17, -18]].forEach(([x, y]) => c.lineTo(x, y)); c.quadraticCurveTo(16, -22, 21.5, -25 + hy); c.fillStyle = CREAM; c.fill(); // peito fofo
        c.strokeStyle = 'rgba(80,55,30,.45)'; c.lineWidth = 0.8; [[10, -29 + hy * 0.5], [13, -30.5 + hy * 0.7]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 1.5, y + 2.4); c.stroke(); });
        // orelhas grandes com tufo claro dentro (deitam quando cansa)
        const ed = tired ? 1 : 0;
        [[16.5, -34, 13.5 - ed * 4, -45 + ed * 6, 20.5, -37.5, '#a87a4a'], [20, -35.5, 21 - ed * 4, -47.5 + ed * 7, 25.5, -36, '#c8975e']].forEach(([x0, y0, x1, y1, x2, y2, col]) => {
          c.beginPath(); c.moveTo(x0, y0 + hy); c.quadraticCurveTo(x1 - 1, (y0 + y1) / 2 + hy, x1, y1 + hy); c.quadraticCurveTo(x2, (y1 + y2) / 2 + hy, x2, y2 + hy); c.closePath(); paint(c, col, INK, 1.1);
          c.beginPath(); c.moveTo(x0 + 1.3, y0 + hy - 0.6); c.quadraticCurveTo(x1, (y0 + y1) / 2 + hy + 1, x1 + 0.8, y1 + hy + 3.2); c.quadraticCurveTo(x2 - 1.5, (y1 + y2) / 2 + hy + 1, x2 - 1.3, y2 + hy - 0.6); c.closePath(); c.fillStyle = '#d98f84'; c.fill();
          c.strokeStyle = CREAM; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x0 + 2, y0 + hy - 0.6); c.lineTo(x0 + 2.4 + (x1 - x0) * 0.25, y0 + hy - 4); c.moveTo(x0 + 3, y0 + hy - 0.8); c.lineTo(x0 + 3.6 + (x1 - x0) * 0.2, y0 + hy - 3.4); c.stroke();
        });
        // cabeça: crânio, bochecha fofa clara e focinho comprido
        ell(c, 22, -30.5 + hy, 6.2, 5.2, -0.1); paint(c, FUR(c, -36 + hy, -25 + hy), INK, 1.1);
        c.beginPath(); c.moveTo(24.5, -33.8 + hy); c.bezierCurveTo(29, -33.6 + hy, 34, -32 + hy, 37.6, -29.8 + hy); c.quadraticCurveTo(38.2, -28 + hy, 36, -27.4 + hy); c.lineTo(25.5, -27 + hy); c.closePath();
        paint(c, lin(c, 0, -34 + hy, 0, -27 + hy, [[0, '#d8a86c'], [1, '#c08f58']]), INK, 1.1);
        c.strokeStyle = 'rgba(255,240,215,.6)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(26, -33 + hy); c.quadraticCurveTo(31, -32.6 + hy, 35, -30.8 + hy); c.stroke(); // brilho no focinho
        // maxilar claro + bochecha em tufos
        c.beginPath(); c.moveTo(36, -27.4 + hy); c.quadraticCurveTo(33, -24.6 + hy, 28, -24.4 + hy);
        [[25.5, -23 + hy], [24.5, -25 + hy], [22, -23.6 + hy], [21.6, -26 + hy]].forEach(([x, y]) => c.lineTo(x, y));
        c.quadraticCurveTo(22, -28 + hy, 25.5, -27 + hy); c.closePath(); paint(c, CREAM, INK, 1);
        ell(c, 37.6, -29.6 + hy, 1.7, 1.45); paint(c, '#241b17', null); ell(c, 37, -30.2 + hy, 0.6, 0.38); c.fillStyle = 'rgba(255,255,255,.75)'; c.fill(); // nariz
        // boca: sorriso safado com canino (ou língua de fora, cansado)
        c.strokeStyle = INK; c.lineWidth = 0.9; c.beginPath(); c.moveTo(36.2, -27.6 + hy); c.quadraticCurveTo(31, -26.4 + hy, 27, -27.6 + hy); c.stroke();
        if (tired) { c.beginPath(); c.moveTo(31.5, -26.8 + hy); c.bezierCurveTo(33.5, -22 + hy, 32.5, -18.5 + hy, 30.5, -18.8 + hy); c.bezierCurveTo(28.6, -19.2 + hy, 29, -23 + hy, 29.5, -26.8 + hy); c.closePath(); paint(c, lin(c, 0, -27 + hy, 0, -19 + hy, [[0, '#ff6f80'], [1, '#ff9aa6']]), INK, 0.9);
          c.strokeStyle = 'rgba(180,40,60,.5)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(30.6, -25 + hy); c.lineTo(30.8, -21 + hy); c.stroke(); }
        else { c.beginPath(); c.moveTo(29.5, -27.3 + hy); c.lineTo(30.9, -27.2 + hy); c.lineTo(30.2, -25.5 + hy); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = INK; c.lineWidth = 0.5; c.stroke(); }
        // olho amendoado amarelo com pupila, brilho e sobrancelha
        c.beginPath(); c.moveTo(22.2, -32 + hy); c.quadraticCurveTo(24.6, -35 + hy, 27.4, -32.6 + hy); c.quadraticCurveTo(24.8, -30.4 + hy, 22.2, -32 + hy); c.closePath(); paint(c, '#ffd84a', INK, 0.9);
        ell(c, 25.1, -32.3 + hy, 1.1, 1.35); c.fillStyle = '#1a120e'; c.fill();
        ell(c, 25.5, -32.9 + hy, 0.42, 0.42); c.fillStyle = '#fff'; c.fill();
        if (tired) { c.save(); c.beginPath(); c.moveTo(22.2, -32 + hy); c.quadraticCurveTo(24.6, -35 + hy, 27.4, -32.6 + hy); c.quadraticCurveTo(24.8, -30.4 + hy, 22.2, -32 + hy); c.clip(); c.fillStyle = '#b8874f'; c.fillRect(21, -36 + hy, 8, 3.6); c.restore(); }
        c.strokeStyle = INK; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath();
        if (tired) { c.moveTo(21.8, -34.8 + hy); c.quadraticCurveTo(24.5, -35.6 + hy, 27.4, -34.6 + hy); } else { c.moveTo(21.6, -36 + hy); c.quadraticCurveTo(24.5, -35.6 + hy, 27.6, -33.6 + hy); }
        c.stroke(); c.lineCap = 'butt';
        if (tired) { c.beginPath(); c.moveTo(17, -40.5); c.quadraticCurveTo(18.6, -37.6, 17, -36.6); c.quadraticCurveTo(15.4, -37.6, 17, -40.5); paint(c, '#a8e0ff', INK, 0.7); } // gota de suor
        c.restore();
      };
      for (let f = 0; f < 4; f++) tex('cr_coy' + f, 76, 50, c => coyote(c, f, false));
      for (let f = 0; f < 4; f++) tex('cr_coy_t' + f, 76, 50, c => coyote(c, f, true));

      // ---------- urubu (de frente pro corredor) ----------
      // 3 quadros de asa: 0 = em cima, 1 = planando, 2 = embaixo. Corpo no centro do canvas 70x70.
      // Direção de arte: silhueta clássica de urubu (asa larga com as penas da ponta abertas como dedos, rabo em leque,
      // cabeça careca vermelha), corpo ameixa-escuro com penas de voo prateadas (contraste dentro do próprio desenho)
      // e uma borda creme em volta: lê bem no céu da noite, no pôr do sol e na areia, e não lembra o corredor azul.
      const VK = INK;
      // asas desenhadas à mão por quadro: ombro, punho, pontas dos 5 "dedos" e onde a borda de trás encontra o corpo
      const WINGS = [
        { sh: [-2, -3], wr: [1, -16], tips: [[-2, -27], [3, -29.5], [8, -28.5], [12, -25], [15, -20.5]], end: [12, -3] },
        { sh: [-2, -3], wr: [9, -9], tips: [[19, -15.5], [23, -13.5], [26, -10], [26.5, -6], [24.5, -2.5]], end: [11, 2] },
        { sh: [-2, -1], wr: [2, 12], tips: [[-1, 22.5], [4, 25], [9, 24.5], [13, 21.5], [15.5, 17]], end: [12, 1] },
      ];
      const vulture = (c, fr) => {
        c.translate(35, 35);
        const mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        const wing = (off, far) => {
          const w = WINGS[fr], P = pt => [pt[0] + off[0], pt[1] + off[1]];
          const S0 = P(w.sh), Wr = P(w.wr), E = P(w.end), T = w.tips.map(P);
          // penas de voo: borda da frente até o punho, dedos abertos na ponta, borda de trás em escamas até o corpo
          c.beginPath(); c.moveTo(S0[0], S0[1]);
          const lead = mix(S0, Wr, 0.5);
          c.quadraticCurveTo(lead[0] - (Wr[1] - S0[1]) * 0.12, lead[1] + (Wr[0] - S0[0]) * 0.12, Wr[0], Wr[1]);
          let prev = Wr;
          T.forEach((t, k) => { // cada dedo com a ponta arredondada
            const nt = k < T.length - 1 ? mix(mix(t, T[k + 1], 0.5), Wr, 0.24) : null, a0 = mix(prev, t, 0.75);
            c.lineTo(a0[0], a0[1]);
            const b0 = nt ? mix(t, nt, 0.3) : t; c.quadraticCurveTo(t[0], t[1], b0[0], b0[1]);
            if (nt) c.lineTo(nt[0], nt[1]);
            prev = nt || t;
          });
          const last = T[T.length - 1];
          for (let j = 1; j <= 4; j++) { const p0 = mix(last, E, (j - 1) / 4), p1 = mix(last, E, j / 4), m = mix(p0, p1, 0.5), dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
            const side = (E[0] - Wr[0]) * dy - (E[1] - Wr[1]) * dx > 0 ? 1 : -1;
            c.quadraticCurveTo(m[0] + dy / l * 2 * side, m[1] - dx / l * 2 * side, p1[0], p1[1]); }
          c.closePath();
          const tc = mix(T[0], T[4], 0.5);
          paint(c, lin(c, S0[0], S0[1], tc[0], tc[1], far ? [[0, '#7d7690'], [1, '#a9a2bd']] : [[0, '#c4bed6'], [1, '#f6f3fb']]), VK, 1.1);
          // riscos entre as penas
          c.strokeStyle = far ? 'rgba(50,40,70,.45)' : 'rgba(90,80,120,.45)'; c.lineWidth = 0.7;
          T.slice(0, 4).forEach((t, k) => { const nt = mix(mix(t, T[k + 1], 0.5), Wr, 0.24), a0 = mix(nt, Wr, 0.6); c.beginPath(); c.moveTo(a0[0], a0[1]); c.lineTo(nt[0], nt[1]); c.stroke(); });
          for (let j = 1; j < 4; j++) { const e = mix(last, E, j / 4), a0 = mix(e, mix(S0, Wr, 0.5 + j * 0.1), 0.45); c.beginPath(); c.moveTo(a0[0], a0[1]); c.lineTo(e[0], e[1]); c.stroke(); }
          // coberteiras escuras: do ombro ao punho, terminando em escamas no meio da asa
          let px = Wr[1] - S0[1], py = S0[0] - Wr[0]; const pl = Math.hypot(px, py); px /= pl; py /= pl;
          if ((E[0] - S0[0]) * px + (E[1] - S0[1]) * py < 0) { px = -px; py = -py; } // aponta pro lado de trás da asa
          const C1 = [Wr[0] + px * 7 + (Wr[0] - S0[0]) * 0.12, Wr[1] + py * 7 + (Wr[1] - S0[1]) * 0.12], C3 = [S0[0] + px * 9.5, S0[1] + py * 9.5];
          c.beginPath(); c.moveTo(S0[0], S0[1]);
          c.quadraticCurveTo(lead[0] - (Wr[1] - S0[1]) * 0.12, lead[1] + (Wr[0] - S0[0]) * 0.12, Wr[0], Wr[1]);
          c.quadraticCurveTo(Wr[0] + px * 1.5 + (Wr[0] - S0[0]) * 0.15, Wr[1] + py * 1.5 + (Wr[1] - S0[1]) * 0.15, C1[0], C1[1]);
          for (let j = 1; j <= 4; j++) { const p0 = mix(C1, C3, (j - 1) / 4), p1 = mix(C1, C3, j / 4), m = mix(p0, p1, 0.5); c.quadraticCurveTo(m[0] + px * 2, m[1] + py * 2, p1[0], p1[1]); }
          c.closePath();
          paint(c, far ? '#3a3044' : lin(c, S0[0], S0[1], C3[0], C3[1], [[0, '#8a79a0'], [1, '#4f405f']]), VK, 1.1);
          if (!far) { const h0 = mix(S0, Wr, 0.15), h1 = mix(S0, Wr, 0.85); c.strokeStyle = 'rgba(240,230,255,.55)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(h0[0] + 0.8, h0[1] + 0.3); c.lineTo(h1[0] + 0.8, h1[1] + 0.3); c.stroke(); }
        };
        wing([2.5, -0.5], true); // asa de trás
        // rabo em leque
        [[-0.28, '#4a3e58'], [0.32, '#4a3e58'], [0.02, '#5d4f6d']].forEach(([a, f]) => feather(c, 10, 0.5, 10 + Math.cos(a) * 13, 0.5 + Math.sin(a) * 13, 3.4, f));
        // corpo
        ell(c, 2, 0.5, 12.5, 7, 0.06); paint(c, lin(c, 0, -7, 0, 8, [[0, '#7c6c88'], [0.5, '#54465f'], [1, '#2f2638']]), VK, 1.2);
        c.save(); ell(c, 2, 0.5, 12.5, 7, 0.06); c.clip(); c.strokeStyle = 'rgba(225,215,240,.28)'; c.lineWidth = 0.8;
        [[-1, -2], [4, -3], [8, -1], [2, 2], [7, 3]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 2.2, 0.2, Math.PI - 0.2); c.stroke(); });
        c.restore();
        // pés recolhidos
        c.strokeStyle = '#e9b5a6'; c.lineWidth = 1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(5, 6); c.lineTo(9, 8.2); c.moveTo(7.5, 5.5); c.lineTo(11, 7.4); c.stroke(); c.lineCap = 'butt';
        wing([0, 0], false);
        // gola creme fofinha
        c.beginPath(); for (let k = 0; k < 7; k++) c.arc(-9 + Math.cos(k * 0.9) * 2.6, -2 + Math.sin(k * 0.9) * 2.4, 2.5, 0, TAU);
        paint(c, rad(c, -9, -3, 0.5, 5, [[0, '#fffaf0'], [1, '#e2d6c6']]), null);
        // pescoço e cabeça careca, com rugas
        c.beginPath(); c.moveTo(-10, -2.5); c.quadraticCurveTo(-13, -7, -16, -7.5); c.lineTo(-14.5, -2.5); c.closePath(); paint(c, '#d46a5f', VK, 1);
        ell(c, -17, -7.5, 4.8, 4.2, -0.15); paint(c, rad(c, -18, -9, 0.5, 5.2, [[0, '#ffb3a4'], [0.6, '#e2776b'], [1, '#b9504b']]), VK, 1.1);
        c.strokeStyle = 'rgba(140,40,40,.55)'; c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(-15, -10); c.quadraticCurveTo(-14, -8, -15, -6); c.moveTo(-13.6, -9); c.quadraticCurveTo(-12.8, -7.5, -13.6, -6); c.stroke();
        // bico curvo cor de marfim, ponta escura
        c.beginPath(); c.moveTo(-20.6, -9.2); c.quadraticCurveTo(-26, -9, -27, -5.4); c.quadraticCurveTo(-24.4, -6.4, -21, -5.6); c.closePath(); paint(c, '#f4e6c8', VK, 1);
        c.beginPath(); c.moveTo(-25.4, -7.6); c.quadraticCurveTo(-26.8, -6.8, -27, -5.4); c.lineTo(-25.2, -6); c.closePath(); c.fillStyle = '#6b5a4a'; c.fill();
        ell(c, -21.3, -7.6, 0.8, 0.5); c.fillStyle = '#7a3a36'; c.fill(); // narina
        // olho com brilho e sobrancelha brava
        ell(c, -18.2, -8.8, 1.7, 1.8); paint(c, '#fff', VK, 0.8);
        ell(c, -18.7, -8.7, 0.95, 1.05); c.fillStyle = VK; c.fill();
        ell(c, -18.4, -9.3, 0.35, 0.35); c.fillStyle = '#fff'; c.fill();
        c.strokeStyle = VK; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-20.4, -11.2); c.lineTo(-16.4, -10.2); c.stroke();
      };
      [0, 1, 2].forEach(fr => tex('cr_vul' + fr, 70, 70, c => {
        // desenha num canvas à parte e carimba a silhueta creme em volta antes (borda de "adesivo")
        const art = document.createElement('canvas'); art.width = 70 * R; art.height = 70 * R;
        const a = art.getContext('2d'); a.scale(R, R); vulture(a, fr);
        const halo = document.createElement('canvas'); halo.width = art.width; halo.height = art.height;
        const h = halo.getContext('2d'); h.drawImage(art, 0, 0); h.globalCompositeOperation = 'source-in'; h.fillStyle = '#fff4e2'; h.fillRect(0, 0, halo.width, halo.height);
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
        for (let k = 0; k < 12; k++) c.drawImage(halo, Math.cos(k * TAU / 12) * 1.5 * R, Math.sin(k * TAU / 12) * 1.5 * R);
        c.drawImage(art, 0, 0); c.restore();
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
