# VDO.Ninja Stream Deck Plugin

Build the plugin from source or look up its action behavior here. For installation and everyday use, see the [setup guide](../docs/getting-started.md).

The plugin uses one shared connection for all actions and profiles. Named connections and simultaneous control of separate pages are not available.

## Actions

Every action targets a VDO.Ninja page opened with `&api=KEY`.

| Action | Controller | What it does |
| --- | --- | --- |
| Connection Status | Key | Connection and status feedback for the configured API key. |
| Local Control | Key | Mic, camera, speaker, record, screen share, hand, keyframe, reload, and hangup on the local page. Mic also supports push-to-talk and push-to-mute. |
| Select Guest | Key | Selects a fixed guest position/stream, the next or previous guest, the first held guest, or clears the selection. |
| Guest Command | Key | Guest control targeted by guest position, stream ID, selected guest, or first held guest. |
| Guest Scene | Key | Arbitrary scene ID/name toggles, fixed-scene force on/off, and scene membership feedback. |
| Guests List | Key | Displays connected guests or the members of one scene, with automatic text sizing and rotation for long lists. |
| Mixer Control | Key | Layout selection, guest slot assignment, all-guest mute, and a guarded all-guest transfer. |
| PTZ Key | Key | Local zoom/pan/tilt/focus/exposure and guest zoom/pan/tilt/focus/autofocus. |
| PTZ Dial | Stream Deck + | Local or guest zoom/pan/tilt/focus, local exposure, and guest autofocus press actions. |
| Value Dial | Stream Deck + | Local volume, panning, bitrate, buffer delay, and guest volume. |
| Custom Command | Key | Any `{ action, target, value, value2 }` payload. |

Both dial actions support selected-target mode, inversion, optional acceleration, and rate-limited sends.

Beyond the actions themselves:

- The property inspector is setup-first: API key generation, VDO.Ninja link building, copy/open controls, local QR generation, and connection testing. Relay host/protocol, command transport, and polling controls stay under a collapsed advanced section so per-action settings sit immediately after setup.
- Guest target choices are populated from `getDetails` and `getGuestList`.
- Titles accept `{slot}`, `{label}`, `{streamID}`, `{command}`, `{scene}`, and `{state}` tokens where relevant.

## Build

Install Node.js 20+ for development, then run from the repository root:

```text
cd plugin
npm ci
npm run build
npx @elgato/cli@1.7.4 pack ninja.vdo.streamdeck.sdPlugin --no-update-check
```

The build output is `ninja.vdo.streamdeck.sdPlugin/`. Double-click the resulting `ninja.vdo.streamdeck.streamDeckPlugin` file to install. To replace an existing package file when rebuilding, add `-f` to the pack command.

For local development, link the bundle to Stream Deck:

```text
npx @elgato/cli@1.7.4 link ninja.vdo.streamdeck.sdPlugin
npx @elgato/cli@1.7.4 restart ninja.vdo.streamdeck
```

Icons are generated. Edit `scripts/icon-set.mjs` and run `npm run assets`; changes made directly under `imgs/` are overwritten by the next build.

## Use

1. Add the `Connection Status` action in Stream Deck.
2. In the property inspector, generate or enter a private API key.
3. Pick the page to control and enter its room or stream ID.
4. Open the ready-to-use URL and keep that VDO.Ninja page open.
5. Press `Test connection`.
6. Add `Local Control`, `Select Guest`, `Guest Command`, `Guest Scene`, `Guests List`, `Mixer Control`, `PTZ Key`, `PTZ Dial`, `Value Dial`, or `Custom Command` actions.

The manifest targets the Node 20 runtime bundled with Stream Deck 6.8+; newer local Node versions work for development.

### Guests List

Choose all guests (the default) or a scene ID/name. The list uses the existing API polling interval (5 seconds by default), plus live state updates. Directors, the local stream, and entries without a position in either `getDetails` or `getGuestList` are excluded.

