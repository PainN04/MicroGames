let termoValid = null;

// Estatísticas do Termo de quem está jogando (sai das partidas guardadas neste navegador, uma chave por dia)
function termoStats(name, today) {
  const days = {};
  for (let i = 0; i < localStorage.length; i++) {
    const m = localStorage.key(i).match(/^mg_termo_(.+)_(\d+)$/);
    if (!m || m[1] !== name) continue;
    try { const st = JSON.parse(localStorage.getItem(localStorage.key(i))); if (st?.over) days[+m[2]] = st; } catch {}
  }
  const list = Object.entries(days).map(([d, st]) => [+d, st]);
  const wins = list.filter(([, st]) => st.won);
  const dist = [1, 2, 3, 4, 5, 6].map(n => wins.filter(([, st]) => st.guesses.length === n).length);
  let streak = 0;
  for (let d = days[today] ? today : today - 1; days[d]?.won; d--) streak++;
  let best = 0, run = 0;
  for (const [d, st] of list.sort((a, b) => a[0] - b[0])) { run = st.won && days[d - 1]?.won ? run + 1 : st.won ? 1 : 0; best = Math.max(best, run); }
  const top = Math.max(1, ...dist);
  return [
    ['Jogos', list.length],
    ['Vitórias', list.length ? Math.round(wins.length / list.length * 100) + '%' : '—'],
    ['Sequência', streak],
    ['Melhor sequência', best],
    ['Tentativas 1–6', `<span class="bars">${dist.map(n => `<i style="height:${4 + n / top * 30}px" title="${n}"></i>`).join('')}</span>`],
  ];
}

