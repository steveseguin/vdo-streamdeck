# VDO.Ninja API Surfaces and State Reference

Research date: 2026-06-30.

This captures the VDO.Ninja control surfaces relevant to a native Stream Deck plugin: `&api` WebSocket/HTTP/SSE, iframe `postMessage`, and WebRTC/P2P data-channel routing.

## Local Source Pointers

- `../../Companion-Ninja/httpwssapi.md`
- `../../Companion-Ninja/iframeapi.md`
- `../../Companion-Ninja/dataiframes.md`
- `../../Companion-Ninja/p2pdrawing.md`
- `../../Companion-Ninja/server/oscninja.js`
- `../../ptz.html`
- Runtime API command handlers: `../../lib.js` around `commands.*`
- Detailed state source: `../../lib.js` around `getDetailedState`
- Iframe message router: `../../main.js` around the iframe `message` event handler
- WebRTC send helpers: `../../webrtc.js` around `session.sendPeers`, `session.sendMessage`, `session.sendRequest`
- Runtime-checked command/callback reference: `verified-api-command-and-callback-reference.md`
- Current implementation comparison: `runtime-comparison-audit.md`

## Which Surface Should the Native Plugin Use?

Primary runtime surface:
- Use `&api` WebSocket for the native Stream Deck plugin.
- Use the HTTP relay routes for awaited one-shot commands and raw WebSocket delivery for realtime or `value2` payloads.
- Use `getDetails`, updates, callbacks, and optional polling for state.

Secondary/dev surface:
- Use iframe `postMessage` only for embedded test pages or future custom mini-control surfaces.
- It is richer than the hotkey API but requires the plugin to own or communicate with an embedded browser/webview.

Advanced/relay surface:
- WebRTC/P2P data-channel calls are useful when a page already has peer connections and wants to send arbitrary peer data.
- The native plugin does not directly have those browser peer connections, so it should reach them through the `&api` action bridge or an iframe it controls.

## `&api` WebSocket / HTTP / SSE Surface

### Setup

Open the controlled VDO.Ninja page with an API key:

```text
https://vdo.ninja/?api=YOUR_KEY
https://vdo.ninja/mixer?room=ROOM&api=YOUR_KEY
```

WebSocket:

```json
{ "join": "YOUR_KEY" }
```

Then send commands:

```json
{ "action": "mic", "target": null, "value": "toggle" }
{ "action": "ptzZoom", "target": "1", "value": 0.1, "value2": "abs" }
```

HTTP:

```text
GET  https://api.vdo.ninja/{apiKey}/{action}
GET  https://api.vdo.ninja/{apiKey}/{action}/{value}
GET  https://api.vdo.ninja/{apiKey}/{action}/{target}/{value}
POST https://api.vdo.ninja/{apiKey}
```

POST body:

```json
{
  "action": "ptzZoom",
  "target": "1",
  "value": 0.5,
  "value2": "abs"
}
```

SSE:

```text
GET https://api.vdo.ninja/sse/{apiKey}
```

### WebSocket Server Behavior

The local `Companion-Ninja/server/oscninja.js` sample shows the bridge behavior:

- First message must contain `join`.
- HTTP requests add a generated `get` ID and wait up to 5 seconds.
- API callbacks with `callback.get` resolve the matching HTTP response.
- Messages are relayed to other WebSocket clients in the same API-key room.
- Optional `in` / `out` routing filters can isolate inbound/outbound relays.

### API Callback / Update Shapes

Typical command callback:

```json
{
  "callback": {
    "action": "mic",
    "value": "toggle",
    "result": false
  }
}
```

State update:

```json
{
  "update": {
    "streamID": "abc123",
    "action": "camera",
    "value": true
  }
}
```

`pokeAPI` events seen in local source include:
- `details`
- `director`
- `codirector`
- `seeding`
- `newViewConnection`
- `endViewConnection`
- `positionChange`
- `remoteMuted`
- `remoteVideoMuted`
- `directorMuted`
- `directorVideoHide`
- `hangup`
- `chat`
- `streamAdded`
- `tip`

Native plugin should accept unknown events, store them raw, and only derive UI state from validated fields.

For exact callback payloads, iframe response keys, and field meanings for `getDetails`, `getStats`, `getGuestList`, `getStreamIDs`, and `getStreamInfo`, use `verified-api-command-and-callback-reference.md`.

## `&api` Command Catalog

### Self / Local Commands

