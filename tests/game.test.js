import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STATES, DEFAULT_RULES, rollDie, planMove, describePlan, Game,
} from '../src/game.js';
import { createBoard } from '../src/board.js';

const board = createBoard();

test('60,000 rolls are integers 1..6 with roughly even faces', () => {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const r = rollDie();
    assert.ok(Number.isInteger(r));
    assert.ok(r >= 1 && r <= 6);
    counts[r]++;
  }
  for (const face of [1, 2, 3, 4, 5, 6]) {
    assert.ok(counts[face] >= 9000 && counts[face] <= 11000, `face ${face}: ${counts[face]}`);
  }
});

test('rollDie honours the rng bounds', () => {
  assert.equal(rollDie(() => 0), 1);
  assert.equal(rollDie(() => 0.999999), 6);
});

test('planMove(0,5).path is [1,2,3,4,5]', () => {
  const p = planMove(0, 5, board, DEFAULT_RULES);
  assert.deepEqual(p.path, [1, 2, 3, 4, 5]);
  assert.equal(p.final, 5);
  assert.equal(p.won, false);
});

test('25+3 -> 55 via ladder 28->55', () => {
  const p = planMove(25, 3, board, DEFAULT_RULES);
  assert.equal(p.landed, 28);
  assert.equal(p.connection.type, 'ladder');
  assert.equal(p.final, 55);
});

test('84+3 -> 24 via snake 87->24', () => {
  const p = planMove(84, 3, board, DEFAULT_RULES);
  assert.equal(p.landed, 87);
  assert.equal(p.connection.type, 'snake');
  assert.equal(p.final, 24);
});

test('0+3 -> 22 via ladder on 3', () => {
  const p = planMove(0, 3, board, DEFAULT_RULES);
  assert.equal(p.final, 22);
});

test('97+4 overshoots and stays on 97 with no connection', () => {
  const p = planMove(97, 4, board, DEFAULT_RULES);
  assert.equal(p.overshoot, true);
  assert.equal(p.moved, false);
  assert.deepEqual(p.path, []);
  assert.equal(p.final, 97);
  assert.equal(p.connection, null);
});

test('97+3 wins', () => {
  const p = planMove(97, 3, board, DEFAULT_RULES);
  assert.equal(p.final, 100);
  assert.equal(p.won, true);
});

test('96+2 -> 79 via snake on 98', () => {
  const p = planMove(96, 2, board, DEFAULT_RULES);
  assert.equal(p.landed, 98);
  assert.equal(p.final, 79);
});

test('bounce rule: 97+5 gives path [98,99,100,99,98] and final 79', () => {
  const rules = { finish: 'bounce', sixRollsAgain: false };
  const p = planMove(97, 5, board, rules);
  assert.deepEqual(p.path, [98, 99, 100, 99, 98]);
  assert.equal(p.bounced, true);
  assert.equal(p.landed, 98);
  assert.equal(p.final, 79); // snake on 98
});

test('describePlan sentences', () => {
  const ladder = describePlan('Ana', planMove(0, 3, board, DEFAULT_RULES));
  assert.match(ladder, /Ana rolled 3: start → 3, climbed a ladder to 22!/);
  const snake = describePlan('Bob', planMove(84, 3, board, DEFAULT_RULES));
  assert.match(snake, /, bitten by a snake down to 24\./);
  const stay = describePlan('Cal', planMove(97, 4, board, DEFAULT_RULES));
  assert.match(stay, /needs exactly 3 to finish: stays on 97\./);
});

function makeGame(opts = {}) {
  return new Game({
    players: [
      { name: 'Ana', color: '#e74c3c', isComputer: false },
      { name: 'Computer', color: '#3498db', isComputer: true },
    ],
    board,
    rules: opts.rules || DEFAULT_RULES,
    rng: opts.rng,
    mode: 'pvc',
    ...opts,
  });
}

test('second roll() during ROLLING or MOVING returns null', () => {
  const g = makeGame();
  assert.ok(g.roll());
  assert.equal(g.state, STATES.ROLLING);
  assert.equal(g.roll(), null);
  g.startMove();
  assert.equal(g.state, STATES.MOVING);
  assert.equal(g.roll(), null);
});

test('completeTurn before resolving a ladder throws', () => {
  const g = makeGame();
  g.forcedRolls = [3]; // 0 -> 3 -> ladder to 22
  g.roll();
  g.startMove();
  assert.throws(() => g.completeTurn(), /resolved/);
});

test('turn order with 3 players is 0,1,2,0', () => {
  const g = new Game({
    players: [
      { name: 'A', color: '#111111' },
      { name: 'B', color: '#222222' },
      { name: 'C', color: '#333333' },
    ],
    board,
    rules: DEFAULT_RULES,
  });
  const order = [];
  for (let i = 0; i < 4; i++) {
    order.push(g.current);
    g.playTurn(1);
  }
  assert.deepEqual(order, [0, 1, 2, 0]);
});

test('sixRollsAgain gives an extra turn only when enabled', () => {
  const off = makeGame();
  off.forcedRolls = [6];
  off.playTurn();
  assert.equal(off.current, 1); // advances normally

  const on = makeGame({ rules: { finish: 'exact', sixRollsAgain: true } });
  on.forcedRolls = [6];
  on.playTurn();
  assert.equal(on.current, 0); // same player again

  on.forcedRolls = [2];
  on.playTurn();
  assert.equal(on.current, 1); // non-six advances
});

test('after a win, roll() returns null', () => {
  const g = makeGame();
  g.players[0].position = 97;
  g.forcedRolls = [3];
  const res = g.playTurn();
  assert.equal(res.won, true);
  assert.equal(g.winner, 0);
  assert.equal(g.state, STATES.OVER);
  assert.equal(g.canRoll(), false);
  assert.equal(g.roll(), null);
});

test('200 seeded random 2-player games all end with the winner on exactly 100', () => {
  let seed = 42;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 200; i++) {
    const g = makeGame({ rng });
    let guard = 0;
    while (g.winner === null && guard < 5000) {
      g.playTurn();
      guard++;
    }
    assert.notEqual(g.winner, null, `game ${i} never finished`);
    const w = g.players[g.winner];
    assert.equal(w.position, 100, `game ${i} winner not on 100`);
  }
});

test('standings puts the winner first', () => {
  const g = makeGame();
  g.players[0].position = 97;
  g.players[1].position = 50;
  g.forcedRolls = [3];
  g.playTurn();
  const s = g.standings();
  assert.equal(s[0].id, 0);
  assert.equal(s[0].position, 100);
});

test('history entries carry the right fields', () => {
  const g = makeGame();
  g.forcedRolls = [3];
  const { entry } = g.playTurn();
  assert.equal(entry.player, 0);
  assert.equal(entry.roll, 3);
  assert.equal(entry.event, 'ladder');
  assert.equal(entry.final, 22);
  assert.match(entry.text, /climbed a ladder to 22!/);
});
