'use strict';
const E = require('../engine.js');
const assert = require('assert');

function empty() { return { pts: new Array(24).fill(0), bar: [0, 0], off: [0, 0] }; }
const total = (s, p) => {
  let n = s.bar[E.pi(p)] + s.off[E.pi(p)];
  for (const v of s.pts) if (v * p > 0) n += v * p;
  return n;
};

// opening position
const s0 = E.newState();
assert.strictEqual(total(s0, 1), 15);
assert.strictEqual(total(s0, -1), 15);
assert.strictEqual(E.pipCount(s0, 1), 167);
assert.strictEqual(E.pipCount(s0, -1), 167);
// 3-1 opening: 8/5 and 6/5 style plays exist
assert.ok(E.genTurns(s0, 1, [3, 1]).length > 10);

// bar entry blocked by a point: human on bar, die 1 -> idx 23 held by 2 AI checkers
let s = empty();
s.bar[0] = 1; s.pts[23] = -2; s.pts[10] = 14;
assert.deepStrictEqual(E.singleMoves(s, 1, 1), []);
assert.strictEqual(E.singleMoves(s, 1, 2).length, 1);
// bar checker must enter before anything else
assert.ok(E.singleMoves(s, 1, 2).every(m => m.from === E.BAR));

// hit sends blot to bar
s = empty(); s.pts[5] = 1; s.pts[2] = -1; s.pts[20] = 14; s.pts[22] = -14;
const hit = E.singleMoves(s, 1, 3).find(m => m.to === 2);
assert.ok(hit && E.isHit(s, 1, hit));
assert.strictEqual(E.applyMove(s, 1, hit).bar[1], 1);

// bearing off: exact, and larger die only when nothing farther back
s = empty(); s.pts[0] = 2; s.pts[3] = 1; s.pts[23] = -3; s.off[0] = 12;
assert.ok(E.singleMoves(s, 1, 4).some(m => m.to === E.OFF && m.from === 3));
assert.ok(!E.singleMoves(s, 1, 6).some(m => m.from === 0)); // 3-pt checker is farther back
s.pts[3] = 0; s.pts[1] = 1;
assert.ok(E.singleMoves(s, 1, 6).some(m => m.to === E.OFF));
assert.ok(!E.singleMoves(s, 1, 1).some(m => m.to === E.OFF && m.from === 1));

// no bearing off while a checker is outside home
s = empty(); s.pts[0] = 5; s.pts[8] = 1; s.off[0] = 9; s.pts[23] = -1; s.off[1] = 14;
assert.ok(!E.singleMoves(s, 1, 6).some(m => m.to === E.OFF));

// must use both dice when possible; if only one playable, must play the larger
s = empty(); s.pts[6] = 1; s.pts[22] = -2; s.pts[0] = -2; s.pts[20] = -2; // illustrative blockers
const lf = E.legalFirstMoves(s, 1, [6, 1]);
assert.ok(lf.length > 0);
// total 1 die rule: human at idx 3, can play 1 (to 2) or 3? build a case where after playing either die nothing else moves
s = empty(); s.pts[1] = 1; s.pts[22] = -15; // human single checker on idx1; dice 5,1: 5 bears off? not allHome? it is home.
const only = E.legalFirstMoves(s, 1, [5, 1]);
assert.ok(only.length > 0);

// doubles produce up to four moves
const dbl = E.genTurns(s0, 1, [6, 6, 6, 6]);
assert.ok(dbl.length >= 1 && dbl[0].moves.length <= 4);

// ---------- simulation ----------
function playGame(levelH, levelA, maxTurns = 800) {
  let st = E.newState();
  let turn = Math.random() < 0.5 ? 1 : -1;
  let guard = 0;
  while (!E.winner(st)) {
    if (++guard > maxTurns) throw new Error('game did not finish');
    const lvl = turn === 1 ? levelH : levelA;
    const t = E.chooseTurn(st, turn, E.diceToRem(E.rollDice()), lvl);
    if (t && t.moves.length) st = t.state;
    assert.strictEqual(total(st, 1), 15);
    assert.strictEqual(total(st, -1), 15);
    turn = -turn;
  }
  return E.winner(st);
}

function match(a, b, n) {
  let aw = 0;
  for (let i = 0; i < n; i++) {
    // alternate colours
    if (i % 2 === 0) { if (playGame(a, b) === 1) aw++; }
    else { if (playGame(b, a) === -1) aw++; }
  }
  return aw;
}

let t0 = Date.now();
const N = +process.env.N || 40;
console.log(`medium vs easy: medium won ${match('medium', 'easy', N)}/${N}`);
console.log(`hard vs medium: hard won ${match('hard', 'medium', Math.ceil(N / 2))}/${Math.ceil(N / 2)}`);
console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1) + 's');

// hard-AI latency from the opening, worst-ish case (doubles)
for (const d of [[3, 1], [6, 4], [2, 2], [5, 5]]) {
  const t1 = Date.now();
  E.chooseTurn(s0, -1, E.diceToRem(d), 'hard');
  console.log('hard think', d.join('-'), Date.now() - t1, 'ms');
}
console.log('OK');