| Action | Value / options | Notes |
| --- | --- | --- |
| `speaker` | `true`, `false`, `toggle` | Incoming audio mute state. |
| `mic` | `true`, `false`, `toggle` | Local microphone. |
| `camera` / `video` | `true`, `false`, `toggle` | Local camera/video. |
| `volume` | `0` to `200`, `true`, `false` | API percent; local command converts to element volume. |
| `bitrate` | `true`, `false`, integer kbps | `true` resets/unlocks, `false` pauses, integer sets rate limit. |
| `panning` | `0` to `180`, center `90` | Requires relevant panning support enabled. |
| `record` | `true`, `false`, or element target | Local recording. |
| `hangup` | none | Disconnects local session. |
| `reload` | none | Reloads page. |
| `forceKeyframe` | none | Requests PLI/keyframe. |
| `togglehand` / `raisehand` | none | Hand status. |
| `togglescreenshare` | none | Browser will still prompt user. |
| `sendChat` / `sendChatMessage` | text | Sends chat. |
| `showChatOverlay` | text | Local overlay-style message. |
| `requestStats` | none | Detailed stats snapshot. |
| `getDetails` | optional stream ID | Full detailed state. |
| `getStats` | optional stream ID | Quick stats. |
| `getGuestList` | none | Positional guest list. |
| `startRoomTimer` | seconds | Room or target timer. |
| `pauseRoomTimer` | none | Lowercase spelling confirmed in current runtime. |
| `stopRoomTimer` | none | Timer stop/reset. |
| `tallylight` | `onair`, `active`, `standby`, `off`, integer | Tally override. |
| `prevSlide` | none | Slide back. Current local runtime does not define `previousSlide`. |
| `nextSlide` | none | Slide next. |
| `soloVideo` / `highlight` | `true`, `false`, `toggle`, target | Highlight video. |
| `activeSpeaker` | `toggle`, `false`, `1`, `2`, `3` | Enables/configures active speaker. |
| `setBufferDelay` | ms in `value`; optional stream ID/UUID/`*` in `target` or `value2` | Sets playback delay. `value2` remains supported; `target` now works through the targeted fallback path. |
| `layout` | `0`, integer, object/array | Mixer layout. |
| `width` / `height` | integer | Local/device constraints path. |
| `aspectRatio` | decimal or `16:9` | Local camera aspect ratio. |
| `videoConstraint` | constraint name + `value2` | Requires POST/WSS for `value2`. |

### Local PTZ Commands

| Action | Value | `value2` |
| --- | --- | --- |
| `zoom` | relative decimal or absolute 0..1 | `abs` for absolute |
| `focus` | relative decimal or absolute 0..1 | `abs` when supported |
| `pan` | relative decimal or absolute -1..1 | `abs` when supported |
| `tilt` | relative decimal or absolute -1..1 | `abs` when supported |
| `exposure` | 0..1 | local-only in current docs |

### Director / Guest Commands

| Action | Target | Value |
| --- | --- | --- |
| `forward` | guest slot or stream ID | destination room |
| `addScene` | guest slot, stream ID, or UUID | scene ID/name; optional boolean in `value2` for explicit state |
| `setScene` | guest slot, stream ID, or UUID | scene ID/name in `value`, boolean state in `value2` |
| `activateQueuedGuest` | guest slot, stream ID, or UUID | none |
| `muteScene` | guest slot or stream ID | optional boolean/toggle; current source does not use `value` as a scene selector |
| `group` | none or guest | group ID |
| `joinGroup` / `leaveGroup` | none | group ID |
| `viewGroup` / `joinViewGroup` / `leaveViewGroup` | none | group ID |
| `mic` | guest | `true`, `false`, `toggle`, or none |
| `speaker` | guest | `true`, `false`, `toggle`, or none |
| `display` | guest | optional boolean/toggle |
| `volume` | guest | `0` to `200` |
| `hangup` | guest | none |
| `soloChat` | guest | none |
| `soloChatBidirectional` | guest | none |
| `sendDirectorChat` / `sendPinnedDirectorChat` | guest | text |
| `forceKeyframe` | guest | none |
| `soloVideo` | guest | optional boolean/toggle |
| `mirror` / `mirrorGuest` / `remoteMirror` | guest | `true`, `false`, `toggle` |
| `rotate` | guest | `true`, `false`, `90`, `180`, `270` |
| `channel` / `pgm` | guest | `0`, `1`, `2` |
| `mixorder` | guest | `-1` or `1` |
| `refreshVideo` / `refreshCamera` | guest | none |
| `refreshConnection` / `restartConnection` | guest | none |
| `recoverStream` / `refreshAll` | guest | none |
| `requestResolution` | guest | `WIDTHxHEIGHT` |
| `requestAspectRatio` | guest | decimal or `16:9`; `value2` can carry max dimension |
| `setWidth` / `setHeight` / `setAspectRatio` | guest | capture constraint value |

### Guest PTZ Commands

Use these for director/co-director guest camera control:

| Action | Target | Value | `value2` |
| --- | --- | --- | --- |
| `ptzZoom` / `remoteZoom` | guest | decimal | `abs` optional |
| `ptzFocus` / `remoteFocus` | guest | decimal | `abs` optional |
| `ptzPan` / `remotePan` | guest | decimal | `abs` optional |
| `ptzTilt` / `remoteTilt` | guest | decimal | `abs` optional |
| `ptzAutofocus` / `remoteAutofocus` / `resetAutofocus` | guest | `true`, `false`, `manual`, `off` | none |

Important: plain `zoom`, `focus`, `pan`, `tilt`, and `exposure` are local commands, not guest-targeted director commands.

## Detailed State Model

`getDetailedState` builds state on demand from live session and DOM state. It is not a persistent scene database.

Per remote stream fields observed locally:

| Field | Meaning |
| --- | --- |
| `streamID` | Stable stream identifier. |
| `UUID` | Live internal peer UUID when the entry represents an inbound remote stream. Prefer it for current-session API targeting when available. |
| `label` | User label when available. |
| `group` | Current group membership. |
| `chunkedBufferDefault`, `chunkedBufferOverride`, `chunkedBufferRequested`, `chunkedBufferCeil`, `chunkedBufferAdaptive` | Chunked/WebCodecs buffer state. |
| `miscellaneous` | `stats.info` payload when present. |
| `layout`, `slot` | Layout/slot state. |
| `featured` | Solo/highlight state. |
| `iframeSrc` | Embedded iframe source if present. |
| `localStream` | `false` for remote streams. |
| `muted` | Remote mute state. |
| `videoMuted` | Remote video mute state. |
| `activeSpeaker`, `defaultSpeaker` | Audio activity/default speaker flags. |
| `videoVisible`, `videoVolume`, `iframeVisible` | DOM/media element state. |
| `director` | Whether UUID is in director list. |
| `position` | Director UI position/slot. |
| `scenes` | Map of scene ID/name to boolean, read from add-to-scene controls. |
| `others` | Map of other director UI action states, including queue, hand, mute/hide, solo states. |

Local stream fields observed locally:

| Field | Meaning |
| --- | --- |
| `label`, `meta`, `group`, `groupView`, `scene`, `streamID`, `iframeSrc` | Local identity/context. |
| `director` | Current director state. |
| `localStream` / `localstream` | Local marker. |
| `seeding` | Publishing/seeding state. |
| `muted`, `videoMuted`, `speakerMuted` | Local audio/video/speaker states. |
| `videoVisible` | DOM visibility. |
| `position`, `slot` | Director UI position/slot when applicable. |
| `meshcast`, `layout` | Session layout/routing state. |
| `outbound` | Outbound stats when available. |
| `screenSharing` | Screenshare state when notifications are enabled. |
| `audioTrack`, `videoTrack` | Local track presence. |
| `scenes`, `featured` | Local director scene/highlight state when applicable. |

`getGuestList` returns a position-keyed map:

```json
{
  "1": { "streamID": "abc123", "label": "Guest name" },
  "2": { "streamID": "directorStream:s", "label": "Screen" }
}
```

Native plugin state normalization:
- Keep raw `getDetails` snapshots.
- Build dropdown choices from `getGuestList` and stream state.
- Prefer stream IDs for persistence; allow slot numbers for easy setup.
- Derive effective guest mic/camera state from both base state and director override fields in `others`.
- Rebuild state after `positionChange`, `newViewConnection`, `endViewConnection`, `details`, `seeding`, and `streamAdded`.

## Iframe `postMessage` Surface

Iframe setup:

```javascript
iframe.allow = "camera;microphone;fullscreen;display-capture;autoplay;";
iframe.src = "https://vdo.ninja/?room=ROOM&cleanoutput";
iframe.contentWindow.postMessage({ mic: "toggle" }, "*");
```

Always validate `e.source === iframe.contentWindow` when receiving messages.

### Iframe Events

Connection/events documented or seen in examples:
- `guest-connected`
- `view-connection`
- `director-connected`
- `director-share`
- `scene-connected`
- `slot-updated`
- `push-connection`
- `joining-room`
- `rejected`
- `dataReceived`
- `chat`
- callback payloads with `cib`

### Iframe Command Catalog

