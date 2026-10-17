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
  // peças de Tetris girando enquanto caem, em profundidades diferentes
  blocos(Z, illo) {
    const shapes = [[[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [3, 0]]];
    const pieces = shapes.map((cells, i) => {
      const g = new Z.Anchor({ addTo: illo, translate: { x: [-22, 20, -4, 26][i], z: [10, -10, 25, -25][i] } });
      const w = Math.max(...cells.map(c => c[0])) + 1, h = Math.max(...cells.map(c => c[1])) + 1;
      cells.forEach(([cx, cy]) => cube(Z, g, 9, PALETTE[i], { translate: { x: (cx - (w - 1) / 2) * 10, y: (cy - (h - 1) / 2) * 10 } }));
      return { g, speed: 0.35 + i * 0.08, spin: (i % 2 ? 1 : -1) * (0.6 + i * 0.15), off: i * 0.27 };
    });
    return t => {
      for (const p of pieces) {
        const k = (t * p.speed * 0.25 + p.off) % 1;
        p.g.translate.y = -70 + k * 140;
        p.g.rotate.z = t * p.spin * 0.5;
        p.g.rotate.y = Math.sin(t * 0.7 + p.off * 9) * 0.6;
      }
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
  // alvo em 3D e um dardo chegando
  mira(Z, illo) {
    const target = new Z.Anchor({ addTo: illo });
    [[56, '#ff5c6c'], [44, '#f5f5f7'], [32, '#ff5c6c'], [20, '#f5f5f7'], [9, '#ff5c6c']].forEach(([d, color], i) =>
      new Z.Ellipse({ addTo: target, diameter: d, stroke: 2, fill: true, color, translate: { z: i * 0.8 } }));
    new Z.Cylinder({ addTo: target, diameter: 58, length: 4, stroke: false, color: '#a8323d', translate: { z: -2.5 } });
    const dart = new Z.Anchor({ addTo: illo });
    new Z.Cylinder({ addTo: dart, diameter: 3, length: 26, stroke: false, color: '#c9ccd8' });
    new Z.Cone({ addTo: dart, diameter: 6, length: 9, stroke: false, color: '#7d8196', translate: { z: -13 }, rotate: { y: Z.TAU / 2 } });
    [0, 1].forEach(i => new Z.Shape({ addTo: dart, path: [{ z: 10 }, { z: 16, y: -7 }, { z: 16 }], fill: true, stroke: 1, color: '#4dc3ff', rotate: { z: i * Z.TAU / 4 } }));
    return t => {
      const k = (t * 0.45) % 1, fly = Math.min(1, k / 0.35);
      dart.translate.set({ x: 4 - (1 - fly) * 30, y: -3 - (1 - fly) * 20, z: 18 + (1 - smooth(fly)) * 90 });
      target.rotate.y = 0.5 + Math.sin(t * 0.5) * 0.15;
      dart.rotate.y = target.rotate.y;
      illo.rotate.x = -0.15;
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
  // passarinho batendo asas entre canos
  voa(Z, illo) {
    const pipes = [0, 1].map(i => {
      const a = new Z.Anchor({ addTo: illo });
      [-1, 1].forEach(dir => {
        new Z.Cylinder({ addTo: a, diameter: 14, length: 40, stroke: false, color: '#2fb57a', backface: '#1f8a5a', translate: { y: dir * 42 }, rotate: { x: Z.TAU / 4 } });
        new Z.Cylinder({ addTo: a, diameter: 18, length: 6, stroke: false, color: '#3ddc97', backface: '#2fb57a', translate: { y: dir * 21 }, rotate: { x: Z.TAU / 4 } });
      });
      return { a, off: i * 0.5 };
    });
    const bird = new Z.Anchor({ addTo: illo, translate: { z: 6 } });
    new Z.Shape({ addTo: bird, stroke: 26, color: '#ffd34d' });
    new Z.Shape({ addTo: bird, stroke: 13, color: '#fff3c4', translate: { y: 5, z: 6 } });
    new Z.Shape({ addTo: bird, stroke: 9, color: '#ffffff', translate: { x: 6, y: -5, z: 8 } });
    new Z.Shape({ addTo: bird, stroke: 4, color: '#10131c', translate: { x: 7.5, y: -5, z: 11 } });
    new Z.Cone({ addTo: bird, diameter: 8, length: 8, stroke: false, color: '#ff8a5c', translate: { x: 11, y: 1 }, rotate: { y: Z.TAU / 4 } });
    const wing = new Z.Ellipse({ addTo: bird, width: 15, height: 9, stroke: 3, fill: true, color: '#e8b730', translate: { x: -5, y: 2, z: 12 } });
    return t => {
      pipes.forEach(p => { const k = (t * 0.22 + p.off) % 1; p.a.translate.x = 75 - k * 150; });
      bird.translate.y = Math.sin(t * 2.4) * 10;
      bird.rotate.z = Math.cos(t * 2.4) * 0.25;
      wing.rotate.x = Math.sin(t * 14) * 0.9;
      illo.rotate.y = -0.35;
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
  // invasor de pixels marchando e um tiro subindo
  invasores(Z, illo) {
    const art = ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'];
    const inv = new Z.Anchor({ addTo: illo });
    const back = new Z.Group({ addTo: inv, translate: { z: -3 } }), front = new Z.Group({ addTo: inv, translate: { z: 3 } });
    art.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== 'X') return;
      // placa da frente + sombra atrás dão volume com 2 formas por pixel (um cubo inteiro seria 6)
      new Z.Rect({ addTo: back, width: 4.6, height: 4.6, stroke: 0.6, fill: true, color: '#4b3699', translate: { x: (x - 5) * 5, y: (y - 3.5) * 5 } });
      new Z.Rect({ addTo: front, width: 4.6, height: 4.6, stroke: 0.6, fill: true, color: '#9b80ff', translate: { x: (x - 5) * 5, y: (y - 3.5) * 5 } });
    }));
    const shot = new Z.Shape({ addTo: illo, path: [{ y: 0 }, { y: 8 }], stroke: 3, color: '#ff6b8a' });
    return t => {
      inv.translate.set({ x: Math.round(Math.sin(t * 1.2) * 4) * 5, y: -10 + Math.sin(t * 2.4) * 2 });
      inv.rotate.y = Math.sin(t * 0.8) * 0.45;
      const k = (t * 0.7) % 1;
      shot.translate.set({ x: Math.sin(t * 0.35) * 20, y: 60 - k * 70, z: 6 });
      illo.rotate.x = -0.15;
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
  // forca com o boneco balançando
  forca(Z, illo) {
    const wood = '#c98a4b', skin = '#f4e3b5';
    new Z.Shape({ addTo: illo, path: [{ x: -24, y: 40 }, { x: -24, y: -40 }, { x: 14, y: -40 }, { x: 14, y: -28 }], closed: false, stroke: 5, color: wood });
    new Z.Shape({ addTo: illo, path: [{ x: -38, y: 40 }, { x: -10, y: 40 }], closed: false, stroke: 5, color: wood });
    new Z.Shape({ addTo: illo, path: [{ x: -24, y: -26 }, { x: -10, y: -40 }], closed: false, stroke: 4, color: wood });
    const man = new Z.Anchor({ addTo: illo, translate: { x: 14, y: -28 } });
    new Z.Shape({ addTo: man, translate: { y: 8 }, stroke: 13, color: skin });
    for (const p of [[{ y: 15 }, { y: 36 }], [{ y: 20 }, { x: -9, y: 30 }], [{ y: 20 }, { x: 9, y: 30 }], [{ y: 36 }, { x: -8, y: 52 }], [{ y: 36 }, { x: 8, y: 52 }]])
      new Z.Shape({ addTo: man, path: p, closed: false, stroke: 3.5, color: skin });
    return t => {
      man.rotate.z = Math.sin(t * 2) * 0.2;
      illo.rotate.x = -0.15;
      illo.rotate.y = Math.sin(t * 0.5) * 0.45;
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
  // corredor pulando um cacto
  corredor(Z, illo) {
    slab(Z, illo, 96, 4, 22, '#4a4f6e', { translate: { y: 28 } });
    const run = new Z.Anchor({ addTo: illo, translate: { x: -22, y: 26 } });
    cube(Z, run, 1, '#ffd34d', { width: 12, height: 20, depth: 10, translate: { y: -18 } });
    cube(Z, run, 1, '#ffd34d', { width: 12, height: 10, depth: 10, translate: { x: 4, y: -34 } });
    const legs = [-3, 3].map(x => cube(Z, run, 1, '#e0aa2f', { width: 4, height: 8, depth: 4, translate: { x, y: -4 } }));
    const cactus = cube(Z, illo, 1, '#3ddc97', { width: 9, height: 22, depth: 9, translate: { y: 15 } });
    cube(Z, cactus, 1, '#3ddc97', { width: 14, height: 4, depth: 4, translate: { y: -2 } });
    return t => {
      const j = (t * 0.8) % 1;
      run.translate.y = 26 - Math.sin(j * Math.PI) * 30;
      cactus.translate.x = 52 - j * 144;
      legs.forEach((l, i) => { l.translate.x = (i ? 3 : -3) + Math.sin(t * 14 + i * Math.PI) * 3; });
      illo.rotate.x = -0.25;
      illo.rotate.y = -0.5 + Math.sin(t * 0.4) * 0.2;
    };
  },
  // come os pontinhos com os fantasmas atrás; pega a bola grande, eles ficam azuis e fogem, e ele come um por um
  comecome(Z, illo) {
    const T = 10;
    const dots = Array.from({ length: 6 }, (_, i) => new Z.Shape({ addTo: illo, stroke: 5, color: '#ffd9a8', translate: { x: -30 + i * 14, y: 8 } }));
    const pellet = new Z.Shape({ addTo: illo, stroke: 11, color: '#ffd9a8', translate: { x: 46, y: 8 } });
    // corpo achatado com a boca recortada de verdade (o contorno do caminho muda a cada quadro); uma cópia atrás dá volume
    const pacPath = (o, dir) => {
      const m = 0.12 + o * 0.6, pts = [{ x: 0, y: 0 }], put = a => pts.push({ x: Math.cos(a) * 14 * dir, y: Math.sin(a) * 14 });
      for (let a = m; a <= Math.PI * 2 - m; a += 0.2) put(a);
      put(Math.PI * 2 - m);
      return pts;
    };
    const pacBack = new Z.Shape({ addTo: illo, path: pacPath(0.5, 1), fill: true, stroke: 3, color: '#d9a92b', translate: { y: 8, z: 6 } });
    const pac = new Z.Shape({ addTo: illo, path: pacPath(0.5, 1), fill: true, stroke: 3, color: '#ffe14d', translate: { y: 8, z: 10 } }); // à frente dos fantasmas: ele "engole" cada um em vez de ficar por baixo
    // fantasma: cúpula + barra ondulada embaixo, olhos que olham pra frente (ou carinha assustada quando azul)
    const ghostPath = [{ x: -12, y: 12 }, { x: -12, y: -2 }];
    for (let a = Math.PI + 0.2; a <= Math.PI * 2 - 0.2; a += 0.2) ghostPath.push({ x: Math.cos(a) * 12, y: -2 + Math.sin(a) * 12 });
    ghostPath.push({ x: 12, y: -2 }, { x: 12, y: 12 }, { x: 8, y: 8 }, { x: 4, y: 12 }, { x: 0, y: 8 }, { x: -4, y: 12 }, { x: -8, y: 8 });
    const COLORS = ['#ff4d5e', '#ff9ee5', '#4dd9ff', '#ffa94d'], SCARED = '#2d4bff', FLASH = '#e8e8ff';
    const ghosts = COLORS.map(color => {
      const a = new Z.Group({ addTo: illo, translate: { y: 6 } });
      const back = new Z.Shape({ addTo: a, path: ghostPath, fill: true, stroke: 3, color: shade(color, -0.3), translate: { z: -4 } });
      const body = new Z.Shape({ addTo: a, path: ghostPath, fill: true, stroke: 3, color });
      const eyes = [-4.5, 4.5].map(x => new Z.Shape({ addTo: a, stroke: 6, color: '#ffffff', translate: { x, y: -3, z: 3 } }));
      const pupils = [-4.5, 4.5].map(x => new Z.Shape({ addTo: a, stroke: 3, color: '#161625', translate: { x, y: -3, z: 5 } }));
      const mouth = new Z.Shape({ addTo: a, path: [{ x: -7, y: 5 }, { x: -4, y: 3 }, { x: -1, y: 5 }, { x: 2, y: 3 }, { x: 5, y: 5 }, { x: 8, y: 3 }], closed: false, stroke: 1.6, color: '#ffffff', translate: { z: 4 } });
      return { a, back, body, eyes, pupils, mouth, color };
    });
    return t => {
      const u = (t % T) / T;
      let px, dir, o;
      if (u < 0.5) {
        // fase 1: come os pontinhos e os fantasmas vêm atrás
        const k = u / 0.5;
        px = -44 + k * 90; dir = 1;
        dots.forEach(d => { d.visible = d.translate.x > px + 6; });
        pellet.visible = true; pellet.stroke = 10 + Math.sin(t * 8) * 1.5;
        ghosts.forEach((g, i) => {
          g.a.translate.x = px - 28 - i * 26; g.a.translate.y = 6 + Math.sin(t * 6 + i) * 1.5; g.a.visible = true;
          g.body.color = g.color; g.back.color = shade(g.color, -0.3);
          g.eyes.forEach(e => { e.stroke = 6; });
          g.pupils.forEach(e => { e.visible = true; e.translate.x = (e === g.pupils[0] ? -4.5 : 4.5) + 1.6; });
          g.mouth.visible = false;
        });
        o = 0.25 + 0.75 * Math.abs(Math.sin(t * 9));
      } else {
        // fase 2: bola grande comida, fantasmas azuis fogem pra esquerda e ele vai comendo um por um
        const k = (u - 0.5) / 0.5;
        px = 46 - k * 150; dir = -1;
        dots.forEach(d => { d.visible = false; });
        pellet.visible = false;
        const flash = k > 0.55 && Math.floor(t * 6) % 2;
        ghosts.forEach((g, i) => {
          const gx = 46 - 28 - i * 26 - k * 40;
          g.a.translate.x = gx; g.a.translate.y = 6 + Math.sin(t * 9 + i) * 1.5;
          g.a.visible = px > gx + 6; // já comido some
          g.body.color = flash ? FLASH : SCARED; g.back.color = shade(flash ? '#9aa0c8' : SCARED, -0.3);
          g.eyes.forEach(e => { e.stroke = 3.5; });
          g.pupils.forEach(e => { e.visible = false; });
          g.mouth.visible = true; g.mouth.color = flash ? '#ff4d5e' : '#ffffff';
        });
        o = 0.25 + 0.75 * Math.abs(Math.sin(t * 9));
      }
      pac.translate.x = pacBack.translate.x = px;
      pac.path = pacBack.path = pacPath(o, dir); pac.updatePath(); pacBack.updatePath();
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.5) * 0.25;
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
