// Snakes & Ladders — entry point. Screens, board build and the game controller.

import { createBoard } from './board.js';
import { Game } from './game.js';
import { BoardRenderer, DiceView, startConfetti, stopConfetti } from './renderer.js';
import { SetupForm, SidePanel, GameOverView, ConfirmDialog, loadSave, saveSave, recordResult, menuStatsText } from './ui.js';
import { sound, initAudioUnlock } from './audio.js';

const screens = {
  menu: document.getElementById('screen-menu'),
  setup: document.getElementById('screen-setup'),
  game: document.getElementById('screen-game'),
};

function showScreen(name) {
  for (const key of Object.keys(screens)) {
    screens[key].classList.toggle('active', key === name);
  }
}

// Overlay open/close (data-open / data-close)
for (const btn of document.querySelectorAll('[data-open]')) {
  btn.addEventListener('click', () => {
    const el = document.getElementById(btn.dataset.open);
    if (el) el.classList.remove('hidden');
  });
}
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => {
    const ov = btn.closest('.overlay');
    if (ov) ov.classList.add('hidden');
  });
}

// Build the board once at startup.
const board = createBoard();
const renderer = new BoardRenderer(document.getElementById('board-wrap'));
renderer.build(board);

const dice = new DiceView(document.getElementById('dice'));

// Reduced motion: much shorter step and travel times, no confetti.
const reduceMotion =
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduceMotion) {
  renderer.stepMs = 40;
  renderer.travelMs = { ladder: 150, snake: 200 };
  dice.duration = 150;
}
initAudioUnlock();

// ---------- Controller state ----------
let game = null;
let session = 0; // bumped on restart/exit to cancel in-flight turns
let busy = false;
let cpuTimer = null;
let cpuDelay = 900;
let config = null; // last read setup config (for restart / play again)

const setupForm = new SetupForm(document);
const panel = new SidePanel(document);
const gameOverView = new GameOverView(document);
const confirmDialog = new ConfirmDialog(document);

// ---------- Saved data ----------
const save = loadSave();
// Prefill the remembered human name (pvc/solo).
if (save.name) setupForm.names[0] = save.name;
refreshMenuStats();

function refreshMenuStats() {
  document.getElementById('menu-stats').textContent = menuStatsText(save);
}

/** The human player's name for the current mode, if any. */
function humanName() {
  if (!config) return '';
  if (config.mode === 'local') return '';
  const human = config.players.find((p) => !p.isComputer);
  return human ? human.name : '';
}

const els = {
  roll: document.getElementById('btn-roll'),
  modeLabel: document.getElementById('mode-label'),
  turnToken: document.getElementById('turn-token'),
  turnName: document.getElementById('turn-name'),
  status: document.getElementById('status'),
  ruleHint: document.getElementById('rule-hint'),
  setupError: document.getElementById('setup-error'),
  boardEl: document.querySelector('.board'),
};

const MODE_LABELS = {
  pvc: 'Player vs Computer',
  local: 'Local Multiplayer',
  solo: 'Solo',
};

function setStatus(text, kind = 'info') {
  panel.setStatus(text, kind);
}

function clearCpuTimer() {
  if (cpuTimer !== null) {
    clearTimeout(cpuTimer);
    cpuTimer = null;
  }
}

/** Start a game from a setup config. */
function startGame(cfg) {
  session++;
  clearCpuTimer();
  config = cfg;
  cpuDelay = cfg.cpuDelay;
  game = new Game({
    players: cfg.players,
    board,
    rules: cfg.rules,
    mode: cfg.mode,
  });
  renderer.createTokens(game.players);
  dice.show(1);
  busy = false;
  els.modeLabel.textContent = MODE_LABELS[cfg.mode] || 'Game';
  els.boardEl.dataset.theme = cfg.theme || 'classic';
  els.ruleHint.textContent = cfg.rules.finish === 'bounce'
    ? 'Bounce finish: too high a roll bounces you back from 100.'
    : 'Exact finish: you must land exactly on 100. Too high a roll and you stay put.';
  gameOverView.hide();
  confirmDialog.hide();
  refresh();
}

/** Redraw everything that depends on game state. */
function refresh() {
  if (!game) return;
  panel.showTurn(game.currentPlayer());
  panel.renderPlayers(game);
  panel.renderHistory(game.history);
  updateRollButton();
}

