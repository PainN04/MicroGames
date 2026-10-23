// Gera as grades da Cruzadinha (lib/data/cruzadinha.json) a partir de lib/data/cruzadinha-dicas.txt. Roda uma vez, fora do app.
//   node scripts/build-cruzadinha.js [quantas=420]
// Cada grade é 5×5 com 4 a 6 casas pretas; toda palavra (na horizontal e na vertical) tem 3 a 5 letras e precisa ter dica.
// O sorteio usa semente fixa: rodar de novo com a mesma lista gera as mesmas grades.
const fs = require('node:fs');
const path = require('node:path');
const data = f => path.join(__dirname, '..', 'lib', 'data', f);
const WANT = +process.argv[2] || 420;
const S = 5;

const clues = {};
for (const line of fs.readFileSync(data('cruzadinha-dicas.txt'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const i = line.indexOf(';'), w = line.slice(0, i).trim(), d = line.slice(i + 1).trim();
  if (!/^[A-Z]{3,5}$/.test(w) || !d) throw new Error(`linha inválida: ${line}`);
  if (clues[w]) throw new Error(`palavra repetida: ${w}`);
  clues[w] = d;
}
const words = Object.keys(clues);
const by = { 3: [], 4: [], 5: [] };
words.forEach(w => by[w.length].push(w));
const pre = new Set();
for (const w of words) for (let i = 1; i <= w.length; i++) pre.add(w.length + ':' + w.slice(0, i));

let seed = 20261023;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const shuffled = l => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function slotsOf(black) {
  const g = Array(S * S).fill(0); black.forEach(b => { g[b] = 1; });
  const out = [];
  for (const dir of ['A', 'D']) for (let a = 0; a < S; a++) {
    let b = 0;
    while (b < S) {
      const at = k => (dir === 'A' ? a * S + k : k * S + a);
      if (g[at(b)]) { b++; continue; }
      const b0 = b; while (b < S && !g[at(b)]) b++;
      if (b - b0 >= 2) out.push({ dir, cells: Array.from({ length: b - b0 }, (_, k) => at(b0 + k)) });
    }
  }
  return out;
}

// preenche sempre a casa de palavra (horizontal ou vertical) com menos opções que ainda cabem, voltando atrás quando trava
const idx = {};
for (const w of words) [...w].forEach((ch, k) => { ((idx[w.length + ':' + k + ch]) ||= []).push(w); });
function fill(black, uses, maxUse, limit = 4000) {
  const slots = slotsOf(black);
  const g = Array(S * S).fill(null); black.forEach(b => { g[b] = '#'; });
  const used = new Set(); let steps = 0;
  const ok = w => (uses[w] || 0) < maxUse && !used.has(w);
  const cands = s => {
    let best = by[s.cells.length];
    s.cells.forEach((c, k) => { if (g[c]) { const l = idx[s.cells.length + ':' + k + g[c]] || []; if (l.length < best.length) best = l; } });
    return best.filter(w => ok(w) && s.cells.every((c, k) => !g[c] || g[c] === w[k]));
  };
  const open = new Set(slots);
  function rec() {
    if (++steps > limit) return false;
    if (!open.size) return true;
    let pick = null, list = null;
    for (const s of open) { const l = cands(s); if (!l.length) return false; if (!list || l.length < list.length) { pick = s; list = l; } }
    open.delete(pick);
    // as palavras menos usadas até agora vêm primeiro, pra variar ao longo do ano
    for (const w of list.map(w => [w, rnd() + (uses[w] || 0) * 0.12]).sort((a, b) => a[1] - b[1]).map(x => x[0])) {
      const before = pick.cells.map(c => g[c]);
      pick.cells.forEach((c, k) => { g[c] = w[k]; });
      // palavras que ficaram completas sem querer também precisam valer
      const full = [...open].filter(s => s.cells.every(c => g[c])).map(s => s.cells.map(c => g[c]).join(''));
      const fine = full.every(x => clues[x] && ok(x) && x !== w) && new Set(full).size === full.length;
      if (fine) { used.add(w); full.forEach(x => used.add(x)); const done = [...open].filter(s => s.cells.every(c => g[c])); done.forEach(s => open.delete(s));
        if (rec()) return true;
        used.delete(w); full.forEach(x => used.delete(x)); done.forEach(s => open.add(s)); }
      pick.cells.forEach((c, k) => { g[c] = before[k]; });
    }
    open.add(pick);
    return false;
  }
  if (!rec()) return null;
  return { grid: g.join(''), words: slots.map(s => s.cells.map(c => g[c]).join('')) };
}

const PATTERNS = [[0, 1, 23, 24], [3, 4, 20, 21], [0, 5, 19, 24], [4, 9, 15, 20], [0, 1, 5, 19, 23, 24], [3, 4, 9, 15, 20, 21], [0, 1, 23, 24], [0, 4, 20, 24]];
const uses = {}, grids = [], seen = new Set();
let tries = 0;
const t0 = Date.now();
while (grids.length < WANT && tries < WANT * 15) {
  const black = PATTERNS[tries++ % PATTERNS.length];
  const maxUse = 4 + Math.floor(grids.length / 30); // a mesma palavra se repete poucas vezes no ano
  const r = fill(black, uses, maxUse, 1500);
  if (!r || seen.has(r.grid)) continue;
  seen.add(r.grid);
  r.words.forEach(w => { uses[w] = (uses[w] || 0) + 1; });
  grids.push(r.grid);
  if (grids.length % 50 === 0) console.log(grids.length, 'grades', Math.round((Date.now() - t0) / 1000) + 's');
}
// só as dicas das palavras que aparecem em alguma grade
const usedClues = {};
Object.keys(uses).sort().forEach(w => { usedClues[w] = clues[w]; });
fs.writeFileSync(data('cruzadinha.json'), JSON.stringify({ grids: shuffled(grids), clues: usedClues }));
console.log(`${grids.length} grades em ${tries} tentativas, ${Object.keys(usedClues).length} palavras usadas de ${words.length}`);
