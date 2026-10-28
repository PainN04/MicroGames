// ---------- cards 3D do menu: Zdog (ilustração 3D) + Vanilla-Tilt (inclinação com brilho) ----------
// As duas bibliotecas carregam depois do menu aparecer (não atrasam a página). Cada jogo com cena 3D ganha um
// <canvas> no canto do card; um único loop anima só os cards visíveis e para com a aba escondida.
// Ficam no próprio site (public/vendor); a CDN só entra se o arquivo local falhar.
const ZDOG_URL = 'vendor/zdog.dist.min.js';
const TILT_URL = 'vendor/vanilla-tilt.min.js';
const LIB_CDN = { [ZDOG_URL]: 'https://cdn.jsdelivr.net/npm/zdog@1.1.3/dist/zdog.dist.min.js', [TILT_URL]: 'https://cdn.jsdelivr.net/npm/vanilla-tilt@1.8.1/dist/vanilla-tilt.min.js' };
const libLoads = {};
function loadLib(url) {
  const one = src => new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src, async: true, onload: resolve });
    s.onerror = () => { s.remove(); reject(new Error('falhou: ' + src)); };
    document.head.append(s);
  });
  return libLoads[url] ??= one(url).catch(() => one(LIB_CDN[url])).catch(e => { delete libLoads[url]; throw e; });
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
  A: [[[-4, 7], [0, -7], [4, 7]], [[-2.6, 2], [2.6, 2]]],
  B: [[[-4, 7], [-4, -7], [2, -7], [4, -5], [4, -2], [2, 0], [-4, 0]], [[2, 0], [4, 2], [4, 5], [2, 7], [-4, 7]]],
  C: [[[4, -7], [-4, -7], [-4, 7], [4, 7]]],
  D: [[[-4, -7], [2, -7], [4, -4], [4, 4], [2, 7], [-4, 7], [-4, -7]]],
  E: [[[4, -7], [-4, -7], [-4, 7], [4, 7]], [[-4, 0], [2, 0]]],
  L: [[[-4, -7], [-4, 7], [4, 7]]],
  R: [[[-4, 7], [-4, -7], [2, -7], [4, -5], [4, -2], [2, 0], [-4, 0]], [[0, 0], [4, 7]]],
  T: [[[-4, -7], [4, -7]], [[0, -7], [0, 7]]],
  M: [[[-4, 7], [-4, -7], [0, 1], [4, -7], [4, 7]]],
  O: [[[-2, -7], [2, -7], [4, -5], [4, 5], [2, 7], [-2, 7], [-4, 5], [-4, -5], [-2, -7]]],
  S: [[[4, -6], [2, -7], [-2, -7], [-4, -5], [-4, -2], [-2, 0], [2, 0], [4, 2], [4, 5], [2, 7], [-2, 7], [-4, 6]]],
  U: [[[-4, -7], [-4, 5], [-2, 7], [2, 7], [4, 5], [4, -7]]],
  V: [[[-4, -7], [0, 7], [4, -7]]],
  X: [[[-4, -7], [4, 7]], [[4, -7], [-4, 7]]],
  Z: [[[-4, -7], [4, -7], [-4, 7], [4, 7]]],
};
// Group: os traços são desenhados juntos, como uma peça só — senão a ordenação 3D esconde alguns atrás da placa
function glyph(Z, addTo, lines, { color = '#1a1a1a', stroke = 2.4, scale = 0.8, z = 0 } = {}) {
  const g = new Z.Group({ addTo, translate: { z } });
  for (const l of lines) new Z.Shape({ addTo: g, path: l.map(([x, y]) => ({ x: x * scale, y: y * scale })), closed: false, stroke, color });
  return g;
}
const smooth = k => k * k * (3 - 2 * k);
// repinta um bloco (slab/cube) mantendo o sombreado das faces
function paintBox(box, c) {
  box.color = box.frontFace = c; box.topFace = shade(c, 0.25); box.leftFace = shade(c, -0.12);
  box.rightFace = shade(c, -0.25); box.bottomFace = shade(c, -0.35); box.rearFace = shade(c, -0.15);
}
// fundo (tabuleiro, gabinete) desenhado antes de tudo, na ordem do nível (0 primeiro). A Zdog ordena cada peça
// pelo centro: uma placa grande inclinada ficava na frente do que está em cima dela. sort: false mantém a ordem
// de criação dentro do grupo (bom pra camadas no mesmo plano); true ordena as faces de um bloco 3D
function backdrop(Z, addTo, level = 0, { sort = true, ...opts } = {}) {
  const g = new Z.Group({ addTo, updateSort: sort, ...opts });
  const base = g.updateSortValue;
  g.updateSortValue = function () { base.call(this); this.sortValue = -1e4 + level; };
  return g;
}

