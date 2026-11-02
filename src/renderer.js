// Board rendering: cells, ladders and snakes as DOM + inline SVG. No game logic here.

import { cellPosition, squareAt } from './board.js';

/**
 * Centre of square n in board units (0..100 across the board).
 * For n = 0 (off-board start) the point sits inside the START strip below
 * the board; `slot` spreads multiple tokens apart.
 */
export function squareCenter(n, slot = 0) {
  if (n === 0) return { x: 8 + slot * 9, y: 105.5 };
  const p = cellPosition(n);
  return { x: p.x * 10, y: p.y * 10 };
}

// Token sharing layouts: offsets (in board units) for tokens on the same square.
const TOKEN_OFFSETS = {
  1: [[0, 0]],
  2: [[-1.8, 0], [1.8, 0]],
  3: [[-1.8, -1.5], [1.8, -1.5], [0, 1.6]],
  4: [[-1.8, -1.6], [1.8, -1.6], [-1.8, 1.6], [1.8, 1.6]],
};

const STEP_MS = 230;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Schedule an animation frame through ONE helper: requestAnimationFrame
 * normally, but setTimeout(...,16) when window.__SNL_NO_RAF is true.
 * Reason: headless Chrome with --dump-dom --virtual-time-budget never fires
 * rAF, so a rAF-only tween would hang the self-test.
 */
export function nextFrame(cb) {
  if (typeof window !== 'undefined' && window.__SNL_NO_RAF) {
    setTimeout(() => cb(performance.now()), 16);
  } else {
    requestAnimationFrame(cb);
  }
}

/**
 * Promise-based rAF tween. Calls onUpdate(t) with t in 0..1 until done,
 * or stops early when isCancelled() returns true.
 */
export function tween(ms, onUpdate, isCancelled) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      if (isCancelled && isCancelled()) {
        resolve(false);
        return;
      }
      let t = Math.min(1, (now - start) / ms);
      // ease-in-out
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      try {
        onUpdate(eased, t);
      } catch {
        /* keep going */
      }
      if (t >= 1) {
        resolve(true);
        return;
      }
      nextFrame(tick);
    };
    nextFrame(tick);
  });
}

const SNAKE_COLORS = [
  ['#8bc34a', '#33691e'],
  ['#4fc3f7', '#01579b'],
  ['#ffb74d', '#e65100'],
  ['#ba68c8', '#4a148c'],
  ['#f06292', '#880e4f'],
  ['#4db6ac', '#004d40'],
  ['#fff176', '#f57f17'],
  ['#7986cb', '#1a237e'],
];

let gradientIdCounter = 0;

