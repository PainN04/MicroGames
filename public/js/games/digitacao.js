GAMES.digitacao = {
  name: 'Digitação', icon: 'keyboard', hue: 245, desc: 'Digite o máximo de palavras certas em 30s. A palavra fica vermelha assim que você erra uma letra.',
  better: 'high', unit: 'palavras',
  start(el, done) {
    // palavras do dia a dia do escritório e de TI (com acento quando tem: vale digitar certinho)
    const pool = ('casa café reunião planilha email chefe projeto prazo cliente sistema relatório banana janela teclado monitor cadeira trabalho sexta feira almoço  '
      + 'tarefa pessoa código servidor rede mouse papel caneta agenda equipe meta ideia gato cachorro sol chuva verde azul rápido lento grande pequeno feliz  '
      + 'carro mesa porta livro música filme jogo água tempo hora minuto semana manhã tarde noite ontem hoje amanhã sempre nunca agora depois antes junto longe  '
      + 'perto dentro fora acima abaixo escritório sala copa corredor elevador escada crachá ramal telefone celular notebook tela cabo fone impressora scanner  '
      + 'pasta arquivo documento contrato proposta orçamento fatura nota recibo pedido estoque compra venda preço valor custo lucro senha usuário login conta  '
      + 'acesso perfil grupo permissão backup nuvem internet site página link navegador busca download upload versão atualização instalar reiniciar desligar  '
      + 'ligar abrir fechar salvar copiar colar apagar enviar receber responder chamado ticket suporte atendimento problema solução erro falha alerta aviso  '
      + 'status fila prioridade urgente pendente resolvido aberto fechado retorno contato banco dados tabela coluna linha campo registro consulta filtro ordem  '
      + 'lista item total soma média gráfico painel métrica resultado número programa função variável classe objeto método teste deploy commit branch merge  '
      + 'script terminal comando pacote biblioteca módulo bug log amigo colega gerente diretor time líder estagiário analista técnico fornecedor parceiro  '
      + 'visitante reunir planejar decidir organizar revisar aprovar entregar pagar conversar escrever ler ouvir pensar ajudar começar terminar esperar chegar  '
      + 'sair voltar correr andar bom ruim novo velho alto baixo forte fraco claro escuro limpo sujo cheio vazio fácil difícil certo errado simples calmo  '
      + 'bonito pão bolo fruta maçã uva laranja arroz feijão carne peixe salada suco leite queijo chocolate pizza lanche sorvete biscoito cidade rua bairro  '
      + 'praça parque praia montanha rio mar ilha ponte estrada viagem férias hotel mapa trem ônibus avião bicicleta cor vermelho amarelo preto branco cinza  '
      + 'roxo rosa marrom dourado prata sorriso abraço festa presente aniversário convite surpresa piada risada dança sonho janeiro fevereiro março abril maio  '
      + 'junho julho agosto setembro outubro novembro dezembro segunda terça quarta quinta sábado domingo pergunta resposta dúvida exemplo detalhe motivo  '
      + 'assunto tema texto frase palavra letra título nome sobrenome endereço cep data').split(' ');
    const words = Array.from({ length: 120 }, () => pool[rand(0, pool.length - 1)]);
    let i = 0, ok = 0, t0 = 0, iv; const res = [];
    el.innerHTML = '<div class="hud"><span class="stat">Certas<b id="ok">0</b></span><span class="stat">Tempo<b id="t">30s</b></span></div><div class="words" id="w"></div><input class="txt" id="in" placeholder="comece a digitar..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Digite as palavras">';
    const w = el.querySelector('#w'), inp = el.querySelector('#in');
    let typed = 0, wrongWords = 0; // letras de palavras certas e quantas saíram erradas (pro resumo)
    function render() {
      const from = Math.max(0, i - 4);
      w.innerHTML = words.slice(from, i + 12).map((x, k) => {
        const idx = from + k;
        const cls = idx === i ? 'cur' : idx < i ? (res[idx] ? 'ok' : 'bad') : '';
        return `<span class="${cls}">${x}</span>`;
      }).join(' ');
    }
    inp.oninput = () => {
      if (inp.value.endsWith(' ')) {
        res[i] = inp.value.trim() === words[i];
        if (res[i]) { el.querySelector('#ok').textContent = ++ok; typed += words[i].length; } else { wrongWords++; beep(160, 80, 'square', 0.025); }
        i++; inp.value = ''; render();
      }
      // errou uma letra: a palavra atual fica vermelha na hora (sem esperar o espaço)
      const curEl = w.querySelector('.cur');
      if (curEl) curEl.classList.toggle('typo', !words[i].startsWith(inp.value.trimStart()));
      inp.classList.toggle('typo', !words[i].startsWith(inp.value.trimStart()));
    };
    // o tempo começa já (depois da contagem 3, 2, 1)
    const startTimer = () => {
      if (t0) return;
      t0 = performance.now();
      iv = setInterval(() => {
        const left = 30 - (performance.now() - t0) / 1000;
        el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
        if (left <= 0) {
          clearInterval(iv); inp.disabled = true;
          const total = ok + wrongWords;
          summarize([['Palavras por minuto', ok * 2], ['Precisão', total ? Math.round(ok / total * 100) + '%' : '—'], ['Erradas', wrongWords], ['Letras certas', typed]]);
          done(ok);
        }
      }, 100);
    };
    render(); inp.focus(); startTimer();
    return () => clearInterval(iv);
  }
};
