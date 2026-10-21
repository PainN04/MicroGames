GAMES.matematica = {
  name: 'Conta Rápida', icon: 'divide', hue: 200, desc: 'Resolva o máximo de contas em 30s. A resposta vai sozinha quando tem os dígitos certos (ou Enter). Com combo alto as contas ficam mais difíceis. Acertos seguidos fazem combo: a cada 5 sobe o multiplicador (até x4); errar zera.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    let ok = 0, ans, t0 = 0, iv, rights = 0, wrongs = 0, bestStreak = 0;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="ok">0</b></span><span class="stat combo">Combo<b id="cb">x1</b></span><span class="stat">Tempo<b id="t">30s</b></span></div><div class="math" id="q" aria-live="polite"></div><input class="txt" id="in" inputmode="numeric" placeholder="resposta + Enter" autocomplete="off" aria-label="Resposta">';
    const q = el.querySelector('#q'), inp = el.querySelector('#in'), combo = makeCombo(el.querySelector('#cb'));
    // com o combo alto as contas ficam mais difíceis: números maiores e divisão (sempre exata)
    function gen() {
      const hard = combo.mult >= 3;
      const op = (hard ? ['+', '-', '×', '÷'] : ['+', '-', '×'])[rand(0, hard ? 3 : 2)];
      let a = rand(2, hard ? 99 : 50), b = rand(2, hard ? 99 : 50);
      if (op === '×') { a = rand(2, hard ? 15 : 12); b = rand(2, 12); }
      if (op === '÷') { b = rand(2, 12); a = b * rand(2, 12); }
      if (op === '-' && b > a) [a, b] = [b, a];
      ans = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : a / b;
      q.textContent = `${a} ${op} ${b}`;
    }
    // envia sozinho quando a resposta tem o mesmo número de dígitos da certa (no celular não precisa do Enter)
    inp.oninput = () => { inp.value = inp.value.replace(/\D/g, ''); if (inp.value.length >= String(ans).length) submit(); };
    inp.onkeydown = e => { if (e.key === 'Enter' && inp.value !== '') submit(); };
    const submit = () => {
      if (!t0) {
        t0 = performance.now();
        iv = setInterval(() => {
          const left = 30 - (performance.now() - t0) / 1000;
          el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
          if (left <= 0) {
            clearInterval(iv); inp.disabled = true;
            summarize([['Acertos', rights], ['Erros', wrongs], ['Maior sequência', bestStreak], ['Contas por minuto', (rights + wrongs) * 2]]);
            done(ok);
          }
        }, 100);
      }
      const right = +inp.value === ans;
      if (right) { const m = combo.hit(); ok += m; rights++; bestStreak = Math.max(bestStreak, combo.streak); el.querySelector('#ok').textContent = ok; sfx.good(); popPoints(q, '+' + m); }
      else { combo.miss(); wrongs++; beep(160, 120, 'square', 0.03); popPoints(q, String(ans), 'bad'); }
      inp.classList.remove('wrong', 'right'); void inp.offsetWidth; inp.classList.add(right ? 'right' : 'wrong');
      inp.value = ''; gen();
    };
    gen(); inp.focus();
    return () => clearInterval(iv);
  }
};
