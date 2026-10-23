// Monta a versão que vai pro ar (pasta dist/, a que a Vercel publica). Roda no deploy: npm run build
//  - junta todos os scripts da página (public/js/*.js e os jogos) num arquivo só, dentro de uma função: nada fica
//    solto no window, então saveScore(), GAMES, o placar etc. não dá pra chamar nem mudar pelo console do F12;
//  - embaralha os nomes e os textos (ofuscação leve: sem "control flow flattening", que deixaria o jogo pesado no
//    modo leve) e minifica; sem source map, então o DevTools não mostra o código original;
//  - copia o resto de public/ (css, imagens, vendor/phaser...) sem a pasta js/: os arquivos originais não vão pro ar.
// O servidor local (npm run local) continua servindo public/ como está, pra testar sem precisar montar.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public');

const SCRIPT_TAG = /^[ \t]*<script src="(js\/[^"]+)"><\/script>\r?\n/gm;

function build(out = path.join(ROOT, 'dist')) {
  const OUT = path.resolve(out);
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const files = [...html.matchAll(SCRIPT_TAG)].map(m => m[1]);
  if (!files.length) throw new Error('index.html sem <script src="js/...">');
  // mesma ordem da página; o ";" separa arquivos que terminam sem ponto e vírgula
  const joined = files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  const wrapped = `(function () {\n${joined}\n})();`;
  const obfuscated = JavaScriptObfuscator.obfuscate(wrapped, {
    target: 'browser',
    compact: true,
    identifierNamesGenerator: 'mangled-shuffled',
    renameGlobals: false,
    stringArray: true,
    stringArrayThreshold: 0.75,
    stringArrayEncoding: [],          // base64/rc4 decodificam a cada uso: pesado demais nos jogos
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayIndexShift: true,
    stringArrayWrappersCount: 1,
    stringArrayCallsTransform: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    numbersToExpressions: false,
    splitStrings: false,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    sourceMap: false,
  }).getObfuscatedCode();
  // a lista de textos do ofuscador fica no topo do arquivo: outra função em volta pra ela também não ir pro window
  const { code } = esbuild.transformSync(`(() => {\n${obfuscated}\n})();`, { minify: true, target: 'es2020', legalComments: 'none' });
  const hash = crypto.createHash('sha1').update(code).digest('hex').slice(0, 10);
  const bundle = `js/app.${hash}.js`;

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(SRC, OUT, { recursive: true, filter: src => path.relative(SRC, src).split(path.sep)[0] !== 'js' });
  fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
  fs.writeFileSync(path.join(OUT, bundle), code);
  let first = true;
  const page = html.replace(SCRIPT_TAG, () => (first ? ((first = false), `<script src="${bundle}"></script>\n`) : ''));
  fs.writeFileSync(path.join(OUT, 'index.html'), page);
  console.log(`build ok: ${files.length} scripts → ${path.relative(ROOT, OUT) || OUT}/${bundle} (${Math.round(code.length / 1024)} KB)`);
  return { out: OUT, bundle, files };
}

if (require.main === module) build(process.argv[2]);
module.exports = { build };
