'use strict';
// UI + game flow. Rules and AI live in engine.js.

const W = 1060, H = 480, PW = 72, R = 27, TH = 200;
const LEFT = 20, RIGHT = 508, BARX = 452, BARW = 56, TRAY = 950, TRAYW = 90;
const SAVE_KEY = 'bg-save-v1', STAT_KEY = 'bg-stats-v1', LEVEL_KEY = 'bg-level-v1';
const LEVELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

let level = store.get(LEVEL_KEY) || 'medium';
let stats = store.get(STAT_KEY) || {};
let game = null;
let timer = null; // pending auto-roll / end-of-turn timer (cancelled by undo)

// ---------- game flow ----------

function startGame() {
  clearTimeout(timer);
  game = {
    s: newState(), rem: [], rolled: { h: [], a: [] }, phase: 'ai',
    selected: null, legal: [], hint: null, last: [], history: [], msg: '',
  };
  $('banner').hidden = true;
  let a, b;
  do { a = rollDie(); b = rollDie(); } while (a === b);
  game.rolled = a > b ? { h: [a, b], a: [] } : { h: [], a: [a, b] };
  if (a > b) {
    game.rem = [a, b];
    game.msg = `You open with ${a}-${b}.`;
    enterMovePhase();
  } else {
    game.msg = `Computer opens with ${a}-${b}.`;
    render();
    timer = setTimeout(() => aiTurn([b, a].sort((x, y) => y - x)), 900);
  }
}

const rollDie = () => 1 + Math.floor(Math.random() * 6);

function beginHumanTurn() {
  game.phase = 'roll';
  game.selected = null; game.hint = null; game.legal = [];
  game.msg = 'Your turn…';
  render(); save();
  timer = setTimeout(humanRoll, 700); // auto-roll
}

function humanRoll() {
  const d = rollDice();
  game.rolled.h = d;
  game.rolled.a = []; // only show the dice for the current turn
  game.rem = diceToRem(d);
  enterMovePhase();
}

// A checker on the bar must be played first, so keep it selected.
function autoSelect() {
  if (game.phase === 'move' && game.s.bar[0] > 0 && game.legal.some(m => m.from === BAR)) game.selected = BAR;
}

function enterMovePhase() {
  game.legal = legalFirstMoves(game.s, 1, game.rem);
  game.selected = null; game.hint = null;
  if (!game.legal.length) {
    game.msg = game.rem.length === (game.rolled.h[0] === game.rolled.h[1] ? 4 : 2)
      ? 'No legal moves. Turn passes.' : 'No more moves.';
    endHumanTurn();
    return;
  }
  game.phase = 'move';
  autoSelect();
  game.msg = game.selected === BAR ? 'You\'re on the bar. Tap a green spot to enter.' : 'Tap a glowing checker, then a green spot.';
  render(); save();
}

function endHumanTurn() {
  game.phase = 'pending';
  game.selected = null; game.hint = null; game.legal = [];
  render(); save();
  timer = setTimeout(() => aiTurn(), 1000);
}

function doHumanMove(m) {
  game.history.push({
    s: game.s, rem: game.rem.slice(), rolled: { h: game.rolled.h.slice(), a: game.rolled.a.slice() },
    last: game.last,
  });
  game.s = applyMove(game.s, 1, m);
  game.rem.splice(game.rem.indexOf(m.die), 1);
  if (winner(game.s)) { finish(1); return; }
  enterMovePhaseAfterMove();
}

function enterMovePhaseAfterMove() {
  game.legal = game.rem.length ? legalFirstMoves(game.s, 1, game.rem) : [];
  game.selected = null; game.hint = null;
  if (!game.legal.length) {
    game.msg = game.rem.length ? 'No more moves.' : 'Done.';
    endHumanTurn();
  } else {
    autoSelect();
    game.msg = game.selected === BAR ? 'You\'re on the bar. Tap a green spot to enter.' : 'Tap a glowing checker, then a green spot.';
    render(); save();
  }
}

function undo() {
  if (!game || !game.history.length || !['move', 'roll', 'pending'].includes(game.phase)) return;
  clearTimeout(timer);
  const h = game.history.pop();
  game.s = h.s; game.rem = h.rem; game.rolled = h.rolled; game.last = h.last;
  game.legal = legalFirstMoves(game.s, 1, game.rem);
  game.selected = null; game.hint = null; game.phase = 'move';
  autoSelect();
  game.msg = 'Move undone.';
  render(); save();
}

function hint() {
  if (!game || game.phase !== 'move') return;
  const t = chooseTurn(game.s, 1, game.rem, 'hard');
  if (!t || !t.moves.length) return;
  game.hint = { from: t.moves[0].from, to: t.moves[0].to };
  game.selected = null;
  autoSelect();
  game.msg = 'Blue shows a good move.';
  render();
}

