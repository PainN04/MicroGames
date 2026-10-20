// Avatares pré-prontos — compartilhado entre a página (script comum) e o servidor (require em lib/router.js),
// então os dois concordam sobre quais avatares e cores existem.
// Desenhos em public/img/avatars/<id>.svg, gerados com o DiceBear (dicebear.com): estilos Lorelei (Lisa Wischofsky, CC0),
// Open Peeps (Pablo Stanley, CC0), Pixel Art (DiceBear, CC0) e Bottts (Pablo Stanley, livre pra uso comercial).
// Imagem própria em vez de emoji: fica igual em qualquer aparelho.
// `ach`: o avatar só libera com essa conquista (a conferência é na página, que é onde as conquistas são calculadas).
// Macaco: desenho próprio. Avatares de jogo ("jogo-<id do jogo>"): um desenho que lembra o jogo (img/avatars/jogo-<id>.svg,
// ícones do game-icons.net, https://game-icons.net, licença CC BY 3.0, autores Lorc, Delapouite e outros),
// liberado depois de jogar uma partida dele. Os "i-<nome>" são outros ícones do mesmo game-icons.net.
// Jogo novo precisa do seu jogo-<id>.svg (o teste confere).
// Gravado no banco como "id:cor", ex.: "lia:290".
const AVATARS = [
  ['lia', 'Lia'], ['bia', 'Bia'], ['clara', 'Clara'], ['dani', 'Dani'], ['edu', 'Edu'], ['rafa', 'Rafa'], ['gui', 'Gui'], ['mel', 'Mel'],
  ['jade', 'Jade'], ['davi', 'Davi'], ['luna', 'Luna'], ['vovo', 'Vovó'], ['zoe', 'Zoe'], ['ruiva', 'Ruiva'], ['nalu', 'Nalu'],
  ['maya', 'Maya'], ['tati', 'Tati'], ['neo', 'Neo'],
  ['pixel', 'Pixel'], ['bit', 'Bit'], ['nerd', 'Nerd'], ['lime', 'Lime'], ['sky', 'Sky'], ['kai', 'Kai'], ['tom', 'Tom'],
  ['vini', 'Vini'], ['ravi', 'Ravi'], ['cris', 'Cris'], ['macaco', 'Macaco'],
  // ---- robôs, liberados por conquista ----
  ['bip', 'Bip', 'come5000'], ['bop', 'Bop', 'cobra'], ['zuk', 'Zuk', 'explorador'], ['tiko', 'Tiko', 'gatilho'],
  ['rex', 'Rex', 'sudoku10'], ['volt', 'Volt', 'coruja'], ['nano', 'Nano', 'constancia'], ['byte', 'Byte', 'duelo5'],
  ['turbo', 'Turbo', 'rei'], ['chip', 'Chip', 'torneio1'], ['gizmo', 'Gizmo', 'imperio'], ['zap', 'Zap', 'lenda'],
  // ---- ícones do game-icons.net (id "i-<nome>"), os últimos liberados por conquista ----
  ['i-monkey', 'Macaquinho'], ['i-gorilla', 'Gorila'], ['i-cat', 'Gato'], ['i-fox-head', 'Raposa'], ['i-wolf-head', 'Lobo'], ['i-bear-head', 'Urso'],
  ['i-panda', 'Panda'], ['i-owl', 'Coruja'], ['i-penguin', 'Pinguim'], ['i-frog', 'Sapo'], ['i-octopus', 'Polvo'], ['i-turtle', 'Tartaruga'],
  ['i-lion', 'Leão'], ['i-rabbit-head', 'Coelho'], ['i-elephant-head', 'Elefante'], ['i-pig-face', 'Porquinho'], ['i-duck', 'Pato'], ['i-dinosaur-rex', 'Dino'],
  ['i-unicorn', 'Unicórnio'], ['i-snail', 'Caracol'], ['i-bee', 'Abelha'], ['i-butterfly', 'Borboleta'], ['i-coffee-cup', 'Café'], ['i-pizza-slice', 'Pizza'],
  ['i-hamburger', 'Hambúrguer'], ['i-donut', 'Rosquinha'], ['i-ice-cream-cone', 'Sorvete'], ['i-cactus-pot', 'Cacto'], ['i-guitar', 'Guitarra'], ['i-headphones', 'Fone'],
  ['i-gamepad', 'Controle'], ['i-rocket', 'Foguete'], ['i-sunglasses', 'Óculos'], ['i-top-hat', 'Cartola'], ['i-sun', 'Sol'], ['i-moon', 'Lua'],
  ['i-compass', 'Bússola'], ['i-anchor', 'Âncora'],
  ['i-dragon-head', 'Dragão', 'imperador'], ['i-wizard-face', 'Mago', 'termo600'], ['i-ninja-head', 'Ninja', 'maratonadia'], ['i-pirate-captain', 'Pirata', 'forca100'],
  ['i-viking-helmet', 'Viking', 'torneio3'], ['i-robot-golem', 'Golem', 'veterano'], ['i-astronaut-helmet', 'Astronauta', 'completo'], ['i-crystal-ball', 'Bola de cristal', 'mes'],
  ['i-diamond-trophy', 'Troféu de diamante', 'dez'], ['i-treasure-map', 'Mapa do tesouro', 'colecionador'],
].map(([id, name, ach]) => ({ id, name, ach: ach || null }));
/** Cores de fundo do avatar (matiz OKLCH). */
const AVATAR_HUES = [290, 250, 210, 170, 140, 90, 50, 20, 340];

/** "lia:290" ou "jogo-snake:290" → { id, name, ach, game, hue } ou null se não existir.
 *  `games`: ids dos jogos (na página sai do GAMES de lá; o servidor passa o dele). */
function parseAvatar(v, games = typeof GAMES === 'undefined' ? [] : Object.keys(GAMES)) {
  const [id, h] = String(v || '').split(':');
  const hue = Number(h);
  if (!AVATAR_HUES.includes(hue)) return null;
  if (id.startsWith('jogo-')) return games.includes(id.slice(5)) ? { id, name: null, ach: null, game: id.slice(5), hue } : null;
  const a = AVATARS.find(x => x.id === id);
  return a ? { ...a, game: null, hue } : null;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { AVATARS, AVATAR_HUES, parseAvatar };
