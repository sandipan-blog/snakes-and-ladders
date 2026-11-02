# Test Report — Snakes & Ladders (snakes-and-ladders)

All commands below were actually run during STEP 12 verification
(plus the per-step checks along the way). Results are real outputs.

## Commands and results

### 1. Unit tests

```
$ cd snakes-and-ladders && npm test
ℹ tests 35
ℹ pass 35
ℹ fail 0
```

- `tests/board.test.js` — 16 tests: 100 unique cells, cellPosition/squareAt
  roundtrip for all 100 squares, corner positions (1→(9,0), 10→(9,9),
  11→(8,9), 20→(8,0), 100→(0,0)), centre coordinates, n/n+1 grid neighbours,
  RangeError for 0/101/non-integers, default connections validate, every
  kind of bad connection data rejected, connectionAt correct for all 16
  defaults and null at 50, createBoard throws on invalid data.
- `tests/game.test.js` — 19 tests: 60,000 rolls all 1–6 with each face
  between 9,000 and 11,000; rng bounds; planMove paths for ladder/snake/
  from-start/overshoot/win/bounce ([98,99,100,99,98] → final 79);
  describePlan sentences; state machine guards; turn order 0,1,2,0;
  sixRollsAgain; post-win roll() null; 200 seeded random 2-player games all
  ending with the winner exactly on 100; standings; history entries.

### 2. Syntax check

```
$ for f in src/*.js; do node --check "$f" || echo "FAIL $f"; done
(no output — no failures)
```

Checked: main.js, board.js, game.js, renderer.js, ui.js, audio.js,
selftest.js.

### 3. Serving (HTTP status codes)

```
$ python3 -m http.server 8094
$ curl -o /dev/null -w "%{http_code}" localhost:8094<path>
/                    200
/src/main.js         200
/src/board.js        200
/src/game.js         200
/src/renderer.js     200
/src/ui.js           200
/src/audio.js        200
/src/selftest.js     200
/src/styles.css      200
```

### 4. Browser self-test (headless Chrome, ?selftest)

```
$ chrome --headless=new --virtual-time-budget=60000 --window-size=1280,800 \
    --dump-dom "http://localhost:8094/?selftest" | grep -o 'SELFTEST[^<]*'
SELFTEST 13/13 PASS
```

Individual checks (from the JSON in `#selftest-result`):

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 1 | menu→setup→start (pvc) | PASS | |
| 2a | 100 cells in serpentine order | PASS | |
| 2b | all 16 snake/ladder ends inside correct squares | PASS | |
| 3 | three sync clicks → one roll; dice data-value matches | PASS | history=1 data-value=4 |
| 4 | computer rolls automatically after human | PASS | history=2 |
| 5 | 0+3 → 22 via ladder; passed through resolving | PASS | final=22 event=ladder resolving=true |
| 6 | 84+3 → 24 via snake | PASS | final=24 event=snake |
| 7 | 97+4 stays on 97 (overshoot) | PASS | final=97 event=overshoot |
| 8 | 97+3 wins; overlay shown; further roll refused | PASS | winner=0 history=9 |
| 9 | Play Again resets everyone to 0 | PASS | positions=0,0 history=0 |
| 10 | local 3-player order 0,1,2,0; shared tokens ok | PASS | order=0,1,2,0 dist=20.6px both inside cell |
| 11 | restart (confirm→yes) and exit to menu | PASS | |
| 12 | solo has no automatic opponent | PASS | players=1 history=1 |

### 5. Screenshots (headless Chrome)

```
$ chrome --headless=new --screenshot=/tmp/snl4-menu.png --window-size=1280,800 ...
-rw-r--r--  220487 bytes  /tmp/snl4-menu.png   (menu, desktop)
$ chrome --headless=new --screenshot=/tmp/snl4-menu-phone.png --window-size=375,740 ...
-rw-r--r--   59111 bytes  /tmp/snl4-menu-phone.png  (menu, phone size)
```

Both files created successfully. Additional screenshots taken during earlier
steps: `/tmp/snl4.png` (STEP 4), `/tmp/snl4-wide.png`, `/tmp/snl4-phone.png`
(STEP 10).

## Bugs found and fixed during development

All of these were found by the STEP 11 self-test (or its debugging) and
fixed in the GAME code, never in the tests:

1. **`ui.js` `#makeRow` referenced `humans` out of scope** — a ReferenceError
   that broke the whole module load. Fixed by using `this.humanCount`.
2. **`main.js` used `save` before initialization (TDZ error)** — the
   remembered-name prefill ran before `loadSave()`. Reordered declarations.
3. **`renderer.js` `layoutAll(positions)` crashed when called with no
   argument** (`positions.length` of undefined). Defaulted to `[]`.
4. **`ConfirmDialog` yes-handler swallowed its own callback** — it called
   `hide()` (which clears `onYes`) *before* reading the callback, so
   Restart/Exit confirmations never executed. Capture the callback first.
5. **Token vertical positions were wrong by a factor of 1.09** — `.tokens`
   spans the wrap (board + 9% START strip = 1.09× board height), so
   board-unit y values must be divided by 1.09. Affected `#placeToken`,
   the ladder travel and the snake travel paths.

## What was NOT tested

- Real phones and tablets (only emulated phone viewport sizes in headless
  Chrome: 375×740).
- Safari and Firefox (all browser testing was headless Google Chrome on
  macOS).
- What the sound effects actually sound like (Web Audio runs headless with
  no output device; the code paths were exercised but not audibly heard).
- The `prefers-reduced-motion` behaviour (not forced in headless runs).
- Saved data across a real browser restart (localStorage was exercised
  within single page loads only).
- Real multi-touch or drag interactions (the game is click/keyboard only,
  so none exist by design).
