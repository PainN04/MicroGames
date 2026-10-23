// Senha: descubra a sequência de 4 cores do dia (a mesma cor pode aparecer mais de uma vez) em até 8 tentativas.
// Cada tentativa vai pro servidor (lib/diarios.js), que diz quantas cores estão no lugar certo e quantas existem
// mas estão em outro lugar. A senha só aparece no fim.
GAMES.senha = {
  name: 'Senha', icon: 'senha', hue: 330, daily: true,
  desc: 'Descubra a senha de 4 cores do dia em até 8 tentativas. A cada palpite você sabe quantas cores estão no lugar certo e quantas estão na senha, mas em outro lugar. Cores podem repetir. Uma partida por dia.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    if (needsServer(el)) return;
    const NAMES = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo'];
    let v = null, cur = [], busy = true, alive = true, saved = 'ok', timers = [];
    el.innerHTML = `<div class="hud"><span class="stat">Tentativa<b id="qn">1/8</b></span></div>
      <div class="sn-board" id="qb"></div>
      <p class="hint" id="qmsg" aria-live="polite"></p>
      <div class="sn-pal" id="qp" role="group" aria-label="Cores">${NAMES.map((n, c) => `<button class="sn-peg c${c}" data-c="${c}" aria-label="${n}"><span>${c + 1}</span></button>`).join('')}</div>
      <div class="row-btns" id="qbtns"><button class="btn ghost" id="qdel">${icon('delete')} Apagar</button><button class="btn" id="qok" disabled>${icon('circle-check')} Enviar</button></div>
      <div class="row-btns" id="qend" hidden></div>`;
    const msg = el.querySelector('#qmsg'), say = t => { msg.textContent = t; };
    const peg = (c, extra = '') => (c === undefined ? `<i class="sn-peg empty${extra}"></i>` : `<i class="sn-peg c${c}${extra}" title="${NAMES[c]}"><span>${c + 1}</span></i>`);
    const pins = (exact, near) => `<span class="sn-pins" aria-label="${exact} no lugar, ${near} em outro lugar">${Array.from({ length: v.len }, (_, k) => `<b class="${k < exact ? 'ex' : k < exact + near ? 'nr' : ''}"></b>`).join('')}</span>`;
    const paint = (fresh = -1) => {
      const rows = [];
      for (let r = 0; r < v.rows; r++) {
        const g = v.guesses[r];
        if (g) rows.push(`<div class="sn-row done${r === fresh ? ' pop' : ''}">${g.guess.map(c => peg(c)).join('')}${pins(g.exact, g.near)}</div>`);
        else if (r === v.guesses.length && !v.over) rows.push(`<div class="sn-row cur">${Array.from({ length: v.len }, (_, k) => `<button class="sn-slot" data-k="${k}" aria-label="posição ${k + 1}">${peg(cur[k])}</button>`).join('')}<span class="sn-pins"></span></div>`);
        else rows.push(`<div class="sn-row">${Array.from({ length: v.len }, () => peg(undefined)).join('')}<span class="sn-pins"></span></div>`);
      }
      el.querySelector('#qb').innerHTML = rows.join('');
      el.querySelectorAll('.sn-slot').forEach(b => b.onclick = () => { if (busy) return; cur[+b.dataset.k] = undefined; while (cur.length && cur.at(-1) === undefined) cur.pop(); paint(); });
      el.querySelector('#qn').textContent = `${Math.min(v.guesses.length + (v.over ? 0 : 1), v.rows)}/${v.rows}`;
      el.querySelector('#qok').disabled = cur.filter(c => c !== undefined).length < v.len;
    };
    const endPanel = () => {
      el.querySelector('#qp').hidden = true; el.querySelector('#qbtns').hidden = true;
      const box = el.querySelector('#qend');
      box.hidden = false;
      box.innerHTML = `<div class="sn-code"><span>A senha era</span>${v.code.map(c => peg(c)).join('')}</div><button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
      const share = () => `Senha MicroGame ${v.won ? v.guesses.length : 'X'}/${v.rows}\n` + v.guesses.map(g => '●'.repeat(g.exact) + '○'.repeat(g.near) + '·'.repeat(v.len - g.exact - g.near)).join('\n');
      box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(share()); say('Resultado copiado!'); } catch { say(share().replace(/\n/g, ' ')); } };
      say(v.won ? `Acertou em ${v.guesses.length}/${v.rows}: ${v.score} pontos.` : 'Não foi dessa vez. Volte amanhã pra uma senha nova!');
    };
    say('Carregando...');
    api('api/diarios/senha').then(nv => {
      if (!alive) return;
      v = nv; busy = false; say('');
      paint();
      if (v.over) endPanel();
    }).catch(err => { if (alive) say(err.message); });

    const pick = c => {
      if (busy || !v || v.over) return;
      const k = [...Array(v.len).keys()].find(i => cur[i] === undefined);
      if (k === undefined) return;
      cur[k] = c; beep(380 + c * 70, 50, 'triangle', 0.025); paint();
    };
    el.querySelectorAll('#qp .sn-peg').forEach(b => b.onclick = () => pick(+b.dataset.c));
    el.querySelector('#qdel').onclick = () => { if (busy) return; cur.pop(); paint(); };
    const submit = async () => {
      if (busy || !v || v.over || cur.filter(c => c !== undefined).length < v.len) return;
      busy = true;
      let nv;
      try { nv = await api('api/diarios/senha', { method: 'POST', body: { guess: cur } }); }
      catch (err) { if (alive) { busy = false; say(err.message); } return; }
      if (!alive) return;
      v = nv; cur = []; busy = false; if (nv.saved) saved = nv.saved;
      const last = v.guesses.at(-1);
      paint(v.guesses.length - 1);
      if (v.won) { sfx.record(); summarize([['Tentativas', `${v.guesses.length}/${v.rows}`]]); busy = true; timers.push(setTimeout(() => alive && done(v.score, { saved }), 900)); }
      else if (v.over) { sfx.bad(); endPanel(); }
      else { say(`${last.exact} no lugar certo, ${last.near} em outro lugar`); last.exact + last.near ? sfx.good() : beep(200, 80, 'square', 0.02); }
    };
    el.querySelector('#qok').onclick = submit;
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Backspace') { if (!busy) { cur.pop(); v && paint(); } }
      else if (/^[1-6]$/.test(e.key)) pick(+e.key - 1);
    };
    addEventListener('keydown', onKey);
    return () => { alive = false; removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
  }
};
