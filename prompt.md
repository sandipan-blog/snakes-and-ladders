# SNAKES & LADDERS: step-by-step prompt for the loop agent

## How to run this with loop (for the human)
Copy this file into `~/loop/gaming_hackathon/`, start loop there (so `.loop/APPEND_SYSTEM.md` is used), pick your model with `/model`, then send these messages ONE AT A TIME. Wait for each one to finish before sending the next.

1. `Read snakes-and-ladders/prompt.md. Do not plan or analyse. Do STEP 1 only.`
2. `Do STEP 2 only. Write the files now.`
3. `Do STEP 3 only. Write the files now.`
4. `Do STEP 4 only. Write the files now.`
5. `Do STEP 5 only. Write the files now.`
6. `Do STEP 6 only. Write the files now.`
7. `Do STEP 7 only. Write the files now.`
8. `Do STEP 8 only. Write the files now.`
9. `Do STEP 9 only. Write the files now.`
10. `Do STEP 10 only. Write the files now.`
11. `Do STEP 11 only. Write the files now.`
12. `Do STEP 12 only.`

If it stalls or thinks too long: press esc and send `Write the file now, don't plan.`
If a step's check fails: send `The STEP N check failed. Fix it and rerun the check.`

A finished, tested version of this game exists at `/Users/sandipanray/game/games/snakes-and-ladders/` (12/12 rule tests, 29/29 browser checks). The agent may READ it when stuck, but must never edit it, import from it or copy it wholesale.

---

## Rules for the agent (read once, follow every step)
- Do ONLY the step you are asked for, then run that step's CHECK, then stop and report the check output. Do not plan later steps.
- ALL files go inside `snakes-and-ladders/` (create it in STEP 1). Never touch anything outside `snakes-and-ladders/`.
- Write real, working code to disk with the write tool. No placeholders, no TODO stubs, no fake values.
- Never edit an earlier step's tests to make them pass; fix the code. Never delete a working feature.
- Do not claim something was tested unless you ran the command and saw the output.
- Every visible button must do what it says. Do not show debug controls in the normal interface.

## Tech (fixed, do not debate)
- Plain HTML5 + CSS + vanilla JavaScript ES modules. No frameworks, no npm dependencies, no build step, no backend, no CDN.
- `package.json`: `{"name":"snakes-and-ladders","private":true,"type":"module","scripts":{"start":"python3 -m http.server 8080","test":"node --test tests/*.test.js"}}`. Use the `tests/*.test.js` glob: on Node 24, `node --test tests/` fails.
- Tests use `node:test` + `node:assert/strict`.
- **Pure-logic files must NOT touch the DOM** (so Node can test them): `src/board.js`, `src/game.js`.
- Rendering uses DOM + one inline SVG for snakes and ladders. Board units: the board is 100 × 100 units, so one cell is 10 units (the SVG uses `viewBox="0 0 100 100"`, and token positions are in % of the board width).
- Animations use CSS transitions or a promise-based `requestAnimationFrame` tween that stops when finished. Never start a permanent animation loop, and never add a second one on restart.

## Final file layout (inside snakes-and-ladders/)
```
index.html  package.json  README.md  TEST_REPORT.md
src/ styles.css main.js board.js game.js renderer.js ui.js audio.js selftest.js
tests/ board.test.js game.test.js
```

---

