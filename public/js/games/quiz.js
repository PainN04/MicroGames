GAMES.quiz = {
  name: 'Quiz de TI', icon: 'lightbulb', hue: 200, desc: 'Perguntas de TI e de escritório, 4 alternativas, 60s. Acertos seguidos fazem combo (até x4). Erro tira 1 ponto, zera o combo e mostra a certa.',
  better: 'high', unit: 'pontos',
  start(el, done) {
    // [pergunta, resposta certa, 3 erradas] — as alternativas são embaralhadas a cada pergunta
    const Q = [
      ['O que significa CPU?', 'Unidade Central de Processamento', 'Computador Pessoal Universal', 'Central de Programas Úteis', 'Controle de Potência Unificado'],
      ['Qual atalho copia no Windows?', 'Ctrl + C', 'Ctrl + V', 'Ctrl + X', 'Ctrl + Z'],
      ['Qual atalho desfaz a última ação?', 'Ctrl + Z', 'Ctrl + Y', 'Ctrl + D', 'Ctrl + U'],
      ['Qual atalho bloqueia o Windows na hora?', 'Windows + L', 'Windows + D', 'Alt + F4', 'Ctrl + L'],
      ['O que o Alt + Tab faz?', 'Troca de janela', 'Fecha a janela', 'Abre o menu Iniciar', 'Tira um print'],
      ['Windows + Shift + S serve pra...', 'Recortar um print da tela', 'Salvar o arquivo', 'Desligar o PC', 'Abrir as configurações'],
      ['Ctrl + Shift + T no navegador...', 'Reabre a aba fechada', 'Abre aba anônima', 'Fecha todas as abas', 'Abre o histórico'],
      ['Qual porta o HTTPS usa por padrão?', '443', '80', '21', '8080'],
      ['Qual porta o HTTP usa por padrão?', '80', '443', '22', '25'],
      ['Qual porta o SSH usa por padrão?', '22', '21', '23', '3389'],
      ['Qual porta o RDP (área de trabalho remota) usa?', '3389', '22', '5900', '445'],
      ['O que o DNS faz?', 'Traduz nomes em endereços IP', 'Distribui IPs automaticamente', 'Criptografa a conexão', 'Bloqueia vírus'],
      ['O que o DHCP faz?', 'Distribui IPs automaticamente', 'Traduz nomes em IP', 'Guarda senhas', 'Acelera o Wi-Fi'],
      ['Qual destes é um IP privado?', '192.168.0.10', '8.8.8.8', '200.160.2.3', '1.1.1.1'],
      ['127.0.0.1 é...', 'A própria máquina (localhost)', 'O roteador', 'O DNS do Google', 'Um IP público'],
      ['Quantos bits tem um endereço IPv4?', '32', '64', '128', '16'],
      ['Quantos bits tem um byte?', '8', '4', '16', '10'],
      ['1 GB tem aproximadamente quantos MB?', '1024', '100', '512', '10.000'],
      ['O comando ping serve pra...', 'Testar se um host responde', 'Baixar arquivos', 'Trocar a senha', 'Limpar o cache'],
      ['Qual comando mostra o IP no Windows?', 'ipconfig', 'ifconfig /all', 'netstat -ip', 'showip'],
      ['Qual comando limpa o cache de DNS no Windows?', 'ipconfig /flushdns', 'ipconfig /release', 'dns clear', 'netsh reset'],
      ['O que é phishing?', 'Golpe que imita alguém pra roubar dados', 'Um tipo de backup', 'Um antivírus', 'Uma rede sem fio'],
      ['O que é ransomware?', 'Vírus que sequestra arquivos e pede resgate', 'Programa de limpeza', 'Firewall gratuito', 'Gerenciador de senhas'],
      ['O que a autenticação em dois fatores (2FA) pede?', 'Algo além da senha', 'Duas senhas iguais', 'Dois computadores', 'Trocar a senha 2 vezes'],
      ['Qual destas senhas é mais forte?', 'V3rde!Cafe#Mesa29', '12345678', 'senha123', 'admin'],
      ['O que é VPN?', 'Rede privada virtual', 'Vírus de rede', 'Velocidade por navegação', 'Visualizador de PDF'],
      ['O que é um firewall?', 'Filtro do tráfego de rede', 'Um tipo de cabo', 'Um processador', 'Um editor de texto'],
      ['O que significa HTML?', 'HyperText Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language', 'Hyperlink Text Mode Link'],
      ['CSS serve pra...', 'Estilizar páginas web', 'Guardar dados', 'Criar senhas', 'Rodar servidores'],
      ['Qual linguagem roda nativamente no navegador?', 'JavaScript', 'Python', 'C#', 'Java'],
      ['SQL é usado pra...', 'Consultar bancos de dados', 'Desenhar telas', 'Editar fotos', 'Enviar e-mail'],
      ['Qual comando SQL busca dados?', 'SELECT', 'INSERT', 'DELETE', 'DROP'],
      ['Qual comando SQL apaga uma tabela inteira?', 'DROP TABLE', 'SELECT', 'UPDATE', 'ORDER BY'],
      ['O que o Git faz?', 'Controla versões do código', 'Hospeda sites', 'Compila Java', 'Protege contra vírus'],
      ['Qual comando do Git envia commits pro servidor?', 'git push', 'git pull', 'git clone', 'git init'],
      ['Qual comando do Git baixa as mudanças do servidor?', 'git pull', 'git push', 'git commit', 'git add'],
      ['Status HTTP 404 quer dizer...', 'Não encontrado', 'Tudo certo', 'Erro no servidor', 'Sem permissão'],
      ['Status HTTP 500 quer dizer...', 'Erro no servidor', 'Não encontrado', 'Redirecionado', 'Tudo certo'],
      ['Status HTTP 200 quer dizer...', 'Tudo certo', 'Não encontrado', 'Erro no servidor', 'Proibido'],
      ['Status HTTP 403 quer dizer...', 'Proibido', 'Tudo certo', 'Não encontrado', 'Muitos pedidos'],
      ['O que é RAM?', 'Memória temporária de trabalho', 'Disco onde ficam os arquivos', 'Placa de vídeo', 'Fonte de energia'],
      ['SSD comparado ao HD comum é...', 'Mais rápido', 'Mais lento', 'Igual', 'Só serve pra backup'],
      ['O que é um SLA?', 'Prazo de atendimento combinado', 'Um tipo de servidor', 'Um cabo de rede', 'Uma planilha'],
      ['Ticket "aguardando cliente" está esperando...', 'Uma resposta do cliente', 'O técnico', 'O fim do mês', 'O backup'],
      ['Backup 3-2-1 significa...', '3 cópias, 2 mídias, 1 fora do local', '3 dias, 2 horas, 1 minuto', '3 discos, 2 senhas, 1 nuvem', '3 usuários, 2 grupos, 1 admin'],
      ['O que é a nuvem (cloud)?', 'Servidores acessados pela internet', 'Um tipo de Wi-Fi', 'Memória do celular', 'Um antivírus'],
      ['Wi-Fi de 5 GHz comparado ao de 2,4 GHz...', 'É mais rápido e alcança menos', 'Alcança mais e é mais lento', 'É igual', 'Não funciona em notebook'],
      ['Qual destes é um navegador?', 'Firefox', 'Excel', 'Outlook', 'Teams'],
      ['Qual destes é um sistema operacional?', 'Linux', 'Chrome', 'Word', 'Zoom'],
      ['No Excel, qual fórmula soma um intervalo?', '=SOMA(A1:A10)', '=TOTAL(A1-A10)', '=MAIS(A1:A10)', '=ADD(A1;A10)'],
      ['No Excel, PROCV serve pra...', 'Procurar um valor numa tabela', 'Contar células vazias', 'Arredondar números', 'Somar datas'],
      ['No e-mail, CCO quer dizer...', 'Cópia oculta', 'Cópia obrigatória', 'Com cópia original', 'Caixa de saída'],
      ['O que é spam?', 'Mensagem em massa não pedida', 'Anexo grande', 'E-mail importante', 'Assinatura de e-mail'],
      ['O que é um PDF?', 'Formato de documento portátil', 'Planilha', 'Banco de dados', 'Linguagem de programação'],
      ['Ctrl + F serve pra...', 'Procurar na página', 'Fechar o programa', 'Formatar o texto', 'Abrir um arquivo'],
      ['Ctrl + S serve pra...', 'Salvar', 'Selecionar tudo', 'Sair', 'Sublinhar'],
      ['Ctrl + A serve pra...', 'Selecionar tudo', 'Abrir', 'Apagar', 'Alinhar'],
      ['F5 no navegador...', 'Recarrega a página', 'Abre a ajuda', 'Tela cheia', 'Fecha a aba'],
      ['F2 no Windows Explorer...', 'Renomeia o arquivo', 'Apaga o arquivo', 'Copia o arquivo', 'Abre o arquivo'],
      ['Qual destes é um protocolo de e-mail?', 'SMTP', 'FTP', 'SSH', 'DNS'],
      ['FTP é usado pra...', 'Transferir arquivos', 'Mandar e-mail', 'Resolver nomes', 'Fazer chamadas'],
      ['O que é um endereço MAC?', 'Identificador da placa de rede', 'Senha do Wi-Fi', 'Endereço do site', 'Versão do Mac'],
      ['O que é latência?', 'Atraso até a resposta chegar', 'Velocidade de download', 'Tamanho do arquivo', 'Quantidade de RAM'],
      ['Qual cabo é o mais comum em rede cabeada?', 'RJ45', 'HDMI', 'VGA', 'USB-C'],
      ['O que o HDMI transmite?', 'Vídeo e áudio', 'Só energia', 'Só internet', 'Só dados de impressora'],
      ['Qual destes é um banco de dados?', 'PostgreSQL', 'Photoshop', 'Chrome', 'Notepad'],
      ['O que é uma API?', 'Interface pra sistemas conversarem', 'Um tipo de vírus', 'Um monitor', 'Uma planilha'],
      ['JSON é um formato de...', 'Dados em texto', 'Imagem', 'Áudio', 'Vídeo'],
      ['O que é bug?', 'Um defeito no software', 'Um cabo solto', 'Uma atualização', 'Um tipo de backup'],
      ['Reiniciar o computador costuma...', 'Resolver muita coisa', 'Apagar os arquivos', 'Formatar o disco', 'Trocar a senha'],
    ];
    const DUR = 60;
    const deck = [...Q].sort(() => Math.random() - 0.5);
    let pts = 0, right = -1, t0 = 0, iv, over = false, lock = false, wait;
    el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat combo">Combo<b id="cb">x1</b></span><span class="stat">Tempo<b id="t">60s</b></span></div>
      <p class="quiz-q" id="q" aria-live="polite"></p>
      <div class="choices quiz">${[0, 1, 2, 3].map(k => `<button class="btn ghost" data-k="${k}"><span></span> <kbd>${k + 1}</kbd></button>`).join('')}</div>
      <p class="hint">Teclas 1–4 também valem.</p>`;
    const qEl = el.querySelector('#q'), btns = [...el.querySelectorAll('.choices .btn')], combo = makeCombo(el.querySelector('#cb'));
    function next() {
      const [q, ok, ...bad] = deck.pop() || Q[rand(0, Q.length - 1)];
      const opts = [ok, ...bad].sort(() => Math.random() - 0.5);
      right = opts.indexOf(ok);
      qEl.textContent = q;
      btns.forEach((b, k) => { b.classList.remove('right', 'wrong'); b.querySelector('span').textContent = opts[k]; });
      lock = false;
    }
    function answer(k) {
      if (over || lock) return;
      if (!t0) {
        t0 = performance.now();
        iv = setInterval(() => {
          const left = DUR - (performance.now() - t0) / 1000;
          el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
          if (left <= 0 && !over) { over = true; clearInterval(iv); clearTimeout(wait); done(pts); }
        }, 100);
      }
      if (k === right) { pts += combo.hit(); sfx.good(); next(); }
      else {
        // mostra a certa por um instante: ensina e evita ficar chutando rápido
        combo.miss();
        pts = Math.max(0, pts - 1);
        beep(160, 120, 'square', 0.03);
        lock = true;
        btns[k].classList.add('wrong'); btns[right].classList.add('right');
        wait = setTimeout(next, 900);
      }
      el.querySelector('#p').textContent = pts;
    }
    btns.forEach(b => b.onpointerdown = e => { e.preventDefault(); answer(+b.dataset.k); });
    const onKey = e => { const k = +e.key - 1; if (k >= 0 && k < 4 && !e.repeat) answer(k); };
    window.addEventListener('keydown', onKey);
    next();
    return () => { over = true; clearInterval(iv); clearTimeout(wait); window.removeEventListener('keydown', onKey); };
  }
};
