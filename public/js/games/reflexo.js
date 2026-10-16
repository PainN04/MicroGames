GAMES.reflexo = {
  name: 'Reflexo', icon: 'zap', hue: 92, desc: 'Clique (ou Espaço) quando ficar verde. Média de 3 rodadas. Clicou antes? Recomeça do zero!',
  better: 'low', unit: 'ms',
  start(el, done) {
    let times = [], timer, startAt, state;
    el.innerHTML = '<div class="hud"><span class="stat">Rodada<b id="rd"></b></span></div><button class="reflex" id="rx"></button>';
    const box = el.querySelector('#rx');
    const set = (cls, txt) => { box.className = 'reflex ' + cls; box.textContent = txt; };
    function wait() {
      state = 'wait';
      el.querySelector('#rd').textContent = `${times.length + 1}/3`;
      set('wait', 'Espere o verde...');
      timer = setTimeout(() => { state = 'go'; startAt = performance.now(); set('go', 'CLIQUE!'); }, rand(1500, 4000));
    }
    // pointerdown = mouse e toque; Espaço/Enter também valem (sem repetição de tecla segurada)
    box.onkeydown = e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } };
    box.onpointerdown = () => press();
    // Anti-spam: clicar antes do verde zera as 3 rodadas e trava os cliques por 1s
    // — senão compensava ficar metralhando o botão até pegar um tempo bom.
    let lockedUntil = 0;
    const early = msg => {
      clearTimeout(timer);
      times = [];
      state = 'early';
      lockedUntil = performance.now() + 1000;
      sfx.bad();
      set('early', `${msg} Recomeçando do zero — clique pra tentar de novo.`);
      el.querySelector('#rd').textContent = '1/3';
    };
    const press = () => {
      if (state === 'wait') early('Cedo demais!');
      else if (state === 'early') { if (performance.now() >= lockedUntil) wait(); }
      else if (state === 'go') {
        times.push(Math.round(performance.now() - startAt));
        if (times.length === 3) return done(Math.round(times.reduce((a, b) => a + b) / 3));
        state = 'between'; set('between', `${times.at(-1)} ms — clique pra próxima`);
      } else if (state === 'between') wait();
    };
    wait();
    box.focus();
    return () => clearTimeout(timer);
  }
};