The row template defaults to `{slot} {label}` and also supports `{streamID}`. In scene mode, the header defaults to `Scene {scene}` and also supports `{count}`. Both templates accept multiple lines and preserve multiline spacing. The font shrinks from 24px to 9px based on the number of display lines; long individual lines are truncated. Lists that still exceed the key height rotate every 3 seconds. Rotation stops when the key disappears.

## No-hardware checks

```bash
node node_modules/vitest/vitest.mjs run --maxWorkers=2
npm run check
npm run build
npm run test:runtime
npx @elgato/cli@1.7.4 validate ninja.vdo.streamdeck.sdPlugin --no-update-check
npx @elgato/cli@1.7.4 pack ninja.vdo.streamdeck.sdPlugin --dry-run -f --no-update-check
```

`pack` refuses to run when a `.streamDeckPlugin` file from an earlier build is already there, so `-f` keeps the dry run repeatable.

These verify command payloads, TypeScript, generated plugin layout, manifest rules, package contents, and startup from an isolated copy with no development `node_modules` available. Tests cover every exposed command choice, property-inspector buttons and registry alignment, manifest image wiring, custom value parsing, transport behavior, and state normalization. Interactive button/dial testing still requires the Stream Deck app with either hardware or Stream Deck Mobile.

## Live checks

```bash
npm run build
npm run test:live
```

These opt-in tests use real VDO.Ninja pages in headless Chrome with synthetic media, a fresh API key, and simulated Stream Deck host events against an isolated copy of the built plugin. They need the workspace's `../../tests/playwright` install and internet access. `alpha-live-smoke.mjs` covers local mic, camera, and speaker control on the alpha page. `director-live-smoke.mjs` runs a director room with two guests and checks guest mic and camera, Select Guest, scenes, the Guests List, the guest volume dial, director chat, mixer layout, custom commands, missing-guest errors, and confirmed hang-up against the director's own state. Set `VDO_BASE` (for example `https://vdo.ninja/alpha/`) to choose the deployment; the default is `https://vdo.ninja/`.

The narrated demo comes from `scripts/record-demo.mjs`, which uses the same setup and draws a virtual deck from the plugin's output. The voice-over script is `scripts/demo-narration.json`. `scripts/demo-voice.py` turns it into speech with [Kokoro](https://github.com/hexgrad/kokoro), an open-source TTS that runs locally. Scenes are timed to the voice clips, and the captions come from the same text.

```bash
npm run build
python scripts/demo-voice.py <voice-dir>
VOICE_DIR=<voice-dir> FFMPEG=<path-to-ffmpeg> node scripts/record-demo.mjs
```

This regenerates `docs/assets/demo.mp4` (with voice), `demo.gif` (silent, captions included), and `demo-poster.jpg`. None of these files are part of the installable plugin.

## Icons

All artwork is generated from one spec by `npm run assets`, so the vector and raster forms cannot drift apart:

- `scripts/icon-set.mjs` holds the palette and the shape list for every icon.
- `scripts/generate-icons.mjs` renders each spec to `imgs/actions/*.svg` (action list), `imgs/*.svg` (vector source), and anti-aliased `imgs/*.png` plus native `@2x` files (keys, encoders, marketplace tile).

Edit the spec, not the output. Keypad state images keep their glyph in a corner badge so the two-line title the plugin draws stays legible. `src/manifest-assets.test.ts` fails the build if the manifest references an image that does not exist, if a raster image is the wrong size, or if a generated image is never referenced.

Local and guest commands now select their own microphone, camera, record, speaker, share, transfer, activation, and other glyphs from the command registry. PTZ keys distinguish zoom, pan, tilt, focus, and exposure; mixer keys distinguish layout, slot, mute, and transfer. The symbol sits above the title alongside a separate state badge. Commands without an observed on/off state use neutral artwork. Stream Deck continues to honor user-supplied custom images.

Inspector edits refresh key titles and artwork immediately, including while disconnected. Test connection requires a fresh page response. Momentary mic commands preserve press/release order and release when the key disappears or its behavior changes.

