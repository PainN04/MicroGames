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
          // efeito na branca: no primeiro toque, por cima ela segue em frente, por baixo ela volta (puxada)
          const cue = a.n === 0 ? a : b.n === 0 ? b : null;
          if (cue && cue.sf) { cue.vx += cue.dx * cue.sf * 0.55 * rel; cue.vy += cue.dy * cue.sf * 0.55 * rel; cue.sf = 0; }
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
          if (vn < 0) {
            b.vx -= (1 + E_RAIL) * vn * nx; b.vy -= (1 + E_RAIL) * vn * ny; ev.rails?.push(-vn);
            // efeito de lado: a branca abre ou fecha o ângulo na tabela (e o efeito vai acabando)
            if (b.ss) { b.vx += -ny * b.ss * 0.32 * -vn; b.vy += nx * b.ss * 0.32 * -vn; b.ss *= 0.5; }
          }
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
  // dá a tacada na branca: direção, força (0–1) e efeito (sf: +1 por cima, −1 por baixo; ss: lado, −1 a +1)
  function strike(cue, angle, power, sf = 0, ss = 0) {
    cue.dx = Math.cos(angle); cue.dy = Math.sin(angle);
    cue.vx = cue.dx * power * VMAX; cue.vy = cue.dy * power * VMAX; cue.sf = sf; cue.ss = ss;
  }
  // tacada inteira, do toque até tudo parar (a máquina testa as tacadas com isso)
  function simulate(balls, angle, power, sf = 0, ss = 0) {
    const bs = copyBalls(balls), cue = bs.find(b => b.n === 0);
    strike(cue, angle, power, sf, ss);
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

  const engine = { TW, TH, R, D, HEAD, FOOT, POCKETS, RAILS, TICK, VMAX, LEVELS, step, strike, simulate, rack, judge, plan, legalFirst, onTable, leftOf, type, spot, freeAt };


  // ---------- desenho das bolas ----------
  // A bola é pintada num canvas próprio a cada passo que ela anda: a faixa (listradas) e o número giram de verdade,
  // como numa esfera rolando. P = polo (onde ficam as calotas brancas da listrada), N = onde fica o número;
  // os dois são vetores 3D (z sai da mesa, na direção de quem olha). L = de onde vem a luz, tRot = giro do texto.
  const COLORS = ['#f4f1e6', '#f2b705', '#1d4fc4', '#d9262f', '#6b2fb3', '#ee7a12', '#178a46', '#7d1b22', '#141414'];
  const colorOf = n => COLORS[n > 8 ? n - 8 : n];
  const TAU = Math.PI * 2, BS = D + 2;
  // Pintura pixel a pixel: cada ponto do disco vira um ponto da esfera (normal n); a cor sai de onde ele cai
  // (calota branca da listrada perto de ±P, círculo do número perto de N) e a luz é calculada ali mesmo
  // (difusa + brilho da luminária), com borda suave. O número é escrito por cima, achatado conforme a inclinação.
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const WHITE = rgb('#f6f3ea'), RED = rgb('#d64545');
  function drawBall(c, n, P, N, L = [-0.36, -0.42], tRot = 0) {
    const S = c.canvas.width, k = S / BS, img = c.createImageData(S, S), px = img.data, base = rgb(colorOf(n));
    const ll = Math.hypot(L[0], L[1], 0.9), lx = L[0] / ll, ly = L[1] / ll, lz = 0.9 / ll;
    const hl = Math.hypot(lx, ly, lz + 1), hx = lx / hl, hy = ly / hl, hz = (lz + 1) / hl;
    const capCos = Math.cos(0.92), numCos = Math.cos(n ? 0.5 : 0.17), mix = (a, b, t) => a + (b - a) * t;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = (i + 0.5) / k - BS / 2, y = (j + 0.5) / k - BS / 2, d = Math.hypot(x, y), o = (j * S + i) * 4;
      const edge = Math.min(1, Math.max(0, (R - d) * k + 0.5));
      if (edge <= 0) continue;
      const nx = x / R, ny = y / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let col = base;
      if (n > 8) { const t = smoothstep(capCos - 0.04, capCos + 0.04, Math.abs(nx * P[0] + ny * P[1] + nz * P[2])); col = col.map((v, q) => mix(v, WHITE[q], t)); }
      const t2 = smoothstep(numCos - 0.03, numCos + 0.03, nx * N[0] + ny * N[1] + nz * N[2]);
      if (t2 > 0) col = col.map((v, q) => mix(v, n ? 251 : RED[q], t2));
      const dif = 0.38 + 0.72 * Math.max(0, nx * lx + ny * ly + nz * lz), spec = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 70) * 1.1;
      const rim = 0.55 + 0.45 * Math.pow(nz, 0.35); // borda escurece
      for (let q = 0; q < 3; q++) px[o + q] = Math.min(255, col[q] * dif * rim + 255 * spec);
      px[o + 3] = 255 * edge;
    }
    c.putImageData(img, 0, 0);
    if (n && N[2] > 0.3) {
      const x = BS / 2 + N[0] * R * 0.88, y = BS / 2 + N[1] * R * 0.88, rot = Math.atan2(N[1], N[0]);
      c.save(); c.translate(x, y); c.rotate(rot); c.scale(N[2], 1); c.rotate(-rot + tRot);
      c.fillStyle = 'rgba(20,20,20,.92)'; c.font = `700 ${n > 9 ? 5 : 6.2}px "Space Grotesk", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(n), 0, 0.4); c.restore();
    }
  }
  // gira os vetores da bola quando ela anda (dx, dy) na mesa: rola sem deslizar, eixo deitado e perpendicular ao movimento
  function roll(o, dx, dy) {
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) return;
    const ax = -dy / d, ay = dx / d, t = d / R, cs = Math.cos(t), sn = Math.sin(t);
    const rot = v => { const cx = ay * v[2], cy = -ax * v[2], cz = ax * v[1] - ay * v[0], dot = ax * v[0] + ay * v[1]; return [v[0] * cs + cx * sn + ax * dot * (1 - cs), v[1] * cs + cy * sn + ay * dot * (1 - cs), v[2] * cs + cz * sn]; };
    o.P = rot(o.P); o.N = rot(o.N);
    // corrige o arredondamento: N perpendicular a P, os dois com tamanho 1
    const lp = Math.hypot(...o.P); o.P = o.P.map(v => v / lp);
    const k = o.N[0] * o.P[0] + o.N[1] * o.P[1] + o.N[2] * o.P[2], nn = o.N.map((v, i) => v - k * o.P[i]), ln = Math.hypot(...nn); o.N = nn.map(v => v / ln);
  }

  GAMES.sinuca = {
    name: 'Sinuca', icon: 'sinuca', hue: 152,
    desc: 'Sinuca de 8 bolas contra a máquina, no estilo 8 Ball Pool. Arraste na mesa pra mirar e puxe o taco (barra da direita) pra dar a força; a bolinha embaixo dá efeito na branca. Encaçape o seu grupo (lisas ou listradas) e depois a 8. Cada mesa vencida deixa a máquina melhor; perdeu, acabou.',
    better: 'high', unit: 'pontos', phaser: true, engine,
    start(el, done) {
      // No computador a mesa fica deitada (e maior); no celular, em pé. A física é sempre a da mesa em pé:
      // deitada, o container da mesa só gira 90° e as contas de tela passam por toScreen/toLocal.
      const wide = el.clientWidth >= 640, RW = 24, TX = 40, TY = 92;
      const L = wide
        ? { W: 686, H: 452, Z: 1.35, BAR: { x: 624, y: TY, w: 46, h: TW }, FINE: { x: 16, y: TY + TW + RW + 12, w: TH + RW * 2, h: 30 } }
        : { W: 420, H: 724, Z: 1, BAR: { x: 354, y: TY, w: 46, h: TH }, FINE: { x: 16, y: TY + TH + RW + 12, w: TW + RW * 2, h: 30 } };
      const { W, H, Z, BAR, FINE } = L, SPIN = { x: BAR.x + BAR.w / 2, y: FINE.y + FINE.h / 2, r: 17 };
      const ROT = wide ? -Math.PI / 2 : 0;
      const toScreen = (x, y) => (wide ? { x: TX + y, y: TY + TW - x } : { x: TX + x, y: TY + y });
      const toLocal = (sx, sy) => (wide ? { x: TW - (sy - TY), y: sx - TX } : { x: sx - TX, y: sy - TY });
      const vecLocal = (sx, sy) => (wide ? [-sy, sx] : [sx, sy]); // direção na tela → direção na mesa
      const LIGHT = vecLocal(-0.36, -0.42), SHADOW = vecLocal(2.6, 3.6);
      const center = toScreen(TW / 2, TH / 2);
      el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Mesas<b id="w">0</b></span><span class="stat">Máquina<b id="l">Iniciante</b></span></div><div class="phaser-wrap" id="pw"></div>';
      const hud = { p: el.querySelector('#p'), w: el.querySelector('#w'), l: el.querySelector('#l') };
      const FONT = 'Space Grotesk, system-ui, sans-serif';
      return mountPhaser(el.querySelector('#pw'), Math.round(W * Z), Math.round(H * Z), {
        create() {
          const scene = this, art = artKit(this);
          this.cameras.main.setZoom(Z).setOrigin(0, 0);
          let balls, st, phase = 'aim', turn = 'me', level = 0, pts = 0, wins = 0, potsTotal = 0, rackNo = 0;
          let aim = -Math.PI / 2, power = 0, spin = { x: 0, y: 0 }, inHand = false, kitchen = false, drag = null, charging = false;
          let ev = null, before = null, acc = 0, pending = 0, shotsMe = 0, foulsMe = 0, alive = true, lastHit = 0, strikeT = -1, strikePow = 0, strikeAt = null;

          // ---------- arte ----------
          this.add.image(0, 0, art.backdrop('sn_bg', W, H, '#0f2a20', '#050c09', { grid: 30 })).setOrigin(0).setDisplaySize(W, H);
          // luz da luminária em cima da mesa
          art.tex('sn_lamp', 320, 320, c => { c.fillStyle = art.rad(c, 160, 160, 10, 160, [[0, 'rgba(255,240,200,.16)'], [1, 'rgba(255,240,200,0)']]); c.fillRect(0, 0, 320, 320); });
          this.add.image(center.x, center.y, 'sn_lamp').setDisplaySize(wide ? 760 : 460, wide ? 460 : 760);
          const OW = TW + RW * 2, OH = TH + RW * 2;
          art.tex('sn_table_' + (wide ? 'w' : 't'), OW + 12, OH + 12, c => {
            const o = 6, fx = o + RW, fy = o + RW, P = ([x, y]) => [fx + x, fy + y];
            c.shadowColor = 'rgba(0,0,0,.65)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
            art.rr(c, o, o, OW, OH, 18); c.fillStyle = '#3b200c'; c.fill();
            c.shadowColor = 'transparent';
            // madeira com veios e verniz
            art.rr(c, o, o, OW, OH, 18); c.fillStyle = art.lin(c, 0, o, OW, o + OH, [[0, '#a36a36'], [0.35, '#7a4720'], [0.7, '#8e5629'], [1, '#5a3013']]); c.fill();
            c.save(); art.rr(c, o, o, OW, OH, 18); c.clip();
            for (let i = 0; i < 110; i++) {
              const vert = i % 2, p = Math.random();
              c.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,18,4' : '200,140,80'},${0.07 + Math.random() * 0.12})`; c.lineWidth = 0.5 + Math.random();
              c.beginPath();
              if (vert) { const x = o + p * OW; c.moveTo(x, o); c.bezierCurveTo(x + 4, o + OH * 0.3, x - 4, o + OH * 0.6, x + 2, o + OH); }
              else { const y = o + p * OH; c.moveTo(o, y); c.bezierCurveTo(o + OW * 0.3, y + 3, o + OW * 0.6, y - 3, o + OW, y + 1); }
              c.stroke();
            }
            c.fillStyle = art.lin(c, 0, o, 0, o + OH, [[0, 'rgba(255,255,255,.10)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.12)']]); c.fillRect(o, o, OW, OH);
            c.restore();
            c.lineWidth = 2; c.strokeStyle = 'rgba(255,214,160,.38)'; art.rr(c, o + 1.5, o + 1.5, OW - 3, OH - 3, 17); c.stroke();
            c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.5)'; art.rr(c, o + 0.5, o + 0.5, OW - 1, OH - 1, 18); c.stroke();
            // friso dourado em volta do pano
            c.lineWidth = 1.2; c.strokeStyle = 'rgba(230,190,110,.45)'; art.rr(c, fx - 13, fy - 13, TW + 26, TH + 26, 6); c.stroke();
            c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(fx - 10, fy - 10, TW + 20, TH + 20);
            // caçapas, parte 1: aro de couro e a boca escura entre os bicos
            for (const p of POCKETS) {
              const [x, y] = P([p.x, p.y]);
              art.ell(c, x, y, 17.5, 17.5); c.fillStyle = art.lin(c, x, y - 17, x, y + 17, [[0, '#55402c'], [1, '#170e07']]); c.fill();
              art.ell(c, x, y, 17, 17); c.strokeStyle = 'rgba(255,220,170,.28)'; c.lineWidth = 1; c.stroke();
            }
            for (const r of RAILS) for (const [q, end] of [[r.a, r.ja], [r.b, r.jb]]) {
              const pk = POCKETS.reduce((m, p) => (Math.hypot(p.x - end[0], p.y - end[1]) < Math.hypot(m.x - end[0], m.y - end[1]) ? p : m));
              c.beginPath(); c.moveTo(...P(q)); c.lineTo(...P(end)); c.lineTo(...P([pk.x, pk.y])); c.lineTo(...P([pk.ax, pk.ay])); c.closePath(); c.fillStyle = '#0b0b0b'; c.fill();
            }
            // pano: mais claro no meio (luz da luminária), trama de feltro
            c.fillStyle = art.rad(c, fx + TW / 2, fy + TH / 2, 20, TH * 0.62, [[0, '#32b472'], [0.55, '#1d8c52'], [1, '#0f5c36']]);
            c.fillRect(fx, fy, TW, TH);
            for (let i = 0; i < 3200; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; c.fillRect(fx + Math.random() * TW, fy + Math.random() * TH, 1, 1); }
            // marca d'água no meio do pano, de pé pra quem olha
            c.save(); c.translate(fx + TW / 2, fy + TH / 2); c.rotate(wide ? Math.PI / 2 : 0);
            c.font = `700 ${wide ? 30 : 26}px "Space Grotesk", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = 'rgba(255,255,255,.07)'; c.fillText('MicroGame', 0, 0);
            c.font = '600 9px "Space Grotesk", system-ui, sans-serif'; c.fillText('S I N U C A', 0, wide ? 24 : 22);
            c.restore();
            // linha de saída e marcas
            c.setLineDash([3, 4]); c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(fx + 2, fy + HEAD); c.lineTo(fx + TW - 2, fy + HEAD); c.stroke(); c.setLineDash([]);
            art.ell(c, fx + FOOT.x, fy + FOOT.y, 1.8, 1.8); c.fillStyle = 'rgba(255,255,255,.3)'; c.fill();
            art.ell(c, fx + TW / 2, fy + HEAD, 1.8, 1.8); c.fill();
            // borrachas (tabelas) com o bico em ângulo na boca das caçapas
            for (const r of RAILS) {
              const dep = (q, end) => { const k = 8 / (Math.abs(end[0] - q[0]) === J || Math.abs(end[1] - q[1]) === J ? J : SJ); return [q[0] + (end[0] - q[0]) * k, q[1] + (end[1] - q[1]) * k]; };
              const pa = dep(r.a, r.ja), pb = dep(r.b, r.jb);
              const horiz = r.a[1] === r.b[1], sx = horiz ? 0 : Math.sign(pa[0] - r.a[0]), sy = horiz ? Math.sign(pa[1] - r.a[1]) : 0;
              const [ax, ay] = P(r.a);
              c.beginPath(); [r.a, r.b, pb, pa].map(P).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
              c.fillStyle = art.lin(c, ax, ay, ax + sx * 8, ay + sy * 8, [[0, '#27a362'], [0.35, '#177a43'], [1, '#0b4626']]); c.fill();
              c.beginPath(); c.moveTo(...P(r.a)); c.lineTo(...P(r.b)); c.strokeStyle = 'rgba(170,255,210,.35)'; c.lineWidth = 1; c.stroke();
            }
            // marcas (diamantes) de madrepérola
            const diamond = (x, y) => { c.beginPath(); c.moveTo(x, y - 3.2); c.lineTo(x + 2.3, y); c.lineTo(x, y + 3.2); c.lineTo(x - 2.3, y); c.closePath(); c.fillStyle = art.lin(c, x, y - 3, x, y + 3, [[0, '#fffaf0'], [1, '#bfb49a']]); c.fill(); };
            for (let k = 1; k < 8; k++) if (k !== 4) { diamond(fx - 16, fy + (TH * k) / 8); diamond(fx + TW + 16, fy + (TH * k) / 8); }
            for (let k = 1; k < 4; k++) { diamond(fx + (TW * k) / 4, fy - 16); diamond(fx + (TW * k) / 4, fy + TH + 16); }
            // caçapas, parte 2: o buraco, com a rede escura no fundo
            for (const p of POCKETS) {
              const [x, y] = P([p.x, p.y]);
              art.ell(c, x, y, 13.5, 13.5); c.fillStyle = art.rad(c, x, y + 2, 2, 14, [[0, '#000'], [0.7, '#080808'], [1, '#2a2a2a']]); c.fill();
              c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 0.6;
              for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * 4, y - 9); c.lineTo(x + k * 4, y + 9); c.stroke(); c.beginPath(); c.moveTo(x - 9, y + k * 4); c.lineTo(x + 9, y + k * 4); c.stroke(); }
            }
          });
          const table = this.add.container(TX, wide ? TY + TW : TY).setRotation(ROT);
          table.add(this.add.image(-RW - 6, -RW - 6, 'sn_table_' + (wide ? 'w' : 't')).setOrigin(0).setDisplaySize(OW + 12, OH + 12));

          // bolas: cada uma tem seu canvas (repintado quando ela rola), as miniaturas do placar são fixas
          art.tex('sn_shadow', BS + 8, BS + 8, c => { const x = (BS + 8) / 2; art.ell(c, x, x, R + 2.5, R + 2.5); c.fillStyle = art.rad(c, x, x, 1, R + 3, [[0, 'rgba(0,0,0,.55)'], [0.7, 'rgba(0,0,0,.3)'], [1, 'rgba(0,0,0,0)']]); c.fill(); });
          for (let n = 0; n <= 15; n++) art.tex('sn_m' + n, BS, BS, c => drawBall(c, n, [0, -1, 0], [0, 0.18, 0.98]));
          const ballTex = n => {
            const key = 'sn_ball' + n;
            const t = this.textures.exists(key) ? this.textures.get(key) : this.textures.createCanvas(key, BS * art.R, BS * art.R);
            return t;
          };
          const paint = s => { const c = s.tex.getContext(); c.setTransform(art.R, 0, 0, art.R, 0, 0); drawBall(c, s.ball.n, s.P, s.N, LIGHT, -ROT); s.tex.refresh(); };

          // taco: ponta azul de giz, anel branco, madeira clara, junta de metal, cabo escuro com losangos e empunhadura
          const LC = 310;
          art.tex('sn_cue', LC, 12, c => {
            const half = x => 2.3 + (x / LC) * 3, mid = 6;
            c.save(); c.beginPath(); c.moveTo(0, mid - half(0)); c.lineTo(LC - 2, mid - half(LC)); c.quadraticCurveTo(LC, mid, LC - 2, mid + half(LC)); c.lineTo(0, mid + half(0)); c.closePath(); c.clip();
            const band = (a, b, col) => { c.fillStyle = col; c.fillRect(a, 0, b - a, 12); };
            band(0, 3, '#3f6fd0'); band(3, 10, '#f3efe4');
            c.fillStyle = art.lin(c, 10, 0, 180, 0, [[0, '#f3dfb2'], [1, '#d4a865']]); c.fillRect(10, 0, 170, 12);
            band(180, 184, '#d5d9e0'); band(184, 240, '#4a1f0b');
            c.fillStyle = '#ecd9a6';
            for (let k = 0; k < 4; k++) { const x = 190 + k * 12; c.beginPath(); c.moveTo(x, mid); c.lineTo(x + 6, mid - 3.4); c.lineTo(x + 12, mid); c.lineTo(x + 6, mid + 3.4); c.closePath(); c.fill(); }
            band(240, 290, '#1b1b1f');
            c.strokeStyle = 'rgba(255,255,255,.13)'; c.lineWidth = 0.8; for (let x = 242; x < 290; x += 3) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 2, 12); c.stroke(); }
            band(290, 306, '#5a2a10'); band(306, LC, '#111');
            c.fillStyle = art.lin(c, 0, mid - 5, 0, mid + 5, [[0, 'rgba(255,255,255,.5)'], [0.42, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.5)']]); c.fillRect(0, 0, LC, 12);
            c.restore();
          });
          art.tex('sn_power', BAR.w, BAR.h, c => {
            art.rr(c, 0, 0, BAR.w, BAR.h, 14); c.fillStyle = art.lin(c, 0, 0, 0, BAR.h, [[0, '#2fe08a'], [0.55, '#ffd34d'], [1, '#ff4d5e']]); c.fill();
            art.rr(c, 3, 3, BAR.w * 0.32, BAR.h - 6, 10); c.fillStyle = 'rgba(255,255,255,.22)'; c.fill();
          });

          // ---------- barra de força, ajuste fino e efeito ----------
          const ui = this.add.graphics();
          const box = (x, y, w, h, r) => ui.fillStyle(0x07130e, 1).fillRoundedRect(x, y, w, h, r).lineStyle(1.5, 0x2f6b51, 0.9).strokeRoundedRect(x, y, w, h, r);
          box(BAR.x, BAR.y, BAR.w, BAR.h, 14);
          for (let k = 1; k < 10; k++) ui.lineStyle(1, 0xffffff, 0.08).lineBetween(BAR.x + 8, BAR.y + (BAR.h * k) / 10, BAR.x + BAR.w - 8, BAR.y + (BAR.h * k) / 10);
          const powerFill = this.add.image(BAR.x, BAR.y, 'sn_power').setOrigin(0).setDisplaySize(BAR.w, BAR.h);
          const barCue = this.add.image(BAR.x + BAR.w / 2, BAR.y + 8, 'sn_cue').setOrigin(0, 0.5).setDisplaySize(BAR.h * 0.6, 10).setRotation(Math.PI / 2);
          const label = (x, y, t, size = 11, color = '#cfe9dc') => this.add.text(x, y, t, { fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(2);
          label(BAR.x + BAR.w / 2, BAR.y - 12, 'FORÇA', 10, '#8fc9ad');
          const pctText = label(BAR.x + BAR.w / 2, BAR.y + BAR.h + 13, '', 12, '#ffffff');
          const fine = this.add.graphics();
          label(FINE.x + FINE.w / 2, FINE.y + FINE.h + 9, 'ajuste fino da mira', 9, '#6f9c86');
          // efeito: bola branca grande; o ponto vermelho mostra onde o taco bate
          const spinDisc = this.add.graphics();
          label(SPIN.x, SPIN.y + SPIN.r + 9, 'efeito', 9, '#6f9c86');
          const drawSpin = () => {
            spinDisc.clear().fillStyle(0xf4f1e6, 1).fillCircle(SPIN.x, SPIN.y, SPIN.r).fillStyle(0x000000, 0.18).fillCircle(SPIN.x + 2, SPIN.y + 2.5, SPIN.r - 2).fillStyle(0xf4f1e6, 1).fillCircle(SPIN.x - 1, SPIN.y - 1, SPIN.r - 3)
              .lineStyle(1, 0x000000, 0.25).lineBetween(SPIN.x - SPIN.r + 3, SPIN.y, SPIN.x + SPIN.r - 3, SPIN.y).lineBetween(SPIN.x, SPIN.y - SPIN.r + 3, SPIN.x, SPIN.y + SPIN.r - 3)
              .fillStyle(0xd64545, 1).fillCircle(SPIN.x + spin.x * (SPIN.r - 5), SPIN.y + spin.y * (SPIN.r - 5), 3.6)
              .lineStyle(2, 0x2f6b51, 1).strokeCircle(SPIN.x, SPIN.y, SPIN.r + 1);
          };

          // ---------- mesa: bolas, mira e taco ficam dentro do container (giram junto) ----------
          const shadowLayer = this.add.container(0, 0), ballLayer = this.add.container(0, 0);
          const aimG = this.add.graphics(), cueShadow = this.add.graphics(), handRing = this.add.graphics();
          const cueImg = this.add.image(0, 0, 'sn_cue').setOrigin(0, 0.5).setDisplaySize(LC, 12);
          table.add([shadowLayer, ballLayer, handRing, aimG, cueShadow, cueImg]);
          // a barra, o ajuste fino e o efeito ficam por cima do taco (ele passa por baixo deles)
          [ui, powerFill, barCue, pctText, fine, spinDisc].forEach(o => o.setDepth(2));
          const sprites = [];

          // placar de cima: você × máquina, com as bolas que faltam de cada um
          const pw = (W - 32 - 8) / 2;
          const panels = ['me', 'cpu'].map((who, i) => {
            const x = 16 + i * (pw + 8), w = pw;
            const bg = this.add.graphics();
            const dot = this.add.graphics();
            const name = this.add.text(x + 26, 13, who === 'me' ? 'Você' : 'Máquina', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffffff' });
            const sub = this.add.text(x + w - 12, 15, '', { fontFamily: FONT, fontSize: '11px', color: '#9fc7b4' }).setOrigin(1, 0);
            const gap = Math.min(24, (w - 24) / 8);
            const minis = Array.from({ length: 8 }, (_, k) => {
              const bx = x + 17 + k * gap, by = 46;
              return { slot: this.add.graphics().fillStyle(0x000000, 0.35).fillCircle(bx, by, 8).lineStyle(1, 0xffffff, 0.12).strokeCircle(bx, by, 8), img: this.add.image(bx, by, 'sn_m1').setDisplaySize(16, 16) };
            });
            return { who, x, w, bg, dot, name, sub, minis };
          });

          const msgBg = this.add.graphics(), msg = label(center.x, center.y, '', 15);
          let msgTimer = null;
          const say = (text, color = '#ffffff', ms = 1700) => {
            msg.setText(text).setColor(color).setAlpha(1);
            const w = msg.width + 30;
            msgBg.clear().fillStyle(0x06110c, 0.85).fillRoundedRect(center.x - w / 2, center.y - 18, w, 36, 18).lineStyle(1, 0x3ddc97, 0.35).strokeRoundedRect(center.x - w / 2, center.y - 18, w, 36, 18).setAlpha(1);
            msg.setScale(0.9); this.tweens.add({ targets: msg, scale: 1, duration: 160, ease: 'Back.Out' });
            msgTimer?.remove();
            if (ms) msgTimer = this.time.delayedCall(ms, () => this.tweens.add({ targets: [msg, msgBg], alpha: 0, duration: 300 }));
          };

          // fim da mesa: painel com botão (Próxima mesa)
          const over = this.add.container(W / 2, H / 2).setVisible(false).setDepth(10);
          const ovBg = this.add.graphics().fillStyle(0x04100b, 0.94).fillRoundedRect(-150, -92, 300, 184, 20).lineStyle(2, 0x3ddc97, 0.7).strokeRoundedRect(-150, -92, 300, 184, 20);
          const ovTitle = label(0, -56, '', 20), ovSub = label(0, -20, '', 13, '#bfe6d2');
          ovSub.setAlign('center');
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
            turn = 'me'; inHand = true; kitchen = true; shotsMe = 0; foulsMe = 0; power = 0; aim = -Math.PI / 2; spin = { x: 0, y: 0 };
            sprites.forEach(s => { s.img.destroy(); s.shadow.destroy(); });
            sprites.length = 0;
            for (const b of balls) {
              const shadow = this.add.image(b.x + SHADOW[0], b.y + SHADOW[1], 'sn_shadow').setDisplaySize(BS + 8, BS + 8);
              const tex = ballTex(b.n), img = this.add.image(b.x, b.y, tex.key).setDisplaySize(BS, BS);
              shadowLayer.add(shadow); ballLayer.add(img);
              // número virado pra cima, com um pouco de sorteio (a mesa não começa toda igual)
              const a = Math.random() * TAU, tilt = Math.random() * 0.5;
              const s = { ball: b, img, shadow, tex, P: [Math.cos(a), Math.sin(a), 0], N: [-Math.sin(a) * Math.sin(tilt), Math.cos(a) * Math.sin(tilt), Math.cos(tilt)], lx: b.x, ly: b.y };
              paint(s);
              sprites[b.n] = s;
            }
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
              p.dot.clear().fillStyle(active ? 0x3ddc97 : 0x2a4a3c, 1).fillCircle(p.x + 15, 21, 4.5);
              p.sub.setText(p.who === 'cpu' ? LEVELS[level][0] + (g ? ' · ' + GROUP_NAME[g] : '') : g ? GROUP_NAME[g] : 'Mesa aberta');
              const nums = g ? (g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]) : [];
              p.minis.forEach((m, k) => {
                const n = k < 7 ? nums[k] : 8;
                const show = n !== undefined && (k < 7 || (g && !leftOf(set, g)));
                m.img.setVisible(show);
                if (show) m.img.setTexture('sn_m' + n).setDisplaySize(16, 16).setAlpha(set.has(n) ? 1 : 0.18);
                m.slot.setVisible(k < 7);
              });
            }
          };

          // ---------- tacada ----------
          const shoot = (angle, pw, sf = 0, ss = 0) => {
            const cue = ballOf(0);
            strike(cue, angle, pw, sf, ss);
            ev = { first: null, potted: [], pockets: [], hits: [], rails: [] };
            before = onTable(balls);
            acc = 0; phase = 'roll'; drag = null; charging = false; inHand = false;
            strikeT = 0; strikePow = power || pw; strikeAt = { x: cue.x, y: cue.y }; power = 0;
            if (turn === 'me') shotsMe++;
            noise(70, 0.05 + pw * 0.1, 2600); beep(140 + pw * 120, 40, 'triangle', 0.04); buzz(10 + Math.round(pw * 20));
            if (pw > 0.85) this.cameras.main.shake(120, 0.003);
            renderPanels();
          };
          const potAnim = (n, pk) => {
            const s = sprites[n], p = POCKETS[pk];
            pending++;
            this.tweens.add({ targets: s.img, x: p.x, y: p.y, scale: s.img.scale * 0.5, alpha: 0, duration: 230, ease: 'Quad.In', onComplete: () => { pending--; } });
            s.shadow.setVisible(false);
            sweep(520, 160, 220, 'sine', 0.05); buzz(12);
          };
          const restore = n => {
            const s = sprites[n];
            this.tweens.killTweensOf(s.img);
            s.img.setAlpha(1).setDisplaySize(BS, BS); s.shadow.setVisible(true);
            s.lx = s.ball.x; s.ly = s.ball.y;
          };
          const endShot = () => {
            const who = turn, res = judge(st, who, ev, before);
            st.isBreak = false;
            if (res.assign) { st.groups = res.assign; say(who === 'me' ? `Você ficou com as ${GROUP_NAME[res.assign.me].toLowerCase()}` : `A máquina ficou com as ${GROUP_NAME[res.assign.cpu].toLowerCase()}`, '#ffd34d'); }
            if (who === 'me' && res.scored.length) {
              const gain = res.scored.length * 10;
              pts += gain; potsTotal += res.scored.length; hud.p.textContent = pts;
              const b = ballOf(res.scored[0]), at = toScreen(b.x, b.y);
              floatText(this, at.x, at.y - 8, '+' + gain, '#7cffb0'); sfx.good();
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
                const cue = ballOf(0), from = { x: cue.x, y: cue.y };
                this.tweens.add({ targets: from, x: p.place.x, y: p.place.y, duration: 450, ease: 'Sine.InOut', onUpdate: () => { cue.x = from.x; cue.y = from.y; }, onComplete: () => { inHand = false; go(); } });
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
          const inBox = (p, b, pad = 0) => p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
          const world = p => ({ x: p.worldX, y: p.worldY });
          const aimTo = q => { const cue = ballOf(0); if (Math.hypot(q.x - cue.x, q.y - cue.y) > 4) aim = Math.atan2(q.y - cue.y, q.x - cue.x); };
          const canPlace = (x, y) => freeAt(balls, x, y, 0) && (!kitchen || y >= HEAD + R);
          const setSpin = p => { let x = (p.x - SPIN.x) / (SPIN.r - 5), y = (p.y - SPIN.y) / (SPIN.r - 5); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } spin = { x, y }; };
          this.input.on('pointerdown', ptr => {
            const p = world(ptr);
            if (phase !== 'aim' || turn !== 'me') return;
            if (Math.hypot(p.x - SPIN.x, p.y - SPIN.y) < SPIN.r + 8) { drag = { kind: 'spin' }; setSpin(p); return; }
            if (inBox(p, BAR, 10)) { drag = { kind: 'power', y0: p.y }; return; }
            if (inBox(p, FINE, 6)) { drag = { kind: 'fine', x: p.x }; return; }
            const q = toLocal(p.x, p.y);
            if (q.x > -RW - 10 && q.x < TW + RW + 10 && q.y > -RW - 10 && q.y < TH + RW + 10) {
              const cue = ballOf(0);
              if (inHand && Math.hypot(q.x - cue.x, q.y - cue.y) < 26) { drag = { kind: 'cue', dx: cue.x - q.x, dy: cue.y - q.y }; return; }
              drag = { kind: 'aim' }; aimTo(q);
            }
          });
          this.input.on('pointermove', ptr => {
            if (!drag || phase !== 'aim') return;
            const p = world(ptr);
            if (drag.kind === 'power') power = Phaser.Math.Clamp((p.y - drag.y0) / (BAR.h * 0.75), 0, 1);
            else if (drag.kind === 'fine') { aim += (p.x - drag.x) * 0.0022; drag.x = p.x; }
            else if (drag.kind === 'spin') setSpin(p);
            else if (drag.kind === 'aim') aimTo(toLocal(p.x, p.y));
            else if (drag.kind === 'cue') {
              const q = toLocal(p.x, p.y), cue = ballOf(0);
              const x = Phaser.Math.Clamp(q.x + drag.dx, R, TW - R), y = Phaser.Math.Clamp(q.y + drag.dy, kitchen ? HEAD + R : R, TH - R);
              if (canPlace(x, y)) { cue.x = x; cue.y = y; }
            }
          });
          const fire = () => { if (phase === 'aim' && power > 0.02) shoot(aim, power, -spin.y, spin.x); else power = 0; };
          const release = () => { if (drag?.kind === 'power') fire(); drag = null; };
          this.input.on('pointerup', release);
          this.input.on('pointerupoutside', release);
          const keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,SHIFT,SPACE,ENTER');
          this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
          this.input.keyboard.on('keydown', e => {
            if ((e.key === ' ' || e.key === 'Enter') && phase === 'between' && alive) { newRack(); return; }
            if (phase !== 'aim' || turn !== 'me') return;
            if (e.key === ' ' && !e.repeat) { charging = true; power = 0; }
            if (e.key === 'ArrowUp') spin.y = Math.max(-1, spin.y - 0.25);
            if (e.key === 'ArrowDown') spin.y = Math.min(1, spin.y + 0.25);
          });
          this.input.keyboard.on('keyup', e => { if (e.key === ' ' && charging) { charging = false; fire(); } });

          // ---------- desenho a cada quadro ----------
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
          const dashed = (g, x0, y0, x1, y1, on = 6, off = 4) => {
            const l = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / l, uy = (y1 - y0) / l;
            for (let s = 0; s < l; s += on + off) g.lineBetween(x0 + ux * s, y0 + uy * s, x0 + ux * Math.min(l, s + on), y0 + uy * Math.min(l, s + on));
          };
          const drawAim = () => {
            aimG.clear();
            if (phase !== 'aim' || turn !== 'me') return;
            const cue = ballOf(0), r = ray(cue.x, cue.y, aim), gx = cue.x + r.dx * r.t, gy = cue.y + r.dy * r.t;
            aimG.lineStyle(3, 0x000000, 0.18).lineBetween(cue.x + r.dx * R, cue.y + r.dy * R, gx, gy);
            aimG.lineStyle(1.6, 0xffffff, 0.85).lineBetween(cue.x + r.dx * R, cue.y + r.dy * R, gx, gy);
            if (r.ball) {
              const ok = legalFirst(r.ball.n, st.groups.me, onTable(balls), st.isBreak);
              aimG.fillStyle(0xffffff, 0.12).fillCircle(gx, gy, R).lineStyle(1.6, ok ? 0xffffff : 0xff5d5d, 0.95).strokeCircle(gx, gy, R);
              if (!ok) aimG.lineBetween(gx - 5, gy - 5, gx + 5, gy + 5).lineBetween(gx + 5, gy - 5, gx - 5, gy + 5);
              else {
                const nx = (r.ball.x - gx) / D, ny = (r.ball.y - gy) / D, along = r.dx * nx + r.dy * ny;
                aimG.lineStyle(2, 0xffffff, 0.9).lineBetween(r.ball.x + nx * R, r.ball.y + ny * R, r.ball.x + nx * (R + 18 + 60 * along), r.ball.y + ny * (R + 18 + 60 * along));
                // caminho da branca depois da batida (o efeito por cima/baixo muda o ângulo)
                const f = -spin.y * 0.55 * along, tx = r.dx - along * nx + r.dx * f, ty = r.dy - along * ny + r.dy * f, tl = Math.hypot(tx, ty);
                if (tl > 0.05) { aimG.lineStyle(1.4, 0x9fe3ff, 0.7); dashed(aimG, gx, gy, gx + (tx / tl) * 18 + tx * 40, gy + (ty / tl) * 18 + ty * 40, 4, 3); }
              }
            } else {
              aimG.strokeCircle(gx, gy, R);
              const rx = r.nx ? -r.dx : r.dx, ry = r.ny ? -r.dy : r.dy;
              aimG.lineStyle(1.2, 0xffffff, 0.45); dashed(aimG, gx, gy, gx + rx * 44, gy + ry * 44, 4, 3);
            }
          };
          const drawCue = dt => {
            const cue = ballOf(0);
            let gap, alpha = 1;
            if (phase === 'roll' && strikeT >= 0) {
              strikeT += dt;
              // o taco avança até a bola e some devagar depois da tacada
              gap = strikeT < 0.06 ? R + 3 + strikePow * 70 * (1 - strikeT / 0.06) : R + 1;
              alpha = strikeT < 0.12 ? 1 : Math.max(0, 1 - (strikeT - 0.12) / 0.3);
              if (alpha <= 0) strikeT = -1;
            } else if ((phase === 'aim' && turn === 'me') || phase === 'cpu') gap = R + 3 + power * 70;
            const show = gap !== undefined && (cue.on || phase === 'roll');
            cueImg.setVisible(show); cueShadow.clear();
            if (!show) return;
            const back = aim + Math.PI, from = phase === 'roll' ? strikeAt : cue, ox = from.x, oy = from.y;
            const cx = ox + Math.cos(back) * gap, cy = oy + Math.sin(back) * gap;
            cueImg.setPosition(cx, cy).setRotation(back).setAlpha(alpha);
            cueShadow.lineStyle(6, 0x000000, 0.22 * alpha).lineBetween(cx + SHADOW[0] * 2, cy + SHADOW[1] * 2, cx + Math.cos(back) * LC + SHADOW[0] * 2, cy + Math.sin(back) * LC + SHADOW[1] * 2);
          };
          const drawUi = () => {
            powerFill.setCrop(0, 0, BAR.w * art.R, BAR.h * power * art.R);
            barCue.setPosition(BAR.x + BAR.w / 2, BAR.y + 8 + power * BAR.h * 0.36);
            pctText.setText(power > 0.01 ? Math.round(power * 100) + '%' : '');
            fine.clear().fillStyle(0x07130e, 1).fillRoundedRect(FINE.x, FINE.y, FINE.w, FINE.h, 15).lineStyle(1.5, 0x2f6b51, 0.9).strokeRoundedRect(FINE.x, FINE.y, FINE.w, FINE.h, 15);
            const off = (((aim * 180) % 12) + 12) % 12;
            for (let x = FINE.x + 14 + off; x < FINE.x + FINE.w - 12; x += 12) {
              const f = 1 - Math.abs((x - (FINE.x + FINE.w / 2)) / (FINE.w / 2));
              fine.lineStyle(2, 0x9fe3c4, 0.12 + f * 0.6).lineBetween(x, FINE.y + 7, x, FINE.y + FINE.h - 7);
            }
            drawSpin();
            handRing.clear();
            if (inHand && turn === 'me' && phase === 'aim') {
              const cue = ballOf(0), t = scene.time.now / 300;
              if (kitchen) handRing.fillStyle(0xffffff, 0.045).fillRect(0, HEAD, TW, TH - HEAD);
              handRing.lineStyle(2, 0xffd34d, 0.55 + Math.sin(t) * 0.3).strokeCircle(cue.x, cue.y, R + 6);
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
              if (!moving && !pending && strikeT < 0) { renderPanels(); endShot(); }
            }
            for (const b of balls) {
              const s = sprites[b.n];
              if (!b.on) continue;
              if (b.x !== s.lx || b.y !== s.ly) { roll(s, b.x - s.lx, b.y - s.ly); s.lx = b.x; s.ly = b.y; paint(s); }
              s.img.setPosition(b.x, b.y); s.shadow.setPosition(b.x + SHADOW[0], b.y + SHADOW[1]);
            }
            drawAim(); drawCue(dt); drawUi();
          });

          newRack();
        },
      });
    },
  };
})();
