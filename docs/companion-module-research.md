# Bitfocus Companion VDO.Ninja Module Research

Research date: 2026-06-30.

This summarizes the current Bitfocus Companion VDO.Ninja module so the native Stream Deck plugin can at least mirror it, then add Stream Deck specific controls and customization.

## Sources Reviewed

- Companion module repo: https://github.com/bitfocus/companion-module-vdo-ninja
- Current module package: https://raw.githubusercontent.com/bitfocus/companion-module-vdo-ninja/main/package.json
- Current runtime: https://raw.githubusercontent.com/bitfocus/companion-module-vdo-ninja/main/index.js
- Current actions: https://raw.githubusercontent.com/bitfocus/companion-module-vdo-ninja/main/actions.js
- Current feedbacks: https://raw.githubusercontent.com/bitfocus/companion-module-vdo-ninja/main/feedbacks.js
- Current variables: https://raw.githubusercontent.com/bitfocus/companion-module-vdo-ninja/main/variables.js
- Current presets: https://raw.githubusercontent.com/bitfocus/companion-module-vdo-ninja/main/presets.js
- Releases: https://github.com/bitfocus/companion-module-vdo-ninja/releases
- Local runtime verification: `verified-api-command-and-callback-reference.md`

## Bryce / Companion History

Bryce Seifert is the author on the recent module releases and most recent feature work in the GitHub release history:

| Release | Relevant VDO.Ninja change |
| --- | --- |
| v1.1.0 | Stops polling on module disable. |
| v2.2.0 | Adds custom WebSocket server config. |
| v2.2.1 | Improves feedback responsiveness and director presets. |
| v2.2.2 | Allows stream variables on all streams, including rooms. |
| v2.3.0 | Adds guest-in-scene feedback / variable. |
| v2.4.0 | Upgrades to Node 22 and adds PTZ actions. |
| v2.5.0 | Adds stream ID variables and variables in actions. |

The native plugin should match the v2.5.0 surface as the parity baseline.

## Runtime Architecture

The Companion module is intentionally lean:

- Node module using `@companion-module/base` and `ws`.
- Config fields:
  - `apiID`
  - `wsCustom`
  - `wsServer`, default `api.vdo.ninja`, only shown when `wsCustom` is enabled.
- WebSocket target:
  - `wss://{serverUrl}:443`
  - On open, sends `{ "join": apiID }`, then immediately sends `{ "action": "getDetails" }`.
- Reconnect behavior:
  - On close, schedules reconnect every second.
  - Bad/missing API key is handled as bad config.
- State:
  - `this.states` is keyed by stream ID.
  - `this.streams` is an array of `{ id, label }` choices for feedback/action dropdowns.
  - `getDetails` snapshots seed state; later `update` messages mutate it.
- Output:
  - Every action calls a shared `sendRequest(action, target, value, local)` helper.
  - The payload shape is `{ action, target, value, local }`, with missing values serialized as `"null"`.

Native plugin translation:
- Keep the same single persistent WebSocket client as MVP.
- Do not serialize missing values as the string `"null"` internally; normalize to JSON `null` and only adapt if the API requires the string form.
- Add a request queue and callback tracking so feedback-sensitive actions can distinguish success, timeout, and disconnect.
- Preserve custom WebSocket host support for self-hosted API servers.

## Companion State Handling

Incoming WebSocket messages are handled in two families:

| Message form | Companion behavior | Native plugin implication |
| --- | --- | --- |
| `callback.action == "getDetails"` | Iterate result and call `processGetDetails(data)` for every stream. | Use this as the full snapshot path. |
| `callback.local` | Finds the local stream and updates it if the action was not a toggle. | Native plugin should use callback result to update local button state quickly. |
| `update` | Calls `processUpdate(data)`. | Use this as the incremental event path. |

Important update actions:

