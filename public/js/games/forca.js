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
      // --- mais palavras (a lista acabava rápido pra quem joga bem) ---
      ['APLICATIVO', 'TI'], ['DISPOSITIVO', 'TI'], ['PERIFÉRICO', 'TI'], ['DRIVER', 'TI'], ['PLATAFORMA', 'TI'], ['SERVIÇO', 'TI'], ['LICENÇA', 'TI'], ['INVENTÁRIO', 'TI'],
      ['MANUTENÇÃO', 'TI'], ['CONFIGURAÇÃO', 'TI'], ['PAINEL', 'TI'], ['ÍCONE', 'TI'], ['JANELA', 'TI'], ['ATALHO', 'TI'], ['CURSOR', 'TI'], ['TECLA', 'TI'],
      ['ARMAZENAMENTO', 'TI'], ['PARTIÇÃO', 'TI'], ['FORMATAR', 'TI'], ['DIRETÓRIO', 'TI'], ['EXTENSÃO', 'TI'], ['COMPACTAR', 'TI'], ['EXTRAIR', 'TI'], ['LIXEIRA', 'TI'],
      ['ÁREA DE TRABALHO', 'TI'], ['ACESSO REMOTO', 'TI'], ['MÁQUINA VIRTUAL', 'TI'], ['CONTÊINER', 'TI'], ['MONITORAMENTO', 'TI'], ['SERVIDOR DE ARQUIVOS', 'TI'],
      ['CLASSE', 'Programação'], ['OBJETO', 'Programação'], ['MÉTODO', 'Programação'], ['HERANÇA', 'Programação'], ['PARÂMETRO', 'Programação'], ['ARGUMENTO', 'Programação'],
      ['RETORNO', 'Programação'], ['LAÇO', 'Programação'], ['CONDIÇÃO', 'Programação'], ['VETOR', 'Programação'], ['MATRIZ', 'Programação'], ['PONTEIRO', 'Programação'],
      ['EXCEÇÃO', 'Programação'], ['SINTAXE', 'Programação'], ['COMENTÁRIO', 'Programação'], ['INDENTAÇÃO', 'Programação'], ['FRAMEWORK', 'Programação'],
      ['BRANCH', 'Programação'], ['COMMIT', 'Programação'], ['MERGE', 'Programação'], ['DEPLOY', 'Programação'], ['TESTE UNITÁRIO', 'Programação'],
      ['REFATORAR', 'Programação'], ['CONSULTA', 'Programação'], ['TABELA', 'Programação'], ['ÍNDICE', 'Programação'], ['CHAVE PRIMÁRIA', 'Programação'],
      ['JAVASCRIPT', 'Programação'], ['PYTHON', 'Programação'], ['TERMINAL', 'Programação'], ['COMPILAR', 'Programação'], ['EXECUTAR', 'Programação'],
      ['VERSIONAMENTO', 'Programação'], ['DOCUMENTAÇÃO', 'Programação'], ['SERVIDOR DNS', 'Internet'], ['ENDEREÇO IP', 'Internet'], ['NAVEGAÇÃO', 'Internet'],
      ['HOSPEDAGEM', 'Internet'], ['BANDA LARGA', 'Internet'], ['FIBRA ÓTICA', 'Internet'], ['MODEM', 'Internet'], ['PROXY', 'Internet'], ['STREAMING', 'Internet'],
      ['REDE SOCIAL', 'Internet'], ['HASHTAG', 'Internet'], ['PERFIL', 'Internet'], ['SEGUIDOR', 'Internet'], ['CURTIDA', 'Internet'], ['MENSAGEM', 'Internet'],
      ['CHAT', 'Internet'], ['VIDEOCHAMADA', 'Internet'], ['WEBINAR', 'Internet'], ['PODCAST', 'Internet'], ['BLOG', 'Internet'], ['FÓRUM', 'Internet'],
      ['COOKIE', 'Internet'], ['CACHE', 'Internet'], ['SENHA FORTE', 'Segurança'], ['VAZAMENTO', 'Segurança'], ['INVASOR', 'Segurança'], ['HACKER', 'Segurança'],
      ['MALWARE', 'Segurança'], ['SPAM', 'Segurança'], ['GOLPE', 'Segurança'], ['BLOQUEIO', 'Segurança'], ['PERMISSÃO', 'Segurança'], ['TOKEN', 'Segurança'],
      ['BIOMETRIA', 'Segurança'], ['CERTIFICADO', 'Segurança'], ['AUDITORIA', 'Segurança'], ['PRIVACIDADE', 'Segurança'], ['CADEADO', 'Segurança'],
      ['VULNERABILIDADE', 'Segurança'], ['RANSOMWARE', 'Segurança'], ['QUARENTENA', 'Segurança'], ['GABINETE', 'Hardware'], ['FONTE', 'Hardware'], ['PLACA MÃE', 'Hardware'],
      ['MEMÓRIA RAM', 'Hardware'], ['DISCO RÍGIDO', 'Hardware'], ['COOLER', 'Hardware'], ['VENTOINHA', 'Hardware'], ['TECLADO SEM FIO', 'Hardware'],
      ['ESTABILIZADOR', 'Hardware'], ['NOBREAK', 'Hardware'], ['MICROFONE', 'Hardware'], ['CAIXA DE SOM', 'Hardware'], ['ADAPTADOR', 'Hardware'], ['TABLET', 'Hardware'],
      ['IMPRESSORA LASER', 'Hardware'], ['CARTUCHO', 'Hardware'], ['TONER', 'Hardware'], ['SWITCH', 'Hardware'], ['ANTENA', 'Hardware'], ['ESCALONAR', 'Suporte'],
      ['DIAGNÓSTICO', 'Suporte'], ['PROCEDIMENTO', 'Suporte'], ['MANUAL', 'Suporte'], ['TUTORIAL', 'Suporte'], ['TREINAMENTO', 'Suporte'], ['PLANTÃO', 'Suporte'],
      ['SOBREAVISO', 'Suporte'], ['INCIDENTE', 'Suporte'], ['REQUISIÇÃO', 'Suporte'], ['CATEGORIA', 'Suporte'], ['SATISFAÇÃO', 'Suporte'], ['PESQUISA', 'Suporte'],
      ['FEEDBACK', 'Suporte'], ['PROTOCOLO DE ATENDIMENTO', 'Suporte'], ['ACOMPANHAMENTO', 'Suporte'], ['ENCERRAMENTO', 'Suporte'], ['CLIPE', 'Escritório'],
      ['ETIQUETA', 'Escritório'], ['ENVELOPE', 'Escritório'], ['CARIMBO', 'Escritório'], ['CADERNO', 'Escritório'], ['MARCA TEXTO', 'Escritório'], ['POST-IT', 'Escritório'],
      ['QUADRO BRANCO', 'Escritório'], ['APAGADOR', 'Escritório'], ['TESOURA', 'Escritório'], ['RÉGUA', 'Escritório'], ['BORRACHA', 'Escritório'],
      ['LAPISEIRA', 'Escritório'], ['FURADOR', 'Escritório'], ['ARQUIVO MORTO', 'Escritório'], ['RECEPÇÃO', 'Escritório'], ['PORTARIA', 'Escritório'],
      ['ESTACIONAMENTO', 'Escritório'], ['REFEITÓRIO', 'Escritório'], ['CRONOGRAMA', 'Escritório'], ['PLANEJAMENTO', 'Escritório'], ['INDICADOR', 'Escritório'],
      ['RESULTADO', 'Escritório'], ['BALANÇO', 'Escritório'], ['COMPRAS', 'Escritório'], ['FINANCEIRO', 'Escritório'], ['RECURSOS HUMANOS', 'Escritório'],
      ['JURÍDICO', 'Escritório'], ['MARKETING', 'Escritório'], ['VENDAS', 'Escritório'], ['LOGÍSTICA', 'Escritório'], ['DIRETORIA', 'Escritório'], ['FÉRIAS', 'Escritório'],
      ['FERIADO', 'Escritório'], ['HORA EXTRA', 'Escritório'], ['BANCO DE HORAS', 'Escritório'], ['HOLERITE', 'Escritório'], ['BENEFÍCIO', 'Escritório'],
      ['VALE REFEIÇÃO', 'Escritório'], ['ADMISSÃO', 'Escritório'], ['CONTRATAÇÃO', 'Escritório'], ['ENTREVISTA', 'Escritório'], ['CURRÍCULO', 'Escritório'],
      ['ESTÁGIO', 'Escritório'], ['PALESTRA', 'Escritório'], ['CONFRATERNIZAÇÃO', 'Escritório'], ['AMIGO SECRETO', 'Escritório'], ['ANIVERSARIANTE', 'Escritório'],
      ['COMUNICADO', 'Escritório'], ['MEMORANDO', 'Escritório'], ['ATA', 'Escritório'], ['ASSINATURA', 'Escritório'],
    ];
    const MAX = 6, ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const deck = shuffled(WORDS);
    let word = '', hint = '', plain = '', guessed = new Set(), wrong = 0, pts = 0, solved = 0, locked = false, timers = [];
    // forca desenhada em SVG: cada erro mostra mais uma parte do boneco
    // boneco colorido (cabeça, camiseta, braços, calça) e um rosto que muda de humor conforme os erros
    const SKIN = 'fill:#f4cba8;stroke:#7a4d2c;stroke-width:3', ARM = 'stroke:#e8b48f;stroke-width:6', LEG = 'stroke:#3d4a8f;stroke-width:7';
    const PARTS = [`<circle cx="150" cy="62" r="16" style="${SKIN}"/>`, '<path d="M150 79v50" style="stroke:#5ce1ff;stroke-width:11"/>',
      `<path d="M146 90l-24 24" style="${ARM}"/>`, `<path d="M154 90l24 24" style="${ARM}"/>`, `<path d="M147 128l-20 40" style="${LEG}"/>`, `<path d="M153 128l20 40" style="${LEG}"/>`];
    const FACE = n => {
      const eye = 'fill:#1b1410;stroke:none', line = 'stroke:#1b1410;stroke-width:2.2;fill:none';
      if (n >= MAX) return `<path d="M141 55l6 6M147 55l-6 6M153 55l6 6M159 55l-6 6" style="${line}"/><path d="M143 72q7-5 14 0" style="${line}"/>`; // olhos em X
      const eyes = n >= 5 ? `<circle cx="144" cy="58" r="3" style="fill:#fff;stroke:#1b1410;stroke-width:1.2"/><circle cx="156" cy="58" r="3" style="fill:#fff;stroke:#1b1410;stroke-width:1.2"/><circle cx="144" cy="58.5" r="1.3" style="${eye}"/><circle cx="156" cy="58.5" r="1.3" style="${eye}"/>`
        : `<circle cx="144" cy="58" r="2.2" style="${eye}"/><circle cx="156" cy="58" r="2.2" style="${eye}"/>`;
      const brows = n >= 3 ? `<path d="M140 52l7 2M160 52l-7 2" style="${line}"/>` : '';
      const mouth = n <= 2 ? `<path d="M143 66q7 6 14 0" style="${line}"/>` : n <= 4 ? `<path d="M144 69h12" style="${line}"/>` : `<ellipse cx="150" cy="69" rx="3.5" ry="4.5" style="${eye}"/>`;
      const sweat = n >= 4 ? '<path d="M166 50q3 5 0 7q-3-2 0-7z" style="fill:#7ad7ff;stroke:none"/>' : '';
      return eyes + brows + mouth + sweat;
    };
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Palavras<b id="w">0</b></span><span class="stat">Erros<b id="e">0/${MAX}</b></span></div>
      <svg class="gallows" viewBox="0 0 220 190" aria-hidden="true"><g class="base"><rect x="14" y="178" width="134" height="9" rx="3" style="fill:#5a3d24;stroke:none"/><rect x="46" y="12" width="12" height="168" rx="3" style="fill:#8a5a2b;stroke:none"/><rect x="50" y="12" width="3" height="166" style="fill:#b07a45;stroke:none"/><rect x="46" y="9" width="112" height="11" rx="3" style="fill:#8a5a2b;stroke:none"/><path d="M58 46L86 20" style="stroke:#6b4a2b;stroke-width:7"/><path d="M150 20v27" style="stroke:#c9a36a;stroke-width:3;stroke-dasharray:4 2"/></g><g class="body" id="body"></g></svg>
      <p class="hint" id="hint"></p>
      <div class="wordline" id="wl" aria-live="polite"></div>
      <div class="keys" id="keys">${[...ALPHA].map(l => `<button class="key" data-l="${l}">${l}</button>`).join('')}</div>`;
    const wl = el.querySelector('#wl'), keys = [...el.querySelectorAll('.key')];
    const draw = () => {
      el.querySelector('#body').innerHTML = PARTS.slice(0, wrong).join('') + (wrong ? `<g class="face">${FACE(wrong)}</g>` : '');
      el.querySelector('#body').classList.toggle('dead', wrong >= MAX);
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
