GAMES.clique = {
  name: 'Clique Maluco', icon: 'mouse-pointer-click', hue: 20, desc: 'Quantos cliques você dá em 10 segundos?',
  better: 'high', unit: 'cliques',
  // Mesma regra do server.js (cheatReason). Retorna o motivo se parecer autoclicker.
  check(score, proof) {
    if (score > 200) return 'cliques demais pra um humano';
    if (proof.length >= 50) {
      const mean = proof.reduce((a, b) => a + b, 0) / proof.length;
      const sd = Math.sqrt(proof.reduce((a, b) => a + (b - mean) ** 2, 0) / proof.length);
      if (mean > 0 && sd / mean < 0.05) return 'ritmo regular demais';
    }
    return null;
  },
  start(el, done) {
    let n = 0, t0 = 0, last = 0, iv; const gaps = [], stamps = [];
    el.innerHTML = '<div class="hud"><span class="stat">Cliques<b id="n">0</b></span><span class="stat">Tempo<b id="t">10,0s</b></span></div><button class="bigbtn" id="b">CLIQUE<br>PRA COMEÇAR</button><div class="cps-bar" id="cps" aria-hidden="true"><i></i><span id="cpsv">0/s</span></div>';
    const b = el.querySelector('#b');
    b.onpointerdown = () => {
      if (!t0) {
        t0 = performance.now(); b.innerHTML = 'CLIQUE!';
        iv = setInterval(() => {
          const left = 10 - (performance.now() - t0) / 1000;
          el.querySelector('#t').textContent = dec(Math.max(0, left), 1) + 's';
          if (left <= 0) {
            clearInterval(iv);
            // cliques em cada segundo: mostra se cansou no meio
            const per = Array(10).fill(0);
            for (const t of stamps) per[Math.min(9, Math.floor(t / 1000))]++;
            const top = Math.max(1, ...per);
            summarize([['Por segundo', dec(n / 10)], ['Pico', Math.max(...per) + '/s'],
              ['Ritmo (1s a 10s)', `<span class="bars">${per.map(v => `<i style="height:${4 + v / top * 30}px" title="${v}"></i>`).join('')}</span>`]]);
            done(n, gaps);
          }
        }, 50);
      }
      const now = performance.now();
      if (now - t0 > 10000) return;
      stamps.push(now - t0);
      if (last) gaps.push(Math.round(now - last));
      last = now;
      el.querySelector('#n').textContent = ++n;
      // ondinha no clique e o número dá um pulinho
      const r = document.createElement('i'); r.className = 'ripple';
      b.append(r); setTimeout(() => r.remove(), 450);
      const nb = el.querySelector('#n'); nb.classList.remove('bump'); void nb.offsetWidth; nb.classList.add('bump');
      const recent = stamps.filter(t => t > now - t0 - 1000).length;
      el.querySelector('#cps').style.setProperty('--v', Math.min(1, recent / 14));
      el.querySelector('#cpsv').textContent = recent + '/s';
    };
    return () => clearInterval(iv);
  }
};