| Update action | Companion behavior |
| --- | --- |
| `hangup` | Deletes stream state and removes it from dropdown choices. |
| `newViewConnection` | Requests fresh `getDetails`. |
| `director` | Updates director state and rebuilds actions/variables/feedbacks. |
| `endViewConnection` | Deletes stream by `data.value`. |
| `positionChange` | Requests fresh `getDetails`. |
| `directorMuted` | Stores director-enforced guest audio mute under `others["mute-guest"]`. |
| `directorVideoHide` | Stores director-enforced guest video hide under `others["hide-guest"]`. |
| `remoteMuted` / `mic` | Updates `muted`. |
| `remoteVideoMuted` / `camera` | Updates `videoMuted`. |
| `details` | Requests fresh `getDetails`. |
| `seeding` / `tracksAdded` | Requests fresh `getDetails`. |

Native plugin enhancement:
- Keep both raw stream state and normalized state. The raw state should remain inspectable for debugging; normalized state should drive button colors, titles, and property inspector dropdowns.
- Track last snapshot time and last update time per stream.
- Detect stale guests and show a distinct state instead of silently leaving the last known state.

## Companion Actions to Mirror

### Local Actions

| Companion action ID | VDO.Ninja action |
| --- | --- |
| `speaker` | `speaker` with `toggle` / `true` / `false` |
| `mic` | `mic` with `toggle` / `true` / `false` |
| `camera` | `camera` with `toggle` / `true` / `false` |
| `volume` | `volume` percent |
| `sendChat` | `sendChat` text |
| `record` | `record` `true` / `false` |
| `reload` | `reload` |
| `hangup` | `hangup` |
| `bitrate` | `bitrate` reset / pause / custom kbps |
| `panning` | `panning` 0 to 180, center 90 |
| `togglehand` | `togglehand` |
| `togglescreenshare` | `togglescreenshare` |
| `forceKeyframe` | `forceKeyframe` |
| `nextSlide` | `nextSlide` |
| `previousSlide` | Companion action ID; current local VDO runtime confirms `prevSlide` as the actual VDO API action name |
| `ptzPan` | local `pan`, value divided by 100 |
| `ptzTilt` | local `tilt`, value divided by 100 |
| `ptzZoom` | local `zoom`, value divided by 100 |
| `ptzFocus` | local `focus`, value divided by 100 |
| `ptzExposure` | local `exposure`, value divided by 100 |

### Director / Room Actions

| Companion action ID | VDO.Ninja action |
| --- | --- |
| `group` | self `group` |
| `joinGroup` | self `joinGroup` |
| `leaveGroup` | self `leaveGroup` |
| `viewGroup` | self `viewGroup` |
| `joinViewGroup` | self `joinViewGroup` |
| `leaveViewGroup` | self `leaveViewGroup` |
| `soloVideo` | `soloVideo` |

### Guest-Targeted Actions

| Companion action ID | VDO.Ninja action |
| --- | --- |
| `guestForward` | `forward` |
| `guestAddScene` | `addScene` |
| `guestMuteScene` | `muteScene` |
| `guestGroup` | `group` with target |
| `guestMic` | `mic` with target |
| `guestHangup` | `hangup` with target |
| `guestSoloChat` | `soloChat` |
| `guestAltSoloChat` | `soloChatBidirectional` |
| `guestSpeaker` | `speaker` with target |
| `guestDisplay` | `display` |
| `guestOverlay` | `sendDirectorChat` |
| `guestForceKeyframe` | `forceKeyframe` with target |
| `guestSoloVideo` | `soloVideo` with target |
| `guestVolume` | `volume` with target |

Parity note: current Companion actions include local PTZ but not full guest PTZ actions in the action table despite v2.4.0 release notes. The VDO.Ninja API and local `ptz.html` support guest PTZ via `ptzZoom`, `ptzPan`, `ptzTilt`, `ptzFocus`, and `ptzAutofocus`; native Stream Deck should expose those directly.

## Companion Feedbacks to Mirror

