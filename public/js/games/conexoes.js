// Conexões: 16 palavras escondem 4 grupos de 4. Escolha 4 que tenham algo em comum; 4 erros e acabou.
// Os grupos ficam no servidor (lib/diarios.js + lib/conexoes.js): a página manda as 4 escolhidas e recebe se formam
// um grupo (e qual). A cor diz a dificuldade: amarelo é o mais fácil, roxo é jogo de palavras.
GAMES.conexoes = {
  name: 'Conexões', icon: 'conexoes', hue: 45, daily: true,
  desc: 'Ache os 4 grupos de 4 palavras com algo em comum. Selecione 4 e envie; 4 erros e acabou. Amarelo é o mais fácil, roxo é jogo de palavras. Uma partida por dia: menos erros e mais rápido rende mais pontos.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    if (needsServer(el)) return;
    const EMOJI = { 1: '🟨', 2: '🟩', 3: '🟦', 4: '🟪' };
    let v = null, busy = true, alive = true, order = [], pick = new Set(), saved = 'ok';
    el.innerHTML = `<div class="hud"><span class="stat">Grupos<b id="xg">0/4</b></span><span class="stat">Erros<b id="xe"></b></span></div>
      <div class="cn" id="cn">
        <div class="cn-solved" id="cs"></div>
        <div class="cn-grid" id="cg" role="group" aria-label="Palavras"></div>
      </div>
      <p class="hint" id="xmsg" aria-live="polite"></p>
      <div class="row-btns" id="xb"><button class="btn ghost" id="xmix">${icon('refresh-cw')} Embaralhar</button><button class="btn ghost" id="xclr">${icon('x')} Limpar</button><button class="btn" id="xgo" disabled>${icon('circle-check')} Enviar</button></div>
      <div class="row-btns" id="xend" hidden></div>`;
    const msg = el.querySelector('#xmsg'), say = t => { msg.textContent = t; };
    const grid = el.querySelector('#cg'), go = el.querySelector('#xgo');
    const paintGrid = () => {
      grid.innerHTML = order.map(w => `<button class="cn-w${pick.has(w) ? ' on' : ''}${w.length > 8 ? ' long' : ''}" data-w="${esc(w)}" aria-pressed="${pick.has(w)}">${esc(w)}</button>`).join('');
      grid.querySelectorAll('.cn-w').forEach(b => b.onclick = () => {
        if (busy || v.over) return;
        const w = b.dataset.w;
        if (pick.has(w)) pick.delete(w); else if (pick.size < 4) pick.add(w); else return;
        b.classList.toggle('on', pick.has(w)); b.setAttribute('aria-pressed', pick.has(w));
        go.disabled = pick.size !== 4;
        beep(pick.has(w) ? 520 : 380, 40, 'triangle', 0.025);
      });
      go.disabled = pick.size !== 4;
    };
    const solvedHtml = g => `<div class="cn-g lv${g.nivel}${g.found ? '' : ' miss'}"><b>${esc(g.nome)}</b><span>${g.palavras.map(esc).join(', ')}</span></div>`;
    const paint = (fresh = false) => {
      el.querySelector('#xg').textContent = v.solved.filter(g => g.found).length + '/4';
      el.querySelector('#xe').innerHTML = `<span class="cn-dots">${Array.from({ length: v.max }, (_, k) => `<i class="${k < v.mistakes ? 'used' : ''}"></i>`).join('')}</span>`;
      el.querySelector('#cs').innerHTML = v.solved.map(solvedHtml).join('');
      if (fresh || order.length !== v.words.length) order = order.length ? order.filter(w => v.words.includes(w)) : [...v.words];
      pick = new Set([...pick].filter(w => v.words.includes(w)));
      paintGrid();
    };
    const shareText = () => {
      const lvOf = w => v.solved.find(g => g.palavras.includes(w))?.nivel;
      return `Conexões MicroGame ${v.won ? `${v.mistakes} erro${v.mistakes === 1 ? '' : 's'}` : 'X'}\n` + v.tries.map(t => t.split(',').map(w => EMOJI[lvOf(w)] || '⬜').join('')).join('\n');
    };
    const endPanel = () => {
      el.querySelector('#xb').hidden = true;
      const box = el.querySelector('#xend');
      box.hidden = false;
      box.innerHTML = `<button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
      say(v.won ? `Achou os 4 grupos: ${v.score} pontos. Volte amanhã!` : 'Acabaram os erros. Esses eram os grupos. Volte amanhã!');
      box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(shareText()); say('Resultado copiado!'); } catch { say(shareText().replace(/\n/g, ' · ')); } };
    };
    say('Carregando...');
    api('api/diarios/conexoes').then(nv => {
      if (!alive) return;
      v = nv; paint(true); say(''); busy = false;
      if (v.over) endPanel();
    }).catch(err => { if (alive) say(err.message); });

    el.querySelector('#xmix').onclick = () => { order = shuffled(order); paintGrid(); };
    el.querySelector('#xclr').onclick = () => { pick.clear(); paintGrid(); };
    go.onclick = async () => {
      if (busy || pick.size !== 4) return;
      busy = true;
      const words = [...pick];
      let nv;
      try { nv = await api('api/diarios/conexoes', { method: 'POST', body: { words } }); }
      catch (err) { if (alive) { busy = false; say(err.message); } return; }
      if (!alive) return;
      busy = false;
      if (nv.saved) saved = nv.saved;
      const res = nv.result || {};
      if (res.repeat) { say('Você já tentou essas 4'); return; }
      const chosen = [...grid.querySelectorAll('.cn-w.on')];
      if (res.ok) {
        // as 4 sobem e viram a faixa do grupo
        chosen.forEach((b, i) => { b.style.setProperty('--d', i * 0.06 + 's'); b.classList.add('hop'); });
        sfx.good();
        setTimeout(() => {
          if (!alive) return;
          v = nv; pick.clear(); paint();
          say(`${res.group}!`);
          if (v.won) { sfx.record(); summarize([['Erros', `${v.mistakes}/${v.max}`]]); setTimeout(() => alive && done(v.score, { saved }), 1200); }
        }, 450);
      } else {
        chosen.forEach(b => { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); });
        beep(160, 120, 'square', 0.03);
        v = nv;
        say(res.oneAway ? 'Falta uma! 3 delas são do mesmo grupo.' : 'Não formam um grupo.');
        if (v.over) { sfx.bad(); pick.clear(); setTimeout(() => { if (!alive) return; paint(); endPanel(); }, 500); }
        else el.querySelector('#xe').innerHTML = `<span class="cn-dots">${Array.from({ length: v.max }, (_, k) => `<i class="${k < v.mistakes ? 'used' : ''}"></i>`).join('')}</span>`;
      }
    };
    return () => { alive = false; };
  }
};
