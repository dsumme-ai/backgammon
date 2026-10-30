'use strict';
// Backgammon rules + computer player.
// Board: pts[0..23]; +n = n human checkers (player 1), -n = n computer checkers (player -1).
// Human moves toward index 0 (home 0-5), computer toward index 23 (home 18-23).
// Human bar entry: idx 24-die. Computer bar entry: idx die-1.

const BAR = -1;
const OFF = -2;
const pi = p => (p > 0 ? 0 : 1); // index into bar[] / off[]

function newState() {
  const pts = new Array(24).fill(0);
  pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
  pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
  return { pts, bar: [0, 0], off: [0, 0] };
}

function cloneState(s) {
  return { pts: s.pts.slice(), bar: s.bar.slice(), off: s.off.slice() };
}

function stateKey(s) {
  return s.pts.join(',') + '|' + s.bar.join('.') + '|' + s.off.join('.');
}

const pipOf = (i, p) => (p > 0 ? i + 1 : 24 - i);
const inHome = (i, p) => (p > 0 ? i <= 5 : i >= 18);

function pipCount(s, p) {
  let n = s.bar[pi(p)] * 25;
  for (let i = 0; i < 24; i++) if (s.pts[i] * p > 0) n += pipOf(i, p) * s.pts[i] * p;
  return n;
}

function allHome(s, p) {
  if (s.bar[pi(p)]) return false;
  for (let i = 0; i < 24; i++) if (s.pts[i] * p > 0 && !inHome(i, p)) return false;
  return true;
}

// All single-checker moves for one die value.
function singleMoves(s, p, die) {
  const out = [];
  if (s.bar[pi(p)] > 0) {
    const j = p > 0 ? 24 - die : die - 1;
    if (s.pts[j] * p >= -1) out.push({ from: BAR, to: j, die });
    return out;
  }
  const home = allHome(s, p);
  let farthest = 0;
  if (home) {
    for (let i = 0; i < 24; i++) if (s.pts[i] * p > 0) farthest = Math.max(farthest, pipOf(i, p));
  }
  for (let i = 0; i < 24; i++) {
    if (s.pts[i] * p <= 0) continue;
    const j = i - p * die;
    if (j >= 0 && j <= 23) {
      if (s.pts[j] * p >= -1) out.push({ from: i, to: j, die });
    } else if (home) {
      const d = pipOf(i, p);
      if (die === d || (die > d && farthest <= d)) out.push({ from: i, to: OFF, die });
    }
  }
  return out;
}

function isHit(s, p, m) {
  return m.to >= 0 && s.pts[m.to] * p === -1;
}

function applyMove(s, p, m) {
  const n = cloneState(s);
  const me = pi(p);
  if (m.from === BAR) n.bar[me]--; else n.pts[m.from] -= p;
  if (m.to === OFF) {
    n.off[me]++;
  } else {
    if (n.pts[m.to] * p === -1) { n.pts[m.to] = 0; n.bar[pi(-p)]++; }
    n.pts[m.to] += p;
  }
  return n;
}

// Most dice that can still be played from here.
function maxPlayable(s, p, rem) {
  const memo = new Map();
  function rec(st, r) {
    if (!r.length) return 0;
    const k = stateKey(st) + '#' + r.join('');
    const c = memo.get(k);
    if (c !== undefined) return c;
    let best = 0;
    const tried = new Set();
    outer:
    for (let di = 0; di < r.length; di++) {
      const die = r[di];
      if (tried.has(die)) continue;
      tried.add(die);
      const rest = r.slice(0, di).concat(r.slice(di + 1));
      for (const m of singleMoves(st, p, die)) {
        const v = 1 + rec(applyMove(st, p, m), rest);
        if (v > best) best = v;
        if (best === r.length) break outer;
      }
    }
    memo.set(k, best);
    return best;
  }
  return rec(s, rem);
}

// Legal next single moves honouring "must use as many dice as possible"
// and "if only one die can be played, play the larger".
function legalFirstMoves(s, p, rem) {
  const total = maxPlayable(s, p, rem);
  if (total === 0) return [];
  const res = [];
  const tried = new Set();
  for (let di = 0; di < rem.length; di++) {
    const die = rem[di];
    if (tried.has(die)) continue;
    tried.add(die);
    const rest = rem.slice(0, di).concat(rem.slice(di + 1));
    for (const m of singleMoves(s, p, die)) {
      if (1 + maxPlayable(applyMove(s, p, m), p, rest) === total) res.push(m);
    }
  }
  if (total === 1 && rem.length === 2 && rem[0] !== rem[1]) {
    const hi = Math.max(rem[0], rem[1]);
    if (res.some(m => m.die === hi)) return res.filter(m => m.die === hi);
  }
  return res;
}

// Every distinct complete turn: [{moves, state}] (one entry per resulting position).
function genTurns(s, p, dice) {
  const results = new Map();
  const seen = new Set();
  let maxLen = 0;
  function rec(st, rem, moves) {
    const k = stateKey(st) + '#' + rem.join('');
    if (seen.has(k)) return;
    seen.add(k);
    let any = false;
    const tried = new Set();
    for (let di = 0; di < rem.length; di++) {
      const die = rem[di];
      if (tried.has(die)) continue;
      tried.add(die);
      const rest = rem.slice(0, di).concat(rem.slice(di + 1));
      for (const m of singleMoves(st, p, die)) {
        any = true;
        rec(applyMove(st, p, m), rest, moves.concat([m]));
      }
    }
    if (!any) {
      if (moves.length > maxLen) { maxLen = moves.length; results.clear(); }
      if (moves.length === maxLen) results.set(stateKey(st), { moves, state: st });
    }
  }
  rec(s, dice, []);
  let list = [...results.values()];
  if (maxLen === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const hi = Math.max(dice[0], dice[1]);
    if (list.some(t => t.moves[0].die === hi)) list = list.filter(t => t.moves[0].die === hi);
  }
  return list;
}

