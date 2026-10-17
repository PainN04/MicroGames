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
    let n = 0, t0 = 0, last = 0, iv; const gaps = [];
    el.innerHTML = '<div class="hud"><span class="stat">Cliques<b id="n">0</b></span><span class="stat">Tempo<b id="t">10.0s</b></span></div><button class="bigbtn" id="b">CLIQUE<br>PRA COMEÇAR</button>';
    const b = el.querySelector('#b');
    b.onpointerdown = () => {
      if (!t0) {
        t0 = performance.now(); b.innerHTML = 'CLIQUE!';
        iv = setInterval(() => {
          const left = 10 - (performance.now() - t0) / 1000;
          el.querySelector('#t').textContent = Math.max(0, left).toFixed(1) + 's';
          if (left <= 0) { clearInterval(iv); done(n, gaps); }
        }, 50);
      }
      const now = performance.now();
      if (last) gaps.push(Math.round(now - last));
      last = now;
      el.querySelector('#n').textContent = ++n;
    };
    return () => clearInterval(iv);
  }
};