## STEP 1: Skeleton with all screens
Create `snakes-and-ladders/package.json` (exactly as above), `snakes-and-ladders/index.html`, `snakes-and-ladders/src/styles.css`, `snakes-and-ladders/src/main.js`.
- index.html: viewport meta, `src/styles.css`, `<script type="module" src="src/main.js">`. Four screens as `<section class="screen" id="screen-menu|screen-setup|screen-game">`, plus overlays `#gameover`, `#confirm` and `#howto` (each `.overlay.hidden`).
  - Menu: a big title "Snakes & Ladders", a one-line description, a `#btn-play` button, a How to Play button (`data-open="howto"`), and an empty `#menu-stats`.
  - Setup: three radio buttons `name="mode"` with values `pvc` (checked), `local` and `solo`; a `#count-row` with buttons `data-n="2|3|4"` inside `#player-count`; an empty `#player-rows`; a `<details>` with `#opt-finish` (options exact/bounce), the `#opt-six` checkbox, `#opt-theme` (classic/jungle/candy) and `#opt-cpu` (1500/900/400 ms, 900 selected); `#btn-setup-back`, `#btn-start` and `#setup-error`.
  - Game: a top bar with `#mode-label`, a `?` button (`data-open="howto"`), `#btn-mute`, `#btn-restart` and `#btn-exit`. A `.layout` grid holding `.board-area > #board-wrap` (containing `.board > .cells` and `svg.art viewBox="0 0 100 100"`, then `.start-pad`, then `.tokens`) and an `aside.panel` (containing `#turn-card` with `#turn-token`/`#turn-name`, `#dice`, `#btn-roll`, `#rule-hint`, `#status aria-live="polite"`, `ol#players` and `ol#history`).
  - Game over: `canvas#confetti`, `#win-token`, `#win-title`, `#win-sub`, `ol#final-positions`, `#btn-again` and `#btn-win-menu`. Confirm: `#confirm-title`, `#confirm-text`, `#confirm-yes` and `#confirm-no`. How-to: the rules text (STEP 9 lists its content) and a `data-close` button.
- main.js: for now, only switch screens (Play → setup, Back → menu, Start → game) by toggling the `.active` class.
- styles.css: `.screen { display:none }`, `.screen.active { display:flex }`, `.hidden { display:none !important }`, and a warm gradient page background.
CHECK: `cd snakes-and-ladders && (python3 -m http.server 8080 >/dev/null 2>&1 &) && sleep 1 && curl -s localhost:8080/ | grep -c 'screen-game' && curl -s -o /dev/null -w "%{http_code}\n" localhost:8080/src/main.js; pkill -f "http.server 8080"` → prints `1` and `200`.

## STEP 2: Board data and geometry (pure) + tests
Create `src/board.js` and `tests/board.test.js`.
- `export const BOARD_SIZE = 100, COLS = 10;`
- `export const DEFAULT_LADDERS = { 3: 22, 8: 30, 20: 41, 28: 55, 36: 57, 51: 72, 71: 92, 80: 99 };`
- `export const DEFAULT_SNAKES = { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79 };`
- `cellPosition(n)` → `{ row, col, x, y }`, where row 0 is the TOP screen row and row 9 the bottom. Serpentine numbering: `fromBottom = floor((n-1)/10)`, `i = (n-1)%10`, `col = fromBottom even ? i : 9-i`, `row = 9 - fromBottom`, `x = col+0.5`, `y = row+0.5`. Throws a RangeError for anything that isn't an integer from 1 to 100. (Square 1 is bottom-left, 11 is directly above 10, and 100 is top-left, at the end of the last right-to-left row.)
- `squareAt(row, col)`: the inverse of cellPosition.
- `validateConnections(ladders, snakes)` → array of error strings (empty means valid). It rejects: non-integers; a start outside 2–99; an end outside 1–100; a ladder that doesn't go up; a snake that doesn't go down; one square starting two connections; and an end square that starts another connection (chains are not allowed, so at most one connection per landing).
- `createBoard({ ladders, snakes } = defaults)` → `{ ladders, snakes, connections: [{type,from,to}], connectionAt(n) → {type:'ladder'|'snake', from, to} | null }`. Throws if validation fails.
Tests: 100 unique (row,col) cells; `squareAt(cellPosition(n)) === n` for all n; 1 → (9,0), 10 → (9,9), 11 → (8,9), 20 → (8,0), 100 → (0,0); every n and n+1 are grid neighbours; 0 and 101 throw; the defaults validate with no errors; each kind of bad data listed above produces an error; connectionAt returns the right type, from and to for every default, and null for 50.
CHECK: `cd snakes-and-ladders && npm test` → all pass.