| Category | Calls |
| --- | --- |
| Audio | `mic`, `mute`, `speaker`, `volume`, `panning`, `targetAudioBitrate`, `audiobitrate`, `PPT` |
| Video | `camera`, `pauseinvisible`, `keyframe` |
| Stream management | `requestStream`, `close`, `hangup` |
| Recording | `record` |
| Groups | `groups`, `groupView` |
| Bitrate/quality | `bitrate`, `targetBitrate`, `manualBitrate`, `scale`, `targetWidth`, `targetHeight` |
| Devices | `changeVideoDevice`, `changeAudioDevice`, `changeAudioOutputDevice`, `getDeviceList` |
| Layout/display | `layout`, `previewMode`, `slotmode`, `advancedMode`, `toggleSettings`, `target` with add/remove/replace/settings |
| Data/messaging | `sendData`, `sendChat`, `sendMessage`, `sendRequest`, `sendPeers`, `sendRawMIDI` |
| Stats/monitoring | `getStats`, `getFreshStats`, `getRemoteStats`, `requestStatsContinuous`, `getLoudness`, `getStreamIDs`, `getStreamInfo`, `getDetailedState`, `getGuestList` |
| Utility | `reload`, `style`, `function`, `saveVideoFrameToDisk`, `getVideoFrame`, `copyVideoFrameToClipboard`, `getSnapshotBySlot`, `getSnapshotByStreamID` |
| Advanced | `sceneState`, `layouts`, `obsCommand`, `setBufferDelay`, `automixer`, `enableYouTube`, `nextSlide`, `prevSlide`, `getFaces`, `faceTrack`, `getEffectsData`, `action` |

The generic iframe `action` call bridges to Companion-style API actions:

```javascript
iframe.contentWindow.postMessage({
  action: "rotate",
  target: "1",
  value: 90
}, "*");
```

For callback-capable iframe calls, include `cib`:

```javascript
iframe.contentWindow.postMessage({ getDetailedState: true, cib: "state-1" }, "*");
```

Then match `e.data.cib`.

Security notes:
- Replace `"*"` with a specific origin where possible.
- Do not expose `function: "eval"` in any native plugin UI.
- Treat `style`, `function`, `routeMessage`, and raw data senders as advanced/dev-only.

## WebRTC / P2P Data-Channel Surface

The iframe API exposes WebRTC data-channel routing:

| Iframe call | Runtime path | Direction |
| --- | --- | --- |
| `sendData` | `session.sendGenericData(...)` | Generic P2P payload; received as `dataReceived`. |
| `sendMessage` | `session.sendMessage(...)` | Message to viewer-side peer connections. |
| `sendRequest` | `session.sendRequest(...)` | Request to publisher-side peer connections. |
| `sendPeers` | `session.sendPeers(...)` | Broadcast to connected peers. |
| `sendRawMIDI` | `sendRawMIDI(...)` | MIDI payload to one/all peers. |

Targeting options:
- `UUID`
- `streamID`
- no target for all applicable peers
- `type` for `sendData` connection class, with examples using `pcs` or `rpcs`

Payload best practices from local docs:
- Put plugin-specific data under a namespace, e.g. `{ vdoStreamDeck: { ... } }`.
- Include a `type` field.
- Include timestamps for ordering.
- Keep payloads small.
- Track connections from iframe events so target UUID/stream ID mappings stay current.

Native plugin implication:
- The Stream Deck plugin should not send direct WebRTC data unless it runs an iframe/webview that owns the VDO.Ninja page.
- For normal native operation, send API actions over `&api` WebSocket/POST.
- Advanced future feature: optional "embedded controller page" that uses iframe `postMessage` to expose full P2P data-channel calls.

## Stream Deck Control Mapping

### Keys

Use for:
- Toggles: mic, camera, speaker, record, screen share, hand.
- Mode/action buttons: layout, scene, group, solo, hangup, transfer.
- Target selection: guest slot, stream ID, director/local.
- Status buttons: connection, stats, guest state.

### Dials / Encoders / Touch Strip

There are no physical sliders on current Stream Deck hardware reviewed. Use dials and touch strips as slider-like controls:

| Control | Suggested VDO action |
| --- | --- |
| Local volume | `volume` |
| Guest mic volume | `volume` with target |
| Audio pan | `panning` |
| Bitrate | `bitrate` |
| Buffer delay | `setBufferDelay` |
| Local zoom/focus/pan/tilt/exposure | `zoom`, `focus`, `pan`, `tilt`, `exposure` |
| Guest PTZ | `ptzZoom`, `ptzFocus`, `ptzPan`, `ptzTilt`, `ptzAutofocus` |
| Scene/group selector | dial rotates selection, push applies action |

Dial push options:
- Reset to default.
- Toggle autofocus.
- Cycle controlled PTZ axis.
- Toggle local/selected guest target.
- Apply selected scene/group/layout.

## Implementation Priorities

1. Mirror Companion v2.5.0 actions, feedbacks, variables, and dynamic presets.
2. Add guest-targeted PTZ actions that Companion does not fully expose as first-class actions.
3. Add dials for PTZ, volume, pan, bitrate, and buffer delay.
4. Add richer state and stats feedback.
5. Add custom command and target-selection workflows.
6. Add optional iframe/P2P tooling only after the WebSocket plugin is stable.