// Cada cena recebe (Z, illo) e devolve update(t) — t em segundos.
const SCENES_3D = {
  // chuva de peças: as 7 peças do Tetris caem girando em profundidades diferentes, cada uma no seu ritmo, e voltam
  // pro alto quando saem do card. Cada peça é um Group (as faces se ordenam dentro dela, sem misturar com as outras).
  blocos(Z, illo) {
    const C = 13;
    const SHAPES = {
      I: [[-1.5, 0], [-0.5, 0], [0.5, 0], [1.5, 0]], O: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
      T: [[-1, 0.5], [0, 0.5], [1, 0.5], [0, -0.5]], L: [[-1, 0.5], [0, 0.5], [1, 0.5], [1, -0.5]],
      J: [[-1, 0.5], [0, 0.5], [1, 0.5], [-1, -0.5]], S: [[-1, 0.5], [0, 0.5], [0, -0.5], [1, -0.5]],
      Z: [[-1, -0.5], [0, -0.5], [0, 0.5], [1, 0.5]],
    };
    const COLOR = { I: '#4dc3ff', O: '#ffd34d', T: '#8b6cff', L: '#ff8a5c', J: '#5b7cff', S: '#3ddc97', Z: '#ff6b8a' };
    // x (coluna), z (profundidade: as de trás menores), atraso, velocidade e giro de cada peça
    const RAIN = [['T', -42, -26, 0, 1, 0.9], ['I', 6, 10, 0.55, 0.85, -0.6], ['O', 44, -10, 0.25, 1.1, 0.7], ['S', -16, 24, 0.8, 0.95, -0.8],
      ['L', 32, 30, 0.1, 1.05, 0.5], ['Z', -46, 4, 0.45, 0.9, -0.7], ['J', 12, -34, 0.7, 1, 0.8], ['O', -10, -40, 0.95, 0.8, -0.5],
      ['T', 40, -30, 0.62, 0.9, -0.6], ['I', -34, 18, 0.33, 1.1, 0.5]];
    const pieces = RAIN.map(([k, x, z, delay, speed, spin]) => {
      const g = new Z.Group({ addTo: illo, updateSort: true, translate: { x, z } });
      for (const [cx, cy] of SHAPES[k]) cube(Z, g, C - 1, COLOR[k], { translate: { x: cx * C, y: cy * C } });
      return { g, x, delay, speed, spin, tilt: (k.charCodeAt(0) % 3) - 1 };
    });
    // brilhinhos que ficam pra trás da peça mais rápida
    const sparks = Array.from({ length: 5 }, (_, i) => new Z.Shape({ addTo: illo, stroke: 2.2, color: i % 2 ? '#ffffff' : '#ffe68a' }));
    return t => {
      const FALL = 3.4; // segundos pra atravessar o card
      pieces.forEach(p => {
        const k = ((t * p.speed) / FALL + p.delay) % 1;
        p.g.translate.y = -105 + k * 210;
        p.g.translate.x = p.x + Math.sin(t * 0.9 + p.delay * 6) * 4;
        p.g.rotate.z = p.spin * (t + p.delay * 5);
        p.g.rotate.x = 0.35 + Math.sin(t * 0.7 + p.delay * 4) * 0.25 * p.tilt;
        p.g.rotate.y = 0.4 * Math.sin(t * 0.5 + p.delay * 3);
      });
      const lead = pieces[1];
      sparks.forEach((s, i) => s.translate.set({ x: lead.g.translate.x + Math.sin(t * 3 + i * 2) * 10, y: lead.g.translate.y - 22 - i * 8, z: lead.g.translate.z }));
      sparks.forEach((s, i) => { s.stroke = 2.4 - i * 0.4; });
      illo.rotate.x = -0.15;
      illo.rotate.y = Math.sin(t * 0.4) * 0.3;
    };
  },
  // tabuleiro quadriculado: a cobrinha anda pelas casas, come a maçã (o bocado desce pelo corpo como um caroço)
  // e a maçã nasce de novo mais à frente
  snake(Z, illo) {
    const N = 7, CELL = 12, P = (c, r) => ({ x: (c - 3) * CELL, y: (r - 3) * CELL });
    slab(Z, backdrop(Z, illo, 0), N * CELL + 10, N * CELL + 10, 8, '#4a5290');
    const board = backdrop(Z, illo, 1, { sort: false, translate: { z: 4.3 } });
    new Z.Rect({ addTo: board, width: N * CELL + 6, height: N * CELL + 6, stroke: 2, fill: true, color: '#4a5290' });
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) new Z.Rect({ addTo: board, width: CELL - 0.6, height: CELL - 0.6, stroke: 0.6, fill: true, color: (r + c) % 2 ? '#2b3366' : '#343d78', translate: P(c, r) });
    // caminho fechado pelas casas (sem cruzar consigo mesmo)
    const corners = [[1, 1], [5, 1], [5, 5], [3, 5], [3, 3], [1, 3]], cells = [];
    corners.forEach(([c, r], i) => {
      const [c2, r2] = corners[(i + 1) % corners.length], n = Math.abs(c2 - c) + Math.abs(r2 - r);
      for (let k = 0; k < n; k++) cells.push([c + Math.sign(c2 - c) * k, r + Math.sign(r2 - r) * k]);
    });
    const L = cells.length, wrap = s => ((s % L) + L) % L;
    const at = s => {
      s = wrap(s);
      const i = Math.floor(s), f = s - i, a = P(...cells[i]), b = P(...cells[(i + 1) % L]);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    };
    // corpo: bolinhas listradas, do rabo (fino) até o pescoço
    const SEGS = 7, GAP = 0.82;
    const body = Array.from({ length: SEGS }, (_, i) => new Z.Shape({ addTo: illo, stroke: 11 - i * 0.5, color: i % 2 ? '#2fbf80' : '#3ddc97' }));
    // cabeça: olhos e língua giram junto com a direção
    const head = new Z.Anchor({ addTo: illo });
    new Z.Shape({ addTo: head, stroke: 12.5, color: '#5ff0ac' });
    for (const s of [-1, 1]) {
      new Z.Shape({ addTo: head, stroke: 4.6, color: '#ffffff', translate: { x: 2.4, y: s * 3.2, z: 4 } });
      new Z.Shape({ addTo: head, stroke: 2.2, color: '#10131c', translate: { x: 3.3, y: s * 3.2, z: 5.8 } });
    }
    const tongue = new Z.Shape({ addTo: head, path: [{ x: 6 }, { x: 10.5 }, { x: 12.5, y: -1.8 }, { x: 10.5 }, { x: 12.5, y: 1.8 }], closed: false, stroke: 1.3, color: '#ff4d6a', translate: { z: 1 } });
    // maçãs em duas casas do caminho
    const apples = [3, 11].map(idx => {
      const a = new Z.Group({ addTo: illo, updateSort: true, translate: { ...P(...cells[idx]), z: 9 } }); // Group: o visible esconde tudo
      new Z.Shape({ addTo: a, stroke: 10, color: '#ff5c6c' });
      new Z.Shape({ addTo: a, stroke: 2.6, color: '#ffc2c9', translate: { x: -2, y: -2, z: 4.4 } });
      new Z.Shape({ addTo: a, path: [{ y: -4.5 }, { x: 1.2, y: -7.5 }], stroke: 1.6, color: '#7a4a2a', translate: { z: 1 } });
      new Z.Ellipse({ addTo: a, width: 5, height: 2.6, stroke: 1.4, fill: true, color: '#3ddc97', translate: { x: 3.4, y: -7, z: 1 }, rotate: { z: -0.5 } });
      const bits = Array.from({ length: 6 }, (_, i) => ({ s: new Z.Shape({ addTo: illo, stroke: 2.4, color: i % 2 ? '#ffd34d' : '#ff8a9e' }), ang: (i / 6) * Z.TAU }));
      return { a, idx, bits };
    });
    return t => {
      const h = t * 3.2;
      // cabeça na frente, rabo um pouquinho mais pra trás (assim a Zdog sempre desenha a cabeça por cima)
      const hp = at(h), ahead = at(h + 0.08), back = at(h - 0.08);
      head.translate.set({ ...hp, z: 9.6 });
      head.rotate.z = Math.atan2(ahead.y - back.y, ahead.x - back.x);
      tongue.visible = Math.sin(t * 9) > 0.55;
      let gulp = Infinity;
      apples.forEach(ap => {
        const since = wrap(h - ap.idx), back = SEGS * GAP + 1.5;
        // some quando a cabeça chega nela; nasce de novo (crescendo) depois que o rabo passa
        ap.a.visible = since > back && since < L - 0.25;
        ap.a.scale = Math.max(0.01, smooth(Math.min(1, (since - back) / 0.8)));
        ap.a.translate.z = 9 + Math.sin(t * 4 + ap.idx) * 1;
        if (since < SEGS * GAP + 1) gulp = Math.min(gulp, since);
        const burst = since < 0.9 ? since / 0.9 : -1;
        ap.bits.forEach(({ s, ang }) => {
          s.visible = burst >= 0;
          const p = P(...cells[ap.idx]), d = 4 + burst * 12;
          s.translate.set({ x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d, z: 12 });
          s.stroke = 2.6 * (1 - burst) + 0.4;
        });
      });
      body.forEach((seg, i) => {
        const d = (i + 1) * GAP;
        seg.translate.set({ ...at(h - d), z: 9 - i * 0.12 });
        // o caroço da maçã descendo pelo corpo
        seg.stroke = 11 - i * 0.5 + (gulp < Infinity ? 4 * Math.exp(-((gulp - d) ** 2) / 0.35) : 0);
      });
      illo.rotate.x = -0.42;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // tabuleiro do 2048: o "2" da direita desliza, junta com o outro "2" num "4" que pula, e um "2" novo nasce
  g2048(Z, illo) {
    const S = 25, pos = (c, r) => ({ x: (c - 1) * S, y: (r - 1) * S });
    slab(Z, backdrop(Z, illo, 0), 3 * S + 10, 3 * S + 10, 8, '#4a4060');
    const board = backdrop(Z, illo, 1, { sort: false, translate: { z: 4.3 } });
    new Z.Rect({ addTo: board, width: 3 * S + 6, height: 3 * S + 6, stroke: 2, fill: true, color: '#4a4060' });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) new Z.Rect({ addTo: board, width: S - 5, height: S - 5, stroke: 1.5, fill: true, color: '#3a3150', translate: pos(c, r) });
    // cores do jogo original: claro com número escuro até o 4, laranja com número branco depois
    const STYLE = { 2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#ffffff'], 16: ['#f59563', '#ffffff'], 32: ['#f67c5f', '#ffffff'] };
    const tile = (n, c, r) => {
      const a = new Z.Group({ addTo: illo, updateSort: true, translate: { ...pos(c, r), z: 4 } }); // Group: o visible esconde tudo
      const [bg, fg] = STYLE[n];
      slab(Z, a, S - 6, S - 6, 6, bg, { translate: { z: 3 } });
      // frente + número num Group (desenhados em ordem, como uma peça só)
      const face = new Z.Group({ addTo: a, translate: { z: 6.4 } });
      new Z.Rect({ addTo: face, width: S - 8, height: S - 8, stroke: 2, fill: true, color: bg });
      const ds = [...String(n)].map(Number), sc = ds.length > 1 ? 0.5 : 0.62;
      ds.forEach((d, i) => glyph(Z, face, digitLines(d).map(l => l.map(([x, y]) => [x + (i - (ds.length - 1) / 2) * 18, y])), { color: fg, stroke: 2.3, scale: sc, z: 0.4 }));
      return a;
    };
    tile(4, 0, 1); tile(8, 1, 1); tile(16, 0, 2); tile(32, 1, 2);
    const left = tile(2, 0, 0), right = tile(2, 2, 0), four = tile(4, 0, 0), spawn = tile(2, 2, 2);
    return t => {
      const k = (t / 3.4) % 1;
      // 0–0,1: os dois "2" aparecem; 0,18–0,36: o da direita desliza até o outro
      const born = smooth(Math.min(1, k / 0.1));
      const slide = smooth(Math.min(1, Math.max(0, (k - 0.18) / 0.18)));
      const merged = k >= 0.36;
      left.visible = right.visible = !merged;
      left.scale = right.scale = Math.max(0.01, born);
      right.translate.x = pos(2, 0).x + (pos(0, 0).x - pos(2, 0).x) * slide;
      // juntou: o "4" pula pra frente e cresce um pouco; depois um "2" novo nasce no canto
      const pop = merged ? Math.sin(Math.min(1, (k - 0.36) / 0.18) * Math.PI) : 0;
      const out = k > 0.88 ? 1 - smooth((k - 0.88) / 0.1) : 1;
      four.visible = merged && out > 0.05;
      four.scale = (1 + pop * 0.22) * out;
      four.translate.z = 4 + pop * 10;
      const sp = Math.min(1, Math.max(0, (k - 0.5) / 0.14));
      spawn.visible = sp > 0.05 && out > 0.05;
      spawn.scale = (sp < 1 ? smooth(sp) * (1 + Math.sin(sp * Math.PI) * 0.25) : 1) * out;
      illo.rotate.x = -0.32;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // dois buracos na grama: a toupeira sobe, espia, leva a martelada (estrelinhas, olhos em X) e se esconde;
  // a próxima sobe no outro buraco
  toupeira(Z, illo) {
    // Zdog não recorta, então o "dentro do buraco" é feito pela ordem de desenho: num Group as peças saem
    // na ordem em que foram criadas — fundo do buraco, toupeira, monte de terra na frente (que a esconde)
    const HOLE = 22, XS = [-30, 30];
    const moles = XS.map(x => {
      const g = new Z.Group({ addTo: illo, translate: { x } });
      new Z.Ellipse({ addTo: g, width: 34, height: 12, stroke: 2, fill: true, color: '#140f1f', translate: { y: HOLE } }); // fundo do buraco
      const a = new Z.Anchor({ addTo: g });
      const body = new Z.Shape({ addTo: a, path: [{ y: 4 }, { y: 30 }], stroke: 26, color: '#a3714c' }); // ombros: até a boca do buraco
      [-1, 1].forEach(s => new Z.Shape({ addTo: a, stroke: 6.5, color: '#8c5a3a', translate: { x: s * 10, y: -10 } })); // orelhas
      new Z.Shape({ addTo: a, stroke: 24, color: '#b07a52' }); // cabeça
      [-1, 1].forEach(s => new Z.Shape({ addTo: a, stroke: 5, color: '#e89a8a', translate: { x: s * 7.5, y: 3, z: 8 } })); // bochechas
      new Z.Shape({ addTo: a, stroke: 9, color: '#e8b896', translate: { y: 4, z: 9 } }); // focinho
      new Z.Shape({ addTo: a, path: [{ x: -1.2, y: 8 }, { x: 1.2, y: 8 }], stroke: 2.6, color: '#ffffff', translate: { z: 11 } }); // dentinhos
      new Z.Shape({ addTo: a, stroke: 4.5, color: '#ff8fa3', translate: { y: 1, z: 13.5 } }); // nariz
      const eyes = [-1, 1].map(s => new Z.Shape({ addTo: a, stroke: 4, color: '#10131c', translate: { x: s * 5, y: -4, z: 10.5 } }));
      const xEyes = [-1, 1].flatMap(s => [1, -1].map(d => new Z.Shape({ addTo: a, path: [{ x: s * 5 - 2, y: -4 - 2 * d }, { x: s * 5 + 2, y: -4 + 2 * d }], stroke: 1.4, color: '#10131c', translate: { z: 11 } })));
      // monte de terra na frente: borda de baixo do buraco + barranco até embaixo, com tufos de grama
      new Z.Shape({
        addTo: g, fill: true, stroke: 2, color: '#6b4a32',
        path: [
          { x: -17, y: HOLE },
          { bezier: [{ x: -17, y: HOLE + 7 }, { x: 17, y: HOLE + 7 }, { x: 17, y: HOLE }] },
          { x: 24, y: HOLE + 6 },
          { bezier: [{ x: 22, y: HOLE + 34 }, { x: -22, y: HOLE + 34 }, { x: -24, y: HOLE + 6 }] },
        ],
      });
      // grama em volta da boca do buraco
      new Z.Shape({
        addTo: g, fill: true, stroke: 2, color: '#2fbf80',
        path: [{ x: -24, y: HOLE + 6 }, { x: -17, y: HOLE }, { bezier: [{ x: -17, y: HOLE + 7 }, { x: 17, y: HOLE + 7 }, { x: 17, y: HOLE }] }, { x: 24, y: HOLE + 6 },
          { x: 21, y: HOLE + 11 }, { x: 17, y: HOLE + 9 }, { x: 12, y: HOLE + 14 }, { x: 6, y: HOLE + 11 }, { x: 0, y: HOLE + 15 }, { x: -6, y: HOLE + 11 }, { x: -12, y: HOLE + 14 }, { x: -17, y: HOLE + 9 }, { x: -21, y: HOLE + 11 }],
      });
      new Z.Shape({ addTo: g, path: [{ x: -17, y: HOLE }, { bezier: [{ x: -17, y: HOLE + 7 }, { x: 17, y: HOLE + 7 }, { x: 17, y: HOLE }] }], closed: false, stroke: 2.5, color: '#5ff0ac' });
      return { a, body, eyes, xEyes };
    });
    // martelo de borracha: cabo de madeira + cabeça vermelha com as pontas claras
    const hammer = new Z.Anchor({ addTo: illo, translate: { z: 22 } });
    new Z.Shape({ addTo: hammer, path: [{ x: 0 }, { x: -30 }], stroke: 4, color: '#c98a4b' });
    const head = new Z.Anchor({ addTo: hammer, translate: { x: -32 }, rotate: { x: Z.TAU / 4 } });
    new Z.Cylinder({ addTo: head, diameter: 14, length: 22, stroke: false, color: '#ff4d6a', frontFace: '#ffd0d8', backface: '#ffd0d8' });
    const stars = Array.from({ length: 3 }, () => new Z.Shape({
      addTo: illo, fill: true, stroke: 1.2, color: '#ffd34d',
      path: Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 1.6 : 4, a = -Math.PI / 2 + i * Math.PI / 5; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }),
    }));
    return t => {
      const T = 2.8, turn = Math.floor(t / T) % 2, k = (t / T) % 1;
      // 0–0,25 sobe; 0,25–0,48 espia; 0,48 martelada; 0,48–0,7 tonta; 0,7–0,9 desce
      const up = k < 0.25 ? smooth(k / 0.25) : k < 0.7 ? 1 : k < 0.9 ? 1 - smooth((k - 0.7) / 0.2) : 0;
      const hit = k >= 0.48 && k < 0.7;
      moles.forEach((m, i) => {
        const on = i === turn ? up : 0;
        const y = HOLE + 14 - on * 28; // embaixo: inteira atrás do monte; em cima: cabeça e ombros pra fora
        m.a.translate.y = y + (i === turn && hit ? 3 : 0);
        m.a.scale = i === turn && hit ? 1 + Math.max(0, 0.6 - (k - 0.48) * 6) * 0.15 : 1;
        m.body.path[1].y = Math.max(4, HOLE + 4 - m.a.translate.y);
        m.body.updatePath();
        m.body.visible = m.a.translate.y < HOLE + 4;
        m.a.rotate.y = i === turn && k > 0.25 && k < 0.48 ? Math.sin((k - 0.25) * 30) * 0.4 : 0;
        m.eyes.forEach(e => { e.visible = !(i === turn && hit); });
        m.xEyes.forEach(e => { e.visible = i === turn && hit; });
      });
      // o martelo levanta enquanto ela espia e desce de uma vez
      const X = XS[turn];
      const raise = k < 0.3 ? smooth(k / 0.3) * 0.5 : k < 0.44 ? 0.5 + smooth((k - 0.3) / 0.14) * 0.5 : k < 0.48 ? 1 - smooth((k - 0.44) / 0.04) : k < 0.62 ? 0 : smooth(Math.min(1, (k - 0.62) / 0.3)) * 0.5;
      hammer.rotate.z = -0.3 + raise * 1.3;
      hammer.translate.x = X + 29;
      hammer.translate.y = -18;
      stars.forEach((s, i) => {
        s.visible = hit;
        const a = t * 7 + (i / 3) * Z.TAU;
        s.translate.set({ x: X + Math.cos(a) * 13, y: HOLE + 14 - 28 - 15 + Math.sin(a) * 2, z: Math.sin(a) * 8 + 4 });
        s.rotate.z = t * 4;
      });
      illo.rotate.y = Math.sin(t * 0.45) * 0.15;
    };
  },
  // aparelho de teste de reflexo: a tela fica vermelha esperando, acende verde com o raio, o botão é apertado
  // e o tempo de reação aparece na tela
  reflexo(Z, illo) {
    slab(Z, backdrop(Z, illo, 0), 86, 92, 16, '#2b2f45', { translate: { y: 4 } });
    // frente inteira num Group (tela, conteúdo e botão desenhados em ordem, logo depois do gabinete)
    const front = backdrop(Z, illo, 1, { sort: false, translate: { z: 8.4 } });
    new Z.Rect({ addTo: front, width: 84, height: 90, stroke: 2, fill: true, color: '#2b2f45', translate: { y: 4 } });
    const screen = new Z.Group({ addTo: front, translate: { y: -15 } });
    new Z.Rect({ addTo: screen, width: 74, height: 44, stroke: 2, fill: true, color: '#161a2b' });
    const scr = new Z.Rect({ addTo: screen, width: 68, height: 38, stroke: 2, fill: true, color: '#ff4d6a' });
    new Z.Shape({ addTo: screen, path: [{ x: -30, y: -10 }, { x: -20, y: -17 }], stroke: 3, color: 'rgba(255,255,255,0.25)' });
    const dots = [-11, 0, 11].map(x => new Z.Shape({ addTo: screen, stroke: 6, color: '#ffffff', translate: { x } }));
    const bolt = new Z.Shape({ addTo: screen, path: [{ x: 3, y: -15 }, { x: -7, y: 2 }, { x: 0, y: 2 }, { x: -3, y: 15 }, { x: 7, y: -3 }, { x: 0, y: -3 }], fill: true, stroke: 2, color: '#ffffff' });
    const digits = [0, 1, 2].map(i => Array.from({ length: 10 }, (_, d) => glyph(Z, screen, digitLines(d).map(l => l.map(([x, y]) => [x + (i - 1) * 13, y])), { color: '#5ff0ac', stroke: 2.8, scale: 1 })));
    // botão de fliperama: aro, lateral e tampa (a tampa desce quando aperta), com brilho
    const BY = 26;
    new Z.Ellipse({ addTo: front, diameter: 34, stroke: 2, fill: true, color: '#161a2b', translate: { y: BY } });
    const side = new Z.Shape({ addTo: front, path: [{ y: 2.5 }, { y: -2.5 }], stroke: 24, color: '#b03a30', translate: { y: BY } });
    const cap = new Z.Ellipse({ addTo: front, diameter: 24, stroke: 2, fill: true, color: '#ff6b5c', translate: { y: BY } });
    const shine = new Z.Shape({ addTo: front, path: [{ x: -6, y: -3 }, { x: -2, y: -6 }], stroke: 2.4, color: 'rgba(255,255,255,0.6)' });
    const wave = new Z.Ellipse({ addTo: front, diameter: 34, stroke: 2.5, color: '#5ff0ac', translate: { y: BY } });
    const TIMES = [187, 213, 164, 239];
    return t => {
      const T = 3.4, k = (t / T) % 1, ms = TIMES[Math.floor(t / T) % TIMES.length];
      const wait = k < 0.45, go = k >= 0.45 && k < 0.56, done = k >= 0.56;
      scr.color = wait ? '#ff4d6a' : go ? '#3ddc97' : '#161a2b';
      dots.forEach((d, i) => { d.visible = wait; d.translate.y = -Math.max(0, Math.sin(t * 7 - i * 0.9)) * 4; });
      bolt.visible = go;
      bolt.scale = go ? 1 + Math.sin((k - 0.45) / 0.11 * Math.PI) * 0.15 : 1;
      // o número "rola" rapidinho antes de parar no tempo final
      const roll = done && k < 0.66, shown = roll ? Math.floor(ms * (k - 0.56) / 0.1) : ms;
      const ds = String(Math.max(0, Math.min(999, shown))).padStart(3, '0').split('').map(Number);
      digits.forEach((set, i) => set.forEach((g, d) => { g.visible = done && ds[i] === d; }));
      // apertou quando ficou verde
      const press = Math.max(0, 1 - Math.abs(k - 0.5) / 0.05);
      // a lateral aparece embaixo da tampa: alta solto, quase nada apertado
      const lift = 5 - press * 4;
      side.path = [{ y: lift / 2 }, { y: -lift / 2 }];
      side.updatePath();
      side.translate.y = BY - lift / 2;
      cap.translate.y = BY - lift;
      shine.translate.y = BY - lift;
      const wk = (k - 0.5) / 0.25;
      wave.visible = wk > 0 && wk < 1;
      wave.scale = 1 + wk * 1.1;
      wave.stroke = 2.5 * (1 - wk) + 0.3;
      illo.rotate.x = -0.2;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // mouse em 3D com o botão esquerdo clicando sem parar: acende, solta ondas e "+1", e o placar ao lado sobe
  clique(Z, illo) {
    const mouse = new Z.Anchor({ addTo: illo, translate: { x: -12, y: 12 } });
    const outline = [{ x: -20, y: -8 }, { arc: [{ x: -20, y: -28 }, { x: 0, y: -28 }] }, { arc: [{ x: 20, y: -28 }, { x: 20, y: -8 }] },
      { x: 20, y: 10 }, { arc: [{ x: 20, y: 28 }, { x: 0, y: 28 }] }, { arc: [{ x: -20, y: 28 }, { x: -20, y: 10 }] }];
    // fio saindo por cima
    new Z.Shape({ addTo: mouse, path: [{ x: 0, y: -28 }, { bezier: [{ x: 0, y: -44 }, { x: 22, y: -40 }, { x: 24, y: -60 }] }], closed: false, stroke: 2.6, color: '#8a90b0', translate: { z: -3 } });
    // corpo com espessura: camadas do escuro (atrás) ao claro
    ['#9aa0bd', '#b5bad3', '#cdd1e6'].forEach((color, i) => new Z.Shape({ addTo: mouse, path: outline, fill: true, stroke: 3, color, translate: { z: -6 + i * 2.5 } }));
    // tampa + botões + rodinha num Group (desenhados em ordem, como uma peça só)
    const top = new Z.Group({ addTo: mouse, translate: { z: 1.6 } });
    new Z.Shape({ addTo: top, path: outline, fill: true, stroke: 2, color: '#eef0fa' });
    const btn = new Z.Shape({ addTo: top, path: [{ x: -18, y: -7 }, { x: -18, y: -9 }, { arc: [{ x: -18, y: -26 }, { x: -1.2, y: -26 }] }, { x: -1.2, y: -7 }], fill: true, stroke: 1.5, color: '#eef0fa' });
    new Z.Shape({ addTo: top, path: [{ x: 0, y: -28 }, { x: 0, y: -6 }], stroke: 1.2, color: '#a3a8c4' });
    new Z.Shape({ addTo: top, path: [{ x: -20, y: -6 }, { x: 20, y: -6 }], stroke: 1.2, color: '#a3a8c4' });
    new Z.Shape({ addTo: top, path: [{ y: -20 }, { y: -13 }], stroke: 4.5, color: '#5b6080' });
    new Z.Shape({ addTo: top, path: [{ x: -12, y: 8 }, { x: -9, y: 18 }], stroke: 3, color: 'rgba(255,255,255,0.8)' });
    // ondas e "+1" saindo do botão
    const BX = -22, BY = -5;
    const waves = [0, 1].map(() => new Z.Ellipse({ addTo: illo, diameter: 14, stroke: 2.5, color: '#ffd34d' }));
    const plus = [0, 1].map(() => {
      const g = new Z.Group({ addTo: illo });
      new Z.Shape({ addTo: g, path: [{ x: -7 }, { x: -2 }], stroke: 2.4, color: '#ffd34d' });
      new Z.Shape({ addTo: g, path: [{ x: -4.5, y: -2.5 }, { x: -4.5, y: 2.5 }], stroke: 2.4, color: '#ffd34d' });
      glyph(Z, g, digitLines(1).map(l => l.map(([x, y]) => [x + 2, y])), { color: '#ffd34d', stroke: 2.4, scale: 0.55 });
      return g;
    });
    // placar: visor com dois dígitos
    const panel = new Z.Anchor({ addTo: illo, translate: { x: 36, y: -34 } });
    slab(Z, panel, 36, 24, 6, '#2b2f45');
    const lcd = new Z.Group({ addTo: panel, translate: { z: 3.4 } });
    new Z.Rect({ addTo: lcd, width: 30, height: 18, stroke: 2, fill: true, color: '#141826' });
    const digits = [0, 1].map(i => Array.from({ length: 10 }, (_, d) => glyph(Z, lcd, digitLines(d).map(l => l.map(([x, y]) => [x + (i ? 6 : -6) / 0.75, y])), { color: '#ffd34d', stroke: 2.2, scale: 0.75, z: 0.4 })));
    return t => {
      // rajada de cliques (6 por segundo) por 2,4s, depois uma pausa curta
      const T = 3.2, k = t % T, burst = k < 2.4, c = k * 6, f = c % 1;
      const down = burst && f < 0.4;
      btn.color = down ? '#ffd34d' : '#eef0fa';
      mouse.rotate.x = down ? 0.08 : 0;
      mouse.translate.z = down ? -1.5 : 0;
      const clicks = burst ? Math.floor(c) : Math.floor(2.4 * 6);
      const n = (Math.floor(t / T) * 15 + clicks) % 100;
      digits.forEach((set, i) => set.forEach((g, d) => { g.visible = d === (i ? n % 10 : Math.floor(n / 10)); }));
      waves.forEach((w, i) => {
        const wk = burst ? ((c - i * 0.5) % 1 + 1) % 1 : 1;
        w.visible = wk < 0.9;
        w.translate.set({ x: BX, y: BY, z: 4 });
        w.scale = 0.6 + wk * 2.2;
        w.stroke = 2.5 * (1 - wk) + 0.3;
      });
      plus.forEach((g, i) => {
        const pk = ((c / 2 - i * 0.5) % 1 + 1) % 1;
        g.visible = burst && pk < 0.85;
        g.translate.set({ x: BX - 22 + i * 6, y: BY - 8 - pk * 28, z: 8 });
        g.scale = 0.8 + Math.sin(Math.min(1, pk * 4) * Math.PI / 2) * 0.3;
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // teclado deitado e um monitor: cada tecla apertada desce e acende, a letra aparece na tela; palavra completa
  // fica verde e a próxima começa
  digitacao(Z, illo) {
    // monitor atrás do teclado
    const mon = backdrop(Z, illo, 0, { translate: { y: -36, z: -16 } });
    slab(Z, mon, 92, 40, 6, '#2b2f45');
    slab(Z, mon, 10, 16, 4, '#23263a', { translate: { y: 26, z: -3 } });
    const scr = backdrop(Z, illo, 1, { sort: false, translate: { y: -36, z: -12.6 } });
    new Z.Rect({ addTo: scr, width: 86, height: 34, stroke: 2, fill: true, color: '#141826' });
    const WORDS = ['REDE', 'DATA', 'BETA', 'CASA'];
    // uma letra de cada palavra por posição; só a que está sendo usada aparece
    const slots = [0, 1, 2, 3].map(i => {
      const g = new Z.Group({ addTo: scr, translate: { x: (i - 1.5) * 15 - 6 } });
      const set = {};
      for (const ch of new Set(WORDS.map(w => w[i]))) set[ch] = glyph(Z, g, LETTERS[ch], { stroke: 2.4, scale: 0.85, color: '#cfe0ff' });
      return set;
    });
    const caret = new Z.Shape({ addTo: scr, path: [{ y: -7 }, { y: 7 }], stroke: 2, color: '#4dc3ff' });
    const check = new Z.Shape({ addTo: scr, path: [{ x: -5, y: 0 }, { x: -1.5, y: 4 }, { x: 6, y: -5 }], closed: false, stroke: 3, color: '#3ddc97', translate: { x: 32 } });
    // teclado deitado: base + teclas (cada tecla é um bloco com a letra na frente)
    const kb = new Z.Anchor({ addTo: illo, translate: { y: 30, z: 6 }, rotate: { x: -0.62 } });
    const base = backdrop(Z, kb, 2);
    slab(Z, base, 104, 50, 6, '#3b4166');
    const ROWS = ['QWERTYUI', 'ASDFGHJ', 'ZXCVBN'], K = 11.5, keys = {};
    ROWS.forEach((row, r) => [...row].forEach((ch, c) => {
      const g = new Z.Group({ addTo: kb, updateSort: true, translate: { x: (c - (row.length - 1) / 2) * K + r * 2.5, y: (r - 1.5) * K + 2, z: 3 } });
      const box = slab(Z, g, K - 2, K - 2, 4, '#e8eaf6', { translate: { z: 2 } });
      const face = new Z.Group({ addTo: g, translate: { z: 4.2 } });
      const front = new Z.Rect({ addTo: face, width: K - 3.5, height: K - 3.5, stroke: 1.5, fill: true, color: '#e8eaf6' });
      if (LETTERS[ch]) glyph(Z, face, LETTERS[ch], { color: '#4a4f75', stroke: 1.5, scale: 0.42, z: 0.3 });
      keys[ch] = { g, box, front };
    }));
    const space = new Z.Group({ addTo: kb, updateSort: true, translate: { y: 2 * K - 1, z: 3 } });
    slab(Z, space, 50, K - 3, 4, '#e8eaf6', { translate: { z: 2 } });
    const paint = (k, c) => {
      k.box.color = k.box.frontFace = c; k.box.topFace = shade(c, 0.25); k.box.leftFace = shade(c, -0.12);
      k.box.rightFace = shade(c, -0.25); k.box.bottomFace = shade(c, -0.35); k.box.rearFace = shade(c, -0.15); k.front.color = c;
    };
    let lit = null;
    return t => {
      // por palavra: 4 teclas (0,35s cada), fica verde um tempo e some
      const T = 2.6, n = Math.floor(t / T), word = WORDS[n % WORDS.length], k = (t % T) / T;
      const typed = Math.min(4, Math.floor(k * 4 / 0.55)), f = (k * 4 / 0.55) % 1, done = typed === 4;
      slots.forEach((set, i) => Object.entries(set).forEach(([ch, g]) => {
        g.visible = ch === word[i] && i < typed;
        g.children.forEach(s => { s.color = done ? '#3ddc97' : '#cfe0ff'; });
      }));
      caret.visible = !done && Math.floor(t * 4) % 2 === 0;
      caret.translate.x = (typed - 1.5) * 15 - 6 - 7.5;
      check.visible = done;
      check.scale = done ? Math.min(1, (k - 0.55) * 10) : 1;
      // a tecla da letra atual desce e acende
      const pressing = !done && f < 0.5 ? keys[word[typed]] : null;
      if (pressing !== lit) {
        if (lit) { paint(lit, '#e8eaf6'); lit.g.translate.z = 3; }
        if (pressing) { paint(pressing, '#ffd34d'); pressing.g.translate.z = 1; }
        lit = pressing;
      }
      illo.rotate.x = -0.15;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // aparelho redondo do Genius: as quatro teclas acendem na sequência (sobem e brilham), o visor do meio mostra
  // a fase; sequência completa, todas piscam e a fase sobe
  memoria(Z, illo) {
    const base = backdrop(Z, illo, 0);
    new Z.Cylinder({ addTo: base, diameter: 112, length: 10, stroke: false, color: '#20243a', backface: '#2b2f45' });
    const top = backdrop(Z, illo, 1, { sort: false, translate: { z: 5.2 } });
    new Z.Ellipse({ addTo: top, diameter: 108, stroke: 2, fill: true, color: '#2b2f45' });
    // quarto de anel (de a0 até a0 + 90°, com uma folguinha entre as teclas)
    const quarter = (a0, r1, r2) => {
      const pts = [], gap = 0.09, n = 10;
      for (let i = 0; i <= n; i++) { const a = a0 + gap + (Math.PI / 2 - 2 * gap) * i / n; pts.push({ x: Math.cos(a) * r2, y: Math.sin(a) * r2 }); }
      for (let i = n; i >= 0; i--) { const a = a0 + gap * 1.6 + (Math.PI / 2 - 3.2 * gap) * i / n; pts.push({ x: Math.cos(a) * r1, y: Math.sin(a) * r1 }); }
      return pts;
    };
    const COLORS = ['#3ddc97', '#ff4d6a', '#ffd34d', '#4dc3ff'];
    const pads = COLORS.map((c, i) => {
      const path = quarter(-Math.PI + i * Math.PI / 2, 20, 50);
      new Z.Shape({ addTo: top, path, fill: true, stroke: 2, color: shade(c, -0.6) }); // vão escuro embaixo da tecla
      const g = new Z.Group({ addTo: illo, translate: { z: 6.5 } });
      const side = new Z.Shape({ addTo: g, path, fill: true, stroke: 2.5, color: shade(c, -0.35) });
      const face = new Z.Shape({ addTo: g, path, fill: true, stroke: 2, color: shade(c, -0.15), translate: { z: 2.5 } });
      const mid = (-Math.PI + i * Math.PI / 2) + Math.PI / 4;
      const glow = new Z.Shape({ addTo: g, path: quarter(-Math.PI + i * Math.PI / 2, 26, 44), fill: true, stroke: 3, color: shade(c, 0.45), translate: { z: 2.8 } });
      const shine = new Z.Shape({ addTo: g, path: [{ x: Math.cos(mid - 0.3) * 42, y: Math.sin(mid - 0.3) * 42 }, { x: Math.cos(mid - 0.05) * 44, y: Math.sin(mid - 0.05) * 44 }], stroke: 2.4, color: 'rgba(255,255,255,0.5)', translate: { z: 3 } });
      return { g, face, glow, shine, c };
    });
    // centro: botão escuro com o visor da fase
    const hub = new Z.Group({ addTo: illo, translate: { z: 9 } });
    new Z.Ellipse({ addTo: hub, diameter: 34, stroke: 3, fill: true, color: '#161a2b' });
    new Z.Ellipse({ addTo: hub, diameter: 34, stroke: 2, color: '#4a4f75' });
    const digits = [0, 1].map(i => Array.from({ length: 10 }, (_, d) => glyph(Z, hub, digitLines(d).map(l => l.map(([x, y]) => [x + (i ? 6 : -6), y])), { color: '#ff4d6a', stroke: 2.4, scale: 0.75 })));
    const SEQ = [0, 2, 1, 3, 2, 0, 3, 1];
    return t => {
      // fase n mostra n+2 teclas; 0,45s por tecla; depois todas piscam
      const T = 0.45, rounds = [3, 4, 5];
      let time = t % rounds.reduce((s, n) => s + n * T + 1.1, 0), r = 0;
      while (time > rounds[r] * T + 1.1) { time -= rounds[r] * T + 1.1; r++; }
      const n = rounds[r], step = Math.floor(time / T), f = (time / T) % 1, show = step < n;
      const lit = show && f < 0.7 ? SEQ[step] : -1;
      const party = !show && Math.floor((time - n * T) * 6) % 2 === 0 && time - n * T < 0.8;
      pads.forEach((p, i) => {
        const on = i === lit || party;
        p.face.color = on ? p.c : shade(p.c, -0.15);
        p.glow.visible = on;
        p.g.translate.z = on ? 8.5 : 6.5;
      });
      const level = show ? r + 1 : r + 2;
      digits.forEach((set, i) => set.forEach((g, d) => { g.visible = d === (i ? level % 10 : Math.floor(level / 10)); }));
      illo.rotate.x = -0.55;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
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
  // calculadora: a conta é digitada tecla por tecla (a tecla desce e acende), o "=" mostra o resultado em verde
  matematica(Z, illo) {
    const OPS = {
      '+': [[[-4, 0], [4, 0]], [[0, -4], [0, 4]]], '-': [[[-4, 0], [4, 0]]], 'x': [[[-3.2, -3.2], [3.2, 3.2]], [[3.2, -3.2], [-3.2, 3.2]]],
      '/': [[[-4, 0], [4, 0]], [[0, -5], [0, -4.6]], [[0, 4.6], [0, 5]]], '=': [[[-4, -2.2], [4, -2.2]], [[-4, 2.2], [4, 2.2]]],
    };
    const lines = ch => OPS[ch] || digitLines(+ch);
    const body = backdrop(Z, illo, 0);
    slab(Z, body, 80, 104, 10, '#2b2f45');
    const front = backdrop(Z, illo, 1, { sort: false, translate: { z: 5.4 } });
    new Z.Rect({ addTo: front, width: 76, height: 100, stroke: 2, fill: true, color: '#2b2f45' });
    new Z.Rect({ addTo: front, width: 66, height: 24, stroke: 2, fill: true, color: '#141826', translate: { y: -34 } });
    // visor: até 3 posições; cada uma tem todos os símbolos prontos e mostra um
    const CH = '0123456789+-x/=';
    const cells = [0, 1, 2].map(i => Object.fromEntries([...CH].map(ch => [ch, glyph(Z, front, lines(ch).map(l => l.map(([x, y]) => [x + (i - 1) * 14 / 0.9, y - 34 / 0.9])), { color: '#cfe0ff', stroke: 2.4, scale: 0.9 })])));
    // teclas
    const GRID = ['789/', '456x', '123-', '0.=+'], KEY = 15, keys = {};
    GRID.forEach((row, r) => [...row].forEach((ch, c) => {
      const op = '/x-+='.includes(ch), color = ch === '=' ? '#ff8a5c' : op ? '#8b6cff' : '#e8eaf6';
      const g = new Z.Group({ addTo: illo, updateSort: true, translate: { x: (c - 1.5) * (KEY + 2), y: (r - 0.5) * (KEY + 1) + 4, z: 5 } });
      const box = slab(Z, g, KEY - 1, KEY - 2, 5, color, { translate: { z: 2.5 } });
      const face = new Z.Group({ addTo: g, translate: { z: 5.3 } });
      const top = new Z.Rect({ addTo: face, width: KEY - 3, height: KEY - 4, stroke: 1.5, fill: true, color });
      const fg = op ? '#ffffff' : '#4a4f75';
      if (ch === '.') new Z.Shape({ addTo: face, stroke: 2.4, color: fg, translate: { y: 3 } });
      else glyph(Z, face, lines(ch), { color: fg, stroke: 1.8, scale: 0.55, z: 0.3 });
      keys[ch] = { g, box, top, color };
    }));
    const paint = (k, c) => {
      k.box.color = k.box.frontFace = c; k.box.topFace = shade(c, 0.25); k.box.leftFace = shade(c, -0.12);
      k.box.rightFace = shade(c, -0.25); k.box.bottomFace = shade(c, -0.35); k.box.rearFace = shade(c, -0.15); k.top.color = c;
    };
    const SUMS = [['7+5', '12'], ['9x3', '27'], ['8-6', '2'], ['6/2', '3']];
    let lit = null;
    return t => {
      // 3 teclas da conta + "=" (0,35s cada), resultado fica um tempo
      const T = 2.8, [expr, res] = SUMS[Math.floor(t / T) % SUMS.length], k = (t % T) / 0.35;
      const step = Math.floor(k), f = k % 1, answered = step >= 4;
      const text = answered ? res.padStart(3, ' ') : expr.slice(0, Math.min(3, step + (f > 0.3 ? 1 : 0))).padEnd(3, ' ');
      cells.forEach((set, i) => Object.entries(set).forEach(([ch, g]) => {
        g.visible = text[i] === ch;
        g.children.forEach(s => { s.color = answered ? '#3ddc97' : '#cfe0ff'; });
      }));
      const press = step < 4 && f < 0.55 ? keys[step < 3 ? expr[step] : '='] : null;
      if (press !== lit) {
        if (lit) { paint(lit, lit.color); lit.g.translate.z = 5; }
        if (press) { paint(press, '#ffd34d'); press.g.translate.z = 2.5; }
        lit = press;
      }
      illo.rotate.x = -0.28;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
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
    const star = new Z.Group({ addTo: pipes[1].a, updateSort: true }); // Group: num Anchor o visible não esconde os filhos
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
  // chuva de besouros caindo e um notebook desviando pra lá e pra cá; quando um passa raspando, sai faísca
  chuva(Z, illo) {
    const bug = (color, i) => {
      const g = new Z.Group({ addTo: illo, updateSort: true });
      // patinhas e antenas atrás do corpo
      [-1, 0, 1].forEach(r => [-1, 1].forEach(s => new Z.Shape({ addTo: g, path: [{ x: s * 3, y: r * 4 }, { x: s * 9, y: r * 4.5 + 2 }, { x: s * 11, y: r * 5 + 5 }], closed: false, stroke: 1.6, color: '#1d2033', translate: { z: -1 } })));
      [-1, 1].forEach(s => new Z.Shape({ addTo: g, path: [{ x: s * 2, y: -10 }, { x: s * 5, y: -15 }, { x: s * 8, y: -15 }], closed: false, stroke: 1.4, color: '#1d2033', translate: { z: -1 } }));
      new Z.Shape({ addTo: g, stroke: 9, color: '#1d2033', translate: { y: -7 } }); // cabeça
      new Z.Shape({ addTo: g, stroke: 16, color: shade(color, -0.25), translate: { y: 3, z: -1.5 } }); // casco (volume)
      new Z.Shape({ addTo: g, stroke: 15, color, translate: { y: 3 } });
      // asas: risca no meio, pintinhas e brilho (num Group na frente, desenhados em ordem)
      const top = new Z.Group({ addTo: g, translate: { z: 7.6 } });
      new Z.Shape({ addTo: top, path: [{ y: -4 }, { y: 10 }], stroke: 1.2, color: shade(color, -0.45) });
      for (const [x, y] of [[-3.5, 0], [3.5, 2], [-3, 6.5], [3, 7.5]]) new Z.Shape({ addTo: top, stroke: 3, color: shade(color, -0.55), translate: { x, y } });
      new Z.Shape({ addTo: top, path: [{ x: -4, y: -2 }, { x: -2, y: -4 }], stroke: 2, color: 'rgba(255,255,255,0.7)' });
      [-1, 1].forEach(s => new Z.Shape({ addTo: g, stroke: 2.4, color: '#ffffff', translate: { x: s * 2.2, y: -8.5, z: 4 } }));
      return { g, x: [-46, -10, 26, 52][i], off: [0, 0.55, 0.25, 0.8][i], spin: i % 2 ? 1 : -1 };
    };
    const bugs = ['#3ddc97', '#ff4d6a', '#8b6cff', '#ffd34d'].map(bug);
    // notebook: base com teclado + tela aberta com um rostinho
    const lap = new Z.Anchor({ addTo: illo, translate: { y: 46 } });
    slab(Z, lap, 42, 4, 26, '#b5bad3', { translate: { y: 4 } });
    const kbd = new Z.Group({ addTo: lap, translate: { y: 1.8 }, rotate: { x: Z.TAU / 4 } });
    new Z.Rect({ addTo: kbd, width: 36, height: 16, stroke: 1, fill: true, color: '#4a4f75', translate: { y: -2 } });
    const lid = new Z.Anchor({ addTo: lap, translate: { y: 2, z: -12 }, rotate: { x: 0.25 } });
    slab(Z, lid, 42, 28, 3, '#b5bad3', { translate: { y: -14 } });
    const scr = new Z.Group({ addTo: lid, translate: { y: -14, z: 1.7 } });
    new Z.Rect({ addTo: scr, width: 36, height: 22, stroke: 1.5, fill: true, color: '#141826' });
    const eyes = [-6, 6].map(x => new Z.Shape({ addTo: scr, path: [{ x, y: -4 }, { x, y: -1 }], stroke: 2.6, color: '#4dc3ff' }));
    const mouth = new Z.Shape({ addTo: scr, path: [{ x: -5, y: 4 }, { bezier: [{ x: -2, y: 7 }, { x: 2, y: 7 }, { x: 5, y: 4 }] }], closed: false, stroke: 2, color: '#4dc3ff' });
    const sparks = Array.from({ length: 6 }, (_, i) => ({ s: new Z.Shape({ addTo: illo, path: [{ x: 0 }, { x: 4 }], stroke: 1.8, color: i % 2 ? '#ffd34d' : '#ffffff' }), a: (i / 6) * Z.TAU }));
    return t => {
      // o notebook passeia de um lado pro outro; cada besouro cai mirando um pouco ao lado de onde ele vai estar
      const P = 2.4, lapX = tt => Math.sin(tt * 0.9) * 30;
      lap.translate.x = lapX(t);
      lap.rotate.z = -Math.cos(t * 0.9) * 0.12;
      const ys = bugs.map((b, i) => {
        const tt = t + b.off * P, c = Math.floor(tt / P), k = (tt / P) % 1, arrive = t + (0.75 - k) * P;
        const side = (c * 3 + i) % 2 ? 1 : -1, x = Math.max(-62, Math.min(62, lapX(arrive) + side * (34 + ((c * 37 + i * 13) % 4) * 8)));
        b.g.translate.set({ x: x + Math.sin(t * 2 + i) * 2, y: -80 + k * 170, z: 6 });
        b.g.rotate.z = Math.sin(t * 3 + i * 2) * 0.3 * b.spin;
        return b.g.translate.y;
      });
      // passou raspando: faísca e cara de susto
      const near = bugs.find((b, i) => ys[i] > 24 && ys[i] < 56 && Math.abs(b.g.translate.x - lap.translate.x) < 42);
      eyes.forEach(e => { e.stroke = near ? 4 : 2.6; });
      mouth.path = near ? [{ x: -2, y: 4 }, { bezier: [{ x: -2, y: 7 }, { x: 2, y: 7 }, { x: 2, y: 4 }] }, { bezier: [{ x: 2, y: 1 }, { x: -2, y: 1 }, { x: -2, y: 4 }] }] : [{ x: -5, y: 4 }, { bezier: [{ x: -2, y: 7 }, { x: 2, y: 7 }, { x: 5, y: 4 }] }];
      mouth.updatePath();
      sparks.forEach(({ s, a }) => {
        s.visible = !!near;
        if (!near) return;
        const p = near.g.translate, k = (t * 3) % 1;
        s.translate.set({ x: p.x + Math.cos(a) * (8 + k * 8), y: p.y + 6 + Math.sin(a) * (8 + k * 8), z: 10 });
        s.rotate.z = a;
      });
      illo.rotate.x = -0.2;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // placa com o nome de uma cor pintado em OUTRA cor; o botão da cor da tinta (não da palavra) é apertado,
  // acende com um ✓ e a próxima palavra entra virando
  cores(Z, illo) {
    const INK = { amarelo: '#ffd34d', verde: '#3ddc97', rosa: '#ff6b8a', azul: '#4dc3ff' };
    const ROUNDS = [['AZUL', 'amarelo'], ['ROXO', 'verde'], ['VERDE', 'rosa'], ['ROSA', 'azul']];
    const card = new Z.Anchor({ addTo: illo, translate: { y: -20 } });
    slab(Z, card, 96, 42, 6, '#eef0fb');
    const face = new Z.Group({ addTo: card, translate: { z: 3.4 } });
    new Z.Rect({ addTo: face, width: 94, height: 40, stroke: 2, fill: true, color: '#eef0fb' });
    // as palavras: letras em traço grosso com uma "sombra" escura logo atrás (dá relevo de tinta)
    const words = ROUNDS.map(([w, ink]) => {
      const g = new Z.Group({ addTo: face });
      [...w].forEach((ch, i) => {
        const x = (i - (w.length - 1) / 2) * 17;
        glyph(Z, g, LETTERS[ch].map(l => l.map(([px, py]) => [px + x / 1.3, py + 0.8])), { color: shade(INK[ink], -0.35), stroke: 3.6, scale: 1.3, z: 0.2 });
        glyph(Z, g, LETTERS[ch].map(l => l.map(([px, py]) => [px + x / 1.3, py])), { color: INK[ink], stroke: 3.6, scale: 1.3, z: 0.4 });
      });
      return g;
    });
    // botões de tinta: gota com volume (três camadas) e brilho
    const KEYS = Object.keys(INK);
    const buttons = KEYS.map((name, i) => {
      const a = new Z.Anchor({ addTo: illo, translate: { x: (i - 1.5) * 26, y: 30 } });
      new Z.Cylinder({ addTo: a, diameter: 22, length: 6, stroke: false, color: shade(INK[name], -0.35), frontFace: INK[name], translate: { z: 3 } });
      const top = new Z.Group({ addTo: a, translate: { z: 6.3 } });
      const ring = new Z.Ellipse({ addTo: top, diameter: 27, stroke: 2.5, color: '#ffffff' });
      new Z.Shape({ addTo: top, path: [{ x: -6, y: -3 }, { x: -3, y: -6 }], stroke: 2.4, color: 'rgba(255,255,255,0.65)' });
      const check = new Z.Shape({ addTo: top, path: [{ x: -4.5, y: 0 }, { x: -1.2, y: 3.5 }, { x: 5, y: -4 }], closed: false, stroke: 3, color: '#ffffff' });
      return { a, ring, check, name };
    });
    const sparks = Array.from({ length: 8 }, (_, i) => ({ s: new Z.Shape({ addTo: illo, stroke: 3, color: PALETTE[i % PALETTE.length] }), a: (i / 8) * Z.TAU }));
    return t => {
      const T = 2.2, n = Math.floor(t / T) % ROUNDS.length, k = (t % T) / T, ink = ROUNDS[n][1];
      words.forEach((g, i) => { g.visible = i === n; });
      // a placa entra virando, fica, e vira de novo no fim
      card.rotate.x = k < 0.15 ? (1 - smooth(k / 0.15)) * -Math.PI / 2 : k > 0.9 ? smooth((k - 0.9) / 0.1) * Math.PI / 2 : 0;
      card.translate.y = -20 + Math.sin(t * 1.6) * 1.5;
      // em 0,45 aperta o botão da cor da TINTA
      const press = k > 0.42 && k < 0.52, ok = k >= 0.45 && k < 0.9;
      buttons.forEach(b => {
        const me = b.name === ink;
        b.a.translate.z = me && press ? -3 : me && ok ? 3 + Math.sin(Math.min(1, (k - 0.45) * 6) * Math.PI) * 5 : 0;
        b.ring.visible = me && ok;
        b.check.visible = me && ok;
      });
      const bx = (KEYS.indexOf(ink) - 1.5) * 26, sk = (k - 0.45) / 0.3;
      sparks.forEach(({ s, a }) => {
        s.visible = sk > 0 && sk < 1;
        s.translate.set({ x: bx + Math.cos(a) * (10 + sk * 18), y: 30 + Math.sin(a) * (10 + sk * 14), z: 10 });
        s.stroke = 3 * (1 - sk) + 0.5;
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // grade 3x3 com os números embaralhados: o cursor clica de 1 a 9 em ordem, cada um fica verde e pula;
  // o visor mostra o próximo; completou, as peças viram e embaralham de novo
  numeros(Z, illo) {
    const S = 23, pos = i => ({ x: ((i % 3) - 1) * S, y: (Math.floor(i / 3) - 1) * S + 10 });
    const ORDERS = [[7, 2, 9, 4, 1, 6, 3, 8, 5], [3, 8, 1, 6, 9, 2, 5, 4, 7]]; // número de cada casa
    const tiles = Array.from({ length: 9 }, (_, i) => {
      const g = new Z.Group({ addTo: illo, updateSort: true, translate: pos(i) });
      const box = slab(Z, g, S - 3, S - 3, 6, '#2b2f45');
      const face = new Z.Group({ addTo: g, translate: { z: 3.4 } });
      const front = new Z.Rect({ addTo: face, width: S - 5, height: S - 5, stroke: 2, fill: true, color: '#2b2f45' });
      const digits = Array.from({ length: 10 }, (_, d) => glyph(Z, face, digitLines(d), { color: '#cfe0ff', stroke: 2.4, scale: 0.75, z: 0.4 }));
      return { g, box, front, digits };
    });
    // visor "próximo" em cima
    const top = new Z.Anchor({ addTo: illo, translate: { y: -50 } });
    slab(Z, top, 30, 20, 5, '#161a2b');
    const lcd = new Z.Group({ addTo: top, translate: { z: 2.9 } });
    new Z.Rect({ addTo: lcd, width: 28, height: 18, stroke: 1.5, fill: true, color: '#161a2b' });
    const next = Array.from({ length: 10 }, (_, d) => glyph(Z, lcd, digitLines(d), { color: '#ffd34d', stroke: 2.4, scale: 0.75 }));
    // cursor (seta com espessura)
    const cur = new Z.Anchor({ addTo: illo });
    const arrow = [{ x: 0, y: 0 }, { x: 0, y: 17 }, { x: 4.5, y: 13 }, { x: 8, y: 20 }, { x: 11, y: 18.5 }, { x: 7.5, y: 11.5 }, { x: 13, y: 11.5 }];
    [[-2, '#9aa0bd'], [0, '#dfe1ea'], [2, '#ffffff']].forEach(([z, color]) => new Z.Shape({ addTo: cur, path: arrow, fill: true, stroke: 1.6, color, translate: { z } }));
    let state = '';
    return t => {
      const STEP = 0.42, T = 9 * STEP + 1.2, n = Math.floor(t / T), k = t % T, order = ORDERS[n % 2];
      const found = Math.min(9, Math.floor(k / STEP)), f = (k / STEP) % 1, done = found === 9;
      const key = n + ':' + found;
      if (key !== state) {
        tiles.forEach((tl, i) => {
          const c = order[i] <= found ? '#3ddc97' : '#2b2f45';
          paintBox(tl.box, c); tl.front.color = c;
          tl.digits.forEach((g, d) => { g.visible = d === order[i]; });
        });
        next.forEach((g, d) => { g.visible = d === (done ? 0 : found + 1) && !done; });
        state = key;
      }
      tiles.forEach((tl, i) => {
        // a que acabou de ser clicada pula; no fim todas giram (embaralhando)
        const just = order[i] === found && !done && f < 0.6 ? Math.sin(f / 0.6 * Math.PI) : 0;
        tl.g.translate.z = just * 8;
        tl.g.rotate.y = done && k - 9 * STEP > 0.6 ? smooth(Math.min(1, (k - 9 * STEP - 0.6) / 0.5)) * Math.PI * 2 : 0;
      });
      // o cursor vai da casa do número atual até a do próximo
      const at = d => pos(order.indexOf(Math.max(1, Math.min(9, d))));
      const a = at(found), b = at(found + 1), m = done ? 0 : smooth(Math.min(1, f / 0.7));
      const tap = !done && f > 0.8 ? 1 : 0;
      cur.translate.set({ x: a.x + (b.x - a.x) * m + 2, y: a.y + (b.y - a.y) * m + 2, z: 14 - tap * 4 });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // sudoku 4x4 (blocos 2x2) num tabuleiro: a casa vazia acende, o número entra pulando; completou, tudo fica verde
  sudoku(Z, illo) {
    const S = 21, pos = (c, r) => ({ x: (c - 1.5) * S, y: (r - 1.5) * S });
    const SOL = ['1234', '3412', '2143', '4321'], GIVEN = ['1..4', '.4..', '..4.', '4..1'];
    slab(Z, backdrop(Z, illo, 0), 4 * S + 12, 4 * S + 12, 8, '#3b3170');
    const board = backdrop(Z, illo, 1, { sort: false, translate: { z: 4.3 } });
    new Z.Rect({ addTo: board, width: 4 * S + 8, height: 4 * S + 8, stroke: 2, fill: true, color: '#3b3170' });
    const cells = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const bg = new Z.Rect({ addTo: board, width: S - 3, height: S - 3, stroke: 1.5, fill: true, color: '#eceaf8', translate: pos(c, r) });
      cells.push({ c, r, bg, given: GIVEN[r][c] !== '.', n: +SOL[r][c] });
    }
    // linhas grossas entre os blocos 2x2
    new Z.Shape({ addTo: board, path: [{ y: -2 * S }, { y: 2 * S }], stroke: 2.6, color: '#8b6cff' });
    new Z.Shape({ addTo: board, path: [{ x: -2 * S }, { x: 2 * S }], stroke: 2.6, color: '#8b6cff' });
    // números: dados em cinza escuro na própria placa; os que entram são blocos roxos que pulam
    cells.filter(cl => cl.given).forEach(cl => glyph(Z, board, digitLines(cl.n).map(l => l.map(([x, y]) => [x + pos(cl.c, cl.r).x / 0.7, y + pos(cl.c, cl.r).y / 0.7])), { color: '#3a3555', stroke: 2.4, scale: 0.7 }));
    const empties = cells.filter(cl => !cl.given);
    const filled = empties.map(cl => {
      const g = new Z.Group({ addTo: illo, updateSort: true, translate: { ...pos(cl.c, cl.r), z: 4.3 } });
      const box = slab(Z, g, S - 4, S - 4, 5, '#8b6cff', { translate: { z: 2.5 } });
      const face = new Z.Group({ addTo: g, translate: { z: 5.4 } });
      const front = new Z.Rect({ addTo: face, width: S - 6, height: S - 6, stroke: 1.5, fill: true, color: '#8b6cff' });
      glyph(Z, face, digitLines(cl.n), { color: '#ffffff', stroke: 2.4, scale: 0.7, z: 0.3 });
      return { g, box, front, cl };
    });
    // ordem em que as casas são preenchidas
    const ORDER = [0, 5, 2, 9, 7, 1, 10, 4, 11, 3, 8, 6].filter(i => i < filled.length);
    const hi = new Z.Rect({ addTo: illo, width: S - 1, height: S - 1, stroke: 2, color: '#ffd34d' });
    let state = '';
    return t => {
      const STEP = 0.32, T = ORDER.length * STEP + 1.4, k = t % T, step = Math.floor(k / STEP), f = (k / STEP) % 1, done = step >= ORDER.length;
      const win = done && Math.floor((k - ORDER.length * STEP) * 5) % 2 === 0;
      const key = step + (win ? 'w' : '');
      if (key !== state) {
        filled.forEach(fd => { const c = win ? '#3ddc97' : '#8b6cff'; paintBox(fd.box, c); fd.front.color = c; });
        cells.forEach(cl => { cl.bg.color = done ? '#d9f7e9' : '#eceaf8'; });
        state = key;
      }
      filled.forEach((fd, i) => {
        const at = ORDER.indexOf(i);
        fd.g.visible = at < step || (at === step && f > 0.35);
        const pop = at === step && f > 0.35 ? Math.sin((f - 0.35) / 0.65 * Math.PI) : 0;
        fd.g.translate.z = 4.3 + pop * 7;
        fd.g.scale = at === step ? Math.min(1, 0.5 + (f - 0.35) * 2) : 1;
      });
      const cur = !done && filled[ORDER[step]];
      hi.visible = !!cur;
      if (cur) hi.translate.set({ ...pos(cur.cl.c, cur.cl.r), z: 5 });
      illo.rotate.x = -0.32;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // parede de tijolos coloridos; a bola sai da raquete, quebra um tijolo (que explode em pedacinhos) e volta;
  // a raquete corre pra pegar; no fim a parede se refaz
  tijolos(Z, illo) {
    const COLS = 6, ROWS = 3, BW = 19, BH = 9, bx = c => (c - (COLS - 1) / 2) * (BW + 2), by = r => -38 + r * (BH + 2);
    const COLORS = ['#ff4d6a', '#ff8a5c', '#ffd34d'];
    // fundo do fliperama: placa escura com borda, atrás dos tijolos
    const cab = backdrop(Z, illo, 0, { translate: { z: -10 } });
    slab(Z, cab, 140, 112, 6, '#262a40');
    new Z.Rect({ addTo: cab, width: 132, height: 104, stroke: 1.5, fill: true, color: '#1d2033', translate: { z: 3.2 } });
    const bricks = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const g = new Z.Group({ addTo: illo, updateSort: true, translate: { x: bx(c), y: by(r) } });
      slab(Z, g, BW, BH, 8, COLORS[r]);
      const face = new Z.Group({ addTo: g, translate: { z: 4.4 } });
      new Z.Rect({ addTo: face, width: BW - 2, height: BH - 2, stroke: 1.5, fill: true, color: COLORS[r] });
      new Z.Shape({ addTo: face, path: [{ x: -BW / 2 + 3, y: -BH / 2 + 2.2 }, { x: BW / 2 - 6, y: -BH / 2 + 2.2 }], stroke: 1.4, color: shade(COLORS[r], 0.5) });
      bricks.push({ g, c, r });
    }
    // raquete com as pontas arredondadas
    const pad = new Z.Anchor({ addTo: illo, translate: { y: 44 } });
    slab(Z, pad, 30, 6, 8, '#cfd3ff');
    for (const s of [-1, 1]) new Z.Shape({ addTo: pad, stroke: 8, color: '#8b6cff', translate: { x: s * 15 } });
    const ball = new Z.Shape({ addTo: illo, stroke: 8, color: '#ffffff' });
    const ballShine = new Z.Shape({ addTo: illo, stroke: 2.4, color: '#c9d3ff' });
    const trail = [0, 1, 2].map(i => new Z.Shape({ addTo: illo, stroke: 6 - i * 1.5, color: `rgba(255,255,255,${0.35 - i * 0.1})` }));
    const bits = Array.from({ length: 8 }, (_, i) => ({ s: new Z.Rect({ addTo: illo, width: 3.4, height: 3.4, stroke: 0.8, fill: true, color: '#ffffff' }), a: (i / 8) * Z.TAU + 0.3, v: 0.7 + (i % 3) * 0.25 }));
    // alvos de cada rodada (linha de baixo primeiro) e de onde a bola sai
    const HITS = [[2, 2], [4, 2], [1, 2], [3, 1], [5, 2], [2, 1]];
    const PAD_X = [-18, 14, -24, 6, 26, -8, -18];
    return t => {
      const LEG = 0.55, T = HITS.length * LEG * 2 + 0.8, k = t % T, i = Math.floor(k / (LEG * 2)), f = (k % (LEG * 2)) / LEG;
      const playing = i < HITS.length;
      const broken = new Set(HITS.slice(0, Math.min(HITS.length, playing ? i + (f >= 1 ? 1 : 0) : HITS.length)).map(([c, r]) => r * COLS + c));
      const rebuild = playing ? 1 : smooth(Math.min(1, (k - HITS.length * LEG * 2) / 0.6));
      bricks.forEach((b, j) => {
        const gone = broken.has(j) && playing;
        b.g.visible = !gone;
        b.g.scale = broken.has(j) && !playing ? Math.max(0.01, rebuild) : 1;
      });
      // bola: da raquete até o tijolo (f 0–1) e de volta até a próxima posição da raquete (f 1–2)
      const [hc, hr] = HITS[Math.min(i, HITS.length - 1)];
      const from = { x: PAD_X[i] ?? 0, y: 37 }, hit = { x: bx(hc), y: by(hr) + BH / 2 + 4 }, back = { x: PAD_X[i + 1] ?? 0, y: 37 };
      const p = !playing ? from : f < 1 ? { x: from.x + (hit.x - from.x) * f, y: from.y + (hit.y - from.y) * f } : { x: hit.x + (back.x - hit.x) * (f - 1), y: hit.y + (back.y - hit.y) * (f - 1) };
      ball.visible = ballShine.visible = playing;
      ball.translate.set({ ...p, z: 4 });
      ballShine.translate.set({ x: p.x - 1.5, y: p.y - 1.5, z: 8 });
      trail.forEach((s, j) => {
        s.visible = playing;
        const q = f < 1 ? Math.max(0, f - (j + 1) * 0.06) : f - (j + 1) * 0.06;
        const pt = q < 1 ? { x: from.x + (hit.x - from.x) * q, y: from.y + (hit.y - from.y) * q } : { x: hit.x + (back.x - hit.x) * (q - 1), y: hit.y + (back.y - hit.y) * (q - 1) };
        s.translate.set({ ...pt, z: 2 });
      });
      // a raquete vai pra onde a bola vai cair
      const target = playing ? (f < 1 ? from.x : back.x) : 0;
      pad.translate.x += (target - pad.translate.x) * 0.12;
      // pedacinhos do tijolo quebrado
      const bk = f - 1;
      bits.forEach(({ s, a, v }) => {
        s.visible = playing && bk > 0 && bk < 0.7;
        s.color = COLORS[hr];
        s.translate.set({ x: hit.x + Math.cos(a) * bk * 30 * v, y: hit.y - 4 + Math.sin(a) * bk * 20 * v + bk * bk * 30, z: 6 });
        s.rotate.z = bk * 8 * v;
      });
      illo.rotate.x = -0.25;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // torre de blocos: o bloco de cima desliza de um lado pro outro, cai, a sobra é cortada e despenca girando;
  // depois de três, a torre desce pra dar espaço e recomeça
  torre(Z, illo) {
    // a torre inteira 30% maior (no tamanho original ela ficava pequena e baixa no card)
    const root = new Z.Anchor({ addTo: illo, scale: 1.3, translate: { y: -26 } });
    const H = 9, D = 30, W0 = 50, COLORS = ['#8b6cff', '#ff6b8a', '#ff8a5c', '#ffd34d', '#3ddc97', '#4dc3ff'];
    // Group: o visible esconde o bloco inteiro e as faces se ordenam entre si
    const block = (w, color) => { const g = new Z.Group({ addTo: root, updateSort: true }); slab(Z, g, w, H, D, color); return g; };
    const base = [0, 1, 2].map(i => block(W0, COLORS[i]));
    // cada queda: onde o bloco para (fora do centro do de baixo), o que fica e o que é cortado
    const OFFS = [10, -8, 3];
    let w = W0, cx = 0;
    const drops = OFFS.map((off, n) => {
      const x = cx + off, left = Math.max(x - w / 2, cx - w / 2), right = Math.min(x + w / 2, cx + w / 2);
      const keepW = right - left, keepX = (left + right) / 2, cutW = w - keepW, cutX = off > 0 ? right + cutW / 2 : left - cutW / 2;
      const d = { landX: x, keepX, cutX, dir: Math.sign(off), whole: block(w, COLORS[3 + n]), keep: block(keepW, COLORS[3 + n]), cut: block(Math.max(1, cutW), COLORS[3 + n]) };
      w = keepW; cx = keepX;
      return d;
    });
    const sparks = Array.from({ length: 6 }, (_, i) => ({ s: new Z.Shape({ addTo: root, stroke: 2.6, color: i % 2 ? '#ffffff' : '#ffd34d' }), a: (i / 6) * Math.PI + Math.PI }));
    return t => {
      const SEG = 1.5, T = SEG * 3 + 1.2, k = t % T, i = Math.floor(k / SEG), f = (k % SEG) / SEG, end = i >= 3;
      // a torre desce um andar a cada encaixe (a "câmera" sobe) e volta pro começo no fim
      const climbed = end ? 3 * (1 - smooth(Math.min(1, (k - SEG * 3) / 0.9))) : i + smooth(Math.max(0, (f - 0.6) / 0.4));
      const yOf = n => 34 - n * H + climbed * H;
      base.forEach((b, n) => b.translate.set({ y: yOf(n) }));
      drops.forEach((d, n) => {
        const y = yOf(3 + n), active = n === i, placed = n < i || (active && f >= 0.55);
        // desliza (0–0,4), cai (0,4–0,55): termina parado em landX
        d.whole.visible = active && f < 0.55;
        const hover = 1 - smooth(Math.min(1, Math.max(0, (f - 0.4) / 0.15)));
        d.whole.translate.set({ x: d.landX + 40 * Math.sin(Math.max(0, 0.4 - f) / 0.4 * Math.PI * 1.5), y: y - 16 * hover });
        d.keep.visible = placed && !end;
        d.keep.translate.set({ x: d.keepX, y });
        const ck = active ? (f - 0.55) / 0.45 : -1;
        d.cut.visible = ck > 0 && ck < 1;
        d.cut.translate.set({ x: d.cutX + d.dir * ck * 16, y: y + ck * ck * 70, z: ck * 8 });
        d.cut.rotate.z = d.dir * ck * 2.2;
      });
      // faísca no encaixe
      const sk = (f - 0.55) / 0.25, d = drops[Math.min(i, 2)];
      sparks.forEach(({ s, a }) => {
        s.visible = !end && sk > 0 && sk < 1;
        s.translate.set({ x: d.keepX + Math.cos(a) * (14 + sk * 14), y: yOf(3 + Math.min(i, 2)) + 4 + Math.sin(a) * sk * 6, z: 18 });
        s.stroke = 2.6 * (1 - sk) + 0.4;
      });
      illo.rotate.x = -0.4;
      illo.rotate.y = 0.6 + Math.sin(t * 0.45) * 0.3;
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
      const a = new Z.Group({ addTo: illo, translate: { x, y, z }, scale: s, updateSort: true }); // Group: num Anchor o visible não esconde os filhos
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
  // campo 4x4 de casas fechadas: elas abrem uma a uma (afundam e mostram o número colorido), a bandeirinha é
  // fincada na mina; campo limpo, as casas piscam verde
  minado(Z, illo) {
    const S = 21, pos = (c, r) => ({ x: (c - 1.5) * S, y: (r - 1.5) * S });
    const MINES = ['1,1', '3,2'];
    const count = (c, r) => [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dy => MINES.includes(`${c + dx},${r + dy}`) && (dx || dy))).filter(Boolean).length;
    const NUM = ['', '#4dc3ff', '#3ddc97', '#ff4d6a'];
    slab(Z, backdrop(Z, illo, 0), 4 * S + 10, 4 * S + 10, 8, '#2b2f45');
    const floor = backdrop(Z, illo, 1, { sort: false, translate: { z: 4.3 } });
    new Z.Rect({ addTo: floor, width: 4 * S + 6, height: 4 * S + 6, stroke: 2, fill: true, color: '#2b2f45' });
    const cells = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const mine = MINES.includes(`${c},${r}`), n = count(c, r);
      // casa aberta (no chão): fundo claro + número
      const open = new Z.Group({ addTo: floor, translate: pos(c, r) });
      new Z.Rect({ addTo: open, width: S - 2, height: S - 2, stroke: 1, fill: true, color: '#d7dbef' });
      if (!mine && n) glyph(Z, open, digitLines(n), { color: NUM[n], stroke: 2.6, scale: 0.7 });
      // casa fechada: bloco em relevo
      const g = new Z.Group({ addTo: illo, updateSort: true, translate: { ...pos(c, r), z: 4.3 } });
      const box = slab(Z, g, S - 2, S - 2, 6, '#6b74b8', { translate: { z: 3 } });
      const top = new Z.Group({ addTo: g, translate: { z: 6.3 } });
      const front = new Z.Rect({ addTo: top, width: S - 4, height: S - 4, stroke: 1.5, fill: true, color: '#6b74b8' });
      new Z.Shape({ addTo: top, path: [{ x: -S / 2 + 3, y: S / 2 - 4 }, { x: -S / 2 + 3, y: -S / 2 + 3 }, { x: S / 2 - 4, y: -S / 2 + 3 }], closed: false, stroke: 1.5, color: '#9aa2e0' });
      cells.push({ c, r, mine, n, g, box, front, open });
    }
    // bandeira: mastro + pano tremulando
    const flag = new Z.Group({ addTo: illo, updateSort: true });
    new Z.Shape({ addTo: flag, path: [{ y: 0 }, { y: -18 }], stroke: 2.2, color: '#e8eaf6' });
    new Z.Shape({ addTo: flag, stroke: 4, color: '#3b4166', translate: { y: 0.5 } });
    const cloth = new Z.Shape({ addTo: flag, path: [{ y: -18 }, { x: 13, y: -13.5 }, { y: -9 }], fill: true, stroke: 2, color: '#ff4d6a' });
    // ordem de abertura: as casas sem mina; a bandeira vai na primeira mina
    const ORDER = cells.filter(cl => !cl.mine).sort((a, b) => (a.c + a.r * 1.3) - (b.c + b.r * 1.3));
    const flagCell = cells.find(cl => cl.mine && cl.c === 3);
    let state = '';
    return t => {
      const STEP = 0.22, T = ORDER.length * STEP + 2.2, k = t % T, opened = Math.floor(k / STEP), done = opened >= ORDER.length;
      const win = done && k - ORDER.length * STEP > 0.6 && Math.floor((k - ORDER.length * STEP) * 5) % 2 === 0;
      if (state !== String(win)) { cells.filter(cl => cl.mine).forEach(cl => { const c = win ? '#3ddc97' : '#6b74b8'; paintBox(cl.box, c); cl.front.color = c; }); state = String(win); }
      ORDER.forEach((cl, i) => {
        const f = (k - i * STEP) / STEP;
        cl.g.visible = f < 1;
        cl.g.translate.z = 4.3 - Math.max(0, Math.min(1, f)) * 6;
        cl.g.scale = 1 - Math.max(0, Math.min(1, f)) * 0.3;
      });
      // a bandeira é fincada no meio da abertura
      const fk = (k - ORDER.length * STEP * 0.5) / 0.4, p = pos(flagCell.c, flagCell.r);
      flag.translate.set({ x: p.x - 2, y: p.y + 6, z: 10.3 + Math.max(0, 1 - fk) * 30 });
      flag.visible = fk > 0;
      cloth.path[1].y = -13.5 + Math.sin(t * 6) * 1.5; cloth.path[1].x = 13 + Math.sin(t * 6 + 1) * 1;
      cloth.updatePath();
      illo.rotate.x = -0.42;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // pista de 4 faixas inclinada (estilo Guitar Hero): as notas descem até a linha, o alvo da faixa acende,
  // sai faísca e o combo sobe
  ritmo(Z, illo) {
    const LANES = 4, LW = 23, LEN = 125, COLORS = ['#3ddc97', '#ff4d6a', '#ffd34d', '#4dc3ff'];
    const lx = i => (i - (LANES - 1) / 2) * LW;
    // pista deitada: tudo dentro de um Anchor girado (y da pista = profundidade)
    const road = new Z.Anchor({ addTo: illo, translate: { y: 14 }, rotate: { x: -0.78 } });
    const deck = backdrop(Z, road, 0, { sort: false });
    new Z.Rect({ addTo: deck, width: LANES * LW + 8, height: LEN, stroke: 2, fill: true, color: '#1d2140' });
    for (let i = 0; i <= LANES; i++) new Z.Shape({ addTo: deck, path: [{ x: lx(i) - LW / 2, y: -LEN / 2 }, { x: lx(i) - LW / 2, y: LEN / 2 }], stroke: 1.4, color: '#3b4166' });
    const beats = Array.from({ length: 6 }, () => new Z.Shape({ addTo: deck, path: [{ x: -LANES * LW / 2 }, { x: LANES * LW / 2 }], stroke: 0.8, color: '#2b3157' }));
    const HIT = LEN / 2 - 16;
    new Z.Shape({ addTo: deck, path: [{ x: -LANES * LW / 2 - 4, y: HIT }, { x: LANES * LW / 2 + 4, y: HIT }], stroke: 2, color: '#e8eaf6' });
    // alvos na linha: anel colorido que acende quando a nota chega
    const targets = COLORS.map((c, i) => {
      const g = new Z.Group({ addTo: road, translate: { x: lx(i), y: HIT, z: 0.5 } });
      new Z.Ellipse({ addTo: g, diameter: 17, stroke: 2.8, color: c });
      const fill = new Z.Ellipse({ addTo: g, diameter: 13, stroke: 1, fill: true, color: shade(c, 0.3) });
      return { g, fill };
    });
    // notas: pastilhas com volume em pé sobre a pista
    const SONG = [[0, 0], [1, 0.5], [2, 1], [3, 1.25], [1, 1.5], [0, 2], [2, 2.5], [3, 2.75], [1, 3], [2, 3.5]];
    const notes = SONG.map(([lane, at]) => {
      const g = new Z.Group({ addTo: road, updateSort: true });
      new Z.Cylinder({ addTo: g, diameter: 16, length: 5, stroke: false, color: shade(COLORS[lane], -0.3), frontFace: COLORS[lane], translate: { z: 2 } });
      new Z.Ellipse({ addTo: g, diameter: 6, stroke: 1.5, fill: true, color: '#ffffff', translate: { z: 4.2 } });
      return { g, lane, at };
    });
    const bursts = COLORS.map((c, i) => Array.from({ length: 5 }, (_, j) => ({ s: new Z.Shape({ addTo: road, stroke: 2.4, color: j % 2 ? '#ffffff' : c }), a: (j / 5) * Z.TAU })));
    // combo (em pé, acima da pista)
    const combo = new Z.Anchor({ addTo: illo, translate: { x: -4, y: -56, z: -20 } });
    const cx = [Array.from({ length: 10 }, (_, d) => glyph(Z, combo, digitLines(d).map(l => l.map(([x, y]) => [x + 6, y])), { color: '#ffd34d', stroke: 2.6, scale: 0.9 })),
      Array.from({ length: 10 }, (_, d) => glyph(Z, combo, digitLines(d).map(l => l.map(([x, y]) => [x + 18, y])), { color: '#ffd34d', stroke: 2.6, scale: 0.9 }))];
    glyph(Z, combo, LETTERS.X.map(l => l.map(([x, y]) => [x - 10, y + 2])), { color: '#ffd34d', stroke: 2.4, scale: 0.6 });
    return t => {
      const BEAT = 0.5, LOOP = 4, SPEED = 60, song = t / BEAT, now = song % LOOP;
      beats.forEach((b, i) => { b.translate.y = ((now * 30 + i * 20) % LEN) - LEN / 2; });
      // quanto falta (em batidas) pra cada nota chegar na linha; negativo = acabou de passar
      const until = n => { let d = n.at - now; if (d < -1) d += LOOP; return d; };
      notes.forEach(n => {
        const d = until(n);
        n.g.visible = d > -0.08 && d < 3.2;
        n.g.translate.set({ x: lx(n.lane), y: HIT - d * SPEED * BEAT });
      });
      targets.forEach((tg, i) => {
        const since = Math.min(...notes.filter(n => n.lane === i).map(n => -until(n)).filter(v => v >= 0), 9);
        tg.fill.visible = since < 0.35;
        tg.g.scale = since < 0.35 ? 1.2 : 1;
        const bk = since / 0.4;
        bursts[i].forEach(({ s, a }) => {
          s.visible = bk < 1;
          s.translate.set({ x: lx(i) + Math.cos(a) * (6 + bk * 12), y: HIT + Math.sin(a) * (6 + bk * 12), z: 4 + bk * 10 });
          s.stroke = 2.6 * (1 - bk) + 0.3;
        });
      });
      const n = 8 + (Math.floor(song / LOOP) * SONG.length + SONG.filter(([, at]) => at <= now).length) % 90;
      cx[0].forEach((g, d) => { g.visible = d === Math.floor(n / 10); });
      cx[1].forEach((g, d) => { g.visible = d === n % 10; });
      combo.scale = 1 + Math.max(0, 1 - (now % 0.5) / 0.15) * 0.08;
      illo.rotate.x = -0.1;
      illo.rotate.y = Math.sin(t * 0.45) * 0.25;
    };
  },
  // peças de madeira com letras embaralhadas: elas pulam e trocam de lugar até formar a palavra, ficam verdes
  // com um ✓ e embaralham de novo pra próxima palavra
  anagrama(Z, illo) {
    const WORDS = [['ROTA', 'TARO'], ['SALTO', 'LOTAS'], ['CASA', 'SACA']]; // [certa, embaralhada]
    const W = 19, xs = (n, i) => (i - (n - 1) / 2) * (W + 3);
    // suporte (régua de madeira) embaixo das peças
    const rack = backdrop(Z, illo, 0, { translate: { y: 22 } });
    slab(Z, rack, 118, 8, 22, '#8a5a32');
    const pool = {};
    const tile = ch => {
      const g = new Z.Group({ addTo: illo, updateSort: true });
      const box = slab(Z, g, W, W + 2, 6, '#f2d9a6');
      const face = new Z.Group({ addTo: g, translate: { z: 3.4 } });
      const front = new Z.Rect({ addTo: face, width: W - 2, height: W, stroke: 1.5, fill: true, color: '#f2d9a6' });
      glyph(Z, face, LETTERS[ch], { color: '#5a3a1a', stroke: 2.4, scale: 0.85, z: 0.4 });
      return { g, box, front };
    };
    // peças de cada rodada (cada palavra tem as suas)
    const rounds = WORDS.map(([word, mix]) => {
      const used = mix.split('').map(() => false);
      const tiles = [...word].map((ch, i) => {
        const from = mix.split('').findIndex((c, j) => c === ch && !used[j]);
        used[from] = true;
        return { ...tile(ch), from, to: i };
      });
      return { tiles, n: word.length };
    });
    const check = new Z.Shape({ addTo: illo, path: [{ x: -6, y: 0 }, { x: -2, y: 4.5 }, { x: 7, y: -6 }], closed: false, stroke: 4, color: '#3ddc97', translate: { y: -36, z: 6 } });
    let painted = '';
    return t => {
      const T = 3, r = Math.floor(t / T) % rounds.length, k = (t % T) / T, round = rounds[r];
      // 0–0,25: embaralhada; 0,25–0,6: cada peça pula até seu lugar (uma depois da outra); depois verde
      const solved = k > 0.6;
      if (painted !== r + ':' + solved) {
        round.tiles.forEach(tl => { const c = solved ? '#3ddc97' : '#f2d9a6'; paintBox(tl.box, c); tl.front.color = c; });
        painted = r + ':' + solved;
      }
      rounds.forEach((rd, j) => rd.tiles.forEach(tl => { tl.g.visible = j === r; }));
      round.tiles.forEach((tl, i) => {
        const start = 0.25 + i * 0.07, m = smooth(Math.min(1, Math.max(0, (k - start) / 0.18)));
        const x = xs(round.n, tl.from) + (xs(round.n, tl.to) - xs(round.n, tl.from)) * m;
        const hop = Math.sin(m * Math.PI) * (tl.from === tl.to ? 0 : 1);
        const enter = k < 0.08 ? smooth(k / 0.08) : k > 0.94 ? 1 - smooth((k - 0.94) / 0.06) : 1;
        const cheer = solved ? Math.max(0, Math.sin((k - 0.6) * 14 - i * 0.8)) * 4 : 0;
        tl.g.translate.set({ x, y: 6 - hop * 16 - cheer - (1 - enter) * 30, z: hop * 14 });
        tl.g.rotate.z = hop * 0.3 * Math.sign(tl.to - tl.from);
        tl.g.scale = Math.max(0.01, enter);
      });
      check.visible = solved && k < 0.94;
      check.scale = solved ? Math.min(1, (k - 0.6) * 8) : 1;
      illo.rotate.x = -0.25;
      illo.rotate.y = Math.sin(t * 0.45) * 0.4;
    };
  },
  // mesa de pong vista de cima, inclinada: a bola (com rastro) vai e volta entre as raquetes; de vez em quando
  // passa pela máquina, o placar sobe e pisca
  pong(Z, illo) {
    const W = 120, H = 80, PX = 52;
    slab(Z, backdrop(Z, illo, 0), W + 8, H + 8, 8, '#2b3157');
    const table = backdrop(Z, illo, 1, { sort: false, translate: { z: 4.3 } });
    new Z.Rect({ addTo: table, width: W + 4, height: H + 4, stroke: 2, fill: true, color: '#161a33' });
    new Z.Rect({ addTo: table, width: W, height: H, stroke: 1.4, color: '#3b4166' });
    for (let y = -H / 2 + 5; y < H / 2; y += 10) new Z.Shape({ addTo: table, path: [{ y }, { y: y + 5 }], stroke: 1.6, color: '#3b4166' });
    // placar: dois números no topo da mesa
    const score = [-1, 1].map(s => Array.from({ length: 10 }, (_, d) => glyph(Z, table, digitLines(d).map(l => l.map(([x, y]) => [x + s * 16 / 0.9, y - 26 / 0.9])), { color: '#3b4166', stroke: 2.6, scale: 0.9 })));
    const paddle = (x, color) => { const a = new Z.Anchor({ addTo: illo, translate: { x, z: 8 } }); slab(Z, a, 6, 22, 8, color); return a; };
    const me = paddle(-PX, '#e8eaf6'), cpu = paddle(PX, '#ff6b8a');
    const ball = new Z.Shape({ addTo: illo, stroke: 7, color: '#ffd34d' });
    const trail = [1, 2, 3, 4].map(i => new Z.Shape({ addTo: illo, stroke: 6 - i, color: `rgba(255,211,77,${0.5 - i * 0.1})` }));
    const ring = new Z.Ellipse({ addTo: illo, diameter: 10, stroke: 2, color: '#ffd34d' });
    // trajetória: rebate em cima/embaixo (reflete no y); a cada 4 travessias a bola passa pela máquina
    const reflect = y => { const m = ((y + H / 2 - 4) % (2 * (H - 8)) + 2 * (H - 8)) % (2 * (H - 8)); return (m < H - 8 ? m : 2 * (H - 8) - m) - H / 2 + 4; };
    const at = s => {
      const leg = Math.floor(s), f = s - leg, dir = leg % 2 ? -1 : 1, miss = leg % 4 === 2;
      const x0 = dir > 0 ? -PX + 5 : PX - 5, x1 = dir > 0 ? (miss ? PX + 20 : PX - 5) : -PX + 5;
      return { x: x0 + (x1 - x0) * f, y: reflect(leg * 37 + f * 55 * (miss ? 1.2 : 1)), miss, leg, f };
    };
    return t => {
      const s = t * 0.9, p = at(s);
      ball.translate.set({ x: p.x, y: p.y, z: 9 });
      ball.visible = !(p.miss && p.f > 0.95);
      trail.forEach((tr, i) => { const q = at(s - (i + 1) * 0.035); tr.translate.set({ x: q.x, y: q.y, z: 8 }); tr.visible = Math.floor(s - (i + 1) * 0.035) === p.leg; });
      // as raquetes seguem a bola (a máquina se atrasa quando vai errar)
      const toCpu = p.leg % 2 === 0;
      me.translate.y += ((toCpu ? 0 : p.y) - me.translate.y) * 0.12;
      cpu.translate.y += ((toCpu && !p.miss ? p.y : toCpu ? p.y + 26 : 0) - cpu.translate.y) * (p.miss ? 0.05 : 0.14);
      // batida: anel na raquete
      const hitF = p.f < 0.15 ? p.f / 0.15 : -1;
      ring.visible = hitF >= 0;
      ring.translate.set({ x: p.leg % 2 ? PX - 5 : -PX + 5, y: at(Math.floor(s)).y, z: 9 });
      ring.scale = 1 + hitF * 1.5;
      // placar: ponto pra cá a cada bola que passa pela máquina
      const pts = Math.floor((Math.floor(s) + 1) / 4) % 10, flash = p.leg % 4 === 3 && p.f < 0.4 && Math.floor(t * 8) % 2 === 0;
      score[0].forEach((g, d) => { g.visible = d === pts; g.children.forEach(c => { c.color = flash ? '#ffd34d' : '#5a6190'; }); });
      score[1].forEach((g, d) => { g.visible = d === 3; g.children.forEach(c => { c.color = '#5a6190'; }); });
      illo.rotate.x = -0.55;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // bola 8 grande na frente de dois tacos cruzados (o emblema da sinuca): a bola balança no lugar (o círculo
  // do 8 vai de um lado pro outro), os tacos balançam e de vez em quando dão uma tacadinha, com brilho na ponta
  sinuca(Z, illo) {
    const R = 32;
    // tacos: ponta azul, virola branca, madeira clara afinando, anel e cabo escuro; desenhados antes da bola
    const sticks = backdrop(Z, illo, 0, { sort: false, translate: { z: -24 } });
    const L = 150, Xs = p => -L / 2 + p * L; // p = 0 na ponta, 1 no cabo
    const cues = [-1, 1].map(side => {
      const a = new Z.Anchor({ addTo: sticks, rotate: { z: side * (Math.PI / 4) + Math.PI / 2 } });
      [[0, 0.025, '#3d6fd6', 4, 4], [0.025, 0.06, '#f3efe4', 4.2, 4.4], [0.06, 0.5, '#ecd29e', 4.4, 6.4], [0.5, 0.53, '#d3d7de', 6.5, 6.5],
        [0.53, 0.68, '#7a3416', 6.6, 7.2], [0.68, 0.72, '#e9d7a8', 7.2, 7.3], [0.72, 1, '#1e1c22', 7.3, 8.2]].forEach(([p0, p1, color, s0, s1]) => {
        const n = Math.max(1, Math.round((p1 - p0) * 12));
        for (let k = 0; k < n; k++) {
          const p = p0 + ((p1 - p0) * k) / n, q = p0 + ((p1 - p0) * (k + 1)) / n, w = s0 + (s1 - s0) * (k / n);
          new Z.Shape({ addTo: a, path: [{ x: Xs(p) }, { x: Xs(q) }], stroke: w, color: shade(color, -0.15) });
          new Z.Shape({ addTo: a, path: [{ x: Xs(p), y: -w * 0.22 }, { x: Xs(q), y: -w * 0.22 }], stroke: w * 0.38, color: shade(color, 0.3) });
        }
      });
      const tip = new Z.Shape({ addTo: a, stroke: 0, color: '#ffffff', translate: { x: Xs(0) - 3 } });
      return { a, side, tip };
    });
    // sombra macia embaixo da bola
    const shadow = backdrop(Z, illo, 1, { sort: false });
    new Z.Ellipse({ addTo: shadow, width: R * 2.1, height: R * 0.5, stroke: 0, fill: true, color: 'rgba(0,0,0,.18)', translate: { y: R + 12 } });
    // bola: camadas sempre redondas (pontos da Zdog), da sombra pro brilho, num Group que desenha em ordem
    const ball = new Z.Group({ addTo: illo, translate: { z: 10 } });
    new Z.Shape({ addTo: ball, stroke: R * 2, color: '#050507' });
    new Z.Shape({ addTo: ball, stroke: R * 1.86, color: '#16161c', translate: { x: -R * 0.06, y: -R * 0.07 } });
    new Z.Shape({ addTo: ball, stroke: R * 1.5, color: '#24242d', translate: { x: -R * 0.17, y: -R * 0.2 } });
    new Z.Shape({ addTo: ball, stroke: R * 0.9, color: '#30303b', translate: { x: -R * 0.3, y: -R * 0.36 } });
    // círculo branco com o 8
    const disc = new Z.Group({ addTo: ball });
    new Z.Ellipse({ addTo: disc, diameter: R * 0.98, stroke: 0, fill: true, color: '#d9d4c6' });
    new Z.Ellipse({ addTo: disc, diameter: R * 0.9, stroke: 0, fill: true, color: '#fbf7ea', translate: { x: -0.6, y: -0.6 } });
    new Z.Ellipse({ addTo: disc, diameter: 8.4, stroke: 2.8, color: '#141414', translate: { y: -5 } });
    new Z.Ellipse({ addTo: disc, diameter: 10, stroke: 2.8, color: '#141414', translate: { y: 4.4 } });
    // reflexo da luminária e borda de luz embaixo
    new Z.Shape({ addTo: ball, stroke: R * 0.8, color: 'rgba(255,255,255,.12)', translate: { x: -R * 0.38, y: -R * 0.44 } });
    new Z.Shape({ addTo: ball, stroke: R * 0.34, color: 'rgba(255,255,255,.9)', translate: { x: -R * 0.44, y: -R * 0.52 } });
    new Z.Shape({ addTo: ball, path: [{ x: R * 0.2, y: R * 0.8 }, { arc: [{ x: R * 0.8, y: R * 0.8 }, { x: R * 0.82, y: R * 0.15 }] }], closed: false, stroke: 2, color: 'rgba(255,255,255,.2)' });
    const sparks = Array.from({ length: 8 }, (_, i) => ({ s: new Z.Shape({ addTo: illo, stroke: 2.4, color: i % 2 ? '#ffffff' : '#ffe68a' }), a: (i / 8) * Z.TAU }));
    return t => {
      // a bola gira no lugar: o círculo do 8 dá a volta pela frente e some por trás
      const roll = Math.sin(t * 0.8) * 0.9, c = Math.cos(roll);
      disc.visible = c > 0.1;
      disc.translate.set({ x: Math.sin(roll) * R * 0.55 - R * 0.06, y: Math.sin(roll * 0.5) * R * 0.18 - R * 0.06 });
      disc.scale = { x: 0.3 + 0.7 * c, y: 1, z: 1 };
      ball.translate.y = Math.sin(t * 1.6) * 2.5;
      // tacadinha: a cada 2,6s um taco recua e avança (alternando os dois); brilho na ponta no fim
      const k = t % 5.2, who = k < 2.6 ? 0 : 1, f = (k % 2.6) / 2.6;
      cues.forEach((cu, i) => {
        const mine = i === who, push = mine ? (f < 0.35 ? -smooth(f / 0.35) * 10 : f < 0.45 ? -10 + smooth((f - 0.35) / 0.1) * 16 : 6 * (1 - smooth(Math.min(1, (f - 0.45) / 0.4)))) : 0;
        cu.a.translate.set({ x: Math.cos(cu.a.rotate.z) * push, y: Math.sin(cu.a.rotate.z) * push });
        cu.a.rotate.z = cu.side * (Math.PI / 4) + Math.PI / 2 + Math.sin(t * 0.8 + i) * 0.04;
      });
      const sk = (f - 0.42) / 0.4, cu = cues[who], tipAt = { x: cu.a.translate.x + Math.cos(cu.a.rotate.z) * (Xs(0) - 3), y: cu.a.translate.y + Math.sin(cu.a.rotate.z) * (Xs(0) - 3) };
      sparks.forEach(({ s, a }) => {
        s.visible = sk > 0 && sk < 1;
        s.translate.set({ x: tipAt.x + Math.cos(a) * (4 + sk * 14), y: tipAt.y + Math.sin(a) * (4 + sk * 14), z: -20 });
        s.stroke = 2.6 * (1 - sk) + 0.3;
      });
      illo.rotate.x = -0.1;
      illo.rotate.y = Math.sin(t * 0.45) * 0.25;
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
  // grade azul do Ligue 4: as fichas caem pelas colunas quicando, até quatro vermelhas em linha; elas brilham,
  // uma faixa passa por cima e as fichas caem pra fora pra recomeçar
  ligue4(Z, illo) {
    const COLS = 5, ROWS = 4, S = 19, cx = c => (c - (COLS - 1) / 2) * S, cy = r => (ROWS - 1 - r) * S - (ROWS - 1) * S / 2 + 8;
    const board = backdrop(Z, illo, 0);
    slab(Z, board, COLS * S + 10, ROWS * S + 10, 10, '#3454d1', { translate: { y: 8 } });
    const front = backdrop(Z, illo, 1, { sort: false, translate: { z: 5.3 } });
    new Z.Rect({ addTo: front, width: COLS * S + 6, height: ROWS * S + 6, stroke: 2, fill: true, color: '#3454d1', translate: { y: 8 } });
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      new Z.Ellipse({ addTo: front, diameter: S - 5, stroke: 1.5, fill: true, color: '#141a3d', translate: { x: cx(c), y: cy(r) } });
      new Z.Ellipse({ addTo: front, diameter: S - 4, stroke: 1.2, color: '#5b7bff', translate: { x: cx(c), y: cy(r) } });
    }
    // pés da grade
    for (const s of [-1, 1]) slab(Z, backdrop(Z, illo, 0), 8, 10, 22, '#2a43b0', { translate: { x: s * (COLS * S / 2 + 2), y: ROWS * S / 2 + 14 } });
    // jogadas: [coluna, cor]; vermelho ganha na diagonal
    const MOVES = [[1, 0], [2, 1], [2, 0], [3, 1], [3, 0], [4, 1], [3, 0], [4, 1], [4, 0], [0, 1], [4, 0]];
    const RED = '#ff4d6a', YEL = '#ffd34d';
    const height = Array(COLS).fill(0);
    const chips = MOVES.map(([c, p]) => {
      const r = height[c]++;
      const g = new Z.Group({ addTo: illo, translate: { x: cx(c), z: 7 } });
      const color = p ? YEL : RED;
      new Z.Ellipse({ addTo: g, diameter: S - 5, stroke: 2, fill: true, color: shade(color, -0.3), translate: { z: -1.5 } });
      new Z.Ellipse({ addTo: g, diameter: S - 5, stroke: 2, fill: true, color });
      new Z.Ellipse({ addTo: g, diameter: S - 11, stroke: 1.6, color: shade(color, -0.2) });
      new Z.Shape({ addTo: g, path: [{ x: -4, y: -3 }, { x: -2, y: -5 }], stroke: 1.6, color: 'rgba(255,255,255,0.7)' });
      return { g, c, r, p };
    });
    // diagonal vencedora: (1,0) (2,1) (3,2) (4,3)
    const WIN = [[1, 0], [2, 1], [3, 2], [4, 3]];
    const isWin = ch => !ch.p && WIN.some(([c, r]) => c === ch.c && r === ch.r);
    const band = new Z.Shape({ addTo: illo, path: [{ x: cx(1), y: cy(0) }, { x: cx(4), y: cy(3) }], stroke: 4, color: 'rgba(255,255,255,0.85)' });
    return t => {
      const STEP = 0.42, n = MOVES.length, T = n * STEP + 2, k = t % T;
      chips.forEach((ch, i) => {
        const f = (k - i * STEP) / STEP;
        ch.g.visible = f > 0;
        // cai da boca de cima até a casa e quica uma vez
        const y0 = cy(ROWS - 1) - 26, y1 = cy(ch.r), fall = Math.min(1, Math.max(0, f / 0.6));
        let y = y0 + (y1 - y0) * fall * fall;
        if (f > 0.6 && f < 1) y -= Math.sin((f - 0.6) / 0.4 * Math.PI) * 4;
        // fim: tudo despenca pra fora da grade
        const out = k > n * STEP + 1.4 ? (k - n * STEP - 1.4) / 0.6 : 0;
        ch.g.translate.y = y + out * out * 120;
        const glow = k > n * STEP && isWin(ch) && out === 0;
        ch.g.scale = glow ? 1 + Math.max(0, Math.sin((k - n * STEP) * 10)) * 0.15 : 1;
      });
      const bk = (k - n * STEP - 0.2) / 0.4;
      band.visible = bk > 0 && k < n * STEP + 1.4;
      band.path[1] = { x: cx(1) + (cx(4) - cx(1)) * Math.min(1, bk), y: cy(0) + (cy(3) - cy(0)) * Math.min(1, bk) };
      band.updatePath();
      band.translate.z = 10;
      illo.rotate.x = -0.2;
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
  // tabuleiro do Termo: três tentativas viram uma a uma (cinza, amarelo e verde de acordo com TERMO);
  // a última acerta tudo e as letras pulam
  termo(Z, illo) {
    const ANSWER = 'TERMO', GUESSES = ['SALTO', 'CORTE', 'TERMO'], S = 21;
    const C = { g: '#4a4f6e', y: '#e8b923', v: '#2fbf80' };
    // cor de cada letra igual ao jogo: verde no lugar, amarelo se existe em outro lugar (contando repetidas)
    const score = w => {
      const res = [...w].map((ch, i) => (ch === ANSWER[i] ? 'v' : null)), left = [...ANSWER].filter((ch, i) => w[i] !== ch);
      return res.map((r, i) => { if (r) return r; const j = left.indexOf(w[i]); if (j >= 0) { left.splice(j, 1); return 'y'; } return 'g'; });
    };
    const rows = GUESSES.map((w, r) => {
      const cols = score(w);
      return [...w].map((ch, i) => {
        // a peça gira em x: a frente (vazia, borda) vira e mostra a cor atrás
        const a = new Z.Anchor({ addTo: illo, translate: { x: (i - 2) * (S + 3), y: (r - 1) * (S + 4) } });
        const g = new Z.Group({ addTo: a, updateSort: true });
        const box = slab(Z, g, S, S, 5, '#20243a');
        const face = new Z.Group({ addTo: g, translate: { z: 2.9 } });
        const front = new Z.Rect({ addTo: face, width: S - 2, height: S - 2, stroke: 2, fill: true, color: '#20243a' });
        const border = new Z.Rect({ addTo: face, width: S - 3, height: S - 3, stroke: 1.4, color: '#4a4f6e' });
        glyph(Z, face, LETTERS[ch], { color: '#ffffff', stroke: 2.4, scale: 0.8, z: 0.3 });
        return { a, g, box, front, border, color: C[cols[i]], r, i };
      });
    });
    let state = '';
    return t => {
      const FLIP = 0.22, ROW = 5 * FLIP + 0.5, T = 3 * ROW + 1.6, k = t % T;
      rows.flat().forEach(tl => {
        // cada letra vira em sequência; no meio do giro troca a cor (a frente "vira" a cor)
        const f = (k - tl.r * ROW - tl.i * FLIP) / (FLIP * 1.6);
        const turned = f >= 0.5;
        tl.a.rotate.x = f > 0 && f < 1 ? Math.sin(f * Math.PI) * Math.PI / 2 * (f < 0.5 ? 1 : -1) : 0;
        tl.g.visible = k > tl.r * ROW - 0.2 || tl.r === 0;
        const c = turned ? tl.color : '#20243a';
        if (tl.front.color !== c) { tl.front.color = c; paintBox(tl.box, c); tl.border.visible = !turned; }
        // acertou: as letras da última linha pulam em onda
        const win = tl.r === 2 && k > 3 * ROW;
        tl.a.translate.z = win ? Math.max(0, Math.sin((k - 3 * ROW) * 8 - tl.i * 0.7)) * 9 : 0;
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.35;
    };
  },
  // Dueto: dois quadros do Termo abertos como um livro; o mesmo palpite vira nos dois, cada um acerta numa linha
  dueto(Z, illo) {
    const GUESSES = ['SALTO', 'DUETO', 'MOTOR'], ANSWERS = ['DUETO', 'MOTOR'], S = 12, STEP = S + 1.8;
    const boards = ANSWERS.map((ans, b) => {
      const side = b ? 1 : -1;
      const book = new Z.Anchor({ addTo: illo, translate: { x: side * 37, y: 0 }, rotate: { y: -side * 0.32 } });
      const last = GUESSES.indexOf(ans);
      const rows = GUESSES.slice(0, last + 1).map((w, r) => {
        const cols = termoColors(w, ans);
        return [...w].map((ch, i) => ({ ...letterTile(Z, book, ch, S, { x: (i - 2) * STEP, y: (r - 1) * (STEP + 1) }), color: TERMO_C[cols[i]], r, i }));
      });
      return { rows, last };
    });
    return t => {
      const FLIP = 0.2, ROW = 5 * FLIP + 0.55, T = 3 * ROW + 1.8, k = t % T;
      boards.forEach(bd => bd.rows.flat().forEach(tl => {
        const f = (k - tl.r * ROW - tl.i * FLIP) / (FLIP * 1.6);
        tl.a.rotate.x = f > 0 && f < 1 ? Math.sin(f * Math.PI) * Math.PI / 2 * (f < 0.5 ? 1 : -1) : 0;
        tl.paint(f >= 0.5 ? tl.color : TILE_OFF);
        tl.g.visible = k > tl.r * ROW - 0.25 || tl.r === 0;
        const won = tl.r === bd.last && k > (bd.last + 1) * ROW;
        tl.a.translate.z = won ? Math.max(0, Math.sin((k - (bd.last + 1) * ROW) * 8 - tl.i * 0.7)) * 7 : 0;
      }));
      illo.rotate.x = -0.28;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // Quarteto: 4 quadros em 2x2; o 1º palpite vira em todos e depois cada quadro acerta a sua palavra, um por vez
  quarteto(Z, illo) {
    const FIRST = 'SALTO', ANSWERS = ['MOTOR', 'DUETO', 'BARCO', 'LEVAR'], S = 10, STEP = S + 1.4;
    const boards = ANSWERS.map((ans, b) => {
      const at = new Z.Anchor({ addTo: illo, translate: { x: (b % 2 ? 1 : -1) * 32, y: (b < 2 ? -1 : 1) * 17 } });
      const rows = [FIRST, ans].map((w, r) => {
        const cols = termoColors(w, ans);
        return [...w].map((ch, i) => ({ ...letterTile(Z, at, ch, S, { x: (i - 2) * STEP, y: (r - 0.5) * (STEP + 0.6) }), color: TERMO_C[cols[i]], r, i }));
      });
      return { at, rows };
    });
    return t => {
      const FLIP = 0.12, ROW = 5 * FLIP + 0.35, T = ROW * 5 + 1.8, k = t % T;
      boards.forEach((bd, b) => {
        // linha 0 vira em todos juntos; a linha 1 (a resposta) de cada quadro vira na vez dele
        const start = r => (r === 0 ? 0 : ROW * (1 + b));
        bd.rows.flat().forEach(tl => {
          const f = (k - start(tl.r) - tl.i * FLIP) / (FLIP * 1.8);
          tl.a.rotate.x = f > 0 && f < 1 ? Math.sin(f * Math.PI) * Math.PI / 2 * (f < 0.5 ? 1 : -1) : 0;
          tl.paint(f >= 0.5 ? tl.color : TILE_OFF);
          tl.g.visible = tl.r === 0 || k > start(1) - 0.2;
        });
        const won = k - start(1) - 5 * FLIP;
        bd.at.translate.z = won > 0 && won < 0.7 ? Math.sin(won / 0.7 * Math.PI) * 9 : 0;
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.32;
    };
  },
  // Contexto: palpites entram na lista na posição certa (barra maior = mais perto); o último é o nº 1 e brilha.
  // Uma lupa passeia por cima
  contexto(Z, illo) {
    const RANKS = [842, 97, 2140, 13, 1], N = 13642, W = 92, H = 13, ROWGAP = 16;
    const tone = r => (r === 1 ? '#3ddc97' : r <= 300 ? '#2fbf80' : r <= 1500 ? '#e8b923' : '#ff6b8a');
    const rows = RANKS.map((r, k) => {
      const a = new Z.Anchor({ addTo: illo });
      // placa larga: desenhada em ordem (placa e depois a frente); ordenando, as laterais cobriam a frente quando a cena gira
      const g = new Z.Group({ addTo: a });
      slab(Z, g, W, H, 4, '#262a40');
      const face = new Z.Group({ addTo: g, translate: { z: 2.4 } });
      new Z.Rect({ addTo: face, width: W - 2, height: H - 2, stroke: 1.4, fill: true, color: '#262a40' });
      const len = Math.max(0.12, 1 - Math.log(r) / Math.log(N)) * (W - 24);
      new Z.Rect({ addTo: face, width: len, height: H - 4, stroke: 1.4, fill: true, color: tone(r), translate: { x: -(W - 2) / 2 + 2 + len / 2, z: 0.2 } });
      // "palavra" (traço claro) e a posição em display
      new Z.Shape({ addTo: face, path: [{ x: -W / 2 + 6, y: 0 }, { x: -W / 2 + 6 + 10 + (k % 3) * 4, y: 0 }], stroke: 2, color: '#ffffff', translate: { z: 0.5 } });
      numberGlyph(Z, face, r, { color: '#ffffff', scale: 0.36, stroke: 1.3, gap: 12, z: 0.5 }).translate.x = W / 2 - 11;
      return { a, g, r, k, y: 0 };
    });
    // lupa: aro com espessura (3 anéis) e cabo
    const lens = new Z.Anchor({ addTo: illo, translate: { x: 30, y: -40, z: 18 } });
    [['#8b6cff', -1.2], ['#a98bff', 0], ['#cdb9ff', 1.2]].forEach(([color, z]) => new Z.Ellipse({ addTo: lens, diameter: 22, stroke: 3.4, color, translate: { z } }));
    new Z.Ellipse({ addTo: lens, diameter: 19, stroke: 0, fill: true, color: 'rgba(200,220,255,0.18)' });
    new Z.Shape({ addTo: lens, path: [{ x: 8, y: 8 }, { x: 17, y: 17 }], stroke: 5, color: '#5a3fd0' });
    const sparks = Array.from({ length: 6 }, (_, i) => ({ s: new Z.Shape({ addTo: illo, stroke: 2.6, color: PALETTE[i % PALETTE.length] }), ang: (i / 6) * Z.TAU }));
    return t => {
      const STEP = 0.9, T = RANKS.length * STEP + 2.2, k = t % T, shown = Math.min(RANKS.length, Math.floor(k / STEP) + 1);
      const list = rows.slice(0, shown).sort((a, b) => a.r - b.r);
      rows.forEach(row => {
        const pos = list.indexOf(row), on = pos >= 0;
        const target = on ? (pos - 2) * ROWGAP + 8 : -60;
        row.y += (target - row.y) * 0.25;
        const age = (k - row.k * STEP) / 0.35;
        row.a.translate.set({ y: row.y, z: on && age < 1 ? (1 - smooth(Math.max(0, age))) * 24 : 0 });
        row.a.scale = on ? 0.6 + 0.4 * smooth(Math.min(1, Math.max(0, age))) : 1;
        row.g.visible = on;
      });
      const won = k - (RANKS.length - 1) * STEP - 0.35;
      const top = rows[RANKS.length - 1];
      top.a.translate.z += won > 0 ? Math.max(0, Math.sin(won * 5)) * 5 : 0;
      sparks.forEach(({ s, ang }) => {
        const b = Math.min(1, Math.max(0, won) * 1.4);
        s.visible = won > 0 && b < 1;
        s.translate.set({ x: Math.cos(ang) * (20 + b * 30), y: top.y + Math.sin(ang) * (6 + b * 14), z: 10 });
      });
      lens.translate.x = 30 + Math.sin(t * 1.1) * 8;
      lens.translate.y = -42 + Math.cos(t * 1.4) * 4;
      lens.rotate.z = Math.sin(t * 1.1) * 0.25;
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // Conexões: 16 peças embaralhadas; a cada passo, 4 sobem e trocam de lugar até formar a faixa do grupo, na cor
  // da dificuldade (amarelo, verde, azul, roxo). As peças que estavam no caminho vão pro lugar de onde elas saíram.
  conexoes(Z, illo) {
    const S = 15, GAP = 3.2, COLORS = ['#f2c94c', '#3ddc97', '#4dc3ff', '#b78bff'], OFF = '#3a3f5c';
    const cell = c => ({ x: ((c % 4) - 1.5) * (S + GAP), y: (Math.floor(c / 4) - 1.5) * (S + GAP) });
    // posição de cada peça (peça i é do grupo floor(i/4)) antes de cada passo
    const START = [5, 14, 2, 11, 0, 9, 7, 12, 3, 13, 6, 1, 10, 4, 15, 8];
    const steps = [START.slice()];
    for (let g = 0; g < 4; g++) {
      const pos = steps[g].slice();
      for (let j = 0; j < 4; j++) {
        const piece = g * 4 + j, want = g * 4 + j, other = pos.indexOf(want);
        [pos[piece], pos[other]] = [pos[other], pos[piece]];
      }
      steps.push(pos);
    }
    const tiles = Array.from({ length: 16 }, (_, i) => {
      const a = new Z.Anchor({ addTo: illo });
      const g = new Z.Group({ addTo: a, updateSort: true });
      const box = slab(Z, g, S, S, 5, OFF);
      const face = new Z.Group({ addTo: g, translate: { z: 2.9 } });
      const front = new Z.Rect({ addTo: face, width: S - 2, height: S - 2, stroke: 1.6, fill: true, color: OFF });
      // "palavra": dois tracinhos claros
      new Z.Shape({ addTo: face, path: [{ x: -4, y: -1.5 }, { x: 4, y: -1.5 }], stroke: 1.8, color: '#e9ebf8', translate: { z: 0.3 } });
      new Z.Shape({ addTo: face, path: [{ x: -4, y: 2.5 }, { x: 1 + (i % 3), y: 2.5 }], stroke: 1.8, color: '#e9ebf8', translate: { z: 0.3 } });
      return { a, box, front, g: Math.floor(i / 4), color: OFF };
    });
    const paint = (tl, c) => { if (tl.color !== c) { tl.color = c; tl.front.color = c; paintBox(tl.box, c); } };
    return t => {
      const STEP = 1.05, T = 4 * STEP + 2, k = t % T, s = Math.min(4, Math.floor(k / STEP)), f = s < 4 ? (k % STEP) / STEP : 1;
      tiles.forEach((tl, i) => {
        const from = cell(steps[s][i]), to = cell(steps[Math.min(4, s + 1)][i]);
        const moving = s < 4 && from.x !== to.x || from.y !== to.y;
        const m = s < 4 ? smooth(Math.min(1, Math.max(0, (f - 0.25) / 0.55))) : 1;
        const lift = s < 4 && tl.g === s ? Math.sin(Math.min(1, f / 0.85) * Math.PI) * 10 : 0;
        tl.a.translate.set({ x: from.x + (to.x - from.x) * m, y: from.y + (to.y - from.y) * m, z: lift + (moving ? Math.sin(m * Math.PI) * 4 : 0) });
        const solved = tl.g < s || (tl.g === s && f > 0.8);
        paint(tl, solved ? COLORS[tl.g] : s < 4 && tl.g === s && f < 0.8 ? '#8b6cff' : OFF);
      });
      // fim: as faixas pulam em onda e tudo some pra recomeçar
      const end = k - 4 * STEP;
      if (end > 0) tiles.forEach((tl, i) => { tl.a.translate.z = Math.max(0, Math.sin(end * 6 - (i % 4) * 0.5 - tl.g * 0.3)) * (end < 1.2 ? 6 : 0); });
      illo.rotate.x = -0.32;
      illo.rotate.y = Math.sin(t * 0.45) * 0.32;
    };
  },
  // Alvo: o número do dia no visor; duas contas juntam as peças (75 × 4 = 300, 300 + 50 = 350) e acerta em cheio
  alvo(Z, illo) {
    const TARGET = 350, NUMS = [2, 4, 9, 50, 75, 1];
    const disp = new Z.Anchor({ addTo: illo, translate: { y: -38 } });
    const dispG = new Z.Group({ addTo: disp }); // em ordem: a placa e depois o visor (ordenando, a lateral cobria o visor)
    slab(Z, dispG, 62, 26, 6, '#161a2b');
    const lcd = new Z.Group({ addTo: dispG, translate: { z: 3.4 } });
    new Z.Rect({ addTo: lcd, width: 60, height: 24, stroke: 1.5, fill: true, color: '#161a2b' });
    const ring = new Z.Ellipse({ addTo: lcd, diameter: 18, stroke: 1.6, color: '#ff8a5c', translate: { x: -21, z: 0.3 } });
    new Z.Shape({ addTo: lcd, stroke: 3.2, color: '#ff8a5c', translate: { x: -21, z: 0.4 } });
    const targetOff = numberGlyph(Z, lcd, TARGET, { color: '#ffb347', scale: 0.62, stroke: 2.2, gap: 12, z: 0.4 });
    const targetOn = numberGlyph(Z, lcd, TARGET, { color: '#3ddc97', scale: 0.62, stroke: 2.4, gap: 12, z: 0.4 });
    targetOff.translate.x = targetOn.translate.x = 7;
    // peça com número: uma versão por valor (o valor muda quando as peças se juntam)
    const W = v => 9 + String(v).length * 6.5;
    const piece = (vals, slot, color = '#2b2f45') => {
      const a = new Z.Anchor({ addTo: illo });
      const forms = Object.fromEntries(vals.map(v => {
        const g = new Z.Group({ addTo: a });
        const c = v === TARGET ? '#3ddc97' : v > 100 ? '#5a4fcf' : color;
        slab(Z, g, W(v), 15, 5, c);
        const face = new Z.Group({ addTo: g, translate: { z: 2.9 } });
        new Z.Rect({ addTo: face, width: W(v) - 2, height: 13, stroke: 1.5, fill: true, color: c });
        numberGlyph(Z, face, v, { color: v === TARGET ? '#10131c' : '#ffffff', scale: 0.48, stroke: 1.8, gap: 13, z: 0.3 });
        return [v, g];
      }));
      return { a, forms, slot, val: vals[0], show(v) { for (const [k, g] of Object.entries(forms)) g.visible = +k === v; } };
    };
    const SLOT = i => ({ x: ((i % 3) - 1) * 27, y: 4 + Math.floor(i / 3) * 21 });
    const pcs = NUMS.map((v, i) => piece(v === 75 ? [75, 300, 350] : [v], i));
    // sinal da conta, entre as duas peças
    const SIGNS = { x: [[[-3.2, -3.2], [3.2, 3.2]], [[3.2, -3.2], [-3.2, 3.2]]], '+': [[[-4, 0], [4, 0]], [[0, -4], [0, 4]]] };
    const signs = Object.fromEntries(Object.entries(SIGNS).map(([k, l]) => [k, glyph(Z, illo, l, { color: '#ffd34d', stroke: 2.6, scale: 0.9 })]));
    const sparks = Array.from({ length: 8 }, (_, i) => ({ s: new Z.Shape({ addTo: illo, stroke: 3, color: PALETTE[i % PALETTE.length] }), ang: (i / 8) * Z.TAU }));
    // contas: [peça que fica, peça que entra, sinal, resultado]
    const OPS = [[4, 1, 'x', 300], [4, 3, '+', 350]];
    return t => {
      const STEP = 1.3, T = OPS.length * STEP + 2.2, k = t % T, s = Math.floor(k / STEP), f = (k % STEP) / STEP;
      let value75 = 75;
      const gone = new Set();
      OPS.forEach(([keep, take, , res], i) => { if (i < s) { value75 = res; gone.add(take); } });
      pcs.forEach((p, i) => {
        const home = SLOT(p.slot);
        let x = home.x, y = home.y, z = 0, on = true;
        const op = s < OPS.length ? OPS[s] : null;
        if (gone.has(i)) on = false;
        if (op && (i === op[0] || i === op[1])) {
          // as duas sobem, vão pro meio e viram uma só
          const up = smooth(Math.min(1, f / 0.35)), join = smooth(Math.min(1, Math.max(0, (f - 0.35) / 0.35)));
          const mid = { x: (SLOT(pcs[op[0]].slot).x + SLOT(pcs[op[1]].slot).x) / 2, y: (SLOT(pcs[op[0]].slot).y + SLOT(pcs[op[1]].slot).y) / 2 };
          const end = i === op[0] ? home : mid;
          const tx = mid.x + (i === op[0] ? -8 : 8) * (1 - join), ty = mid.y - 10;
          if (f < 0.7) { x += (tx - x) * up; y += (ty - y) * up; z = up * 10; }
          else { const back = smooth((f - 0.7) / 0.3); x = mid.x + (end.x - mid.x) * back; y = ty + (end.y - ty) * back; z = 10 * (1 - back); }
          if (i === op[1] && f >= 0.7) on = false;
          if (i === op[0] && f >= 0.7) value75 = op[3];
        }
        p.a.translate.set({ x, y, z });
        p.show(on ? (i === 4 ? value75 : p.val) : null);
      });
      const op = s < OPS.length ? OPS[s] : null;
      Object.entries(signs).forEach(([k2, g]) => {
        g.visible = !!op && op[2] === k2 && f > 0.2 && f < 0.72;
        if (g.visible) { const a = SLOT(pcs[op[0]].slot), b = SLOT(pcs[op[1]].slot); g.translate.set({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 10, z: 14 }); }
      });
      const hit = s >= OPS.length;
      targetOff.visible = !hit; targetOn.visible = hit;
      ring.color = hit ? '#3ddc97' : '#ff8a5c';
      const w = hit ? k - OPS.length * STEP : -1;
      disp.translate.z = w > 0 ? Math.max(0, Math.sin(w * 6)) * 5 : 0;
      sparks.forEach(({ s: sp, ang }) => {
        const b = Math.min(1, Math.max(0, w) * 1.3);
        sp.visible = w > 0 && b < 1;
        sp.translate.set({ x: Math.cos(ang) * (16 + b * 34), y: -38 + Math.sin(ang) * (8 + b * 18), z: 10 });
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.32;
    };
  },
  // Octeto: 8 quadrinhos (2×4); cada um vira a sua palavra em verde, um depois do outro, e no fim pulam em onda
  octeto(Z, illo) {
    const WORDS = ['MOTOR', 'DUETO', 'BARCO', 'LEVAR', 'SALTO', 'METRO', 'CARTA', 'VALOR'], S = 8.4, STEP = S + 1.1;
    const boards = WORDS.map((w, b) => {
      const at = new Z.Anchor({ addTo: illo, translate: { x: (b % 2 ? 1 : -1) * 28, y: (Math.floor(b / 2) - 1.5) * 17 } });
      const bg = backdrop(Z, at, 0, { sort: false });
      new Z.Rect({ addTo: bg, width: 5 * STEP + 3, height: S + 6, stroke: 2, fill: true, color: '#1b1f33', translate: { z: -2 } });
      const tiles = [...w].map((ch, i) => ({ ...letterTile(Z, at, ch, S, { x: (i - 2) * STEP }, { stroke: 1.2 }), i }));
      return { at, tiles, bg };
    });
    return t => {
      const FLIP = 0.07, BOARD = 0.42, T = 8 * BOARD + 5 * FLIP + 2, k = t % T;
      boards.forEach((bd, b) => {
        const start = b * BOARD;
        bd.tiles.forEach(tl => {
          const f = (k - start - tl.i * FLIP) / (FLIP * 2.4);
          tl.a.rotate.x = f > 0 && f < 1 ? Math.sin(f * Math.PI) * Math.PI / 2 * (f < 0.5 ? 1 : -1) : 0;
          tl.paint(f >= 0.5 ? TERMO_C.v : TILE_OFF);
        });
        const end = k - 8 * BOARD - 5 * FLIP;
        bd.at.translate.z = end > 0 ? Math.max(0, Math.sin(end * 6 - b * 0.55)) * (end < 1.6 ? 7 : 0) : 0;
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // Soletra: colmeia de 7 hexágonos; cada letra de SOLETRA acende na colmeia e sobe pra palavra lá em cima.
  // Usou as 7 letras: a palavra fica dourada e solta faíscas
  soletra(Z, illo) {
    const WORD = 'SOLETRA', CENTER = 'E', OUTER = ['S', 'O', 'L', 'T', 'R', 'A'], R = 13.5;
    const POS = [[0, 0], ...OUTER.map((_, i) => { const a = -Math.PI / 2 + (i * Z.TAU) / 6; return [Math.cos(a) * R * 1.78, Math.sin(a) * R * 1.78]; })];
    const hive = new Z.Anchor({ addTo: illo, translate: { y: 14 } });
    const cells = [CENTER, ...OUTER].map((ch, k) => {
      const a = new Z.Anchor({ addTo: hive, translate: { x: POS[k][0], y: POS[k][1] } });
      const g = new Z.Group({ addTo: a });
      const base = k === 0 ? '#e8b923' : '#3a3f5c';
      const back = new Z.Polygon({ addTo: g, sides: 6, radius: R, stroke: 2.5, fill: true, color: shade(base, -0.4), translate: { z: -3 }, rotate: { z: Math.PI / 6 } });
      const front = new Z.Polygon({ addTo: g, sides: 6, radius: R, stroke: 2.5, fill: true, color: base, rotate: { z: Math.PI / 6 } });
      glyph(Z, g, LETTERS[ch], { color: k === 0 ? '#10131c' : '#ffffff', stroke: 2, scale: 0.62, z: 0.6 });
      return { ch, a, front, back, base };
    });
    const tiles = [...WORD].map((ch, i) => {
      const tl = letterTile(Z, illo, ch, 9, { x: (i - 3) * 10.6, y: -44 });
      return { ...tl, i };
    });
    const sparks = Array.from({ length: 8 }, (_, i) => ({ s: new Z.Shape({ addTo: illo, stroke: 2.6, color: PALETTE[i % PALETTE.length] }), ang: (i / 8) * Z.TAU }));
    return t => {
      const STEP = 0.42, T = WORD.length * STEP + 2.2, k = t % T, done = k - WORD.length * STEP;
      tiles.forEach(tl => {
        const f = (k - tl.i * STEP) / STEP;
        tl.g.visible = f > 0;
        const up = smooth(Math.min(1, Math.max(0, f * 1.6)));
        tl.a.translate.y = -44 + (1 - up) * 40;
        tl.a.translate.z = (1 - up) * 14 + (done > 0 ? Math.max(0, Math.sin(done * 6 - tl.i * 0.6)) * 5 : 0);
        tl.a.scale = 0.5 + up * 0.5;
        tl.paint(done > 0 ? '#e8b923' : TILE_OFF);
      });
      cells.forEach(c => {
        const i = WORD.indexOf(c.ch), f = (k - i * STEP) / STEP;
        const lit = f > 0 && f < 0.7;
        c.a.translate.z = lit ? Math.sin((f / 0.7) * Math.PI) * 6 : 0;
        const col = lit ? '#8b6cff' : c.base;
        if (c.front.color !== col) { c.front.color = col; c.back.color = shade(col, -0.4); }
      });
      sparks.forEach(({ s, ang }) => {
        const b = Math.min(1, Math.max(0, done) * 1.3);
        s.visible = done > 0 && b < 1;
        s.translate.set({ x: Math.cos(ang) * (30 + b * 30), y: -44 + Math.sin(ang) * (6 + b * 16), z: 10 });
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.32;
    };
  },
  // Senha: painel com 3 tentativas; os pinos de cor caem um a um e os pininhos do lado dizem quantos estão certos.
  // Na última, os 4 acertam e pulam
  senha(Z, illo) {
    const C = ['#ff6b6b', '#ffb347', '#ffe066', '#3ddc97', '#4dc3ff', '#b78bff'];
    const CODE = [3, 0, 4, 2], TRIES = [[0, 1, 2, 5], [2, 0, 4, 1], CODE];
    const evalRow = g => { let ex = 0; const a = {}, b = {}; g.forEach((x, i) => { if (x === CODE[i]) ex++; else { a[x] = (a[x] || 0) + 1; b[CODE[i]] = (b[CODE[i]] || 0) + 1; } }); return [ex, Object.keys(a).reduce((s, x) => s + Math.min(a[x], b[x] || 0), 0)]; };
    const board = backdrop(Z, illo, 0, { sort: false });
    slab(Z, board, 92, 84, 6, '#262a40', { translate: { z: -6 } });
    new Z.Rect({ addTo: board, width: 90, height: 82, stroke: 1.5, fill: true, color: '#262a40', translate: { z: -2.6 } });
    const rows = TRIES.map((g, r) => {
      const y = (r - 1) * 24;
      new Z.Rect({ addTo: board, width: 84, height: 19, stroke: 4, fill: true, color: '#1b1f33', translate: { y, z: -2.2 } });
      const pegs = g.map((c, i) => {
        const a = new Z.Anchor({ addTo: illo, translate: { x: -30 + i * 15, y } });
        const dot = new Z.Shape({ addTo: a, stroke: 11, color: C[c] });
        new Z.Shape({ addTo: a, stroke: 3, color: 'rgba(255,255,255,0.65)', translate: { x: -2, y: -2, z: 4 } });
        return { a, dot };
      });
      const [ex, nr] = evalRow(g);
      const pins = Array.from({ length: 4 }, (_, i) => new Z.Shape({ addTo: illo, stroke: 4, color: i < ex ? '#3ddc97' : i < ex + nr ? '#ffffff' : '#3a3f5c', translate: { x: 28 + (i % 2) * 6, y: y - 3 + Math.floor(i / 2) * 6, z: 0 } }));
      return { pegs, pins };
    });
    return t => {
      const PEG = 0.16, ROW = 4 * PEG + 0.5, T = 3 * ROW + 1.6, k = t % T;
      rows.forEach((row, r) => {
        row.pegs.forEach((p, i) => {
          const f = (k - r * ROW - i * PEG) / 0.28;
          p.a.visible = f > 0;
          p.a.translate.z = f > 0 && f < 1 ? (1 - smooth(f)) * 26 : 0;
          const won = r === 2 ? k - 3 * ROW : -1;
          if (won > 0) p.a.translate.z = Math.max(0, Math.sin(won * 7 - i * 0.6)) * (won < 1.4 ? 7 : 0);
        });
        row.pins.forEach(pin => { pin.visible = k > r * ROW + 4 * PEG + 0.15; });
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.32;
    };
  },
  // Equação: um palpite (13+34=47) vira com as cores e depois a conta certa (12+35=47) vira toda verde
  equacao(Z, illo) {
    const ANSWER = '12+35=47', WORDS = ['13+34=47', '15+32=47', ANSWER], S = 14, STEP = S + 1.8, LAST = WORDS.length - 1;
    const rows = WORDS.map((w, r) => {
      const cols = termoColors(w, ANSWER);
      return [...w].map((ch, i) => ({ ...letterTile(Z, illo, ch, S, { x: (i - 3.5) * STEP, y: (r - 1) * (STEP + 4) }, { glyphScale: 0.56, stroke: 1.8 }), color: TERMO_C[cols[i]], r, i }));
    });
    return t => {
      const FLIP = 0.13, ROW = 8 * FLIP + 0.5, T = WORDS.length * ROW + 1.8, k = t % T;
      rows.flat().forEach(tl => {
        const f = (k - tl.r * ROW - tl.i * FLIP) / (FLIP * 1.8);
        tl.a.rotate.x = f > 0 && f < 1 ? Math.sin(f * Math.PI) * Math.PI / 2 * (f < 0.5 ? 1 : -1) : 0;
        tl.paint(f >= 0.5 ? tl.color : TILE_OFF);
        tl.g.visible = k > tl.r * ROW - 0.2;
        const won = tl.r === LAST ? k - WORDS.length * ROW : -1;
        tl.a.translate.z = won > 0 ? Math.max(0, Math.sin(won * 7 - tl.i * 0.55)) * (won < 1.5 ? 6 : 0) : 0;
      });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // Bandeira: uma bandeira tremulando no mastro; embaixo, a bússola gira até apontar pro país e a barra de
  // proximidade enche até 100% (fica verde)
  bandeira(Z, illo) {
    const N = 12, W = 66, H = 42, STRIPES = ['#4dc3ff', '#f4f6ff', '#ff8a5c'];
    const flag = new Z.Anchor({ addTo: illo, translate: { x: -30, y: -50 } });
    new Z.Cylinder({ addTo: illo, diameter: 3.5, length: 92, stroke: false, color: '#c9cde0', backface: '#9095ad', translate: { x: -32, y: -8 }, rotate: { x: Z.TAU / 4 } });
    new Z.Shape({ addTo: illo, stroke: 6, color: '#ffd34d', translate: { x: -32, y: -55 } });
    const strips = Array.from({ length: N }, (_, j) => {
      const g = new Z.Group({ addTo: flag, translate: { x: (j + 0.5) * (W / N) } });
      STRIPES.forEach((c, s) => new Z.Rect({ addTo: g, width: W / N + 0.6, height: H / 3 + 0.4, stroke: 0.6, fill: true, color: c, translate: { y: (s + 0.5) * (H / 3) } }));
      return g;
    });
    const star = new Z.Polygon({ addTo: flag, sides: 5, radius: 5, stroke: 1.5, fill: true, color: '#ffd34d', translate: { x: W * 0.32, y: H / 2, z: 0.5 } });
    // painel com a seta e a barra
    const panel = new Z.Anchor({ addTo: illo, translate: { x: 14, y: 38 } });
    const pg = new Z.Group({ addTo: panel });
    slab(Z, pg, 84, 26, 5, '#262a40');
    const face = new Z.Group({ addTo: pg, translate: { z: 2.9 } });
    new Z.Rect({ addTo: face, width: 82, height: 24, stroke: 1.5, fill: true, color: '#262a40' });
    new Z.Rect({ addTo: face, width: 50, height: 7, stroke: 2, fill: true, color: '#1b1f33', translate: { x: 10, z: 0.2 } });
    const bar = new Z.Rect({ addTo: face, width: 1, height: 7, stroke: 2, fill: true, color: '#ff6b8a', translate: { x: -15, z: 0.4 } });
    const arrow = new Z.Shape({ addTo: face, path: [{ x: 0, y: -8 }, { x: 5, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 7 }, { x: -2, y: 7 }, { x: -2, y: 0 }, { x: -5, y: 0 }], stroke: 1.5, fill: true, color: '#ffd34d', translate: { x: -29, z: 0.5 } });
    return t => {
      strips.forEach((g, j) => { const x = j / N; g.translate.z = Math.sin(t * 4 - x * 5) * 5 * x; g.translate.y = Math.sin(t * 4 - x * 5 + 1) * 1.2 * x; });
      star.translate.z = Math.sin(t * 4 - 0.32 * 5) * 5 * 0.32 + 0.6;
      const T = 4.2, k = t % T, f = smooth(Math.min(1, k / 2.6));
      const pct = Math.min(1, f);
      bar.width = Math.max(1, pct * 48);
      bar.translate.x = -14 + bar.width / 2;
      bar.color = pct >= 1 ? '#3ddc97' : pct > 0.6 ? '#ffd34d' : '#ff6b8a';
      arrow.rotate.z = (1 - f) * Math.PI * 2.6 + Math.PI / 4;
      panel.translate.z = k > 2.6 && k < 3.4 ? Math.sin(((k - 2.6) / 0.8) * Math.PI) * 6 : 0;
      illo.rotate.x = -0.25;
      illo.rotate.y = Math.sin(t * 0.45) * 0.32;
    };
  },
  // Caça-palavras: quadro de letras; a marcação arrasta por SOMAR (na linha de cima) e depois por BOLA (na
  // diagonal), cada uma fica de uma cor
  cacapalavras(Z, illo) {
    const GRID = ['SOMART', 'BEXULD', 'ZOCAEM', 'TRLVLO', 'MDAASE', 'UCERBT'], S = 15;
    const at = (r, c) => ({ x: (c - 2.5) * S, y: (r - 2.5) * S });
    const WORDS = [{ from: [0, 0], to: [0, 4], color: 'rgba(255,138,92,0.6)' }, { from: [1, 0], to: [4, 3], color: 'rgba(77,195,255,0.6)' }];
    const board = new Z.Group({ addTo: illo });
    slab(Z, backdrop(Z, illo, 0), S * 6 + 8, S * 6 + 8, 6, '#262a40', { translate: { z: -4 } });
    new Z.Rect({ addTo: board, width: S * 6 + 6, height: S * 6 + 6, stroke: 1.5, fill: true, color: '#f4f1e6', translate: { z: -0.8 } });
    const marks = WORDS.map(w => new Z.Shape({ addTo: board, path: [at(...w.from), at(...w.from)], stroke: S * 0.85, color: w.color, closed: false }));
    const sel = new Z.Shape({ addTo: board, path: [at(0, 0), at(0, 0)], stroke: S * 0.85, color: 'rgba(139,108,255,0.55)', closed: false });
    GRID.forEach((row, r) => [...row].forEach((ch, c) => glyph(Z, board, LETTERS[ch], { color: '#2b2f45', stroke: 1.6, scale: 0.6, z: 0.4 }).translate.set({ ...at(r, c), z: 0.4 })));
    const setLine = (sh, w, f) => {
      const a = at(...w.from), b = at(...w.to);
      sh.path = [a, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }]; sh.updatePath();
    };
    return t => {
      const STEP = 1.5, T = WORDS.length * STEP + 1.6, k = t % T;
      let active = false;
      WORDS.forEach((w, i) => {
        const f = (k - i * STEP) / (STEP * 0.6);
        marks[i].visible = f >= 1;
        if (f >= 1) setLine(marks[i], w, 1);
        if (f > 0 && f < 1) { setLine(sel, w, smooth(f)); active = true; }
      });
      sel.visible = active;
      const end = k - WORDS.length * STEP;
      board.translate.z = end > 0 ? Math.max(0, Math.sin(end * 6)) * (end < 1 ? 5 : 0) : 0;
      illo.rotate.x = -0.32;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
  // Cruzadinha: grade 5×5 com casas pretas; a linha marcada vai ganhando letras (TERRA), a casa da vez anda,
  // e no fim a grade inteira fica verde e pula
  cruzadinha(Z, illo) {
    const S = 15, BLACK = [0, 1, 23, 24], GIVEN = { 2: 'S', 3: 'O', 4: 'L', 5: 'A', 6: 'M', 7: 'O', 8: 'R', 9: 'A' }, WORD = 'TERRA', ROW = 2;
    const at = i => ({ x: ((i % 5) - 2) * S, y: (Math.floor(i / 5) - 2) * S });
    slab(Z, backdrop(Z, illo, 0), S * 5 + 8, S * 5 + 8, 6, '#2b2f45', { translate: { z: -4 } });
    const board = new Z.Group({ addTo: illo, updateSort: false });
    const cells = Array.from({ length: 25 }, (_, i) => (BLACK.includes(i) ? null
      : new Z.Rect({ addTo: board, width: S - 2.5, height: S - 2.5, stroke: 1.5, fill: true, color: '#f4f1e6', translate: { ...at(i), z: 0 } })));
    // números das dicas: um tracinho no canto (Zdog não tem texto pequeno)
    [2, 5, 10, 15].forEach(i => new Z.Shape({ addTo: board, path: [{ x: -5, y: -5 }, { x: -3, y: -5 }], stroke: 1.2, color: '#8a8fa8', translate: { ...at(i), z: 0.5 } }));
    Object.entries(GIVEN).forEach(([i, ch]) => glyph(Z, board, LETTERS[ch], { color: '#2b2f45', stroke: 1.6, scale: 0.6 }).translate.set({ ...at(+i), z: 0.6 }));
    const typed = [...WORD].map((ch, k) => { const g = glyph(Z, board, LETTERS[ch], { color: '#2b2f45', stroke: 1.6, scale: 0.6 }); g.translate.set({ ...at(ROW * 5 + k), z: 0.6 }); return g; });
    return t => {
      const T = 6, k = t % T, n = Math.floor(k / 0.55);
      const win = k > WORD.length * 0.55 + 0.4;
      cells.forEach((c, i) => {
        if (!c) return;
        const inRow = Math.floor(i / 5) === ROW, cur = inRow && i % 5 === Math.min(n, WORD.length - 1) && !win;
        c.color = win ? '#5fd39a' : cur ? '#f2c94c' : inRow ? '#f3c6dd' : '#f4f1e6';
        const w = win ? Math.max(0, Math.sin((k - WORD.length * 0.55 - 0.4 - (i % 5) * 0.08) * 7)) : 0;
        c.translate.z = (k - WORD.length * 0.55 - 0.4) < 0.6 ? w * 4 : 0;
      });
      typed.forEach((g, j) => { g.visible = j < n; g.scale = j === n - 1 ? 1 + Math.max(0, 0.5 - (k - (n - 1) * 0.55) * 1.6) : 1; g.translate.z = 0.6 + (cells[ROW * 5 + j].translate.z || 0); });
      illo.rotate.x = -0.3;
      illo.rotate.y = Math.sin(t * 0.45) * 0.3;
    };
  },
};

// ---------- peças compartilhadas pelas cenas dos jogos diários ----------
// cores do Termo: verde no lugar, amarelo se existe em outro lugar (contando repetidas), cinza se não tem
function termoColors(w, answer) {
  const res = [...w].map((ch, i) => (ch === answer[i] ? 'v' : null)), left = [...answer].filter((ch, i) => w[i] !== ch);
  return res.map((r, i) => { if (r) return r; const j = left.indexOf(w[i]); if (j >= 0) { left.splice(j, 1); return 'y'; } return 'g'; });
}
// sinais da Equação (os números vêm do display de 7 segmentos)
const SYMBOLS = { '+': [[[-4, 0], [4, 0]], [[0, -4], [0, 4]]], '-': [[[-4, 0], [4, 0]]], '=': [[[-4, -2.5], [4, -2.5]], [[-4, 2.5], [4, 2.5]]], '*': [[[-3.2, -3.2], [3.2, 3.2]], [[3.2, -3.2], [-3.2, 3.2]]], '/': [[[3, -6], [-3, 6]]] };
const TERMO_C = { g: '#4a4f6e', y: '#e8b923', v: '#2fbf80' }, TILE_OFF = '#20243a';
// ladrilho de letra que vira mostrando a cor (frente vazia com borda → cor atrás)
function letterTile(Z, addTo, ch, S, at, { glyphScale = S / 26, stroke = Math.max(1.3, S / 9) } = {}) {
  const a = new Z.Anchor({ addTo, translate: at });
  const g = new Z.Group({ addTo: a, updateSort: true });
  const box = slab(Z, g, S, S, Math.max(3, S / 4), TILE_OFF);
  const face = new Z.Group({ addTo: g, translate: { z: Math.max(3, S / 4) / 2 + 0.4 } });
  const front = new Z.Rect({ addTo: face, width: S - 2, height: S - 2, stroke: 1.6, fill: true, color: TILE_OFF });
  const border = new Z.Rect({ addTo: face, width: S - 3, height: S - 3, stroke: 1, color: '#4a4f6e' });
  glyph(Z, face, LETTERS[ch] || (/\d/.test(ch) ? digitLines(+ch) : SYMBOLS[ch]), { color: '#ffffff', stroke, scale: glyphScale, z: 0.3 });
  const paint = c => { if (front.color !== c) { front.color = c; paintBox(box, c); border.visible = c === TILE_OFF; } };
  return { a, g, paint };
}
// número em display de 7 segmentos (vários dígitos lado a lado), num Group pra desenhar como peça só
function numberGlyph(Z, addTo, n, { color = '#ffffff', scale = 0.5, stroke = 1.6, gap = 11, z = 0.3 } = {}) {
  const ds = String(n).split('').map(Number), w = (ds.length - 1) * gap * scale;
  const g = new Z.Group({ addTo, translate: { z } });
  ds.forEach((d, i) => glyph(Z, g, digitLines(d).map(l => l.map(([x, y]) => [x + (i * gap * scale - w / 2) / scale, y])), { color, stroke, scale }));
  return g;
}

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

// chave "Animações 3D" no menu da conta: liga/desliga o 3D (fica salvo no navegador). Desligado = emoji parado, sem biblioteca nem animação.
// Sem escolha salva, segue o modo leve (js/perf.js): PC fraco começa sem 3D.
const fx3dPref = () => { try { return localStorage.getItem('mg_3d'); } catch { return null; } };
let fx3dOn = fx3dPref() ? fx3dPref() !== 'off' : !perf.lite;
// com o 3D ligado, as bibliotecas já começam a baixar agora (enquanto a página descobre quem está logado),
// e não só quando o menu é desenhado — as cenas aparecem antes. Falhou? enhanceCards tenta de novo.
if (fx3dOn) { loadLib(ZDOG_URL).catch(() => {}); loadLib(TILT_URL).catch(() => {}); }
function renderFx3d() {
  const b = $('#fx3d');
  b.setAttribute('aria-checked', fx3dOn);
  b.title = fx3dOn ? 'Ligadas (desligue se ficar pesado)' : 'Desligadas';
}
function setFx3d(on) {
  fx3dOn = on;
  renderFx3d();
  if (!fx3dOn) { scenes3d = []; io?.disconnect(); visible.clear(); } // o loop para sozinho sem cenas
  if (currentView === 'menu') renderMenu();
}
$('#fx3d').onclick = () => {
  try { localStorage.setItem('mg_3d', fx3dOn ? 'off' : 'on'); } catch {}
  setFx3d(!fx3dOn);
};
addEventListener('mg:perf', () => { if (!fx3dPref() && fx3dOn === perf.lite) setFx3d(!perf.lite); });
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
  document.querySelectorAll('.grid').forEach(g => g.classList.add('has3d'));
  // tamanho da cena: 190px no computador, 150px no celular
  // (a Zdog grava o tamanho no próprio canvas, então o tamanho do celular sai daqui e não do CSS)
  // no celular o card tem ~160px de largura: canvas do tamanho do card e cena um pouco menor (as de palavras são largas)
  const size0 = SMALL.matches ? 160 : 190, fit0 = SMALL.matches ? 0.88 : 1;
  document.querySelectorAll('.grid .card').forEach(card => {
    const build = SCENES_3D[card.dataset.id];
    if (!build) return;
    // a grade pode pedir outro tamanho (data-z3d / data-fit): os ladrilhos quadrados do visual Console
    const box = card.parentElement.dataset, size = +box.z3d || size0, fit = +box.fit || fit0;
    const canvas = Object.assign(document.createElement('canvas'), { className: 'z3d', width: size, height: size });
    canvas.setAttribute('aria-hidden', 'true');
    card.prepend(canvas);
    // zoom proporcional (as cenas foram desenhadas pra 150px); a Zdog já ajusta pra telas de alta densidade
    const illo = new Zdog.Illustration({ element: canvas, zoom: size / 150 * fit });
    scenes3d.push({ canvas, illo, update: build(Zdog, illo) });
    io?.observe(canvas);
  });
  // palcos grandes: o desafio do dia e o diário em destaque
  document.querySelectorAll('.daily-stage').forEach(stage => {
    const build = SCENES_3D[stage.dataset.id];
    if (!build) return;
    const ds = +stage.dataset.size || (SMALL.matches ? 150 : 170);
    const canvas = Object.assign(document.createElement('canvas'), { className: 'z3d', width: ds, height: ds });
    canvas.setAttribute('aria-hidden', 'true');
    stage.prepend(canvas);
    stage.classList.add('has3d');
    const illo = new Zdog.Illustration({ element: canvas, zoom: ds / 150 });
    scenes3d.push({ canvas, illo, update: build(Zdog, illo) });
    io?.observe(canvas);
  });
  if (!loopOn && scenes3d.length) { loopOn = true; requestAnimationFrame(loop); }
  // inclinação 3D com brilho (só com mouse; no celular fica parado)
  if (matchMedia('(hover: hover)').matches) {
    VanillaTilt.init(document.querySelectorAll('.grid .card'), { max: 8, speed: 500, scale: 1.02, glare: true, 'max-glare': 0.18, perspective: 900 });
    document.querySelectorAll('.grid').forEach(g => g.classList.add('tilt-on'));
  }
}
