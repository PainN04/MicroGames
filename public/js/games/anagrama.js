GAMES.anagrama = {
  name: 'Anagrama', icon: 'spell-check', hue: 60, desc: 'Desembaralhe as palavras em 60s. Digite e Enter (ou clique nas letras). Palavra maior vale mais. Pular não custa ponto.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    const WORDS = ('AMIGO BANANA CABELO CADEIRA CAMISA CANETA CARRO CAVALO CHAVE CINEMA COELHO COMIDA CORAGEM CORRIDA DESENHO DINHEIRO DOMINGO ESCOLA ESPELHO ESTRELA '
      + 'FAMILIA FESTA FLORESTA FORMIGA FUTEBOL GALINHA GARRAFA GELADO GIRAFA GUITARRA HOSPITAL JANELA JARDIM LARANJA LIVRO MACACO MALETA MANTEIGA MARTELO MOCHILA '
      + 'MONITOR MORANGO MOTOR NAVIO OVELHA PANELA PAPEL PEPINO PERFUME PIJAMA PIMENTA PINCEL PIPOCA PLANETA PORTA PRAIA PRESENTE PRINCESA QUEIJO SABONETE SAPATO '
      + 'SEGREDO SORVETE TAPETE TECLADO TELHADO TESOURA TIGRE TOMATE TRABALHO TRATOR VENTO VIAGEM VIOLINO ABACAXI ALFACE ANIMAL BALEIA BARCO BATATA BICICLETA BONECA '
      + 'CAMELO CEBOLA CENOURA CHOCOLATE CIDADE COLHER CORUJA DENTISTA ELEFANTE ESCADA FOGUETE FRANGO GATINHO GOLFINHO LAGARTO MELANCIA MERCADO MOEDA NUVEM PALAVRA '
      + 'PEIXE PIRATA PLANTA POLVO QUADRO RAPOSA SALADA SERPENTE SOLDADO TARTARUGA TELEFONE URSO VAMPIRO VASSOURA ZEBRA').split(' ');
    const sorted = w => [...w].sort().join('');
    const DUR = 60;
    const deck = shuffled(WORDS);
    let word = '', pts = 0, solved = 0, t0 = 0, iv, over = false;
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Palavras<b id="w">0</b></span><span class="stat">Tempo<b id="t">60s</b></span></div>
      <div class="tiles" id="tiles"></div>
      <input class="txt" id="in" placeholder="digite a palavra + Enter" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-label="Palavra">
      <div class="row-btns"><button class="btn ghost" id="clr">${icon('delete')} Apagar</button><button class="btn ghost" id="skip">Pular ${icon('skip-forward')}</button></div>`;
    const inp = el.querySelector('#in'), tilesEl = el.querySelector('#tiles');
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    const syncTiles = () => {
      // marca como usadas as letras que já estão digitadas
      const typed = [...norm(inp.value)];
      tilesEl.querySelectorAll('.tile').forEach(t => {
        const k = typed.indexOf(t.dataset.l);
        t.classList.toggle('used', k >= 0);
        if (k >= 0) typed.splice(k, 1);
      });
    };
    const next = () => {
      word = deck.pop() || WORDS[rand(0, WORDS.length - 1)];
      let mix;
      do mix = shuffled(word).join(''); while (mix === word);
      tilesEl.innerHTML = [...mix].map(l => `<button class="tile" data-l="${l}">${l}</button>`).join('');
      tilesEl.querySelectorAll('.tile').forEach(t => t.onclick = () => { startClock(); inp.value += t.dataset.l; syncTiles(); inp.focus(); });
      inp.value = '';
    };
    const startClock = () => {
      if (t0) return;
      t0 = performance.now();
      iv = setInterval(() => {
        const left = DUR - (performance.now() - t0) / 1000;
        el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
        if (left <= 0 && !over) { over = true; clearInterval(iv); inp.disabled = true; done(pts); }
      }, 100);
    };
    const submit = () => {
      if (over) return;
      const guess = norm(inp.value);
      if (!guess) return;
      startClock();
      // vale qualquer palavra da lista com as mesmas letras (ex.: outra ordem válida)
      if (sorted(guess) === sorted(word) && WORDS.includes(guess)) {
        pts += word.length; solved++;
        el.querySelector('#p').textContent = pts; el.querySelector('#w').textContent = solved;
        sfx.good();
        next();
      } else {
        beep(160, 120, 'square', 0.03);
        inp.classList.remove('wrong'); void inp.offsetWidth; inp.classList.add('wrong');
      }
    };
    inp.oninput = () => { startClock(); syncTiles(); };
    inp.onkeydown = e => { if (e.key === 'Enter') submit(); };
    el.querySelector('#clr').onclick = () => { inp.value = ''; syncTiles(); inp.focus(); };
    el.querySelector('#skip').onclick = () => { if (over) return; startClock(); beep(300, 50, 'sine', 0.02); next(); inp.focus(); };
    next();
    inp.focus();
    return () => { over = true; clearInterval(iv); };
  }
};
