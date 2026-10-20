// ---------- cards 3D do menu: Zdog (ilustração 3D) + Vanilla-Tilt (inclinação com brilho) ----------
// As duas bibliotecas carregam depois do menu aparecer (não atrasam a página). Cada jogo com cena 3D ganha um
// <canvas> no canto do card; um único loop anima só os cards visíveis e para com a aba escondida.
const ZDOG_URL = 'https://cdn.jsdelivr.net/npm/zdog@1.1.3/dist/zdog.dist.min.js';
const TILT_URL = 'https://cdn.jsdelivr.net/npm/vanilla-tilt@1.8.1/dist/vanilla-tilt.min.js';
const libLoads = {};
function loadLib(url) {
  return libLoads[url] ??= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: url, async: true, onload: resolve });
    s.onerror = () => { delete libLoads[url]; s.remove(); reject(new Error('falhou: ' + url)); };
    document.head.append(s);
  });
}

// clareia (amt > 0) ou escurece (amt < 0) um #rrggbb — dá o volume das faces
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => { const v = (n >> s) & 255; return Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt)); };
  return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
}
// cubo com faces sombreadas (luz vindo de cima/esquerda)
function cube(Z, addTo, size, color, opts = {}) {
  return new Z.Box({
    addTo, width: size, height: size, depth: size, stroke: 1.5, color,
    topFace: shade(color, 0.3), leftFace: shade(color, -0.15), rightFace: shade(color, -0.3),
    bottomFace: shade(color, -0.45), rearFace: shade(color, -0.2), ...opts,
  });
}

const PALETTE = ['#8b6cff', '#ff8a5c', '#3ddc97', '#ffd34d', '#4dc3ff', '#ff6b8a'];

// placa com volume (tecla, ladrilho, peça) — a face da frente fica em z = depth/2
function slab(Z, addTo, w, h, d, color, opts = {}) {
  return new Z.Box({
    addTo, width: w, height: h, depth: d, stroke: 2, color,
    topFace: shade(color, 0.25), leftFace: shade(color, -0.12), rightFace: shade(color, -0.25),
    bottomFace: shade(color, -0.35), rearFace: shade(color, -0.15), ...opts,
  });
}
// números estilo display digital e algumas letras, desenhados com traços (Zdog não tem texto)
const SEG = { a: [[-4, -7], [4, -7]], b: [[4, -7], [4, 0]], c: [[4, 0], [4, 7]], d: [[-4, 7], [4, 7]], e: [[-4, 0], [-4, 7]], f: [[-4, -7], [-4, 0]], g: [[-4, 0], [4, 0]] };
const DIGITS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
const digitLines = d => [...DIGITS[d]].map(s => SEG[s]);
const LETTERS = {
  A: [[[-4, 7], [0, -7], [4, 7]], [[-2.2, 1], [2.2, 1]]],
  B: [[[-4, 7], [-4, -7], [2, -7], [4, -5], [4, -2], [2, 0], [-4, 0]], [[2, 0], [4, 2], [4, 5], [2, 7], [-4, 7]]],
  C: [[[4, -7], [-4, -7], [-4, 7], [4, 7]]],
  D: [[[-4, -7], [2, -7], [4, -4], [4, 4], [2, 7], [-4, 7], [-4, -7]]],
  E: [[[4, -7], [-4, -7], [-4, 7], [4, 7]], [[-4, 0], [2, 0]]],
  L: [[[-4, -7], [-4, 7], [4, 7]]],
  R: [[[-4, 7], [-4, -7], [2, -7], [4, -5], [4, -2], [2, 0], [-4, 0]], [[0, 0], [4, 7]]],
  T: [[[-4, -7], [4, -7]], [[0, -7], [0, 7]]],
};
// Group: os traços são desenhados juntos, como uma peça só — senão a ordenação 3D esconde alguns atrás da placa
function glyph(Z, addTo, lines, { color = '#1a1a1a', stroke = 2.4, scale = 0.8, z = 0 } = {}) {
  const g = new Z.Group({ addTo, translate: { z } });
  for (const l of lines) new Z.Shape({ addTo: g, path: l.map(([x, y]) => ({ x: x * scale, y: y * scale })), closed: false, stroke, color });
  return g;
}
const smooth = k => k * k * (3 - 2 * k);

