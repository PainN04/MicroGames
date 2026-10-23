// Sinuca: física, regras do 8 Ball e máquina (GAMES.sinuca.engine, a parte sem Phaser do jogo).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ctx = { GAMES: {} };
vm.runInNewContext(fs.readFileSync('public/js/games/sinuca.js', 'utf8'), ctx);
const E = ctx.GAMES.sinuca.engine;
const plain = v => JSON.parse(JSON.stringify(v)); // objetos do vm têm outro Array.prototype
const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ball = (n, x, y) => ({ n, x, y, vx: 0, vy: 0, on: true });
const st = (me = null, cpu = null, isBreak = false) => ({ groups: { me, cpu }, isBreak });
const all = (...ns) => new Set([0, ...ns]);

test('sinuca: o triângulo tem as 15 bolas sem encostar, a 8 no meio e lisa e listrada nos cantos de trás', () => {
  const balls = E.rack(seeded(7));
  assert.equal(balls.length, 16);
  assert.deepEqual(plain(balls.map(b => b.n).sort((a, b) => a - b)), Array.from({ length: 16 }, (_, i) => i));
  for (const a of balls) for (const b of balls) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= E.D, `${a.n} encosta em ${b.n}`);
  const eight = balls.find(b => b.n === 8), back = balls.filter(b => Math.abs(b.y - Math.min(...balls.map(q => q.y))) < 0.01).sort((a, b) => a.x - b.x);
  assert.equal(eight.x, E.FOOT.x);
  assert.equal(back.length, 5);
  assert.deepEqual(plain([back[0], back[4]].map(b => E.type(b.n)).sort()), ['solid', 'stripe']);
});

test('sinuca: tacada reta encaçapa, a mesma tacada sempre dá o mesmo resultado e a branca para', () => {
  const balls = [ball(0, 100, 200), ball(3, 60, 60)];
  const p = E.POCKETS[0], a = Math.atan2(p.ay - 60, p.ax - 60), gx = 60 - Math.cos(a) * E.D, gy = 60 - Math.sin(a) * E.D;
  const r = E.simulate(balls, Math.atan2(gy - 200, gx - 100), 0.5);
  assert.equal(r.first, 3);
  assert.deepEqual(plain(r.potted), [3]);
  assert.deepEqual(plain(E.simulate(balls, Math.atan2(gy - 200, gx - 100), 0.5).balls), plain(r.balls));
  const cue = r.balls.find(b => b.n === 0);
  assert.ok(cue.on && cue.vx === 0 && cue.vy === 0);
  assert.equal(balls[1].on, true, 'a simulação não mexe nas bolas de verdade');
});

test('sinuca: bola nenhuma atravessa a tabela, nem na saída mais forte', () => {
  for (let s = 1; s <= 20; s++) {
    const rnd = seeded(s), balls = E.rack(rnd);
    const r = E.simulate(balls, -Math.PI / 2 + (rnd() - 0.5) * 0.2, 1);
    for (const b of r.balls) if (b.on) assert.ok(b.x >= 0 && b.x <= E.TW && b.y >= 0 && b.y <= E.TH, `bola ${b.n} fora da mesa (${b.x}, ${b.y})`);
  }
});

test('sinuca: regras de falta, grupo e bola 8', () => {
  // saída: encaçapou qualquer bola, continua; a mesa segue aberta
  let j = E.judge(st(null, null, true), 'me', { first: 1, potted: [3, 12] }, all(1, 3, 8, 12));
  assert.equal(j.keep, true); assert.equal(j.assign, null); assert.equal(j.foul, null);
  // mesa aberta: o primeiro encaçapado define os grupos
  j = E.judge(st(), 'me', { first: 12, potted: [12] }, all(1, 8, 12));
  assert.deepEqual(plain(j.assign), { me: 'stripe', cpu: 'solid' }); assert.equal(j.keep, true); assert.deepEqual(plain(j.scored), [12]);
  // branca na caçapa e bater primeiro na bola do outro são falta e passam a vez
  j = E.judge(st('solid', 'stripe'), 'me', { first: 2, potted: [2, 0] }, all(2, 8, 9));
  assert.equal(j.foul, 'Bola branca na caçapa'); assert.equal(j.keep, false); assert.equal(j.scored.length, 0);
  j = E.judge(st('solid', 'stripe'), 'me', { first: 9, potted: [2] }, all(2, 8, 9));
  assert.match(j.foul, /adversário/); assert.equal(j.keep, false);
  j = E.judge(st('solid', 'stripe'), 'cpu', { first: null, potted: [] }, all(2, 8, 9));
  assert.match(j.foul, /nenhuma/);
  // 8 antes da hora perde; 8 depois de limpar o grupo vence; 8 com falta perde
  assert.equal(E.judge(st('solid', 'stripe'), 'me', { first: 2, potted: [8] }, all(2, 8, 9)).win, 'cpu');
  assert.equal(E.judge(st('solid', 'stripe'), 'me', { first: 8, potted: [8] }, all(8, 9)).win, 'me');
  assert.equal(E.judge(st('solid', 'stripe'), 'me', { first: 8, potted: [8, 0] }, all(8, 9)).win, 'cpu');
  assert.match(E.judge(st('solid', 'stripe'), 'me', { first: 9, potted: [] }, all(8, 9)).foul, /8/, 'grupo limpo: tem que bater na 8');
  // 8 na saída volta pra marca
  assert.equal(E.judge(st(null, null, true), 'me', { first: 1, potted: [8] }, all(1, 8)).respot8, true);
});

test('sinuca: a máquina encaçapa tacada fácil e, com bola na mão, põe a branca num lugar livre', () => {
  const balls = [ball(0, 136, 400), ball(9, 60, 80), ball(2, 200, 300), ball(8, 136, 272)];
  let ok = 0;
  for (let s = 1; s <= 10; s++) {
    const p = E.plan(balls, { groups: { me: 'solid', cpu: 'stripe' }, inHand: false }, 5, seeded(s));
    const r = E.simulate(balls, p.angle, p.power);
    if (r.potted.includes(9) && !r.potted.includes(0)) ok++;
  }
  assert.ok(ok >= 8, `a máquina nível Lenda acertou só ${ok} de 10`);
  const p = E.plan(balls, { groups: { me: 'solid', cpu: 'stripe' }, inHand: true }, 2, seeded(3));
  assert.ok(p.place && E.freeAt(balls.filter(b => b.n), p.place.x, p.place.y), 'lugar livre');
});
