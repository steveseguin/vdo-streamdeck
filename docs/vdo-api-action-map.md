# VDO.Ninja API Action Map for Stream Deck

This file maps the VDO.Ninja API surface into native Stream Deck plugin actions.

Local reference sources:
- `../../Companion-Ninja/httpwssapi.md`
- `../../Companion-Ninja/README.md`
- `../../Companion-Ninja/python_sample/readme.md`
- `../../ptz.html`
- `../../streamdeck.html`

External reference:
- Bitfocus Companion module: https://github.com/bitfocus/companion-module-vdo-ninja

Companion parity details and API transport/state details are split out into:
- `companion-module-research.md`
- `api-surfaces-and-state.md`
- `verified-api-command-and-callback-reference.md`

## Connection Model

VDO.Ninja side:
- User opens a VDO.Ninja page with `&api=API_KEY`.
- The API key must match the plugin setting.
- API key should be treated like a secret because it controls that VDO.Ninja page.

Plugin side:
- Primary transport: WebSocket to `wss://api.vdo.ninja:443`.
- On connect: send `{ "join": "API_KEY" }`.
- Preferred command payload: `{ "action": "...", "target": "...", "value": ..., "value2": ... }`.
- HTTP POST fallback: POST the same JSON shape to `https://api.vdo.ninja/API_KEY`.
- HTTP GET is useful for simple legacy/testing flows but should not be the main implementation path because `target`, `value`, and `value2` become ambiguous.
- SSE can be considered later for monitoring-only views, but a connected WebSocket plus periodic details polling is simpler for MVP.

## State and Feedback Inputs

Use these API actions for feedback:

| Action | Purpose |
| --- | --- |
| `getDetails` | Broad page/session state. Use for connected streams, guest labels, scene membership, muted/videoMuted/speaker state, director flag, and UI-derived state. |
| `getGuestList` | Guest slot to stream ID/label mapping. Useful for property inspector dropdowns and dynamic titles. |
| `getStats` | Quick per-stream stats. Useful for bitrate/health display actions. |
| `requestStats` | Detailed stats when an operator explicitly wants diagnostics. Do not poll aggressively by default. |

Feedback to support first:
- Connection status.
- Local mic/camera/speaker muted state.
- Guest mic/camera/speaker/display state.
- Guest scene membership.
- Guest label and stream ID.
- Active group/view group when exposed in `getDetails`.
- Last command success/timeout.

## Core Action Catalog

### Local Controls

| Stream Deck action | VDO action | Target | Value |
| --- | --- | --- | --- |
| Local Mic | `mic` | none | `true`, `false`, `toggle` |
| Local Camera | `camera` | none | `true`, `false`, `toggle` |
| Local Speaker | `speaker` | none | `true`, `false`, `toggle` |
| Local Playback Volume | `volume` | none | `0` to `200` |
| Local Record | `record` | none | `true`, `false` |
| Screen Share | `togglescreenshare` | none | none |
| Raise Hand | `togglehand` / `raisehand` | none | none |
| Hang Up | `hangup` | none | none |
| Reload Page | `reload` | none | none |
| Force Keyframe | `forceKeyframe` | none | none |
| Bitrate | `bitrate` | none | `true`, `false`, integer kbps |
| Buffer Delay | `setBufferDelay` | none | milliseconds in `value`; optional stream ID/UUID/`*` in `value2` or `target` |
| Tally Light | `tallylight` | none | `onair`, `active`, `standby`, `off`, or integer |
| Active Speaker | `activeSpeaker` | none | `toggle`, `false`, `1`, `2`, `3` |
| Send Chat | `sendChat` | none | message |
| Show Local Overlay | `showChatOverlay` | none | message |

### Layout, Slides, and Timers

| Stream Deck action | VDO action | Target | Value |
| --- | --- | --- | --- |
| Switch Layout | `layout` | none | `0`, `false`, integer, or layout object |
| Next Slide | `nextSlide` | none | none |
| Previous Slide | `prevSlide` | none | none |
| Start Room Timer | `startRoomTimer` | none or guest | seconds |
| Pause Room Timer | `pauseRoomTimer` | none or guest | none |
| Stop Room Timer | `stopRoomTimer` | none or guest | none |

Note: current local runtime confirms lowercase `pauseRoomTimer`. Older docs mention `PauseRoomTimer`, but the native plugin should send the lowercase action.

### Group and View Group Controls

| Stream Deck action | VDO action | Target | Value |
| --- | --- | --- | --- |
| Toggle Self Group | `group` | none | `1` to `8` |
| Join Self Group | `joinGroup` | none | `1` to `8` |
| Leave Self Group | `leaveGroup` | none | `1` to `8` |
| Toggle View Group | `viewGroup` | none | `1` to `8` |
| Join View Group | `joinViewGroup` | none | `1` to `8` |
| Leave View Group | `leaveViewGroup` | none | `1` to `8` |
| Toggle Guest Group | `group` | guest slot or stream ID | `1` to `8` |

### Director Guest Controls

Targets can be a guest slot/position or a stream ID. Stream IDs are more stable; slots are easier for users.