async function aiTurn(fixedDice) {
  game.phase = 'ai'; game.last = []; game.selected = null; game.hint = null; game.legal = [];
  const d = fixedDice || rollDice();
  game.rolled.a = d; game.rolled.h = [];
  game.msg = 'Computer is thinking…';
  render();
  await sleep(900);
  const t = chooseTurn(game.s, -1, diceToRem(d), level);
  if (!t || !t.moves.length) {
    game.msg = 'Computer has no legal moves.';
    render();
    await sleep(1100);
    beginHumanTurn();
    return;
  }
  for (const m of t.moves) {
    game.s = applyMove(game.s, -1, m);
    game.last.push({ from: m.from, to: m.to });
    render();
    await sleep(550);
    if (winner(game.s)) { finish(-1); return; }
  }
  beginHumanTurn();
}

function finish(w) {
  game.phase = 'over';
  game.legal = []; game.selected = null; game.hint = null;
  const v = gameValue(game.s, w);
  const kind = v === 3 ? ' (backgammon!)' : v === 2 ? ' (gammon)' : '';
  const st = stats[level] || { w: 0, l: 0 };
  if (w === 1) st.w++; else st.l++;
  stats[level] = st; store.set(STAT_KEY, stats);
  store.del(SAVE_KEY);
  game.msg = (w === 1 ? 'You win' : 'Computer wins') + kind;
  $('bannerText').textContent = game.msg + (w === 1 ? ' 🎉' : '');
  $('banner').hidden = false;
  render();
}

function save() {
  if (!game || game.phase === 'over') return;
  const { s, rem, rolled, phase, last } = game;
  store.set(SAVE_KEY, { s, rem, rolled, phase, last });
}

function restore() {
  const sv = store.get(SAVE_KEY);
  if (!sv || !sv.s || !Array.isArray(sv.s.pts)) return false;
  game = {
    s: sv.s, rem: sv.rem || [], rolled: sv.rolled || { h: [], a: [] }, phase: sv.phase,
    selected: null, legal: [], hint: null, last: sv.last || [], history: [], msg: 'Welcome back.',
  };
  if (game.phase === 'move') enterMovePhase();
  else if (game.phase === 'roll') beginHumanTurn();
  else aiTurn();
  return true;
}

// ---------- input ----------

function onBoardClick(ev) {
  if (!game) return;
  const el = ev.target.closest('[data-pt],[data-bar],[data-off]');
  if (!el || game.phase !== 'move') return;
  let target;
  if (el.dataset.pt !== undefined) target = +el.dataset.pt;
  else if (el.dataset.bar !== undefined) target = BAR;
  else target = OFF;

  if (game.selected !== null) {
    const cands = game.legal.filter(m => m.from === game.selected && m.to === target);
    if (cands.length) {
      cands.sort((a, b) => a.die - b.die);
      doHumanMove(cands[0]);
      return;
    }
  }
  if (target === OFF && game.selected === null) {
    const offs = game.legal.filter(m => m.to === OFF);
    const froms = [...new Set(offs.map(m => m.from))];
    if (froms.length === 1) {
      offs.sort((a, b) => a.die - b.die);
      doHumanMove(offs[0]);
      return;
    }
    if (froms.length > 1) game.msg = 'Tap the checker you want to bear off first.';
    render();
    return;
  }
  if (target !== OFF && game.legal.some(m => m.from === target)) {
    game.selected = game.selected === target ? null : target;
    game.hint = null;
  } else {
    game.selected = null;
  }
  autoSelect();
  render();
}

// ---------- rendering ----------

const colX = n => (n <= 6 ? RIGHT + (6 - n) * PW
  : n <= 12 ? LEFT + (12 - n) * PW
  : n <= 18 ? LEFT + (n - 13) * PW
  : RIGHT + (n - 19) * PW);
const spacing = n => (n <= 1 ? 2 * R : Math.min(2 * R, (TH - 2 * R) / (n - 1)));
const slotY = (top, k, sp) => (top ? 20 + R + k * sp : H - 20 - R - k * sp);

function checker(cx, cy, human) {
  return `<circle cx="${cx}" cy="${cy}" r="${R - 1}" fill="url(#${human ? 'gH' : 'gA'})" stroke="${human ? '#8d7c5c' : '#000'}" stroke-width="2"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${R - 10}" fill="none" stroke="${human ? '#cdbd9c' : '#5b5b66'}" stroke-width="1.5"/>`;
}

function label(x, y, text, portrait, fill = '#888', size = 22) {
  const rot = portrait ? ` transform="rotate(-90 ${x} ${y})"` : '';
  return `<text x="${x}" y="${y + 7}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${fill}"${rot}>${text}</text>`;
}