// Cada cena recebe (Z, illo) e devolve update(t) — t em segundos.
const SCENES_3D = {
  // poço do Tetris com pilha colorida: a peça I cai girando, encaixa no buraco, a linha pisca, some e a pilha desce
  blocos(Z, illo) {
    const C = 11, COLS = 8, X = c => (c - (COLS - 1) / 2) * C, Y = r => 40 - r * C;
    // fundo do poço com a grade apagada, paredes e chão
    const back = new Z.Group({ addTo: illo, translate: { z: -18 } }); // bem atrás: perto dos cubos, a Zdog o ordenaria na frente de alguns
    new Z.Rect({ addTo: back, width: COLS * C, height: 100, stroke: 1, fill: true, color: '#161a2e', translate: { y: -4 } });
    for (let c = 1; c < COLS; c++) new Z.Shape({ addTo: back, path: [{ x: X(c) - C / 2, y: -54 }, { x: X(c) - C / 2, y: 46 }], stroke: 0.5, color: '#262b48' });
    for (let r = 0; r < 9; r++) new Z.Shape({ addTo: back, path: [{ x: -COLS * C / 2, y: Y(r) - C / 2 }, { x: COLS * C / 2, y: Y(r) - C / 2 }], stroke: 0.5, color: '#262b48' });
    for (const s of [-1, 1]) slab(Z, illo, 6, 108, 36, '#3b4166', { translate: { x: s * (COLS * C / 2 + 3), y: -4 } });
    slab(Z, illo, COLS * C + 12, 6, 36, '#3b4166', { translate: { y: 49 } });
    // pilha: cada cubo é um bloco com as faces sombreadas (cores do jogo)
    const CYAN = '#4dc3ff';
    const ROW0 = ['#ff6b8a', '#ffd34d', '#8b6cff', '#3ddc97', '#ff8a5c', '#4dc3ff', null, '#ffd34d'];
    const ROW1 = ['#8b6cff', '#8b6cff', null, '#ff8a5c', '#ff8a5c', null, null, '#3ddc97'];
    const ROW2 = ['#8b6cff', null, null, null, '#ff8a5c', null, null, null];
    const block = (c, r, color) => ({ b: cube(Z, illo, C - 1, color, { translate: { x: X(c), y: Y(r) } }), c, r, color });
    const stack = [ROW0, ROW1, ROW2].flatMap((row, r) => row.map((color, c) => color && block(c, r, color)).filter(Boolean));
    // peça I: 4 cubos num Anchor que cai e gira; a sombra (contorno) mostra onde ela vai cair
    const piece = new Z.Anchor({ addTo: illo });
    const pieceCubes = [0, 1, 2, 3].map(i => cube(Z, piece, C - 1, CYAN, { translate: { y: (i - 1.5) * C } }));
    const ghost = new Z.Rect({ addTo: illo, width: C - 1, height: C * 4 - 1, stroke: 1.2, color: 'rgba(255,255,255,0.35)', translate: { x: X(6), y: Y(0) - 1.5 * C, z: 0 } });
    const flash = new Z.Rect({ addTo: illo, width: COLS * C, height: C, stroke: 2, fill: true, color: '#ffffff', translate: { y: Y(0), z: 6 } });
    return t => {
      const k = (t / 3.2) % 1;
      // 0–0,55: cai do alto, deitada, indo pra coluna 6 e girando pra ficar em pé
      const f = Math.min(1, k / 0.55), land = k >= 0.55;
      piece.visible = k < 0.8;
      piece.translate.set({ x: X(2) + (X(6) - X(2)) * smooth(Math.min(1, f * 1.6)), y: -60 + (Y(0) - 1.5 * C + 60) * (f * f), z: 0 });
      piece.rotate.z = (1 - smooth(Math.min(1, f * 1.4))) * (Math.PI / 2);
      ghost.visible = !land;
      // 0,55–0,8: a linha de baixo (agora completa) pisca; 0,8–1: some e o que estava em cima desce uma casa
      const blink = land && k < 0.8 && Math.floor(k * 40) % 2 === 0;
      flash.visible = blink;
      const drop = k < 0.8 ? 0 : smooth((k - 0.8) / 0.12 > 1 ? 1 : (k - 0.8) / 0.12);
      stack.forEach(s => {
        if (s.r === 0) { s.b.visible = k < 0.8; s.b.scale = 1; }
        else s.b.translate.y = Y(s.r) + drop * C;
      });
      // a peça que caiu: o cubo de baixo some com a linha, os outros 3 descem junto
      pieceCubes.forEach((pc, i) => { pc.visible = true; });
      if (k >= 0.8) {
        piece.visible = true;
        pieceCubes[3].visible = false;
        piece.translate.y = Y(0) - 1.5 * C + drop * C;
      }
      // volta ao começo: a linha de baixo reaparece crescendo (como se a pilha subisse de novo)
      if (k < 0.12) stack.forEach(s => { s.b.scale = s.r === 0 ? smooth(k / 0.12) : 1; });
      illo.rotate.x = -0.22;
      illo.rotate.y = Math.sin(t * 0.45) * 0.4;
    };
  },
  // cobrinha de esferas serpenteando em 3D atrás de uma maçã
  snake(Z, illo) {
    const segs = Array.from({ length: 9 }, (_, i) => new Z.Shape({ addTo: illo, stroke: 13 - i * 0.6, color: i ? shade('#3ddc97', -i * 0.05) : '#5ff0ac' }));
    const eyes = [-1, 1].map(s => new Z.Shape({ addTo: illo, stroke: 3, color: '#10131c' }));
    const apple = new Z.Anchor({ addTo: illo });
    new Z.Shape({ addTo: apple, stroke: 16, color: '#ff5c6c' });
    new Z.Shape({ addTo: apple, path: [{ y: -8 }, { y: -13, x: 2 }], stroke: 2, color: '#7a4a2a' });
    new Z.Ellipse({ addTo: apple, width: 7, height: 4, stroke: 2, fill: true, color: '#3ddc97', translate: { x: 5, y: -12 }, rotate: { z: -0.5 } });
    const at = s => ({ x: Math.cos(s) * 34, y: Math.sin(s * 2) * 14, z: Math.sin(s) * 26 });
    return t => {
      segs.forEach((seg, i) => { const p = at(t * 1.1 - i * 0.22); seg.translate.set(p); });
      const h = at(t * 1.1), h2 = at(t * 1.1 + 0.05);
      eyes.forEach((e, k) => e.translate.set({ x: h.x + (h2.z - h.z) * (k ? 25 : -25) * 0.15, y: h.y - 4, z: h.z + (k ? 4 : -4) }));
      apple.translate.set({ x: 0, y: Math.sin(t * 2) * 3, z: 0 });
      apple.rotate.y = t;
      illo.rotate.x = -0.35;
    };
  },
  // peças do 2048 em 3D: blocos arredondados flutuando e trocando de lugar
  g2048(Z, illo) {
    const colors = ['#eee4da', '#f2b179', '#f59563', '#f67c5f', '#edcf72', '#8b6cff'];
    const tiles = colors.map((c, i) => {
      const a = new Z.Anchor({ addTo: illo });
      new Z.Box({ addTo: a, width: 22, height: 22, depth: 8, stroke: 3, color: c, topFace: shade(c, 0.25), leftFace: shade(c, -0.12), rightFace: shade(c, -0.25), bottomFace: shade(c, -0.35), rearFace: shade(c, -0.15) });
      // "número" estilizado: pontinhos na face da frente (1 a 3)
      for (let d = 0; d <= i % 3; d++) new Z.Shape({ addTo: a, stroke: 4, color: shade(c, -0.55), translate: { x: (d - (i % 3) / 2) * 6, z: 5.5 } });
      return { a, x: ((i % 3) - 1) * 28, y: (Math.floor(i / 3) - 0.5) * 28, off: i * 0.9 };
    });
    return t => {
      for (const p of tiles) {
        p.a.translate.set({ x: p.x, y: p.y + Math.sin(t * 1.6 + p.off) * 4, z: Math.sin(t * 1.1 + p.off) * 10 });
        p.a.rotate.y = Math.sin(t * 0.8 + p.off) * 0.5;
      }
      illo.rotate.x = -0.3 + Math.sin(t * 0.4) * 0.1;
    };
  },
  // toupeiras saindo dos buracos
  toupeira(Z, illo) {
    // Zdog não recorta, então o "dentro do buraco" é feito pela ordem de desenho: num Group as peças saem
    // na ordem em que foram criadas — fundo do buraco, toupeira, monte de terra na frente (que a esconde)
    const HOLE = 26;
    const moles = [-28, 28].map((x, i) => {
      const g = new Z.Group({ addTo: illo, translate: { x } });
      new Z.Ellipse({ addTo: g, width: 34, height: 12, stroke: 2, fill: true, color: '#140f1f', translate: { y: HOLE } }); // fundo do buraco
      const a = new Z.Anchor({ addTo: g });
      const body = new Z.Shape({ addTo: a, path: [{ y: 4 }, { y: 30 }], stroke: 26, color: '#a3714c' }); // ombros: largos e curtos, até a boca do buraco
      [-1, 1].forEach(s => new Z.Shape({ addTo: a, stroke: 6, color: '#8c5a3a', translate: { x: s * 10, y: -10 } })); // orelhas (atrás da cabeça)
      new Z.Shape({ addTo: a, stroke: 24, color: '#b07a52' }); // cabeça
      new Z.Shape({ addTo: a, stroke: 9, color: '#e8b896', translate: { y: 4, z: 9 } }); // focinho
      new Z.Shape({ addTo: a, stroke: 4, color: '#ff8fa3', translate: { y: 1, z: 13 } }); // nariz
      [-1, 1].forEach(s => new Z.Shape({ addTo: a, stroke: 4, color: '#10131c', translate: { x: s * 5, y: -4, z: 10 } })); // olhos
      // monte de terra na frente: borda de baixo do buraco + barranco até embaixo
      new Z.Shape({
        addTo: g, fill: true, stroke: 2, color: '#6b4a32',
        path: [
          { x: -17, y: HOLE },
          { bezier: [{ x: -17, y: HOLE + 7 }, { x: 17, y: HOLE + 7 }, { x: 17, y: HOLE }] },
          { x: 24, y: HOLE + 6 },
          { bezier: [{ x: 22, y: HOLE + 34 }, { x: -22, y: HOLE + 34 }, { x: -24, y: HOLE + 6 }] },
        ],
      });
      new Z.Shape({ addTo: g, path: [{ x: -17, y: HOLE }, { bezier: [{ x: -17, y: HOLE + 7 }, { x: 17, y: HOLE + 7 }, { x: 17, y: HOLE }] }], closed: false, stroke: 2.5, color: '#8a6345' }); // beirada
      return { a, body, off: i * Math.PI };
    });
    return t => {
      for (const m of moles) {
        const k = Math.max(0, Math.sin(t * 1.6 + m.off)); // sobe, espia, desce
        const y = HOLE + 14 - smooth(k) * 28; // embaixo: inteira atrás do monte; em cima: cabeça e ombros pra fora
        m.a.translate.y = y;
        m.body.path[1].y = Math.max(4, HOLE + 4 - y); // o corpo termina sempre dentro do buraco
        m.body.updatePath();
        m.body.visible = y < HOLE + 4; // lá no fundo os ombros apareceriam por baixo do monte
        m.a.rotate.y = Math.sin(t * 3 + m.off) * 0.35 * k;
      }
    };
  },
  // raio girando e um anel que fica verde... e de repente vermelho
  reflexo(Z, illo) {
    const bolt = new Z.Anchor({ addTo: illo });
    const path = [{ x: 4, y: -26 }, { x: -10, y: 2 }, { x: 0, y: 2 }, { x: -4, y: 26 }, { x: 10, y: -4 }, { x: 0, y: -4 }];
    [-3, 0, 3].forEach((z, i) => new Z.Shape({ addTo: bolt, path: path.map(p => ({ ...p, z })), fill: true, stroke: 2.5, color: ['#c98c12', '#e0a91f', '#ffd34d'][i] }));
    const ringA = new Z.Anchor({ addTo: illo });
    const ring = new Z.Ellipse({ addTo: ringA, diameter: 62, stroke: 4, color: '#3ddc97' });
    return t => {
      bolt.rotate.y = t * 1.3;
      const k = (t * 0.45) % 1;
      ring.color = k < 0.72 ? '#3ddc97' : '#ff6b8a';
      ringA.scale = 0.92 + Math.sin(t * 3) * 0.05;
      ringA.rotate.x = Math.sin(t * 0.7) * 0.5;
    };
  },
  // cursor batendo e ondas de clique se espalhando
  clique(Z, illo) {
    const ripples = [0, 1, 2].map(() => { const a = new Z.Anchor({ addTo: illo }); return { a, e: new Z.Ellipse({ addTo: a, diameter: 20, stroke: 3, color: '#ffd34d' }) }; });
    const cur = new Z.Anchor({ addTo: illo, translate: { x: 6, y: 8 } });
    const arrow = [{ x: 0, y: 0 }, { x: 0, y: 24 }, { x: 6, y: 18 }, { x: 11, y: 28 }, { x: 15, y: 26 }, { x: 10, y: 16 }, { x: 18, y: 16 }].map(p => ({ x: p.x - 6, y: p.y - 12 }));
    [[-2.5, '#b9bccc'], [0, '#dfe1ea'], [2.5, '#ffffff']].forEach(([z, color]) => new Z.Shape({ addTo: cur, path: arrow.map(p => ({ ...p, z })), fill: true, stroke: 2, color }));
    return t => {
      ripples.forEach((r, i) => { const k = (t * 0.8 + i / 3) % 1; r.a.scale = 0.4 + k * 2.4; r.e.stroke = 4 * (1 - k) + 0.3; });
      const tap = Math.max(0, Math.sin(t * 5));
      cur.translate.z = 10 - tap * 8;
      cur.rotate.y = Math.sin(t * 0.9) * 0.5;
      illo.rotate.x = -0.2;
    };
  },
  // teclado em perspectiva com teclas sendo apertadas
  digitacao(Z, illo) {
    const marks = ['T', 'E', 'R', 'A', 'L'];
    const keys = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const a = new Z.Anchor({ addTo: illo, translate: { x: (c - 1.5) * 18 + r * 4, y: (r - 1) * 18 } });
      slab(Z, a, 15, 15, 7, '#2b2f45');
      const ch = marks[(r * 4 + c) % marks.length];
      if ((r * 4 + c) % 2 === 0) glyph(Z, a, LETTERS[ch], { color: '#cfd3ff', z: 4.5, scale: 0.6, stroke: 1.6 });
      keys.push(a);
    }
    return t => {
      const a = Math.floor(t * 5) % keys.length, b = Math.floor(t * 5 * 0.7 + 5) % keys.length;
      keys.forEach((k, i) => { k.translate.z = i === a || i === b ? -4 : 0; });
      illo.rotate.x = -0.75;
      illo.rotate.z = Math.sin(t * 0.5) * 0.1;
    };
  },
  // quatro botões do Genius acendendo em sequência
  memoria(Z, illo) {
    const colors = ['#3ddc97', '#ff6b8a', '#ffd34d', '#4dc3ff'];
    const pads = colors.map((c, i) => {
      const a = new Z.Anchor({ addTo: illo, translate: { x: (i % 2 - 0.5) * 30, y: (Math.floor(i / 2) - 0.5) * 30 } });
      slab(Z, a, 26, 26, 8, shade(c, -0.45));
      const glow = new Z.Rect({ addTo: a, width: 22, height: 22, stroke: 3, fill: true, color: shade(c, 0.2), translate: { z: 4.6 } });
      return { a, glow };
    });
    const seq = [0, 2, 1, 3, 2, 0, 3, 1];
    return t => {
      const lit = seq[Math.floor(t * 1.8) % seq.length];
      pads.forEach((p, i) => { p.glow.visible = i === lit; p.a.translate.z = i === lit ? 7 : 0; });
      illo.rotate.x = -0.45 + Math.sin(t * 0.6) * 0.15;
      illo.rotate.y = Math.sin(t * 0.4) * 0.4;
    };
  },
  // alvo num tripé de madeira: a mira desliza até um ponto, o dardo chega, crava, o alvo balança e solta faísca
  mira(Z, illo) {
    const wood = '#b9773e';
    // tripé + sombra no chão
    new Z.Ellipse({ addTo: illo, diameter: 56, stroke: 0, fill: true, color: 'rgba(0,0,0,0.28)', translate: { y: 50 }, rotate: { x: Z.TAU / 4 } });
    for (const [x, z] of [[-20, 8], [20, 8], [0, -18]])
      new Z.Shape({ addTo: illo, path: [{ y: 4, z: -4 }, { x, y: 50, z }], closed: false, stroke: 4, color: shade(wood, z < 0 ? -0.3 : 0) });
    const target = new Z.Anchor({ addTo: illo, translate: { y: -10 } });
    // aro (lateral) atrás; a face e os dardos cravados num Group: desenhados em ordem, como uma peça só
    new Z.Cylinder({ addTo: target, diameter: 62, length: 5, stroke: false, color: '#c9cbd8', backface: '#8a8ca0', translate: { z: -2.5 } });
    const face = new Z.Group({ addTo: target, translate: { z: 0.3 } });
    [[60, '#2b2d3f'], [54, '#ff5c6c'], [43, '#f5f5f7'], [32, '#ff5c6c'], [21, '#f5f5f7'], [10, '#ffd34d']].forEach(([d, color]) =>
      new Z.Ellipse({ addTo: face, diameter: d, stroke: 1, fill: true, color }));
    const makeDart = (addTo, z0) => {
      const d = new Z.Anchor({ addTo });
      new Z.Shape({ addTo: d, path: [{ z: z0 }, { z: z0 + 15 }], stroke: 2.4, color: '#d7d9e6' });
      new Z.Shape({ addTo: d, path: [{ z: z0 + 11 }, { z: z0 + 17, y: -5 }, { z: z0 + 17 }], fill: true, stroke: 1, color: '#4dc3ff' });
      new Z.Shape({ addTo: d, path: [{ z: z0 + 11 }, { z: z0 + 17, x: 5 }, { z: z0 + 17 }], fill: true, stroke: 1, color: '#3aa3dd' });
      return d;
    };
    const SPOTS = [[2, -3], [-12, 8], [9, 11], [-4, -14], [14, -6]];
    const stuck = [0, 1].map(() => makeDart(face, 0.5));
    const flying = makeDart(target, 0.5); // dentro do alvo: gira junto e crava exatamente no ponto
    const sparks = Array.from({ length: 7 }, (_, i) => ({ s: new Z.Shape({ addTo: target, stroke: 2.6, color: i % 2 ? '#ffd34d' : '#ffffff' }), a: (i / 7) * Z.TAU }));
    // mira (retícula) na frente de tudo
    const reticle = new Z.Group({ addTo: target });
    new Z.Ellipse({ addTo: reticle, diameter: 16, stroke: 1.6, color: '#ff4d5e' });
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) new Z.Shape({ addTo: reticle, path: [{ x: x * 5, y: y * 5 }, { x: x * 11, y: y * 11 }], stroke: 1.6, color: '#ff4d5e' });
    new Z.Shape({ addTo: reticle, stroke: 2, color: '#ff4d5e' });
    return t => {
      const step = t * 0.5, n = Math.floor(step), k = step % 1;
      const [sx, sy] = SPOTS[n % SPOTS.length], [px, py] = SPOTS[(n + SPOTS.length - 1) % SPOTS.length];
      // dardos já cravados: os das duas rodadas anteriores
      stuck.forEach((d, i) => { const [x, y] = SPOTS[(n + SPOTS.length - 1 - i) % SPOTS.length]; d.translate.set({ x, y }); });
      // a mira desliza do ponto anterior até o novo
      const g = smooth(Math.min(1, k / 0.4));
      reticle.translate.set({ x: px + (sx - px) * g, y: py + (sy - py) * g, z: 30 });
      reticle.scale = k < 0.45 ? 1 : 1 + Math.sin(Math.min(1, (k - 0.45) / 0.2) * Math.PI) * 0.25;
      // o dardo voa de trás da câmera até o ponto e crava em 0,55
      const fly = Math.min(1, Math.max(0, (k - 0.3) / 0.25));
      flying.visible = k >= 0.3;
      const hit = k >= 0.55;
      flying.translate.set({ x: sx + (1 - fly) * 26, y: sy - (1 - fly) * 30, z: hit ? 0 : (1 - smooth(fly)) * 110 });
      // impacto: o alvo balança e solta faísca
      const after = hit ? k - 0.55 : 0;
      target.rotate.x = hit ? Math.sin(after * 40) * 0.12 * Math.exp(-after * 9) : 0;
      target.rotate.y = 0.35 + Math.sin(t * 0.5) * 0.15 + (hit ? Math.sin(after * 34) * 0.08 * Math.exp(-after * 9) : 0);
      sparks.forEach(({ s, a }) => {
        s.visible = hit && after < 0.22;
        const r = 4 + (after / 0.22) * 16;
        s.translate.set({ x: sx + Math.cos(a) * r, y: sy + Math.sin(a) * r, z: 10 });
        s.stroke = 2.8 * (1 - after / 0.22) + 0.4;
      });
      illo.rotate.x = -0.12;
    };
  },
  // + − × ÷ girando em órbita
  matematica(Z, illo) {
    const sym = (lines, dots, color) => {
      const a = new Z.Anchor({ addTo: illo });
      lines.forEach(l => new Z.Shape({ addTo: a, path: l, closed: false, stroke: 6, color }));
      dots.forEach(d => new Z.Shape({ addTo: a, translate: d, stroke: 7, color }));
      return a;
    };
    const s = 9;
    const items = [
      sym([[{ x: -s }, { x: s }], [{ y: -s }, { y: s }]], [], '#3ddc97'),
      sym([[{ x: -s }, { x: s }]], [], '#ff6b8a'),
      sym([[{ x: -s, y: -s }, { x: s, y: s }], [{ x: s, y: -s }, { x: -s, y: s }]], [], '#ffd34d'),
      sym([[{ x: -s }, { x: s }]], [{ y: -8 }, { y: 8 }], '#4dc3ff'),
    ];
    return t => {
      items.forEach((a, i) => {
        const ang = t * 0.7 + i * Z.TAU / 4;
        a.translate.set({ x: Math.cos(ang) * 32, y: Math.sin(ang * 2) * 6, z: Math.sin(ang) * 32 });
        a.rotate.y = t * 1.5 + i;
      });
      illo.rotate.x = -0.3;
    };
  },
  // passarinho batendo asas entre canos com borda, nuvens ao fundo, chão rolando e uma estrela pra pegar
  voa(Z, illo) {
    const W = 170; // largura do "mundo" que passa (as coisas saem por um lado e voltam pelo outro)
    const wrap = x => ((x % W) + W * 1.5) % W - W / 2;
    // nuvens lá atrás
    const clouds = [[-40, -46, 0], [30, -34, 0.45], [70, -52, 0.8]].map(([x, y]) => {
      const a = new Z.Anchor({ addTo: illo, translate: { y, z: -40 } });
      for (const [cx, cy, s] of [[0, 0, 16], [-9, 3, 11], [9, 3, 12], [4, -5, 11]]) new Z.Shape({ addTo: a, stroke: s, color: '#dfe6ff', translate: { x: cx, y: cy } });
      return { a, x };
    });
    // canos: corpo + borda mais larga, com uma faixa de brilho na frente
    const GREEN = '#3ddc97', DARK = '#23a86d';
    const pipe = (addTo, dir) => {
      const p = new Z.Anchor({ addTo });
      new Z.Cylinder({ addTo: p, diameter: 18, length: 60, stroke: false, color: GREEN, backface: DARK, translate: { y: dir * 45 }, rotate: { x: Z.TAU / 4 } });
      new Z.Cylinder({ addTo: p, diameter: 24, length: 8, stroke: false, color: '#5ff0ac', backface: DARK, translate: { y: dir * 18 }, rotate: { x: Z.TAU / 4 } });
      new Z.Shape({ addTo: p, path: [{ y: dir * 22 }, { y: dir * 72 }], stroke: 2.5, color: '#b5ffd9', translate: { x: -4, z: 8.6 } });
      return p;
    };
    const pipes = [[0, -8], [0.5, 10]].map(([off, gap]) => {
      const a = new Z.Anchor({ addTo: illo, translate: { y: gap } });
      pipe(a, -1); pipe(a, 1);
      return { a, off };
    });
    // chão: faixa de grama + terra, com listras andando
    cube(Z, illo, 1, '#c98a4b', { width: 180, height: 14, depth: 24, translate: { y: 66 } });
    cube(Z, illo, 1, '#3ddc97', { width: 180, height: 4, depth: 24, translate: { y: 58 } });
    const stripes = Array.from({ length: 9 }, (_, i) => ({ s: new Z.Shape({ addTo: illo, path: [{ x: 0, y: 0 }, { x: -5, y: 8 }], stroke: 2.2, color: '#a96d35', translate: { y: 64, z: 12.2 } }), x: i * 20 }));
    // estrela (+3) com volume, no vão do segundo cano
    const star = new Z.Anchor({ addTo: pipes[1].a });
    const starPath = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 3.6 : 8, a = -Math.PI / 2 + i * Math.PI / 5; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; });
    ['#c98c12', '#e0a91f', '#ffd34d'].forEach((color, i) => new Z.Shape({ addTo: star, path: starPath, fill: true, stroke: 2, color, translate: { z: -2 + i * 2 } }));
    // passarinho
    const bird = new Z.Anchor({ addTo: illo, translate: { x: -18, z: 10 } });
    new Z.Shape({ addTo: bird, path: [{ x: -12, y: -2 }, { x: -19, y: -6 }, { x: -18, y: 2 }], fill: true, stroke: 3, color: '#e8b730' }); // rabinho
    new Z.Shape({ addTo: bird, stroke: 28, color: '#ffd34d' });
    new Z.Shape({ addTo: bird, stroke: 14, color: '#fff3c4', translate: { y: 6, z: 6 } });
    new Z.Shape({ addTo: bird, stroke: 10, color: '#ffffff', translate: { x: 7, y: -5, z: 8 } });
    new Z.Shape({ addTo: bird, stroke: 4.5, color: '#10131c', translate: { x: 8.8, y: -5, z: 11.5 } });
    new Z.Shape({ addTo: bird, stroke: 1.6, color: '#ffffff', translate: { x: 9.6, y: -6.2, z: 13 } });
    new Z.Cone({ addTo: bird, diameter: 9, length: 9, stroke: false, color: '#ff8a5c', translate: { x: 12, y: 1 }, rotate: { y: Z.TAU / 4 } });
    const wing = new Z.Ellipse({ addTo: bird, width: 16, height: 10, stroke: 3, fill: true, color: '#e8b730', translate: { x: -5, y: 2, z: 13 } });
    return t => {
      const scroll = t * 34;
      clouds.forEach(c => { c.a.translate.x = wrap(c.x - t * 6); });
      pipes.forEach(p => { p.a.translate.x = wrap(70 - p.off * W - scroll); });
      stripes.forEach(s => { s.s.translate.x = wrap(s.x - scroll); });
      // o passarinho mira o vão do próximo cano (sobe e desce suave) e bate asas mais rápido quando sobe
      const next = pipes.reduce((a, b) => (b.a.translate.x > -18 && (a == null || b.a.translate.x < a.a.translate.x) ? b : a), null) || pipes[0];
      const goal = next.a.translate.y + Math.sin(t * 3) * 4;
      bird.translate.y += (goal - bird.translate.y) * 0.06;
      const up = goal < bird.translate.y;
      bird.rotate.z = Math.max(-0.4, Math.min(0.4, (bird.translate.y - goal) * 0.04));
      wing.rotate.x = Math.sin(t * (up ? 22 : 12)) * 0.9;
      // a estrela gira e some quando o passarinho passa por ela
      const sx = pipes[1].a.translate.x;
      star.rotate.y = t * 3;
      star.visible = sx > -14;
      star.scale = sx > -8 ? 1 : Math.max(0.01, (sx + 14) / 6) * 1.4;
      illo.rotate.y = -0.3;
      illo.rotate.x = -0.08;
    };
  },
  // insetos caindo e girando
  chuva(Z, illo) {
    const bug = (color, spots) => {
      const a = new Z.Anchor({ addTo: illo });
      [-1, 0, 1].forEach(r => [-1, 1].forEach(s => new Z.Shape({ addTo: a, path: [{ x: s * 4, y: r * 4 }, { x: s * 11, y: r * 5 + 3 }], stroke: 1.8, color: '#2a2d3d' })));
      new Z.Shape({ addTo: a, stroke: 16, color, translate: { y: 3 } });
      new Z.Shape({ addTo: a, stroke: 10, color: '#2a2d3d', translate: { y: -8 } });
      [-1, 1].forEach(s => {
        new Z.Shape({ addTo: a, path: [{ x: s * 2, y: -11 }, { x: s * 6, y: -17 }], stroke: 1.5, color: '#2a2d3d' });
        new Z.Shape({ addTo: a, stroke: 2.5, color: '#fff', translate: { x: s * 2.5, y: -9, z: 4.5 } });
      });
      if (spots) [[-3, 0], [3, 2], [-2, 6], [3, 7]].forEach(([x, y]) => new Z.Shape({ addTo: a, stroke: 3.5, color: '#1a1a1a', translate: { x, y, z: 7 } }));
      return a;
    };
    const bugs = [['#3ddc97', false], ['#ff5c6c', true], ['#8b6cff', false], ['#ffd34d', true]].map(([c, sp], i) => ({ a: bug(c, sp), x: [-28, 22, -6, 32][i], z: [10, -12, 24, -26][i], off: i * 0.25 }));
    return t => {
      for (const b of bugs) {
        const k = (t * 0.12 + b.off) % 1;
        b.a.translate.set({ x: b.x + Math.sin(t + b.off * 9) * 6, y: -75 + k * 150, z: b.z });
        b.a.rotate.z = Math.sin(t * 1.3 + b.off * 7) * 0.8;
        b.a.rotate.y = t * 0.8 + b.off * 5;
      }
    };
  },
  // esferas coloridas girando em volta de uma que troca de cor
  cores(Z, illo) {
    const ring = new Z.Anchor({ addTo: illo, rotate: { x: 0.9 } });
    const balls = PALETTE.map((c, i) => new Z.Shape({ addTo: ring, stroke: 13, color: c, translate: { x: Math.cos(i * Z.TAU / 6) * 36, y: Math.sin(i * Z.TAU / 6) * 36 } }));
    const center = new Z.Shape({ addTo: illo, stroke: 24, color: PALETTE[0] });
    const shine = new Z.Shape({ addTo: illo, stroke: 6, color: '#ffffff', translate: { x: -5, y: -5, z: 10 } });
    return t => {
      ring.rotate.z = t * 0.6;
      center.color = PALETTE[Math.floor(t * 0.9) % PALETTE.length];
      center.translate.y = shine.translate.y = Math.sin(t * 2) * 3;
      shine.translate.y -= 5;
      balls.forEach((b, i) => { b.stroke = 12 + Math.sin(t * 3 + i) * 2; });
    };
  },
  // números em placas; a próxima da sequência levanta
  numeros(Z, illo) {
    const nums = [3, 7, 1, 9, 4, 6];
    const tiles = nums.map((n, i) => {
      const a = new Z.Anchor({ addTo: illo, translate: { x: (i % 3 - 1) * 25, y: (Math.floor(i / 3) - 0.5) * 30 } });
      slab(Z, a, 21, 26, 6, '#2b2f45');
      glyph(Z, a, digitLines(n), { color: '#e8e9f3', z: 3.8, scale: 1, stroke: 2.2 });
      return { a, n };
    });
    const order = [...tiles].sort((x, y) => x.n - y.n);
    return t => {
      const cur = order[Math.floor(t * 1.2) % order.length];
      tiles.forEach((p, i) => {
        p.a.translate.z = p === cur ? 10 : Math.sin(t * 1.5 + i) * 2;
        p.a.rotate.y = p === cur ? Math.sin(t * 6) * 0.15 : 0;
      });
      illo.rotate.x = -0.35;
      illo.rotate.y = Math.sin(t * 0.5) * 0.35;
    };
  },
  // bloco 3×3 de Sudoku: uma casa sobe por vez e os números aparecem nas vazias
  sudoku(Z, illo) {
    const board = [5, 0, 3, 0, 7, 0, 8, 0, 2], fill = [4, 1, 6, 9];
    let k = 0;
    const tiles = board.map((n, i) => {
      const a = new Z.Anchor({ addTo: illo, translate: { x: (i % 3 - 1) * 24, y: (Math.floor(i / 3) - 1) * 24 } });
      slab(Z, a, 21, 21, 5, n ? '#2b2f45' : '#3a4066');
      const g = glyph(Z, a, digitLines(n || fill[k++ % fill.length]), { color: n ? '#e8e9f3' : '#ffd34d', z: 3.2, scale: 0.95, stroke: 2.2 });
      return { a, g, empty: !n };
    });
    const empties = tiles.filter(p => p.empty);
    return t => {
      const cur = Math.floor(t * 1.4) % 9, shown = Math.floor((t * 0.9) % (empties.length + 2));
      tiles.forEach((p, i) => {
        p.a.translate.z = i === cur ? 9 : Math.sin(t * 1.5 + i) * 1.5;
        p.a.rotate.y = i === cur ? Math.sin(t * 6) * 0.12 : 0;
        if (p.empty) p.g.visible = empties.indexOf(p) < shown;
      });
      illo.rotate.x = -0.38;
      illo.rotate.y = Math.sin(t * 0.5) * 0.35;
    };
  },
  // parede de tijolos, raquete e bolinha quicando
  tijolos(Z, illo) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++)
      cube(Z, illo, 1, PALETTE[r + 1], { width: 16, height: 7, depth: 7, translate: { x: (c - 1.5) * 18, y: -30 + r * 9 } });
    const paddle = cube(Z, illo, 1, '#c9ccd8', { width: 26, height: 5, depth: 8, translate: { y: 34 } });
    const ball = new Z.Shape({ addTo: illo, stroke: 8, color: '#ffffff' });
    return t => {
      const k = (t * 0.55) % 1, bx = Math.sin(t * 1.1) * 28;
      ball.translate.set({ x: bx, y: 28 - Math.abs(Math.sin(k * Math.PI)) * 46, z: 2 });
      paddle.translate.x = bx * 0.85;
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.4) * 0.35;
    };
  },
  // pilha de blocos; o de cima vai e volta esperando a hora certa
  torre(Z, illo) {
    for (let i = 0; i < 4; i++) cube(Z, illo, 1, PALETTE[i], { width: 40 - i * 3, height: 9, depth: 26 - i * 2, translate: { y: 30 - i * 10, x: (i % 2 ? 2 : -2) } });
    const top = cube(Z, illo, 1, PALETTE[4], { width: 28, height: 9, depth: 18, translate: { y: -10 } });
    return t => {
      top.translate.x = Math.sin(t * 1.8) * 26;
      illo.rotate.y = -0.5 + Math.sin(t * 0.4) * 0.3;
      illo.rotate.x = -0.35;
    };
  },
  // três invasores de pixel marchando (perninhas em 2 quadros), a nave atira e o do meio explode em pixels
  invasores(Z, illo) {
    // pixel art em 2 quadros (as perninhas mexem), igual ao jogo clássico
    const CRAB = [['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'],
      ['..X.....X..', 'X..X...X..X', 'X.XXXXXXX.X', 'XXX.XXX.XXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..X.....X..', '.X.......X.']];
    const SQUID = [['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '..X..X..', '.X.XX.X.', 'X.X..X.X'],
      ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '.X.XX.X.', 'X......X', '.X....X.']];
    const P = 4.4;
    // cada quadro: placa da frente + sombra atrás, num Group (desenhado em ordem, como uma peça só)
    const sprite = (addTo, frames, color) => frames.map(art => {
      const g = new Z.Group({ addTo });
      const w = art[0].length, h = art.length;
      for (const [z, c] of [[-2.5, shade(color, -0.5)], [2.5, color]])
        art.forEach((row, y) => [...row].forEach((ch, x) => {
          if (ch === 'X') new Z.Rect({ addTo: g, width: P - 0.5, height: P - 0.5, stroke: 0.6, fill: true, color: c, translate: { x: (x - (w - 1) / 2) * P, y: (y - (h - 1) / 2) * P, z } });
        }));
      return g;
    });
    const mk = (x, y, z, s, frames, color) => {
      const a = new Z.Anchor({ addTo: illo, translate: { x, y, z }, scale: s });
      return { a, frames: sprite(a, frames, color), x, y, color };
    };
    const left = mk(-42, -34, -14, 0.62, SQUID, '#3ddc97'), right = mk(42, -34, -14, 0.62, SQUID, '#ff6b8a');
    const boss = mk(0, -14, 0, 1, CRAB, '#9b80ff');
    // estrelinhas ao fundo
    const stars = Array.from({ length: 10 }, (_, i) => new Z.Shape({ addTo: illo, stroke: 1.6, color: '#c9cce0', translate: { x: ((i * 37) % 140) - 70, y: ((i * 53) % 100) - 60, z: -50 } }));
    // nave: base, cabine e canhão
    const ship = new Z.Anchor({ addTo: illo, translate: { y: 52, z: 4 } });
    slab(Z, ship, 30, 7, 10, '#3ddc97');
    slab(Z, ship, 14, 5, 8, '#5ff0ac', { translate: { y: -5.5 } });
    slab(Z, ship, 4, 6, 4, '#b5ffd9', { translate: { y: -10 } });
    const laser = new Z.Shape({ addTo: illo, path: [{ y: 0 }, { y: 9 }], stroke: 2.6, color: '#7dfcc6' });
    const bomb = new Z.Shape({ addTo: illo, path: [{ x: 0, y: 0 }, { x: 2, y: 3 }, { x: -2, y: 6 }, { x: 0, y: 9 }], closed: false, stroke: 1.8, color: '#ff8a9e' });
    const bits = Array.from({ length: 12 }, (_, i) => ({ s: new Z.Rect({ addTo: illo, width: 3.6, height: 3.6, stroke: 0.6, fill: true, color: i % 3 ? '#9b80ff' : '#ffffff' }), a: (i / 12) * Z.TAU + (i % 2) * 0.2, v: 0.7 + (i % 3) * 0.25 }));
    return t => {
      const frame = Math.floor(t * 2) % 2, march = Math.round(Math.sin(t * 0.9) * 3) * 4;
      for (const inv of [left, right, boss]) {
        inv.frames.forEach((g, i) => { g.visible = i === frame; });
        inv.a.translate.x = inv.x + march;
      }
      // ciclo de 2,4s: a nave mira, atira, o laser sobe e acerta o invasor do meio, que explode e volta
      const k = (t / 2.4) % 1, bx = boss.a.translate.x;
      ship.translate.x = bx + Math.sin(t * 1.7) * 3 * (k < 0.3 ? 1 : 0);
      const shot = k >= 0.25 && k < 0.45, hitK = (k - 0.45) / 0.3;
      laser.visible = shot;
      laser.translate.set({ x: ship.translate.x, y: 40 - ((k - 0.25) / 0.2) * 52, z: 4 });
      const dead = k >= 0.45 && k < 0.8;
      boss.a.visible = !dead;
      boss.a.scale = k >= 0.8 ? smooth(Math.min(1, (k - 0.8) / 0.15)) : 1;
      bits.forEach(({ s, a, v }) => {
        s.visible = dead && hitK < 0.7;
        const r = 4 + hitK * 40 * v;
        s.translate.set({ x: bx + Math.cos(a) * r, y: -14 + Math.sin(a) * r + hitK * hitK * 20, z: 2 });
        s.rotate.z = hitK * 6 * v;
      });
      // bomba em zigue-zague caindo do invasor da esquerda
      const bk = (t * 0.55) % 1;
      bomb.translate.set({ x: left.a.translate.x, y: -24 + bk * 90, z: -6 });
      bomb.visible = bk < 0.85;
      stars.forEach((s, i) => { s.stroke = 1.2 + Math.max(0, Math.sin(t * 2 + i * 1.7)) * 1.4; });
      illo.rotate.x = -0.12;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // campo de quadradinhos, bomba com pavio aceso e bandeira tremulando
  minado(Z, illo) {
    const board = new Z.Anchor({ addTo: illo, translate: { y: 18 }, rotate: { x: -1.05 } });
    const shown = { 1: [1, '#4dc3ff'], 3: [2, '#3ddc97'], 5: [3, '#ff6b8a'] };
    for (let i = 0; i < 9; i++) {
      const a = new Z.Anchor({ addTo: board, translate: { x: (i % 3 - 1) * 21, y: (Math.floor(i / 3) - 1) * 21 } });
      if (shown[i]) {
        slab(Z, a, 19, 19, 2, '#33374f');
        glyph(Z, a, digitLines(shown[i][0]), { color: shown[i][1], z: 1.6, scale: 0.9, stroke: 2.2 });
      } else slab(Z, a, 19, 19, 6, '#6b7091');
    }
    const bomb = new Z.Anchor({ addTo: illo, translate: { x: -14 } });
    new Z.Shape({ addTo: bomb, stroke: 22, color: '#22242f' });
    new Z.Shape({ addTo: bomb, stroke: 5, color: '#5a5f7a', translate: { x: -4, y: -5, z: 9 } });
    new Z.Shape({ addTo: bomb, path: [{ x: 5, y: -9 }, { x: 9, y: -15 }, { x: 13, y: -14 }], closed: false, stroke: 2, color: '#c9a36b' });
    const spark = new Z.Shape({ addTo: bomb, stroke: 6, color: '#ffd34d', translate: { x: 13, y: -15 } });
    const flag = new Z.Anchor({ addTo: illo, translate: { x: 22, y: 8 } });
    new Z.Shape({ addTo: flag, path: [{ y: 0 }, { y: -30 }], stroke: 2.5, color: '#c9ccd8' });
    const cloth = new Z.Shape({ addTo: flag, path: [{ y: -30 }, { x: 14, y: -24 }, { y: -18 }], fill: true, stroke: 2, color: '#ff5c6c' });
    return t => {
      bomb.translate.y = -18 + Math.sin(t * 1.8) * 4;
      bomb.rotate.z = Math.sin(t * 1.2) * 0.25;
      spark.stroke = 4 + Math.abs(Math.sin(t * 13)) * 4;
      spark.color = Math.sin(t * 9) > 0 ? '#ffd34d' : '#ff8a5c';
      cloth.rotate.y = Math.sin(t * 4) * 0.5;
      illo.rotate.y = Math.sin(t * 0.4) * 0.3;
    };
  },
  // equalizador pulando e notas subindo
  ritmo(Z, illo) {
    const bars = [0, 1, 2, 3, 4].map(i => {
      const a = new Z.Anchor({ addTo: illo, translate: { x: (i - 2) * 13, y: 36 } });
      cube(Z, a, 1, PALETTE[i], { width: 9, height: 40, depth: 9, translate: { y: -20 } });
      return a;
    });
    const note = color => {
      const a = new Z.Anchor({ addTo: illo });
      new Z.Ellipse({ addTo: a, width: 11, height: 8, stroke: 3, fill: true, color, rotate: { z: -0.4 } });
      new Z.Shape({ addTo: a, path: [{ x: 5, y: -1 }, { x: 5, y: -20 }], stroke: 2.2, color });
      new Z.Shape({ addTo: a, path: [{ x: 5, y: -20 }, { bezier: [{ x: 9, y: -18 }, { x: 13, y: -14 }, { x: 10, y: -8 }] }], closed: false, stroke: 2.2, color });
      return a;
    };
    const notes = [note('#ffffff'), note('#ffd34d')];
    return t => {
      bars.forEach((a, i) => { a.scale = { x: 1, y: 0.3 + Math.abs(Math.sin(t * 3.2 + i * 1.3)) * 0.7, z: 1 }; });
      notes.forEach((n, i) => {
        const k = (t * 0.3 + i * 0.5) % 1;
        n.translate.set({ x: -18 + i * 30 + Math.sin(t * 2 + i) * 6, y: 10 - k * 70, z: 12 });
        n.rotate.y = Math.sin(t * 1.5 + i) * 0.6;
      });
      illo.rotate.x = -0.2;
      illo.rotate.y = Math.sin(t * 0.35) * 0.4;
    };
  },
  // peças de letra trocando de lugar
  anagrama(Z, illo) {
    const word = ['L', 'E', 'T', 'R', 'A'];
    const tiles = word.map(ch => {
      const a = new Z.Anchor({ addTo: illo });
      slab(Z, a, 18, 20, 5, '#f4e3b5');
      glyph(Z, a, LETTERS[ch], { color: '#3a2a12', z: 3.2, scale: 0.9, stroke: 2.4 });
      return a;
    });
    const perms = [[0, 1, 2, 3, 4], [3, 0, 4, 1, 2], [2, 4, 0, 1, 3], [4, 3, 1, 0, 2]];
    const slot = i => (i - 2) * 21;
    return t => {
      const step = t * 0.5, n = Math.floor(step), k = smooth(Math.min(1, (step - n) * 1.6));
      const p0 = perms[n % perms.length], p1 = perms[(n + 1) % perms.length];
      tiles.forEach((a, i) => {
        a.translate.set({ x: slot(p0[i]) + (slot(p1[i]) - slot(p0[i])) * k, y: Math.sin(t * 2 + i) * 2, z: Math.sin(k * Math.PI) * 16 * (i % 2 ? 1 : -1) });
        a.rotate.y = Math.sin(k * Math.PI) * 0.6;
      });
      illo.rotate.x = -0.25;
      illo.rotate.y = Math.sin(t * 0.4) * 0.3;
    };
  },
  // raquetes e bolinha trocando de lado
  pong(Z, illo) {
    const top = cube(Z, illo, 1, '#ff6b8a', { width: 30, height: 6, depth: 8, translate: { y: -38 } });
    const bot = cube(Z, illo, 1, '#e8eaf6', { width: 30, height: 6, depth: 8, translate: { y: 38 } });
    for (let i = -3; i <= 3; i++) new Z.Shape({ addTo: illo, stroke: 3, color: '#3b4062', translate: { y: i * 10 } });
    const ball = new Z.Shape({ addTo: illo, stroke: 9, color: '#ffd34d' });
    return t => {
      const k = (t * 0.7) % 2, u = k < 1 ? k : 2 - k, bx = Math.sin(t * 1.3) * 22;
      ball.translate.set({ x: bx, y: -32 + u * 64, z: 2 });
      top.translate.x = Math.sin(t * 1.3 - 0.6) * 20;
      bot.translate.x = bx * 0.9;
      illo.rotate.x = -0.45;
      illo.rotate.y = Math.sin(t * 0.4) * 0.35;
    };
  },
  // forca de madeira num tablado, boneco balançando na corda e a palavra TELA aparecendo letra por letra
  forca(Z, illo) {
    const wood = '#c98a4b', skin = '#f4e3b5';
    // tablado, poste, viga e mão-francesa (tudo com volume)
    slab(Z, illo, 74, 7, 22, shade(wood, -0.2), { translate: { x: -4, y: 26 } });
    slab(Z, illo, 7, 76, 7, wood, { translate: { x: -28, y: -15 } });
    slab(Z, illo, 50, 7, 7, wood, { translate: { x: -6, y: -50 } });
    new Z.Shape({ addTo: illo, path: [{ x: -28, y: -32 }, { x: -12, y: -48 }], stroke: 4.5, color: shade(wood, -0.1) });
    // corda e laço
    new Z.Shape({ addTo: illo, path: [{ x: 14, y: -47 }, { x: 14, y: -36 }], stroke: 2, color: '#e8d7a8' });
    // boneco (pendurado no ponto da corda): cabeça com olhos em X, camisa azul, braços e pernas
    const man = new Z.Anchor({ addTo: illo, translate: { x: 14, y: -36 } });
    new Z.Ellipse({ addTo: man, diameter: 7, stroke: 2, color: '#e8d7a8', translate: { y: 2 }, rotate: { x: Z.TAU / 4 } });
    const head = new Z.Group({ addTo: man, translate: { y: 9 } });
    new Z.Shape({ addTo: head, stroke: 14, color: skin });
    for (const ex of [-3, 3]) for (const d of [1, -1]) new Z.Shape({ addTo: head, path: [{ x: ex - 1.6, y: -1.6 * d - 1 }, { x: ex + 1.6, y: 1.6 * d - 1 }], stroke: 1.2, color: '#3a2a12', translate: { z: 6.6 } });
    new Z.Shape({ addTo: head, path: [{ x: -2, y: 3.5 }, { x: 2, y: 3.5 }], stroke: 1.2, color: '#3a2a12', translate: { z: 6.4 } });
    new Z.Shape({ addTo: man, path: [{ y: 17 }, { y: 31 }], stroke: 7, color: '#4dc3ff' });
    for (const s of [-1, 1]) {
      new Z.Shape({ addTo: man, path: [{ y: 19 }, { x: s * 9, y: 29 }], stroke: 3.5, color: skin });
      new Z.Shape({ addTo: man, path: [{ y: 32 }, { x: s * 6, y: 46 }], stroke: 3.8, color: '#3a3f5c' });
    }
    // palavra: 4 placas; a letra aparece (e a placa pula) uma de cada vez; completou, todas ficam verdes
    const WORD = 'TELA';
    const tiles = [...WORD].map((ch, i) => {
      const a = new Z.Anchor({ addTo: illo, translate: { x: (i - 1.5) * 19, y: 50 } });
      const box = slab(Z, a, 16, 17, 5, '#2b2f45');
      const face = new Z.Group({ addTo: a, translate: { z: 3.4 } });
      const front = new Z.Rect({ addTo: face, width: 14, height: 15, stroke: 2, fill: true, color: '#2b2f45' });
      const line = new Z.Shape({ addTo: face, path: [{ x: -4, y: 5.5 }, { x: 4, y: 5.5 }], stroke: 1.6, color: '#8a8fb5' });
      const letter = glyph(Z, face, LETTERS[ch], { color: '#ffffff', z: 0.4, scale: 0.65, stroke: 2.2 });
      return { a, box, front, line, letter };
    });
    const paint = (o, c) => {
      o.box.color = o.box.frontFace = c; o.box.topFace = shade(c, 0.25); o.box.leftFace = shade(c, -0.12);
      o.box.rightFace = shade(c, -0.25); o.box.bottomFace = shade(c, -0.35); o.box.rearFace = shade(c, -0.15); o.front.color = c;
    };
    let state = '';
    return t => {
      const step = (t * 0.8) % 6, shown = Math.min(4, Math.floor(step)), done = shown === 4;
      const key = shown + (done ? 'ok' : '');
      if (key !== state) { tiles.forEach((o, i) => paint(o, done ? '#3ddc97' : i < shown ? '#4b4f7a' : '#2b2f45')); state = key; }
      tiles.forEach((o, i) => {
        o.letter.visible = i < shown;
        o.line.visible = i >= shown;
        const pop = i === shown - 1 && !done ? Math.sin(Math.min(1, (step % 1) * 2.5) * Math.PI) : done ? Math.max(0, Math.sin((step - 4) * Math.PI * 2 + i * 0.6)) * 0.6 : 0;
        o.a.translate.z = pop * 8;
      });
      // balanço: mais forte no começo da rodada; aliviado (quase parado) quando a palavra sai
      const sw = done ? 0.06 : 0.22;
      man.rotate.z = Math.sin(t * 2) * sw;
      illo.rotate.x = -0.15;
      illo.rotate.y = Math.sin(t * 0.45) * 0.4;
    };
  },
  // tabuleiro azul (casa por casa, pra Zdog não esconder as peças) e uma peça caindo
  ligue4(Z, illo) {
    const xs = [-22, 0, 22], ys = [-22, 0, 22], cols = ['#ff6b8a', '#ffd34d'];
    const grid = [[-1, -1, -1], [0, 1, 1], [1, 0, 0]]; // -1 = casa vazia
    ys.forEach((y, r) => xs.forEach((x, c) => {
      const a = new Z.Anchor({ addTo: illo, translate: { x, y } });
      slab(Z, a, 22, 22, 5, '#3454d1');
      const v = grid[r][c];
      new Z.Shape({ addTo: a, stroke: 13, color: v < 0 ? '#12162a' : cols[v], translate: { z: 3.5 } });
    }));
    const drop = new Z.Shape({ addTo: illo, stroke: 13, color: cols[0], translate: { z: 7 } });
    return t => {
      const k = (t * 0.7) % 1, n = Math.floor(t * 0.7), c = n % 3;
      drop.translate.set({ x: xs[c], y: -62 + 40 * k * k, z: 7 });
      drop.color = cols[n % 2];
      drop.visible = k < 0.97;
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.4;
    };
  },
  // pássaro corredor (o do jogo) correndo no lugar numa ilha de areia, com saguaro e sol ao fundo
  corredor(Z, illo) {
    const BODY = '#4d5fd6', DARK = '#2b3390', MID = '#3a46b0', LIGHT = '#8fa0ff', G = '#4daa58';
    // ilha de areia (disco deitado) com pedrinhas
    new Z.Cylinder({ addTo: illo, diameter: 96, length: 9, stroke: false, color: '#c98a4c', backface: '#f0bb78', translate: { y: 34 }, rotate: { x: Z.TAU / 4 } });
    [[-30, 8, '#b98656'], [34, -10, '#a07048'], [10, 22, '#cf9d68']].forEach(([x, z, color]) => new Z.Shape({ addTo: illo, stroke: 4, color, translate: { x, y: 29, z } }));
    // sol com halo, atrás de tudo
    new Z.Shape({ addTo: illo, stroke: 40, color: 'rgba(255,200,110,.28)', translate: { x: 22, y: -30, z: -44 } });
    new Z.Shape({ addTo: illo, stroke: 28, color: '#ffcf6a', translate: { x: 22, y: -30, z: -44 } });
    // saguaro gordinho: tronco e braços em cápsula, faixa clara de brilho e flor
    const cac = new Z.Anchor({ addTo: illo, translate: { x: 30, y: 30, z: -14 } });
    new Z.Shape({ addTo: cac, path: [{ y: 0 }, { y: -30 }], stroke: 13, color: G });
    new Z.Shape({ addTo: cac, path: [{ y: -12 }, { x: -10, y: -12 }, { x: -10, y: -22 }], closed: false, stroke: 7.5, color: G });
    new Z.Shape({ addTo: cac, path: [{ y: -18 }, { x: 10, y: -18 }, { x: 10, y: -26 }], closed: false, stroke: 7.5, color: '#3d9a4c' });
    new Z.Shape({ addTo: cac, path: [{ x: -2.5, y: -2 }, { x: -2.5, y: -30 }], stroke: 3, color: '#86dc88', translate: { z: 5 } });
    const flower = new Z.Group({ addTo: cac, translate: { y: -38, z: 2 } });
    for (let k = 0; k < 5; k++) new Z.Shape({ addTo: flower, stroke: 4, color: '#ff6f91', translate: { x: Math.cos(k * Z.TAU / 5) * 3, y: Math.sin(k * Z.TAU / 5) * 3 } });
    new Z.Shape({ addTo: flower, stroke: 3, color: '#ffe36b', translate: { z: 1 } });

    const bird = new Z.Anchor({ addTo: illo, translate: { x: -14, y: 30, z: 8 } });
    // pernas (atrás e na frente do corpo) balançando em sentidos opostos
    const legs = [[-4, '#c96a1c'], [4, '#ff9b3a']].map(([z, color]) => {
      const a = new Z.Anchor({ addTo: bird, translate: { y: -15, z } });
      new Z.Shape({ addTo: a, path: [{ y: 0 }, { y: 14 }, { x: 6, y: 14 }], closed: false, stroke: 4, color });
      return a;
    });
    // rabo com espessura: camadas do escuro (atrás) ao claro (frente)
    const tail = new Z.Group({ addTo: bird });
    [[DARK, -2], [MID, 0], ['#4b5ad0', 2]].forEach(([color, z], i) => new Z.Shape({ addTo: tail, path: [{ x: -8, y: -24 }, { x: -32 + i, y: -44 + i * 3 }], stroke: 7, color, translate: { z } }));
    // corpo redondo, sombra embaixo, brilho em cima, barriga clara
    new Z.Shape({ addTo: bird, path: [{ x: -6, y: -22 }, { x: 2, y: -20 }], stroke: 24, color: BODY });
    new Z.Shape({ addTo: bird, path: [{ x: -4, y: -28 }, { x: 0, y: -28 }], stroke: 8, color: LIGHT, translate: { z: 9 } });
    new Z.Shape({ addTo: bird, stroke: 14, color: '#eef0ff', translate: { x: 4, y: -16, z: 7 } });
    const wing = new Z.Group({ addTo: bird, translate: { x: -6, y: -23, z: 12 } });
    new Z.Ellipse({ addTo: wing, width: 17, height: 10, stroke: 2.5, fill: true, color: '#2f3897', rotate: { z: -0.3 } });
    [[-4, -1], [1, -2], [-1, 2], [4, 0.5]].forEach(([x, y]) => new Z.Shape({ addTo: wing, stroke: 2.2, color: '#dfe5ff', translate: { x, y, z: 1.5 } }));
    // pescoço, cabeça e crista
    new Z.Shape({ addTo: bird, path: [{ x: 3, y: -27 }, { x: 8, y: -36 }], stroke: 11, color: BODY });
    [[-5, -58, DARK, -1], [0, -61, MID, 0], [6, -60, '#5566dd', 1]].forEach(([x, y, color, z]) => new Z.Shape({ addTo: bird, path: [{ x: 6, y: -46 }, { x, y }], stroke: 4.2, color, translate: { z } }));
    new Z.Shape({ addTo: bird, stroke: 19, color: BODY, translate: { x: 9, y: -41 } });
    new Z.Shape({ addTo: bird, stroke: 5, color: LIGHT, translate: { x: 5, y: -46, z: 7 } });
    // bico comprido (cone) — a ponta vira pra frente
    new Z.Cone({ addTo: bird, diameter: 7, length: 18, stroke: false, color: '#ffd04f', backface: '#e79a22', translate: { x: 16, y: -40 }, rotate: { y: -Z.TAU / 4 } });
    // olho: mancha laranja, branco, pupila, brilho e sobrancelha decidida (Group = desenhados juntos, na frente)
    const eye = new Z.Group({ addTo: bird, translate: { z: 9 } });
    new Z.Shape({ addTo: eye, path: [{ x: 4, y: -40 }, { x: 7, y: -40 }], stroke: 3.5, color: '#ff6a3d' });
    new Z.Shape({ addTo: eye, stroke: 9, color: '#ffffff', translate: { x: 12, y: -43 } });
    new Z.Shape({ addTo: eye, stroke: 4.6, color: '#14112e', translate: { x: 13.6, y: -43 } });
    new Z.Shape({ addTo: eye, stroke: 1.8, color: '#ffffff', translate: { x: 14.6, y: -44.6 } });
    new Z.Shape({ addTo: eye, path: [{ x: 8, y: -49 }, { x: 16, y: -47.5 }], stroke: 2.2, color: '#1b1640' });
    // linhas de velocidade e poeirinha atrás dos pés
    const lines = [-36, -26, -16].map((y, i) => ({ s: new Z.Shape({ addTo: illo, path: [{ x: 0 }, { x: 12 }], stroke: 2.5, color: 'rgba(255,255,255,.75)', translate: { y, z: 4 } }), off: i * 0.33 }));
    const puffs = [0, 1, 2].map(i => ({ s: new Z.Shape({ addTo: illo, stroke: 7, color: '#f6dcb2', translate: { y: 28, z: 10 } }), off: i / 3 }));
    return t => {
      const step = t * 13;
      bird.translate.y = 30 - Math.abs(Math.sin(step)) * 3;
      bird.rotate.z = -0.06 + Math.sin(step * 2) * 0.02;
      legs.forEach((l, i) => { l.rotate.z = Math.sin(step + i * Math.PI) * 0.95; });
      tail.rotate.z = Math.sin(step) * 0.05;
      lines.forEach(({ s, off }) => { const k = (t * 1.6 + off) % 1; s.translate.x = -40 - k * 22; s.visible = k < 0.8; });
      puffs.forEach(({ s, off }) => { const k = (t * 1.3 + off) % 1; s.translate.x = -20 - k * 26; s.translate.y = 28 - k * 6; s.stroke = 8 * (1 - k) + 0.5; });
      flower.rotate.z = t * 0.6;
      illo.rotate.x = -0.28;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // corredor de labirinto em neon: come os pontinhos com os fantasmas atrás; pega a bola grande, eles ficam azuis
  // e fogem, ele volta comendo — o fantasma comido vira só olhos e volta correndo pra casa
  comecome(Z, illo) {
    const T = 9;
    // paredes do labirinto: placas azul-escuras com a borda em neon
    const WALL = '#1b2580', NEON = '#4d6bff';
    const wall = (x, y, w, h) => {
      slab(Z, illo, w, h, 14, WALL, { translate: { x, y } });
      new Z.Rect({ addTo: illo, width: w - 2, height: h - 2, stroke: 1.4, color: NEON, translate: { x, y, z: 7.2 } });
    };
    wall(0, -16, 176, 6); wall(0, 32, 176, 6);
    wall(-42, -30, 6, 22); wall(34, -30, 6, 22); wall(-6, 46, 6, 22);
    const DOTS = Array.from({ length: 8 }, (_, i) => -48 + i * 12);
    const dots = DOTS.map(x => new Z.Shape({ addTo: illo, stroke: 4.5, color: '#ffd9a8', translate: { x, y: 8 } }));
    const pellet = new Z.Shape({ addTo: illo, stroke: 11, color: '#ffd9a8', translate: { x: 50, y: 8 } });
    // corpo achatado com a boca recortada de verdade (o contorno muda a cada quadro); uma cópia atrás dá volume
    const pacPath = (o, dir) => {
      const m = 0.12 + o * 0.6, pts = [{ x: 0, y: 0 }], put = a => pts.push({ x: Math.cos(a) * 13 * dir, y: Math.sin(a) * 13 });
      for (let a = m; a <= Math.PI * 2 - m; a += 0.2) put(a);
      put(Math.PI * 2 - m);
      return pts;
    };
    const pacBack = new Z.Shape({ addTo: illo, path: pacPath(0.5, 1), fill: true, stroke: 3, color: '#d9a92b', translate: { y: 8, z: 6 } });
    const pac = new Z.Shape({ addTo: illo, path: pacPath(0.5, 1), fill: true, stroke: 3, color: '#ffe14d', translate: { y: 8, z: 10 } });
    // fantasma: cúpula + barra ondulada, olhos que olham pra onde ele anda (ou carinha assustada quando azul)
    const ghostPath = [{ x: -11, y: 11 }, { x: -11, y: -2 }];
    for (let a = Math.PI + 0.2; a <= Math.PI * 2 - 0.2; a += 0.2) ghostPath.push({ x: Math.cos(a) * 11, y: -2 + Math.sin(a) * 11 });
    ghostPath.push({ x: 11, y: -2 }, { x: 11, y: 11 }, { x: 7.3, y: 7.5 }, { x: 3.7, y: 11 }, { x: 0, y: 7.5 }, { x: -3.7, y: 11 }, { x: -7.3, y: 7.5 });
    const COLORS = ['#ff4d5e', '#ff9ee5', '#4dd9ff'], SCARED = '#2d4bff', FLASH = '#e8e8ff';
    const ghosts = COLORS.map(color => {
      const a = new Z.Group({ addTo: illo, translate: { y: 7 } });
      const back = new Z.Shape({ addTo: a, path: ghostPath, fill: true, stroke: 3, color: shade(color, -0.3), translate: { z: -4 } });
      const body = new Z.Shape({ addTo: a, path: ghostPath, fill: true, stroke: 3, color });
      const eyes = [-4, 4].map(x => new Z.Shape({ addTo: a, stroke: 5.5, color: '#ffffff', translate: { x, y: -3, z: 3 } }));
      const pupils = [-4, 4].map(x => new Z.Shape({ addTo: a, stroke: 2.8, color: '#161625', translate: { x, y: -3, z: 5 } }));
      const mouth = new Z.Shape({ addTo: a, path: [{ x: -6.5, y: 4.5 }, { x: -3.5, y: 2.5 }, { x: -0.5, y: 4.5 }, { x: 2.5, y: 2.5 }, { x: 5.5, y: 4.5 }], closed: false, stroke: 1.5, color: '#ffffff', translate: { z: 4 } });
      return { a, back, body, eyes, pupils, mouth, color };
    });
    const look = (g, dx) => g.pupils.forEach((p, j) => { p.translate.x = (j ? 4 : -4) + dx * 1.6; });
    return t => {
      const u = (t % T) / T;
      let px, dir;
      if (u < 0.45) {
        // fase 1: entra pela esquerda comendo os pontinhos; os fantasmas vêm atrás
        const k = u / 0.45;
        px = -70 + k * 120; dir = 1;
        dots.forEach((d, i) => { d.visible = DOTS[i] > px - 2; });
        pellet.visible = true; pellet.stroke = 10 + Math.sin(t * 8) * 1.8;
        ghosts.forEach((g, i) => {
          g.a.translate.x = px - 28 - i * 24; g.a.translate.y = 7 + Math.sin(t * 6 + i) * 1.2;
          g.a.visible = true; g.body.visible = g.back.visible = true;
          g.body.color = g.color; g.back.color = shade(g.color, -0.3);
          g.eyes.forEach(e => { e.stroke = 5.5; }); g.pupils.forEach(p => { p.visible = true; }); look(g, 1);
          g.mouth.visible = false;
        });
      } else {
        // fase 2: comeu a bola grande; os fantasmas ficam azuis e fogem, ele volta comendo
        const k = (u - 0.45) / 0.55;
        px = 50 - k * 130; dir = -1;
        dots.forEach(d => { d.visible = false; });
        pellet.visible = false;
        const flash = k > 0.6 && Math.floor(t * 6) % 2;
        ghosts.forEach((g, i) => {
          const x0 = 50 - 28 - i * 24, kEat = (50 - x0) / (130 - 58.5);
          if (k < kEat) {
            g.a.translate.x = x0 - k * 58.5; g.a.translate.y = 7 + Math.sin(t * 9 + i) * 1.2;
            g.body.visible = g.back.visible = true;
            g.body.color = flash ? FLASH : SCARED; g.back.color = shade(flash ? '#9aa0c8' : SCARED, -0.3);
            g.eyes.forEach(e => { e.stroke = 3.2; }); g.pupils.forEach(p => { p.visible = false; });
            g.mouth.visible = true; g.mouth.color = flash ? '#ff4d5e' : '#ffffff';
          } else {
            // comido: só os olhos, voltando pra casa (direita) bem rápido
            const back = (k - kEat) * 260;
            g.a.translate.x = x0 - kEat * 58.5 + back; g.a.translate.y = 7 - Math.min(10, back * 0.1);
            g.body.visible = g.back.visible = false; g.mouth.visible = false;
            g.eyes.forEach(e => { e.stroke = 5.5; }); g.pupils.forEach(p => { p.visible = true; }); look(g, 1);
          }
          g.a.visible = g.a.translate.x < 90;
        });
      }
      const o = 0.25 + 0.75 * Math.abs(Math.sin(t * 9));
      pac.translate.x = pacBack.translate.x = px;
      pac.path = pacBack.path = pacPath(o, dir); pac.updatePath(); pacBack.updatePath();
      illo.rotate.x = -0.32;
      illo.rotate.y = Math.sin(t * 0.5) * 0.22;
    };
  },
  // balão de pergunta com um "?" de volume e as alternativas A–D: a certa fica verde, sobe e solta confete
  quiz(Z, illo) {
    // balão (placa clara com rabinho) balançando de leve — nunca de lado, senão o "?" vira um traço
    const bubble = new Z.Anchor({ addTo: illo, translate: { y: -24 } });
    slab(Z, bubble, 52, 34, 6, '#eef0fb');
    new Z.Shape({ addTo: bubble, path: [{ x: -12, y: 16 }, { x: -20, y: 26 }, { x: -2, y: 16 }], fill: true, stroke: 2, color: '#d9dcf0' });
    // "?" com espessura: três camadas do escuro (atrás) ao claro (frente), igual ao raio do Reflexo
    const qPath = [{ x: -8, y: -8 }, { arc: [{ x: -8, y: -18 }, { x: 0, y: -18 }] }, { arc: [{ x: 8, y: -18 }, { x: 8, y: -9 }] },
      { arc: [{ x: 8, y: -2 }, { x: 0, y: 1 }] }, { x: 0, y: 6 }].map(p => (p.arc ? { arc: p.arc.map(q => ({ x: q.x * 0.62, y: q.y * 0.62 + 2 })) } : { x: p.x * 0.62, y: p.y * 0.62 + 2 }));
    // frente do balão + "?" num Group (desenhados em ordem, como uma peça só): solto, o pontinho fica abaixo do
    // centro e a Zdog o ordenava atrás da placa quando a cena girava (o pontinho sumia)
    const face = new Z.Group({ addTo: bubble, translate: { z: 3.4 } });
    new Z.Rect({ addTo: face, width: 50, height: 32, stroke: 2, fill: true, color: '#eef0fb' });
    const mark = new Z.Anchor({ addTo: face });
    ['#5a3fd0', '#6f52e8', '#8b6cff'].forEach((color, i) => {
      const z = 0.3 + i * 1.6;
      new Z.Shape({ addTo: mark, path: qPath, closed: false, stroke: 4.5, color, translate: { z } });
      new Z.Shape({ addTo: mark, stroke: 5, color, translate: { y: 12, z } });
    });
    // alternativas: placa colorida + letra
    const base = ['#8b6cff', '#ff8a5c', '#4dc3ff', '#ff6b8a'];
    const opts = base.map((c, i) => {
      const a = new Z.Anchor({ addTo: illo, translate: { x: (i % 2 ? 1 : -1) * 19, y: 18 + Math.floor(i / 2) * 19 } });
      const box = slab(Z, a, 34, 15, 5, c);
      // frente da placa + letra + "texto" num Group (desenhados em ordem, como uma peça só): a letra fora do centro
      // ficaria atrás da placa quando a cena gira, porque a Zdog ordena cada peça solta pelo próprio centro
      const face = new Z.Group({ addTo: a, translate: { z: 3.6 } });
      const front = new Z.Rect({ addTo: face, width: 32, height: 13, stroke: 2, fill: true, color: c });
      glyph(Z, face, LETTERS['ABCD'[i]].map(l => l.map(([x, y]) => [x - 16, y])), { color: '#ffffff', z: 0.4, scale: 0.6, stroke: 2 });
      new Z.Shape({ addTo: face, path: [{ x: -2, y: 0 }, { x: 10, y: 0 }], stroke: 2.4, color: shade(c, 0.45), translate: { z: 0.4 } }); // "texto" da alternativa
      return { a, box, front, c };
    });
    const check = new Z.Shape({ addTo: illo, path: [{ x: -5, y: 0 }, { x: -1.5, y: 4 }, { x: 6, y: -5 }], closed: false, stroke: 3.5, color: '#ffffff' });
    const confetti = Array.from({ length: 8 }, (_, i) => ({ s: new Z.Shape({ addTo: illo, stroke: 3, color: PALETTE[i % PALETTE.length] }), ang: (i / 8) * Z.TAU }));
    const paint = (box, c) => {
      box.color = box.frontFace = c; box.topFace = shade(c, 0.25); box.leftFace = shade(c, -0.12); box.rightFace = shade(c, -0.25);
      box.bottomFace = shade(c, -0.35); box.rearFace = shade(c, -0.15);
    };
    let lit = -1;
    return t => {
      bubble.rotate.y = Math.sin(t * 1.2) * 0.35;
      bubble.rotate.z = Math.sin(t * 0.9) * 0.06;
      bubble.translate.y = -24 + Math.sin(t * 1.8) * 2.5;
      mark.scale = 1 + Math.max(0, Math.sin(t * 3.6)) * 0.08;
      // uma pergunta a cada ~1,5s: a resposta certa acende verde, sobe e solta confete
      const step = t * 0.65, right = [2, 0, 3, 1][Math.floor(step) % 4], k = step % 1;
      if (right !== lit) { opts.forEach((o, i) => { const c = i === right ? '#3ddc97' : o.c; paint(o.box, c); o.front.color = c; }); lit = right; }
      const pop = Math.sin(Math.min(1, k * 2.2) * Math.PI);
      opts.forEach((o, i) => { o.a.translate.z = i === right ? 4 + pop * 8 : 0; o.a.scale = i === right ? 1 + pop * 0.06 : 1; });
      const r = opts[right].a.translate;
      check.translate.set({ x: r.x + 10, y: r.y, z: r.z + 4 });
      check.visible = k > 0.08;
      const burst = Math.min(1, k * 1.6);
      confetti.forEach(({ s, ang }, i) => {
        s.visible = k < 0.62;
        const d = 6 + burst * 22;
        s.translate.set({ x: r.x + Math.cos(ang) * d, y: r.y + Math.sin(ang) * d * 0.7 - burst * 6, z: r.z + 6 + (i % 2 ? 4 : -2) });
        s.stroke = 3.2 * (1 - burst) + 0.6;
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // fileiras de letras virando verde, amarelo e cinza
  termo(Z, illo) {
    const cols = ['#3ddc97', '#ffd34d', '#4a4f6e'], tiles = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const a = new Z.Anchor({ addTo: illo, translate: { x: (c - 1.5) * 24, y: (r - 0.5) * 26 } });
      slab(Z, a, 21, 21, 5, cols[(r * 2 + c * 3) % 3]);
      tiles.push({ a, r, c });
    }
    return t => {
      tiles.forEach(({ a, r, c }) => {
        const ph = (t * 0.6 - c * 0.12 - r * 0.7) % 2;
        a.rotate.x = ph >= 0 && ph < 0.5 ? smooth(ph / 0.5) * Math.PI : ph >= 0.5 ? Math.PI : 0;
        a.translate.z = ph >= 0 && ph < 0.5 ? Math.sin(ph / 0.5 * Math.PI) * 8 : 0;
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
};

/* ---------- montagem e loop ---------- */
let scenes3d = [], loopOn = false, visible = new Set();
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)))) : null;

let lastFrame = 0;
function loop(now) {
  if (!scenes3d.length) { loopOn = false; return; }
  // 30 quadros por segundo: movimento lento e decorativo não precisa de 60, e gasta metade
  if (!document.hidden && now - lastFrame >= 32) {
    lastFrame = now;
    const t = now / 1000;
    for (const s of scenes3d) {
      if (io && !visible.has(s.canvas)) continue;
      s.update(t);
      s.illo.updateRenderGraph();
    }
  }
  requestAnimationFrame(loop);
}

// celular (mesmo limite do CSS): cenas menores; ao cruzar o limite, redesenha o menu com o tamanho certo
const SMALL = matchMedia('(max-width: 560px)');
SMALL.addEventListener?.('change', () => { if (currentView === 'menu' && document.querySelector('.grid')) renderMenu(); });

// botão de brilho no header: liga/desliga o 3D (fica salvo no navegador). Desligado = emoji parado, sem biblioteca nem animação.
let fx3dOn = (() => { try { return localStorage.getItem('mg_3d') !== 'off'; } catch { return true; } })();
// com o 3D ligado, as bibliotecas já começam a baixar agora (enquanto a página descobre quem está logado),
// e não só quando o menu é desenhado — as cenas aparecem antes. Falhou? enhanceCards tenta de novo.
if (fx3dOn) { loadLib(ZDOG_URL).catch(() => {}); loadLib(TILT_URL).catch(() => {}); }
function renderFx3d() {
  const b = $('#fx3d');
  b.setAttribute('aria-pressed', fx3dOn);
  b.title = fx3dOn ? 'Animações 3D: ligadas (clique pra desligar se ficar pesado)' : 'Animações 3D: desligadas (clique pra ligar)';
}
$('#fx3d').onclick = () => {
  fx3dOn = !fx3dOn;
  try { localStorage.setItem('mg_3d', fx3dOn ? 'on' : 'off'); } catch {}
  renderFx3d();
  if (!fx3dOn) { scenes3d = []; io?.disconnect(); visible.clear(); } // o loop para sozinho sem cenas
  if (currentView === 'menu') renderMenu();
};
renderFx3d();

/** Chamado depois de desenhar o menu: põe a cena 3D em cada card e liga a inclinação (se o 3D estiver ligado). */
let enhanceRun = 0;
async function enhanceCards() {
  const run = ++enhanceRun; // só a chamada mais nova monta as cenas (menu redesenhado duas vezes seguidas)
  io?.disconnect(); visible.clear();
  scenes3d = [];
  if (!fx3dOn) return;
  try { await Promise.all([loadLib(ZDOG_URL), loadLib(TILT_URL)]); } catch { return; } // sem internet: fica o emoji
  if (run !== enhanceRun || !fx3dOn || !document.querySelector('.grid .card')) return;
  document.querySelector('.grid').classList.add('has3d');
  // tamanho da cena: 190px no computador, 150px no celular
  // (a Zdog grava o tamanho no próprio canvas, então o tamanho do celular sai daqui e não do CSS)
  const size = SMALL.matches ? 150 : 190;
  document.querySelectorAll('.grid .card').forEach(card => {
    const build = SCENES_3D[card.dataset.id];
    if (!build) return;
    const canvas = Object.assign(document.createElement('canvas'), { className: 'z3d', width: size, height: size });
    canvas.setAttribute('aria-hidden', 'true');
    card.prepend(canvas);
    // zoom proporcional (as cenas foram desenhadas pra 150px); a Zdog já ajusta pra telas de alta densidade
    const illo = new Zdog.Illustration({ element: canvas, zoom: size / 150 });
    scenes3d.push({ canvas, illo, update: build(Zdog, illo) });
    io?.observe(canvas);
  });
  // palco do desafio do dia
  const stage = document.querySelector('.daily-stage');
  const build = stage && SCENES_3D[stage.dataset.id];
  if (build) {
    const ds = SMALL.matches ? 150 : 170;
    const canvas = Object.assign(document.createElement('canvas'), { className: 'z3d', width: ds, height: ds });
    canvas.setAttribute('aria-hidden', 'true');
    stage.prepend(canvas);
    stage.classList.add('has3d');
    const illo = new Zdog.Illustration({ element: canvas, zoom: ds / 150 });
    scenes3d.push({ canvas, illo, update: build(Zdog, illo) });
    io?.observe(canvas);
  }
  if (!loopOn && scenes3d.length) { loopOn = true; requestAnimationFrame(loop); }
  // inclinação 3D com brilho (só com mouse; no celular fica parado)
  if (matchMedia('(hover: hover)').matches) {
    VanillaTilt.init(document.querySelectorAll('.grid .card'), { max: 8, speed: 500, scale: 1.02, glare: true, 'max-glare': 0.18, perspective: 900 });
    document.querySelector('.grid').classList.add('tilt-on');
  }
}