const d6 = () => 1 + Math.floor(Math.random() * 6);
const rollDice = () => [d6(), d6()];
const diceToRem = d => (d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]]);

function winner(s) {
  if (s.off[0] === 15) return 1;
  if (s.off[1] === 15) return -1;
  return 0;
}

// 1 = single game, 2 = gammon, 3 = backgammon
function gameValue(s, w) {
  const l = -w;
  if (s.off[pi(l)] > 0) return 1;
  if (s.bar[pi(l)] > 0) return 3;
  for (let i = 0; i < 24; i++) if (s.pts[i] * l > 0 && inHome(i, w)) return 3;
  return 2;
}

// ---------- evaluation ----------

const HIT_PROB = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3].map(x => x / 36);

// Chance the opponent of p hits a p-blot on point i next roll.
function exposure(s, p, i) {
  const q = -p;
  if (s.bar[pi(q)] > 0) {
    const d = q < 0 ? i + 1 : 24 - i;
    return d <= 6 ? 11 / 36 : 0;
  }
  let miss = 1;
  for (let j = 0; j < 24; j++) {
    if (s.pts[j] * q <= 0) continue;
    const dist = q < 0 ? i - j : j - i;
    if (dist >= 1 && dist <= 12) miss *= 1 - HIT_PROB[dist];
  }
  return 1 - miss;
}

function longestRun(s, p) {
  let best = 0, run = 0;
  for (let pp = 1; pp <= 24; pp++) {
    const i = p > 0 ? pp - 1 : 24 - pp;
    if (s.pts[i] * p >= 2) { run++; if (run > best) best = run; } else run = 0;
  }
  return best;
}

const primeVal = r => (r >= 3 ? r * r * 0.7 : 0);

// Score of position s from p's point of view (higher is better for p).
function evaluate(s, p) {
  const me = pi(p), op = 1 - me, q = -p;
  if (s.off[me] === 15) return 1e5;
  if (s.off[op] === 15) return -1e5;
  const score0 = pipCount(s, q) - pipCount(s, p);

  let hMax = -1, aMin = 24;
  if (s.bar[0]) hMax = 24;
  if (s.bar[1]) aMin = -1;
  for (let i = 0; i < 24; i++) {
    const v = s.pts[i];
    if (v > 0 && i > hMax) hMax = i;
    if (v < 0 && i < aMin) aMin = i;
  }
  if (hMax <= aMin) return score0; // no contact: pure race

  let score = score0;
  for (let i = 0; i < 24; i++) {
    const v = s.pts[i] * p;
    if (v === 0) continue;
    if (v > 0) {
      const pp = pipOf(i, p);
      if (v === 1) score -= exposure(s, p, i) * (25 - pp) * 0.9;
      else {
        score += 2 + (pp <= 6 ? 2 : 0) + (pp >= 18 ? 2 : 0);
        if (v > 3) score -= (v - 3) * 1.5;
      }
    } else {
      const n = -v, pp = pipOf(i, q);
      if (n === 1) score += exposure(s, q, i) * (25 - pp) * 0.3;
      else {
        score -= 2 + (pp <= 6 ? 2 : 0) + (pp >= 18 ? 2 : 0);
        if (n > 3) score += (n - 3) * 1.5;
      }
    }
  }
  score += 8 * s.bar[op] - 8 * s.bar[me];
  score += primeVal(longestRun(s, p)) - primeVal(longestRun(s, q));
  return score;
}

// ---------- computer player ----------

function chooseTurn(s, p, dice, level) {
  const turns = genTurns(s, p, dice);
  if (turns.length <= 1) return turns[0];

  if (level === 'easy') {
    let best = null, bv = -Infinity;
    for (const t of turns) {
      const hits = t.state.bar[pi(-p)] - s.bar[pi(-p)];
      const off = t.state.off[pi(p)] - s.off[pi(p)];
      const v = Math.random() * 10 + 5 * hits + 3 * off;
      if (v > bv) { bv = v; best = t; }
    }
    return best;
  }

  const scored = turns.map(t => ({ t, v: evaluate(t.state, p) }));
  scored.sort((a, b) => b.v - a.v);

  if (level === 'medium') {
    let best = scored[0], bv = -Infinity;
    for (const x of scored) {
      const v = x.v + Math.random() * 20;
      if (v > bv) { bv = v; best = x; }
    }
    return best.t;
  }

  // hard: look at the opponent's best reply to each of the top candidates, over all 21 rolls
  const top = scored.slice(0, 16);
  let best = top[0], bv = -Infinity;
  for (const x of top) {
    let sum = 0;
    if (winner(x.t.state)) sum = 36 * 1e5;
    else {
      for (let a = 1; a <= 6; a++) {
        for (let b = a; b <= 6; b++) {
          let worst = Infinity;
          for (const ot of genTurns(x.t.state, -p, diceToRem([a, b]))) {
            const v = evaluate(ot.state, p);
            if (v < worst) worst = v;
          }
          sum += (a === b ? 1 : 2) * worst;
        }
      }
    }
    const v = sum / 36 + x.v * 0.05;
    if (v > bv) { bv = v; best = x; }
  }
  return best.t;
}

if (typeof module !== 'undefined') {
  module.exports = {
    BAR, OFF, pi, newState, cloneState, stateKey, pipOf, inHome, pipCount, allHome,
    singleMoves, isHit, applyMove, maxPlayable, legalFirstMoves, genTurns,
    rollDice, diceToRem, winner, gameValue, evaluate, chooseTurn,
  };
}
