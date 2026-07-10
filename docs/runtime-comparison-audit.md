# Runtime Comparison Audit

Audit date: 2026-06-30. Compatibility recheck: 2026-07-10.

This compares the native Stream Deck plugin implementation in `plugin/` against the current local VDO.Ninja runtime. The plugin still stays inside `vdo-streamdeck/`; no VDO.Ninja source files were changed for this audit.

## Recheck Summary

Repeated source rechecks on 2026-06-30 confirmed the plugin should continue treating VDO.Ninja state as page-derived live state, not as a durable room model:

- `getDetails` over `&api` maps to `getDetailedState(value)` in `lib.js`; there is no checked `getDetailsState` or `getStreamDetails` command.
- `getDetailedState` can return only the local page, only selected inbound streams, or a director room snapshot depending on page mode and optional `value`.
- `getGuestList` is a director DOM ordering helper only. Empty `getGuestList` is valid for push links, plain view links, clean/scene outputs, and roomless pages.
- Scene IDs are arbitrary DOM `data-scene` strings. Numeric scene aliases are conveniences, not the whole model.
- Transfer/queue changes arrive as later `details`, `newViewConnection`, `endViewConnection`, and `positionChange` updates. The plugin must refresh state after these events instead of assuming a target stayed in the same room or slot.
- The current MVP actions are safe with these assumptions because local controls do not depend on room state; guest/scene/selected-target actions derive state from `getDetails`; and custom commands preserve string targets/values for stream IDs, room names, and custom scenes.
- Dedicated transfer-specific, richer stale-target, and PTZ actions still need to inherit these rules when implemented.

## Source Paths Checked

- `../../lib.js`
  - `getDetailedState`
  - `getGuestList`
  - `pokeAPI`
  - `oscClient`
  - `targetGuest`
  - `processMessage`
  - local `Commands`
- `../../main.js`
  - iframe `getStreamIDs`
  - iframe `getStreamInfo`
  - iframe `getDetailedState`
  - iframe `getGuestList`
  - iframe queue/device callbacks
- `../../webrtc.js`
  - `newViewConnection`
  - `endViewConnection`
  - `details` pushes
  - director/co-director sync state
  - guest mute/video update pushes

## Confirmed API Transport Behavior

The native plugin is correct to use the `&api` WebSocket as the primary surface:

1. A controlled VDO.Ninja page opened with `&api=KEY` connects to `session.apiserver`.
2. It sends `{ "join": "KEY" }`.
3. On socket open, it pushes an async `update`:

```json
{
  "update": {
    "action": "details",
    "streamID": "localStreamId",
    "value": {
      "localStreamId": {}
    }
  }
}
```

The value comes from `getDetailedState(session.streamID)`, so it is often a partial page-local snapshot, not a full room snapshot.

Incoming plugin commands use:

```json
{
  "action": "mic",
  "target": null,
  "value": "toggle",
  "get": "request-id"
}
```

`processMessage` routes commands with a non-null `target` through `targetGuest(...)`; otherwise it calls local `Commands[action]`. When a response is non-null, the page returns:

```json
{
  "callback": {
    "action": "mic",
    "value": "toggle",
    "get": "request-id",
    "result": false
  }
}
```

Because the original command object is reused, `callback.get`, `callback.target`, `callback.value`, and `callback.value2` echo the normalized request where present. `callback.result` is the function return value, not a guaranteed durable state snapshot.

The reference HTTP relay resolves successful HTTP requests with only `callback.result`. It returns plain `failed` when no VDO.Ninja page is joined to the API key and plain `timeout` when a page does not return a callback in time. The plugin treats those relay strings as errors, not successful command results.

HTTP fallback note: VDO.Ninja's relay POST path always adds a `get` ID and waits for a callback internally. Even plugin actions configured as "do not wait" may still wait when they fall back to HTTP, because HTTP has no fire-and-forget route in the reference relay.

Implementation rule: HTTP fallback responses are normalized into the same callback path as WebSocket callbacks so `getDetails`, `getGuestList`, and command feedback update the Stream Deck state store consistently.

Custom command parsing rule: the plugin preserves numeric-looking text values such as `01` as strings. VDO.Ninja itself parses numeric command values where needed, while stream IDs, push/view IDs, and custom scene keys can be numeric-looking strings that must not be coerced.

API host rule: default secure WebSocket remains `wss://api.vdo.ninja:443`. Custom hosts with explicit ports are preserved instead of blindly appending `:443`, and non-TLS WebSocket mode defaults to port `80`.

Important API-key scope: the relay broadcasts commands to every WebSocket client joined to the same API key. The callback does not include a stable page identity. The MVP plugin therefore treats one API key as one controlled VDO.Ninja page/session for deterministic state feedback. Reusing the same API key across a director page plus scene/view/push pages can produce multiple callbacks and ambiguous local state; use separate API keys until a multi-page state model exists.

