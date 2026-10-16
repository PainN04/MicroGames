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
    const moles = [-26, 26].map((x, i) => {
      new Z.Ellipse({ addTo: illo, diameter: 30, stroke: 4, fill: true, color: '#1b1428', translate: { x, y: 34 }, rotate: { x: Z.TAU / 4 } });
      new Z.Ellipse({ addTo: illo, diameter: 34, stroke: 3, color: '#5a3d2b', translate: { x, y: 34 }, rotate: { x: Z.TAU / 4 } });
      const a = new Z.Anchor({ addTo: illo, translate: { x } });
      new Z.Shape({ addTo: a, stroke: 24, color: '#b07a52' }); // cabeça
      new Z.Shape({ addTo: a, stroke: 9, color: '#e8b896', translate: { y: 4, z: 9 } }); // focinho
      new Z.Shape({ addTo: a, stroke: 4, color: '#ff8fa3', translate: { y: 1, z: 13 } }); // nariz
      [-1, 1].forEach(s => {
        new Z.Shape({ addTo: a, stroke: 4, color: '#10131c', translate: { x: s * 5, y: -4, z: 10 } }); // olhos
        new Z.Shape({ addTo: a, stroke: 6, color: '#8c5a3a', translate: { x: s * 10, y: -10, z: 2 } }); // orelhas
      });
      return { a, off: i * Math.PI };
    });
    return t => {
      for (const m of moles) {
        const k = Math.max(0, Math.sin(t * 1.6 + m.off)); // sobe, espia, desce
        m.a.translate.y = 34 - k * 34;
        m.a.rotate.y = Math.sin(t * 3 + m.off) * 0.35 * k;
        m.a.scale = 0.6 + k * 0.4;
      }
      illo.rotate.x = -0.25;
    };
  },
};

/* ---------- montagem e loop ---------- */
let scenes3d = [], loopOn = false, visible = new Set();
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)))) : null;

function loop(now) {
  if (!scenes3d.length) { loopOn = false; return; }
  if (!document.hidden) {
    const t = now / 1000;
    for (const s of scenes3d) {
      if (io && !visible.has(s.canvas)) continue;
      s.update(t);
      s.illo.updateRenderGraph();
    }
  }
  requestAnimationFrame(loop);
}

/** Chamado depois de desenhar o menu: troca o cenário CSS pela cena 3D nos jogos que têm uma, e liga a inclinação. */
async function enhanceCards() {
  try { await Promise.all([loadLib(ZDOG_URL), loadLib(TILT_URL)]); } catch { return; } // sem internet: fica o cenário CSS
  if (!document.querySelector('.grid .card')) return;
  io?.disconnect(); visible.clear();
  scenes3d = [];
  document.querySelectorAll('.grid .card').forEach(card => {
    const build = SCENES_3D[card.dataset.id];
    if (!build) return;
    card.querySelector('.scene')?.remove();
    const canvas = Object.assign(document.createElement('canvas'), { className: 'z3d', width: 150, height: 150 });
    canvas.setAttribute('aria-hidden', 'true');
    card.prepend(canvas);
    const illo = new Zdog.Illustration({ element: canvas }) // a Zdog já ajusta pra telas de alta densidade;
    scenes3d.push({ canvas, illo, update: build(Zdog, illo) });
    io?.observe(canvas);
  });
  if (!loopOn && scenes3d.length) { loopOn = true; requestAnimationFrame(loop); }
  // inclinação 3D com brilho (só com mouse; no celular fica parado)
  if (matchMedia('(hover: hover)').matches) {
    VanillaTilt.init(document.querySelectorAll('.grid .card'), { max: 8, speed: 500, scale: 1.02, glare: true, 'max-glare': 0.18, perspective: 900 });
    document.querySelector('.grid').classList.add('tilt-on');
  }
}
