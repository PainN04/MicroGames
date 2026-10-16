// ---------- cenários animados dos cards do menu ----------
// Cada jogo tem um "fundo vivo" só com CSS (peças caindo, insetos chovendo...). As partículas são <i> com
// variáveis CSS: --x/--y posição (%), --s tamanho (px), --d atraso (s), --t duração (s), --c cor, --r giro.
// A animação vem da classe (fall, rise, drift, pop, blink, bob, march, slide, spin). Com "reduzir movimento",
// o CSS para tudo e fica só o desenho.
const P = (anim, x, y, o = {}) => ({ anim, x, y, ...o });
const BLOCK_COLORS = ['#7c5cff', '#ff8a5c', '#3ddc97', '#ffd34d', '#4dc3ff', '#ff6b8a'];

const SCENES = {
  // peças de Tetris caindo e girando
  blocos: [0, 1, 2, 3, 4, 5].map(i => P('fall tetro', 34 + i * 11, -20, { s: 14, d: -i * 1.3, t: 7 + (i % 3), c: BLOCK_COLORS[i], r: (i % 2 ? 1 : -1) * 180, shape: i % 3 })),
  reflexo: [P('blink dot', 74, 16, { s: 30, t: 2.4, c: '#3ddc97' }), P('blink dot', 74, 16, { s: 30, t: 2.4, d: -1.2, c: '#ff6b8a' }), P('bob', 86, 10, { e: '⚡', s: 16, t: 3 })],
  clique: [0, 1, 2].map(i => P('pop ring', 64 + i * 10, 8 + i * 11, { s: 26, d: -i * 0.6, t: 1.8, c: '#ffd34d' })),
  digitacao: 'ASDFJKL'.split('').map((k, i) => P('rise key', 38 + i * 8.5, 100, { e: k, s: 13, d: -i * 0.9, t: 6 })),
  memoria: [0, 1, 2, 3].map(i => P('blink tile', 62 + (i % 2) * 18, 14 + Math.floor(i / 2) * 26, { s: 24, d: -i * 0.5, t: 2, c: BLOCK_COLORS[i] })),
  mira: [P('pop target', 70, 20, { s: 30, t: 2.2 }), P('pop target', 84, 52, { s: 22, t: 2.2, d: -0.8 }), P('pop target', 56, 46, { s: 18, t: 2.2, d: -1.5 })],
  snake: [0, 1, 2, 3, 4].map(i => P('march seg', 50 + i * 7, 26, { s: 11, d: -i * 0.12, t: 4, c: '#3ddc97' })).concat([P('blink dot', 88, 50, { s: 9, t: 1.6, c: '#ff6b8a' })]),
  matematica: ['+', '−', '×', '÷', '='].map((e, i) => P('rise', 42 + i * 11, 100, { e, s: 18, d: -i * 1.1, t: 6.5 })),
  voa: [P('drift', -20, 18, { e: '☁️', s: 22, t: 14 }), P('drift', -20, 48, { e: '☁️', s: 14, t: 10, d: -5 }), P('bob', 74, 26, { e: '🐦', s: 22, t: 1.6 })],
  chuva: [0, 1, 2, 3, 4].map(i => P('fall', 36 + i * 13, -15, { e: '🐛', s: 15, d: -i * 1.4, t: 5.5, r: 40 })),
  cores: BLOCK_COLORS.slice(0, 5).map((c, i) => P('bob dot', 48 + i * 10, 22 + (i % 2) * 18, { s: 16, d: -i * 0.4, t: 2.6, c })),
  numeros: ['3', '7', '1', '9', '4', '6'].map((e, i) => P('bob num', 52 + (i % 3) * 15, 12 + Math.floor(i / 3) * 28, { e, s: 15, d: -i * 0.5, t: 3 })),
  toupeira: [P('pop mole', 62, 30, { e: '🐹', s: 24, t: 2.4 }), P('pop mole', 82, 30, { e: '🐹', s: 24, t: 2.4, d: -1.2 })],
  tijolos: [0, 1, 2, 3, 4, 5].map(i => P('blink brick', 46 + (i % 3) * 17, 12 + Math.floor(i / 3) * 12, { s: 15, d: -i * 0.7, t: 3.5, c: BLOCK_COLORS[i] })).concat([P('bounce ball', 60, 55, { s: 9, t: 2.2 })]),
  g2048: [['2', 0], ['4', 1], ['8', 2], ['16', 3]].map(([e, i]) => P('pop tile2048', 52 + (i % 2) * 22, 12 + Math.floor(i / 2) * 30, { e, s: 26, d: -i * 0.7, t: 3, c: BLOCK_COLORS[i] })),
  torre: [0, 1, 2].map(i => P('slide slab', 58, 60 - i * 16, { s: 40 - i * 6, d: -i * 0.9, t: 3, c: BLOCK_COLORS[i + 1] })),
  invasores: [0, 1, 2].map(i => P('march', 50 + i * 15, 18, { e: '👾', s: 17, d: -i * 0.1, t: 3 })).concat([P('rise shot', 66, 100, { s: 4, t: 1.4 })]),
  minado: [P('blink', 66, 20, { e: '💣', s: 18, t: 3 }), P('bob', 84, 44, { e: '🚩', s: 18, t: 2.4 }), P('blink num', 56, 46, { e: '2', s: 15, t: 3, d: -1.5 })],
  ritmo: ['♪', '♫', '♩', '♬'].map((e, i) => P('rise', 46 + i * 13, 100, { e, s: 18, d: -i * 1.2, t: 5 })),
  anagrama: 'LETRA'.split('').map((e, i) => P('bob key', 44 + i * 11, 22 + (i % 2) * 10, { e, s: 13, d: -i * 0.3, t: 2.8 })),
};

function sceneHtml(id) {
  const parts = SCENES[id];
  if (!parts) return '';
  return `<span class="scene" aria-hidden="true">${parts.map(p => {
    const v = [`--x:${p.x}%`, `--y:${p.y}%`, `--s:${p.s || 16}px`, `--d:${p.d || 0}s`, `--t:${p.t || 4}s`];
    if (p.c) v.push(`--c:${p.c}`);
    if (p.r) v.push(`--r:${p.r}deg`);
    const cls = p.anim + (p.shape !== undefined ? ` s${p.shape}` : '');
    return `<i class="${cls}" style="${v.join(';')}">${p.e || ''}</i>`;
  }).join('')}</span>`;
}
