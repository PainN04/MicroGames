// Dueto, Quarteto e Octeto: o Termo com 2, 4 ou 8 palavras ao mesmo tempo. Cada tentativa vale pra todos os quadros; quadro
// acertado para de receber tentativas. As palavras ficam no servidor (lib/diarios.js): cada tentativa vai pra lá e
// volta com as cores de cada quadro. O teclado mostra a cor de cada quadro num pedaço da tecla.
function multiTermo(id, n, rows) {
  return {
    name: { 2: 'Dueto', 4: 'Quarteto', 8: 'Octeto' }[n], icon: id, hue: { 2: 190, 4: 285, 8: 25 }[n], daily: true,
    desc: `${n} palavras de 5 letras ao mesmo tempo, ${rows} tentativas, iguais pra todo mundo. Cada palpite vale pra todos os quadros. Uma partida por dia: menos tentativas e mais rápido rende mais pontos.`,
    better: 'high', unit: 'pontos',
    start(el, done) {
      if (needsServer(el)) return;
      const LEN = 5, EMOJI = { g: '🟩', y: '🟨', x: '⬛' }, COLOR = { g: 'var(--green)', y: 'var(--yellow)', x: 'oklch(40% .02 270)' };
      const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
      let v = null, cur = '', busy = true, alive = true, timers = [], saved = 'ok';
      el.innerHTML = `<div class="hud"><span class="stat">Tentativa<b id="n">1/${rows}</b></span><span class="stat">Acertos<b id="ok">0/${n}</b></span></div>
        <div class="mt-wrap"><div class="mt mt${n}" id="mt">${Array.from({ length: n }, (_, b) => `<div class="mt-b" data-b="${b}"><div class="tm">${Array.from({ length: rows * LEN }, () => '<div class="tm-t"></div>').join('')}</div><div class="mt-w" hidden></div></div>`).join('')}</div></div>
        <p class="hint" id="tmsg" aria-live="polite"></p>
        <div class="tm-kb" id="kb">${['QWERTYUIOP', 'ASDFGHJKL', '↵ZXCVBNM⌫'].map(r => `<div>${[...r].map(k => `<button class="tm-k${k === '↵' || k === '⌫' ? ' wide' : ''}" data-k="${k}" ${k === '↵' ? 'aria-label="Enviar"' : k === '⌫' ? 'aria-label="Apagar"' : ''}>${k}</button>`).join('')}</div>`).join('')}</div>
        <div class="row-btns" id="tmend" hidden></div>`;
      const boards = [...el.querySelectorAll('.mt-b')].map(b => ({ el: b, tiles: [...b.querySelectorAll('.tm-t')], word: b.querySelector('.mt-w') }));
      const msg = el.querySelector('#tmsg'), say = t => { msg.textContent = t; };
      const tries = () => v.guesses.length;
      const paintTile = (t, ch, res, animate, i) => {
        t.textContent = ch;
        if (animate) { t.style.setProperty('--d', i * 0.18 + 's'); t.classList.add('flip'); timers.push(setTimeout(() => t.classList.add(res), i * 180 + 250)); }
        else t.classList.add(res);
      };
      const paintRow = (b, r, animate) => {
        const row = v.boards[b].rows[r];
        if (!row) return;
        for (let i = 0; i < LEN; i++) paintTile(boards[b].tiles[r * LEN + i], row.letters[i], row.res[i], animate, i);
      };
      // tecla com um pedaço por quadro (cor da melhor informação daquela letra em cada quadro)
      const paintKeys = () => {
        const rank = { x: 1, y: 2, g: 3 };
        el.querySelectorAll('.tm-k[data-k]').forEach(k => {
          const l = k.dataset.k;
          if (l.length !== 1 || !/[A-Z]/.test(l)) return;
          const per = v.boards.map(bd => {
            if (bd.solved) return 'done';
            let best = null;
            for (const row of bd.rows) [...row.guess].forEach((ch, i) => { if (ch === l && (!best || rank[row.res[i]] > rank[best])) best = row.res[i]; });
            return best;
          });
          k.style.background = ''; k.classList.remove('x', 'mt-k');
          if (!per.some(p => p && p !== 'done')) return;
          if (per.every(p => p === 'x' || p === 'done')) { k.classList.add('x'); return; }
          const c = p => (p === 'g' || p === 'y' || p === 'x' ? COLOR[p] : 'var(--surface-2)');
          k.classList.add('mt-k');
          // 2 quadros: metade e metade; 4: 2×2; 8: duas faixas de 4
          const stripe = list => `linear-gradient(to right, ${list.map((p, i) => `${c(p)} ${(i * 100) / list.length}% ${((i + 1) * 100) / list.length}%`).join(', ')})`;
          k.style.background = n === 2 ? stripe(per)
            : `${stripe(per.slice(0, n / 2))} top / 100% 50% no-repeat, ${stripe(per.slice(n / 2))} bottom / 100% 50% no-repeat`;
        });
      };
      const showCur = () => {
        v.boards.forEach((bd, b) => {
          if (bd.solved) return;
          const r = bd.rows.length;
          for (let i = 0; i < LEN; i++) { const t = boards[b].tiles[r * LEN + i]; if (!t) return; t.textContent = cur[i] || ''; t.classList.toggle('on', !!cur[i]); }
        });
      };
      const paintHud = () => {
        el.querySelector('#n').textContent = Math.min(tries() + (v.over ? 0 : 1), rows) + '/' + rows;
        el.querySelector('#ok').textContent = v.boards.filter(b => b.solved).length + '/' + n;
        v.boards.forEach((bd, b) => {
          boards[b].el.classList.toggle('solved', bd.solved);
          if (bd.word && (bd.solved || v.over)) { boards[b].word.hidden = false; boards[b].word.textContent = bd.word; boards[b].word.classList.toggle('miss', !bd.solved); }
        });
      };
      const shareText = () => {
        const lines = v.boards.map(bd => (bd.solved ? bd.rows.length : 'X'));
        const per = n === 8 ? 4 : 2;
        return `${GAMES[id].name} MicroGame ${v.won ? tries() : 'X'}/${rows}\n` + Array.from({ length: n / per }, (_, r) => lines.slice(r * per, r * per + per).join(' · ')).join('\n')
          + '\n' + v.boards.map(bd => bd.rows.at(-1)?.res.map(c => EMOJI[c]).join('') || '').join(' ');
      };
      const endPanel = () => {
        el.querySelector('#kb').hidden = true;
        const box = el.querySelector('#tmend');
        box.hidden = false;
        box.innerHTML = `<button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
        say(v.won ? `Acertou todas em ${tries()}/${rows}: ${v.score} pontos. Volte amanhã!` : `Não foi dessa vez. Volte amanhã pra palavras novas!`);
        box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(shareText()); say('Resultado copiado!'); } catch { say(shareText().replace(/\n/g, ' · ')); } };
      };
      const paintAll = () => { v.boards.forEach((bd, b) => bd.rows.forEach((_, r) => paintRow(b, r, false))); paintKeys(); paintHud(); };

      say('Carregando...');
      api('api/diarios/' + id).then(view => {
        if (!alive) return;
        v = view; paintAll(); say(''); busy = false;
        if (v.over) endPanel(); else showCur();
      }).catch(err => { if (alive) say(err.message); });

      const shake = () => {
        v.boards.forEach((bd, b) => {
          if (bd.solved) return;
          const r = bd.rows.length;
          boards[b].tiles.slice(r * LEN, r * LEN + LEN).forEach(t => { t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope'); });
        });
        beep(160, 100, 'square', 0.03);
      };
      const submit = async () => {
        if (busy) return;
        if (cur.length < LEN) { say('Faltam letras'); shake(); return; }
        busy = true;
        const before = v.boards.map(bd => bd.rows.length);
        let nv;
        try { nv = await api('api/diarios/' + id, { method: 'POST', body: { guess: cur } }); }
        catch (err) { if (!alive) return; busy = false; say(err.message); if (err.status === 422 || err.status === 400) shake(); return; }
        if (!alive) return;
        v = nv; cur = '';
        if (v.saved) saved = v.saved;
        v.boards.forEach((bd, b) => { if (bd.rows.length > before[b]) paintRow(b, before[b], true); });
        say('');
        timers.push(setTimeout(() => {
          paintKeys(); paintHud();
          const justSolved = v.boards.filter((bd, b) => bd.solved && bd.rows.length === before[b] + 1);
          justSolved.forEach(bd => {
            const b = v.boards.indexOf(bd), r = bd.rows.length - 1;
            boards[b].tiles.slice(r * LEN, r * LEN + LEN).forEach((t, i) => { t.style.setProperty('--d', i * 0.09 + 's'); t.classList.remove('flip'); void t.offsetWidth; t.classList.add('bounce'); });
          });
          if (v.won) { sfx.record(); summarize([['Tentativas', `${tries()}/${rows}`], ['Quadros', `${n}/${n}`]]); timers.push(setTimeout(() => done(v.score, { saved }), 1100)); }
          else if (v.over) { sfx.bad(); endPanel(); }
          else { if (justSolved.length) sfx.good(); busy = false; showCur(); }
        }, LEN * 180 + 350));
      };
      const press = k => {
        if (busy || !v || v.over) return;
        if (k === '↵') return submit();
        if (k === '⌫') cur = cur.slice(0, -1);
        else if (/^[A-Z]$/.test(k) && cur.length < LEN) cur += k;
        say(''); showCur();
      };
      el.querySelectorAll('.tm-k').forEach(b => b.onclick = () => press(b.dataset.k));
      const onKey = e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'Enter') { e.preventDefault(); press('↵'); }
        else if (e.key === 'Backspace') press('⌫');
        else { const l = norm(e.key); if (l.length === 1 && /[A-Z]/.test(l)) press(l); }
      };
      addEventListener('keydown', onKey);
      return () => { alive = false; removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
    },
  };
}
GAMES.dueto = multiTermo('dueto', 2, 7);
GAMES.quarteto = multiTermo('quarteto', 4, 9);
GAMES.octeto = multiTermo('octeto', 8, 13);
