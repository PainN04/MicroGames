// Soletra: forme palavras com as letras da colmeia, sempre usando a do meio (4 letras ou mais, pode repetir letra).
// As palavras do dia ficam no servidor (lib/diarios.js): cada palavra vai pra lá e volta valendo ou não.
// A palavra que usa as 7 letras vale bônus. A partida acaba quando você encerra ou acha todas as do dia.
// Palavra menos comum que existe também vale ponto, como extra, mas não conta no total.
GAMES.soletra = {
  name: 'Soletra', icon: 'soletra', hue: 48, daily: true,
  desc: 'Forme palavras com as 7 letras da colmeia, sempre com a letra do meio. Palavra de 4 letras vale 1 ponto, maior vale uma por letra, e a que usa as 7 letras ganha +7. Encerre quando quiser: uma partida por dia.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    if (needsServer(el)) return;
    const RANKS = [[0, 'Começando'], [0.05, 'Bom começo'], [0.15, 'Indo bem'], [0.3, 'Ótimo'], [0.5, 'Incrível'], [0.7, 'Gênio']];
    let v = null, cur = '', busy = true, alive = true, outer = [], saved = 'ok', timers = [];
    el.innerHTML = `<div class="hud"><span class="stat">Palavras<b id="sw">0</b></span><span class="stat">Pontos<b id="sp">0</b></span></div>
      <div class="sl-rank" id="srank"><b>Começando</b><div class="sl-bar"><i></i></div></div>
      <div class="sl-cur" id="scur" aria-live="polite"></div>
      <div class="sl-hive" id="shive" role="group" aria-label="Letras"></div>
      <p class="hint" id="smsg" aria-live="polite"></p>
      <div class="row-btns" id="sbtns"><button class="btn ghost" id="sdel">${icon('delete')} Apagar</button><button class="btn ghost" id="smix" aria-label="Embaralhar">${icon('refresh-cw')}</button><button class="btn" id="sok">${icon('circle-check')} Enviar</button></div>
      <details class="sl-found" id="sfound" open><summary>Palavras encontradas</summary><ul></ul></details>
      <div class="row-btns" id="send"><button class="btn ghost" id="sstop">${icon('flag')} Encerrar</button></div>`;
    const msg = el.querySelector('#smsg'), say = t => { msg.textContent = t; };
    const rankOf = pts => { const f = v.max ? pts / v.max : 0; return RANKS.filter(([x]) => f >= x).at(-1)[1]; };
    const paintHive = () => {
      // o do meio no centro e os outros 6 em volta (x em colunas, y em meias alturas)
      const cells = [v.center, ...outer], POS = [[0, 0], [0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];
      el.querySelector('#shive').innerHTML = cells.map((l, k) => `<button class="sl-h${k === 0 ? ' mid' : ''}" data-l="${l}" style="--x:${POS[k][0]};--y:${POS[k][1]}">${l.toUpperCase()}</button>`).join('');
      el.querySelectorAll('.sl-h').forEach(b => b.onclick = () => press(b.dataset.l));
    };
    const paintCur = () => {
      el.querySelector('#scur').innerHTML = cur ? [...cur].map(c => `<span class="${c === v.center ? 'mid' : outer.includes(c) ? '' : 'bad'}">${c.toUpperCase()}</span>`).join('') : '<span class="ph">digite ou toque nas letras</span>';
    };
    const paint = () => {
      el.querySelector('#sw').textContent = `${v.hits}/${v.count}`;
      el.querySelector('#sp').textContent = v.points;
      const r = el.querySelector('#srank');
      r.querySelector('b').textContent = rankOf(v.points);
      r.querySelector('i').style.width = Math.min(100, (v.points / (v.max * 0.7)) * 100) + '%';
      const list = v.all || v.found.map(f => ({ word: f.word, pangram: f.pangram, found: true, extra: f.extra }));
      el.querySelector('#sfound ul').innerHTML = [...list].sort((a, b) => a.word.localeCompare(b.word, 'pt'))
        .map(f => `<li class="${f.pangram ? 'pg' : ''}${f.found ? '' : ' miss'}${f.extra ? ' ex' : ''}"${f.extra ? ' title="Palavra extra: vale ponto, não conta no total"' : ''}>${esc(f.word)}</li>`).join('') || '<li class="hint">Nenhuma ainda</li>';
    };
    const endPanel = () => {
      el.querySelector('#sbtns').hidden = true; el.querySelector('#shive').hidden = true; el.querySelector('#scur').hidden = true;
      const box = el.querySelector('#send');
      box.innerHTML = `<button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
      const share = () => `Soletra MicroGame: ${v.points} pontos (${rankOf(v.points)}), ${v.hits}/${v.count} palavras`;
      box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(share()); say('Resultado copiado!'); } catch { say(share()); } };
      say(v.points ? `${v.points} pontos. Veja as que faltaram e volte amanhã!` : 'Nenhuma palavra hoje. Volte amanhã!');
    };
    say('Carregando...');
    api('api/diarios/soletra').then(nv => {
      if (!alive) return;
      v = nv; outer = [...v.outer]; busy = false; say('');
      paintHive(); paintCur(); paint();
      if (v.over) endPanel();
    }).catch(err => { if (alive) say(err.message); });

    const finish = () => {
      sfx.record();
      summarize([['Palavras', `${v.hits}/${v.count}`], ['Nível', rankOf(v.points)]]);
      timers.push(setTimeout(() => alive && done(v.score, { saved }), 900));
    };
    const send = async body => {
      busy = true;
      let nv;
      try { nv = await api('api/diarios/soletra', { method: 'POST', body }); }
      catch (err) {
        if (!alive) return null; busy = false; say(err.message);
        const c = el.querySelector('#scur'); c.classList.remove('nope'); void c.offsetWidth; c.classList.add('nope'); beep(160, 100, 'square', 0.03);
        return null;
      }
      if (!alive) return null;
      v = nv; busy = false; if (nv.saved) saved = nv.saved;
      return nv;
    };
    const submit = async () => {
      if (busy || !v || v.over) return;
      if (cur.length < 4) { say('Mínimo de 4 letras'); return; }
      const nv = await send({ word: cur });
      if (!nv) return;
      cur = ''; paintCur(); paint();
      const r = nv.result || {};
      if (r.repeat) { say(`"${r.repeat}" você já achou`); return; }
      if (r.pangram) { say(`${r.word}: usou as 7 letras! +${r.points}`); sfx.record(); }
      else { say(`${r.word}${r.extra ? ' (extra)' : ''} +${r.points}`); sfx.good(); }
      const li = [...el.querySelectorAll('#sfound li')].find(x => x.textContent === r.word);
      if (li) li.classList.add('pop');
      if (v.over) finish();
    };
    const press = l => { if (busy || !v || v.over || cur.length >= 14) return; cur += l; say(''); paintCur(); beep(520 + cur.length * 30, 30, 'triangle', 0.02); };
    el.querySelector('#sdel').onclick = () => { cur = cur.slice(0, -1); paintCur(); };
    el.querySelector('#sok').onclick = submit;
    el.querySelector('#smix').onclick = () => { outer = [...outer].sort(() => Math.random() - 0.5); paintHive(); };
    el.querySelector('#sstop').onclick = async () => {
      if (busy || !v || v.over) return;
      const b = el.querySelector('#sstop');
      if (!b.dataset.sure) {
        b.dataset.sure = '1'; b.innerHTML = `${icon('flag')} Encerrar mesmo? (${v.points} pts)`;
        timers.push(setTimeout(() => { delete b.dataset.sure; b.innerHTML = `${icon('flag')} Encerrar`; }, 3500));
        return;
      }
      const nv = await send({ action: 'end' });
      if (!nv) return;
      paint();
      if (v.won) finish(); else { sfx.bad(); endPanel(); }
    };
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || !v) return;
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Backspace') { cur = cur.slice(0, -1); paintCur(); }
      else { const l = e.key.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); if (/^[a-z]$/.test(l)) press(l); }
    };
    addEventListener('keydown', onKey);
    return () => { alive = false; removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
  }
};
