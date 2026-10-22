// Contexto: descubra a palavra secreta do dia. Cada palpite volta com a posição dele numa lista de todas as palavras
// ordenadas pelo sentido (1 = a secreta). A lista é calculada no servidor (lib/diarios.js) com vetores de palavras;
// a página só vê a posição de cada palpite, e a palavra só no fim.
GAMES.contexto = {
  name: 'Contexto', icon: 'contexto', hue: 330, daily: true,
  desc: 'Descubra a palavra secreta do dia. Cada palpite mostra a posição dele numa lista de palavras ordenadas pelo sentido: quanto menor, mais perto. Tentativas sem limite; menos palpites e menos dicas rendem mais pontos.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    if (needsServer(el)) return;
    let v = null, busy = true, alive = true, last = null, saved = 'ok';
    el.innerHTML = `<div class="hud"><span class="stat">Palpites<b id="cn">0</b></span><span class="stat">Dicas<b id="ch">0</b></span></div>
      <form class="cx-form" id="cf" autocomplete="off"><input id="ci" class="cx-in" maxlength="24" placeholder="digite uma palavra" aria-label="Palpite" autocapitalize="none" spellcheck="false" enterkeyhint="send"><button class="btn" id="cs">${icon('play')}<span>Enviar</span></button></form>
      <p class="hint" id="cmsg" aria-live="polite"></p>
      <div class="cx-last" id="clast" hidden></div>
      <ol class="cx-list" id="cl"></ol>
      <div class="row-btns" id="cbtns"><button class="btn ghost" id="chint">${icon('lightbulb')} Dica</button><button class="btn ghost" id="cgive">${icon('flag')} Desistir</button></div>
      <div class="cx-end" id="cend" hidden></div>`;
    const input = el.querySelector('#ci'), msg = el.querySelector('#cmsg'), say = t => { msg.textContent = t; };
    // cor e tamanho da barra pela posição (escala log: 1º cheio, último quase vazio)
    const tone = r => (r <= 300 ? 'near' : r <= 1500 ? 'mid' : 'far');
    const pct = r => Math.max(3, Math.round(100 * (1 - Math.log(r) / Math.log(v.total))));
    const rowHtml = (g, cls = '') => `<li class="cx-row ${tone(g.rank)} ${cls}" style="--p:${pct(g.rank)}%"><span class="w">${esc(g.word)}${g.hint ? ` <small>${icon('lightbulb')}</small>` : ''}</span><span class="r">${g.rank}</span></li>`;
    const tries = () => v.guesses.filter(g => !g.hint).length;
    const paint = () => {
      el.querySelector('#cn').textContent = tries();
      el.querySelector('#ch').textContent = v.hints;
      const sorted = [...v.guesses].sort((a, b) => a.rank - b.rank);
      el.querySelector('#cl').innerHTML = sorted.map(g => rowHtml(g, g.word === last ? 'is-last' : '')).join('');
      const lb = el.querySelector('#clast');
      const lg = v.guesses.find(g => g.word === last);
      lb.hidden = !lg;
      if (lg) lb.innerHTML = `<ol class="cx-list">${rowHtml(lg, 'pop')}</ol>`;
    };
    const shareText = () => {
      const c = { near: 0, mid: 0, far: 0 };
      v.guesses.forEach(g => c[tone(g.rank)]++);
      return `Contexto MicroGame: ${v.won ? `acertei em ${tries()} palpites` : 'desisti'}${v.hints ? ` e ${v.hints} dica${v.hints > 1 ? 's' : ''}` : ''}\n🟩 ${c.near} 🟨 ${c.mid} 🟥 ${c.far}`;
    };
    const endPanel = () => {
      el.querySelector('#cf').hidden = true;
      el.querySelector('#cbtns').hidden = true;
      const box = el.querySelector('#cend');
      box.hidden = false;
      box.innerHTML = `<p class="cx-word">A palavra era <b>${esc(v.word)}</b></p>
        <details class="cx-top"><summary>As ${v.top.length} palavras mais próximas</summary><ol class="cx-list">${v.top.map(g => rowHtml(g)).join('')}</ol></details>
        <div class="row-btns"><button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button></div>`;
      say(v.won ? `Acertou em ${tries()} palpites: ${v.score} pontos. Volte amanhã!` : 'Volte amanhã pra uma palavra nova!');
      box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(shareText()); say('Resultado copiado!'); } catch { say(shareText().replace(/\n/g, ' · ')); } };
    };
    const apply = (nv, word) => {
      v = nv; if (nv.saved) saved = nv.saved;
      last = word ?? v.guesses.at(-1)?.word ?? null;
      paint();
    };
    say('Carregando...');
    api('api/diarios/contexto').then(nv => {
      if (!alive) return;
      apply(nv); say(''); busy = false;
      if (v.over) endPanel(); else input.focus();
    }).catch(err => { if (alive) say(err.message); });

    const send = async body => {
      if (busy || !v || v.over) return;
      busy = true;
      let nv;
      try { nv = await api('api/diarios/contexto', { method: 'POST', body }); }
      catch (err) { if (alive) { busy = false; say(err.message); beep(160, 100, 'square', 0.03); } return; }
      if (!alive) return;
      busy = false;
      if (nv.result?.repeat) { apply(nv, nv.result.repeat); say(`"${nv.result.repeat}" já foi`); return; }
      apply(nv);
      const g = v.guesses.at(-1);
      say('');
      if (v.won) {
        sfx.record(); confetti(el.querySelector('#clast'));
        summarize([['Palpites', tries()], ['Dicas', v.hints]]);
        setTimeout(() => alive && done(v.score, { saved }), 1200);
      } else if (v.over) { sfx.bad(); endPanel(); }
      else if (g) { g.rank <= 300 ? sfx.good() : beep(330, 60, 'triangle', 0.03); }
    };
    el.querySelector('#cf').onsubmit = e => {
      e.preventDefault();
      const w = input.value.trim();
      if (!w) return;
      input.value = '';
      send({ guess: w });
      input.focus();
    };
    el.querySelector('#chint').onclick = () => send({ action: 'hint' });
    el.querySelector('#cgive').onclick = () => {
      const b = el.querySelector('#cgive');
      // confirmação no próprio botão (2 cliques)
      if (b.dataset.sure) send({ action: 'giveup' });
      else { b.dataset.sure = '1'; b.innerHTML = `${icon('flag')} Certeza? Clique de novo`; setTimeout(() => { delete b.dataset.sure; b.innerHTML = `${icon('flag')} Desistir`; }, 3000); }
    };
    return () => { alive = false; };
  }
};