| Feedback | Inputs | Logic |
| --- | --- | --- |
| Mic status | stream, muted/unmuted state | Guest streams use `others["mute-guest"]` as director-enforced override; otherwise compare `muted`. |
| Camera status | stream, muted/unmuted state | Guest streams use `others["hide-guest"]` as director-enforced override; otherwise compare `videoMuted`. |
| Speaker status | stream, muted/unmuted state | Compare `speakerMuted`. |
| Guest in scene | stream, scene ID/name | Compare `stream.scenes[scene] == true`. |

Native plugin should add:
- Connection state feedback.
- Command timeout/error feedback.
- Record state feedback if exposed in callbacks.
- PTZ mode/position feedback when callback data supports it.
- Stats feedback: bitrate, packet loss, audio level/loudness, frame rate, resolution, buffer delay.
- Guest waiting/held/hand-raised feedback from `others`.

## Companion Variables and Presets

Variables:
- Director:
  - `director_mic`
  - `director_camera`
  - `director_speaker`
- Guest by position:
  - `guest_{position}_streamID`
  - `guest_{position}_mic`
  - `guest_{position}_camera`
  - `guest_{position}_label`
  - `guest_{position}_scenes`
- Stream ID specific:
  - `{streamID}_mic`
  - `{streamID}_camera`
  - `{streamID}_label`
  - `{streamID}_scenes`

Presets:
- Dynamic guest mic and camera presets by guest position.
- Dynamic director mic, camera, and speaker presets.
- Presets use variables for button titles and feedbacks for green active states.

Native plugin should go further:
- Provide default profiles by hardware class rather than only dynamic presets.
- Offer optional dynamic folders/pages: Director, Guests, Scenes, PTZ, Stats.
- Allow per-action target binding by slot, stream ID, label, or "selected guest".
- Add a "selected guest" action that updates the target used by dial/page actions.

## Native Stream Deck Enhancements Beyond Companion

### Dials / Encoders

There are no physical faders/sliders in the Stream Deck family reviewed, but Stream Deck + and + XL have dials/encoders and an LCD touch strip/infobar. Use those for:

- Local playback volume.
- Guest mic volume.
- Local audio pan (`panning`).
- Bitrate and buffer delay.
- Local PTZ: zoom, pan, tilt, focus, exposure.
- Guest PTZ: `ptzZoom`, `ptzPan`, `ptzTilt`, `ptzFocus`, `ptzAutofocus`.
- Scene/group selection and push-to-apply.

### Better Customization

- Command registry with every action exposed through one schema.
- Custom command action for `{ action, target, value, value2 }`.
- Per-button title templates using state tokens.
- Color/icon themes for local, director, guest, scene, PTZ, danger, and stats actions.
- Safety modes for destructive actions: reload, hangup, guest hangup, transfer, recover stream.
- Multi-connection support later: multiple API keys/rooms with action-level connection selection.

### Better State Model

Mirror Companion's `states` and `streams`, but add:
- `connectionsByApiKey`.
- `streamsById`.
- `slotsByPosition`.
- `selectedTarget`.
- `lastCommandByAction`.
- `statsByStream`.
- `errorsByConnection`.
- `derivedFlags` such as `guestAudioMutedEffective`, `guestVideoHiddenEffective`, `inScene`, `stale`, `held`, `handRaised`.

## Red Flags Found

- Companion uses a one-second reconnect interval without backoff. Native plugin should back off after repeated failures.
- Companion sends `getDetails` on connect and selected update events, but does not appear to poll continuously. Native plugin should have configurable polling while visible feedback actions exist.
- Companion serializes missing `target` / `value` as `"null"`. Native code should isolate this as a transport adapter detail.
- Companion currently has limited feedback types. Native plugin should avoid over-promising state until final live-device callback/update behavior is tested.
- `previousSlide` is a Companion naming quirk. Send `prevSlide` to VDO.Ninja and, if useful, keep `previousSlide` only as a native plugin compatibility label.