function die(x, y, v, faded) {
  const S = 40, o = 10, c = S / 2;
  const P = {
    1: [[0, 0]], 2: [[-o, -o], [o, o]], 3: [[-o, -o], [0, 0], [o, o]],
    4: [[-o, -o], [o, -o], [-o, o], [o, o]], 5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]],
    6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]],
  };
  let g = `<g opacity="${faded ? 0.3 : 1}"><rect x="${x}" y="${y}" width="${S}" height="${S}" rx="9" fill="#f6f0e2" stroke="#222" stroke-width="2"/>`;
  for (const [dx, dy] of P[v]) g += `<circle cx="${x + c + dx}" cy="${y + c + dy}" r="4" fill="#222"/>`;
  return g + '</g>';
}

function diceRow(list, cx, rem) {
  if (!list.length) return '';
  const vals = list[0] === list[1] ? [list[0], list[0], list[0], list[0]] : list.slice();
  const left = rem ? rem.slice() : null;
  const gap = 10, S = 40, total = vals.length * S + (vals.length - 1) * gap;
  let o = '', x = cx - total / 2;
  for (const v of vals) {
    let faded = false;
    if (left) { const k = left.indexOf(v); if (k < 0) faded = true; else left.splice(k, 1); }
    o += die(x, H / 2 - S / 2, v, faded);
    x += S + gap;
  }
  return o;
}

function boardSVG(portrait) {
  const s = game.s;
  const mv = game.phase === 'move';
  const srcs = new Set(mv ? game.legal.map(m => m.from) : []);
  const dests = new Set(mv && game.selected !== null
    ? game.legal.filter(m => m.from === game.selected).map(m => m.to) : []);
  const hint = game.hint;
  const lastFrom = new Set(game.last.map(m => m.from));
  const lastTo = new Set(game.last.map(m => m.to));

  let o = `<defs>
    <radialGradient id="gH" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#d6c7a3"/></radialGradient>
    <radialGradient id="gA" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#4a4a54"/><stop offset="1" stop-color="#17171b"/></radialGradient>
  </defs>`;
  o += `<rect width="${W}" height="${H}" rx="18" fill="#4a2f18"/>`;
  o += `<rect x="${LEFT}" y="20" width="432" height="${H - 40}" fill="#1b5e45"/>`;
  o += `<rect x="${RIGHT}" y="20" width="432" height="${H - 40}" fill="#1b5e45"/>`;
  o += `<rect x="${BARX}" y="14" width="${BARW}" height="${H - 28}" fill="#5a3a1e"/>`;
  o += `<rect x="${TRAY}" y="20" width="${TRAYW}" height="${H - 40}" fill="#2a1a0d"/>`;

  for (let n = 1; n <= 24; n++) {
    const i = n - 1, x = colX(n), top = n >= 13, cx = x + PW / 2;
    const tri = top
      ? `${x},20 ${x + PW},20 ${cx},${20 + TH}`
      : `${x},${H - 20} ${x + PW},${H - 20} ${cx},${H - 20 - TH}`;
    o += `<polygon points="${tri}" fill="${n % 2 ? '#d9b97c' : '#8e3a2c'}"/>`;
    if (lastFrom.has(i)) o += `<polygon points="${tri}" fill="#ffb300" opacity=".35"/>`;
    if (lastTo.has(i)) o += `<polygon points="${tri}" fill="#ffb300" opacity=".6"/>`;
    if (dests.has(i)) o += `<polygon points="${tri}" fill="#7dffa0" opacity=".35"/>`;
    if (hint && hint.to === i) o += `<polygon points="${tri}" fill="#5cb8ff" opacity=".4"/>`;

    const v = s.pts[i], cnt = Math.abs(v), human = v > 0;
    const sp = spacing(cnt);
    for (let k = 0; k < cnt; k++) o += checker(cx, slotY(top, k, sp), human);
    if (cnt > 5) o += label(cx, slotY(top, cnt - 1, sp), cnt, portrait);
    if (cnt && human) {
      const ty = slotY(top, cnt - 1, sp);
      if (srcs.has(i)) o += `<circle class="ring${game.selected === i ? ' sel' : ''}" cx="${cx}" cy="${ty}" r="${R + 3}"/>`;
      if (hint && hint.from === i) o += `<circle class="ring hint" cx="${cx}" cy="${ty}" r="${R + 3}"/>`;
    }
    if (dests.has(i) || (hint && hint.to === i)) {
      const k = Math.min(human ? cnt : 0, 4);
      const isHint = hint && hint.to === i && !dests.has(i);
      const hit = v < 0 && cnt === 1;
      o += `<circle class="dest${isHint ? ' hint' : hit ? ' hit' : ''}" cx="${cx}" cy="${slotY(top, k, sp)}" r="12"/>`;
    }
    const ry = top ? 20 : H / 2;
    o += `<rect data-pt="${i}" x="${x}" y="${ry}" width="${PW}" height="${H / 2 - 20}" fill="transparent"/>`;
  }

  // bar
  const bx = BARX + BARW / 2;
  const hb = s.bar[0], ab = s.bar[1];
  const hsp = spacing(hb);
  const asp = spacing(ab);
  for (let k = 0; k < hb; k++) o += checker(bx, H / 2 + R + 6 + k * hsp, true);
  for (let k = 0; k < ab; k++) o += checker(bx, H / 2 - R - 6 - k * asp, false);
  if (hb && srcs.has(BAR)) {
    o += `<circle class="ring${game.selected === BAR ? ' sel' : ''}" cx="${bx}" cy="${H / 2 + R + 6 + (hb - 1) * hsp}" r="${R + 3}"/>`;
  }
  if (hint && hint.from === BAR && hb) {
    o += `<circle class="ring hint" cx="${bx}" cy="${H / 2 + R + 6 + (hb - 1) * hsp}" r="${R + 3}"/>`;
  }
  o += `<rect data-bar="1" x="${BARX}" y="14" width="${BARW}" height="${H - 28}" fill="transparent"/>`;

  // tray: pulses whenever you can bear off; strong green once a checker that can go off is selected
  const canOff = mv && game.legal.some(m => m.to === OFF);
  const offTarget = dests.has(OFF);
  const offHint = hint && hint.to === OFF;
  if (canOff || offHint) {
    const col = offHint && !offTarget ? '#5cb8ff' : '#7dffa0';
    o += `<rect class="offglow${offTarget ? ' strong' : ''}" x="${TRAY}" y="20" width="${TRAYW}" height="${H - 40}" fill="${col}"/>`;
    o += `<rect x="${TRAY + 3}" y="23" width="${TRAYW - 6}" height="${H - 46}" fill="none" stroke="${col}" stroke-width="4" stroke-dasharray="14 8" rx="6"/>`;
    const cx = TRAY + TRAYW / 2;
    o += label(cx, H / 2 - 14, 'BEAR', portrait, '#fff', 20);
    o += label(cx, H / 2 + 14, 'OFF', portrait, '#fff', 20);
    if (offTarget) o += label(cx, H / 2 + 50, '▼', portrait, '#fff', 22);
  }
  for (let k = 0; k < s.off[0]; k++) {
    o += `<rect x="${TRAY + 10}" y="${H - 20 - 6 - (k + 1) * 17}" width="${TRAYW - 20}" height="14" rx="3" fill="url(#gH)" stroke="#8d7c5c"/>`;
  }
  for (let k = 0; k < s.off[1]; k++) {
    o += `<rect x="${TRAY + 10}" y="${24 + k * 17}" width="${TRAYW - 20}" height="14" rx="3" fill="url(#gA)" stroke="#000"/>`;
  }
  o += `<rect data-off="1" x="${TRAY}" y="20" width="${TRAYW}" height="${H - 40}" fill="transparent"/>`;

  // dice: computer's on the left half, yours on the right half
  o += diceRow(game.rolled.a, 236, null);
  o += diceRow(game.rolled.h, 724, game.rem);

  return portrait
    ? `<svg viewBox="0 0 ${H} ${W}" xmlns="http://www.w3.org/2000/svg"><g transform="translate(${H} 0) rotate(90)">${o}</g></svg>`
    : `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${o}</svg>`;
}

