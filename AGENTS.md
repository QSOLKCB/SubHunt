# SubHunt engineering

- Keep the shipped game dependency-free, offline-capable, and usable by opening index.html directly. Do not add a bundler, package manager requirement, remote fonts, analytics, or a runtime CDN.
- Keep simulation in js/sim.js separate from rendering and browser input. Advance combat only at the fixed 60 Hz step; use seeded randomness for gameplay. Rendering is decorative and has no authority over collisions or scoring.
- Test both playable roles. Preserve keyboard, touch, and standard-layout gamepad support, release inputs on focus loss, and freeze simulation during pause and after terminal outcomes.
- Run node --test tests/*.cjs and the syntax checks. Browser verification uses uv run --no-project --with playwright==1.56.0 python tests/browser.py; install its Chromium with uvx --from playwright==1.56.0 playwright install chromium. Node and Playwright are development tools only.
- Capture desktop/mobile evidence for visual changes. State separately what ran, what was simulated, and what needs physical hardware. Do not claim real USB controller verification from a synthetic gamepad test.
- Increment sw.js CACHE when runtime files change in a later release. Cache only this game's named assets; never remove another project's caches on the shared GitHub Pages origin.
- Every successful main push is eligible for Pages deployment, including documentation-only changes. Deployment must use the exact successfully verified main commit, never a pull-request checkout.
- Use review branches and pull requests. Leave merging and releases to the owner unless explicitly authorised.

- Preserve per-device controller calibration, including raw axes/button D-pads. A cancelled calibration must not replace a saved profile. Test a swapped face-button layout and reconnect pause through the browser before claiming controller improvements.
