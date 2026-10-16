GAMES.numeros = {
  name: 'Caça Números', icon: 'hash', hue: 110, desc: 'Aperte Começar e clique de 1 a 25 em ordem, o mais rápido possível. Erro = +0,5s.',
  better: 'low', unit: 's', decimals: 2,
  start(el, done) {
    let next = 1, miss = 0, t0 = 0, iv;
    // Grade escondida até apertar Começar: os números nem existem na página antes (nada de decorar as posições).
    el.innerHTML = `<div class="hud"><span class="stat">Próximo<b id="n">1</b></span><span class="stat">Erros<b id="m">0</b></span><span class="stat">Tempo<b id="t">0.00s</b></span></div>
      <div class="schulte-wrap"><div class="schulte hidden">${'<button class="cell" disabled aria-hidden="true">?</button>'.repeat(25)}</div>
      <button class="btn" id="go">${icon('play')} Começar</button></div>`;
    const elapsed = () => (performance.now() - t0) / 1000 + miss * 0.5;
    const cells = [...el.querySelectorAll('.cell')];
    const go = el.querySelector('#go');
    go.onclick = () => {
      const nums = Array.from({ length: 25 }, (_, i) => i + 1);
      for (let i = nums.length - 1; i > 0; i--) { const j = rand(0, i); [nums[i], nums[j]] = [nums[j], nums[i]]; }
      cells.forEach((cell, i) => { cell.dataset.n = nums[i]; cell.textContent = nums[i]; cell.disabled = false; cell.removeAttribute('aria-hidden'); });
      el.querySelector('.schulte').classList.remove('hidden');
      go.remove();
      t0 = performance.now();
      iv = setInterval(() => el.querySelector('#t').textContent = elapsed().toFixed(2) + 's', 30);
    };
    go.focus();
    cells.forEach(cell => cell.onpointerdown = e => {
      e.preventDefault();
      if (!t0) return;
      const n = +cell.dataset.n;
      if (n === next) {
        cell.classList.add('done');
        beep(380 + n * 22, 45, 'triangle', 0.04);
        if (++next > 25) {
          clearInterval(iv);
          const score = +elapsed().toFixed(2);
          el.querySelector('#t').textContent = score.toFixed(2) + 's';
          return done(score);
        }
        el.querySelector('#n').textContent = next;
      } else if (!cell.classList.contains('done')) {
        el.querySelector('#m').textContent = ++miss;
        beep(160, 90, 'square', 0.03);
        cell.classList.remove('miss'); void cell.offsetWidth; cell.classList.add('miss');
      }
    });
    return () => clearInterval(iv);
  }
};
