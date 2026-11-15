# Bath Time Radio

SubHunt's original four-lane chip score uses VANILLAJS's integer audio2d renderer,
vendored from commit `ac69cde61dcc5feb40ff138e69830c80b903a8e6`. Source, Apache-2.0
licence, exact Git blob and SHA-256 are in `vendor/vanillajs/`. The classic-script
adapter removes ES exports and adds a namespace only, preserving direct `file://`
play. Tests verify this mechanical transformation against the original source.

The Creator Hub, Creator Guide and Soundtrack Lab supplied the score/render/export
workflow. These are new authored melodies and arrangements; they do not reproduce
ETQ, use E8 coordinates, or import music from another game.

| Sector | Theme | BPM | Loop | Instruments |
|---|---|---:|---:|---|
| 1 | Porcelain Patrol | 120 | 16 s | Triangle bass / lead, saw harmony, kick / seeded noise |
| 2 | Bubble Bank Boogie | 150 | 12.8 s | Triangle bass / lead, saw harmony, kick / seeded noise |
| 3 | The Last Plug | 180 | 10⅔ s | Triangle bass, square lead, saw harmony, kick / seeded noise |

Each loop has four phrases of sixteen eighth notes. `js/music.js` builds each
phrase as an audio2d score: integer sample positions, integer Hz, integer gain,
and seeded noise, at 48,000 Hz mono PCM16. Each phrase fits within audio2d's
eight-second/128-event/four-lane limits. The WAV exporter joins four rendered
phrases; it does not increase the renderer's admission limits.

## Clock and controls

One 60 Hz simulation tick equals exactly 800 audio samples. `state.sectorTick`
starts at zero on sector entry, and selects a phrase and sample offset. A paused
simulation retains that position. The music does not read wall-clock time,
`Math.random`, the gameplay PRNG, or audio-device state to choose notes.

The Web Audio adapter presents the already-rendered samples. It schedules the
next phrase half a second ahead. Pause, menu, controller setup, focus loss,
mute, sector transition and terminal outcomes cancel active and queued music.
Resume starts at the simulation's current sample offset. If device presentation
drifts more than 120 ms from the tick clock, the adapter cancels and reanchors;
it never advances the simulation to catch audio up. Audio buffers are bounded to
twelve cached phrases (three sectors × four phrases).

SOUND is the master switch and starts muted. MUSIC separately enables the score
while keeping weapon effects available. Browser playback still requires an
accepted user gesture. DOWNLOAD SECTOR WAV exports the displayed sector's full
four-phrase loop, including while muted or paused.

The **score and PCM bytes** are deterministic. Browser/device output can resample
and varies with device latency. Existing oscillator weapon effects are separate
from this PCM contract. No claim is made that speakers produce bit-identical
output or that the floating-point combat engine is formally verified.

## Frozen WAV receipts

`tests/music.cjs` checks headers, chunked render equality, non-clipping signal,
source provenance, tick mapping and cancellation. `tests/browser_upgrades.py`
hashes actual Chromium downloads against these same values.

| WAV | SHA-256 |
|---|---|
| Sector 1 | `c764fe7f498ac40bb6dbb2856cbb906f021817736db4798bb7ecb2cad6834a3a` |
| Sector 2 | `0f001c0ebe874adc3960d41867c177db62f1816eb41f5ff4753d70b7a90d080d` |
| Sector 3 | `c5437b0634a46f90d3d4b4cd7e85a7951796310621b146df59e408b3f3c2c042` |

Edit `THEMES` and `score()` for new music. Changes to synthesis or composition
require reviewing and regenerating these receipts; matching hashes only verify
the pinned composition, not musical quality. Browser downloads and screenshots
are written to `build/` and retained by the existing CI evidence upload.
