// Setup form logic: modes, player rows, colours and options.
// Also the in-game side panel (turn card, player list, history, status).

export const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#ff7ab6'];

/**
 * Controls the setup screen: mode radios, player count, per-player rows
 * (name + colour swatches) and the options block.
 */
export class SetupForm {
  constructor(root = document) {
    this.root = root;
    this.modeEls = [...root.querySelectorAll('input[name="mode"]')];
    this.countRow = root.getElementById('count-row');
    this.playerCount = root.getElementById('player-count');
    this.playerRows = root.getElementById('player-rows');
    this.errorEl = root.getElementById('error-setup') || root.getElementById('setup-error');
    this.optFinish = root.getElementById('opt-finish');
    this.optSix = root.getElementById('opt-six');
    this.optTheme = root.getElementById('opt-theme');
    this.optCpu = root.getElementById('opt-cpu');

    this.count = 2; // local-mode default

    for (const radio of this.modeEls) {
      radio.addEventListener('change', () => this.render());
    }
    for (const btn of this.playerCount.querySelectorAll('button[data-n]')) {
      btn.addEventListener('click', () => {
        this.count = Number(btn.dataset.n);
        this.render();
      });
    }
    this.render();
  }

  get mode() {
    const checked = this.modeEls.find((r) => r.checked);
    return checked ? checked.value : 'pvc';
  }

  /** How many human player rows to show for the current mode. */
  get humanCount() {
    if (this.mode === 'local') return this.count;
    return 1; // pvc and solo each show one human row
  }

  render() {
    // Count row only in local mode.
    this.countRow.classList.toggle('hidden', this.mode !== 'local');
    for (const btn of this.playerCount.querySelectorAll('button[data-n]')) {
      btn.classList.toggle('selected', Number(btn.dataset.n) === this.count);
    }

    this.playerRows.innerHTML = '';
    const humans = this.humanCount;

    for (let i = 0; i < humans; i++) {
      this.playerRows.appendChild(this.#makeRow(i, false));
    }
    if (this.mode === 'pvc') {
      this.playerRows.appendChild(this.#makeRow(humans, true)); // 🤖 CPU row
    }
  }

  #makeRow(index, isCpu) {
    const row = document.createElement('div');
    row.className = 'player-row' + (isCpu ? ' cpu-row' : '');

    const label = document.createElement('span');
    label.className = 'row-label';
    label.textContent = isCpu ? '🤖 CPU' : `Player ${index + 1}`;
    row.appendChild(label);

    if (!isCpu) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'name-input';
      input.maxLength = 14;
      input.placeholder = `Player ${index + 1}`;
      input.dataset.index = String(index);
      input.value = this.names[index] || '';
      input.addEventListener('input', () => { this.names[index] = input.value; });
      row.appendChild(input);
    } else {
      const name = document.createElement('span');
      name.className = 'cpu-name';
      name.textContent = 'Computer';
      row.appendChild(name);
    }

    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    // CPU gets the colour slot after all human rows.
    const colorIndex = isCpu ? this.humanCount : index;
    const chosen = this.colors[colorIndex] ?? COLORS[colorIndex % COLORS.length];
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (c === chosen ? ' selected' : '');
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => {
        this.#pickColor(colorIndex, c);
        this.render();
      });
      swatches.appendChild(b);
    }
    row.appendChild(swatches);
    return row;
  }

  /**
   * Pick a colour for a row; if another row already has it, SWAP the two,
   * so colours always stay different.
   */
  #pickColor(index, color) {
    const other = this.colors.indexOf(color);
    if (other !== -1 && other !== index) {
      const tmp = this.colors[index];
      this.colors[index] = color;
      this.colors[other] = tmp;
    } else {
      this.colors[index] = color;
    }
  }

  // Persisted typing state between renders.
  names = [];
  colors = [];

  /**
   * Read the whole configuration.
   * Returns { players, mode, rules, theme, cpuDelay } or { error }.
   */
  read() {
    const mode = this.mode;
    const humans = this.humanCount;

    const players = [];
    for (let i = 0; i < humans; i++) {
      const raw = (this.names[i] || '').trim();
      const name = raw || `Player ${i + 1}`;
      players.push({
        name,
        color: this.colors[i] ?? COLORS[i % COLORS.length],
        isComputer: false,
      });
    }
    if (mode === 'pvc') {
      players.push({
        name: 'Computer',
        color: this.colors[humans] ?? COLORS[humans % COLORS.length],
        isComputer: true,
      });
    }

    // Duplicate names (case-insensitive) are an error.
    const seen = new Set();
    for (const p of players) {
      const key = p.name.toLowerCase();
      if (seen.has(key)) {
        return { error: `Two players cannot both be called "${p.name}". Please use different names.` };
      }
      seen.add(key);
    }

    return {
      players,
      mode,
      rules: {
        finish: this.optFinish.value,
        sixRollsAgain: this.optSix.checked,
      },
      theme: this.optTheme.value,
      cpuDelay: Number(this.optCpu.value),
    };
  }
}

/**
 * The in-game side panel: turn card, player standings list and history log.
 */
export class SidePanel {
  constructor(root = document) {
    this.turnToken = root.getElementById('turn-token');
    this.turnName = root.getElementById('turn-name');
    this.turnCard = root.getElementById('turn-card');
    this.playersEl = root.getElementById('players');
    this.historyEl = root.getElementById('history');
    this.statusEl = root.getElementById('status');
  }

  /** Turn card: current player's token, name and tinted background. */
  showTurn(player) {
    this.turnToken.style.background = player.color;
    this.turnToken.textContent = player.isComputer ? '🤖' : (player.name || '?').charAt(0).toUpperCase();
    this.turnName.textContent = player.name;
    this.turnCard.style.background = `${player.color}22`;
    this.turnCard.style.borderColor = player.color;
  }

