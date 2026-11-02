# Snakes & Ladders

A complete, playable Snakes & Ladders game in plain HTML5 + CSS + vanilla
JavaScript (ES modules). No frameworks, no npm dependencies, no build step,
no backend.

**Built with [Loop](https://loop.cursor.com)** — written step-by-step from a loop agent prompt (`prompt.md`), not a hand-coded from-scratch app.

## Live demo

**https://snakes-and-ladders-virid.vercel.app**

## How to run

The files must be served over HTTP (ES modules don't work from `file://`):

```bash
cd snakes-and-ladders
npm start        # runs: python3 -m http.server 8094
```

Then open **http://localhost:8094** in your browser.

Run the unit tests:

```bash
npm test         # node --test tests/*.test.js
```

## Controls

- **Roll button** (or **Space** / **Enter**) — roll the die on your turn.
- **↻ Restart** — restart the current game (asks for confirmation first).
- **✕ Menu** — exit to the menu (asks for confirmation if a game is running).
- **🔊 Mute** — toggle sound effects; the setting is remembered.
- **? / Esc** — open / close the How to Play dialog; Esc also closes confirm.
- On the setup screen: pick a mode, player count, names, colours and options.

## Modes

1. **Player vs Computer** — you against a computer opponent (speed selectable:
   slow 1500 ms / normal 900 ms / fast 400 ms between its turns).
2. **Local Multiplayer** — 2–4 human players sharing one device, taking turns.
3. **Solo** — practice alone, no opponent.

## Rules

- Everyone starts off the board (in the START strip below square 1).
- Roll the die and move one square per pip along the serpentine path.
- Land at the bottom of a ladder → climb to its top.
- Land on a snake's head → slide down to its tail.
- At most ONE ladder or snake applies per turn (no chains).
- **Exact finish (default):** you must land exactly on square 100; too high a
  roll and you stay put. Optional **bounce** rule: overshoot bounces you back
  from 100 by the excess.
- Optional rule: rolling a 6 gives another turn.

### The snakes and ladders

| Ladders |          | Snakes |          |
|---------|----------|--------|----------|
| 3 → 22  | 51 → 72  | 17 → 7   | 87 → 24  |
| 8 → 30  | 71 → 92  | 54 → 34  | 93 → 73  |
| 20 → 41 | 80 → 99  | 62 → 19  | 95 → 75  |
| 28 → 55 |          | 64 → 60  | 98 → 79  |
| 36 → 57 |          |          |          |

## Features

- Hand-drawn SVG board: pastel cells, wooden frame, gradient snakes with
  heads, eyes and forked tongues, ladders with rails and rungs.
- Three themes: Classic, Jungle, Candy.
- Animated dice tumble, hop-by-hop token movement, ladder-climb and
  snake-slide animations (along the actual snake body), landing rings.
- Web Audio sound effects (dice ticks, steps, ladder arpeggio, snake slide,
  overshoot "nope", win fanfare) — no audio files, works muted.
- Confetti on the game-over screen; respects `prefers-reduced-motion`.
- Side panel: turn card, live standings with roll/ladder/snake counters,
  colour-coded history log.
- Game-over screen with final positions; Play Again keeps the same config.
- Saved data in localStorage (`snl-v1`): remembered name, mute setting,
  games played and most wins shown on the menu.
- Responsive layout: side-by-side on wide screens, stacked on phones;
  no horizontal scrolling ever.

## File structure

```
snakes-and-ladders/
├── index.html          # screens, overlays, DOM skeleton
├── package.json        # start + test scripts
├── README.md
├── TEST_REPORT.md
├── src/
│   ├── styles.css      # all styling, themes, responsive rules
│   ├── main.js         # controller: wiring, turns, sessions, saved data
│   ├── board.js        # pure: board geometry + connections validation
│   ├── game.js         # pure: dice, move planning, turn state machine
│   ├── renderer.js     # board/tokens/dice rendering, tweens, confetti
│   ├── ui.js           # setup form, side panel, dialogs, localStorage
│   ├── audio.js        # Web Audio sound effects
│   └── selftest.js     # ?selftest browser self-test (not in normal UI)
└── tests/
    ├── board.test.js   # 16 tests
    └── game.test.js    # 19 tests
```

`src/board.js` and `src/game.js` are pure logic with no DOM access, so they
run under Node for unit testing.

## Self-test mode

Open **http://localhost:8094/?selftest** to run an automated 13-check
end-to-end test that drives the real interface by clicking the actual
buttons (menu → setup → game, forced rolls, ladder/snake/overshoot/win
scenarios, local multiplayer, restart/exit, solo). The verdict appears in
the page title (`SELFTEST 13/13 PASS`) and the full JSON results in a
hidden `<pre id="selftest-result">`. This mode never appears in the normal
interface.
