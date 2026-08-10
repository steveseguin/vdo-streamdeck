# VDO.Ninja Stream Deck Plugin

This is the native Stream Deck plugin implementation workspace. For everyday setup, start with the [plain-language guide](../docs/getting-started.md). For screenshots, the supported-action matrix, and install notes, see the [repo README](../README.md).

Current positioning: early native prototype/MVP. It is not yet a full replacement for the Bitfocus Companion VDO.Ninja module because presets, named connections, and broader dynamic feedback are still in progress.

## Actions

Every action targets a VDO.Ninja page opened with `&api=KEY`.

| Action | Controller | What it does |
| --- | --- | --- |
| Connection Status | Key | Connection and status feedback for the configured API key. |
| Local Control | Key | Mic, camera, speaker, record, screen share, hand, keyframe, reload, and hangup on the local page. Mic also supports push-to-talk and push-to-mute. |
| Select Guest | Key | Selects a fixed slot/stream, the next or previous guest, the first held guest, or clears the selection. |
| Guest Command | Key | Guest control targeted by slot, stream ID, selected guest, or first held guest. |
| Guest Scene | Key | Arbitrary scene ID/name toggles, fixed-scene force on/off, and scene membership feedback. |
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

```text
npm install
npm run build
```

The build output is `ninja.vdo.streamdeck.sdPlugin/`.

## Use

1. Add the `Connection Status` action in Stream Deck.
2. In the property inspector, generate or enter a private API key.
3. Pick the page to control and enter its room or stream ID.
4. Open the ready-to-use URL and keep that VDO.Ninja page open.
5. Press `Test connection`.
6. Add `Local Control`, `Select Guest`, `Guest Command`, `Guest Scene`, `Mixer Control`, `PTZ Key`, `PTZ Dial`, `Value Dial`, or `Custom Command` actions.

The manifest targets the Node 20 runtime bundled with Stream Deck 6.8+; newer local Node versions work for development.

## No-hardware checks

```bash
npm test
npm run check
npm run build
npm run test:runtime
npx @elgato/cli@1.7.4 validate ninja.vdo.streamdeck.sdPlugin --no-update-check
npx @elgato/cli@1.7.4 pack ninja.vdo.streamdeck.sdPlugin --dry-run -f --no-update-check
```

`pack` refuses to run when a `.streamDeckPlugin` file from an earlier build is already there, so `-f` keeps the dry run repeatable.

These verify command payloads, TypeScript, generated plugin layout, manifest rules, package contents, and startup from an isolated copy with no development `node_modules` available. Tests cover every exposed command choice, property-inspector buttons and registry alignment, manifest image wiring, custom value parsing, transport behavior, and state normalization. Interactive button/dial testing still requires the Stream Deck app with either hardware or Stream Deck Mobile.

## Icons

All artwork is generated from one spec by `npm run assets`, so the vector and raster forms cannot drift apart:

- `scripts/icon-set.mjs` holds the palette and the shape list for every icon.
- `scripts/generate-icons.mjs` renders each spec to `imgs/actions/*.svg` (action list), `imgs/*.svg` (vector source), and anti-aliased `imgs/*.png` plus native `@2x` files (keys, encoders, marketplace tile).

Edit the spec, not the output. Keypad state images keep their glyph in a corner badge so the two-line title the plugin draws stays legible. `src/manifest-assets.test.ts` fails the build if the manifest references an image that does not exist, if a raster image is the wrong size, or if a generated image is never referenced.

## Runtime alignment

### VDO.Ninja state

- `getDetails` callbacks without a target are treated as full snapshots; `details` updates are treated as partial updates and merged.
- Join/leave/position refreshes and remote mute/video state updates are tracked as they arrive.
- `getDetails` is also polled through the documented HTTP API route, using the configured interval as a backstop for DOM-derived state.
- `getGuestList` is treated as a director UI ordering helper, not as the universal stream list.

### Targeting

- Selected guest stores a stream ID. Selecting by slot resolves the current slot to its stream ID when the select action is pressed, so later slot changes do not silently retarget selected-guest actions.

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
