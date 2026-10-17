GAMES.cores = {
  name: 'Cor Certa', icon: 'palette', hue: 310, desc: 'Clique na COR da tinta, não no que está escrito. 30s. Erro tira 1 ponto.',
  better: 'high', unit: 'acertos',
  start(el, done) {
    const C = [['VERMELHO', '--red'], ['AZUL', '--blue'], ['VERDE', '--green'], ['AMARELO', '--yellow']];
    let ok = 0, ink = -1, t0 = 0, iv, over = false;
    el.innerHTML = `<div class="hud"><span class="stat">Acertos<b id="ok">0</b></span><span class="stat">Tempo<b id="t">30s</b></span></div>
      <p class="hint">Qual é a <b>cor da tinta</b>? (teclas 1–4 também valem)</p>
      <div class="stroop-word" id="w" aria-live="polite"></div>
      <div class="choices">${C.map(([n], k) => `<button class="btn ghost" data-k="${k}">${n} <kbd>${k + 1}</kbd></button>`).join('')}</div>`;
    const w = el.querySelector('#w');
    function next() {
      // 75% das vezes a palavra e a tinta não batem (é aí que o cérebro tropeça); nunca repete a mesma tinta
      let word, inkK;
      do {
        word = rand(0, 3);
        inkK = Math.random() < 0.75 ? (word + rand(1, 3)) % 4 : word;
      } while (inkK === ink);
      ink = inkK;
      w.textContent = C[word][0];
      w.style.color = `var(${C[inkK][1]})`;
    }
    function answer(k) {
      if (over) return;
      if (!t0) {
        t0 = performance.now();
        iv = setInterval(() => {
          const left = 30 - (performance.now() - t0) / 1000;
          el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
          if (left <= 0) { over = true; clearInterval(iv); done(ok); }
        }, 100);
      }
      if (k === ink) { ok++; sfx.good(); }
      else {
        ok = Math.max(0, ok - 1);
        beep(160, 120, 'square', 0.03);
        w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
      }
      el.querySelector('#ok').textContent = ok;
      next();
    }
    el.querySelectorAll('.choices .btn').forEach(b => b.onpointerdown = e => { e.preventDefault(); answer(+b.dataset.k); });
    const onKey = e => { const k = +e.key - 1; if (k >= 0 && k < 4 && !e.repeat) answer(k); };
    window.addEventListener('keydown', onKey);
    next();
    return () => { clearInterval(iv); window.removeEventListener('keydown', onKey); };
  }
};
