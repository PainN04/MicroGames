// Grupos do Conexões. Cada dia sorteia 1 grupo de cada nível (1 = fácil ... 4 = pegadinha), de temas diferentes,
// e 4 palavras de cada. Uma palavra nunca aparece em dois grupos (o teste confere). Grupos do mesmo `tema` nunca
// saem juntos (Frutas e Doces no mesmo dia teriam palavras que servem nos dois). Pegadinha de propósito pode
// existir entre temas diferentes (MANGA é fruta, mas parece roupa) — sempre só um jeito de fechar os 4 grupos.
const CONEXOES = [
  // nível 1
  { nome: 'Frutas', nivel: 1, tema: 'comida', palavras: ['BANANA', 'MAÇÃ', 'UVA', 'PERA', 'MANGA', 'MAMÃO', 'ABACAXI', 'CAJU', 'GOIABA', 'KIWI'] },
  { nome: 'Animais da fazenda', nivel: 1, tema: 'animais', palavras: ['VACA', 'PORCO', 'CABRA', 'OVELHA', 'GALINHA', 'PATO', 'CAVALO', 'BURRO'] },
  { nome: 'Partes do corpo', nivel: 1, tema: 'corpo', palavras: ['BRAÇO', 'PERNA', 'JOELHO', 'OMBRO', 'COTOVELO', 'PESCOÇO', 'TORNOZELO', 'BARRIGA'] },
  { nome: 'Instrumentos musicais', nivel: 1, tema: 'musica', palavras: ['VIOLÃO', 'PIANO', 'FLAUTA', 'TAMBOR', 'SAXOFONE', 'VIOLINO', 'TROMPETE', 'SANFONA'] },
  { nome: 'Meios de transporte', nivel: 1, tema: 'transporte', palavras: ['ÔNIBUS', 'TREM', 'AVIÃO', 'BARCO', 'MOTO', 'BICICLETA', 'CAMINHÃO', 'TÁXI'] },
  { nome: 'Móveis', nivel: 1, tema: 'casa', palavras: ['SOFÁ', 'CADEIRA', 'ARMÁRIO', 'ESTANTE', 'POLTRONA', 'CÔMODA', 'BANQUETA', 'PUFE'] },
  { nome: 'Peças de roupa', nivel: 1, tema: 'roupa', palavras: ['CAMISA', 'CALÇA', 'SAIA', 'BERMUDA', 'JAQUETA', 'VESTIDO', 'BLUSA', 'CASACO'] },
  { nome: 'Cores', nivel: 1, tema: 'cores', palavras: ['AZUL', 'VERDE', 'ROXO', 'AMARELO', 'VERMELHO', 'CINZA', 'BRANCO', 'PRETO'] },
  { nome: 'Esportes', nivel: 1, tema: 'esporte', palavras: ['FUTEBOL', 'VÔLEI', 'BASQUETE', 'TÊNIS', 'HANDEBOL', 'NATAÇÃO', 'JUDÔ', 'SURFE'] },
  { nome: 'Profissões', nivel: 1, tema: 'trabalho', palavras: ['MÉDICO', 'PEDREIRO', 'ADVOGADO', 'PADEIRO', 'CARTEIRO', 'DENTISTA', 'BOMBEIRO', 'MOTORISTA'] },
  // nível 2
  { nome: 'Planetas', nivel: 2, tema: 'ciencia', palavras: ['MERCÚRIO', 'VÊNUS', 'MARTE', 'JÚPITER', 'SATURNO', 'URANO', 'NETUNO'] },
  { nome: 'Meses do ano', nivel: 2, tema: 'calendario', palavras: ['JANEIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'OUTUBRO'] },
  { nome: 'Dias da semana', nivel: 2, tema: 'calendario', palavras: ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'] },
  { nome: 'Ferramentas', nivel: 2, tema: 'ferramentas', palavras: ['MARTELO', 'ALICATE', 'SERROTE', 'FURADEIRA', 'TRENA', 'LIXA', 'MARRETA', 'ENXADA'] },
  { nome: 'Temperos', nivel: 2, tema: 'comida', palavras: ['ORÉGANO', 'COMINHO', 'PIMENTA', 'ALECRIM', 'CANELA', 'CRAVO', 'ALHO', 'PÁPRICA'] },
  { nome: 'Países da América do Sul', nivel: 2, tema: 'geografia', palavras: ['BRASIL', 'CHILE', 'PERU', 'URUGUAI', 'PARAGUAI', 'BOLÍVIA', 'COLÔMBIA', 'EQUADOR'] },
  { nome: 'Capitais do Brasil', nivel: 2, tema: 'geografia', palavras: ['NATAL', 'PALMAS', 'VITÓRIA', 'BELÉM', 'RECIFE', 'MANAUS', 'CURITIBA', 'SALVADOR'] },
  { nome: 'Peças de xadrez', nivel: 2, tema: 'jogos', palavras: ['REI', 'RAINHA', 'BISPO', 'TORRE', 'PEÃO'] },
  { nome: 'Doces de festa', nivel: 2, tema: 'comida', palavras: ['BRIGADEIRO', 'BEIJINHO', 'PAÇOCA', 'QUINDIM', 'COCADA', 'PUDIM', 'CURAU', 'CAJUZINHO'] },
  { nome: 'Aves', nivel: 2, tema: 'animais', palavras: ['ARARA', 'TUCANO', 'CORUJA', 'PAPAGAIO', 'PINGUIM', 'GAIVOTA', 'POMBO', 'ÁGUIA'] },
  { nome: 'Bichos do mar', nivel: 2, tema: 'animais', palavras: ['TUBARÃO', 'BALEIA', 'POLVO', 'GOLFINHO', 'ARRAIA', 'LAGOSTA', 'SIRI', 'LULA'] },
  // nível 3
  { nome: 'Teclas do teclado', nivel: 3, tema: 'ti', palavras: ['ESC', 'TAB', 'ALT', 'ENTER', 'SHIFT', 'DELETE', 'HOME', 'INSERT'] },
  { nome: 'Linguagens de programação', nivel: 3, tema: 'ti', palavras: ['PYTHON', 'JAVA', 'RUBY', 'SWIFT', 'KOTLIN', 'RUST', 'DART', 'PHP'] },
  { nome: 'Peças do computador', nivel: 3, tema: 'ti', palavras: ['MOUSE', 'TECLADO', 'MONITOR', 'GABINETE', 'WEBCAM', 'MEMÓRIA', 'PLACA', 'COOLER'] },
  { nome: 'Unidades de medida', nivel: 3, tema: 'ciencia', palavras: ['METRO', 'LITRO', 'GRAMA', 'QUILO', 'MILHA', 'POLEGADA', 'HECTARE', 'TONELADA'] },
  { nome: 'Formas geométricas', nivel: 3, tema: 'ciencia', palavras: ['CÍRCULO', 'QUADRADO', 'TRIÂNGULO', 'LOSANGO', 'TRAPÉZIO', 'HEXÁGONO', 'CUBO', 'ESFERA'] },
  { nome: 'Elementos químicos', nivel: 3, tema: 'ciencia', palavras: ['FERRO', 'PRATA', 'COBRE', 'ZINCO', 'CHUMBO', 'CARBONO', 'OXIGÊNIO', 'HÉLIO'] },
  { nome: 'Moedas', nivel: 3, tema: 'dinheiro', palavras: ['REAL', 'DÓLAR', 'EURO', 'IENE', 'LIBRA', 'PESO', 'RUBLO', 'RÚPIA'] },
  { nome: 'Ritmos brasileiros', nivel: 3, tema: 'musica', palavras: ['SAMBA', 'FORRÓ', 'PAGODE', 'AXÉ', 'SERTANEJO', 'FREVO', 'BAIÃO', 'XOTE'] },
  { nome: 'Signos', nivel: 3, tema: 'misticos', palavras: ['ÁRIES', 'TOURO', 'GÊMEOS', 'CÂNCER', 'LEÃO', 'VIRGEM', 'ESCORPIÃO', 'PEIXES'] },
  { nome: 'Coisas do baralho', nivel: 3, tema: 'jogos', palavras: ['COPAS', 'ESPADAS', 'OUROS', 'PAUS', 'CORINGA', 'VALETE', 'DAMA', 'ÁS'] },
  // nível 4: jogo de palavras
  { nome: 'Guarda-___', nivel: 4, tema: 'palavra', palavras: ['CHUVA', 'ROUPA', 'SOL', 'COSTAS', 'VOLUME', 'LOUÇA', 'NOTURNO'] },
  { nome: 'Pão de ___', nivel: 4, tema: 'palavra', palavras: ['QUEIJO', 'AÇÚCAR', 'LÓ', 'FORMA', 'MEL', 'BATATA'] },
  { nome: 'Escondem um número', nivel: 4, tema: 'palavra', palavras: ['NOVELA', 'SETEMBRO', 'MILHO', 'BISCOITO', 'CEMITÉRIO', 'DEZEMBRO', 'AFOITO', 'MILAGRE'] },
  { nome: 'Pé de ___', nivel: 4, tema: 'palavra', palavras: ['MOLEQUE', 'VENTO', 'VALSA', 'ATLETA', 'FEIJÃO', 'GUERRA'] },
  { nome: 'Palíndromos (lidos ao contrário, dão igual)', nivel: 4, tema: 'palavra', palavras: ['RADAR', 'REVIVER', 'OSSO', 'OVO', 'SOMOS', 'REGER', 'MIRIM', 'SAÍAS'] },
];

module.exports = { CONEXOES };
