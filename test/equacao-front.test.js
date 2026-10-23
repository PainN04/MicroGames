// Equação: a linha atual aceita símbolo em qualquer quadrado (GAMES.equacao.edit, a parte sem DOM do jogo).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ctx = { GAMES: {} };
vm.runInNewContext(fs.readFileSync('public/js/games/equacao.js', 'utf8'), ctx);
const edit = ctx.GAMES.equacao.edit;
const run = (keys, st = { cells: Array(8).fill(''), sel: 0 }) => keys.reduce((s, k) => edit(s, k), st);
const plain = st => ({ cells: [...st.cells].join(','), sel: st.sel });

test('equação: escreve da esquerda pra direita como antes', () => {
  assert.deepEqual(plain(run([...'12+35=47'])), { cells: '1,2,+,3,5,=,4,7', sel: 7 });
});

test('equação: escolher um quadrado e preencher o que já sabe, depois o resto', () => {
  let st = run(['=', '4', '7'], { cells: Array(8).fill(''), sel: 5 });
  assert.deepEqual(plain(st), { cells: ',,,,,=,4,7', sel: 0 }, 'pula pro primeiro vazio, dando a volta');
  st = run([...'12+35'], st);
  assert.deepEqual(plain(st), { cells: '1,2,+,3,5,=,4,7', sel: 5 });
});

test('equação: escrever num quadrado cheio troca o símbolo; setas movem; apagar limpa o escolhido', () => {
  let st = run([...'12+35=47']);
  st = run(['home', '→', '→', '-'], st);
  assert.equal([...st.cells].join(''), '12-35=47');
  st = run(['end', '⌫'], st);
  assert.deepEqual(plain(st), { cells: '1,2,-,3,5,=,4,', sel: 7 }, 'limpa o escolhido e fica nele');
  st = run(['⌫'], st);
  assert.deepEqual(plain(st), { cells: '1,2,-,3,5,=,,', sel: 6 }, 'vazio: volta um e limpa');
  st = run(['home', 'del', '←'], st);
  assert.deepEqual(plain(st), { cells: ',2,-,3,5,=,,', sel: 0 });
  assert.deepEqual(plain(run(['x'], st)), plain(st), 'tecla que não é símbolo não muda nada');
});