| Stream Deck action | VDO action | Value |
| --- | --- | --- |
| Transfer Guest | `forward` | destination room |
| Activate Queued Guest | `activateQueuedGuest` | none |
| Toggle Guest in Scene | `addScene` | scene ID/name |
| Set Guest Scene State | `addScene` or `setScene` | scene ID/name plus `value2=true/false` |
| Toggle Guest Mic in Scene | `muteScene` | optional `true`/`false`; current runtime toggles the guest `mute-scene` control rather than selecting a scene by value |
| Toggle Guest Mic | `mic` | `true`, `false`, `toggle`, or none for legacy toggle |
| Toggle Guest Speaker | `speaker` | `true`, `false`, `toggle`, or none |
| Toggle Guest Display/Blind | `display` | optional boolean/toggle |
| Guest Volume | `volume` | `0` to `200` |
| Hang Up Guest | `hangup` | none |
| Solo Talk | `soloChat` | none |
| Two-way Solo Talk | `soloChatBidirectional` | none |
| Guest Highlight | `soloVideo` | none or `true`/`false`/`toggle` |
| Guest Force Keyframe | `forceKeyframe` | none |
| Guest Overlay Message | `sendDirectorChat` / `sendPinnedDirectorChat` | message |
| Guest Mirror | `mirror` / `mirrorGuest` / `remoteMirror` | `true`, `false`, `toggle` |
| Guest Rotate | `rotate` | `true`, `false`, `90`, `180`, `270` |
| Guest PGM Channel | `channel` / `pgm` | `0`, `1`, `2` |
| Guest Mix Order | `mixorder` | `-1` or `1` |
| Refresh Guest Video | `refreshVideo` / `refreshCamera` | none |
| Refresh Guest Connection | `refreshConnection` / `restartConnection` | none |
| Recover Guest Stream | `recoverStream` / `refreshAll` | none |
| Request Resolution | `requestResolution` | `WIDTHxHEIGHT` |
| Request Aspect Ratio | `requestAspectRatio` | decimal or `16:9`; use `value2` for max dimension |
| Set Width | `setWidth` | integer |
| Set Height | `setHeight` | integer |
| Set Aspect Ratio | `setAspectRatio` | decimal |

## PTZ Mapping

### Local Camera PTZ

These control the local camera attached to the VDO.Ninja page opened with the API key:

| Control | Relative action | Absolute mode |
| --- | --- | --- |
| Zoom | `zoom` with decimal value | `value2: "abs"` and value `0.0` to `1.0` |
| Focus | `focus` with decimal value | `value2: "abs"` if supported |
| Pan | `pan` with decimal value | `value2: "abs"` if supported |
| Tilt | `tilt` with decimal value | `value2: "abs"` if supported |
| Exposure | `exposure` with value `0.0` to `1.0` | local-only based on current docs |

### Guest-Targeted Director PTZ

When controlling a guest as director/co-director, use the explicit `ptz*` or `remote*` actions:

| Control | Preferred VDO action | Notes |
| --- | --- | --- |
| Guest Zoom | `ptzZoom` | Add `value2: "abs"` for absolute moves. |
| Guest Focus | `ptzFocus` | Send `ptzAutofocus: false` before manual focus presets. |
| Guest Pan | `ptzPan` | Supports relative and absolute patterns in `ptz.html`. |
| Guest Tilt | `ptzTilt` | Supports relative and absolute patterns in `ptz.html`. |
| Guest Autofocus | `ptzAutofocus` | Values: `true`, `false`, `manual`, `off`. |

Important: plain `zoom`, `focus`, `pan`, `tilt`, and `exposure` are local actions. They are not the guest-targeted director control names.

## Suggested Default Profiles

### Mini / Pedal

- Mic toggle.
- Camera toggle.
- Record start/stop or push-to-talk/speaker mute.
- Optional: emergency hangup.

### 15-Key Stream Deck / Neo

- Connection status.
- Local mic/camera/speaker.
- Record start/stop.
- Screen share.
- Raise hand.
- Layout 0/1/2/3.
- Guest 1/2 mic/camera/scene toggle.

### XL / + XL Director

- Connection/status/stat keys.
- Scene rows.
- Guest rows: mic, camera, scene, speaker/display, solo talk, hangup.
- Group/view-group controls.
- Layout switching.
- Timer and slide controls.
- PTZ page/folder.

### Stream Deck + / + XL Dials

- Dial 1: selected target volume.
- Dial 2: selected target zoom.
- Dial 3: selected target pan/tilt cycle.
- Dial 4: selected target focus/autofocus.
- + XL extra dials: exposure, bitrate, buffer delay, or scene/group selector.

## Red Flags to Validate

- Some simple GET examples omit `target`; use POST/WSS in the plugin to avoid ambiguity.
- Callback shapes and the main state payloads are documented in `verified-api-command-and-callback-reference.md`; still test final action feedback against a live page before Marketplace release.
- Guest `mic` and `camera` accept explicit booleans in current `targetGuest` routing.
- Guest camera feedback should account for both `videoMuted` and director/UI override fields in `others`, matching the Companion module behavior.
- Companion exposes a `previousSlide` action ID, but current local VDO runtime confirms `prevSlide` as the VDO action name.
