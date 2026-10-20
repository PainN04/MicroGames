// Avatares pré-prontos — compartilhado entre a página (script comum) e o servidor (require em lib/router.js),
// então os dois concordam sobre quais avatares e cores existem.
// `ach`: o avatar só libera com essa conquista (a conferência é na página, que é onde as conquistas são calculadas).
// Gravado no banco como "id:cor", ex.: "gato:290".
const AVATARS = [
  ['gato', '🐱', 'Gato'], ['cachorro', '🐶', 'Cachorro'], ['raposa', '🦊', 'Raposa'], ['panda', '🐼', 'Panda'],
  ['coala', '🐨', 'Coala'], ['sapo', '🐸', 'Sapo'], ['pinguim', '🐧', 'Pinguim'], ['polvo', '🐙', 'Polvo'],
  ['tartaruga', '🐢', 'Tartaruga'], ['leao', '🦁', 'Leão'], ['tigre', '🐯', 'Tigre'], ['macaco', '🐵', 'Macaco'],
  ['porco', '🐷', 'Porquinho'], ['coelho', '🐰', 'Coelho'], ['unicornio', '🦄', 'Unicórnio'], ['robo', '🤖', 'Robô'],
  ['alien', '👽', 'Alien'], ['astronauta', '🧑‍🚀', 'Astronauta'], ['ninja', '🥷', 'Ninja'], ['mago', '🧙', 'Mago'],
  ['pizza', '🍕', 'Pizza'], ['cafe', '☕', 'Café'], ['cacto', '🌵', 'Cacto'], ['abacaxi', '🍍', 'Abacaxi'],
  ['controle', '🎮', 'Controle'], ['foguete', '🚀', 'Foguete'], ['dado', '🎲', 'Dado'], ['headset', '🎧', 'Fone'],
  // ---- liberados por conquista ----
  ['fantasma', '👻', 'Fantasma', 'come5000'], ['cobra', '🐍', 'Cobra', 'cobra'], ['bussola', '🧭', 'Bússola', 'explorador'],
  ['raio', '⚡', 'Raio', 'gatilho'], ['cerebro', '🧠', 'Cérebro', 'sudoku10'], ['lua', '🌙', 'Lua', 'coruja'],
  ['fogo', '🔥', 'Fogo', 'constancia'], ['espadas', '⚔️', 'Espadas', 'duelo5'], ['coroa', '👑', 'Coroa', 'rei'],
  ['trofeu', '🏆', 'Troféu', 'torneio1'], ['dragao', '🐉', 'Dragão', 'imperio'], ['diamante', '💎', 'Diamante', 'lenda'],
].map(([id, emoji, name, ach]) => ({ id, emoji, name, ach: ach || null }));
/** Cores de fundo do avatar (matiz OKLCH). */
const AVATAR_HUES = [290, 250, 210, 170, 140, 90, 50, 20, 340];

/** "gato:290" → { id, emoji, name, ach, hue } ou null se não existir. */
function parseAvatar(v) {
  const [id, h] = String(v || '').split(':');
  const a = AVATARS.find(x => x.id === id), hue = Number(h);
  return a && AVATAR_HUES.includes(hue) ? { ...a, hue } : null;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { AVATARS, AVATAR_HUES, parseAvatar };