function svgEl(name, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export class BoardRenderer {
  constructor(wrapEl) {
    this.wrap = wrapEl;
    this.cellsEl = wrapEl.querySelector('.cells');
    this.svg = wrapEl.querySelector('svg.art');
    this.snakePaths = new Map(); // head square -> [{x,y}, ...] sampled centreline
    this.tokensEl = wrapEl.querySelector('.tokens');
    this.tokens = new Map(); // player id -> element
    this.stepMs = STEP_MS;
    this.travelMs = { ladder: 1000, snake: 1300 };
  }

  /** Build the whole board (cells + connections) from a board object. */
  build(board) {
    this.board = board;
    this.cellsEl.innerHTML = '';
    this.svg.innerHTML = '';
    this.snakePaths.clear();

    // Cells in screen order: row by row, left to right.
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        this.cellsEl.appendChild(this.#makeCell(row, col));
      }
    }

    // Ladders first, snakes on top.
    const ladders = board.connections.filter((c) => c.type === 'ladder');
    const snakes = board.connections.filter((c) => c.type === 'snake');
    for (const conn of ladders) this.svg.appendChild(this.#makeLadder(conn));
    for (const conn of snakes) this.svg.appendChild(this.#makeSnake(conn));
  }

  #makeCell(row, col) {
    const n = squareAt(row, col);
    const cell = document.createElement('div');
    cell.className = `cell c${(row * 3 + col) % 5}`;
    cell.dataset.square = String(n);

    const num = document.createElement('span');
    num.className = 'cell-num';
    num.textContent = String(n);
    cell.appendChild(num);

    if (n === 100) {
      const trophy = document.createElement('span');
      trophy.className = 'cell-badge';
      trophy.textContent = '🏆';
      cell.appendChild(trophy);
      cell.classList.add('goal');
    } else if (n === 1) {
      const start = document.createElement('span');
      start.className = 'cell-badge start-label';
      start.textContent = 'START';
      cell.appendChild(start);
      cell.classList.add('origin');
    }

    const conn = this.board.connectionAt(n);
    if (conn) {
      cell.title = `${n}: ${conn.type} to ${conn.to}`;
    } else {
      cell.title = `${n}`;
    }
    return cell;
  }

  #makeLadder({ from, to }) {
    const a = squareCenter(from);
    const b = squareCenter(to);
    const g = svgEl('g', { class: 'ladder', 'data-from': from, 'data-to': to });

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy; // perpendicular
    const py = ux;
    const OFF = 1.9;

    const railA1 = { x: a.x + px * OFF, y: a.y + py * OFF };
    const railA2 = { x: b.x + px * OFF, y: b.y + py * OFF };
    const railB1 = { x: a.x - px * OFF, y: a.y - py * OFF };
    const railB2 = { x: b.x - px * OFF, y: b.y - py * OFF };

    const pts = (p, q) => `${p.x},${p.y} ${q.x},${q.y}`;

    // Darker wide lines underneath…
    g.appendChild(svgEl('line', {
      x1: railA1.x, y1: railA1.y, x2: railA2.x, y2: railA2.y,
      class: 'ladder-rail under', points: pts(railA1, railA2),
    }));
    g.appendChild(svgEl('line', {
      x1: railB1.x, y1: railB1.y, x2: railB2.x, y2: railB2.y,
      class: 'ladder-rail under', points: pts(railB1, railB2),
    }));
    // …and lighter lines on top.
    g.appendChild(svgEl('line', {
      x1: railA1.x, y1: railA1.y, x2: railA2.x, y2: railA2.y,
      class: 'ladder-rail over',
    }));
    g.appendChild(svgEl('line', {
      x1: railB1.x, y1: railB1.y, x2: railB2.x, y2: railB2.y,
      class: 'ladder-rail over',
    }));

    // Rungs every ~3.3 units along the ladder.
    const rungCount = Math.max(2, Math.floor(len / 3.3));
    for (let i = 1; i <= rungCount; i++) {
      const t = i / (rungCount + 1);
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      g.appendChild(svgEl('line', {
        x1: cx + px * OFF, y1: cy + py * OFF,
        x2: cx - px * OFF, y2: cy - py * OFF,
        class: 'ladder-rung',
      }));
    }
    return g;
  }

  #makeSnake({ from, to }) {
    const head = squareCenter(from);
    const tail = squareCenter(to);
    const idx = [...this.snakePaths.keys()].length % SNAKE_COLORS.length;
    const [light, dark] = SNAKE_COLORS[idx];

    const g = svgEl('g', { class: 'snake', 'data-from': from, 'data-to': to });

    const gradId = `snake-grad-${++gradientIdCounter}-${from}`;
    const defs = svgEl('defs');
    const grad = svgEl('linearGradient', { id: gradId });
    const s1 = svgEl('stop', { offset: '0%', 'stop-color': light });
    const s2 = svgEl('stop', { offset: '100%', 'stop-color': dark });
    grad.appendChild(s1);
    grad.appendChild(s2);
    defs.appendChild(grad);
    g.appendChild(defs);

    // Wavy centreline: 64 samples with a sideways sine offset.
    const SAMPLES = 64;
    const dx = tail.x - head.x;
    const dy = tail.y - head.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const amp = Math.min(3.2, 1.6 + len * 0.03);
    const waves = Math.max(2, Math.round(len / 14));

    const centre = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      const bx = head.x + dx * t;
      const by = head.y + dy * t;
      const off = amp * Math.sin(t * Math.PI * waves);
      centre.push({ x: bx + px * off, y: by + py * off });
    }
    this.snakePaths.set(from, centre);

    // Filled body polygon tapering from 1.9 (head) to 0.3 (tail).
    const left = [];
    const right = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      const w = 1.9 * (1 - t) + 0.3 * t;
      const c = centre[i];
      const cn = centre[Math.min(i + 1, SAMPLES - 1)];
      const cp = centre[Math.max(i - 1, 0)];
      let tx = cn.x - cp.x;
      let ty = cn.y - cp.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      left.push(`${c.x + nx * w},${c.y + ny * w}`);
      right.push(`${c.x - nx * w},${c.y - ny * w}`);
    }
    const polygon = svgEl('polygon', {
      points: [...left, ...right.reverse()].join(' '),
      fill: `url(#${gradId})`,
      class: 'snake-body',
      stroke: dark,
      'stroke-width': '0.15',
    });
    g.appendChild(polygon);

    // Dashed light stroke along the centreline: spots.
    const path = svgEl('path', {
      d: 'M' + centre.map((c) => `${c.x} ${c.y}`).join(' L'),
      class: 'snake-spots',
    });
    g.appendChild(path);

    // Head: an ellipse rotated to the body direction, eyes and tongue.
    const headDir = {
      x: centre[1].x - centre[0].x,
      y: centre[1].y - centre[0].y,
    };
    const angleDeg = (Math.atan2(headDir.y, headDir.x) * 180) / Math.PI;
    const hg = svgEl('g', {
      transform: `translate(${centre[0].x} ${centre[0].y}) rotate(${angleDeg})`,
      class: 'snake-head',
    });
    hg.appendChild(svgEl('ellipse', { rx: 2.3, ry: 1.6, fill: dark }));
    hg.appendChild(svgEl('circle', { cx: 0.7, cy: -0.7, r: 0.35, fill: '#fff', class: 'eye' }));
    hg.appendChild(svgEl('circle', { cx: 0.7, cy: 0.7, r: 0.35, fill: '#fff', class: 'eye' }));
    hg.appendChild(svgEl('circle', { cx: 0.85, cy: -0.7, r: 0.16, fill: '#000', class: 'pupil' }));
    hg.appendChild(svgEl('circle', { cx: 0.85, cy: 0.7, r: 0.16, fill: '#000', class: 'pupil' }));
    // Red forked tongue pointing forward.
    hg.appendChild(svgEl('path', {
      d: 'M2.2 0 L4 0 M4 0 L5 -0.6 M4 0 L5 0.6',
      stroke: '#e11d48',
      'stroke-width': '0.3',
      fill: 'none',
      class: 'tongue',
    }));
    g.appendChild(hg);

    return g;
  }

  // ---------- Tokens ----------

  /** Create one .token div per player inside .tokens. */
  createTokens(players) {
    this.tokensEl.innerHTML = '';
    this.tokens.clear();
    for (const p of players) {
      const el = document.createElement('div');
      el.className = 'token';
      el.id = `token-${p.id}`;
      el.style.background = p.color;
      el.textContent = p.isComputer ? '🤖' : (p.name || '?').trim().charAt(0).toUpperCase() || '?';
      this.tokensEl.appendChild(el);
      this.tokens.set(p.id, el);
    }
    this.layoutAll(players.map((p) => ({ id: p.id, position: 0 })));
  }

  /**
   * Place every token at its square using percentage left/top.
   * `positions` is a list of { id, position } (defaults to all tokens).
   */
  layoutAll(positions = []) {
    // Group tokens by square to apply sharing offsets.
    const bySquare = new Map();
    const ids = positions.length > 0
      ? positions.map((p) => p.id)
      : [...this.tokens.keys()];
    const posMap = new Map(positions.map((p) => [p.id, p.position]));

    for (const id of ids) {
      const sq = posMap.has(id) ? posMap.get(id) : 0;
      if (!bySquare.has(sq)) bySquare.set(sq, []);
      bySquare.get(sq).push(id);
    }

    for (const [sq, idsOnSq] of bySquare) {
      const layout = TOKEN_OFFSETS[Math.min(idsOnSq.length, 4)] || TOKEN_OFFSETS[4];
      idsOnSq.forEach((id, i) => {
        const off = layout[i % layout.length];
        this.#placeToken(id, sq, off[0], off[1]);
      });
    }
  }

  #placeToken(id, square, dxUnits = 0, dyUnits = 0) {
    const el = this.tokens.get(id);
    if (!el) return;
    const c = squareCenter(square, 0);
    // The token layer covers the wrap (board + 9% START strip), which is
    // 1.09x the board height — so a board-unit y divides by 1.09 to land
    // on the right row of THIS layer.
    el.style.left = `${c.x + dxUnits}%`;
    el.style.top = `${(c.y + dyUnits) / 1.09}%`;
    el.dataset.square = String(square);
  }

  /** Instantly place a single token on a square (no animation). */
  placeToken(id, square) {
    this.layoutAll(); // recompute sharing for everyone
    void square;
  }

  /**
   * Hop a token along `path` one square at a time (~230 ms per step).
   * Resolves when the walk finishes, or early if isCancelled() turns true.
   */
  async walk(id, path, onStep, isCancelled) {
    for (let i = 0; i < path.length; i++) {
      if (isCancelled && isCancelled()) return false;
      const sq = path[i];
      // Temporarily move this token; others stay put but may need re-layout
      // when sharing a square — recompute each step.
      const positions = [...this.tokens.keys()].map((pid) => ({
        id: pid,
        position: pid === id ? sq : Number(this.tokens.get(pid).dataset.square || 0),
      }));
      this.layoutAll(positions);
      const el = this.tokens.get(id);
      if (el) {
        el.classList.remove('hop');
        void el.offsetWidth; // restart the keyframe
        el.classList.add('hop');
      }
      if (onStep) onStep(sq, i);
      await wait(this.stepMs);
    }
    return !isCancelled || !isCancelled();
  }

  /**
   * Travel along a connection. A LADDER moves in a straight line from bottom
   * to top (~1000 ms, ease-in-out, slight sideways bob). A SNAKE moves along
   * the sampled `snakePaths` centreline from head to tail (~1300 ms, with a
   * wiggle rotation). Briefly brightens the art (.pulse).
   */
  async travel(id, conn, isCancelled) {
    const el = this.tokens.get(id);
    if (!el) return false;

    const artEl = this.svg.querySelector(
      `${conn.type}[data-from="${conn.from}"][data-to="${conn.to}"]`,
    );
    if (artEl) {
      artEl.classList.add('pulse');
      setTimeout(() => artEl && artEl.classList.remove('pulse'), Math.max(600, this.travelMs[conn.type]));
    }

    const fromC = squareCenter(conn.from);
    let result = true;

    // The token layer covers the wrap (board + START strip): divide y by 1.09.
    const sy = (y) => y / 1.09;

    if (conn.type === 'ladder') {
      const toC = squareCenter(conn.to);
      // Perpendicular unit vector for the sideways bob.
      const dx = toC.x - fromC.x;
      const dy = sy(toC.y) - sy(fromC.y);
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      result = await tween(this.travelMs.ladder, (eased) => {
        const bob = Math.sin(eased * Math.PI) * 1.4;
        const x = fromC.x + dx * eased + px * bob;
        const y = sy(fromC.y) + dy * eased + py * bob;
        el.style.left = `${x}%`;
        el.style.top = `${y}%`;
      }, isCancelled);
    } else {
      const pts = this.snakePaths.get(conn.from);
      if (!pts || pts.length < 2) {
        // No stored path: fall back to a straight slide.
        const toC = squareCenter(conn.to);
        result = await tween(this.travelMs.snake, (eased) => {
          el.style.left = `${fromC.x + (toC.x - fromC.x) * eased}%`;
          el.style.top = `${sy(fromC.y + (toC.y - fromC.y) * eased)}%`;
        }, isCancelled);
      } else {
        const last = pts.length - 1;
        result = await tween(this.travelMs.snake, (eased) => {
          const f = eased * last;
          const i = Math.min(Math.floor(f), last - 1);
          const t = f - i;
          const a = pts[i];
          const b = pts[i + 1];
          el.style.left = `${a.x + (b.x - a.x) * t}%`;
          el.style.top = `${sy(a.y + (b.y - a.y) * t)}%`;
          el.style.rotate = `${Math.sin(eased * Math.PI * 6) * 14}deg`;
        }, isCancelled);
        el.style.rotate = '0deg';
      }
    }

    // Snap exactly onto the destination and update dataset.
    el.style.left = '';
    el.style.top = '';
    this.layoutAll();
    return result;
  }
}

