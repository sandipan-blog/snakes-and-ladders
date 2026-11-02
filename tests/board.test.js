import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_SIZE, COLS,
  DEFAULT_LADDERS, DEFAULT_SNAKES,
  cellPosition, squareAt, validateConnections, createBoard,
} from '../src/board.js';

test('cellPosition gives 100 unique (row,col) cells', () => {
  const seen = new Set();
  for (let n = 1; n <= BOARD_SIZE; n++) {
    const { row, col } = cellPosition(n);
    seen.add(`${row},${col}`);
  }
  assert.equal(seen.size, 100);
});

test('squareAt(cellPosition(n)) === n for all n', () => {
  for (let n = 1; n <= BOARD_SIZE; n++) {
    const { row, col } = cellPosition(n);
    assert.equal(squareAt(row, col), n, `roundtrip failed for ${n}`);
  }
});

test('known corner positions', () => {
  assert.deepEqual(pick(cellPosition(1)), { row: 9, col: 0 });
  assert.deepEqual(pick(cellPosition(10)), { row: 9, col: 9 });
  assert.deepEqual(pick(cellPosition(11)), { row: 8, col: 9 });
  assert.deepEqual(pick(cellPosition(20)), { row: 8, col: 0 });
  assert.deepEqual(pick(cellPosition(100)), { row: 0, col: 0 });
});

function pick(p) { return { row: p.row, col: p.col }; }

test('centre coordinates', () => {
  assert.deepEqual(pickXY(cellPosition(1)), { x: 0.5, y: 9.5 });
  assert.deepEqual(pickXY(cellPosition(100)), { x: 0.5, y: 0.5 });
});
function pickXY(p) { return { x: p.x, y: p.y }; }

test('every n and n+1 are grid neighbours', () => {
  for (let n = 1; n < BOARD_SIZE; n++) {
    const a = cellPosition(n);
    const b = cellPosition(n + 1);
    const d = Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
    assert.equal(d, 1, `${n} and ${n + 1} are not neighbours`);
  }
});

test('out-of-range squares throw RangeError', () => {
  assert.throws(() => cellPosition(0), RangeError);
  assert.throws(() => cellPosition(101), RangeError);
  assert.throws(() => cellPosition(1.5), RangeError);
  assert.throws(() => cellPosition('x'), RangeError);
});

test('defaults validate with no errors', () => {
  assert.deepEqual(validateConnections(DEFAULT_LADDERS, DEFAULT_SNAKES), []);
});

test('non-integer endpoints produce an error', () => {
  assert.ok(validateConnections({ 3: 22.5 }, {}).length > 0);
  assert.ok(validateConnections({}, { 17.5: 7 }).length > 0);
});

test('start outside 2-99 produces an error', () => {
  assert.ok(validateConnections({ 1: 20 }, {}).length > 0);
  assert.ok(validateConnections({ 100: 90 }, {}).length > 0);
  assert.ok(validateConnections({}, { 100: 50 }).length > 0);
});

test('end outside 1-100 produces an error', () => {
  assert.ok(validateConnections({ 5: 101 }, {}).length > 0);
  assert.ok(validateConnections({ 5: 0 }, {}).length > 0);
  assert.ok(validateConnections({}, { 50: 0 }).length > 0);
});

test('a ladder that does not go up produces an error', () => {
  assert.ok(validateConnections({ 20: 10 }, {}).length > 0);
  assert.ok(validateConnections({ 20: 20 }, {}).length > 0);
});

test('a snake that does not go down produces an error', () => {
  assert.ok(validateConnections({}, { 10: 20 }).length > 0);
  assert.ok(validateConnections({}, { 10: 10 }).length > 0);
});

test('one square starting two connections produces an error', () => {
  assert.ok(validateConnections({ 28: 55 }, { 28: 10 }).length > 0);
});

test('an end square that starts another connection produces an error', () => {
  // 22 is the end of the default ladder 3->22; make 22 start something.
  assert.ok(validateConnections({ 3: 22, 22: 40 }, {}).length > 0);
  assert.ok(validateConnections({ 3: 22 }, { 22: 5 }).length > 0);
});

test('createBoard returns connections and connectionAt works', () => {
  const board = createBoard();
  assert.equal(board.connections.length, 16);

  for (const [from, to] of Object.entries(DEFAULT_LADDERS)) {
    const c = board.connectionAt(Number(from));
    assert.ok(c, `missing ladder at ${from}`);
    assert.equal(c.type, 'ladder');
    assert.equal(c.from, Number(from));
    assert.equal(c.to, to);
  }
  for (const [from, to] of Object.entries(DEFAULT_SNAKES)) {
    const c = board.connectionAt(Number(from));
    assert.ok(c, `missing snake at ${from}`);
    assert.equal(c.type, 'snake');
    assert.equal(c.from, Number(from));
    assert.equal(c.to, to);
  }
  assert.equal(board.connectionAt(50), null);
});

test('createBoard throws on invalid data', () => {
  assert.throws(() => createBoard({ ladders: { 5: 3 } }));
});
