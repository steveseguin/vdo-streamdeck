# VDO.Ninja Stream Deck Plugin

This is the native Stream Deck plugin implementation workspace.

Current positioning: early native prototype/MVP. It is not yet a full replacement for the Bitfocus Companion VDO.Ninja module because presets, named connections, and broader dynamic feedback are still in progress.

Current slice:

- Connects to a VDO.Ninja page opened with `&api=KEY`.
- Provides connection/status feedback.
- Provides a setup-first property inspector with API key generation, VDO.Ninja link building, copy/open controls, local QR generation, and connection testing.
- Provides local user controls for mic, camera, speaker, record, screen share, hand, keyframe, reload, and hangup.
- Provides local mic momentary modes for push-to-talk and push-to-mute using explicit key-down/key-up API states.
- Provides a first-pass select guest action for fixed slot/stream, next/previous guest, first-held guest, and clear selection.
- Provides a first-pass guest command action for slot, stream ID, selected guest, or first-held-guest targeting.
- Provides a first-pass guest scene action with selected guest support, arbitrary scene ID/name toggles, fixed scene force on/off, and scene membership feedback.
- Provides a first-pass mixer control action for layout selection, guest slot assignment, all-guest mute, and guarded all-guest transfer.
- Provides a first-pass PTZ key action for local zoom/pan/tilt/focus/exposure and guest zoom/pan/tilt/focus/autofocus.
- Provides a first-pass Stream Deck + PTZ dial action for local or guest zoom/pan/tilt/focus, local exposure, guest autofocus press actions, selected target support, inversion, optional acceleration, and rate-limited sends.
- Provides a first-pass Stream Deck + Value Dial action for local volume, panning, bitrate, buffer delay, and guest volume with clamps, reset, inversion, optional acceleration, and rate-limited sends.
- Populates guest target choices from `getDetails` and `getGuestList`.
- Supports guest title templates with `{slot}`, `{label}`, `{streamID}`, `{command}`, `{scene}`, and `{state}` tokens where relevant.
- Provides a custom command action for arbitrary `{ action, target, value, value2 }` payloads.
- Provides property inspector sections for API host, polling, fallback, and per-action settings.
- Tracks full `getDetails` callbacks, partial `details` updates, join/leave/position refreshes, and remote mute/video state updates.
- Polls `getDetails` through the documented HTTP API route using the configured interval as a backstop for DOM-derived VDO.Ninja state.
- Tracks plugin WebSocket messages per second, buffered amount, and skipped no-wait realtime commands as a PTZ/value-dial overload guard.
- Includes focused tests for command payloads, custom value parsing, and state normalization.

Build:

```text
npm install
npm run build
```

The build output is `ninja.vdo.streamdeck.sdPlugin/`.

Use:

1. Add the `Connection Status` action in Stream Deck.
2. In the property inspector, generate or enter a private API key.
3. Pick a VDO.Ninja page type: director room, push camera, view stream, scene/output, or custom URL.
4. Copy or open the generated VDO.Ninja URL, or show its QR code for a phone/guest device.
5. Keep that VDO.Ninja page open and press `Test`.
6. Add `Local Control`, `Select Guest`, `Guest Command`, `Guest Scene`, `Mixer Control`, `PTZ Key`, `PTZ Dial`, `Value Dial`, or `Custom Command` actions.

Current local machine note: the plugin manifest targets the Node 20 runtime bundled with Stream Deck 6.8+; newer local Node versions work for development.

No-hardware checks:

```bash
npm test
npm run check
npm run build
npx @elgato/cli@latest validate ninja.vdo.streamdeck.sdPlugin --no-update-check
npx @elgato/cli@latest pack ninja.vdo.streamdeck.sdPlugin --dry-run --no-update-check
```

These verify command payloads, TypeScript, generated plugin layout, manifest rules, and package contents without a physical Stream Deck. Interactive button/dial testing still requires the Stream Deck app with either hardware or Stream Deck Mobile.

Runtime alignment note:

- `getDetails` callbacks without a target are treated as full snapshots.
- `details` updates from VDO.Ninja are treated as partial updates and merged.
- `getGuestList` is treated as a director UI ordering helper, not as the universal stream list.
- Selected guest stores a stream ID. Selecting by slot resolves the current slot to its stream ID when the select action is pressed, so later slot changes do not silently retarget selected-guest actions.
- Custom scene names/IDs are supported through the dedicated `Guest Scene` action and raw/custom commands. Toggle uses the legacy `addScene` shape; explicit force on/off uses current VDO.Ninja's `addScene` + `value2=true/false` shape.
- Mixer Control follows existing API semantics: `layout=0` is auto, `layout=1` is the first configured layout, and `setslot` uses user-facing destination slot numbers where `1` is mixer slot 1 and `0` unsets the assignment. Layout object fields such as `slot: 0` keep VDO.Ninja's existing zero-based layout-item convention.
- All-guest mute uses VDO.Ninja's director `muteAllGuests` API wrapper, which calls the same page function as the visible mute-all button.
- All-guest transfer fans out existing `forward` commands one guest at a time and requires a second press by default.
- PTZ Key follows current VDO.Ninja paths: local `zoom`/`pan`/`tilt`/`focus`/`exposure`, guest `ptzZoom`/`ptzPan`/`ptzTilt`/`ptzFocus`/`ptzAutofocus`. Guest exposure and local autofocus are intentionally blocked.
- PTZ Dial uses the same PTZ command paths as PTZ Key, sends relative deltas only, accumulates fast dial ticks, and rate-limits sends to the configured interval.
- Guest PTZ requires the guest publisher to load with `&ptz` and approve the browser PTZ permission prompt.
- Value Dial sends absolute values for `volume`, `panning`, `bitrate`, `setBufferDelay`, and guest `volume`. Buffer delay uses `value2: "*"` for all current inbound streams and omits `value2` for default/future streams.
- Local push-to-talk sends `mic=true` on key down and `mic=false` on key up; push-to-mute sends the inverse. The action uses sequence guards so stale async completions do not repaint the key after a newer release.
- No-wait realtime WebSocket commands are skipped when the plugin sees high send rate or WebSocket backlog. This only affects incremental controls such as relative PTZ/value nudges; awaited discrete commands such as scene, mute, transfer, layout, and slot assignment are not skipped.
- The HTTP API route is enabled by default for request/response commands because the public relay owns HTTP callback IDs. Commands that require `value2` use raw WebSocket payloads so secondary values are preserved.
- HTTP route responses `failed` and `timeout` are treated as errors.

See `../docs/runtime-comparison-audit.md` for the current comparison against VDO.Ninja's local signaling and callback paths.