/** A 3x3 pip-grid dice view. The result is decided BEFORE the animation. */
export class DiceView {
  constructor(el) {
    this.el = el;
    this.duration = 750;
    this.show(1);
  }

  static PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  show(n) {
    this.el.dataset.value = String(n);
    this.el.innerHTML = '';
    const on = DiceView.PIPS[n] || [];
    for (let i = 0; i < 9; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip' + (on.includes(i) ? ' on' : '');
      this.el.appendChild(pip);
    }
  }

  /** Tumble through random faces for ~750 ms, then settle on `result`. */
  async roll(result, onTick) {
    const start = performance.now();
    let last = -1;
    while (true) {
      const now = performance.now();
      if (now - start >= this.duration) break;
      let face;
      do {
        face = 1 + Math.floor(Math.random() * 6);
      } while (face === last);
      last = face;
      this.show(face);
      this.el.classList.add('tumbling');
      if (onTick) onTick(face);
      await wait(70);
    }
    this.el.classList.remove('tumbling');
    this.show(result); // the real, pre-decided result
    return result;
  }
}

// ---------- Confetti ----------

const CONFETTI_COLORS = ['#ff5f7e', '#ffd700', '#4fc3f7', '#8bc34a', '#ba68c8', '#ff8a50'];

let confettiRaf = null;

