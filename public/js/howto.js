// ---------- antes da partida: "Como jogar", contagem 3-2-1 e o desafio do dia com sorteio igual pra todos ----------

// Como jogar: 3 passos curtos e as teclas de cada jogo. Aparece sozinho só na 1ª partida (depois, no botão "?").
// A ilustração é a mesma cena 3D do card do menu (cards3d.js); sem 3D, fica o ícone do jogo.
const HOWTO = {
  reflexo: { steps: ['Espere o botão ficar verde', 'Clique (ou Espaço) o mais rápido que puder', 'Vale a média de 3 rodadas; clicou antes, recomeça'], keys: ['Clique', 'Espaço'] },
  clique: { steps: ['O tempo começa no 1º clique', 'Clique o máximo que puder em 10 segundos', 'Ritmo certinho demais é barrado (autoclicker)'], keys: ['Clique', 'Toque'] },
  digitacao: { steps: ['Digite a palavra destacada e aperte Espaço', 'Errou uma letra? A palavra fica vermelha na hora', 'Vale o número de palavras certas em 30s'], keys: ['Teclado', 'Espaço'] },
  memoria: { steps: ['Observe a sequência de cores acendendo', 'Repita na mesma ordem', 'A cada rodada entra mais uma cor'], keys: ['1 2 3 4', 'Q W A S', 'Clique'] },
  mira: { steps: ['O tempo começa no 1º alvo acertado', 'Acerte os 20 alvos o mais rápido possível', 'Clique fora do alvo soma +0,5s'], keys: ['Mouse', 'Toque'] },
  snake: { steps: ['Coma as frutas pra crescer; cada uma acelera', 'Dourada vale 5; a azul encolhe o rabo', 'Não bata na parede nem em você'], keys: ['Setas', 'WASD', 'Deslize'] },
  matematica: { steps: ['Resolva a conta e digite a resposta', 'Ela vai sozinha quando tem os dígitos certos', 'Acertos seguidos fazem combo até x4'], keys: ['Números', 'Enter'] },
  voa: { steps: ['Bata as asas pra subir', 'Passe entre os canos sem encostar', 'Pegue estrela (+3), escudo e relógio (câmera lenta)'], keys: ['Espaço', 'Clique', 'Toque'] },
  chuva: { steps: ['Ande de um lado pro outro', 'Desvie dos bugs que caem', 'O café deixa tudo lento por 3s'], keys: ['← →', 'A D', 'Arraste'] },
  cores: { steps: ['Clique na COR da tinta, não na palavra', 'Palavra com moldura: vale o que está ESCRITO', 'Erro tira 1 ponto e zera o combo'], keys: ['1 2 3 4', 'Clique'] },
  numeros: { steps: ['Aperte Começar', 'Clique de 1 a 25, em ordem', 'Clique errado soma +0,5s'], keys: ['Clique', 'Toque'] },
  toupeira: { steps: ['Acerte as toupeiras antes que se escondam', 'Estrela vale 3 e a dourada 5', 'Bomba tira 3 e zera o combo'], keys: ['Clique', 'Teclado numérico'] },
  blocos: { steps: ['Encaixe as peças e complete linhas', 'Guarde uma peça com C pra usar depois', 'Limpe linhas em peças seguidas: o combo sobe até x4'], keys: ['← →', '↑ / X gira', 'Z gira ao contrário', '↓', 'Espaço solta', 'C guarda'] },
  tijolos: { steps: ['Rebata a bola com a raquete', 'Tijolos escuros pedem mais de uma batida', 'Pegue os itens que caem (raquete grande, 3 bolas, bola lenta)'], keys: ['Mouse', '← →', 'Espaço lança'] },
  g2048: { steps: ['Deslize: todas as peças vão pro mesmo lado', 'Peças iguais se juntam e somam', '3 minutos ou até travar o tabuleiro'], keys: ['Setas', 'WASD', 'Deslize'] },
  torre: { steps: ['Solte o bloco em cima da torre', 'O que passa da borda é cortado', 'Acertos perfeitos seguidos aumentam o bloco'], keys: ['Espaço', 'Clique', 'Toque'] },
  invasores: { steps: ['Ande e o tiro sai sozinho', 'Se esconda atrás das barreiras', 'A nave-mãe lá em cima vale bônus'], keys: ['← →', 'A D', 'Arraste'] },
  minado: { steps: ['Abra as casas sem mina; o número diz quantas minas tem em volta', 'Marque as minas com bandeira', 'Clique num número com as bandeiras certas: abre os vizinhos'], keys: ['Clique abre', 'Botão direito marca', 'Toque longo marca'] },
  ritmo: { steps: ['A música toca; as notas descem nas 4 faixas', 'Aperte quando a nota cruzar a linha', 'Nota comprida: segure até o fim'], keys: ['D F J K', 'Setas', 'Toque'] },
  anagrama: { steps: ['Desembaralhe as letras e forme a palavra', 'A dica mostra o tema da palavra', 'Palavra maior vale mais', 'Letra (−1) revela uma letra e tira 1 ponto'], keys: ['Teclado', 'Enter', 'Clique nas letras'] },
  sudoku: { steps: ['Complete com 1 a 9 sem repetir na linha, coluna e bloco', 'Use as notas pra anotar candidatos', 'Menor tempo ganha; dica soma +20s'], keys: ['1–9', 'Setas', 'N notas', 'Ctrl+Z'] },
  pong: { steps: ['Rebata a bola com a sua raquete (embaixo)', 'Bater com a raquete andando dá efeito na bola', 'Ponto quando a bola passa pela máquina'], keys: ['Mouse', '← →', 'Espaço'] },
  forca: { steps: ['Descubra a palavra letra por letra', 'Errou 6 letras, acabou', 'Os erros continuam na próxima palavra; cada acerto tira um'], keys: ['Teclado', 'Toque'] },
  ligue4: { steps: ['Solte peças nas colunas', 'Ligue 4 em linha (reta ou diagonal)', 'Cada vitória deixa a máquina mais esperta'], keys: ['1–7', 'Clique'] },
  corredor: { steps: ['Pule os cactos e os urubus baixos', 'Segure o pulo pra ir mais alto', 'Abaixe pra passar por baixo do bando; pegue moedas'], keys: ['Espaço / ↑', '↓ abaixa', 'Toque'] },
  comecome: { steps: ['Coma todas as bolinhas do labirinto', 'A bola grande deixa os fantasmas azuis: aí você come eles', 'A fruta no meio vale bônus'], keys: ['Setas', 'WASD', 'Deslize'] },
  termo: { steps: ['Adivinhe a palavra do dia em 6 tentativas', 'Verde: letra no lugar certo; amarelo: existe em outro lugar', 'Só vale palavra que existe'], keys: ['Teclado', 'Enter'] },
  dueto: { steps: ['Adivinhe 2 palavras ao mesmo tempo em 7 tentativas', 'Cada palpite vale pros dois quadros', 'A tecla mostra a cor de cada quadro: esquerda e direita'], keys: ['Teclado', 'Enter'] },
  quarteto: { steps: ['Adivinhe 4 palavras ao mesmo tempo em 9 tentativas', 'Cada palpite vale pros quatro quadros', 'A tecla mostra a cor de cada quadro em um canto'], keys: ['Teclado', 'Enter'] },
  contexto: { steps: ['Chute qualquer palavra', 'O número é a posição dela: quanto menor, mais perto do sentido da secreta', 'Ficou difícil? A dica mostra uma palavra mais perto'], keys: ['Teclado', 'Enter'] },
  conexoes: { steps: ['Ache 4 palavras com algo em comum e envie', 'São 4 grupos; amarelo é o mais fácil, roxo é jogo de palavras', '4 erros e acabou'], keys: ['Clique', 'Toque'] },
  alvo: { steps: ['Toque num número, numa operação e em outro número', 'Os dois viram o resultado; continue até chegar no alvo', 'Vale o resultado mais perto; só uma tentativa por dia'], keys: ['Clique', 'Toque'] },
  octeto: { steps: ['Adivinhe 8 palavras ao mesmo tempo em 13 tentativas', 'Cada palpite vale pros oito quadros', 'A tecla mostra a cor de cada quadro: 4 em cima, 4 embaixo'], keys: ['Teclado', 'Enter'] },
  soletra: { steps: ['Forme palavras de 4 letras ou mais com as letras da colmeia', 'Toda palavra usa a letra do meio; pode repetir letra', 'Usou as 7 letras? +7 pontos. Encerre quando quiser'], keys: ['Teclado', 'Toque'] },
  senha: { steps: ['Monte 4 cores e envie (pode repetir cor)', 'Verde com check: cores certas no lugar certo; amarelo: cores certas em outro lugar', '8 tentativas pra descobrir a senha'], keys: ['1 a 6', 'Toque'] },
  equacao: { steps: ['Descubra a conta do dia: 8 símbolos, tipo 12+35=47', 'Todo palpite tem que ser uma conta certa', 'Verde: lugar certo; amarelo: está em outro lugar. × e ÷ antes de + e −'], keys: ['Teclado', 'Enter'] },
  bandeira: { steps: ['Digite o país da bandeira', 'Errou? Veja a distância, a direção e o quanto chegou perto', 'Com 2 erros aparece o continente; com 4, a capital'], keys: ['Teclado', 'Enter'] },
  cacapalavras: { steps: ['Arraste da primeira à última letra da palavra', 'Vale horizontal, vertical, diagonal e de trás pra frente', 'Ache as 8 o mais rápido possível'], keys: ['Arrastar', 'Toque'] },
  cruzadinha: { steps: ['Toque numa casa e digite: a dica de cima é a da palavra marcada', 'Toque de novo na casa pra trocar entre horizontal e vertical', 'Encheu a grade? Ela é enviada sozinha. Conferir mostra os erros, mas tira 60 pontos'], keys: ['Teclado', 'Tab'] },
  quiz: { steps: ['Escolha a alternativa certa', 'Acertos seguidos fazem combo até x4', 'Erro tira 1 ponto e mostra a certa'], keys: ['1 2 3 4', 'Clique'] },
};
const howtoSeen = id => { try { return localStorage.getItem('mg_howto_' + id) === '1'; } catch { return true; } };
const howtoMark = id => { try { localStorage.setItem('mg_howto_' + id, '1'); } catch {} };