GAMES.termo = {
  name: 'Termo', icon: 'termo', hue: 150, desc: 'A palavra do dia: 5 letras, 6 tentativas, igual pra todo mundo. Verde = letra certa no lugar certo, amarelo = existe em outro lugar, cinza = não tem. Só vale a primeira partida de cada dia. Acertar rápido e em poucas tentativas rende mais pontos.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    // palavras do dia (com acento quando tem); o sorteio sai da data, igual pra todo mundo
    const ANSWERS = ('ABRIR AGORA AINDA ALGUM AMIGO ANDAR ANTES ASSIM AVISO BAIXO BANCO BARCO BEBER BEIJO BICHO BOLSA BRAVO BRISA BUSCA CAIXA CALOR CAMPO CANTO CARRO CARTA '
      + 'CASAL CAUSA CERTO CHAVE CHEFE CHEIO CHUVA CINCO CLARO COISA COMER CONTA CORPO CORTE COSTA CRIAR CULPA CURSO DADOS DANÇA DENTE DESDE DISCO DUPLA EMAIL '
      + 'ENTRE ERRAR ETAPA EXAME FAIXA FALAR FALHA FAUNA FAZER FELIZ FESTA FILHO FIRME FLORA FOLGA FOLHA FORÇA FORMA FORNO FORTE FRASE FRUTA FUNDO GANHO GENTE '
      + 'GOSTO GRAMA GRAÇA GRAVE GRUPO HOMEM HORAS HOTEL IDEIA IGUAL JANTA JOGAR JOVEM JUNTO JUSTO LARGO LEITE LENTO LETRA LIVRE LIVRO LOGIN LONGE LUGAR MACIO '
      + 'MAIOR MALHA MANGA MANHÃ MARCA MASSA MEDIR MELÃO MENOS MENTE METAS METRO MILHO MOEDA MORAR MORTE MOTOR MOUSE MUITO MUNDO NAVIO NINHO NOITE NORTE NUVEM '
      + 'OUTRO PAPEL PARTE PASSO PASTA PAUTA PEDRA PEIXE PERTO PESAR PIXEL PLANO POBRE PONTE PORTA POUCO PRAIA PRAZO PRETO PREÇO PRIMO PROVA QUASE RÁDIO RAIVA '
      + 'REINO RISCO ROUPA SABER SALTO SAÚDE SENHA SINAL SOBRE SOLAR SONHO SORTE SUAVE TARDE TECLA TEMPO TERRA TEXTO TIGRE TINTA TOQUE TORRE TRAÇO TROCA TURNO '
      + 'ÚNICO VALOR VAPOR VELHO VENDA VENTO VERDE VIDRO VINHO VISTA VIVER VOLTA ZEBRA ZERAR ACASO ADEUS AFETO AGUDO ALTAR AMADO AMPLO ANEXO ARARA ARDER AREIA '
      + 'ARROZ ATLAS AUTOR AVIÃO BALDE BANHO BARRO BASTA BEIRA BLOCO BOLHA BORDA BRIGA BRUTO CABRA CANAL CARNE CASCO CAVAR CEDER CERCA CESTA CHATO CICLO '
      + 'CINZA CLIMA COBRA COLAR CORDA COROA COURO CRUEL CURTO DEDAL DEPOR DIETA DIGNO DOMAR DRAMA ELITE ENFIM ENTÃO EXATO FAROL FATOR FEIRA FERRO FICAR FINAL '
      + 'FIXAR FLUXO FOCAR FOSCO FRACO FRETE FUGIR GALHO GARFO GASTO GELAR GERAL GIRAR GOLPE GORDO GRADE GRILO GUIAR HONRA HUMOR IDOSO JEITO JOGOS JULHO LAPSO '
      + 'LATIR LAUDO LAZER LEGAL LEVAR LIMPO LINHA LISTA LOUCO LUCRO LUTAR MACHO MAGIA MANTO MARCO MATAR MESES MESMO MÍDIA MIOLO MISTO MOLDE MONTE MORAL '
      + 'MOTIM MUDAR MULTA NERVO NEVAR NOBRE NOTAR NUNCA OBRAS OBTER OLHAR ONDAS ÓPERA ORDEM OSSOS OUVIR PAGAR PALCO PARAR PARDO PASSE PEGAR PERNA PESCA '
      + 'PIANO PILHA PISAR PISTA PLACA POEMA POLVO POSSE POUSO PRATO PRESO PRIOR PUXAR RAMAL RAPAZ REDES REGRA RENDA RESTO RITMO ROCHA RODAR ROSTO RUMOR SAFRA '
      + 'SALÃO SALDO SALSA SANTO SAQUE SELVA SIGLA SOLTO SOMAR SONDA SUBIR SULCO TELAS TERMO TIPOS TIRAR TOLDO TOMAR TRAMA TREVO TRIBO TRIGO TROCO VAGAS VALER '
      + 'VASTO VAZIO VELAS VIGOR VIRAR VISAR VOLTE VOTAR XEQUE ZELAR').split(' ');
    const POOL = ANSWERS;
    // palavras aceitas como tentativa (dicionário pt-BR do LibreOffice, 5 letras, sem acento). Se não baixar, aceita qualquer uma.
    termoValid ??= fetch('data/termo-validas.txt').then(r => r.ok ? r.text() : '').then(t => new Set(t.split(/\s+/).filter(Boolean))).catch(() => null);
    let valid = null;
    termoValid.then(v => { valid = v && v.size ? v : null; });
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const ROWS = 6, LEN = 5;
    const day = dayIndex();
    const secret = seededShuffle(POOL, Math.floor(day / POOL.length) * 7919 + 101)[day % POOL.length];
    const answer = norm(secret);
    const KEY = `mg_termo_${player}_${day}`;
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
    const st = Object.assign({ guesses: [], t0: 0, over: false, won: false, score: 0 }, load());

    const evaluate = guess => {
      const res = Array(LEN).fill('x'), left = {};
      for (let i = 0; i < LEN; i++) { if (guess[i] === answer[i]) res[i] = 'g'; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
      for (let i = 0; i < LEN; i++) if (res[i] === 'x' && left[guess[i]] > 0) { res[i] = 'y'; left[guess[i]]--; }
      return res;
    };
    const EMOJI = { g: '🟩', y: '🟨', x: '⬛' };
    const pointsFor = (tries, secs) => (ROWS + 1 - tries) * 100 + Math.max(0, 99 - Math.floor(secs / 3));

    let cur = '', busy = false, timers = [];
    const tryNo = () => (st.over ? st.guesses.length : Math.min(st.guesses.length + 1, ROWS));
    el.innerHTML = `<div class="hud"><span class="stat">Tentativa<b id="n">1/${ROWS}</b></span><span class="stat">Palavra nº<b>${day % 1000}</b></span></div>
      <div class="tm" id="tm" aria-live="polite">${Array.from({ length: ROWS * LEN }, () => '<div class="tm-t"></div>').join('')}</div>
      <p class="hint" id="tmsg"></p>
      <div class="tm-kb" id="kb">${['QWERTYUIOP', 'ASDFGHJKL', '↵ZXCVBNM⌫'].map(r => `<div>${[...r].map(k => `<button class="tm-k${k === '↵' || k === '⌫' ? ' wide' : ''}" data-k="${k}" ${k === '↵' ? 'aria-label="Enviar"' : k === '⌫' ? 'aria-label="Apagar"' : ''}>${k}</button>`).join('')}</div>`).join('')}</div>
      <div class="row-btns" id="tmend" hidden></div>`;
    const tiles = [...el.querySelectorAll('.tm-t')], msg = el.querySelector('#tmsg');
    const kbKey = l => el.querySelector(`.tm-k[data-k="${l}"]`);
    const say = t => { msg.textContent = t; };
    const paintRow = (r, guess, res, animate) => {
      for (let i = 0; i < LEN; i++) {
        const t = tiles[r * LEN + i];
        // letra certa no lugar certo mostra o acento da palavra
        t.textContent = res[i] === 'g' ? secret[i] : guess[i];
        const apply = () => { t.classList.add(res[i]); };
        if (animate) { t.style.setProperty('--d', i * 0.22 + 's'); t.classList.add('flip'); timers.push(setTimeout(apply, i * 220 + 250)); } else apply();
        const k = kbKey(guess[i]);
        if (k) { const rank = { x: 1, y: 2, g: 3 }, was = k.dataset.s; if (!was || rank[res[i]] > rank[was]) { k.dataset.s = res[i]; if (animate) timers.push(setTimeout(() => k.classList.remove('g', 'y', 'x') || k.classList.add(res[i]), 1500)); else { k.classList.remove('g', 'y', 'x'); k.classList.add(res[i]); } } }
      }
    };
    const showCur = () => {
      const r = st.guesses.length;
      for (let i = 0; i < LEN; i++) { const t = tiles[r * LEN + i]; if (!t) return; t.textContent = cur[i] || ''; t.classList.toggle('on', !!cur[i]); }
    };
    const shareText = () => `Termo MicroGame ${st.won ? st.guesses.length : 'X'}/${ROWS}\n` + st.guesses.map(g => evaluate(g).map(c => EMOJI[c]).join('')).join('\n');
    const endPanel = () => {
      const box = el.querySelector('#tmend');
      el.querySelector('#kb').hidden = true;
      box.hidden = false;
      box.innerHTML = `<dl class="part-sum">${termoStats(player, day).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><button class="btn ghost" id="shr">${icon('upload')} Copiar resultado</button>`;
      say(st.won ? `Você acertou em ${st.guesses.length}/${ROWS}: ${st.score} pontos. Volte amanhã pra uma palavra nova!` : `A palavra era ${secret}. Volte amanhã pra uma palavra nova!`);
      box.querySelector('#shr').onclick = async () => {
        try { await navigator.clipboard.writeText(shareText()); say('Resultado copiado!'); } catch { say(shareText().replace(/\n/g, ' · ')); }
      };
    };

    // acertou mas a página recarregou antes de enviar: manda agora (o servidor recusa se já tinha entrado)
    const send = () => { st.sent = true; save(); summarize(termoStats(player, day)); done(st.score); };
    // jogo de hoje já terminou (recarregou a página ou voltou ao jogo): só mostra o resultado
    st.guesses.forEach((g, r) => paintRow(r, g, evaluate(g), false));
    el.querySelector('#n').textContent = tryNo() + '/' + ROWS;
    if (st.over) {
      if (st.won && !st.sent) timers.push(setTimeout(send, 400));
      else endPanel();
      return () => timers.forEach(clearTimeout);
    }

    const submit = () => {
      if (busy) return;
      if (cur.length < LEN) { say('Faltam letras'); shake(); return; }
      if (valid && !valid.has(cur) && !POOL.some(w => norm(w) === cur)) { say('Essa palavra não está na lista'); shake(); return; }
      const guess = cur, res = evaluate(guess), r = st.guesses.length;
      if (!st.t0) st.t0 = Date.now();
      st.guesses.push(guess); cur = ''; busy = true;
      paintRow(r, guess, res, true);
      say('');
      // o resultado fica salvo já (recarregar no meio da animação não dá segunda chance); a tela só mostra depois do giro
      const won = guess === answer, lost = !won && st.guesses.length >= ROWS;
      if (won) { st.over = true; st.won = true; st.score = pointsFor(st.guesses.length, (Date.now() - st.t0) / 1000); }
      else if (lost) st.over = true;
      save();
      timers.push(setTimeout(() => {
        el.querySelector('#n').textContent = tryNo() + '/' + ROWS;
        if (won) {
          sfx.record();
          // a linha certa pula, uma letra de cada vez
          tiles.slice(r * LEN, r * LEN + LEN).forEach((t, i) => { t.style.setProperty('--d', i * 0.09 + 's'); t.classList.remove('flip'); void t.offsetWidth; t.classList.add('bounce'); });
          timers.push(setTimeout(send, 900));
        }
        else if (lost) { sfx.bad(); endPanel(); }
        else busy = false;
      }, LEN * 220 + 350));
    };
    const shake = () => { const row = tiles.slice(st.guesses.length * LEN, st.guesses.length * LEN + LEN); row.forEach(t => { t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope'); }); beep(160, 100, 'square', 0.03); };
    const press = k => {
      if (busy || st.over) return;
      if (!st.t0 && /^[A-Z]$/.test(k)) { st.t0 = Date.now(); save(); }
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
    showCur();
    return () => { removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
  }
};
