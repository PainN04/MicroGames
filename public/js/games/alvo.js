// Alvo: chegue no número do dia juntando 6 números com + − × ÷. Toque num número, na operação e em outro número:
// os dois viram o resultado. Só vale conta com resultado inteiro e positivo. Os números e o alvo são iguais pra todo
// mundo; o servidor (lib/diarios.js) refaz as contas, e vale o resultado mais perto do alvo. Uma tentativa por dia.
GAMES.alvo = {
  name: 'Alvo', icon: 'alvo', hue: 260, daily: true,
  desc: 'Chegue no número do dia juntando os 6 números com + − × ÷ (cada número uma vez). Acertar em cheio rende mais e quanto mais rápido, melhor; chegar perto (até 9 de diferença) ainda vale pontos. Uma tentativa por dia.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    if (needsServer(el)) return;
    const SIGN = { '+': '+', '-': '−', '*': '×', '/': '÷' };
    const OPS = { '+': (a, b) => a + b, '-': (a, b) => (a > b ? a - b : null), '*': (a, b) => a * b, '/': (a, b) => (b && a % b === 0 ? a / b : null) };
    let v = null, alive = true, busy = true, tiles = [], steps = [], history = [], selA = null, op = null, tick = 0, saved = 'ok';
    el.innerHTML = `<div class="hud"><span class="stat">Tempo<b id="at">0:00</b></span><span class="stat">Mais perto<b id="ab">—</b></span></div>
      <div class="av-target" id="atg" aria-live="polite"><span>Alvo</span><b>…</b></div>
      <div class="av-nums" id="an" role="group" aria-label="Números"></div>
      <div class="av-ops" id="ao" role="group" aria-label="Operações">${Object.entries(SIGN).map(([k, s]) => `<button class="av-op" data-op="${k}" aria-label="${{ '+': 'mais', '-': 'menos', '*': 'vezes', '/': 'dividido por' }[k]}">${s}</button>`).join('')}</div>
      <ol class="av-steps" id="as"></ol>
      <p class="hint" id="amsg" aria-live="polite"></p>
      <div class="row-btns" id="abtns"><button class="btn ghost" id="aundo">${icon('rotate-ccw')} Desfazer</button><button class="btn ghost" id="areset">${icon('refresh-cw')} Recomeçar</button><button class="btn" id="asend" disabled>${icon('circle-check')} Enviar</button></div>
      <div class="av-end" id="aend" hidden></div>`;
    const msg = el.querySelector('#amsg'), say = t => { msg.textContent = t; };
    const results = () => steps.map(s => s[3]);
    const best = () => results().reduce((b, x) => (b === null || Math.abs(x - v.target) < Math.abs(b - v.target) ? x : b), null);
    const paint = (fresh = null) => {
      el.querySelector('#an').innerHTML = tiles.map((t, k) => `<button class="av-n${t.used ? ' used' : ''}${k === selA ? ' on' : ''}${t.made ? ' made' : ''}${k === fresh ? ' pop' : ''}${t.v === v.target ? ' hit' : ''}" data-k="${k}" ${t.used ? 'disabled' : ''}>${t.v}</button>`).join('');
      el.querySelectorAll('.av-n').forEach(b => b.onclick = () => tap(+b.dataset.k));
      el.querySelectorAll('.av-op').forEach(b => b.classList.toggle('on', b.dataset.op === op));
      el.querySelector('#as').innerHTML = steps.map(([a, o, b, r]) => `<li>${a} ${SIGN[o]} ${b} = <b>${r}</b></li>`).join('');
      const b = best();
      el.querySelector('#ab').textContent = b === null ? '—' : b === v.target ? 'Em cheio!' : `${b} (${Math.abs(b - v.target)})`;
      el.querySelector('#asend').disabled = !steps.length;
      el.querySelector('#aundo').disabled = !steps.length;
    };
    const tap = k => {
      if (busy || v.over || tiles[k].used) return;
      if (selA === null || op === null) { selA = selA === k ? null : k; beep(520, 40, 'triangle', 0.025); return paint(); }
      if (k === selA) { selA = null; op = null; return paint(); }
      const a = tiles[selA].v, b = tiles[k].v, r = OPS[op](a, b);
      if (r === null) { say(op === '-' ? 'Só vale resultado positivo: o maior vem primeiro' : 'A divisão tem que dar exata'); beep(160, 100, 'square', 0.03); return; }
      history.push({ tiles: tiles.map(t => ({ ...t })), steps: [...steps] });
      steps.push([a, op, b, r]);
      tiles[selA].used = true; tiles[k].used = true;
      tiles.push({ v: r, made: true });
      selA = tiles.length - 1; op = null;
      say('');
      r === v.target ? sfx.record() : sfx.good();
      paint(selA);
      if (r === v.target) say('Em cheio! Aperte Enviar.');
    };
    el.querySelectorAll('.av-op').forEach(b => b.onclick = () => {
      if (busy || v.over) return;
      if (selA === null) { say('Escolha um número primeiro'); return; }
      op = op === b.dataset.op ? null : b.dataset.op; paint();
    });
    el.querySelector('#aundo').onclick = () => { const h = history.pop(); if (!h) return; tiles = h.tiles; steps = h.steps; selA = null; op = null; paint(); };
    el.querySelector('#areset').onclick = () => { if (!history.length) return; ({ tiles, steps } = history[0]); history = []; selA = null; op = null; paint(); };
    const clock = () => {
      if (!v || v.over) return;
      const s = Math.max(0, Math.floor((Date.now() - v.startedAt) / 1000));
      el.querySelector('#at').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    const endPanel = () => {
      clearInterval(tick);
      el.querySelector('#abtns').hidden = true;
      el.querySelector('#ao').hidden = true;
      const r = v.result, box = el.querySelector('#aend');
      box.hidden = false;
      if (r) { steps = r.steps.map(([a, o, b]) => [a, o, b, OPS[o](a, b)]); paint(); }
      box.innerHTML = `${r ? `<p>Você chegou em <b>${r.value}</b>${r.diff ? ` (faltaram ${r.diff})` : ' — em cheio!'}</p>` : ''}
        <p class="hint">Um jeito de chegar: <b>${esc(v.solution)} = ${v.target}</b></p>
        <div class="row-btns"><button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button></div>`;
      const share = () => `Alvo MicroGame ${v.target}: ${!r ? '—' : r.diff ? `cheguei a ${r.diff}` : `em cheio com ${r.steps.length} conta${r.steps.length > 1 ? 's' : ''}`}`;
      box.querySelector('#shr').onclick = async () => { try { await navigator.clipboard.writeText(share()); say('Resultado copiado!'); } catch { say(share()); } };
      say(v.won ? `${v.score} pontos. Volte amanhã!` : 'Ficou longe dessa vez (mais de 9). Volte amanhã!');
    };
    say('Carregando...');
    api('api/diarios/alvo').then(nv => {
      if (!alive) return;
      v = nv; busy = false; say('');
      tiles = v.nums.map(n => ({ v: n }));
      el.querySelector('#atg b').textContent = v.target;
      paint();
      if (v.over) return endPanel();
      tick = setInterval(clock, 500); clock();
    }).catch(err => { if (alive) say(err.message); });

    el.querySelector('#asend').onclick = async () => {
      if (busy || !steps.length) return;
      const b = best();
      if (b !== v.target && !el.querySelector('#asend').dataset.sure) {
        // fora do alvo: confirma antes (é uma tentativa só)
        const s = el.querySelector('#asend');
        s.dataset.sure = '1'; s.innerHTML = `${icon('circle-check')} Enviar ${b} mesmo?`;
        setTimeout(() => { delete s.dataset.sure; s.innerHTML = `${icon('circle-check')} Enviar`; }, 3500);
        return;
      }
      busy = true;
      let nv;
      try { nv = await api('api/diarios/alvo', { method: 'POST', body: { steps: steps.map(([a, o, b]) => [a, o, b]) } }); }
      catch (err) { if (alive) { busy = false; say(err.message); } return; }
      if (!alive) return;
      v = nv; if (nv.saved) saved = nv.saved;
      if (v.won) {
        summarize([['Chegou em', `${v.result.value}`], ['Diferença', v.result.diff], ['Contas', v.result.steps.length]]);
        clearInterval(tick);
        setTimeout(() => alive && done(v.score, { saved }), 700);
      } else { sfx.bad(); endPanel(); }
    };
    return () => { alive = false; clearInterval(tick); };
  }
};
