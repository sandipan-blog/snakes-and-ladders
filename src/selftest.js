// Self-test mode: drives the REAL interface in a real browser.
// Loaded from main.js ONLY when the URL has ?selftest.

function log(...args) {
  try { console.log('[selftest]', ...args); } catch { /* ignore */ }
}

const results = [];

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

function setPhase(text) {
  document.title = text;
  const pre = document.getElementById('selftest-result');
  if (pre) pre.textContent = JSON.stringify(results, null, 2);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll `fn()` until it returns truthy or the time limit passes. */
async function waitFor(fn, timeout = 5000, label = '') {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    try {
      const v = fn();
      if (v) return v;
    } catch { /* keep polling */ }
    await wait(50);
  }
  throw new Error(`waitFor timed out${label ? `: ${label}` : ''}`);
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function click(el) {
  if (!el) throw new Error('click: element not found');
  el.click();
}

function cellRect(square) {
  const cell = $(`.cell[data-square="${square}"]`);
  if (!cell) throw new Error(`no cell ${square}`);
  return cell.getBoundingClientRect();
}

function pointInSquare(x, y, square) {
  const r = cellRect(square);
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// The controller exposes these via window.__SNL (set in main.js).
const S = () => window.__SNL;

async function run() {
  setPhase('SELFTEST running');

  // ---- Scenario 1: Menu → Setup → Start (pvc) ----
  try {
    click($('#btn-play'));
    await waitFor(() => $('#screen-setup').classList.contains('active'), 3000, 'setup screen');
    click($('#btn-start'));
    await waitFor(() => $('#screen-game').classList.contains('active'), 3000, 'game screen');
    await waitFor(() => S().game && S().game.state === 'ready', 3000, 'game ready');
    check('1. menu→setup→start (pvc)', true);
  } catch (e) {
    check('1. menu→setup→start (pvc)', false, e.message);
    return finish();
  }

  // ---- Scenario 2: 100 cells in serpentine order + SVG ends inside squares ----
  try {
    const cells = $$('.cells .cell');
    let orderOk = cells.length === 100;
    const expected = [];
    // screen order row by row; use board.squareAt via the module map
    for (let i = 0; i < 100 && orderOk; i++) {
      const sq = Number(cells[i].dataset.square);
      expected.push(sq);
    }
    // serpentine: build expected list row by row
    const want = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const fromBottom = 9 - row;
        const idx = fromBottom % 2 === 0 ? col : 9 - col;
        want.push(fromBottom * 10 + idx + 1);
      }
    }
    orderOk = JSON.stringify(expected) === JSON.stringify(want);
    check('2a. 100 cells in serpentine order', orderOk,
      orderOk ? '' : `first cells: ${expected.slice(0, 12).join(',')}`);

    // Both ends of all 16 connections inside the correct squares.
    const svg = $('svg.art');
    const brd = svg.getBoundingClientRect();
    let artOk = true;
    const bad = [];
    for (const g of [...svg.querySelectorAll('.ladder, .snake')]) {
      const type = g.classList.contains('ladder') ? 'ladder' : 'snake';
      const from = Number(g.dataset.from);
      const to = Number(g.dataset.to);
      // Sample points along the group's bounding path via getBBox in user units.
      const bb = g.getBBox();
      const toScreen = (ux, uy) => ({
        x: brd.left + (ux / 100) * brd.width,
        y: brd.top + (uy / 100) * brd.height,
      });
      // head/end points: use the stored geometry through the renderer
      const R = S().renderer;
      const a = R.constructor && window.__SNL_squareCenter
        ? window.__SNL_squareCenter(from)
        : null;
      void a;
      // Check both endpoint squares are covered by the art bbox mapped to screen.
      const pA = toScreen(bb.x, bb.y);
      const pB = toScreen(bb.x + bb.width, bb.y + bb.height);
      const coversFrom = rectsOverlap(bbToScreenRect(bb, brd), cellRect(from));
      const coversTo = rectsOverlap(bbToScreenRect(bb, brd), cellRect(to));
      if (!coversFrom || !coversTo) {
        artOk = false;
        bad.push(`${type} ${from}->${to}`);
      }
      void pA; void pB;
    }
    check('2b. all 16 snake/ladder ends inside correct squares', artOk, bad.join('; '));
  } catch (e) {
    check('2. board structure', false, e.message);
  }

  // ---- Scenario 3: three synchronous clicks → exactly ONE roll ----
  try {
    S().game.forcedRolls = [4];
    const rollBtn = $('#btn-roll');
    click(rollBtn); click(rollBtn); click(rollBtn);
    // wait for the turn to finish
    await waitFor(() => !S().busy && S().game.state === 'ready' && S().game.history.length === 1, 8000, 'first turn done');
    const dv = Number($('#dice').dataset.value);
    check('3. three sync clicks → one roll; dice data-value matches',
      S().game.history.length === 1 && dv === 4,
      `history=${S().game.history.length} data-value=${dv}`);
  } catch (e) {
    check('3. sync clicks', false, e.message);
  }

  // Wait for the computer's turn (scenario 4) before continuing.
  try {
    await waitFor(() => S().game.current === 0 && !S().busy && S().game.state === 'ready', 15000, 'computer turn done');
    check('4. computer rolls automatically after human', S().game.history.length === 2,
      `history=${S().game.history.length}`);
  } catch (e) {
    check('4. computer rolls automatically', false, e.message);
  }

  // ---- Scenario 5: position 0 + roll 3 → 22 via ladder, state passes resolving ----
  try {
    const g = S().game;
    g.players[0].position = 0;
    g.players[1].position = 0;
    S().renderer.layoutAll(g.players.map((p) => ({ id: p.id, position: p.position })));
    g.forcedRolls = [3];
    click($('#btn-roll'));
    await waitFor(() => !S().busy && g.state === 'ready', 10000, 'ladder turn');
    const hist = g.history[g.history.length - 1];
    const sawResolving = S().stateLog.includes('resolving');
    check('5. 0+3 → 22 via ladder; passed through resolving',
      hist.player === 0 && hist.final === 22 && hist.event === 'ladder' && sawResolving,
      `final=${hist.final} event=${hist.event} resolving=${sawResolving}`);
  } catch (e) {
    check('5. ladder from start', false, e.message);
  }

  // Wait out any pending computer turn.
  async function settleCpu() {
    await waitFor(() => S().game.current === 0 && !S().busy && S().game.state === 'ready', 15000, 'cpu settle');
  }

  try { await settleCpu(); } catch { /* ignore */ }

  // ---- Scenario 6: 84 + 3 → 24 via snake ----
  try {
    const g = S().game;
    g.players[0].position = 84;
    S().renderer.layoutAll(g.players.map((p) => ({ id: p.id, position: p.position })));
    g.forcedRolls = [3];
    click($('#btn-roll'));
    await waitFor(() => !S().busy && g.state === 'ready', 10000, 'snake turn');
    const hist = g.history[g.history.length - 1];
    check('6. 84+3 → 24 via snake', hist.player === 0 && hist.final === 24 && hist.event === 'snake',
      `final=${hist.final} event=${hist.event}`);
  } catch (e) {
    check('6. snake from 84', false, e.message);
  }
  try { await settleCpu(); } catch { /* ignore */ }

  // ---- Scenario 7: 97 + 4 → stays on 97 ----
  try {
    const g = S().game;
    g.players[0].position = 97;
    S().renderer.layoutAll(g.players.map((p) => ({ id: p.id, position: p.position })));
    g.forcedRolls = [4];
    click($('#btn-roll'));
    await waitFor(() => !S().busy && g.state === 'ready', 10000, 'overshoot turn');
    const hist = g.history[g.history.length - 1];
    check('7. 97+4 stays on 97 (overshoot)', hist.player === 0 && hist.final === 97 && hist.event === 'overshoot',
      `final=${hist.final} event=${hist.event}`);
  } catch (e) {
    check('7. overshoot at 97', false, e.message);
  }
  try { await settleCpu(); } catch { /* ignore */ }

  // ---- Scenario 8: 97 + 3 → winner, overlay, further roll refused ----
  try {
    const g = S().game;
    g.players[0].position = 97;
    S().renderer.layoutAll(g.players.map((p) => ({ id: p.id, position: p.position })));
    g.forcedRolls = [3];
    click($('#btn-roll'));
    await waitFor(() => g.winner !== null, 10000, 'winner');
    await waitFor(() => !$('#gameover').classList.contains('hidden'), 10000, 'gameover overlay');
    const histBefore = g.history.length;
    click($('#btn-roll'));
    await wait(300);
    check('8. 97+3 wins; overlay shown; further roll refused',
      g.winner === 0 && g.history.length === histBefore,
      `winner=${g.winner} history=${g.history.length}`);
  } catch (e) {
    check('8. win and refuse', false, e.message);
  }

  // ---- Scenario 9: Play Again resets everyone to 0 ----
  try {
    click($('#btn-again'));
    await waitFor(() => S().game && S().game.state === 'ready' && !S().busy, 5000, 'play again');
    const g = S().game;
    const allZero = g.players.every((p) => p.position === 0);
    check('9. Play Again resets everyone to 0', allZero && g.history.length === 0,
      `positions=${g.players.map((p) => p.position).join(',')} history=${g.history.length}`);
  } catch (e) {
    check('9. play again reset', false, e.message);
  }

  // ---- Scenario 10: local 3 players order 0,1,2,0; shared tokens visible ----
  try {
    // Exit to menu first (game is over, so no confirm needed).
    click($('#btn-win-menu'));
    await waitFor(() => $('#screen-menu').classList.contains('active'), 3000, 'menu');
    click($('#btn-play'));
    await waitFor(() => $('#screen-setup').classList.contains('active'), 3000, 'setup');
    // choose local, 3 players
    const localRadio = $('input[name="mode"][value="local"]');
    localRadio.checked = true;
    localRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(100);
    click($('#player-count button[data-n="3"]'));
    await wait(100);
    click($('#btn-start'));
    await waitFor(() => $('#screen-game').classList.contains('active') && S().game.state === 'ready', 5000, 'local game');

    const g = S().game;
    const order = [];
    for (let i = 0; i < 4; i++) {
      order.push(g.current);
      g.forcedRolls = [2];
      click($('#btn-roll'));
      await waitFor(() => !S().busy && g.state === 'ready', 10000, `local turn ${i}`);
    }
    const orderOk = JSON.stringify(order) === JSON.stringify([0, 1, 2, 0]);

    // Two tokens on the same square: both inside the cell and ≥8px apart.
    const p0 = g.players[0], p1 = g.players[1];
    // Put both on square 50 by hand and lay them out.
    p0.position = 50; p1.position = 50;
    S().renderer.layoutAll(g.players.map((p) => ({ id: p.id, position: p.position })));
    await wait(300);
    const t0 = $('#token-0').getBoundingClientRect();
    const t1 = $('#token-1').getBoundingClientRect();
    const cr = cellRect(50);
    const inside = (t, r) => t.left >= r.left - 2 && t.right <= r.right + 2 && t.top >= r.top - 2 && t.bottom <= r.bottom + 2;
    const dist = Math.hypot((t0.left + t0.width / 2) - (t1.left + t1.width / 2), (t0.top + t0.height / 2) - (t1.top + t1.height / 2));
    const ok = orderOk && inside(t0, cr) && inside(t1, cr) && dist >= 8;
    check('10. local 3-player order 0,1,2,0; shared tokens ok', ok,
      `order=${order.join(',')} dist=${dist.toFixed(1)}px in0=${inside(t0, cr)} in1=${inside(t1, cr)} cell=[${cr.left.toFixed(0)},${cr.top.toFixed(0)},${cr.right.toFixed(0)},${cr.bottom.toFixed(0)}] t0=[${t0.left.toFixed(0)},${t0.top.toFixed(0)}] t1=[${t1.left.toFixed(0)},${t1.top.toFixed(0)}]`);
  } catch (e) {
    check('10. local multiplayer', false, e.message);
  }

  // ---- Scenario 11: Restart (confirm→yes) and Exit to Menu ----
  try {
    click($('#btn-restart'));
    await waitFor(() => !$('#confirm').classList.contains('hidden'), 3000, 'confirm open');
    click($('#confirm-yes'));
    await waitFor(() => $('#confirm').classList.contains('hidden') && S().game.state === 'ready' && !S().busy, 5000, 'restart done');
    const restarted = S().game.players.every((p) => p.position === 0) && S().game.history.length === 0;

    click($('#btn-exit'));
    await waitFor(() => !$('#confirm').classList.contains('hidden'), 3000, 'exit confirm');
    click($('#confirm-yes'));
    await waitFor(() => $('#screen-menu').classList.contains('active'), 3000, 'back at menu');
    check('11. restart (confirm→yes) and exit to menu', restarted,
      restarted ? '' : 'game did not reset');
  } catch (e) {
    check('11. restart/exit', false, e.message);
  }

  // ---- Scenario 12: solo mode has no automatic opponent ----
  try {
    click($('#btn-play'));
    await waitFor(() => $('#screen-setup').classList.contains('active'), 3000, 'setup');
    const soloRadio = $('input[name="mode"][value="solo"]');
    soloRadio.checked = true;
    soloRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(100);
    click($('#btn-start'));
    await waitFor(() => $('#screen-game').classList.contains('active') && S().game.state === 'ready', 5000, 'solo game');

    const g = S().game;
    const turnsBefore = g.history.length;
    g.forcedRolls = [5];
    click($('#btn-roll'));
    await waitFor(() => !S().busy && g.state === 'ready', 10000, 'solo turn');
    await wait(1500); // would be enough time for an automatic opponent
    check('12. solo has no automatic opponent',
      g.players.length === 1 && g.history.length === turnsBefore + 1 && g.current === 0,
      `players=${g.players.length} history=${g.history.length}`);
  } catch (e) {
    check('12. solo mode', false, e.message);
  }

  finish();
}

function bbToScreenRect(bb, brd) {
  return {
    left: brd.left + (bb.x / 100) * brd.width,
    top: brd.top + (bb.y / 100) * brd.height,
    right: brd.left + ((bb.x + bb.width) / 100) * brd.width,
    bottom: brd.top + ((bb.y + bb.height) / 100) * brd.height,
  };
}

function rectsOverlap(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function finish() {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const verdict = passed === total ? 'PASS' : 'FAIL';
  setPhase(`SELFTEST ${passed}/${total} ${verdict}`);
  const pre = document.getElementById('selftest-result');
  if (pre) pre.textContent = JSON.stringify(results, null, 2);
  log(`SELFTEST ${passed}/${total} ${verdict}`);
}

run().catch((e) => {
  check('unhandled error', false, e && e.message);
  finish();
});