/** Mostra o "Como jogar" dentro de `el`; `then` roda quando a pessoa aperta Jogar. Devolve a limpeza. */
function showHowto(id, el, then) {
  const g = GAMES[id], h = HOWTO[id];
  const box = document.createElement('div');
  box.className = 'howto';
  box.innerHTML = `<div class="howto-card glass" style="--h:${g.hue}" role="dialog" aria-label="Como jogar ${esc(g.name)}">
      <div class="howto-art">${icon(g.icon)}</div>
      <h3>Como jogar</h3>
      <ol>${h.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <div class="howto-keys">${h.keys.map(k => `<kbd>${esc(k)}</kbd>`).join('')}</div>
      <button class="btn" id="howGo">${icon('play')} Jogar</button>
    </div>`;
  el.append(box);
  // ilustração: a cena 3D do card (se o 3D estiver ligado e a biblioteca já veio)
  const build = typeof SCENES_3D !== 'undefined' && SCENES_3D[id];
  let scene = null;
  if (build && fx3dOn && window.Zdog) {
    const canvas = Object.assign(document.createElement('canvas'), { className: 'z3d', width: 150, height: 150 });
    box.querySelector('.howto-art').replaceChildren(canvas);
    const illo = new Zdog.Illustration({ element: canvas, zoom: 1 });
    scene = { canvas, illo, update: build(Zdog, illo) };
    scenes3d.push(scene);
    io?.observe(canvas);
    if (!loopOn) { loopOn = true; requestAnimationFrame(loop); }
  }
  const close = () => {
    if (scene) { scenes3d = scenes3d.filter(s => s !== scene); io?.unobserve(scene.canvas); }
    removeEventListener('keydown', onKey);
    box.remove();
  };
  const go = () => { howtoMark(id); close(); then(); };
  const onKey = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  addEventListener('keydown', onKey);
  box.querySelector('#howGo').onclick = go;
  box.querySelector('#howGo').focus();
  return close;
}