function render() {
  if (!game) return;
  const wrap = $('board');
  const portrait = wrap.clientHeight > wrap.clientWidth;
  wrap.innerHTML = boardSVG(portrait);

  $('msg').textContent = game.msg;
  $('pips').textContent = `Pips: You ${pipCount(game.s, 1)} · CPU ${pipCount(game.s, -1)}`;
  const st = stats[level] || { w: 0, l: 0 };
  $('stats').textContent = `${LEVELS[level]}: ${st.w}W – ${st.l}L`;
  $('undo').disabled = !(game.history.length && ['move', 'roll', 'pending'].includes(game.phase));
  $('hint').disabled = game.phase !== 'move';
  document.querySelectorAll('#level button').forEach(b => b.classList.toggle('on', b.dataset.level === level));
}

// ---------- boot ----------

$('board').addEventListener('click', onBoardClick);
$('undo').addEventListener('click', undo);
$('hint').addEventListener('click', hint);
$('again').addEventListener('click', startGame);
$('new').addEventListener('click', () => {
  if (!game || game.phase === 'over' || confirm('Abandon this game and start a new one?')) startGame();
});
$('level').addEventListener('click', e => {
  const b = e.target.closest('button[data-level]');
  if (!b) return;
  level = b.dataset.level; store.set(LEVEL_KEY, level); render();
});
window.addEventListener('resize', render);
window.addEventListener('orientationchange', () => setTimeout(render, 150));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (!restore()) startGame();
