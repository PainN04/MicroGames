GAMES.matematica = {
  name: 'Conta Rápida', icon: 'divide', hue: 200, desc: 'Resolva o máximo de contas em 30s. Enter pra enviar.',
  better: 'high', unit: 'acertos',
  start(el, done) {
    let ok = 0, ans, t0 = 0, iv;
    el.innerHTML = '<div class="hud"><span class="stat">Acertos<b id="ok">0</b></span><span class="stat">Tempo<b id="t">30s</b></span></div><div class="math" id="q" aria-live="polite"></div><input class="txt" id="in" inputmode="numeric" placeholder="resposta + Enter" autocomplete="off" aria-label="Resposta">';
    const q = el.querySelector('#q'), inp = el.querySelector('#in');
    function gen() {
      const op = ['+', '-', '×'][rand(0, 2)];
      let a = rand(2, 50), b = rand(2, 50);
      if (op === '×') { a = rand(2, 12); b = rand(2, 12); }
      if (op === '-' && b > a) [a, b] = [b, a];
      ans = op === '+' ? a + b : op === '-' ? a - b : a * b;
      q.textContent = `${a} ${op} ${b}`;
    }
    inp.onkeydown = e => {
      if (e.key !== 'Enter' || inp.value === '') return;
      if (!t0) {
        t0 = performance.now();
        iv = setInterval(() => {
          const left = 30 - (performance.now() - t0) / 1000;
          el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
          if (left <= 0) { clearInterval(iv); inp.disabled = true; done(ok); }
        }, 100);
      }
      const right = +inp.value === ans;
      if (right) { el.querySelector('#ok').textContent = ++ok; sfx.good(); } else beep(160, 120, 'square', 0.03);
      inp.classList.remove('wrong', 'right'); void inp.offsetWidth; inp.classList.add(right ? 'right' : 'wrong');
      inp.value = ''; gen();
    };
    gen(); inp.focus();
    return () => clearInterval(iv);
  }
};