/** Highlight the square a token lands on with an expanding ring. */
function highlightSquare(n) {
  const cell = renderer.wrap.querySelector(`.cell[data-square="${n}"]`);
  if (!cell) return;
  const ring = document.createElement('span');
  ring.className = 'land-ring';
  cell.appendChild(ring);
  setTimeout(() => ring.remove(), 700);
}

function updateRollButton() {
  const computerTurn = game && game.currentPlayer().isComputer;
  els.roll.disabled = busy || computerTurn || !game || !game.canRoll();
}

/**
 * Run one full turn: roll → dice animation → walk → resolve → complete.
 * `sid` guards every await against restarts and exits.
 */
async function playTurn(sid) {
  const player = game.currentPlayer();
  busy = true;
  updateRollButton();

  const rolled = game.roll(); // result decided BEFORE the animation
  if (!rolled) {
    busy = false;
    updateRollButton();
    return;
  }
  setStatus(`${player.name} is rolling…`, 'info');

  await dice.roll(rolled.roll, () => sound.diceTick());
  if (sid !== session) return;

  game.startMove();
  setStatus(`${player.name} rolled ${rolled.roll}! Moving…`, 'info');

  if (rolled.plan.moved && rolled.plan.path.length > 0) {
    await renderer.walk(player.id, rolled.plan.path, () => sound.step(), () => sid !== session);
    if (sid !== session) return;
  }

  if (rolled.plan.connection) {
    game.startResolve();
    setStatus(
      rolled.plan.connection.type === 'ladder'
        ? `${player.name} climbed a ladder to ${rolled.plan.final}!`
        : `Oh no! The snake sent ${player.name} to ${rolled.plan.final}!`,
      rolled.plan.connection.type === 'ladder' ? 'good' : 'bad',
    );
    if (rolled.plan.connection.type === 'ladder') sound.ladder();
    else sound.snake();
    await renderer.travel(player.id, rolled.plan.connection, () => sid !== session);
    if (sid !== session) return;
  } else if (rolled.plan.overshoot) {
    setStatus(
      `${player.name} rolled ${rolled.roll} but needs exactly ${100 - rolled.plan.from} to finish. Staying on ${rolled.plan.from}.`,
      'warn',
    );
    sound.nope();
  } else {
    sound.land();
  }

  const landedSquare = rolled.plan.landed;
  const result = game.completeTurn();
  if (landedSquare) highlightSquare(landedSquare);

  if (result.won) {
    setStatus(`${player.name} wins!`, 'good');
    sound.win();
    recordResult(save, player.name, humanName());
    refreshMenuStats();
    // A short pause, then the game-over overlay with confetti.
    setTimeout(() => {
      if (sid !== session) return;
      gameOverView.show(game, config.mode);
      if (!reduceMotion) startConfetti(document.getElementById('confetti'));
    }, 900);
  } else if (rolled.plan.connection) {
    if (rolled.plan.connection.type === 'ladder') {
      setStatus(`${player.name} climbed a ladder to ${rolled.plan.final}!`, 'good');
    } else {
      setStatus(`Oh no! The snake sent ${player.name} to ${rolled.plan.final}!`, 'bad');
    }
  } else if (!rolled.plan.overshoot) {
    setStatus('', 'info');
  }

  busy = false;
  refresh();

  // If the next player is the computer, schedule its turn.
  if (!result.won && game.currentPlayer().isComputer) {
    setStatus('Computer is thinking…', 'info');
    cpuTimer = setTimeout(() => {
      cpuTimer = null;
      if (sid === session && !game.winner) playTurn(sid);
    }, cpuDelay);
  }
}

/** Human presses Roll. */
function humanRoll() {
  if (!game || busy || game.winner !== null) return refuse('Please wait: the current move is still in progress.');
  if (game.currentPlayer().isComputer) return refuse("It's the computer's turn. Please wait.");
  if (!game.canRoll()) return refuse('Please wait: the current move is still in progress.');
  const sid = session;
  playTurn(sid);
}

function refuse(message) {
  els.roll.classList.remove('shake');
  void els.roll.offsetWidth;
  els.roll.classList.add('shake');
  sound.refuse();
  setStatus(message, 'warn');
}

