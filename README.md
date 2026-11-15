<div align="center">

<img src="assets/icon.svg" width="100" alt="SubHunt submarine emblem">

# SUBHUNT
### THE BATHTUB INCIDENT

**Big trouble. Small ocean.**

[![Verify bathtub operations](https://github.com/QSOLKCB/SubHunt/actions/workflows/checks.yml/badge.svg)](https://github.com/QSOLKCB/SubHunt/actions/workflows/checks.yml)
[![Pages](https://github.com/QSOLKCB/SubHunt/actions/workflows/pages.yml/badge.svg)](https://github.com/QSOLKCB/SubHunt/actions/workflows/pages.yml)
![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-f96c42)
![Dependencies: zero](https://img.shields.io/badge/runtime_dependencies-zero-173d40)

[**PLAY SUBHUNT ↗**](https://qsolkcb.github.io/SubHunt/)

</div>

The bath toys have mutinied. A tiny patrol boat and a fleet of miniature submarines are fighting for control of the porcelain. Choose a side, thread your shots past rubber ducks, and survive three increasingly chaotic missions.

## Two sides of the tub

- **Patrol boat:** steer across the surface and drop depth charges onto submerged contacts. Subs fade out between attacks; sonar exposes them.
- **Submarine:** steer and dive beneath the fleet. Fire bubble torpedoes upward through the gaps between the ducks, and dodge falling charges.
- **Sonar:** reveals every contact for four seconds and clears hostile weapons inside its expanding ring. Recharges in seven seconds.
- **Campaign:** Rubber Duck Reconnaissance → Trouble in the Bubble Bank → Operation: Pull the Plug. The last sector adds armoured enemies and a drain current. Clear a sector to repair one hull point. Finish all three before losing your five hull points or running out of sector time.
- **Arcade atmosphere:** a hand-drawn procedural bathtub, sponge reef, toy star, tap, sonar scope, bubble trails, quacks and synthesised weapon sounds. No downloaded art, sound files, trackers or remote services.

## Controls

| Action | Keyboard | Standard gamepad | Touch |
|---|---|---|---|
| Steer / dive | WASD or arrows | D-pad / left stick | Direction buttons |
| Fire / drop | Space | A / button 0; X / button 2 | FIRE |
| Sonar | E | B / button 1; Y / button 3 | PING |
| Pause / resume | Escape or P | Start / button 9 | PAUSE / RESUME |

In the vessel menu, use gamepad left/right to choose a role and A to launch. Sound starts muted; enable it with SOUND OFF. Browser focus loss automatically pauses play. Controller layouts vary, especially unlabelled USB SNES adapters; the baseline uses axes 0/1, D-pad buttons 12–15, and button indices shown above. Physical controller compatibility must be checked on the actual device.

## Run locally

Open **index.html** in a modern browser. There is no installation or build step.

For service-worker caching and offline refresh, serve the folder on localhost:

```sh
uv run --no-project python -m http.server 8001
```

Open http://localhost:8001. Once the first page load and asset cache finish, it can reload offline. File mode works without a service worker. Only your best score is stored locally; storage failure does not prevent play. The game runs without storage, accounts or network calls. The source link leaves the game only when clicked.

## Verify

```sh
node --test tests/sim.cjs
uvx --from playwright==1.56.0 playwright install chromium
uv run --no-project --with playwright==1.56.0 python tests/browser.py
```

Node is used only to execute JavaScript regression tests. Playwright is an isolated development dependency managed by uv; the browser game ships no dependencies. Set CHROMIUM_PATH to use an existing Chromium executable. Browser screenshots are written to build/ and uploaded as CI evidence.

The simulation suite covers deterministic replay, collision and armour, fire rates, sonar interception, duck shielding, damage immunity, complete three-sector progression for both roles, terminal outcomes, boundaries, and a seeded endurance sweep. Browser checks cover actual inputs, pause, both roles, synthetic gamepad input, responsive layouts, offline refresh, and direct file launch. Synthetic controller checks do not establish physical USB compatibility.

## Deployment and layout

Every main push runs verification. A successful push run triggers Pages deployment of that **exact verified commit**. Set the repository's Pages source to **GitHub Actions**. Pull requests run checks and produce screenshots without deploying.

| Path | Responsibility |
|---|---|
| js/sim.js | Fixed 60 Hz simulation, seeded PRNG, collision, missions, scoring |
| js/render.js | Canvas artwork, particles and sonar instrument |
| js/app.js | Browser input, fixed-step clock, UI, Web Audio and local best score |
| sw.js | Scoped offline asset cache |
| tests/ | Simulation and browser regressions |

The simulation is deterministic for identical seeds and tick-indexed inputs within the same JavaScript arithmetic environment. This is an arcade implementation, with no formal-verification or cross-engine bitwise-determinism claim. Canvas play is visual; menus use semantic buttons, keyboard focus indicators, and status announcements.

Apache-2.0 · QSOL–IMC
