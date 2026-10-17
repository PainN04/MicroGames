GAMES.ligue4 = {
  name: 'Ligue 4', icon: 'ligue4', hue: 235, desc: 'Ligue 4 peças em linha antes da máquina. Cada vitória deixa a máquina mais esperta; perdeu, acabou. Vitória rápida rende bônus. Toque numa coluna ou teclas 1–7.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    const C = 7, R = 6, YOU = 1, CPU = 2;
    const LEVELS = [['Aprendiz', 1, .35], ['Fácil', 2, .2], ['Médio', 3, .1], ['Difícil', 4, .05], ['Expert', 5, 0], ['Mestre', 6, 0]];
    let grid, turn, moves, round = 0, level = 0, pts = 0, wins = 0, busy = true, over = false, timers = [];
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Vitórias<b id="w">0</b></span><span class="stat">Nível<b id="l">Aprendiz</b></span></div>
      <p class="hint" id="h"></p>
      <div class="c4" id="c4" role="group" aria-label="Tabuleiro">${Array.from({ length: C * R }, (_, i) => `<button class="c4c" data-c="${i % C}" data-r="${Math.floor(i / C)}" aria-label="coluna ${i % C + 1}"></button>`).join('')}</div>
      <div class="row-btns" id="nx" hidden><button class="btn" id="again">Próxima rodada</button></div>`;
    const cells = [...el.querySelectorAll('.c4c')], hintEl = el.querySelector('#h');
    const at = (c, r) => cells[r * C + c];
    const say = t => { hintEl.textContent = t; };

    // ---- regras ----
    // grid[c][r], r = 0 é a linha de baixo
    const drop = (g, c, who) => { const r = g[c].indexOf(0); if (r < 0) return -1; g[c][r] = who; return r; };
    const LINES = [];
    for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const ec = c + 3 * dc, er = r + 3 * dr;
      if (ec >= 0 && ec < C && er >= 0 && er < R) LINES.push([0, 1, 2, 3].map(k => [c + k * dc, r + k * dr]));
    }
    const winner = g => { for (const l of LINES) { const v = g[l[0][0]][l[0][1]]; if (v && l.every(([c, r]) => g[c][r] === v)) return { who: v, line: l }; } return null; };
    const full = g => g.every(col => col[R - 1] !== 0);

    // ---- máquina: minimax com poda alfa-beta; a profundidade sobe com o nível ----
    const ORDER = [3, 2, 4, 1, 5, 0, 6]; // do centro pra fora: poda mais e joga melhor
    const evalBoard = (g, me) => {
      let s = 0;
      for (const l of LINES) {
        let a = 0, b = 0;
        for (const [c, r] of l) { const v = g[c][r]; if (v === me) a++; else if (v) b++; }
        if (a && b) continue;
        if (a) s += [0, 1, 4, 20, 0][a]; else if (b) s -= [0, 1, 4, 22, 0][b];
      }
      for (let r = 0; r < R; r++) if (g[3][r] === me) s += 3; else if (g[3][r]) s -= 3;
      return s;
    };
    const search = (g, depth, alpha, beta, who, me) => {
      const w = winner(g);
      if (w) return (w.who === me ? 1e6 : -1e6) * (depth + 1);
      if (!depth || full(g)) return evalBoard(g, me);
      let best = who === me ? -Infinity : Infinity;
      for (const c of ORDER) {
        if (g[c][R - 1] !== 0) continue;
        const r = drop(g, c, who);
        const v = search(g, depth - 1, alpha, beta, 3 - who, me);
        g[c][r] = 0; // desfaz
        if (who === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
        if (beta <= alpha) break;
      }
      return best;
    };
    const pickCpu = () => {
      const [, depth, slip] = LEVELS[level];
      const open = ORDER.filter(c => grid[c][R - 1] === 0);
      // nos níveis baixos às vezes joga solto (mas ainda fecha uma vitória óbvia)
      const must = open.find(c => { const g = copy(grid); drop(g, c, CPU); return winner(g); });
      if (must !== undefined) return must;
      if (Math.random() < slip) return open[rand(0, open.length - 1)];
      let best = [], bestV = -Infinity;
      for (const c of open) {
        const g = copy(grid); drop(g, c, CPU);
        const v = search(g, depth - 1, -Infinity, Infinity, YOU, CPU) + rand(0, 2);
        if (v > bestV) { bestV = v; best = [c]; } else if (v === bestV) best.push(c);
      }
      return best[rand(0, best.length - 1)];
    };
    const copy = g => g.map(col => col.slice());

    // ---- tela ----
    const paint = (c, r, who, animate) => {
      const cell = at(c, R - 1 - r);
      cell.classList.add(who === YOU ? 'you' : 'cpu');
      if (animate) { cell.style.setProperty('--fall', R - r); cell.classList.add('drop'); }
    };
    const place = (c, who) => {
      const r = drop(grid, c, who);
      moves[who]++;
      paint(c, r, who, true);
      beep(who === YOU ? 520 : 390, 70, 'triangle', 0.04);
      return r;
    };
    const newRound = () => {
      grid = Array.from({ length: C }, () => Array(R).fill(0));
      moves = { 1: 0, 2: 0 }; over = false; round++;
      cells.forEach(c => { c.className = 'c4c'; c.style.removeProperty('--fall'); });
      el.querySelector('#nx').hidden = true;
      el.querySelector('#l').textContent = LEVELS[level][0];
      // a vez de começar alterna (quem abre leva vantagem)
      turn = round % 2 ? YOU : CPU;
      if (turn === CPU) { busy = true; say('Máquina começa...'); timers.push(setTimeout(cpuPlay, 650)); }
      else { busy = false; say('Sua vez — escolha uma coluna'); }
    };
    const end = (w, line) => {
      busy = true; over = true;
      if (line) line.forEach(([c, r]) => at(c, R - 1 - r).classList.add('win'));
      if (!w) { pts += 3; el.querySelector('#p').textContent = pts; say('Empate! +3 pontos. Segue o jogo.'); beep(330, 160, 'sine'); return nextButton(); }
      if (w === YOU) {
        const gain = 10 + Math.max(0, 21 - moves[YOU]);
        pts += gain; wins++; level = Math.min(LEVELS.length - 1, level + 1);
        el.querySelector('#p').textContent = pts; el.querySelector('#w').textContent = wins;
        say(`Você ganhou! +${gain} pontos. A máquina vem mais esperta.`); sfx.record();
        return nextButton();
      }
      sfx.bad();
      say('A máquina ganhou. Fim de jogo.');
      timers.push(setTimeout(() => done(pts), 1400));
    };
    const nextButton = () => {
      el.querySelector('#nx').hidden = false;
      el.querySelector('#again').focus();
    };
    const cpuPlay = () => {
      if (over) return;
      const c = pickCpu();
      place(c, CPU);
      const w = winner(grid);
      if (w) return end(CPU, w.line);
      if (full(grid)) return end(0);
      busy = false; say('Sua vez — escolha uma coluna');
    };
    const play = c => {
      if (busy || over || c < 0 || c >= C || grid[c][R - 1] !== 0) return;
      busy = true;
      place(c, YOU);
      const w = winner(grid);
      if (w) return end(YOU, w.line);
      if (full(grid)) return end(0);
      say('Máquina pensando...');
      timers.push(setTimeout(cpuPlay, 450));
    };
    cells.forEach(cell => cell.onclick = () => play(+cell.dataset.c));
    el.querySelector('#again').onclick = newRound;
    const onKey = e => { if (/^[1-7]$/.test(e.key)) play(+e.key - 1); else if (e.key === 'Enter' && !el.querySelector('#nx').hidden) newRound(); };
    addEventListener('keydown', onKey);
    newRound();
    return () => { over = true; removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
  }
};