// ---------- Keyboard ----------
const gameScreen = document.getElementById('screen-game');

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  // Escape closes the how-to and confirm dialogs.
  if (e.key === 'Escape') {
    for (const id of ['howto', 'confirm']) {
      const ov = document.getElementById(id);
      if (ov && !ov.classList.contains('hidden')) {
        ov.classList.add('hidden');
        return;
      }
    }
    return;
  }

  if (e.key !== ' ' && e.key !== 'Enter') return;

  // Only when the game screen is showing…
  if (!gameScreen.classList.contains('active')) return;
  // …nothing is being typed…
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  // …and no overlay is open.
  for (const ov of document.querySelectorAll('.overlay')) {
    if (!ov.classList.contains('hidden')) return;
  }

  e.preventDefault();
  humanRoll();
});

// ---------- Wiring ----------
document.getElementById('btn-play').addEventListener('click', () => showScreen('setup'));
document.getElementById('btn-setup-back').addEventListener('click', () => showScreen('menu'));
document.getElementById('btn-start').addEventListener('click', () => {
  const cfg = setupForm.read();
  if (cfg.error) {
    els.setupError.textContent = cfg.error;
    els.setupError.classList.remove('hidden');
    return;
  }
  els.setupError.classList.add('hidden');
  showScreen('game');
  startGame(cfg);
});
els.roll.addEventListener('click', humanRoll);

// ---------- Restart / Exit / Play Again / Menu ----------

/** Cancel everything in flight and close overlays. */
function abortSession() {
  session++;
  clearCpuTimer();
  busy = false;
  stopConfetti();
  gameOverView.hide();
  confirmDialog.hide();
}

document.getElementById('btn-restart').addEventListener('click', () => {
  if (!game || game.winner !== null) { // finished game: just restart
    abortSession();
    startGame(config);
    return;
  }
  confirmDialog.open('Restart game?', 'The current game will be lost. Restart anyway?', () => {
    abortSession();
    startGame(config);
  });
});

document.getElementById('btn-exit').addEventListener('click', () => {
  const inProgress = game && game.winner === null;
  const doExit = () => {
    abortSession();
    showScreen('menu');
    refreshMenuStats();
  };
  if (inProgress) {
    confirmDialog.open('Exit to menu?', 'The current game will be lost. Exit anyway?', doExit);
  } else {
    doExit();
  }
});

document.getElementById('btn-again').addEventListener('click', () => {
  abortSession();
  startGame(config);
});

document.getElementById('btn-win-menu').addEventListener('click', () => {
  abortSession();
  showScreen('menu');
  refreshMenuStats();
});

// ---------- Mute ----------
const muteBtn = document.getElementById('btn-mute');

function applyMute() {
  muteBtn.textContent = save.muted ? '🔇' : '🔊';
  sound.setMuted(save.muted);
}
muteBtn.addEventListener('click', () => {
  save.muted = !save.muted;
  saveSave(save);
  applyMute();
});
applyMute();

// Remember the human's name in pvc/solo modes.
document.getElementById('btn-start').addEventListener('click', () => {
  const cfg = setupForm.read();
  if (cfg.error) return;
  const human = cfg.players.find((p) => !p.isComputer);
  if (human && cfg.mode !== 'local') {
    save.name = human.name;
    saveSave(save);
  }
});

// ---------- Expose controller internals (used by the ?selftest mode) ----------
const stateLog = [];
function recordState() {
  if (game && stateLog[stateLog.length - 1] !== game.state) {
    stateLog.push(game.state);
  }
}

// Record every state transition by wrapping the state-changing methods.
{
  const proto = Game.prototype;
  for (const m of ['roll', 'startMove', 'startResolve', 'completeTurn']) {
    const orig = proto[m];
    proto[m] = function (...args) {
      const r = orig.apply(this, args);
      if (this === game) recordState();
      return r;
    };
  }
}

const origRefresh = refresh;
refresh = function () {
  origRefresh();
  recordState();
};
recordState();

Object.assign(window, {
  __SNL: {
    get game() { return game; },
    get busy() { return busy; },
    get session() { return session; },
    get renderer() { return renderer; },
    get dice() { return dice; },
    get stateLog() { return stateLog; },
    get config() { return config; },
    readSetup: () => setupForm.read(),
  },
  __SNL_squareCenter: null,
});

// Self-test mode: loaded ONLY when the URL has ?selftest.
if (new URLSearchParams(location.search).has('selftest')) {
  window.__SNL_NO_RAF = true;
  document.body.classList.add('selftest');
  // Fast animations for the self-test.
  renderer.stepMs = 30;
  renderer.travelMs = { ladder: 80, snake: 100 };
  dice.duration = 60;
  import('./selftest.js').catch((e) => console.error('selftest failed to load', e));
}

export { board, renderer, dice, showScreen };
