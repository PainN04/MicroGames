// Caça-palavras: 8 palavras de 2 temas escondidas num quadro 10×10, em qualquer direção (até de trás pra frente e na
// diagonal). Arraste da primeira à última letra (ou toque nas duas). Onde cada palavra está fica no servidor
// (lib/diarios.js), que confere cada marcação. O tempo conta desde que o quadro aparece: mais rápido, mais pontos.
GAMES.cacapalavras = {
  name: 'Caça-palavras', icon: 'cacapalavras', hue: 95, daily: true,
  desc: 'Ache as 8 palavras escondidas no quadro: na horizontal, na vertical, na diagonal e até de trás pra frente. Arraste da primeira à última letra. Quanto mais rápido, mais pontos. Uma partida por dia.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    if (needsServer(el)) return;
    const HUES = [25, 200, 300, 140, 50, 260, 345, 175];
    let v = null, S = 10, busy = true, alive = true, saved = 'ok', timers = [], tick = 0, a = null, b = null, dragging = false, moved = false;
    el.innerHTML = `<div class="hud"><span class="stat">Tempo<b id="ct">0:00</b></span><span class="stat">Achadas<b id="cf">0/8</b></span></div>
      <div class="cp-temas" id="ctm"></div>
      <div class="cp-box"><div class="cp-grid" id="cg" role="grid" aria-label="Quadro de letras"></div><svg class="cp-lines" id="cl" viewBox="0 0 10 10" aria-hidden="true"></svg></div>
      <ul class="cp-words" id="cw"></ul>
      <p class="hint" id="cmsg" aria-live="polite"></p>
      <div class="row-btns" id="cbtns"><button class="btn ghost" id="cgive">${icon('flag')} Desistir</button></div>`;
    const msg = el.querySelector('#cmsg'), say = t => { msg.textContent = t; };
    const grid = el.querySelector('#cg');
    const rc = i => [Math.floor(i / S), i % S];
    // casas da linha reta de i até j (ou null se não for reta)
    const line = (i, j) => {
      const [r0, c0] = rc(i), [r1, c1] = rc(j), dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0), n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
      if (r0 !== r1 && c0 !== c1 && Math.abs(r1 - r0) !== Math.abs(c1 - c0)) return null;
      return Array.from({ length: n + 1 }, (_, k) => (r0 + dr * k) * S + c0 + dc * k);
    };
    const seg = (i, j, cls, hue) => { const [r0, c0] = rc(i), [r1, c1] = rc(j); return `<line class="${cls}" x1="${c0 + 0.5}" y1="${r0 + 0.5}" x2="${c1 + 0.5}" y2="${r1 + 0.5}" ${hue != null ? `style="--h:${hue}"` : ''}/>`; };
    const paint = () => {
      const found = v.found.map(f => f.word);
      const marks = [...v.found.map(f => seg(f.from, f.to, 'f', HUES[v.words.indexOf(f.word)])),
        ...(v.over && v.place ? v.place.filter(p => !found.includes(p.word)).map(p => seg(p.from, p.to, 'miss')) : [])];
      const sel = a !== null && (b !== null ? line(a, b) : [a]);
      if (sel) marks.push(seg(sel[0], sel.at(-1), 'sel'));
      el.querySelector('#cl').innerHTML = marks.join('');
      grid.querySelectorAll('.cp-c').forEach((c, i) => c.classList.toggle('on', !!sel && sel.includes(i)));
      el.querySelector('#cw').innerHTML = v.words.map((w, k) => `<li class="${found.includes(w) ? 'ok' : ''}" style="--h:${HUES[k]}">${w}</li>`).join('');
      el.querySelector('#cf').textContent = `${found.length}/${v.words.length}`;
    };
    const clock = () => {
      if (!v || v.over) return;
      const s = Math.max(0, Math.floor((Date.now() - v.startedAt) / 1000));
      el.querySelector('#ct').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    const endPanel = () => {
      clearInterval(tick);
      const box = el.querySelector('#cbtns');
      box.innerHTML = `<button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
      const share = () => `Caça-palavras MicroGame: ${v.found.length}/${v.words.length} palavras${v.won ? `, ${v.score} pontos` : ''}`;
      box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(share()); say('Resultado copiado!'); } catch { say(share()); } };
      say(v.won ? `${v.score} pontos. Volte amanhã!` : 'As que faltaram estão marcadas. Volte amanhã!');
    };
    say('Carregando...');
    api('api/diarios/cacapalavras').then(nv => {
      if (!alive) return;
      v = nv; S = v.size; busy = false; say('');
      grid.style.setProperty('--n', S);
      grid.innerHTML = [...v.grid].map((ch, i) => `<div class="cp-c" data-i="${i}" role="gridcell">${ch}</div>`).join('');
      el.querySelector('#ctm').innerHTML = v.temas.map(t => `<span class="mtitle">${esc(t)}</span>`).join('');
      paint();
      if (v.over) return endPanel();
      tick = setInterval(clock, 500); clock();
    }).catch(err => { if (alive) say(err.message); });

    const cellAt = e => { const c = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.cp-c'); return c && grid.contains(c) ? +c.dataset.i : null; };
    const submit = async (i, j) => {
      busy = true; a = null; b = null; paint();
      let nv;
      try { nv = await api('api/diarios/cacapalavras', { method: 'POST', body: { from: i, to: j } }); }
      catch (err) { if (!alive) return; busy = false; say(err.message); beep(160, 90, 'square', 0.03); return; }
      if (!alive) return;
      busy = false;
      if (nv.result?.repeat) { say(`${nv.result.repeat} você já achou`); return; }
      v = nv; if (nv.saved) saved = nv.saved;
      paint();
      if (v.won) {
        clearInterval(tick); sfx.record();
        const s = Math.floor((Date.now() - v.startedAt) / 1000);
        summarize([['Palavras', `${v.words.length}/${v.words.length}`], ['Tempo', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`]]);
        busy = true; timers.push(setTimeout(() => alive && done(v.score, { saved }), 900));
      } else { say(`${v.found.at(-1).word}!`); sfx.good(); }
    };
    grid.addEventListener('pointerdown', e => {
      if (busy || !v || v.over) return;
      const i = cellAt(e);
      if (i === null) return;
      e.preventDefault();
      // segundo toque (modo toque-toque): fecha a marcação
      if (a !== null && b === null && i !== a && line(a, i)) { submit(a, i); return; }
      a = i; b = null; dragging = true; moved = false; paint();
      grid.setPointerCapture?.(e.pointerId);
    });
    grid.addEventListener('pointermove', e => {
      if (!dragging) return;
      const i = cellAt(e);
      if (i === null || i === a || !line(a, i)) return;
      b = i; moved = true; paint();
    });
    const up = () => {
      if (!dragging) return;
      dragging = false;
      if (moved && b !== null) submit(a, b);
      else { b = null; paint(); }
    };
    grid.addEventListener('pointerup', up);
    grid.addEventListener('pointercancel', () => { dragging = false; a = null; b = null; v && paint(); });
    el.querySelector('#cgive').onclick = async () => {
      if (busy || !v || v.over) return;
      const btn = el.querySelector('#cgive');
      if (!btn.dataset.sure) {
        btn.dataset.sure = '1'; btn.innerHTML = `${icon('flag')} Desistir mesmo?`;
        timers.push(setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.innerHTML = `${icon('flag')} Desistir`; } }, 3500));
        return;
      }
      busy = true;
      try { v = await api('api/diarios/cacapalavras', { method: 'POST', body: { action: 'giveup' } }); }
      catch (err) { if (alive) { busy = false; say(err.message); } return; }
      if (!alive) return;
      sfx.bad(); paint(); endPanel();
    };
    return () => { alive = false; clearInterval(tick); timers.forEach(clearTimeout); };
  }
};