/**
 * Confetti on a canvas for about 6 s, using a single rAF loop that stops
 * itself. `stopConfetti()` cancels it.
 */
export function startConfetti(canvas) {
  stopConfetti();
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    const N = 140;
    const parts = [];
    for (let i = 0; i < N; i++) {
      parts.push({
        x: Math.random() * W,
        y: -Math.random() * H,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        vx: -1 + Math.random() * 2,
        vy: 1.5 + Math.random() * 3,
        rot: Math.random() * Math.PI * 2,
        vr: -0.1 + Math.random() * 0.2,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      });
    }

    const start = performance.now();
    const DURATION = 6000;

    const frame = () => {
      const now = performance.now();
      const elapsed = now - start;
      ctx.clearRect(0, 0, W, H);
      if (elapsed >= DURATION) {
        confettiRaf = null;
        return; // stops itself
      }
      const fade = elapsed > DURATION - 800 ? (DURATION - elapsed) / 800 : 1;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H + 20) {
          p.y = -20;
          p.x = Math.random() * W;
        }
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      confettiRaf = requestAnimationFrame(frame);
    };
    confettiRaf = requestAnimationFrame(frame);
  } catch {
    /* no canvas — ignore */
  }
}

export function stopConfetti() {
  if (confettiRaf !== null) {
    cancelAnimationFrame(confettiRaf);
    confettiRaf = null;
  }
}
