// Bandeira: de que país é a bandeira do dia? 6 palpites. Cada palpite errado diz a distância até o país certo,
// pra que lado ele fica e o quanto você chegou perto. Com 2 erros aparece o continente; com 4, a capital.
// O país fica no servidor (lib/diarios.js): a página só recebe o desenho da bandeira, sem nome.
GAMES.bandeira = {
  name: 'Bandeira', icon: 'bandeira', hue: 215, daily: true,
  desc: 'Descubra o país da bandeira do dia em até 6 palpites. Cada erro mostra a distância, a direção e o quanto você chegou perto; depois de 2 erros aparece o continente e, depois de 4, a capital. Uma partida por dia.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    if (needsServer(el)) return;
    const DEG = { N: 0, NE: 45, L: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315 };
    const key = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
    let v = null, busy = true, alive = true, saved = 'ok', timers = [], sel = -1, sugg = [];
    el.innerHTML = `<div class="hud"><span class="stat">Palpite<b id="bn">1/6</b></span></div>
      <div class="bd-flag" id="bf"></div>
      <div class="bd-hints" id="bh"></div>
      <form class="cx-form bd-form" id="bform" autocomplete="off"><div class="bd-in"><input class="cx-in" id="bin" placeholder="Nome do país" aria-label="Nome do país" enterkeyhint="send" role="combobox" aria-autocomplete="list" aria-controls="bsug" aria-expanded="false"><ul class="bd-sug" id="bsug" role="listbox" hidden></ul></div><button class="btn" id="bok">${icon('circle-check')} <span>Chutar</span></button></form>
      <p class="hint" id="bmsg" aria-live="polite"></p>
      <ol class="bd-list" id="bl"></ol>
      <div class="row-btns" id="bend" hidden></div>`;
    const msg = el.querySelector('#bmsg'), say = t => { msg.textContent = t; };
    const input = el.querySelector('#bin'), sugBox = el.querySelector('#bsug');
    const arrow = d => `<svg class="bd-dir" viewBox="0 0 24 24" style="--r:${DEG[d]}deg" aria-label="${d}"><path d="M12 3l6 8h-4v10h-4V11H6z" fill="currentColor"/></svg>`;
    const km = n => n.toLocaleString('pt-BR') + ' km';
    const paint = (fresh = -1) => {
      el.querySelector('#bn').textContent = `${Math.min(v.guesses.length + (v.over ? 0 : 1), v.rows)}/${v.rows}`;
      el.querySelector('#bl').innerHTML = v.guesses.map((g, k) => g.dir
        ? `<li class="bd-g${k === fresh ? ' pop' : ''}" style="--p:${g.pct}%"><b>${esc(g.nome)}</b><span>${km(g.km)}</span>${arrow(g.dir)}<span class="pct">${g.pct}%</span></li>`
        : `<li class="bd-g hit${k === fresh ? ' pop' : ''}" style="--p:100%"><b>${esc(g.nome)}</b><span>Acertou!</span></li>`).join('');
      el.querySelector('#bh').innerHTML = [v.continente && `<span class="mtitle">${icon('globe')} ${esc(v.continente)}</span>`, v.capital && `<span class="mtitle">${icon('landmark')} Capital: ${esc(v.capital)}</span>`].filter(Boolean).join('')
        || `<span class="hint">Continente depois de 2 erros, capital depois de 4</span>`;
    };
    const endPanel = () => {
      el.querySelector('#bform').hidden = true;
      const box = el.querySelector('#bend');
      box.hidden = false;
      box.innerHTML = `<p class="cx-word">${v.won ? 'Era' : 'A resposta era'} <b>${esc(v.answer)}</b></p><button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
      const share = () => `Bandeira MicroGame ${v.won ? v.guesses.length : 'X'}/${v.rows}\n` + v.guesses.map(g => (g.dir ? `${g.pct}% ${g.dir}` : 'Acertou')).join(' · ');
      box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(share()); say('Resultado copiado!'); } catch { say(share()); } };
      say(v.won ? `${v.score} pontos. Volte amanhã!` : 'Não foi dessa vez. Volte amanhã pra outra bandeira!');
    };
    say('Carregando...');
    api('api/diarios/bandeira').then(nv => {
      if (!alive) return;
      v = nv; busy = false; say('');
      el.querySelector('#bf').innerHTML = v.svg;
      paint();
      if (v.over) endPanel(); else input.focus({ preventScroll: true });
    }).catch(err => { if (alive) say(err.message); });

    // sugestões: nomes que começam com o que foi digitado primeiro, depois os que contêm
    const paintSugg = () => {
      const q = key(input.value);
      const tried = new Set((v?.guesses || []).map(g => g.nome));
      sugg = !q || !v ? [] : [...v.names.filter(n => key(n).startsWith(q)), ...v.names.filter(n => !key(n).startsWith(q) && key(n).includes(q))].filter(n => !tried.has(n)).slice(0, 6);
      if (sel >= sugg.length) sel = sugg.length - 1;
      sugBox.hidden = !sugg.length;
      input.setAttribute('aria-expanded', String(!!sugg.length));
      sugBox.innerHTML = sugg.map((n, k) => `<li role="option" data-n="${esc(n)}" class="${k === sel ? 'on' : ''}" aria-selected="${k === sel}">${esc(n)}</li>`).join('');
      sugBox.querySelectorAll('li').forEach(li => li.onpointerdown = e => { e.preventDefault(); input.value = li.dataset.n; sugg = []; sugBox.hidden = true; submit(); });
    };
    input.addEventListener('input', () => { sel = -1; paintSugg(); });
    input.addEventListener('blur', () => timers.push(setTimeout(() => { sugBox.hidden = true; }, 150)));
    input.addEventListener('keydown', e => {
      if (!sugg.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % sugg.length; paintSugg(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + sugg.length) % sugg.length; paintSugg(); }
      else if (e.key === 'Escape') { sugg = []; sugBox.hidden = true; }
    });
    const submit = async () => {
      if (busy || !v || v.over) return;
      let guess = input.value.trim();
      if (sel >= 0 && sugg[sel]) guess = sugg[sel];
      else if (sugg.length === 1 || (sugg.length && key(sugg[0]) === key(guess))) guess = sugg[0];
      if (!guess) return;
      busy = true;
      let nv;
      try { nv = await api('api/diarios/bandeira', { method: 'POST', body: { guess } }); }
      catch (err) { if (!alive) return; busy = false; say(err.message); input.classList.remove('nope'); void input.offsetWidth; input.classList.add('nope'); return; }
      if (!alive) return;
      busy = false; input.value = ''; sel = -1; paintSugg();
      if (nv.result?.repeat) { say(`Você já chutou ${nv.result.repeat}`); return; }
      v = nv; if (nv.saved) saved = nv.saved;
      paint(v.guesses.length - 1);
      const last = v.guesses.at(-1);
      if (v.won) { sfx.record(); summarize([['Palpites', `${v.guesses.length}/${v.rows}`]]); busy = true; timers.push(setTimeout(() => alive && done(v.score, { saved }), 1000)); }
      else if (v.over) { sfx.bad(); endPanel(); }
      else { say(`${last.nome}: ${km(last.km)} pra ${{ N: 'o norte', NE: 'o nordeste', L: 'o leste', SE: 'o sudeste', S: 'o sul', SO: 'o sudoeste', O: 'o oeste', NO: 'o noroeste' }[last.dir]}`); last.pct > 80 ? sfx.good() : beep(240, 80, 'triangle', 0.025); }
    };
    el.querySelector('#bform').onsubmit = e => { e.preventDefault(); submit(); };
    return () => { alive = false; timers.forEach(clearTimeout); };
  }
};
