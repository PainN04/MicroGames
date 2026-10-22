GAMES.cores = {
  name: 'Cor Certa', icon: 'palette', hue: 310, desc: 'Clique na COR da tinta, não no que está escrito. 30s. Acertos seguidos fazem combo: a cada 5 sobe o multiplicador (até x4). Erro tira 1 ponto e zera o combo. Depois de 15s, quando a palavra aparece numa moldura, vale o que está ESCRITO.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    const C = [['VERMELHO', '--red'], ['AZUL', '--blue'], ['VERDE', '--green'], ['AMARELO', '--yellow']];
    let ok = 0, ink = -1, want = -1, t0 = 0, iv, over = false, rights = 0, wrongs = 0, bestStreak = 0;
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="ok">0</b></span><span class="stat combo">Combo<b id="cb">x1</b></span><span class="stat">Tempo<b id="t">30s</b></span></div>
      <p class="hint" id="rule">Qual é a <b>cor da tinta</b>? (teclas 1–4 também valem)</p>
      <div class="stroop-word" id="w" aria-live="polite"></div>
      <div class="choices">${C.map(([n], k) => `<button class="btn ghost" data-k="${k}">${n} <kbd>${k + 1}</kbd></button>`).join('')}</div>`;
    const w = el.querySelector('#w'), combo = makeCombo(el.querySelector('#cb'));
    function next() {
      // 75% das vezes a palavra e a tinta não batem (é aí que o cérebro tropeça); nunca repete a mesma tinta
      let word, inkK;
      do {
        word = rand(0, 3);
        inkK = Math.random() < 0.75 ? (word + rand(1, 3)) % 4 : word;
      } while (inkK === ink);
      ink = inkK;
      w.textContent = C[word][0];
      w.style.animation = 'none'; void w.offsetWidth; w.style.animation = ''; // a palavra nova entra com um pulinho
      w.style.color = `var(${C[inkK][1]})`;
      // depois de 15s, de vez em quando a regra vira: vale o que está ESCRITO (a palavra ganha uma moldura)
      const flip = t0 && (performance.now() - t0) / 1000 > 15 && word !== inkK && Math.random() < 0.3;
      want = flip ? word : inkK;
      w.classList.toggle('flip', flip);
      el.querySelector('#rule').innerHTML = flip ? 'Agora vale o que está <b>ESCRITO</b>!' : 'Qual é a <b>cor da tinta</b>? (teclas 1–4 também valem)';
    }
    function answer(k) {
      if (over) return;
      if (k === want) { const m = combo.hit(); ok += m; rights++; bestStreak = Math.max(bestStreak, combo.streak); sfx.good(); popPoints(w, '+' + m); }
      else {
        combo.miss(); wrongs++;
        ok = Math.max(0, ok - 1);
        popPoints(w, '−1', 'bad');
        beep(160, 120, 'square', 0.03);
        w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
      }
      el.querySelector('#ok').textContent = ok;
      next();
    }
    el.querySelectorAll('.choices .btn').forEach(b => b.onpointerdown = e => { e.preventDefault(); answer(+b.dataset.k); });
    const onKey = e => { const k = +e.key - 1; if (k >= 0 && k < 4 && !e.repeat) answer(k); };
    window.addEventListener('keydown', onKey);
    // o tempo começa já (depois da contagem 3, 2, 1)
    const startTimer = () => {
      if (t0) return;
      t0 = performance.now();
      iv = setInterval(() => {
        const left = 30 - (performance.now() - t0) / 1000;
        el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
        if (left <= 0) {
          over = true; clearInterval(iv);
          summarize([['Acertos', rights], ['Erros', wrongs], ['Maior sequência', bestStreak]]);
          done(ok);
        }
      }, 100);
    };
    next();
    startTimer();
    return () => { clearInterval(iv); window.removeEventListener('keydown', onKey); };
  }
};
