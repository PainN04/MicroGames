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

test('CSP: o script-src do vercel.json libera os scripts inline do index.html (pelo hash) e nada de unsafe-inline', () => {
  const crypto = require('node:crypto');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const headers = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).headers.flatMap(h => h.headers);
  const csp = headers.find(h => h.key === 'Content-Security-Policy').value;
  const src = csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src '));
  assert.ok(src, 'tem script-src');
  assert.ok(!src.includes('unsafe-inline') && !src.includes('unsafe-eval'));
  // mudou um <script> inline do index.html? recalcule o hash e troque no vercel.json, senão ele para de rodar no ar
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${crypto.createHash('sha256').update(code).digest('base64')}'`;
    assert.ok(src.includes(hash), `hash do script inline ${code.slice(0, 40)}… fora do CSP`);
  }
  for (const dir of ['public/js', 'public/js/games']) for (const f of fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js'))) {
    assert.ok(!/\son(click|load|error|input|change|submit)="/.test(fs.readFileSync(path.join(root, dir, f), 'utf8')), `${dir}/${f}: atributo on*="" inline é barrado pelo CSP`);
  }
});
