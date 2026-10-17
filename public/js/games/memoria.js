GAMES.memoria = {
  name: 'Memória', icon: 'brain', hue: 330, desc: 'Repita a sequência de cores. Quanto mais longe, melhor.',
  better: 'high', unit: 'rodadas',
  start(el, done) {
    const colors = ['--green', '--red', '--yellow', '--blue'];
    const seq = []; let pos = 0, busy = true, timers = [];
    el.innerHTML = '<div class="hud"><span class="stat">Rodada<b id="r">0</b></span></div><p class="hint" id="h">Observe...</p><div class="simon">' +
      colors.map((c, k) => `<button class="pad" data-k="${k}" aria-label="cor ${k + 1}" style="background:var(${c});color:var(${c})"></button>`).join('') + '</div>';
    const pads = [...el.querySelectorAll('.pad')];
    const TONES = [330, 262, 392, 196]; // um tom por cor, estilo Genius
    const flash = (k, ms = 350) => {
      pads[k].classList.add('lit'); beep(TONES[k], ms, 'triangle');
      timers.push(setTimeout(() => pads[k].classList.remove('lit'), ms));
    };
    function next() {
      seq.push(rand(0, 3)); pos = 0; busy = true;
      el.querySelector('#r').textContent = seq.length;
      el.querySelector('#h').textContent = 'Observe...';
      const step = Math.max(300, 600 - seq.length * 20);
      seq.forEach((k, j) => timers.push(setTimeout(() => flash(k, step * .7), 600 + j * step)));
      timers.push(setTimeout(() => { busy = false; el.querySelector('#h').textContent = 'Sua vez!'; }, 600 + seq.length * step));
    }
    pads.forEach(p => p.onpointerdown = () => {
      if (busy) return;
      const k = +p.dataset.k;
      if (k !== seq[pos]) {
        busy = true; sfx.bad(); pads[seq[pos]].classList.add('lit'); // mostra qual era a certa
        return timers.push(setTimeout(() => done(seq.length - 1), 700));
      }
      flash(k, 200);
      if (++pos === seq.length) { busy = true; timers.push(setTimeout(next, 500)); }
    });
    next();
    return () => timers.forEach(clearTimeout);
  }
};
