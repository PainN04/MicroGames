// Avatares pré-prontos — compartilhado entre a página (script comum) e o servidor (require em lib/router.js),
// então os dois concordam sobre quais avatares e cores existem.
// Desenhos em public/img/avatars/<id>.svg, gerados com o DiceBear (dicebear.com): estilos Lorelei (Lisa Wischofsky, CC0),
// Open Peeps (Pablo Stanley, CC0), Pixel Art (DiceBear, CC0) e Bottts (Pablo Stanley, livre pra uso comercial).
// Imagem própria em vez de emoji: fica igual em qualquer aparelho.
// `ach`: o avatar só libera com essa conquista (a conferência é na página, que é onde as conquistas são calculadas).
// Gravado no banco como "id:cor", ex.: "lia:290".
const AVATARS = [
  ['lia', 'Lia'], ['bia', 'Bia'], ['clara', 'Clara'], ['dani', 'Dani'], ['edu', 'Edu'], ['rafa', 'Rafa'], ['gui', 'Gui'], ['mel', 'Mel'],
  ['jade', 'Jade'], ['davi', 'Davi'], ['luna', 'Luna'], ['vovo', 'Vovó'], ['zoe', 'Zoe'], ['ruiva', 'Ruiva'], ['nalu', 'Nalu'],
  ['maya', 'Maya'], ['tati', 'Tati'], ['neo', 'Neo'],
  ['pixel', 'Pixel'], ['bit', 'Bit'], ['nerd', 'Nerd'], ['lime', 'Lime'], ['sky', 'Sky'], ['kai', 'Kai'], ['tom', 'Tom'],
  ['vini', 'Vini'], ['ravi', 'Ravi'], ['cris', 'Cris'],
  // ---- robôs, liberados por conquista ----
  ['bip', 'Bip', 'come5000'], ['bop', 'Bop', 'cobra'], ['zuk', 'Zuk', 'explorador'], ['tiko', 'Tiko', 'gatilho'],
  ['rex', 'Rex', 'sudoku10'], ['volt', 'Volt', 'coruja'], ['nano', 'Nano', 'constancia'], ['byte', 'Byte', 'duelo5'],
  ['turbo', 'Turbo', 'rei'], ['chip', 'Chip', 'torneio1'], ['gizmo', 'Gizmo', 'imperio'], ['zap', 'Zap', 'lenda'],
].map(([id, name, ach]) => ({ id, name, ach: ach || null }));
/** Cores de fundo do avatar (matiz OKLCH). */
const AVATAR_HUES = [290, 250, 210, 170, 140, 90, 50, 20, 340];

/** "lia:290" → { id, name, ach, hue } ou null se não existir. */
function parseAvatar(v) {
  const [id, h] = String(v || '').split(':');
  const a = AVATARS.find(x => x.id === id), hue = Number(h);
  return a && AVATAR_HUES.includes(hue) ? { ...a, hue } : null;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { AVATARS, AVATAR_HUES, parseAvatar };
