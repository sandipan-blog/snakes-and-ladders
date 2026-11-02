// Pure board data and geometry. No DOM access.

export const BOARD_SIZE = 100;
export const COLS = 10;

export const DEFAULT_LADDERS = {
  3: 22, 8: 30, 20: 41, 28: 55, 36: 57, 51: 72, 71: 92, 80: 99,
};

export const DEFAULT_SNAKES = {
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79,
};

/**
 * Position of square n on the board grid.
 * Row 0 is the TOP screen row, row 9 the bottom. Square 1 is bottom-left.
 * x/y are cell-centre coordinates in cell units (col+0.5 / row+0.5).
 */
export function cellPosition(n) {
  if (!Number.isInteger(n) || n < 1 || n > BOARD_SIZE) {
    throw new RangeError(`Square must be an integer from 1 to ${BOARD_SIZE}, got ${n}`);
  }
  const fromBottom = Math.floor((n - 1) / COLS);
  const i = (n - 1) % COLS;
  const col = fromBottom % 2 === 0 ? i : COLS - 1 - i;
  const row = COLS - 1 - fromBottom;
  return { row, col, x: col + 0.5, y: row + 0.5 };
}

/**
 * Inverse of cellPosition: which square number is at (row, col)?
 */
export function squareAt(row, col) {
  if (
    !Number.isInteger(row) || !Number.isInteger(col) ||
    row < 0 || row >= COLS || col < 0 || col >= COLS
  ) {
    throw new RangeError(`Row and column must be integers from 0 to ${COLS - 1}`);
  }
  const fromBottom = COLS - 1 - row;
  const i = fromBottom % 2 === 0 ? col : COLS - 1 - col;
  return fromBottom * COLS + i + 1;
}

/**
 * Validate a set of ladders and snakes.
 * Returns an array of error strings; empty means valid.
 */
export function validateConnections(ladders, snakes) {
  const errors = [];
  const starts = new Map(); // start square -> type

  const check = (map, type) => {
    for (const [from, to] of Object.entries(map)) {
      const f = Number(from);
      const t = to;
      const label = `${type} ${from}->${to}`;
      if (!Number.isInteger(f) || !Number.isInteger(t)) {
        errors.push(`${label}: keys and values must be integers`);
        continue;
      }
      if (f < 2 || f > BOARD_SIZE - 1) {
        errors.push(`${label}: start square must be between 2 and ${BOARD_SIZE - 1}`);
      }
      if (t < 1 || t > BOARD_SIZE) {
        errors.push(`${label}: end square must be between 1 and ${BOARD_SIZE}`);
      }
      if (type === 'ladder' && t <= f) {
        errors.push(`${label}: a ladder must go up`);
      }
      if (type === 'snake' && t >= f) {
        errors.push(`${label}: a snake must go down`);
      }
      if (starts.has(f)) {
        errors.push(`${label}: square ${f} already starts a ${starts.get(f)}`);
      } else {
        starts.set(f, type);
      }
    }
  };

  check(ladders || {}, 'ladder');
  check(snakes || {}, 'snake');

  // An end square must not start another connection (no chains).
  for (const [from, to] of Object.entries(ladders || {})) {
    if (starts.has(Number(to))) {
      errors.push(`ladder ${from}->${to}: end square ${to} starts a ${starts.get(Number(to))} (chains not allowed)`);
    }
  }
  for (const [from, to] of Object.entries(snakes || {})) {
    if (starts.has(Number(to))) {
      errors.push(`snake ${from}->${to}: end square ${to} starts a ${starts.get(Number(to))} (chains not allowed)`);
    }
  }

  return errors;
}

/**
 * Create a board object with lookup helpers.
 */
export function createBoard({ ladders = DEFAULT_LADDERS, snakes = DEFAULT_SNAKES } = {}) {
  const errors = validateConnections(ladders, snakes);
  if (errors.length > 0) {
    throw new Error('Invalid board connections:\n' + errors.join('\n'));
  }

  const connections = [
    ...Object.entries(ladders).map(([from, to]) => ({ type: 'ladder', from: Number(from), to })),
    ...Object.entries(snakes).map(([from, to]) => ({ type: 'snake', from: Number(from), to })),
  ];

  function connectionAt(n) {
    for (const c of connections) {
      if (c.from === n) return { ...c };
    }
    return null;
  }

  return { ladders, snakes, connections, connectionAt };
}
