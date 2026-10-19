GAMES.forca = {
  name: 'Forca', icon: 'forca', hue: 20, desc: 'Descubra a palavra de TI ou do escritório antes de errar 6 letras. Os erros continuam na próxima palavra: cada acerto tira só um. Letra do teclado ou toque nas letras. Errou 6, acabou.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    // [palavra, dica]
    const WORDS = [
      ['SERVIDOR', 'TI'], ['NAVEGADOR', 'TI'], ['TECLADO', 'TI'], ['MONITOR', 'TI'], ['IMPRESSORA', 'Escritório'], ['SENHA', 'TI'], ['USUÁRIO', 'TI'], ['ARQUIVO', 'TI'],
      ['PASTA', 'TI'], ['REDE', 'TI'], ['ROTEADOR', 'TI'], ['SOFTWARE', 'TI'], ['HARDWARE', 'TI'], ['PROGRAMA', 'TI'], ['SISTEMA', 'TI'], ['BANCO DE DADOS', 'TI'],
      ['ALGORITMO', 'Programação'], ['VARIÁVEL', 'Programação'], ['FUNÇÃO', 'Programação'], ['COMPILADOR', 'Programação'], ['REPOSITÓRIO', 'Programação'], ['DEPURAR', 'Programação'],
      ['CÓDIGO', 'Programação'], ['LINGUAGEM', 'Programação'], ['BIBLIOTECA', 'Programação'], ['INTERFACE', 'Programação'], ['PROTOCOLO', 'Internet'], ['DOWNLOAD', 'Internet'],
      ['PROVEDOR', 'Internet'], ['ENDEREÇO', 'Internet'], ['NUVEM', 'Internet'], ['BACKUP', 'TI'], ['CRIPTOGRAFIA', 'Segurança'], ['VÍRUS', 'Segurança'], ['FIREWALL', 'Segurança'],
      ['ANTIVÍRUS', 'Segurança'], ['PHISHING', 'Segurança'], ['AUTENTICAÇÃO', 'Segurança'], ['ATUALIZAÇÃO', 'TI'], ['INSTALAR', 'TI'], ['REINICIAR', 'TI'], ['CHAMADO', 'Suporte'],
      ['SUPORTE', 'Suporte'], ['ATENDIMENTO', 'Suporte'], ['SOLUÇÃO', 'Suporte'], ['TICKET', 'Suporte'], ['PRIORIDADE', 'Suporte'], ['URGENTE', 'Suporte'], ['ESCRITÓRIO', 'Escritório'],
      ['REUNIÃO', 'Escritório'], ['PLANILHA', 'Escritório'], ['RELATÓRIO', 'Escritório'], ['APRESENTAÇÃO', 'Escritório'], ['CALENDÁRIO', 'Escritório'], ['AGENDA', 'Escritório'],
      ['PRAZO', 'Escritório'], ['PROJETO', 'Escritório'], ['EQUIPE', 'Escritório'], ['GERENTE', 'Escritório'], ['COLEGA', 'Escritório'], ['CLIENTE', 'Escritório'], ['FORNECEDOR', 'Escritório'],
      ['CONTRATO', 'Escritório'], ['PROPOSTA', 'Escritório'], ['ORÇAMENTO', 'Escritório'], ['FATURA', 'Escritório'], ['PAGAMENTO', 'Escritório'], ['ESTOQUE', 'Escritório'],
      ['CAFEZINHO', 'Escritório'], ['INTERVALO', 'Escritório'], ['ALMOÇO', 'Escritório'], ['COPA', 'Escritório'], ['GRAMPEADOR', 'Escritório'], ['CANETA', 'Escritório'],
      ['PRANCHETA', 'Escritório'], ['CALCULADORA', 'Escritório'], ['ARMÁRIO', 'Escritório'], ['CADEIRA', 'Escritório'], ['RAMAL', 'Escritório'], ['CRACHÁ', 'Escritório'],
      ['HOME OFFICE', 'Escritório'], ['TRABALHO', 'Escritório'], ['EXPEDIENTE', 'Escritório'], ['REEMBOLSO', 'Escritório'], ['PROMOÇÃO', 'Escritório'], ['META', 'Escritório'],
      ['PROCESSADOR', 'Hardware'], ['MEMÓRIA', 'Hardware'], ['PLACA DE VÍDEO', 'Hardware'], ['NOTEBOOK', 'Hardware'], ['SMARTPHONE', 'Hardware'], ['WEBCAM', 'Hardware'],
      ['FONE DE OUVIDO', 'Hardware'], ['CARREGADOR', 'Hardware'], ['PENDRIVE', 'Hardware'], ['BATERIA', 'Hardware'], ['PROJETOR', 'Hardware'], ['ESCANER', 'Hardware'],
      ['TELA', 'Hardware'], ['MOUSE', 'Hardware'], ['CABO', 'Hardware'], ['WI-FI', 'Internet'], ['E-MAIL', 'Internet'], ['SITE', 'Internet'], ['LINK', 'Internet'], ['DOMÍNIO', 'Internet'],
      ['NAVEGAR', 'Internet'], ['CONEXÃO', 'Internet'], ['LATÊNCIA', 'Internet'], ['TRÁFEGO', 'Internet'], ['TECNOLOGIA', 'TI'], ['COMPUTADOR', 'TI'], ['INTERNET', 'TI'],
    ];
    const MAX = 6, ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const deck = [...WORDS].sort(() => Math.random() - 0.5);
    let word = '', hint = '', plain = '', guessed = new Set(), wrong = 0, pts = 0, solved = 0, locked = false, timers = [];
    // forca desenhada em SVG: cada erro mostra mais uma parte do boneco
    const PARTS = ['<circle cx="150" cy="62" r="16"/>', '<path d="M150 78v52"/>', '<path d="M150 90l-26 24"/>', '<path d="M150 90l26 24"/>', '<path d="M150 130l-22 38"/>', '<path d="M150 130l22 38"/>'];
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Palavras<b id="w">0</b></span><span class="stat">Erros<b id="e">0/${MAX}</b></span></div>
      <svg class="gallows" viewBox="0 0 220 190" aria-hidden="true"><g class="base"><path d="M20 182h120M52 182V14h98v34"/></g><g class="body" id="body"></g></svg>
      <p class="hint" id="hint"></p>
      <div class="wordline" id="wl" aria-live="polite"></div>
      <div class="keys" id="keys">${[...ALPHA].map(l => `<button class="key" data-l="${l}">${l}</button>`).join('')}</div>`;
    const wl = el.querySelector('#wl'), keys = [...el.querySelectorAll('.key')];
    const draw = () => {
      el.querySelector('#body').innerHTML = PARTS.slice(0, wrong).join('');
      el.querySelector('#e').textContent = wrong + '/' + MAX;
      // cada palavra num grupo que não quebra no meio (no celular, "PLACA DE VÍDEO" vai pra mais de uma linha)
      wl.innerHTML = word.split(' ').map((w, wi, all) => {
        const off = all.slice(0, wi).join(' ').length + (wi ? 1 : 0);
        return '<span class="wd">' + [...w].map((ch, i) => (ch === '-' ? '<span class="gap">-</span>' : `<span class="lt">${guessed.has(plain[off + i]) || locked && wrong >= MAX ? ch : ''}</span>`)).join('') + '</span>';
      }).join('');
      wl.classList.toggle('lost', wrong >= MAX);
    };
    const next = () => {
      const w = deck.pop();
      if (!w) return finish();
      [word, hint] = w; plain = norm(word); guessed = new Set(); locked = false;
      keys.forEach(k => { k.disabled = false; k.className = 'key'; });
      el.querySelector('#hint').textContent = 'Dica: ' + hint + ' · ' + plain.replace(/[^A-Z]/g, '').length + ' letras';
      draw();
    };
    const finish = () => { locked = true; timers.push(setTimeout(() => done(pts), 400)); };
    const guess = l => {
      if (locked || guessed.has(l) || !ALPHA.includes(l)) return;
      guessed.add(l);
      const key = keys[ALPHA.indexOf(l)];
      key.disabled = true;
      if (plain.includes(l)) {
        key.classList.add('ok'); sfx.good();
        if ([...plain].every(c => !ALPHA.includes(c) || guessed.has(c))) {
          // palavra completa: letras da palavra + erros que sobraram
          const gain = plain.replace(/[^A-Z]/g, '').length + (MAX - wrong);
          // os erros seguem para a próxima palavra, acertar só tira um
          pts += gain; solved++; wrong = Math.max(0, wrong - 1); locked = true; draw();
          el.querySelector('#p').textContent = pts; el.querySelector('#w').textContent = solved;
          floatLabel('+' + gain);
          timers.push(setTimeout(next, 900));
          return;
        }
      } else {
        key.classList.add('no'); wrong++; beep(150, 140, 'square', 0.03);
        if (wrong >= MAX) { locked = true; sfx.bad(); draw(); timers.push(setTimeout(finish, 1500)); return; }
      }
      draw();
    };
    const floatLabel = txt => {
      const s = Object.assign(document.createElement('span'), { className: 'fl-pts', textContent: txt });
      wl.append(s); timers.push(setTimeout(() => s.remove(), 900));
    };
    keys.forEach(k => k.onclick = () => guess(k.dataset.l));
    const onKey = e => { if (e.ctrlKey || e.metaKey || e.altKey) return; const l = norm(e.key); if (l.length === 1) guess(l); };
    addEventListener('keydown', onKey);
    next();
    return () => { locked = true; removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
  }
};
