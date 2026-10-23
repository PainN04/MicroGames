// Sinuca de 8 bolas contra a máquina, no estilo do 8 Ball Pool: mesa vista de cima, lisas (1–7) contra listradas (9–15),
// e quem limpa o seu grupo e encaçapa a 8 vence a mesa. A física, as regras e a máquina não dependem do Phaser e ficam
// em GAMES.sinuca.engine (o teste roda elas no Node). A física anda em passos fixos de 1/120 s, então a simulação que a
// máquina usa pra escolher a tacada dá exatamente o mesmo resultado da tacada de verdade.
(() => {
  // ---------- mesa ----------
  // coordenadas do pano: (0, 0) no canto de cima à esquerda, TW × TH (2:1, como a mesa de verdade, em pé)
  const TW = 272, TH = 544, R = 8, D = R * 2, MY = TH / 2;
  const CM = 21, SM = 15; // boca das caçapas: do canto até o fim da tabela (canto) e meia boca (meio)
  const HEAD = TH * 0.75, FOOT = { x: TW / 2, y: TH / 4 }; // linha de saída (a branca sai daqui pra baixo) e marca do triângulo
  // cada tabela: a linha da borracha (a → b) e as pontas dos bicos que entram na caçapa (ja, jb)
  const RAILS = [];
  const rail = (a, b, ja, jb) => RAILS.push({ a, b, ja, jb });
  const J = 14, SJ = 12;
  rail([CM, 0], [TW - CM, 0], [CM - J, -J], [TW - CM + J, -J]);
  rail([CM, TH], [TW - CM, TH], [CM - J, TH + J], [TW - CM + J, TH + J]);
  rail([0, CM], [0, MY - SM], [-J, CM - J], [-SJ, MY - SM + 4]);
  rail([0, MY + SM], [0, TH - CM], [-SJ, MY + SM - 4], [-J, TH - CM + J]);
  rail([TW, CM], [TW, MY - SM], [TW + J, CM - J], [TW + SJ, MY - SM + 4]);
  rail([TW, MY + SM], [TW, TH - CM], [TW + SJ, MY + SM - 4], [TW + J, TH - CM + J]);
  const SEGS = [];
  const seg = ([ax, ay], [bx, by]) => SEGS.push({ ax, ay, dx: bx - ax, dy: by - ay, ll: (bx - ax) ** 2 + (by - ay) ** 2 });
  for (const r of RAILS) { seg(r.a, r.b); seg(r.a, r.ja); seg(r.b, r.jb); }
  // caçapas: centro, raio que engole a bola e o ponto pra onde a máquina mira
  const POCKETS = [
    { x: -7, y: -7, r: 16, ax: 5, ay: 5 }, { x: TW + 7, y: -7, r: 16, ax: TW - 5, ay: 5 },
    { x: -11, y: MY, r: 15, ax: -2, ay: MY }, { x: TW + 11, y: MY, r: 15, ax: TW + 2, ay: MY },
    { x: -7, y: TH + 7, r: 16, ax: 5, ay: TH - 5 }, { x: TW + 7, y: TH + 7, r: 16, ax: TW - 5, ay: TH - 5 },
  ];

  // ---------- física ----------
  const TICK = 1 / 120, VMAX = 1500;
  const FR_A = 115, FR_B = 0.45;      // atrito: freio fixo + um pouco proporcional à velocidade
  const E_BALL = 0.95, E_RAIL = 0.76; // quanto sobra da velocidade na batida entre bolas e na tabela
  const nearEdge = b => b.x < R + 2 || b.x > TW - R - 2 || b.y < R + 2 || b.y > TH - R - 2;

  function pot(b, ev) {
    let best = 0, bd = Infinity;
    POCKETS.forEach((p, i) => { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; best = i; } });
    b.on = false; b.vx = b.vy = 0;
    ev.potted.push(b.n); ev.pockets?.push(best);
  }
  // um passo de 1/120 s, dividido em pedaços curtos o bastante pra bola rápida não atravessar outra.
  // ev junta o que aconteceu: primeira bola que a branca tocou, bolas encaçapadas e batidas (pro som)
  function step(balls, ev) {
    let vmax = 0;
    for (const b of balls) if (b.on && (b.vx || b.vy)) vmax = Math.max(vmax, Math.hypot(b.vx, b.vy));
    if (!vmax) return false;
    const n = Math.max(1, Math.ceil((vmax * TICK) / (R * 0.4))), h = TICK / n;
    for (let k = 0; k < n; k++) {
      for (const b of balls) if (b.on) { b.x += b.vx * h; b.y += b.vy * h; }
      // bola com bola (massas iguais)
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (!a.on) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (!b.on) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 >= D * D || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (D - d) / 2;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel <= 0) continue;
          const imp = ((1 + E_BALL) / 2) * rel;
          a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
          if (ev.first == null && (a.n === 0 || b.n === 0)) ev.first = a.n === 0 ? b.n : a.n;
          ev.hits?.push(rel);
        }
      }
      // tabelas, bicos e caçapas (só pra bola perto da borda)
      for (const b of balls) {
        if (!b.on || !nearEdge(b)) continue;
        for (const s of SEGS) {
          let t = ((b.x - s.ax) * s.dx + (b.y - s.ay) * s.dy) / s.ll;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = s.ax + s.dx * t, cy = s.ay + s.dy * t, ox = b.x - cx, oy = b.y - cy, d2 = ox * ox + oy * oy;
          if (d2 >= R * R || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = ox / d, ny = oy / d, vn = b.vx * nx + b.vy * ny;
          b.x = cx + nx * R; b.y = cy + ny * R;
          if (vn < 0) { b.vx -= (1 + E_RAIL) * vn * nx; b.vy -= (1 + E_RAIL) * vn * ny; ev.rails?.push(-vn); }
        }
        // passou da linha das tabelas: só dá pra estar na boca de uma caçapa
        if (b.x < -3 || b.x > TW + 3 || b.y < -3 || b.y > TH + 3 || POCKETS.some(p => (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < p.r * p.r)) pot(b, ev);
      }
      for (const b of balls) {
        if (!b.on || (!b.vx && !b.vy)) continue;
        const s = Math.hypot(b.vx, b.vy), ns = s - (FR_A + FR_B * s) * h;
        if (ns <= 0) b.vx = b.vy = 0; else { b.vx *= ns / s; b.vy *= ns / s; }
      }
    }
    return true;
  }
  const copyBalls = balls => balls.map(b => ({ n: b.n, x: b.x, y: b.y, vx: b.vx, vy: b.vy, on: b.on }));
  // tacada inteira, do toque até tudo parar (a máquina testa as tacadas com isso)
  function simulate(balls, angle, power) {
    const bs = copyBalls(balls), cue = bs.find(b => b.n === 0);
    cue.vx = Math.cos(angle) * power * VMAX; cue.vy = Math.sin(angle) * power * VMAX;
    const ev = { first: null, potted: [] };
    for (let i = 0; i < 20 / TICK && step(bs, ev); i++);
    return { balls: bs, first: ev.first, potted: ev.potted };
  }

  // ---------- bolas ----------
  // triângulo com a ponta na marca e a 8 no meio; nos dois cantos de trás, uma lisa e uma listrada
  function rack(rnd = Math.random) {
    const others = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const solidCorner = others.splice(others.findIndex(n => n < 8), 1)[0], stripeCorner = others.splice(others.findIndex(n => n > 8), 1)[0];
    const balls = [{ n: 0, x: TW / 2, y: HEAD + 50, vx: 0, vy: 0, on: true }];
    const gap = D + 0.4, rowH = gap * Math.sqrt(3) / 2;
    for (let r = 0; r < 5; r++) for (let i = 0; i <= r; i++) {
      let n;
      if (r === 0) n = 1;
      else if (r === 2 && i === 1) n = 8;
      else if (r === 4 && i === 0) n = rnd() < 0.5 ? solidCorner : stripeCorner;
      else if (r === 4 && i === 4) n = balls.some(b => b.n === solidCorner) ? stripeCorner : solidCorner;
      else n = others.pop();
      balls.push({ n, x: FOOT.x + (i - r / 2) * gap, y: FOOT.y - r * rowH, vx: 0, vy: 0, on: true });
    }
    return balls;
  }
  const type = n => (n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe');
  const GROUP_NAME = { solid: 'Lisas', stripe: 'Listradas' };
  const onTable = balls => new Set(balls.filter(b => b.on).map(b => b.n));
  const leftOf = (set, g) => [...set].filter(n => n && n !== 8 && type(n) === g).length;
  // pode bater primeiro nessa bola? (na saída, em qualquer uma)
  function legalFirst(n, group, set, isBreak) {
    if (isBreak) return true;
    if (!group) return n !== 8;
    return leftOf(set, group) ? type(n) === group : n === 8;
  }
  // lugar livre pra pôr uma bola (a branca na mão, a 8 de volta na marca)
  const freeAt = (balls, x, y, skip = -1) => x >= R && x <= TW - R && y >= R && y <= TH - R && balls.every(b => !b.on || b.n === skip || Math.hypot(b.x - x, b.y - y) > D + 0.5);
  function spot(balls, x, y, skip) {
    for (let k = 0; k < 80; k++) for (const s of [-1, 1]) { const yy = y + s * k * 3; if (freeAt(balls, x, yy, skip)) return { x, y: yy }; }
    return { x, y };
  }

  // ---------- regras do 8 Ball ----------
  // st = { groups: { me, cpu }, isBreak }; shot = { first, potted }; before = números na mesa antes da tacada.
  // Devolve falta (texto), quem venceu a mesa, a divisão dos grupos, se continua jogando e as bolas que contam ponto.
  function judge(st, who, shot, before) {
    const other = who === 'me' ? 'cpu' : 'me';
    const obj = shot.potted.filter(n => n !== 0), cuePot = shot.potted.includes(0), eight = obj.includes(8);
    let group = st.groups[who], assign = null, foul = null;
    const ownLeft = group ? leftOf(before, group) : -1;
    if (cuePot) foul = 'Bola branca na caçapa';
    else if (shot.first == null) foul = 'Não acertou nenhuma bola';
    else if (!legalFirst(shot.first, group, before, st.isBreak)) foul = ownLeft === 0 ? 'Tinha que bater primeiro na 8' : shot.first === 8 ? 'Bateu primeiro na bola 8' : 'Bateu primeiro na bola do adversário';
    if (eight && !st.isBreak) {
      const won = group && ownLeft === 0 && !foul;
      return { foul, win: won ? who : other, reason: won ? null : foul ? 'Encaçapou a 8 com falta' : 'Encaçapou a 8 antes da hora', assign, keep: false, scored: [], respot8: false };
    }
    // mesa aberta: o primeiro grupo encaçapado (fora a saída) vira o seu
    if (!group && !st.isBreak && !foul) {
      const firstObj = obj.find(n => n !== 8);
      if (firstObj) { group = type(firstObj); assign = { [who]: group, [other]: group === 'solid' ? 'stripe' : 'solid' }; }
    }
    const scored = foul || !group ? [] : obj.filter(n => n !== 8 && type(n) === group);
    const keep = !foul && (st.isBreak ? obj.length > 0 : scored.length > 0);
    return { foul, win: null, reason: null, assign, keep, scored, respot8: eight && st.isBreak };
  }

  // ---------- máquina ----------
  const LEVELS = [['Iniciante', 2.4], ['Amador', 1.6], ['Bom', 1.05], ['Profissional', 0.7], ['Mestre', 0.45], ['Lenda', 0.28]]; // erro de mira (graus)
  const clearPath = (balls, ax, ay, bx, by, skip) => {
    const dx = bx - ax, dy = by - ay, ll = dx * dx + dy * dy || 1;
    return balls.every(b => {
      if (!b.on || skip.includes(b.n)) return true;
      let t = ((b.x - ax) * dx + (b.y - ay) * dy) / ll;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(b.x - ax - dx * t, b.y - ay - dy * t) > D - 0.5;
    });
  };
  const gauss = rnd => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  // tacada de encaçapar: a branca vai até a "bola fantasma" (encostada na bola, do lado oposto à caçapa)
  function potLines(balls, cue, targets) {
    const out = [];
    for (const t of targets) POCKETS.forEach(p => {
      const dx = p.ax - t.x, dy = p.ay - t.y, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
      const gx = t.x - ux * D, gy = t.y - uy * D, cx = gx - cue.x, cy = gy - cue.y, cl = Math.hypot(cx, cy);
      if (cl < 1) return;
      const cut = Math.acos(Math.max(-1, Math.min(1, (cx * ux + cy * uy) / cl)));
      if (cut > 1.35) return; // mais de ~77°: corte fino demais
      if (!clearPath(balls, t.x, t.y, p.ax, p.ay, [t.n, 0]) || !clearPath(balls, cue.x, cue.y, gx, gy, [t.n, 0])) return;
      out.push({ t, p, gx, gy, ux, uy, angle: Math.atan2(cy, cx), cut, d1: cl, d2: dl });
    });
    return out;
  }
  // bola na mão: põe a branca atrás de uma bola, em linha reta com a caçapa
  function placeCue(balls, targets, rnd) {
    const cue = balls.find(b => b.n === 0);
    let best = null, bv = -Infinity;
    for (const t of targets) POCKETS.forEach(p => {
      const dx = p.ax - t.x, dy = p.ay - t.y, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
      if (!clearPath(balls, t.x, t.y, p.ax, p.ay, [t.n, 0])) return;
      for (const k of [45, 70, 100]) {
        const x = t.x - ux * (D + k), y = t.y - uy * (D + k);
        if (x < R + 4 || x > TW - R - 4 || y < R + 4 || y > TH - R - 4 || !freeAt(balls, x, y, 0)) continue;
        if (!clearPath(balls, x, y, t.x - ux * D, t.y - uy * D, [t.n, 0])) continue;
        const v = -dl * 0.05 - Math.abs(k - 60) * 0.1 + rnd();
        if (v > bv) { bv = v; best = { x, y }; }
      }
    });
    if (!best) for (let i = 0; i < 200 && !best; i++) { const x = R + rnd() * (TW - D), y = R + rnd() * (TH - D); if (freeAt(balls, x, y, 0)) best = { x, y }; }
    if (best) { cue.x = best.x; cue.y = best.y; cue.on = true; }
    return best;
  }
  // escolhe a tacada: gera as linhas de encaçapar, testa cada uma na simulação e fica com a melhor;
  // depois erra a mira um pouco (menos a cada nível). Sem jogada boa, joga uma tacada segura (sem falta).
  function plan(balls, st, level, rnd = Math.random) {
    const bs = copyBalls(balls), set = onTable(bs), group = st.groups.cpu;
    const targets = bs.filter(b => b.on && b.n && legalFirst(b.n, group, set, false));
    const place = st.inHand ? placeCue(bs, targets, rnd) : null;
    const cue = bs.find(b => b.n === 0);
    const tries = [];
    for (const l of potLines(bs, cue, targets)) {
      const pw = Math.min(0.95, 0.24 + (l.d1 + l.d2 * 1.5) / 1500 + l.cut * 0.12);
      tries.push({ angle: l.angle, power: pw, cut: l.cut }, { angle: l.angle, power: Math.min(1, pw * 1.3), cut: l.cut });
    }
    // seguras: bater direto numa bola do grupo, devagar
    for (const t of targets) { const a = Math.atan2(t.y - cue.y, t.x - cue.x); tries.push({ angle: a, power: 0.32, cut: 1, safe: true }, { angle: a, power: 0.5, cut: 1, safe: true }); }
    const score = (angle, power) => {
      const r = simulate(bs, angle, power), j = judge({ groups: st.groups, isBreak: false }, 'cpu', r, set);
      if (j.win === 'cpu') return 5000;
      if (j.win === 'me') return -5000;
      if (j.foul) return -400;
      return j.keep ? 400 + j.scored.length * 60 : 0;
    };
    const err = (LEVELS[level][1] * Math.PI) / 180;
    let best = null;
    const test = list => {
      for (const t of list) {
        let v = score(t.angle, t.power) - t.cut * 40;
        // tacada boa: confere se ainda dá certo errando um pouco a mira (prefere as mais seguras)
        if (v > 200) { const e = Math.max(err, 0.006) * 1.5; v += (score(t.angle + e, t.power * 0.97) + score(t.angle - e, t.power * 1.03)) / 2; }
        if (!best || v > best.v) best = { ...t, v };
      }
    };
    test([...tries.filter(t => !t.safe).slice(0, 70), ...tries.filter(t => t.safe)]);
    // sinucada (nenhuma bola dá pra acertar direto): procura uma tabela que chegue numa bola certa sem falta
    if (!best || best.v < 0) test(Array.from({ length: 96 }, (_, i) => ({ angle: (i / 48) * Math.PI, power: i % 2 ? 0.55 : 0.38, cut: 1 })));
    if (!best) best = { angle: rnd() * Math.PI * 2, power: 0.5, v: 0 };
    return { place, angle: best.angle + gauss(rnd) * err, power: Math.max(0.12, Math.min(1, best.power * (1 + gauss(rnd) * 0.012 * LEVELS[level][1]))), value: best.v };
  }

  const engine = { TW, TH, R, D, HEAD, FOOT, POCKETS, RAILS, TICK, VMAX, LEVELS, step, simulate, rack, judge, plan, legalFirst, onTable, leftOf, type, spot, freeAt };

  GAMES.sinuca = {
    name: 'Sinuca', icon: 'sinuca', hue: 152,
    desc: 'Sinuca de 8 bolas contra a máquina, no estilo 8 Ball Pool. Arraste na mesa pra mirar e puxe o taco (barra da direita) pra dar a força. Encaçape o seu grupo (lisas ou listradas) e depois a 8. Cada mesa vencida deixa a máquina melhor; perdeu, acabou.',
    better: 'high', unit: 'pontos', phaser: true, engine,
    start(el, done) {
      const W = 420, H = 724, RW = 24, X0 = 16 + RW, Y0 = 68 + RW;
      const BAR = { x: 354, y: Y0, w: 46, h: TH }, FINE = { x: 16, y: Y0 + TH + RW + 12, w: TW + RW * 2, h: 30 };
      el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Mesas<b id="w">0</b></span><span class="stat">Máquina<b id="l">Iniciante</b></span></div><div class="phaser-wrap" id="pw"></div>';
      const hud = { p: el.querySelector('#p'), w: el.querySelector('#w'), l: el.querySelector('#l') };
      const COLORS = ['#f4f1e6', '#f2b705', '#1d4fc4', '#d9262f', '#6b2fb3', '#ee7a12', '#178a46', '#7d1b22', '#141414'];
      const colorOf = n => COLORS[n > 8 ? n - 8 : n];
      return mountPhaser(el.querySelector('#pw'), W, H, {
        create() {
          const scene = this, art = artKit(this);
          let balls, st, phase = 'aim', turn = 'me', level = 0, pts = 0, wins = 0, potsTotal = 0, rackNo = 0;
          let aim = -Math.PI / 2, power = 0, inHand = false, kitchen = false, drag = null, charging = false;
          let ev = null, before = null, acc = 0, pending = 0, shotsMe = 0, foulsMe = 0, alive = true, lastHit = 0;

          // ---------- arte ----------
          this.add.image(0, 0, art.backdrop('sn_bg', W, H, '#0f2a20', '#050c09', { grid: 30 })).setOrigin(0).setDisplaySize(W, H);
          const OW = TW + RW * 2, OH = TH + RW * 2;
          art.tex('sn_table', OW + 12, OH + 12, c => {
            const o = 6, fx = o + RW, fy = o + RW, P = ([x, y]) => [fx + x, fy + y];
            // sombra da mesa no chão
            c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
            art.rr(c, o, o, OW, OH, 18); c.fillStyle = '#3b200c'; c.fill();
            c.shadowColor = 'transparent';
            // madeira com veios
            art.rr(c, o, o, OW, OH, 18); c.fillStyle = art.lin(c, 0, o, OW, o + OH, [[0, '#9a6332'], [0.35, '#7a4720'], [0.7, '#8a5428'], [1, '#5a3013']]); c.fill();
            c.save(); art.rr(c, o, o, OW, OH, 18); c.clip();
            for (let i = 0; i < 90; i++) {
              const vert = i % 2, p = Math.random();
              c.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,18,4' : '190,130,70'},${0.08 + Math.random() * 0.12})`; c.lineWidth = 0.6 + Math.random();
              c.beginPath();
              if (vert) { const x = o + p * OW; c.moveTo(x, o); c.bezierCurveTo(x + 4, o + OH * 0.3, x - 4, o + OH * 0.6, x + 2, o + OH); }
              else { const y = o + p * OH; c.moveTo(o, y); c.bezierCurveTo(o + OW * 0.3, y + 3, o + OW * 0.6, y - 3, o + OW, y + 1); }
              c.stroke();
            }
            c.restore();
            c.lineWidth = 2; c.strokeStyle = 'rgba(255,214,160,.35)'; art.rr(c, o + 1.5, o + 1.5, OW - 3, OH - 3, 17); c.stroke();
            c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.5)'; art.rr(c, o + 0.5, o + 0.5, OW - 1, OH - 1, 18); c.stroke();
            // sombra da borda de madeira em cima do pano
            c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(fx - 10, fy - 10, TW + 20, TH + 20);
            // caçapas, parte 1: aro de couro na madeira e a boca escura entre os bicos
            for (const p of POCKETS) {
              const [x, y] = P([p.x, p.y]);
              art.ell(c, x, y, 17, 17); c.fillStyle = art.lin(c, x, y - 17, x, y + 17, [[0, '#4a3524'], [1, '#170e07']]); c.fill();
              art.ell(c, x, y, 16.5, 16.5); c.strokeStyle = 'rgba(255,220,170,.22)'; c.lineWidth = 1; c.stroke();
            }
            for (const r of RAILS) for (const [q, end] of [[r.a, r.ja], [r.b, r.jb]]) {
              const pk = POCKETS.reduce((m, p) => (Math.hypot(p.x - end[0], p.y - end[1]) < Math.hypot(m.x - end[0], m.y - end[1]) ? p : m));
              c.beginPath(); c.moveTo(...P(q)); c.lineTo(...P(end)); c.lineTo(...P([pk.x, pk.y])); c.lineTo(...P([pk.ax, pk.ay])); c.closePath(); c.fillStyle = '#0b0b0b'; c.fill();
            }
            // pano: mais claro no meio (luz em cima da mesa), textura de feltro
            c.fillStyle = art.rad(c, fx + TW / 2, fy + TH / 2, 20, TH * 0.62, [[0, '#2fae6c'], [0.55, '#1c8a50'], [1, '#106038']]);
            c.fillRect(fx, fy, TW, TH);
            for (let i = 0; i < 2600; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; c.fillRect(fx + Math.random() * TW, fy + Math.random() * TH, 1, 1); }
            // linha de saída e marca do triângulo
            c.setLineDash([3, 4]); c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(fx + 2, fy + HEAD); c.lineTo(fx + TW - 2, fy + HEAD); c.stroke(); c.setLineDash([]);
            art.ell(c, fx + FOOT.x, fy + FOOT.y, 1.8, 1.8); c.fillStyle = 'rgba(255,255,255,.3)'; c.fill();
            art.ell(c, fx + TW / 2, fy + HEAD, 1.8, 1.8); c.fill();
            // borrachas (tabelas): faixa verde mais escura com o bico em ângulo na boca das caçapas
            for (const r of RAILS) {
              const dep = (q, end) => { const k = 8 / (Math.abs(end[0] - q[0]) === J || Math.abs(end[1] - q[1]) === J ? J : SJ); return [q[0] + (end[0] - q[0]) * k, q[1] + (end[1] - q[1]) * k]; };
              const pa = dep(r.a, r.ja), pb = dep(r.b, r.jb);
              const horiz = r.a[1] === r.b[1], sx = horiz ? 0 : Math.sign(pa[0] - r.a[0]), sy = horiz ? Math.sign(pa[1] - r.a[1]) : 0;
              const [ax, ay] = P(r.a);
              c.beginPath(); [r.a, r.b, pb, pa].map(P).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
              c.fillStyle = art.lin(c, ax, ay, ax + sx * 8, ay + sy * 8, [[0, '#23985a'], [0.35, '#16743f'], [1, '#0b4626']]); c.fill();
              c.beginPath(); c.moveTo(...P(r.a)); c.lineTo(...P(r.b)); c.strokeStyle = 'rgba(160,255,200,.28)'; c.lineWidth = 1; c.stroke();
            }
            // marcas (diamantes) de madrepérola
            const diamond = (x, y) => { c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x + 2.2, y); c.lineTo(x, y + 3); c.lineTo(x - 2.2, y); c.closePath(); c.fillStyle = art.lin(c, x, y - 3, x, y + 3, [[0, '#fffaf0'], [1, '#c9bfa8']]); c.fill(); };
            for (let k = 1; k < 8; k++) if (k !== 4) { diamond(fx - 16, fy + (TH * k) / 8); diamond(fx + TW + 16, fy + (TH * k) / 8); }
            for (let k = 1; k < 4; k++) { diamond(fx + (TW * k) / 4, fy - 16); diamond(fx + (TW * k) / 4, fy + TH + 16); }
            // caçapas, parte 2: o buraco
            for (const p of POCKETS) {
              const [x, y] = P([p.x, p.y]);
              art.ell(c, x, y, 13.5, 13.5); c.fillStyle = art.rad(c, x, y + 2, 2, 14, [[0, '#000'], [0.7, '#070707'], [1, '#262626']]); c.fill();
            }
          });
          this.add.image(X0 - RW - 6, Y0 - RW - 6, 'sn_table').setOrigin(0).setDisplaySize(OW + 12, OH + 12);

          // bolas: a base (cor, faixa e número) gira quando a bola anda; o brilho e a sombra ficam parados
          const BS = D + 2;
          for (let n = 0; n <= 15; n++) art.tex('sn_b' + n, BS, BS, c => {
            const x = BS / 2, y = BS / 2;
            c.save(); art.ell(c, x, y, R, R); c.clip();
            if (n > 8) { c.fillStyle = COLORS[0]; c.fillRect(0, 0, BS, BS); c.fillStyle = colorOf(n); c.fillRect(0, y - R * 0.56, BS, R * 1.12); }
            else { c.fillStyle = colorOf(n); c.fillRect(0, 0, BS, BS); }
            if (n) {
              art.ell(c, x, y, R * 0.52, R * 0.52); c.fillStyle = '#fbfaf3'; c.fill();
              c.fillStyle = '#111'; c.font = `700 ${n > 9 ? 5.4 : 6.6}px "Space Grotesk", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
              c.fillText(String(n), x, y + 0.5);
            } else { art.ell(c, x + 2.5, y - 1, 1.1, 1.1); c.fillStyle = '#d64545'; c.fill(); } // pontinho vermelho da branca
            c.restore();
          });
          art.tex('sn_gloss', BS, BS, c => {
            const x = BS / 2, y = BS / 2;
            art.ell(c, x, y, R, R); c.fillStyle = art.rad(c, x - R * 0.3, y - R * 0.35, R * 0.1, R * 1.15, [[0, 'rgba(255,255,255,.28)'], [0.5, 'rgba(255,255,255,0)'], [0.85, 'rgba(0,0,0,.22)'], [1, 'rgba(0,0,0,.55)']]); c.fill();
            art.ell(c, x - R * 0.34, y - R * 0.4, R * 0.32, R * 0.2, -0.6); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill();
          });
          art.tex('sn_shadow', BS + 6, BS + 6, c => { const x = (BS + 6) / 2; art.ell(c, x, x, R + 2, R + 1.5); c.fillStyle = art.rad(c, x, x, 1, R + 2.5, [[0, 'rgba(0,0,0,.5)'], [0.7, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,0)']]); c.fill(); });
          // taco: ponta azul de giz, anel branco, madeira clara, junta de metal, cabo escuro com empunhadura
          const LC = 300;
          art.tex('sn_cue', LC, 12, c => {
            const half = x => 2.4 + (x / LC) * 2.8, mid = 6;
            const shape = () => { c.beginPath(); c.moveTo(0, mid - half(0)); c.lineTo(LC - 2, mid - half(LC)); c.quadraticCurveTo(LC, mid, LC - 2, mid + half(LC)); c.lineTo(0, mid + half(0)); c.closePath(); };
            c.save(); shape(); c.clip();
            const band = (a, b, col) => { c.fillStyle = col; c.fillRect(a, 0, b - a, 12); };
            band(0, 3, '#3f6fd0'); band(3, 10, '#f3efe4');
            c.fillStyle = art.lin(c, 10, 0, 175, 0, [[0, '#f0d9a8'], [1, '#d4a865']]); c.fillRect(10, 0, 165, 12);
            band(175, 179, '#c8ccd4'); band(179, 232, '#4a220d');
            c.fillStyle = '#e8d5a0';
            for (let k = 0; k < 4; k++) { const x = 186 + k * 11; c.beginPath(); c.moveTo(x, mid); c.lineTo(x + 6, mid - 3); c.lineTo(x + 12, mid); c.lineTo(x + 6, mid + 3); c.closePath(); c.fill(); }
            band(232, 280, '#1b1b1f');
            c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 0.8; for (let x = 234; x < 280; x += 3) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 2, 12); c.stroke(); }
            band(280, 296, '#5a2a10'); band(296, LC, '#111');
            c.fillStyle = art.lin(c, 0, mid - 5, 0, mid + 5, [[0, 'rgba(255,255,255,.45)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.45)']]); c.fillRect(0, 0, LC, 12);
            c.restore();
          });
          // barra de força: trilho com degradê verde → amarelo → vermelho
          art.tex('sn_power', BAR.w, BAR.h, c => {
            art.rr(c, 0, 0, BAR.w, BAR.h, 14); c.fillStyle = art.lin(c, 0, 0, 0, BAR.h, [[0, '#2fe08a'], [0.55, '#ffd34d'], [1, '#ff4d5e']]); c.fill();
            art.rr(c, 3, 3, BAR.w * 0.32, BAR.h - 6, 10); c.fillStyle = 'rgba(255,255,255,.22)'; c.fill();
          });
          const bar = this.add.graphics();
          bar.fillStyle(0x07130e, 0.85).fillRoundedRect(BAR.x, BAR.y, BAR.w, BAR.h, 14).lineStyle(2, 0x2f6b51, 0.9).strokeRoundedRect(BAR.x, BAR.y, BAR.w, BAR.h, 14);
          for (let k = 1; k < 10; k++) bar.lineStyle(1, 0xffffff, 0.08).lineBetween(BAR.x + 8, BAR.y + (BAR.h * k) / 10, BAR.x + BAR.w - 8, BAR.y + (BAR.h * k) / 10);
          const powerFill = this.add.image(BAR.x, BAR.y, 'sn_power').setOrigin(0).setDisplaySize(BAR.w, BAR.h);
          const barCue = this.add.image(BAR.x + BAR.w / 2, BAR.y + 8, 'sn_cue').setOrigin(0, 0.5).setDisplaySize(BAR.h * 0.6, 10).setRotation(Math.PI / 2);
          const label = (x, y, t, size = 11, color = '#cfe9dc') => this.add.text(x, y, t, { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: size + 'px', fontStyle: 'bold', color }).setOrigin(0.5);
          label(BAR.x + BAR.w / 2, BAR.y - 12, 'FORÇA', 10, '#8fc9ad');
          const pctText = label(BAR.x + BAR.w / 2, BAR.y + BAR.h + 14, '', 12, '#ffffff');
          // ajuste fino da mira (roda com ranhuras: arraste pro lado)
          const fine = this.add.graphics();
          label(FINE.x + FINE.w / 2, FINE.y + FINE.h + 9, 'ajuste fino da mira', 9, '#6f9c86');

          const table = this.add.container(X0, Y0);
          const aimG = this.add.graphics(), cueShadow = this.add.graphics();
          const sprites = [];
          const cueImg = this.add.image(0, 0, 'sn_cue').setOrigin(0, 0.5).setDisplaySize(LC, 12);
          const handRing = this.add.graphics();
          table.add([aimG]);

          // placar de cima: você × máquina, com as bolas que faltam de cada um
          const panels = ['me', 'cpu'].map((who, i) => {
            const x = 16 + i * 198, w = 190;
            const bg = this.add.graphics();
            const name = this.add.text(x + 12, 14, who === 'me' ? 'Você' : 'Máquina', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ffffff' });
            const sub = this.add.text(x + w - 12, 15, '', { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '11px', color: '#9fc7b4' }).setOrigin(1, 0);
            const minis = Array.from({ length: 8 }, (_, k) => {
              const bx = x + 17 + k * 22, by = 47;
              return { slot: this.add.graphics().lineStyle(1.2, 0xffffff, 0.18).strokeCircle(bx, by, 8), base: this.add.image(bx, by, 'sn_b1').setDisplaySize(16, 16), gloss: this.add.image(bx, by, 'sn_gloss').setDisplaySize(16, 16) };
            });
            return { who, x, w, bg, name, sub, minis };
          });

          const msgBg = this.add.graphics(), msg = label(X0 + TW / 2, Y0 + TH / 2, '', 15);
          let msgTimer = null;
          const say = (text, color = '#ffffff', ms = 1700) => {
            msg.setText(text).setColor(color).setAlpha(1);
            const w = msg.width + 28;
            msgBg.clear().fillStyle(0x06110c, 0.82).fillRoundedRect(X0 + TW / 2 - w / 2, Y0 + TH / 2 - 17, w, 34, 17).setAlpha(1);
            msgTimer?.remove();
            if (ms) msgTimer = this.time.delayedCall(ms, () => this.tweens.add({ targets: [msg, msgBg], alpha: 0, duration: 300 }));
          };

          // fim da mesa: painel com botão (Próxima mesa)
          const over = this.add.container(W / 2, H / 2).setVisible(false).setDepth(10);
          const ovBg = this.add.graphics().fillStyle(0x04100b, 0.92).fillRoundedRect(-150, -92, 300, 184, 20).lineStyle(2, 0x3ddc97, 0.7).strokeRoundedRect(-150, -92, 300, 184, 20);
          const ovTitle = label(0, -56, '', 20), ovSub = label(0, -22, '', 13, '#bfe6d2');
          const btn = this.add.graphics().fillStyle(0x2fd486, 1).fillRoundedRect(-90, 22, 180, 44, 22);
          const btnText = label(0, 44, 'Próxima mesa', 16, '#04140c');
          const btnZone = this.add.zone(0, 44, 180, 44).setInteractive({ useHandCursor: true });
          over.add([ovBg, ovTitle, ovSub, btn, btnText, btnZone]);
          btnZone.on('pointerdown', () => { if (phase === 'between') newRack(); });

          // ---------- mesa nova ----------
          const newRack = () => {
            rackNo++;
            balls = rack();
            st = { groups: { me: null, cpu: null }, isBreak: true };
            turn = 'me'; inHand = true; kitchen = true; shotsMe = 0; foulsMe = 0; power = 0; aim = -Math.PI / 2;
            sprites.forEach(s => { s.base.destroy(); s.gloss.destroy(); s.shadow.destroy(); });
            sprites.length = 0;
            for (const b of balls) {
              const shadow = this.add.image(0, 0, 'sn_shadow').setDisplaySize(BS + 6, BS + 6);
              const base = this.add.image(0, 0, 'sn_b' + b.n).setDisplaySize(BS, BS).setRotation(Math.random() * 6.28);
              const gloss = this.add.image(0, 0, 'sn_gloss').setDisplaySize(BS, BS);
              table.add([shadow, base, gloss]);
              sprites[b.n] = { shadow, base, gloss, ball: b };
            }
            table.bringToTop(aimG);
            over.setVisible(false);
            hud.l.textContent = LEVELS[level][0];
            phase = 'aim';
            say(rackNo === 1 ? 'Sua saída! Arraste a branca e mire' : `Mesa ${rackNo}: sua saída`, '#ffffff', 2200);
            renderPanels();
          };

          const ballOf = n => balls.find(b => b.n === n);
          const renderPanels = () => {
            const set = onTable(balls);
            for (const p of panels) {
              const g = st.groups[p.who], active = turn === p.who && phase !== 'between';
              p.bg.clear().fillStyle(active ? 0x123d2b : 0x0a1a13, 0.92).fillRoundedRect(p.x, 6, p.w, 56, 14)
                .lineStyle(active ? 2 : 1, active ? 0x3ddc97 : 0x24493a, active ? 1 : 0.8).strokeRoundedRect(p.x, 6, p.w, 56, 14);
              p.sub.setText(p.who === 'cpu' ? LEVELS[level][0] + (g ? ' · ' + GROUP_NAME[g] : '') : g ? GROUP_NAME[g] : 'Mesa aberta');
              const nums = g ? (g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]) : [];
              p.minis.forEach((m, k) => {
                const n = k < 7 ? nums[k] : 8;
                const show = n !== undefined && (k < 7 || (g && !leftOf(set, g)));
                m.base.setVisible(show); m.gloss.setVisible(show);
                if (show) { m.base.setTexture('sn_b' + n); const a = set.has(n) ? 1 : 0.18; m.base.setAlpha(a); m.gloss.setAlpha(a); }
                m.slot.setVisible(k < 7);
              });
            }
          };

          // ---------- tacada ----------
          const shoot = (angle, pw) => {
            const cue = ballOf(0);
            cue.vx = Math.cos(angle) * pw * VMAX; cue.vy = Math.sin(angle) * pw * VMAX;
            ev = { first: null, potted: [], pockets: [], hits: [], rails: [] };
            before = onTable(balls);
            acc = 0; phase = 'roll'; power = 0; drag = null; charging = false; inHand = false;
            if (turn === 'me') shotsMe++;
            noise(70, 0.05 + pw * 0.1, 2600); beep(140 + pw * 120, 40, 'triangle', 0.04);
            renderPanels();
          };
          const potAnim = (n, pk) => {
            const s = sprites[n], p = POCKETS[pk];
            pending++;
            this.tweens.add({ targets: [s.base, s.gloss], x: p.x, y: p.y, scale: s.base.scale * 0.55, alpha: 0, duration: 200, ease: 'Quad.In', onComplete: () => { pending--; } });
            s.shadow.setVisible(false);
            sweep(520, 160, 220, 'sine', 0.05); buzz(12);
          };
          const restore = n => {
            const s = sprites[n];
            this.tweens.killTweensOf([s.base, s.gloss]);
            s.base.setAlpha(1).setDisplaySize(BS, BS); s.gloss.setAlpha(1).setDisplaySize(BS, BS); s.shadow.setVisible(true);
          };
          const endShot = () => {
            const who = turn, res = judge(st, who, ev, before);
            st.isBreak = false;
            if (res.assign) { st.groups = res.assign; say(who === 'me' ? `Você ficou com as ${GROUP_NAME[res.assign.me].toLowerCase()}` : `A máquina ficou com as ${GROUP_NAME[res.assign.cpu].toLowerCase()}`, '#ffd34d'); }
            if (who === 'me' && res.scored.length) {
              const gain = res.scored.length * 10;
              pts += gain; potsTotal += res.scored.length; hud.p.textContent = pts;
              const b = ballOf(res.scored[0]);
              floatText(this, X0 + b.x, Y0 + b.y - 8, '+' + gain, '#7cffb0'); sfx.good();
            }
            if (res.respot8) { const b = ballOf(8), p = spot(balls, FOOT.x, FOOT.y, 8); Object.assign(b, p, { on: true, vx: 0, vy: 0 }); restore(8); say('A 8 caiu na saída: volta pra marca', '#ffd34d'); }
            if (res.win) return rackOver(res.win, res.reason);
            const cue = ballOf(0);
            if (!cue.on) { Object.assign(cue, spot(balls, TW / 2, HEAD + 40, 0), { on: true, vx: 0, vy: 0 }); restore(0); }
            if (res.foul) {
              if (who === 'me') foulsMe++;
              say(`Falta: ${res.foul.toLowerCase()}. ${who === 'me' ? 'Bola na mão da máquina' : 'Bola na mão pra você'}`, '#ff8a8a', 2200);
              sfx.bad();
            }
            turn = res.keep ? who : who === 'me' ? 'cpu' : 'me';
            inHand = !!res.foul; kitchen = false;
            if (!res.foul && !res.assign && !res.keep && turn === 'me') say('Sua vez', '#ffffff', 1100);
            renderPanels();
            if (turn === 'me') { phase = 'aim'; aimAtNearest(); } else cpuTurn();
          };
          const rackOver = (winner, reason) => {
            phase = 'between'; renderPanels();
            if (winner === 'me') {
              const bonus = 100 + Math.max(0, 15 - shotsMe) * 10 + (foulsMe ? 0 : 50);
              pts += bonus; wins++; hud.p.textContent = pts; hud.w.textContent = wins;
              const next = Math.min(LEVELS.length - 1, level + 1);
              ovTitle.setText('Você venceu a mesa!').setColor('#7cffb0');
              ovSub.setText(`+${bonus} pontos${foulsMe ? '' : ' (sem falta!)'}\nPróxima máquina: ${LEVELS[next][0]}`);
              level = next;
              sfx.record();
              over.setVisible(true).setScale(0.85).setAlpha(0);
              this.tweens.add({ targets: over, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
            } else {
              alive = false;
              ovTitle.setText('A máquina venceu').setColor('#ff8a8a');
              ovSub.setText((reason ? (turn === 'me' ? `Você: ${reason.toLowerCase()}` : `Máquina: ${reason.toLowerCase()}`) + '\n' : '') + 'Fim de jogo');
              btn.setVisible(false); btnText.setVisible(false); btnZone.disableInteractive();
              over.setVisible(true);
              sfx.bad();
              summarize([['Mesas vencidas', wins], ['Bolas encaçapadas', potsTotal], ['Máquina', LEVELS[level][0]]]);
              this.time.delayedCall(1900, () => done(pts));
            }
          };

          // ---------- vez da máquina ----------
          const cpuTurn = () => {
            phase = 'cpu';
            this.time.delayedCall(inHand ? 900 : 650, () => {
              if (!alive) return;
              const p = plan(balls, { groups: st.groups, inHand }, level);
              const go = () => {
                const view = { a: aim };
                const target = aim + Math.atan2(Math.sin(p.angle - aim), Math.cos(p.angle - aim));
                this.tweens.add({
                  targets: view, a: target, duration: 500 + Math.random() * 400, ease: 'Sine.InOut', onUpdate: () => { aim = view.a; },
                  onComplete: () => {
                    const pull = { v: 0 };
                    this.tweens.add({ targets: pull, v: p.power, duration: 380, delay: 220, ease: 'Sine.Out', onUpdate: () => { power = pull.v; }, onComplete: () => this.time.delayedCall(120, () => alive && shoot(p.angle, p.power)) });
                  },
                });
              };
              if (p.place) {
                const cue = ballOf(0), s = sprites[0], from = { x: cue.x, y: cue.y };
                Object.assign(cue, from);
                this.tweens.add({ targets: from, x: p.place.x, y: p.place.y, duration: 450, ease: 'Sine.InOut', onUpdate: () => { cue.x = from.x; cue.y = from.y; }, onComplete: () => { inHand = false; go(); } });
                s.base.setAlpha(1);
              } else go();
            });
          };

          // ---------- mira e controles ----------
          const aimAtNearest = () => {
            const cue = ballOf(0), set = onTable(balls);
            let best = null, bd = Infinity;
            for (const b of balls) if (b.on && b.n && legalFirst(b.n, st.groups.me, set, st.isBreak)) { const d = Math.hypot(b.x - cue.x, b.y - cue.y); if (d < bd) { bd = d; best = b; } }
            if (best) aim = Math.atan2(best.y - cue.y, best.x - cue.x);
          };
          const local = p => ({ x: p.x - X0, y: p.y - Y0 });
          const inBox = (p, b, pad = 0) => p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
          const aimTo = q => { const cue = ballOf(0); if (Math.hypot(q.x - cue.x, q.y - cue.y) > 4) aim = Math.atan2(q.y - cue.y, q.x - cue.x); };
          const canPlace = (x, y) => freeAt(balls, x, y, 0) && (!kitchen || y >= HEAD + R);
          this.input.on('pointerdown', p => {
            if (phase !== 'aim' || turn !== 'me') return;
            if (inBox(p, BAR, 10)) { drag = { kind: 'power', y0: p.y }; return; }
            if (inBox(p, FINE, 6)) { drag = { kind: 'fine', x: p.x }; return; }
            if (p.x > X0 - RW - 10 && p.x < X0 + TW + RW + 10 && p.y > Y0 - RW - 10 && p.y < Y0 + TH + RW + 10) {
              const q = local(p), cue = ballOf(0);
              if (inHand && Math.hypot(q.x - cue.x, q.y - cue.y) < 26) { drag = { kind: 'cue', dx: cue.x - q.x, dy: cue.y - q.y }; return; }
              drag = { kind: 'aim' }; aimTo(q);
            }
          });
          this.input.on('pointermove', p => {
            if (!drag || phase !== 'aim') return;
            if (drag.kind === 'power') power = Phaser.Math.Clamp((p.y - drag.y0) / (BAR.h * 0.75), 0, 1);
            else if (drag.kind === 'fine') { aim += (p.x - drag.x) * 0.0022; drag.x = p.x; }
            else if (drag.kind === 'aim') aimTo(local(p));
            else if (drag.kind === 'cue') {
              const q = local(p), cue = ballOf(0);
              const x = Phaser.Math.Clamp(q.x + drag.dx, R, TW - R), y = Phaser.Math.Clamp(q.y + drag.dy, kitchen ? HEAD + R : R, TH - R);
              if (canPlace(x, y)) { cue.x = x; cue.y = y; }
            }
          });
          const release = () => {
            if (drag?.kind === 'power' && phase === 'aim') { if (power > 0.02) shoot(aim, power); else power = 0; }
            drag = null;
          };
          this.input.on('pointerup', release);
          this.input.on('pointerupoutside', release);
          const keys = this.input.keyboard.addKeys('LEFT,RIGHT,A,D,SHIFT,SPACE,ENTER');
          this.input.keyboard.addCapture('LEFT,RIGHT,SPACE');
          this.input.keyboard.on('keydown', e => {
            if ((e.key === ' ' || e.key === 'Enter') && phase === 'between' && alive) { newRack(); return; }
            if (e.key === ' ' && !e.repeat && phase === 'aim' && turn === 'me') { charging = true; power = 0; }
          });
          this.input.keyboard.on('keyup', e => { if (e.key === ' ' && charging) { charging = false; if (phase === 'aim' && power > 0.02) shoot(aim, power); else power = 0; } });

          // ---------- desenho ----------
          const ray = (ox, oy, a) => {
            const dx = Math.cos(a), dy = Math.sin(a);
            let t = Infinity, hit = null;
            for (const b of balls) {
              if (!b.on || !b.n) continue;
              const fx = ox - b.x, fy = oy - b.y, bq = fx * dx + fy * dy, cq = fx * fx + fy * fy - D * D, disc = bq * bq - cq;
              if (disc < 0) continue;
              const tt = -bq - Math.sqrt(disc);
              if (tt > 0 && tt < t) { t = tt; hit = b; }
            }
            let tw = Infinity, nx = 0, ny = 0;
            const wall = (tt, x, y) => { if (tt > 0 && tt < tw) { tw = tt; nx = x; ny = y; } };
            if (dx < 0) wall((R - ox) / dx, 1, 0); if (dx > 0) wall((TW - R - ox) / dx, -1, 0);
            if (dy < 0) wall((R - oy) / dy, 0, 1); if (dy > 0) wall((TH - R - oy) / dy, 0, -1);
            return hit && t < tw ? { t, ball: hit, dx, dy } : { t: tw, nx, ny, dx, dy };
          };
          const drawAim = () => {
            aimG.clear();
            if (phase !== 'aim' || turn !== 'me') return;
            const cue = ballOf(0), r = ray(cue.x, cue.y, aim), gx = cue.x + r.dx * r.t, gy = cue.y + r.dy * r.t;
            aimG.lineStyle(1.6, 0xffffff, 0.75).lineBetween(cue.x + r.dx * R, cue.y + r.dy * R, gx, gy);
            if (r.ball) {
              const ok = legalFirst(r.ball.n, st.groups.me, onTable(balls), st.isBreak);
              aimG.lineStyle(1.6, ok ? 0xffffff : 0xff5d5d, 0.9).strokeCircle(gx, gy, R);
              if (!ok) aimG.lineBetween(gx - 5, gy - 5, gx + 5, gy + 5).lineBetween(gx + 5, gy - 5, gx - 5, gy + 5);
              else {
                const nx = (r.ball.x - gx) / D, ny = (r.ball.y - gy) / D, along = r.dx * nx + r.dy * ny;
                aimG.lineStyle(2, 0xffffff, 0.85).lineBetween(r.ball.x, r.ball.y, r.ball.x + nx * (20 + 60 * along), r.ball.y + ny * (20 + 60 * along));
                const tx = r.dx - along * nx, ty = r.dy - along * ny;
                aimG.lineStyle(1.4, 0x9fe3ff, 0.6).lineBetween(gx, gy, gx + tx * 50, gy + ty * 50);
              }
            } else {
              aimG.strokeCircle(gx, gy, R);
              const rx = r.nx ? -r.dx : r.dx, ry = r.ny ? -r.dy : r.dy;
              aimG.lineStyle(1.2, 0xffffff, 0.4).lineBetween(gx, gy, gx + rx * 40, gy + ry * 40);
            }
          };
          const drawCue = () => {
            const cue = ballOf(0), show = (phase === 'aim' && turn === 'me') || phase === 'cpu';
            cueImg.setVisible(show && cue.on); cueShadow.clear();
            if (!show || !cue.on) return;
            const back = aim + Math.PI, gap = R + 3 + power * 70, cx = X0 + cue.x + Math.cos(back) * gap, cy = Y0 + cue.y + Math.sin(back) * gap;
            cueImg.setPosition(cx, cy).setRotation(back);
            cueShadow.lineStyle(6, 0x000000, 0.22).lineBetween(cx + 5, cy + 7, cx + Math.cos(back) * LC + 5, cy + Math.sin(back) * LC + 7);
          };
          const drawUi = () => {
            powerFill.setCrop(0, 0, BAR.w * art.R, BAR.h * power * art.R);
            barCue.setPosition(BAR.x + BAR.w / 2, BAR.y + 8 + power * BAR.h * 0.36);
            pctText.setText(power > 0.01 ? Math.round(power * 100) + '%' : '');
            fine.clear().fillStyle(0x07130e, 0.85).fillRoundedRect(FINE.x, FINE.y, FINE.w, FINE.h, 15).lineStyle(1.5, 0x2f6b51, 0.9).strokeRoundedRect(FINE.x, FINE.y, FINE.w, FINE.h, 15);
            const off = (((aim * 180) % 12) + 12) % 12;
            for (let x = FINE.x + 14 + off; x < FINE.x + FINE.w - 12; x += 12) {
              const f = 1 - Math.abs((x - (FINE.x + FINE.w / 2)) / (FINE.w / 2));
              fine.lineStyle(2, 0x9fe3c4, 0.15 + f * 0.55).lineBetween(x, FINE.y + 7, x, FINE.y + FINE.h - 7);
            }
            handRing.clear();
            if (inHand && turn === 'me' && phase === 'aim') {
              const cue = ballOf(0), t = scene.time.now / 300;
              handRing.lineStyle(2, 0xffd34d, 0.55 + Math.sin(t) * 0.3).strokeCircle(X0 + cue.x, Y0 + cue.y, R + 6);
              if (kitchen) handRing.fillStyle(0xffffff, 0.04).fillRect(X0, Y0 + HEAD, TW, TH - HEAD);
            }
          };

          this.events.on('update', (time, delta) => {
            const dt = Math.min(delta, 50) / 1000;
            if (phase === 'aim' && turn === 'me') {
              const dir = (keys.RIGHT.isDown || keys.D.isDown) - (keys.LEFT.isDown || keys.A.isDown);
              if (dir) aim += dir * (keys.SHIFT.isDown ? 0.08 : 0.9) * dt;
              if (charging) power = Math.min(1, power + dt / 1.3);
            }
            if (phase === 'roll') {
              acc += dt;
              let moving = true;
              while (acc >= TICK && moving) {
                const seen = ev.potted.length;
                moving = step(balls, ev);
                acc -= TICK;
                for (let i = seen; i < ev.potted.length; i++) potAnim(ev.potted[i], ev.pockets[i]);
              }
              if (ev.hits.length && time - lastHit > 30) { const v = Math.max(...ev.hits); beep(1700, 22, 'triangle', Math.min(0.09, 0.01 + v / 9000)); lastHit = time; }
              if (ev.rails.length) { const v = Math.max(...ev.rails); if (v > 60) beep(150, 35, 'sine', Math.min(0.06, v / 14000)); }
              ev.hits.length = 0; ev.rails.length = 0;
              if (!moving && !pending) { renderPanels(); endShot(); }
            }
            for (const b of balls) {
              const s = sprites[b.n];
              if (!b.on && !s.base.visible) continue;
              if (b.on) {
                const moved = Math.hypot(b.x - (s.base.x || b.x), b.y - (s.base.y || b.y));
                s.base.rotation += moved / R * 0.6;
                s.base.setPosition(b.x, b.y); s.gloss.setPosition(b.x, b.y); s.shadow.setPosition(b.x + 2.5, b.y + 3.5);
              }
            }
            drawAim(); drawCue(); drawUi();
          });

          newRack();
        },
      });
    },
  };
})();