  /** Player standings list with counters; active + winner highlighted. */
  renderPlayers(game) {
    this.playersEl.innerHTML = '';
    for (const p of game.players) {
      const li = document.createElement('li');
      li.className = 'player-item'
        + (p.id === game.current && !game.winner ? ' active' : '')
        + (game.winner === p.id ? ' winner' : '');

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      li.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'p-name';
      name.textContent = p.name + (p.isComputer ? ' 🤖' : '');
      li.appendChild(name);

      const pos = document.createElement('span');
      pos.className = 'p-pos';
      pos.textContent = p.position === 0 ? 'Start' : `Square ${p.position}`;
      li.appendChild(pos);

      const stats = document.createElement('span');
      stats.className = 'p-stats';
      stats.textContent = `🎲${p.rolls} 🪜${p.ladders} 🐍${p.snakes}`;
      li.appendChild(stats);

      this.playersEl.appendChild(li);
    }
  }

  /** Newest-first history (up to 60 entries), coloured by event. */
  renderHistory(history) {
    this.historyEl.innerHTML = '';
    const entries = history.slice(-60).reverse();
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = `history-item ev-${e.event}`;
      li.textContent = e.text;
      this.historyEl.appendChild(li);
    }
  }

  /**
   * Status line with a kind: good | bad | info | warn.
   */
  setStatus(text, kind = 'info') {
    this.statusEl.textContent = text || '';
    this.statusEl.dataset.kind = kind;
    this.statusEl.className = `status status-${kind}`;
  }
}

/**
 * Game-over overlay contents and confirm dialog handling.
 */
export class GameOverView {
  constructor(root = document) {
    this.overlay = root.getElementById('gameover');
    this.winToken = root.getElementById('win-token');
    this.winTitle = root.getElementById('win-title');
    this.winSub = root.getElementById('win-sub');
    this.finalPositions = root.getElementById('final-positions');
  }

  show(game, mode) {
    const winner = game.players[game.winner];
    this.winToken.style.background = winner.color;
    this.winToken.textContent = winner.isComputer ? '🤖' : (winner.name || '?').charAt(0).toUpperCase();

    if (mode === 'solo') {
      this.winTitle.textContent = 'You made it!';
      this.winSub.textContent = `Reached square 100 in ${winner.rolls} rolls.`;
    } else {
      this.winTitle.textContent = `${winner.name} wins!`;
      this.winSub.textContent = `Reached square 100 in ${winner.rolls} rolls.`;
    }

    this.finalPositions.innerHTML = '';
    for (const p of game.standings()) {
      const li = document.createElement('li');
      li.className = 'final-item';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      li.appendChild(dot);
      const name = document.createElement('span');
      name.textContent = `${p.name}${p.id === game.winner ? ' 🏆' : ''}`;
      li.appendChild(name);
      const pos = document.createElement('span');
      pos.className = 'f-pos';
      pos.textContent = `Square ${p.position}`;
      li.appendChild(pos);
      this.finalPositions.appendChild(li);
    }
    this.overlay.classList.remove('hidden');
  }

  hide() {
    this.overlay.classList.add('hidden');
  }
}

/**
 * The confirm dialog (restart / exit). Callbacks are one-shot per open.
 */
export class ConfirmDialog {
  constructor(root = document) {
    this.overlay = root.getElementById('confirm');
    this.titleEl = root.getElementById('confirm-title');
    this.textEl = root.getElementById('confirm-text');
    this.yesBtn = root.getElementById('confirm-yes');
    this.noBtn = root.getElementById('confirm-no');
    this.onYes = null;

    this.yesBtn.addEventListener('click', () => {
      const cb = this.onYes; // capture BEFORE hide() clears it
      this.hide();
      if (cb) cb();
    });
    this.noBtn.addEventListener('click', () => this.hide());
  }

  open(title, text, onYes) {
    this.titleEl.textContent = title;
    this.textEl.textContent = text;
    this.onYes = onYes;
    this.overlay.classList.remove('hidden');
  }

  hide() {
    this.overlay.classList.add('hidden');
    this.onYes = null;
  }
}

/**
 * Saved data in localStorage (key snl-v1), every access in try/catch:
 * { name, muted, stats: { played, wins: {name: count} } }
 */
const STORAGE_KEY = 'snl-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { name: '', muted: false, stats: { played: 0, wins: {} } };
    const data = JSON.parse(raw);
    return {
      name: typeof data.name === 'string' ? data.name : '',
      muted: !!data.muted,
      stats: {
        played: Number(data.stats?.played) || 0,
        wins: (data.stats && typeof data.stats.wins === 'object' && data.stats.wins) || {},
      },
    };
  } catch {
    return { name: '', muted: false, stats: { played: 0, wins: {} } };
  }
}

export function saveSave(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Record a finished game: bump played, add a win for the winner's name. */
export function recordResult(save, winnerName, humanName) {
  save.stats.played += 1;
  if (winnerName) {
    save.stats.wins[winnerName] = (save.stats.wins[winnerName] || 0) + 1;
  }
  if (humanName) save.name = humanName;
  saveSave(save);
}

/** "Games played on this device: N · Most wins: X (n)" (or ''). */
export function menuStatsText(save) {
  let bestName = null;
  let bestCount = 0;
  for (const [name, count] of Object.entries(save.stats.wins)) {
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  }
  let text = `Games played on this device: ${save.stats.played}`;
  if (bestName) text += ` · Most wins: ${bestName} (${bestCount})`;
  return text;
}