## STEP 3: Rules, dice and turn state machine (pure) + tests
Create `src/game.js` and `tests/game.test.js`.
- `STATES = { READY:'ready', ROLLING:'rolling', MOVING:'moving', RESOLVING:'resolving', OVER:'over' }`.
- `DEFAULT_RULES = { finish: 'exact', sixRollsAgain: false }`. `finish: 'bounce'` is the optional alternative.
- `rollDie(rng = Math.random)` → `Math.min(6, Math.max(1, Math.floor(rng()*6)+1))`.
- `planMove(from, roll, board, rules)` → `{ from, roll, path, landed, connection, final, moved, overshoot, bounced, won }`. It changes nothing.
  - `path` is every square visited, in order, not including the start square. Position 0 means off the board.
  - Exact rule and `from+roll > 100`: `overshoot: true`, `moved: false`, `path: []`, `final = from`, `connection: null` (no snake or ladder for a move that didn't happen).
  - Bounce rule: walk up to 100, then back by the excess.
  - At most ONE connection is applied, on `landed`. `won = final === 100`.
- `describePlan(name, plan)`: a history sentence such as "Ana rolled 3: start → 3, climbed a ladder to 22!", "…, bitten by a snake down to 24.", or "… needs exactly 3 to finish: stays on 97."
- `class Game({ players:[{name,color,isComputer}], board, rules, rng, mode })` (1 to 4 players). Each player gets `{ id, position: 0, rolls, ladders, snakes }`. The game has `current`, `state`, `winner`, `history` (entries `{turn, player, name, color, roll, from, landed, final, event:'move'|'ladder'|'snake'|'overshoot'|'bounce', text}`), and `forcedRolls` (a test queue).
  - `canRoll()` is true only when the state is READY and there is no winner.
  - `roll()` returns null if `canRoll()` is false. Otherwise it takes the next forcedRoll or `rollDie`, sets state ROLLING, stores `this.plan`, and returns `{ roll, plan }`.
  - `startMove()`: ROLLING → MOVING. Throws in any other state.
  - `startResolve()`: MOVING → RESOLVING. Throws if there is no connection.
  - `completeTurn()`: only from MOVING (no connection) or RESOLVING. It applies `final`, updates the counters, pushes the history entry, and then either sets the winner and state OVER, or advances `current` (unless `sixRollsAgain` is on and the roll was 6) and sets state READY. Returns `{ entry, won, extraTurn }`.
  - `playTurn()` runs all of the above synchronously (for tests). `standings()` returns the winner first, then players by position.
Tests: 60,000 rolls are all integers from 1 to 6, each face between 9,000 and 11,000 times; `rollDie(()=>0) === 1` and `rollDie(()=>0.999999) === 6`; `planMove(0,5).path` is `[1,2,3,4,5]`; 25+3 → 55 (ladder); 84+3 → 24 (snake); 0+3 → 22; 97+4 overshoots and stays on 97 with no connection; 97+3 wins; 96+2 → 79 (snake on 98); bounce 97+5 gives path `[98,99,100,99,98]` and final 79; a second `roll()` during ROLLING or MOVING returns null; `completeTurn` before resolving a ladder throws; turn order with 3 players is 0,1,2,0; sixRollsAgain gives an extra turn only when enabled; after a win, `roll()` returns null; 200 seeded random 2-player games (human vs computer) all end with the winner on exactly 100.
CHECK: `cd snakes-and-ladders && npm test` → all pass.

## STEP 4: Draw the board, snakes and ladders
Create `src/renderer.js` and update `src/main.js` and `src/styles.css`.
- `squareCenter(n, slot)`: centre of square n in board units (`cellPosition(n).x*10`, `.y*10`). For n = 0 (start), return `{ x: 8 + slot*9, y: 105.5 }`, which is inside the START strip below the board.
- `class BoardRenderer(wrapEl)` with `build(board)`. It creates 100 `.cell` divs in screen order (row by row using `squareAt`). Each cell gets `data-square`, a class `c${(row*3+col)%5}` (5 alternating colours), a number in the corner, 🏆 on 100, "START" on 1, and a `title` such as "28: ladder to 55".
  - Ladders: an SVG group `.ladder[data-from][data-to]` with two rails (offset ±1.9 units perpendicular to the line between the two square centres; draw a darker wide line under a lighter line) and a rung every ~3.3 units.
  - Snakes: an SVG group `.snake[data-from][data-to]`. The body is a wavy centreline from head (the `from` square) to tail (the `to` square): 64 samples, with sideways offset `amp*sin(t*π*waves)`. It is drawn as a FILLED POLYGON tapering from width 1.9 at the head to about 0.3 at the tail, filled with a light-to-dark linearGradient (8 snake colour pairs). A dashed light stroke along the centreline adds spots. The head is an ellipse rotated to the body direction, with two eyes and a red forked tongue. Store each snake's sampled centreline in `snakePaths` (keyed by head square) for the slide animation.
  - Draw ladders first, then snakes on top. The SVG has `pointer-events: none`.
- CSS: `.board` has `aspect-ratio: 1`, rounded corners, a white inner frame and a wooden outer frame (box-shadow rings). `.cells` is a 10×10 grid. Board width is `min(100%, calc((100vh - 90px)/1.09))`. `.start-pad` is a dashed strip under the board (padding-bottom 9% on the wrap). Pastel cell colours: `#ffd6e0 #fff1b8 #c9f2d9 #cfe6ff #e6dcff`. Square 100 is gold and square 1 green.
- main.js: build the board once at startup.
CHECK: `node --check` on every src file; `npm test` passes; serve the game and run `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=/tmp/snl4.png --window-size=1280,800 --virtual-time-budget=3000 "http://localhost:8080/"` (temporarily show the game screen if needed), then confirm the file exists. Note: with `--virtual-time-budget`, Chrome fast-forwards timers, which keeps headless runs short.

## STEP 5: Tokens, dice and one playable mode (Player vs Computer)
Update `src/renderer.js` and `src/main.js`.
- Tokens: `createTokens(players)` creates `.token` divs (a coloured circle with the initial, or 🤖 for the computer) in `.tokens`, positioned with `left/top` in % and `transform: translate(-50%,-50%)`. `layoutAll()` places every token. Tokens sharing a square use offsets of ±1.8 units (layouts for 2, 3 and 4 tokens) so ALL stay visible and inside the cell. Tokens at 0 sit in the start strip.
- `walk(id, path, onStep, isCancelled)`: hop one square at a time (about 230 ms per step, CSS transition on left/top, plus a small `.hop` keyframe). `isCancelled()` stops it.
- `DiceView(el)`: a 3×3 pip grid, with `show(n)` and `async roll(result, onTick)` (a tumble animation that shows random faces for about 750 ms, then shows `result`). **The result is decided BEFORE the animation, so the face shown is always the real move.** Set `data-value` on the dice element.
- Controller in main.js: one `game` object, a `session` counter and a `busy` flag. The Roll button calls `humanRoll()`: if busy, not `canRoll()`, the game is over, or it's the computer's turn, refuse with feedback (STEP 7). Otherwise `playTurn()`:
  `game.roll()` → `await dice.roll()` → `game.startMove()` → `await walk(path)` → if there is a connection, `game.startResolve()` (the animation comes in STEP 9; for now just jump) → `game.completeTurn()` → refresh the screen → if the next player is the computer, start a timer for `cpuDelay` ms, then `playTurn()`.
  Every `await` is followed by `if (sid !== session) return;` so restarting or leaving cancels any turn in progress. The Roll button is disabled while busy and during the computer's turn.
- Start Game currently always starts PvC: "Player 1" (red) against "Computer" (blue).
CHECK: `node --check` every file; `npm test` passes; serve the game and confirm main.js and renderer.js return 200.

## STEP 6: Setup screen: modes, names, colours, options
Create `src/ui.js`; update `src/main.js`.
- `COLORS = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#ff7ab6']`.
- `SetupForm`: watches the mode radios. In `local` mode it shows `#count-row` (2–4 players) and that many player rows. `pvc` shows 1 human row plus a "🤖 CPU" row named "Computer". `solo` shows 1 row. Each row has a name input (maxlength 14) and 6 colour swatches. Picking a colour another player already has SWAPS the two colours, so colours always stay different.
- `read()` returns `{ players, mode, rules:{finish, sixRollsAgain}, theme, cpuDelay }`, or `{ error }` if two names are the same (case-insensitive). Empty names fall back to "Player N".
- Start Game creates `new Game(...)` from that config. Solo mode has no automatic opponent. Local multiplayer rotates human turns. Themes set `data-theme` on `.board`; add jungle and candy cell palettes in the CSS.
- `#rule-hint` explains the finishing rule in use (for example "Exact finish: you must land exactly on 100. Too high a roll and you stay put.").
CHECK: `node --check` every file; `npm test` passes.

## STEP 7: Side panel, status, history and refused rolls
Update `src/ui.js`, `src/main.js` and `src/styles.css`.
- `#turn-card` shows the current player's token, name and colour (tinted background).
- `#players` lists every player: colour dot, name, "Start" or "Square N", and 🎲rolls 🪜ladders 🐍snakes. The active player is highlighted and the winner is gold.
- `#history` shows the newest entry first (up to 60), coloured by event: ladder green, snake red, overshoot yellow.
- `setStatus(text, kind)` with kinds `good`, `bad`, `info` and `warn`. Messages: "X is rolling…", "X rolled 4! Moving…", "X climbed a ladder to 55!", "Oh no! The snake sent X to 24!", "X rolled 4 but needs exactly 3 to finish. Staying on 97.", "Computer is thinking…".
- Refused roll: shake the button, play a low beep, and show the warn status "Please wait: the current move is still in progress." (or "It's the computer's turn. Please wait.").
- Keyboard: Space or Enter rolls when the game screen is showing, nothing is being typed, and no overlay is open. Ignore `e.repeat`. Escape closes the how-to and confirm dialogs.
- Highlight the square a token lands on, and show an expanding ring there.
CHECK: `node --check` every file; `npm test` passes.

## STEP 8: Game over, restart, exit, saved data
Update `src/ui.js`, `src/main.js` and `src/styles.css`.
- When someone wins: a short pause, then show `#gameover` with a bouncing 🏆, the winner's token, "<name> wins!" ("You made it!" in solo, with "Reached square 100 in N rolls."), the final positions, and Play Again (same config) / Back to Menu buttons.
- `#btn-restart` and `#btn-exit` (when a game is in progress) ask first through `#confirm`. Restart, Play Again and Exit all bump `session`, clear the computer timer, reset `busy`, close the overlays and stop the confetti.
- localStorage key `snl-v1` (every access in try/catch): `{ name, muted, stats: { played, wins: {name: count} } }`. Remember the human's name in pvc and solo modes. The menu shows "Games played on this device: N · Most wins: X (n)".
CHECK: `node --check` every file; `npm test` passes.

## STEP 9: Animations, sound, confetti, how-to
Create `src/audio.js`; update `src/renderer.js`, `src/ui.js` and `src/main.js`.
- `tween(ms, onUpdate, isCancelled)`: a promise-based rAF tween that ends when done or cancelled. Schedule frames through ONE helper, `nextFrame(cb)`, which uses `requestAnimationFrame` normally but `setTimeout(() => cb(performance.now()), 16)` when `window.__SNL_NO_RAF` is true. Reason (verified): in headless Chrome with `--dump-dom --virtual-time-budget`, requestAnimationFrame NEVER fires, so a rAF-only tween would hang the STEP 11 self-test. setTimeout and layout do work there.
- `travel(id, conn, isCancelled)`: a **ladder** moves the token in a straight line from the bottom to the top (about 1000 ms, ease-in-out, slight sideways bob). A **snake** moves the token along `snakePaths` from head to tail (about 1300 ms, with a wiggle rotation). Briefly brighten the snake or ladder (`.pulse`) when it triggers. Only after `travel` finishes: `completeTurn()`.
- `Sound` (Web Audio only, no files): created and resumed on the first pointerdown or keydown. Sounds for dice ticks, landing, steps, a rising arpeggio for ladders, a falling slide for snakes, an overshoot "nope", a refused-roll beep, and a win fanfare. `#btn-mute` toggles 🔊/🔇 and is saved. Every call is in try/catch, so the game works with no audio.
- Confetti: a canvas animation for about 6 s on the game-over screen, using a single rAF that stops itself. `stopConfetti()` cancels it.
- Reduced motion: if `prefers-reduced-motion: reduce`, use much shorter step and travel times, skip confetti, and add a CSS media rule that shortens animations.
- How-to dialog content: everyone starts off the board; move one square per pip; ladders up, snakes down, one per turn; exact finish (with the bounce option mentioned); a short description of each of the three modes.
CHECK: `node --check` every file; `npm test` passes.

## STEP 10: Responsive layout and visual polish
Update `src/styles.css` (and the HTML if needed).
- Wide screens: board and panel side by side (`grid-template-columns: minmax(0,1fr) minmax(260px,340px)`). At `max-width: 900px` or `max-aspect-ratio: 1/1`: stack them, let the page scroll vertically, and cap the board at 640 px. At ≤480 px: smaller top bar and dice. Never scroll horizontally.
- Rounded white panels with soft shadows, a pink/red primary button with a 3D bottom edge, hover lift and press-down feedback, visible focus rings, `touch-action: manipulation` on the board, and cell numbers sized with container query units so they stay readable.
- Menu: a large playful logo ("Snakes" green, "&" red, "Ladders" orange, slightly rotated, with text shadows) and 🐍 🪜 🎲 above the card.
CHECK: `node --check` every file; `npm test` passes; headless Chrome screenshots at `--window-size=1280,800` and `--window-size=375,740` both created.

## STEP 11: Self-test mode run in real Chrome
Create `src/selftest.js`. Load it from main.js ONLY when the URL has `?selftest` (use a dynamic `import()`). It never appears in the normal interface.
- Before anything else runs, it sets `window.__SNL_NO_RAF = true` (see STEP 9) and skips confetti. Use `setTimeout`-based waits only (never wait on rAF), and poll for conditions with a time limit, for example `waitFor(() => !busy && game.state === 'ready', 5000)`.
- It drives the REAL interface by clicking the actual buttons with `element.click()`, using `game.forcedRolls` and fast animation timings, and runs these scenarios in order:
  1. Menu → Setup → Start (pvc).
  2. 100 cells in serpentine order on screen, and both ends of all 16 snakes and ladders inside the correct squares (compare SVG points with each cell's `getBoundingClientRect`).
  3. Three synchronous clicks on Roll produce exactly ONE roll, and the dice `data-value` equals that roll.
  4. The computer rolls automatically after the human.
  5. Position 0 + roll 3 → 22 via the ladder, and the state passed through `resolving`.
  6. Position 84 + 3 → 24 via the snake.
  7. Position 97 + 4 → stays on 97.
  8. Position 97 + 3 → winner, game-over overlay visible, and a further roll is refused.
  9. Play Again resets everyone to 0.
  10. Local mode with 3 players goes in the order 0,1,2,0, and two tokens on the same square are both inside that cell and at least 8 px apart.
  11. Restart (confirm → yes) and Exit to Menu work.
  12. Solo mode has no automatic opponent.
- It collects `{ name, pass, detail }` for each check, catches any error as a failure, then writes `SELFTEST n/m PASS` (or `FAIL`) to `document.title` and the full JSON to a hidden `<pre id="selftest-result">`.
CHECK: serve the game, then run `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --virtual-time-budget=60000 --window-size=1280,800 --dump-dom "http://localhost:8080/?selftest" 2>/dev/null | grep -o 'SELFTEST[^<]*'` → prints `SELFTEST m/m PASS`. If it prints nothing, the self-test never finished: most likely something still waits on requestAnimationFrame, or a waitFor never returned. Write the title at the start (`SELFTEST running`) and after each scenario, so you can see where it stopped. If any check fails, fix the GAME code (not the test) and rerun. Also confirm `npm test` passes.

## STEP 12: Verify, document, report honestly
1. `cd snakes-and-ladders && npm test` → all pass. `for f in src/*.js; do node --check "$f" || echo "FAIL $f"; done` → no FAIL.
2. Serve the game; curl `/` and every src file → all 200.
3. Run the STEP 11 self-test again → `SELFTEST m/m PASS`.
4. Headless screenshots of the menu (1280×800) and the menu at a phone size (375×740).
5. Write `README.md`: what the game is; how to run it (`cd snakes-and-ladders && npm start`, then open http://localhost:8080; files must be served over HTTP); controls (Roll button, Space/Enter, Restart, Menu, mute, Esc); the three modes; the rules (exact finish by default, bounce and six-again options); the full list of snakes and ladders; features; file structure; the `?selftest` mode.
6. Write `TEST_REPORT.md`: every command you ran with its real result, each self-test check, bugs found and fixed, and what was NOT tested (real phones and tablets, Safari/Firefox, what the sound actually sounds like, the reduced-motion setting, saved data across a real browser restart).
7. Final message: the project directory, the files created, the run command, the modes and features, the test results, and the known limitations. Do not call anything tested that you did not run.
