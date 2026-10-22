GAMES.quiz = {
  name: 'Quiz de TI', icon: 'lightbulb', hue: 200, desc: 'Mais de 150 perguntas de TI e de escritório, 4 alternativas, 60s. Acertos seguidos fazem combo (até x4). Erro tira 1 ponto, zera o combo e mostra a certa.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    // as perguntas e respostas ficam no servidor (lib/words.js): a página recebe uma pergunta por vez e manda a escolha
    if (needsServer(el)) return;
    const DUR = 60;
    let rights = 0, wrongs = 0, bestStreak = 0, round = null, alive = true;
    let pts = 0, t0 = 0, iv, over = false, lock = true, wait;
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat combo">Combo<b id="cb">x1</b></span><span class="stat">Tempo<b id="t">60s</b></span></div>
      <div class="timebar" aria-hidden="true"><i id="tb"></i></div>
      <p class="quiz-q" id="q" aria-live="polite"></p>
      <div class="choices quiz">${[0, 1, 2, 3].map(k => `<button class="btn ghost" data-k="${k}"><span></span> <kbd>${k + 1}</kbd></button>`).join('')}</div>
      <p class="hint">Teclas 1–4 também valem.</p>`;
    const qEl = el.querySelector('#q'), btns = [...el.querySelectorAll('.choices .btn')], combo = makeCombo(el.querySelector('#cb'));
    // mostra a pergunta que o servidor mandou (o servidor não diz qual é a certa até a pessoa responder)
    function show(v) {
      qEl.textContent = v.q;
      // pergunta entra e as alternativas viram como cartas, uma depois da outra
      qEl.classList.remove('qin'); void qEl.offsetWidth; qEl.classList.add('qin');
      btns.forEach((b, k) => { b.classList.remove('right', 'wrong', 'flip'); b.querySelector('span').textContent = v.opts[k]; b.style.setProperty('--d', k * 0.05 + 's'); void b.offsetWidth; b.classList.add('flip'); });
      lock = false;
    }
    const call = body => api('api/rounds/' + round, { method: 'POST', body });
    const oops = err => { if (alive && !over) qEl.textContent = err.message; };
    const startClock = () => {
        t0 = performance.now();
        iv = setInterval(async () => {
          const left = DUR - (performance.now() - t0) / 1000;
          el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
          const bar = el.querySelector('#tb'); bar.style.transform = `scaleX(${Math.max(0, left / DUR)})`; bar.classList.toggle('low', left < 10);
          if (left <= 0 && !over) {
            over = true; clearInterval(iv); clearTimeout(wait);
            let saved;
            try { const r = await call({ action: 'finish' }); pts = r.final; saved = r.saved; ({ rights, wrongs, best: bestStreak } = r.result); } catch (err) { saved = err.message; }
            if (!alive) return;
            summarize([['Acertos', rights], ['Erros', wrongs], ['Precisão', rights + wrongs ? Math.round(rights / (rights + wrongs) * 100) + '%' : '—'], ['Maior sequência', bestStreak]]);
            done(pts, { saved });
          }
        }, 100);
    };
    async function answer(k) {
      if (over || lock || !round) return;
      lock = true;
      let r;
      try { r = await call({ action: 'answer', choice: k }); } catch (err) { lock = false; return oops(err); }
      if (over || !alive) return;
      const { result, view } = r;
      if (result.ok) { combo.hit(); pts = view.pts; rights++; bestStreak = Math.max(bestStreak, combo.streak); sfx.good(); popPoints(btns[k], '+' + result.gain); show(view); }
      else {
        // mostra a certa por um instante: ensina e evita ficar chutando rápido
        combo.miss(); wrongs++;
        pts = view.pts;
        popPoints(btns[k], '−1', 'bad');
        beep(160, 120, 'square', 0.03);
        btns[k].classList.add('wrong'); btns[result.right].classList.add('right');
        wait = setTimeout(() => show(view), 1300);
      }
      el.querySelector('#p').textContent = pts;
    }
    btns.forEach(b => b.onpointerdown = e => { e.preventDefault(); answer(+b.dataset.k); });
    const onKey = e => { const k = +e.key - 1; if (k >= 0 && k < 4 && !e.repeat) answer(k); };
    window.addEventListener('keydown', onKey);
    // o tempo começa quando o servidor abre a partida (logo depois da contagem 3, 2, 1)
    api('api/rounds', { method: 'POST', body: { game: 'quiz', daily: dailySeeded } })
      .then(r => { if (!alive) return; round = r.id; show(r.view); startClock(); })
      .catch(oops);
    return () => { alive = false; over = true; clearInterval(iv); clearTimeout(wait); window.removeEventListener('keydown', onKey); };
  }
};
