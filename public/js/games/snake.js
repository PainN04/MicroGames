GAMES.snake = {
  name: 'Cobrinha', icon: 'worm', hue: 150, desc: 'Setas, WASD, deslize ou os botões. Acelera a cada fruta; a dourada vale 5 e a azul encolhe o rabo (−3)!',
  better: 'high', unit: 'pontos', phaser: true,
  // Phaser. Lógica em grade (20×20); o desenho desliza entre as casas. Feita pra responder na hora:
  //  - a curva não espera o próximo passo: se já passou de ~45% da casa, o passo é antecipado (some o "delay");
  //  - no celular o deslize vale assim que o dedo anda ~14px (sem esperar soltar) e há botões de direção;
  //  - o desenho continua de onde estava (sem pulo) mesmo quando um passo é antecipado;
  //  - entrar na casa que o rabo está deixando não mata.
  start(el, done) {
    const N = 20, S = 24, W = N * S;
    const STEP_START = 135, STEP_MIN = 68, STEP_DEC = 3;
    const arrow = (d, rot) => `<button class="dbtn" data-d="${d}" aria-label="${d}" style="--r:${rot}deg">${icon('arrow-left')}</button>`;
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Velocidade<b id="v">1.0x</b></span></div>
      <div class="phaser-wrap" id="pw"></div>
      <div class="dpad" aria-hidden="true">${arrow('up', 90)}${arrow('left', 0)}${arrow('right', 180)}${arrow('down', -90)}</div>
      <p class="hint">Setas, WASD ou deslize pra começar</p>`;
    const hud = { p: el.querySelector('#p'), v: el.querySelector('#v') };
    const col = { tile: 0x24273a, food: hex('--red'), body: hex('--green'), head: hex('--yellow'), gold: 0xffd34d, cut: 0x4dd9ff };
    const KEYS = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    let turnNow = () => {}; // ligado dentro da cena; o D-pad (fora do Phaser) usa
    el.querySelectorAll('.dbtn').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); turnNow(DIRS[b.dataset.d]); }));

    return mountPhaser(el.querySelector('#pw'), W, W, {
      create() {
        let snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], from = snake.map(s => ({ ...s })), vis = from.map(s => ({ ...s }));
        let dir = [1, 0], queue = [], food, bonus = null, pts = 0, eaten = 0;
        let step = STEP_START, acc = 0, started = false, alive = true;
        dotTexture(this);
        const board = this.add.graphics().fillStyle(col.tile);
        for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x + y) % 2) board.fillRect(x * S, y * S, S, S);
        const foodDot = this.add.circle(0, 0, S / 2 - 4, col.food);
        this.tweens.add({ targets: foodDot, scale: 1.25, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.InOut' });
        const gold = this.add.graphics();
        const body = this.add.graphics();
        const burst = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 200 }, lifespan: 450, scale: { start: 1, end: 0 }, tint: col.food, emitting: false });
        const goldBurst = this.add.particles(0, 0, 'dot', { speed: { min: 80, max: 260 }, lifespan: 600, scale: { start: 1.3, end: 0 }, tint: col.gold, emitting: false });
        const cutBurst = this.add.particles(0, 0, 'dot', { speed: { min: 80, max: 240 }, lifespan: 550, scale: { start: 1.2, end: 0 }, tint: col.cut, emitting: false });
        const msg = this.add.text(W / 2, W / 2 + 56, 'Aperte uma seta', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '22px', color: '#c9cce0' }).setOrigin(0.5);

        const free = () => { let c; do c = { x: rand(0, N - 1), y: rand(0, N - 1) }; while (snake.some(s => s.x === c.x && s.y === c.y) || (food && c.x === food.x && c.y === food.y) || (bonus && c.x === bonus.x && c.y === bonus.y)); return c; };
        const placeFood = () => { food = free(); foodDot.setPosition(food.x * S + S / 2, food.y * S + S / 2); };

        const turn = k => {
          if (!alive || !k) return;
          const last = queue.at(-1) || dir;
          if (last[0] === -k[0] && last[1] === -k[1]) return; // não dá meia-volta
          if (last[0] === k[0] && last[1] === k[1]) { if (!started) go(); return; }
          if (queue.length < 3) queue.push(k);
          if (!started) return go();
          // já andou boa parte da casa: antecipa o passo pra curva acontecer agora
          if (queue.length === 1 && acc > step * 0.45) { acc = 0; tick(); }
        };
        turnNow = turn;
        const go = () => { started = true; acc = step * 0.7; msg.destroy(); };

        const die = () => {
          alive = false;
          sfx.bad();
          this.cameras.main.shake(260, 0.012);
          this.cameras.main.flash(200, 255, 80, 100);
          this.time.delayedCall(750, () => done(pts));
        };
        const tick = () => {
          if (queue.length) dir = queue.shift();
          const h = { x: snake[0].x + dir[0], y: snake[0].y + dir[1] };
          const eatsFood = h.x === food.x && h.y === food.y, onBonus = bonus && h.x === bonus.x && h.y === bonus.y;
          const eatsGold = onBonus && bonus.kind === 'gold', eatsCut = onBonus && bonus.kind === 'cut';
          const grows = eatsFood || eatsGold;
          // o rabo sai da casa neste mesmo passo, então bater nele só vale se a cobra está crescendo
          const solid = grows ? snake : snake.slice(0, -1);
          if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N || solid.some(s => s.x === h.x && s.y === h.y)) return die();
          // continua de onde o desenho está agora (sem pulo, mesmo com passo antecipado)
          from = vis.map(v => ({ ...v }));
          snake.unshift(h);
          if (eatsGold) {
            pts += 5; hud.p.textContent = pts;
            goldBurst.explode(22, bonus.x * S + S / 2, bonus.y * S + S / 2);
            floatText(this, bonus.x * S + S / 2, bonus.y * S, '+5', '#ffd34d');
            beep(990, 90, 'triangle'); beep(1320, 120, 'triangle');
            bonus = null;
          } else if (eatsCut) {
            // fruta azul: anda normal e ainda perde até 3 do rabo (nunca fica com menos de 3 casas)
            snake.pop();
            const n = Math.min(3, snake.length - 3);
            for (let k = 0; k < n; k++) snake.pop();
            pts += 2; hud.p.textContent = pts;
            cutBurst.explode(20, bonus.x * S + S / 2, bonus.y * S + S / 2);
            floatText(this, bonus.x * S + S / 2, bonus.y * S, n > 0 ? `rabo −${n}` : '+2', '#7ad7ff');
            beep(520, 80, 'sine'); beep(780, 90, 'sine'); beep(330, 140, 'triangle');
            bonus = null;
          } else if (eatsFood) {
            hud.p.textContent = ++pts;
            eaten++;
            step = Math.max(STEP_MIN, step - STEP_DEC);
            hud.v.textContent = (STEP_START / step).toFixed(1) + 'x';
            burst.explode(16, foodDot.x, foodDot.y);
            floatText(this, foodDot.x, foodDot.y - 10, '+1', '#7cffb0');
            beep(660 + pts * 12, 70, 'triangle');
            placeFood();
            if (!bonus && eaten % 5 === 0) bonus = { ...free(), kind: 'gold', ttl: 6500, max: 6500 }; // a cada 5 frutas aparece uma dourada por 6,5s
            else if (!bonus && snake.length > 7 && Math.random() < 0.14) bonus = { ...free(), kind: 'cut', ttl: 7000, max: 7000 }; // às vezes uma azul que encurta o rabo
          } else snake.pop();
        };
        const draw = (t, delta) => {
          body.clear(); gold.clear();
          for (let i = snake.length - 1; i >= 0; i--) {
            // ao crescer, o segmento novo do rabo não tem from[i]: nasce parado onde o rabo estava
            const s = snake[i], f = from[i] ?? from.at(-1);
            const vx = f.x + (s.x - f.x) * t, vy = f.y + (s.y - f.y) * t;
            vis[i] = { x: vx, y: vy };
            body.fillStyle(i ? col.body : col.head).fillRoundedRect(vx * S + 2, vy * S + 2, S - 4, S - 4, 7);
          }
          vis.length = snake.length;
          // olhinhos na cabeça, olhando pra onde ela vai
          const hx = vis[0].x * S + S / 2, hy = vis[0].y * S + S / 2, d = queue[0] || dir;
          body.fillStyle(0x10131c);
          for (const side of [-1, 1]) body.fillCircle(hx + d[0] * 5 - d[1] * side * 5, hy + d[1] * 5 + d[0] * side * 5, 2.3);
          if (bonus) {
            bonus.ttl -= delta;
            if (bonus.ttl <= 0) bonus = null;
            else {
              const cx = bonus.x * S + S / 2, cy = bonus.y * S + S / 2, k = bonus.ttl / bonus.max, pulse = Math.sin(this.time.now / 110) * 1.4;
              if (bonus.kind === 'cut') {
                const r = S / 2 - 2 + pulse; // losango azul: dá pra distinguir da dourada até no celular
                gold.fillStyle(col.cut).fillPoints([{ x: cx, y: cy - r }, { x: cx + r, y: cy }, { x: cx, y: cy + r }, { x: cx - r, y: cy }], true);
                gold.fillStyle(0xffffff, 0.75).fillRect(cx - 5, cy - 1, 10, 2);
              } else gold.fillStyle(col.gold).fillCircle(cx, cy, S / 2 - 3 + pulse);
              gold.lineStyle(2.5, 0xffffff, 0.9).beginPath().arc(cx, cy, S / 2 + 2, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
            }
          }
        };

        this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
        this.input.keyboard.on('keydown', e => turn(KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]));
        // deslizar: vale assim que o dedo anda ~14px (sem esperar soltar); dá pra encadear curvas sem levantar o dedo
        let sx = 0, sy = 0;
        this.input.on('pointerdown', p => { sx = p.x; sy = p.y; });
        this.input.on('pointermove', p => {
          if (!p.isDown) return;
          const dx = p.x - sx, dy = p.y - sy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
          turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
          sx = p.x; sy = p.y;
        });
        this.events.on('update', (time, delta) => {
          delta = Math.min(delta, 50); // aba que voltou de segundo plano não "teletransporta" a cobra
          if (started && alive) {
            acc += delta;
            while (acc >= step && alive) { acc -= step; tick(); }
          }
          draw(started && alive ? Math.min(1, acc / step) : 1, delta);
        });
        placeFood();
      },
    });
  }
};
