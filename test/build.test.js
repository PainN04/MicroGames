// A versão que vai pro ar (npm run build): um script só, embrulhado, sem os arquivos originais e sem source map.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('../scripts/build');

test('build: junta os scripts num arquivo só, sem nada solto no window e sem o código original', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'microgame-build-'));
  try {
    const { bundle, files } = build(out);
    assert.ok(files.length > 30);
    assert.ok(!fs.existsSync(path.join(out, 'js', 'games')), 'pasta dos jogos não vai pro ar');
    assert.deepEqual(fs.readdirSync(path.join(out, 'js')), [path.basename(bundle)]);
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.equal([...html.matchAll(/<script src="/g)].length, 1, 'um script só na página');
    assert.ok(!/\son[a-z]+="[^"]*\(/.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')), 'nenhum onclick/onload chamando função global');
    const code = fs.readFileSync(path.join(out, bundle), 'utf8');
    assert.ok(code.startsWith('(()=>{') && code.trimEnd().endsWith('})();'), 'tudo dentro de uma função');
    assert.ok(!code.includes('sourceMappingURL'));
    for (const name of ['saveScore', 'postScore', 'openPlay', 'flushPending']) assert.ok(!code.includes(name), name);
    assert.ok(fs.existsSync(path.join(out, 'vendor', 'phaser.min.js')));
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
