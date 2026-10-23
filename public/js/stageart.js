// ---------- arte da tela de jogo: "peças soltas" ----------
// Cada jogo ganha um fundo próprio no canto do palco: peças de brinquedo (ladrilho com volume, bolinha, anel e cruz,
// as mesmas formas do controle da logo) espalhadas numa grade com sorteio, mais densas no canto de cima à direita e
// sumindo pra esquerda e pra baixo (fica atrás do cabeçalho, longe do jogo). O sorteio sai do id do jogo, então cada jogo tem sempre o mesmo desenho, nas cores dele.
// É um SVG parado, montado uma vez por partida (vale também no modo leve: não anima nada).
const stageArtCache = {};
function stageArt(id, hue) {
  if (stageArtCache[id]) return stageArtCache[id];
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = mulberry32(h >>> 0);
  const W = 560, H = 140, CELL = 24;
  const tones = [hue, hue + 38, hue - 34, hue];
  // cada jogo prefere duas ou três formas (o mesmo id dá sempre a mesma escolha)
  const kinds = ['tile', 'dot', 'ring', 'plus'].filter(() => rnd() < 0.7);
  if (kinds.length < 2) kinds.push('tile', 'dot');
  const out = [];
  for (let y = CELL / 2; y < H; y += CELL) {
    for (let x = CELL / 2; x < W; x += CELL) {
      // distância até o canto de cima à direita (0 no canto, 1 longe): decide se a peça aparece e o quanto ela some
      const d = Math.min(1, (W - x) / W * 0.95 + y / H * 0.55);
      if (rnd() > (1 - d) ** 1.4 * 0.95) continue;
      const px = (x + (rnd() - 0.5) * CELL * 0.7).toFixed(1), py = (y + (rnd() - 0.5) * CELL * 0.7).toFixed(1);
      const s = 4 + rnd() * 5 * (1.3 - d), a = (0.6 - d * 0.55) * (0.6 + rnd() * 0.4);
      const tone = tones[Math.floor(rnd() * tones.length)], gold = rnd() < 0.07;
      const fill = gold ? 'hsl(45 95% 64%)' : `hsl(${tone} 75% ${62 + rnd() * 14}%)`;
      const shadow = gold ? 'hsl(35 80% 38%)' : `hsl(${tone} 55% 32%)`;
      const rot = Math.round(rnd() * 6 - 3) * 15;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      const t = `translate(${px} ${py}) rotate(${rot})`;
      if (kind === 'tile') {
        // ladrilho com a "base" mais escura embaixo: o volume de brinquedo dos cards 3D
        const r = (s * 0.32).toFixed(1), w = (s * 2).toFixed(1), o = (-s).toFixed(1);
        out.push(`<g transform="${t}" opacity="${a.toFixed(2)}"><rect x="${o}" y="${(-s + s * 0.28).toFixed(1)}" width="${w}" height="${w}" rx="${r}" fill="${shadow}"/><rect x="${o}" y="${o}" width="${w}" height="${w}" rx="${r}" fill="${fill}"/></g>`);
      } else if (kind === 'dot') {
        out.push(`<g transform="${t}" opacity="${a.toFixed(2)}"><circle cy="${(s * 0.22).toFixed(1)}" r="${(s * 0.7).toFixed(1)}" fill="${shadow}"/><circle r="${(s * 0.7).toFixed(1)}" fill="${fill}"/></g>`);
      } else if (kind === 'ring') {
        out.push(`<circle transform="${t}" r="${(s * 0.75).toFixed(1)}" fill="none" stroke="${fill}" stroke-width="${(s * 0.32).toFixed(1)}" opacity="${a.toFixed(2)}"/>`);
      } else {
        const l = (s * 0.95).toFixed(1), w = (s * 0.62).toFixed(1), hw = (s * 0.31).toFixed(1), r = (s * 0.16).toFixed(1);
        out.push(`<g transform="${t}" opacity="${a.toFixed(2)}" fill="${fill}"><rect x="-${l}" y="-${hw}" width="${(l * 2).toFixed(1)}" height="${w}" rx="${r}"/><rect x="-${hw}" y="-${l}" width="${w}" height="${(l * 2).toFixed(1)}" rx="${r}"/></g>`);
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join('')}</svg>`;
  return (stageArtCache[id] = `url('data:image/svg+xml,${encodeURIComponent(svg)}')`);
}

/** Põe a cena 3D do card do jogo (cards3d.js) dentro de `host`, se o 3D estiver ligado. Devolve a limpeza (ou null). */
function mountScene3d(id, host, size) {
  const build = typeof SCENES_3D !== 'undefined' && SCENES_3D[id];
  if (!build || !fx3dOn || !window.Zdog) return null;
  const canvas = Object.assign(document.createElement('canvas'), { className: 'z3d', width: size, height: size });
  canvas.setAttribute('aria-hidden', 'true');
  host.replaceChildren(canvas);
  const illo = new Zdog.Illustration({ element: canvas, zoom: size / 150 });
  const scene = { canvas, illo, update: build(Zdog, illo) };
  scenes3d.push(scene);
  io?.observe(canvas);
  if (!loopOn) { loopOn = true; requestAnimationFrame(loop); }
  return () => { scenes3d = scenes3d.filter(s => s !== scene); io?.unobserve(canvas); };
}

/** Primeira frase da descrição do jogo (o resto está no "Como jogar"). */
function firstSentence(text) {
  const m = String(text || '').match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : String(text || '');
}

// ---------- tela de resultado ----------
// No alto do resultado: a cena 3D do jogo (com o 3D ligado) ou o ícone num ladrilho com volume, nas cores do jogo.
// Partida perdida (`lostIcon`): o ladrilho fica vermelho com o ícone da derrota, sem cena 3D.
function resultArt(g, lostIcon) {
  return `<div class="res-art${lostIcon ? ' lost' : ''}" aria-hidden="true"><span class="res-tile">${icon(lostIcon || g.icon)}</span></div>`;
}
/** Liga a cena 3D no topo do resultado que acabou de ser desenhado em `el`. Devolve a limpeza (vai pro `cleanup`). */
function mountResultArt(id, el) {
  const art = el.querySelector('.res-art:not(.lost)');
  return (art && mountScene3d(id, art, SMALL.matches ? 104 : 124)) || null;
}