// jogos em que o tempo corre desde o começo: contagem 3, 2, 1 antes (o jogo começa no "Vai!")
const COUNTDOWN = new Set(['matematica', 'cores', 'quiz', 'anagrama', 'digitacao']);

/** Prepara a partida (como jogar na 1ª vez, contagem) e chama `start`. Enquanto isso, `cleanup` desfaz o que ficou pendente. */
function prepareGame(id, el, start) {
  let undo = null;
  const countdown = () => {
    if (!COUNTDOWN.has(id)) return start();
    const ov = document.createElement('div');
    ov.className = 'countdown';
    el.append(ov);
    const steps = ['3', '2', '1', 'Vai!'], timers = [];
    steps.forEach((t, k) => timers.push(setTimeout(() => {
      ov.textContent = t; ov.classList.remove('tick'); void ov.offsetWidth; ov.classList.add('tick');
      beep(k < 3 ? 440 : 880, k < 3 ? 80 : 140, 'triangle', 0.04);
    }, k * 550)));
    timers.push(setTimeout(() => { ov.remove(); cleanup = null; start(); }, steps.length * 550 - 150));
    undo = () => timers.forEach(clearTimeout);
    cleanup = () => undo();
  };
  if (!howtoSeen(id) && HOWTO[id]) {
    const close = showHowto(id, el, countdown);
    cleanup = () => { close(); undo?.(); };
  } else countdown();
}

// ---------- desafio do dia: a mesma sequência pra todo mundo ----------
// No jogo do desafio, o sorteio do jogo (contas, toupeiras, canos, perguntas...) sai de uma semente: dia + jogo + nº da
// partida de hoje. Assim a 1ª partida de todo mundo é igual, a 2ª também, e assim por diante (repetir não dá pra decorar).
let realRandom = null, dailySeeded = false;
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function seedDaily(id) {
  unseedDaily();
  if (localMode || id !== dailyGame()) return;
  const key = `mg_daily_${dayIndex()}_${id}`;
  let n = 0; try { n = +localStorage.getItem(key) || 0; localStorage.setItem(key, n + 1); } catch {}
  let h = dayIndex() * 31 + n * 7919;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 2654435761);
  realRandom = Math.random;
  Math.random = mulberry32(h);
  dailySeeded = true;
  const tag = document.createElement('span');
  tag.className = 'daily-tag';
  tag.innerHTML = `${icon('calendar')} Desafio do dia: partida ${n + 1} igual pra todo mundo`;
  document.querySelector('.stage-head .title')?.append(tag);
}
function unseedDaily() {
  if (realRandom) { Math.random = realRandom; realRandom = null; }
  dailySeeded = false;
}
