GAMES.sudoku = {
  name: 'Sudoku', icon: 'grid-3x3', hue: 262, desc: 'Complete a grade sem repetir número na linha, coluna e bloco. Menor tempo ganha. Dica = +20s.',
  better: 'low', unit: 's',
  start(el, done) {
    const HINT_COST = 20, CLUES = 32;
    const BOX = i => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);
    const bit = d => 1 << d, popcount = m => { let n = 0; for (; m; m &= m - 1) n++; return n; };
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const UNITS = [];
    for (let k = 0; k < 9; k++) {
      UNITS.push(Array.from({ length: 9 }, (_, j) => k * 9 + j), Array.from({ length: 9 }, (_, j) => j * 9 + k),
        Array.from({ length: 9 }, (_, j) => (Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)));
    }

    /** Preenche uma grade completa e válida (backtracking embaralhado, sempre pela casa com menos opções). */
    function fullGrid() {
      const g = new Array(81).fill(0), rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
      const rec = () => {
        let best = -1, bestMask = 0, bestN = 10;
        for (let i = 0; i < 81; i++) if (!g[i]) {
          const m = ~(rows[(i / 9) | 0] | cols[i % 9] | boxes[BOX(i)]) & 0x3fe, n = popcount(m);
          if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
        }
        if (best < 0) return true;
        if (!bestN) return false;
        const ds = []; for (let d = 1; d <= 9; d++) if (bestMask & bit(d)) ds.push(d);
        for (const d of shuffle(ds)) {
          g[best] = d; rows[(best / 9) | 0] |= bit(d); cols[best % 9] |= bit(d); boxes[BOX(best)] |= bit(d);
          if (rec()) return true;
          g[best] = 0; rows[(best / 9) | 0] &= ~bit(d); cols[best % 9] &= ~bit(d); boxes[BOX(best)] &= ~bit(d);
        }
        return false;
      };
      rec();
      return g;
    }
    /** Resolve só com "única opção na casa" e "único lugar do número na linha/coluna/bloco" — sem chute. */
    function solvableBySingles(start) {
      const g = start.slice(), rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
      const set = (i, d) => { g[i] = d; rows[(i / 9) | 0] |= bit(d); cols[i % 9] |= bit(d); boxes[BOX(i)] |= bit(d); };
      for (let i = 0; i < 81; i++) if (g[i]) set(i, g[i]);
      const cand = i => ~(rows[(i / 9) | 0] | cols[i % 9] | boxes[BOX(i)]) & 0x3fe;
      for (let progress = true; progress;) {
        progress = false;
        for (let i = 0; i < 81; i++) if (!g[i]) {
          const m = cand(i);
          if (!m) return false;
          if (popcount(m) === 1) { set(i, 31 - Math.clz32(m)); progress = true; }
        }
        for (const u of UNITS) for (let d = 1; d <= 9; d++) {
          if (u.some(i => g[i] === d)) continue;
          const spots = u.filter(i => !g[i] && (cand(i) & bit(d)));
          if (spots.length === 1) { set(spots[0], d); progress = true; } else if (!spots.length) return false;
        }
      }
      return g.every(Boolean);
    }
    /** Tira números (de 2 em 2, simétrico) enquanto dá pra resolver sem chute: dificuldade parecida em toda partida. */
    function makePuzzle() {
      const solution = fullGrid(), puzzle = solution.slice();
      let clues = 81;
      for (const i of shuffle(Array.from({ length: 41 }, (_, k) => k))) {
        if (clues <= CLUES) break;
        const j = 80 - i, a = puzzle[i], b = puzzle[j];
        puzzle[i] = 0; puzzle[j] = 0;
        if (solvableBySingles(puzzle)) clues -= i === j ? 1 : 2;
        else { puzzle[i] = a; puzzle[j] = b; }
      }
      return { solution, puzzle };
    }

    const { solution, puzzle } = makePuzzle();
    const given = puzzle.map(Boolean), cells = puzzle.slice(), notes = new Array(81).fill(0), hinted = new Set();
    let sel = -1, noteMode = false, hints = 0, t0 = performance.now(), iv, over = false;
    const elapsed = () => Math.round((performance.now() - t0) / 1000) + hints * HINT_COST;
    const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    el.innerHTML = `<div class="hud"><span class="stat">Tempo<b id="t">0:00</b></span><span class="stat">Dicas<b id="h">0</b></span></div>
      <div class="sd-board" id="bd" role="grid" aria-label="Sudoku"></div>
      <div class="sd-pad" id="pad">${Array.from({ length: 9 }, (_, i) => `<button class="sd-num" data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
      <div class="sd-tools"><button class="btn ghost" id="note" aria-pressed="false">${icon('pencil')} Notas: desligado</button>
        <button class="btn ghost" id="del">${icon('delete')} Apagar</button><button class="btn ghost" id="hint">${icon('lightbulb')} Dica (+${HINT_COST}s)</button></div>
      <p class="hint" id="msg">Toque numa casa e escolha o número. Teclado: 1–9, setas, Apagar, N (notas), H (dica).</p>`;
    const bd = el.querySelector('#bd'), msg = el.querySelector('#msg');

    // casas que repetem número na linha, coluna ou bloco (ficam vermelhas)
    function conflicts() {
      const bad = new Set();
      for (const u of UNITS) {
        const seen = {};
        for (const i of u) if (cells[i]) (seen[cells[i]] ||= []).push(i);
        for (const d in seen) if (seen[d].length > 1) seen[d].forEach(i => bad.add(i));
      }
      return bad;
    }
    function render() {
      const bad = conflicts(), sv = sel >= 0 ? cells[sel] : 0;
      bd.innerHTML = cells.map((v, i) => {
        const r = (i / 9) | 0, c = i % 9;
        const peer = sel >= 0 && i !== sel && (r === ((sel / 9) | 0) || c === sel % 9 || BOX(i) === BOX(sel));
        const cls = ['sd-cell', given[i] && 'given', hinted.has(i) && 'tip', i === sel && 'sel', peer && 'peer', sv && v === sv && i !== sel && 'same', bad.has(i) && 'bad',
          c % 3 === 2 && c < 8 && 'br', r % 3 === 2 && r < 8 && 'bb'].filter(Boolean).join(' ');
        const inner = v ? v : notes[i] ? `<span class="nt">${Array.from({ length: 9 }, (_, k) => notes[i] & bit(k + 1) ? k + 1 : '').map(x => `<i>${x}</i>`).join('')}</span>` : '';
        return `<button class="${cls}" data-i="${i}" role="gridcell" aria-label="linha ${r + 1}, coluna ${c + 1}${v ? ', ' + v : ''}">${inner}</button>`;
      }).join('');
      const count = d => cells.filter(v => v === d).length;
      el.querySelectorAll('.sd-num').forEach(b => { b.disabled = count(+b.dataset.n) >= 9; });
      if (cells.every(Boolean)) {
        if (!bad.size) return finish();
        msg.textContent = 'A grade está cheia, mas tem número repetido (em vermelho). Corrija pra terminar.';
      }
    }
    function finish() {
      if (over) return;
      over = true; clearInterval(iv);
      const score = elapsed();
      el.querySelector('#t').textContent = clock(score);
      msg.textContent = `Resolvido em ${clock(score)}${hints ? ` (com ${hints} dica${hints > 1 ? 's' : ''})` : ''}!`;
      beep(880, 140, 'triangle', 0.05);
      done(score);
    }
    function put(n) {
      if (over || sel < 0 || given[sel] || hinted.has(sel)) return;
      if (noteMode && n) { if (cells[sel]) return; notes[sel] ^= bit(n); render(); return; }
      cells[sel] = n; notes[sel] = 0;
      if (n) { // número colocado some das notas da linha, coluna e bloco
        for (let i = 0; i < 81; i++) if ((((i / 9) | 0) === ((sel / 9) | 0) || i % 9 === sel % 9 || BOX(i) === BOX(sel))) notes[i] &= ~bit(n);
        beep(420 + n * 30, 40, 'triangle', 0.03);
      }
      msg.textContent = '';
      render();
    }
    function hint() {
      if (over) return;
      let i = sel >= 0 && !given[sel] && !hinted.has(sel) && cells[sel] !== solution[sel] ? sel : -1;
      if (i < 0) { const wrong = cells.map((v, k) => (!given[k] && v !== solution[k] ? k : -1)).filter(k => k >= 0); if (!wrong.length) return; i = wrong[rand(0, wrong.length - 1)]; }
      sel = i; cells[i] = solution[i]; notes[i] = 0; hinted.add(i); hints++;
      el.querySelector('#h').textContent = hints;
      msg.textContent = `Dica usada: +${HINT_COST}s no tempo.`;
      beep(660, 80, 'triangle', 0.04);
      render();
    }

    bd.addEventListener('pointerdown', e => { const c = e.target.closest('.sd-cell'); if (c) { e.preventDefault(); sel = +c.dataset.i; render(); } });
    el.querySelector('#pad').addEventListener('pointerdown', e => { const b = e.target.closest('.sd-num'); if (b && !b.disabled) { e.preventDefault(); put(+b.dataset.n); } });
    el.querySelector('#del').onclick = () => put(0);
    el.querySelector('#hint').onclick = hint;
    const noteBtn = el.querySelector('#note');
    const setNotes = on => { noteMode = on; noteBtn.setAttribute('aria-pressed', on); noteBtn.lastChild.textContent = ` Notas: ${on ? 'ligado' : 'desligado'}`; };
    noteBtn.onclick = () => setNotes(!noteMode);
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) { put(+e.key); e.preventDefault(); }
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { put(0); e.preventDefault(); }
      else if (e.key === 'n' || e.key === 'N') setNotes(!noteMode);
      else if (e.key === 'h' || e.key === 'H') hint();
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
        const next = (sel < 0 ? 40 : sel) + d;
        if (next >= 0 && next < 81 && !(d === 1 && sel % 9 === 8) && !(d === -1 && sel % 9 === 0)) { sel = next; render(); }
      }
    };
    window.addEventListener('keydown', onKey);
    iv = setInterval(() => { if (!over) el.querySelector('#t').textContent = clock(elapsed()); }, 500);
    render();
    return () => { over = true; clearInterval(iv); window.removeEventListener('keydown', onKey); };
  }
};