See the [illustrative icon preview](../docs/assets/command-icons-preview.png). It demonstrates title spacing and artwork, rather than reproducing live state from Stream Deck.

## Runtime alignment

### VDO.Ninja state

- `getDetails` callbacks without a target are treated as full snapshots; `details` updates are treated as partial updates and merged.
- Join/leave/position refreshes and remote mute/video state updates are tracked as they arrive.
- `getDetails` is also polled through the documented HTTP API route, using the configured interval as a backstop for DOM-derived state.
- `getGuestList` is treated as a director UI ordering helper, not as the universal stream list.

### Targeting

- Selected guest stores a stream ID. Selecting by guest position resolves the current G number to its stream ID when the select action is pressed, so later guest-order changes do not silently retarget selected-guest actions.

### Scenes

- Custom scene names/IDs are supported through the dedicated `Guest Scene` action and raw/custom commands.
- Fixed-scene force on/off uses the legacy scene aliases. Named-scene force uses observed scene state plus the legacy `addScene` toggle, and alerts when that state is unavailable.

### Mixer

- `layout=0` is auto, `layout=1` is the first configured layout, and `setslot` uses user-facing destination slot numbers where `1` is mixer slot 1 and `0` unsets the assignment. Layout object fields such as `slot: 0` keep VDO.Ninja's existing zero-based layout-item convention.
- Slot assignment requires VDO.Ninja slot controls. Open the director with `&slotmode=1` or use `/mixer?director=ROOM&api=KEY`; current VDO.Ninja reports the local page's `slotmode` flag in `getDetails`, and the inspector shows a setup hint when it is off.
- All-guest mute fans out the long-standing targeted `mic` command, excluding directors and screen-share pseudo-guests. This keeps the action usable with pre-v30.1 pages instead of depending on the newer `muteAllGuests` wrapper.
- All-guest transfer fans out existing `forward` commands one guest at a time and requires a second press by default.

### PTZ

- PTZ Key follows current VDO.Ninja paths: local `zoom`/`pan`/`tilt`/`focus`/`exposure`, guest `ptzZoom`/`ptzPan`/`ptzTilt`/`ptzFocus`/`ptzAutofocus`. Guest exposure and local autofocus are intentionally blocked.
- PTZ Dial uses the same command paths, sends relative deltas only, accumulates fast dial ticks, and rate-limits sends to the configured interval.
- Local PTZ requires the controlled camera page to load with `&ptz` and approve browser PTZ permission. Guest PTZ requires the guest publisher to load with `&ptz`; director/mixer pages can then send guest `ptz*` commands. Current VDO.Ninja reports the local page's `ptz` flag in `getDetails`.

### Values and momentary controls

- Value Dial sends absolute values for `volume`, `panning`, `bitrate`, `setBufferDelay`, and guest `volume`. Buffer delay uses `value2: "*"` for all current inbound streams and omits `value2` for default/future streams.
- Local push-to-talk sends `mic=true` on key down and `mic=false` on key up; push-to-mute sends the inverse. The action uses sequence guards so stale async completions do not repaint the key after a newer release.

### Transport

- The HTTP API route is enabled by default for request/response commands because the public relay owns HTTP callback IDs. Commands that require `value2` use raw WebSocket payloads so secondary values are preserved.
- WebSocket-only settings send commands without a callback ID, avoiding waits for callbacks that the reference relay intentionally consumes.
- HTTP route responses `failed` and `timeout` are treated as errors.
- The plugin tracks WebSocket messages per second, buffered amount, and skipped no-wait realtime commands as an overload guard. No-wait realtime commands are skipped when send rate or backlog is high. This only affects incremental controls such as relative PTZ/value nudges; awaited discrete commands such as scene, mute, transfer, layout, and slot assignment are never skipped.

### Version requirements

- `Activate Guest` requires VDO.Ninja v30.2+. Every other current-only API dependency has a legacy-safe plugin fallback.

See [`../docs/runtime-comparison-audit.md`](../docs/runtime-comparison-audit.md) for the current comparison against VDO.Ninja's local signaling and callback paths.
