# Living toys upgrade — verification

Base: SubHunt `4c5caa5db105cd1fbd08dd50bb05c1e8302bfee1`.
Audio donor: VANILLAJS `ac69cde61dcc5feb40ff138e69830c80b903a8e6`.

Executed locally with Node v24.22.1, uv 0.13.6, Playwright 1.56.0 and
Chromium 141.0.7390.37. GitHub CI retains its existing Node 22 test target.

- JavaScript syntax checks: simulation, controller, renderer, app, music, vendored
  audio adapter and service worker.
- `node --test tests/*.cjs`: 43 tests, including original controller/combat/cache
  regressions, all mode/difficulty/vessel replay combinations, physical power-up
  collisions, exact boost expiry, toy ownership, sector wins/losses and audio.
- `uv run --no-project --with playwright==1.56.0 python tests/browser.py`:
  both vessels, keyboard/touch, controller calibration and handoff, native menu
  Space activation, toolbar Space firing, mode/difficulty persistence, separate
  records, score reports, reduced motion, music pause/mute/resume, blur,
  responsive layouts, actual WAV downloads, offline refresh and `file://` play.
- WAV SHA-256 receipts match in Node and Chromium for all three sector themes;
  the pinned upstream Git blob matches the retained source exactly.

The original browser pass caught a 320 px instrument stack exceeding the control
spacing check. Compact instrument spacing fixed that failure. Visual review also
caught the new race counter overlapping surface toys on mobile; it now sits below
the canvas. The full browser suite passed after both corrections.

## Simulation experiment: can each combination win?

`tests/pond-balance.cjs` runs an input-only pilot over seeds 1–20. The pilot reads
target positions, leads shots, holds fire, uses sonar and moves through normal
60 Hz input steps. It never changes state, teleports, grants immunity or removes
enemies. These results demonstrate reachable wins, not human playtest balance.

| Vessel | Cadet | Captain | Admiral |
|---|---:|---:|---:|
| Boat | 19/20 | 19/20 | 12/20 |
| Submarine | 20/20 | 20/20 | 15/20 |

The unattended-rival test separately verifies that both opposing fleet types
physically hit toys, reach six points and end the race.

## Captured browser evidence

The existing workflow uploads `build/` even when browser verification fails.
Additional captures include `pond-menu-desktop.png`, `pond-powers-desktop.png`,
`pond-rival-wins.png`, `pond-menu-{320,390,768}.png`,
`pond-sub-{320,390,768}.png`, and `pond-result-320.png`. Browser-rendered
`sector-{1,2,3}.wav` downloads are included for listening and byte verification.

Controller checks use synthetic raw/standard gamepads. Touch checks use browser
input and viewport emulation. Physical USB adapters, physical phones, speaker
output, human difficulty assessment and non-Chromium audio playback were not
verified. Device output can resample; only the score and generated PCM bytes have
the deterministic music contract described in `SOUNDTRACK.md`.