Connection-state rule: opening the WebSocket to the relay is not enough to show "connected" in Stream Deck. The plugin should only mark a VDO page as connected after a VDO.Ninja page sends an `update` or returns a `callback`. A relay connection with no answering page becomes `no-page` after the `getDetails` timeout.

## Implementation Corrections Made

The initial plugin implementation treated every `details` payload as a complete replacement. That is wrong for current VDO.Ninja because several `pokeAPI("details", ...)` calls are partial:

- API socket open: `getDetailedState(session.streamID)`.
- Remote `msg.info` update: `getDetailedState(remoteStreamID)`.
- Co-director/director sync: `session.syncState`.

The plugin now does this:

- `getDetails` callback without `value`: replace the current detailed state.
- `getDetails` callback with `value`: merge it as a targeted stream result.
- async `update.action == "details"`: merge it.
- async `remoteMuted`, `remoteVideoMuted`, `directorMuted`, and `directorVideoHide`: patch the affected stream ID.
- async `endViewConnection`: remove the affected stream from `update.value`, because `update.streamID` is the reporting local page.
- async `positionChange`: patch stream positions immediately.
- async `codirector`: patch local `director` feedback and preserve a separate `codirector` flag, because VDO.Ninja reports co-director approval separately.
- async join/leave/position/detail/stream events: debounce a fresh `getDetails`; join/leave/position also refresh `getGuestList`.
- periodic `getDetails` polling uses the configured `detailsPollMs` as a backstop because the detailed state is live DOM/session-derived and not every future UI path is guaranteed to push a complete update.
- any callback or update from a page marks the API connection as page-present again after a previous timeout/no-page state.
- nested sync-state details shaped like `{ sid: { sid: streamState } }` are unwrapped before normalization.
- HTTP fallback `failed` and `timeout` relay responses raise errors and set `no-page`/`timeout` state.
- local `record` defaults to `true` for generic toggle buttons because current VDO.Ninja `record` only handles explicit `true` and `false`.

Regression coverage was added in `plugin/src/state/session-store.test.ts` for these cases.

## State Source Truths

`getDetailedState` is the main state source for the native plugin. It is built on demand from live session objects and the current DOM. It is not a persistent room or scene database.

Remote stream entries can include:

- `streamID`, `label`, `group`
- chunked/WebCodecs buffer fields
- `miscellaneous` from `stats.info`
- `layout`, `slot`
- `featured`
- `iframeSrc`
- `localStream: false`
- `muted`, `videoMuted`
- `activeSpeaker`, `defaultSpeaker`
- visibility and volume fields
- `director`
- `position`
- `scenes`
- `others`

Local stream entries can include:

- `label`, `meta`, `group`, `groupView`, `scene`
- `streamID`, `iframeSrc`
- `director`
- `localStream` and deprecated `localstream`
- `seeding`
- `muted`, `videoMuted`, `speakerMuted`
- visibility, slot, meshcast, layout, outbound stats
- screen share and local track fields
- director scene/highlight state when applicable

## Room, Push/View, Scene, and Transfer Implications

The plugin cannot assume that an API key controls a director room.

### Director Room

Expected state:

- `getDetails` has local director state and remote guest entries.
- `getGuestList` usually returns visible `#guestFeeds` positions.
- remote entries may have `scenes`, `others`, slots, and queue/hand state.

Best plugin behavior:

- Use `getGuestList` for user-facing slot order.
- Use `getDetails` for stable stream IDs, labels, custom scenes, queue/hand flags, and guest feedback.
- Prefer stream IDs for persistent settings; use slot numbers only as convenience selectors.

### Plain Push Link

Expected state:

- The local push page may only expose its own `localStream` entry.
- There may be no room and no `#guestFeeds`.
- `getGuestList` can be empty.

Best plugin behavior:

- Local controls should still work.
- Connection status should not treat an empty guest list as no page.
- Guest/director actions should show missing target until inbound streams exist.
- Use a unique API key for this push page if another VDO.Ninja page is also open and should not receive the same local commands.

### Plain View Link

Expected state:

- The page can have inbound `session.rpcs` entries from the viewed stream IDs.
- There may be no room and no director UI.
- `getGuestList` can be empty or incomplete.

Best plugin behavior:

- Build stream choices from `getDetails` as well as `getGuestList`.
- Do not require room IDs for viewer controls like local speaker, volume, stats, or PTZ where applicable.
- Use a unique API key for this view page when it is meant to be controlled independently from a director page.

### Scene or Clean Output Link

Expected state:

- `session.scene` can be `"0"` or any sanitized custom scene string.
- Scene links can have inbound streams and layout state but not full director controls.
- `getGuestList` depends on whether the page has `#guestFeeds`.

Best plugin behavior:

- Treat scene/custom scene as a local page mode, not just a numbered scene bank.
- Avoid assuming scenes are only `0` through `8`.
- If scene output pages also use `&api`, keep their keys separate from the director key unless broadcast control is intended.

### Transfer Rooms

Expected state:

- Guest transfer uses `directMigrate`/`directMigrateIssue` and can change the guest room, queue type, and publishing state.
- The plugin sees the practical result through `endViewConnection`, `newViewConnection`, `details`, and position changes, not a durable transfer-room object.

Best plugin behavior:

- After transfer-related commands, refresh state instead of assuming the target remains in the same room/slot.
- Show transfer as a command result plus later live state, not as an immediate stable state transition.

## Scene Handling

Current VDO.Ninja scene state is dynamic:

- `getDetailedState` reads scene controls with `[data-action-type="addToScene"][data-scene]`.
- Scene keys are whatever `data-scene` contains.
- Custom scene strings are valid.
- `targetGuest("addScene", target, value)` uses `value` as the scene ID/name unless it is missing, `null`, or `"toggle"`.
- `addScene2` through `addScene8` are only convenience aliases.
- For a custom scene ID/name, `addScene` toggles the matching scene button when `value2` is missing.
- Current VDO.Ninja also accepts `addScene` with `value2=true/false`, or `setScene`, to force custom scene membership without relying on a toggle.

Plugin rule:

- Future scene actions must accept arbitrary scene IDs/names.
- Target dropdowns should derive observed scene choices from `details[streamID].scenes`, not from a fixed 0-8 list.
- A default profile can include common scene buttons, but the underlying action must stay custom-scene capable.
- The dedicated scene action exposes toggle plus explicit set-on/set-off without requiring the current-month extension. Scenes 1-8 use legacy aliases; arbitrary names use observed `getDetails.scenes` state and a single legacy toggle only when needed.

## Callback and Info Calls

There is no current iframe call named `getStreamDetails` in the local runtime.

Closest calls:

- `getDetails` / iframe `getDetailedState`: broad local plus remote stream state.
- iframe `getStreamInfo`: remote-only map keyed by internal UUID with `{ label, streamID, info }`.
- iframe `getStreamIDs`: remote-only map of `streamID` to label.
- `getStats`: lightweight local/inbound/outbound stats.
- `requestStats`: heavier diagnostic stats with `pcs` and `rpcs`.
- iframe `getGuestList`: director UI position map.

For a native Marketplace plugin, `getDetails` is the best general state call over `&api`. `getStreamInfo`, device APIs, loudness, video frames, and some P2P data helpers remain iframe-only unless a future VDO.Ninja `&api` bridge is added. Queue activation is now covered by `activateQueuedGuest`.

Naming note: there is no `getDetailsState` call in the checked source. Use `getDetails` for `&api` and `getDetailedState` for iframe/source references.

## Current Plugin Coverage

Implemented now:

- Native Stream Deck SDK plugin scaffold.
- Three-step setup property inspector with link building, local QR, connection testing, and collapsed advanced/self-hosted settings.
- WebSocket API client with callback correlation.
- HTTP request/response routing plus raw WebSocket delivery for `value2` and realtime commands.
- Connection status action.
- Local control, selected guest, guest command, guest scene, mixer control, PTZ key, PTZ dial, and value dial actions.
- Custom command action.
- State store for local and remote details, guest list, partial updates, and join/leave refresh triggers.
- Legacy-safe scene forcing and per-guest mute-all fan-out.
- Tests for every exposed command choice, inspector button wiring/execution, command payloads, custom parsing, settings, transport, and state normalization.

Still planned:

- Stats display action.
- Marketplace profile bundles.
- Hardware verification for PTZ Dial and Value Dial on Stream Deck + / + XL.
- Optional iframe-backed advanced mode for device control, loudness, frames, and P2P data.

## Remaining Gaps Against VDO.Ninja

- Queue activation is supported through native `&api` with `activateQueuedGuest` plus `removeQueue` / `removeQueuedGuest` aliases. Older self-hosted VDO.Ninja pages without that addition can still detect queued/held state but cannot activate it through native `&api`.
- `getGuestList` is not a universal stream list. The plugin must continue using `getDetails` as the fallback stream source.
- Remote scene membership depends on director DOM controls existing. In non-director links, `scenes` may be absent even when the page is viewing a scene.
- Some command callbacks return `false` for missing targets, and some runtime functions can effectively return no useful result. Button feedback should use callbacks for acknowledgement and details/updates for durable state.
- Current VDO.Ninja supports `addScene` with `value2=true/false`, or `setScene`, but the plugin deliberately uses legacy scene aliases and state-aware toggles so pre-v30.1 pages remain compatible.
- Multi-API-key and multi-room control are not implemented yet.
- Multi-page same-key state aggregation is not implemented because current callbacks do not identify the responding page.
- No physical Stream Deck hardware or Stream Deck + dial smoke test has been run yet.
