// Termo, Dueto, Quarteto e Octeto: a linha atual aceita letra em qualquer quadrado (termoEdit, a parte sem DOM).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ctx = { GAMES: {} };
vm.runInNewContext(fs.readFileSync('public/js/games/termo.js', 'utf8') + '\nthis.termoEdit = termoEdit;', ctx);
const edit = ctx.termoEdit;
const run = (keys, st = { cells: Array(5).fill(''), sel: 0 }) => keys.reduce((s, k) => edit(s, k), st);
const plain = st => ({ cells: [...st.cells].join(','), sel: st.sel });

test('termo: escreve da esquerda pra direita como antes', () => {
  assert.deepEqual(plain(run([...'CASAS'])), { cells: 'C,A,S,A,S', sel: 4 });
});

test('termo: tocar num quadrado e deixar a letra lá, depois completar o resto', () => {
  let st = run(['O'], { cells: Array(5).fill(''), sel: 4 });
  assert.deepEqual(plain(st), { cells: ',,,,O', sel: 0 }, 'pula pro primeiro vazio, dando a volta');
  st = run([...'TERM'], st);
  assert.deepEqual(plain(st), { cells: 'T,E,R,M,O', sel: 4 });
});

test('termo: trocar letra, setas, apagar e tecla inválida', () => {
  let st = run([...'TERMO', 'home', '→', 'A']);
  assert.equal([...st.cells].join(''), 'TARMO');
  st = run(['end', '⌫'], st);
  assert.deepEqual(plain(st), { cells: 'T,A,R,M,', sel: 4 }, 'limpa o escolhido e fica nele');
  st = run(['⌫'], st);
  assert.deepEqual(plain(st), { cells: 'T,A,R,,', sel: 3 }, 'vazio: volta um e limpa');
  st = run(['home', 'del'], st);
  assert.deepEqual(plain(st), { cells: ',A,R,,', sel: 0 });
  assert.deepEqual(plain(run(['1'], st)), plain(st), 'tecla que não é letra não muda nada');
});
