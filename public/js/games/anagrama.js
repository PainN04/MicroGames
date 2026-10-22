GAMES.anagrama = {
  name: 'Anagrama', icon: 'spell-check', hue: 60, desc: 'Desembaralhe as palavras em 60s. Digite e Enter (ou clique nas letras). Palavra maior vale mais. A dica acima das letras diz o tema da palavra. Pular não custa ponto; o botão Letra revela uma letra e tira 1 ponto da palavra.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    // as palavras ficam no servidor (lib/words.js): a página só recebe as letras embaralhadas e manda o palpite
    if (needsServer(el)) return;
    const DUR = 60;
    let round = null, pts = 0, solved = 0, t0 = 0, iv, over = false, alive = true, busy = false;
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Palavras<b id="w">0</b></span><span class="stat">Tempo<b id="t">60s</b></span></div>
      <p class="hint anag-clue" id="clue"></p>
      <div class="tiles" id="tiles"></div>
      <input class="txt" id="in" placeholder="digite a palavra + Enter" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-label="Palavra">
      <div class="row-btns"><button class="btn ghost" id="clr">${icon('delete')} Apagar</button><button class="btn ghost" id="tip">${icon('lightbulb')} Letra (−1)</button><button class="btn ghost" id="skip">Pular ${icon('skip-forward')}</button></div>`;
    const inp = el.querySelector('#in'), tilesEl = el.querySelector('#tiles'), clueEl = el.querySelector('#clue');
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    const syncTiles = () => {
      // marca como usadas as letras que já estão digitadas
      const typed = [...norm(inp.value)];
      tilesEl.querySelectorAll('.tile').forEach(t => {
        const k = typed.indexOf(t.dataset.l);
        t.classList.toggle('used', k >= 0);
        if (k >= 0) typed.splice(k, 1);
      });
    };
    // a dica (tema da palavra) vem do servidor junto com as letras
    const showMix = ({ mix, clue }) => {
      clueEl.innerHTML = clue ? `Dica: <b>${clue}</b>` : '';
      tilesEl.innerHTML = [...mix].map((l, i) => `<button class="tile enter" style="--i:${i * 0.04}s" data-l="${l}">${l}</button>`).join('');
      tilesEl.querySelectorAll('.tile').forEach(t => t.onclick = () => { flyTo(t, inp, t.dataset.l); inp.value += t.dataset.l; syncTiles(); inp.focus(); });
      inp.value = '';
    };
    const call = body => api('api/rounds/' + round, { method: 'POST', body });
    const oops = err => { if (alive && !over) { el.querySelector('#t').textContent = '!'; inp.placeholder = err.message; } };
    // dica: o servidor manda as primeiras letras certas (uma a mais a cada toque)
    const tip = async () => {
      if (over || busy || !round) return;
      busy = true;
      try { const { result } = await call({ action: 'hint' }); if (!over) { inp.value = result.prefix; syncTiles(); inp.focus(); beep(520, 60, 'sine', 0.03); } }
      catch (err) { oops(err); }
      busy = false;
    };
    const startClock = () => {
      if (t0) return;
      t0 = performance.now();
      iv = setInterval(async () => {
        const left = DUR - (performance.now() - t0) / 1000;
        el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
        if (left <= 0 && !over) {
          over = true; clearInterval(iv); inp.disabled = true;
          let saved;
          try { const r = await call({ action: 'finish' }); pts = r.final; saved = r.saved; } catch (err) { saved = err.message; }
          if (alive) done(pts, { saved });
        }
      }, 100);
    };
    const submit = async () => {
      if (over || busy) return;
      const guess = norm(inp.value);
      if (!guess) return;
      busy = true;
      let r;
      try { r = await call({ action: 'answer', guess }); } catch (err) { busy = false; return oops(err); }
      busy = false;
      if (over || !alive) return;
      if (r.result.ok) {
        pts = r.view.pts; solved = r.view.solved;
        popPoints(tilesEl, '+' + r.result.gain); confetti(inp);
        el.querySelector('#p').textContent = pts; el.querySelector('#w').textContent = solved;
        sfx.good();
        showMix(r.view);
      } else {
        beep(160, 120, 'square', 0.03);
        inp.classList.remove('wrong'); void inp.offsetWidth; inp.classList.add('wrong');
      }
    };
    inp.oninput = () => syncTiles();
    inp.onkeydown = e => { if (e.key === 'Enter') submit(); };
    el.querySelector('#clr').onclick = () => { inp.value = ''; syncTiles(); inp.focus(); };
    el.querySelector('#tip').onclick = tip;
    el.querySelector('#skip').onclick = async () => {
      if (over || busy || !round) return;
      busy = true; beep(300, 50, 'sine', 0.02);
      try { const r = await call({ action: 'skip' }); if (!over) showMix(r.view); } catch (err) { oops(err); }
      busy = false; inp.focus();
    };
    // o tempo começa quando o servidor abre a partida (logo depois da contagem 3, 2, 1)
    api('api/rounds', { method: 'POST', body: { game: 'anagrama', daily: dailySeeded } })
      .then(r => { if (!alive) return; round = r.id; showMix(r.view); inp.focus(); startClock(); })
      .catch(oops);
    return () => { alive = false; over = true; clearInterval(iv); };
  }
};
