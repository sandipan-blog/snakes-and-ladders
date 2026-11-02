// Pure rules, dice and turn state machine. No DOM access.

import { createBoard } from './board.js';

export const STATES = {
  READY: 'ready',
  ROLLING: 'rolling',
  MOVING: 'moving',
  RESOLVING: 'resolving',
  OVER: 'over',
};

export const DEFAULT_RULES = { finish: 'exact', sixRollsAgain: false };

/** Roll a die using the given random source (clamped to 1..6). */
export function rollDie(rng = Math.random) {
  return Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
}

/**
 * Compute a full move plan without changing anything.
 * Returns { from, roll, path, landed, connection, final, moved, overshoot, bounced, won }.
 */
export function planMove(from, roll, board, rules = DEFAULT_RULES) {
  const connAt = (n) => (board && board.connectionAt ? board.connectionAt(n) : null);

  let path = [];
  let landed = null;
  let connection = null;
  let overshoot = false;
  let bounced = false;
  let moved = true;

  if (rules.finish === 'bounce') {
    // Walk up to 100, then back by the excess.
    let pos = from;
    let remaining = roll;
    let dir = 1;
    while (remaining > 0) {
      if (pos === BOARD_MAX && dir === 1) dir = -1;
      pos += dir;
      path.push(pos);
      remaining--;
    }
    bounced = from + roll > BOARD_MAX;
    landed = pos;
  } else {
    // Exact rule.
    if (from + roll > BOARD_MAX) {
      return {
        from, roll,
        path: [],
        landed: null,
        connection: null,
        final: from,
        moved: false,
        overshoot: true,
        bounced: false,
        won: false,
      };
    }
    for (let i = 1; i <= roll; i++) path.push(from + i);
    landed = from + roll;
  }

  connection = connAt(landed);
  const final = connection ? connection.to : landed;

  return {
    from, roll,
    path,
    landed,
    connection,
    final,
    moved,
    overshoot,
    bounced,
    won: final === BOARD_MAX,
  };
}

const BOARD_MAX = 100;

/**
 * A history sentence describing a plan, e.g.
 * "Ana rolled 3: start → 3, climbed a ladder to 22!"
 */
export function describePlan(name, plan) {
  const startLabel = plan.from === 0 ? 'start' : String(plan.from);
  const head = `${name} rolled ${plan.roll}: ${startLabel}`;

  if (!plan.moved) {
    const need = BOARD_MAX - plan.from;
    return `${head} needs exactly ${need} to finish: stays on ${plan.from}.`;
  }

  const endSquare = plan.path[plan.path.length - 1];
  let body;
  if (plan.bounced) {
    body = `bounced off 100 down to ${endSquare}`;
  } else {
    body = `→ ${endSquare}`;
  }

  let tail = '';
  if (plan.connection) {
    if (plan.connection.type === 'ladder') {
      tail = `, climbed a ladder to ${plan.final}!`;
    } else {
      tail = `, bitten by a snake down to ${plan.final}.`;
    }
  }

  return `${head} ${body}${tail}`;
}

/**
 * The game state machine.
 */
export class Game {
  constructor({ players, board, rules, rng, mode }) {
    if (!Array.isArray(players) || players.length < 1 || players.length > 4) {
      throw new RangeError('Game needs 1 to 4 players');
    }
    this.players = players.map((p, i) => ({
      id: i,
      name: p.name,
      color: p.color,
      isComputer: !!p.isComputer,
      position: 0,
      rolls: 0,
      ladders: 0,
      snakes: 0,
    }));
    this.board = board || createBoard();
    this.rules = { ...DEFAULT_RULES, ...(rules || {}) };
    this.rng = rng || Math.random;
    this.mode = mode || 'pvc';
    this.current = 0;
    this.state = STATES.READY;
    this.winner = null;
    this.history = [];
    this.forcedRolls = [];
    this.plan = null;
    this.turn = 0;
  }

  canRoll() {
    return this.state === STATES.READY && this.winner === null;
  }

  currentPlayer() {
    return this.players[this.current];
  }

  roll() {
    if (!this.canRoll()) return null;
    const roll = this.forcedRolls.length > 0
      ? this.forcedRolls.shift()
      : rollDie(this.rng);
    this.state = STATES.ROLLING;
    this.plan = planMove(this.currentPlayer().position, roll, this.board, this.rules);
    return { roll, plan: this.plan };
  }

  startMove() {
    if (this.state !== STATES.ROLLING) {
      throw new Error(`startMove requires state ROLLING, got ${this.state}`);
    }
    this.state = STATES.MOVING;
  }

  startResolve() {
    if (this.state !== STATES.MOVING) {
      throw new Error(`startResolve requires state MOVING, got ${this.state}`);
    }
    if (!this.plan || !this.plan.connection) {
      throw new Error('startResolve requires a connection on the landing square');
    }
    this.state = STATES.RESOLVING;
  }

  completeTurn() {
    if (this.state !== STATES.MOVING && this.state !== STATES.RESOLVING) {
      throw new Error(`completeTurn requires state MOVING or RESOLVING, got ${this.state}`);
    }
    if (this.state === STATES.MOVING && this.plan && this.plan.connection) {
      throw new Error('a connection must be resolved before completeTurn');
    }

    const player = this.currentPlayer();
    const plan = this.plan;
    const extraTurn = this.rules.sixRollsAgain && plan.roll === 6;

    player.position = plan.final;
    player.rolls += 1;
    if (plan.connection) {
      if (plan.connection.type === 'ladder') player.ladders += 1;
      else player.snakes += 1;
    }

    let event = 'move';
    if (plan.connection) event = plan.connection.type;
    else if (plan.overshoot) event = 'overshoot';
    else if (plan.bounced) event = 'bounce';

    const entry = {
      turn: this.turn,
      player: player.id,
      name: player.name,
      color: player.color,
      roll: plan.roll,
      from: plan.from,
      landed: plan.landed,
      final: plan.final,
      event,
      text: describePlan(player.name, plan),
    };
    this.history.push(entry);

    let won = false;
    if (plan.won) {
      this.winner = player.id;
      this.state = STATES.OVER;
      won = true;
    } else {
      if (!extraTurn) {
        this.current = (this.current + 1) % this.players.length;
      }
      this.state = STATES.READY;
    }
    this.turn += 1;
    this.plan = null;
    return { entry, won, extraTurn };
  }

  /** Run one whole turn synchronously (for tests). */
  playTurn(forcedRoll) {
    if (forcedRoll !== undefined) this.forcedRolls.push(forcedRoll);
    const r = this.roll();
    if (!r) return null;
    this.startMove();
    if (r.plan.connection) this.startResolve();
    return this.completeTurn();
  }

  standings() {
    const list = [...this.players];
    list.sort((a, b) => {
      if (this.winner !== null) {
        const aw = a.id === this.winner ? 1 : 0;
        const bw = b.id === this.winner ? 1 : 0;
        if (aw !== bw) return bw - aw;
      }
      return b.position - a.position;
    });
    return list;
  }
}
