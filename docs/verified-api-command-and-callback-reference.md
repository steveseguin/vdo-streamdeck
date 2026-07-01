# Verified VDO.Ninja API Commands, Values, and Callback Payloads

Research date: 2026-06-30.

This file is checked against the current local runtime source, not only the older Companion-Ninja notes. It is the working reference for the native Stream Deck plugin's command registry and state parser.

## Source Pointers

- `../../lib.js`
  - `pokeAPI`
  - `oscClient`
  - `processMessage`
  - `targetGuest`
  - `setupCommands`
  - `getQuickStats`
  - `getDetailedState`
  - `getGuestList`
  - `pokeIframeAPI`
- `../../main.js`
  - `session.remoteInterfaceAPI`
  - `postIframeAPIResponse`
  - iframe request/response handlers
- `../../webrtc.js`
  - `session.sendGenericData`
  - `session.sendPeers`
  - `session.sendMessage`
  - `session.sendRequest`
  - inbound peer message handlers that emit API/iframe updates
- `../../Companion-Ninja/server/oscninja.js`
  - reference API relay/server behavior

## API Transport and Routing

### Controlled Page Setup

Open the VDO.Ninja page with an API key:

```text
https://vdo.ninja/?api=YOUR_KEY
https://vdo.ninja/mixer?room=ROOM&api=YOUR_KEY
```

The page runs `oscClient()` when `session.api` is set. It connects to `session.apiserver`, sends:

```json
{ "join": "YOUR_KEY" }
```

When the socket opens, the page also sends a `details` update with `getDetailedState(session.streamID)`.

### Incoming Command Shape

Preferred WebSocket/POST command shape:

```json
{
  "action": "mic",
  "target": null,
  "value": "toggle",
  "value2": null
}
```

Dispatch rules in `processMessage`:

| Condition | Runtime path |
| --- | --- |
| `target` exists and is not `null` or `"null"` | `targetGuest(target, action, value, value2)` |
| no valid `target`, and `action` exists in `Commands` | `Commands[action](value, value2)` |
| `value` is string `"true"` or `"false"` | converted to boolean before dispatch |
| `value` is `null` or string `"null"` | treated as missing |
| `value2` missing | passed as `null` |

Use WebSocket or POST when `value2` matters. GET routes are useful for simple testing but are ambiguous for `target` and cannot cleanly carry structured layout objects.

### Target Resolution

`targetGuest` accepts:

| Target form | Notes |
| --- | --- |
| Guest slot/position | Numeric values under 100 are treated as one-based positions, then converted to zero-based lookup internally. |
| Stream ID | Resolved by scanning `session.rpcs[uuid].streamID` for many commands. |
| UUID | Used directly when it matches a `session.rpcs` key. |

For plugin persistence, prefer stream IDs or UUIDs. For user-friendly buttons, expose slot targeting and refresh the slot map with `getGuestList`/`getDetails`.

### WebSocket and HTTP Callback Shape

After an API command runs, the controlled page returns:

```json
{
  "callback": {
    "action": "mic",
    "value": "toggle",
    "result": false
  }
}
```

If the incoming command included `get`, the callback echoes it:

```json
{
  "callback": {
    "action": "getDetails",
    "get": "request-id",
    "result": {
      "streamIdHere": {}
    }
  }
}
```

Callback fields:

| Field | Meaning |
| --- | --- |
| `callback.action` | Echo of the requested action. |
| `callback.target` | Echo of the requested target when supplied. |
| `callback.value` | Echo of the normalized requested value when supplied. String `"true"`/`"false"` may have been converted to booleans before execution. |
| `callback.value2` | Echo of the requested secondary value when supplied. |
| `callback.get` | Optional request/correlation ID used by HTTP relays and any WebSocket client that wants request/response matching. |
| `callback.result` | Return value from `Commands[action]` or `targetGuest(...)`. This can be a boolean, number, string, object, or `false` on a failed target/action path. |

The sample API relay in `Companion-Ninja/server/oscninja.js` uses this `callback.get` field to resolve HTTP GET/POST/PUT requests. It waits up to 5 seconds. If there is no controlled page joined to that API key, it returns `failed`; if no callback arrives, it returns `timeout`.

Native plugin implication: treat relay `failed` as no controlled page and `timeout` as a command timeout. Do not present those strings as successful command results.

### Async Update Shape

The controlled page pushes live updates with `pokeAPI`:

```json
{
  "update": {
    "streamID": "abc123",
    "action": "remoteMuted",
    "value": true
  }
}
```

Known `pokeAPI` update actions in the current local source:

| Action | Meaning for plugin state |
| --- | --- |
| `details` | Snapshot or partial detailed state changed. Refresh/merge state. |
| `director` | Local page director state changed. |
| `codirector` | Local page became or stopped being a co-director. |
| `seeding` | Local publishing/seeding state changed. |
| `newViewConnection` | New viewer/inbound connection. Refresh details. |
| `endViewConnection` | Viewer/inbound connection ended. Remove or refresh the stream. |
| `positionChange` | Director UI/order/slot changed. Refresh details and guest list. |
| `remoteMuted` | Guest microphone state changed. |
| `remoteVideoMuted` | Guest video state changed. |
| `directorMuted` | Director-enforced guest audio mute changed. |
| `directorVideoHide` | Director-enforced guest video hide changed. |
| `muted` | Local microphone state changed. |
| `speakerMuted` | Local speaker/playback mute changed. |
| `videoMuted` | Local video/camera state changed. |
| `hangup` | Local page hung up. |
| `chat` | Chat message payload. |
| `streamAdded` | New local/remote stream track added. |
| `tip` | Tip/donation event payload. |

The plugin should accept unknown update actions and keep the raw payload for diagnostics.

## Local `&api` Commands

These commands run when no `target` is provided.

| Action | Values | Result / notes |
| --- | --- | --- |
| `raisehand` | none | Calls `raisehand()` and returns hand state. |
| `togglehand` | none | Alias of `raisehand`. |
| `togglescreenshare` | none | Calls `toggleScreenShare()` and returns `session.screenShareState`; browser permission prompts still apply. |
| `chat` | optional value | Toggles chat UI via `toggleChat(value)` and returns `session.chat`. |
| `speaker` | `true`, `false`, `"toggle"` | `true` un-mutes playback, `false` mutes playback; returns `session.speakerMuted`. |
| `mic` | `true`, `false`, `"toggle"` | `true` un-mutes local mic, `false` mutes; returns `session.muted`. |
| `camera` | `true`, `false`, `"toggle"` | `true` un-mutes local video, `false` mutes; returns `session.videoMuted`. |
| `video` | `true`, `false`, `"toggle"` | Alias of `camera`. |
| `hangup` | none | Calls `hangup()`; returns `true`. |
| `bitrate` | `false`, `true`, integer kbps | `false` becomes `0`, `true` becomes `-1`, integer is sent to each `session.requestRateLimit`; returns numeric value. |
| `requestStats` | none | Returns a broad stats object with local stats, `streamID`, WHIP/WHEP stats when present, and per-peer `pcs`/`rpcs` stats. |
| `getDetails` | optional stream ID in `value` | Returns `getDetailedState(value)`. |
| `getStats` | optional stream ID in `value` | Returns `getQuickStats(value)`. |
| `getGuestList` | none | Returns position keyed guest list. |
| `reload` | none | Calls `reloadRequested()`; returns `true`. |
| `volume` | `false`, `true`, integer percent | `false` becomes 0%, `true` becomes 100%, integer is divided by 100 and applied to inbound video elements. Plugin should clamp user UI even though source does not hard clamp. |
| `forceKeyframe` | none | Calls `session.forcePLI()`. |
| `panning` | `false`, `true`, integer | `true`/`false` both center to `90`; integer is applied to all inbound streams with `adjustPan`. |
| `record` | `true`, `false` | Starts/stops local video recording when `session.videoElement` exists. |
| `group` | group ID | Toggles local director group membership via `changeGroupDirectorAPI`. |
| `joinGroup` | group ID | Joins local group. |
| `leaveGroup` | group ID | Leaves local group. |
| `viewGroup` | group ID | Toggles local viewed group. |
| `joinViewGroup` | group ID | Starts viewing group. |
| `leaveViewGroup` | group ID | Stops viewing group. |
| `sendChat` | text | Sends chat; returns `true`. |
| `sendChatMessage` | text | Adds/sends local chat message; returns `true`. |
| `showChatOverlay` | text | Shows local overlay-style chat; returns `true`. |
| `startRoomTimer` | seconds | Starts global room timer. |
| `pauseRoomTimer` | optional value | Pauses/resumes global room timer. Current source uses lowercase `pauseRoomTimer`. |
| `stopRoomTimer` | optional value | Stops/resets global room timer. |
| `tallylight` | `onair`, `active`, `standby`, `off`, `false`, integer | Sets `session.tallyOverride` and applies scene state. |
| `prevSlide` | none | Sends the previous-slide MIDI command. Current local source does not define `previousSlide`. |
| `nextSlide` | none | Sends the next-slide MIDI command. |
| `zoom` | decimal | Local camera PTZ zoom. `value2` absolute only when `true`, `"true"`, or `"abs"`. |
| `focus` | decimal | Local camera focus. Same absolute values as `zoom`. |
| `pan` | decimal | Local camera pan. Same absolute values as `zoom`. |
| `tilt` | decimal | Local camera tilt. Same absolute values as `zoom`. |
| `exposure` | decimal | Local camera exposure. Same absolute values as `zoom`. |
| `soloVideo` | `true`, `false`, `"toggle"`, missing | Controls local/director highlight. |
| `highlight` | same as `soloVideo` | Alias of `soloVideo`. |
| `activeSpeaker` | missing, `"toggle"`, `"null"`, integer, falsy | Missing/toggle/null toggles; integer sets mode; falsy disables. |
| `setBufferDelay` | delay ms in `value`; target in `target` or `value2` | No target/`value2` sets default. `target` or `value2: "*"` applies all inbound streams. UUID or stream ID applies one inbound stream. |
| `layout` | `0`, `false`, integer, object, array, `null` | `0`/`false`/`null` select automixer. Integer is one-based user index and converted to zero-based. Object/array applies a custom layout. |
| `width` | integer | Local camera width constraint. |
| `height` | integer | Local camera height constraint. |
| `aspectRatio` | decimal or `16:9` | Local camera aspect ratio constraint. |
| `videoConstraint` | constraint name in `value`, constraint value in `value2` | Generic local camera constraint setter. Parses `"true"`, `"false"`, numbers, and aspect-ratio strings. |

Record note: current VDO.Ninja `record` does not implement a missing-value or `"toggle"` path. Generic Stream Deck "toggle" profiles should send `true` for a start-record button and use a separate `false` stop-record button until reliable recording state feedback exists.

## Guest-Targeted `&api` Commands

These commands run through `targetGuest(target, action, value, value2)` when `target` is provided.

| Action | Aliases / numeric ID | Values | Notes |
| --- | --- | --- | --- |
| `forward` | `transfer`, `0` | destination room | Calls `directMigrate`. |
| `addScene` | `1` | scene ID/name; optional `value2` boolean can force state | Defaults to scene `1` when value is missing/null/toggle. Existing missing-`value2` behavior is unchanged. `value=sceneId`, `value2=true/false` explicitly sets custom or fixed scene membership. |
| `setScene` | none | scene ID/name in `value`; boolean in `value2` | Idempotent scene membership helper. Missing `value` defaults to scene `1`; missing `value2` falls back to the existing toggle behavior. |
| `activateQueuedGuest` | `removeQueue`, `removeQueuedGuest` | none | Activates/removes the queued guest using the same director path as the existing remove-queue UI. |
| `muteScene` | `2` | optional `true`/`false` | Toggles or sets the guest `mute-scene` control. Current source does not use `value` as the scene selector. |
| `mic` | `audio`, `3` | `true`, `false`, missing/toggle | Controls director guest mic mute. |
| `hangup` | `4` | none | Hangs up target guest. |
| `soloChat` | `soloTalk`, `5` | optional `true`/`false` | One-way solo chat/talk. |
| `speaker` | `6` | optional `true`/`false` | Toggles/sets remote speaker. |
| `display` | `7` | optional `true`/`false` | Toggles/sets remote display/vision. |
| `group` | `8` | group ID, defaults to `1` | Toggles guest group membership. |
| `soloChatBidirectional` | `soloTalkBidirectional`, `9` | optional `true`/`false` | Two-way solo chat/talk. |
| `camera` | `video`, `10` | `true`, `false`, missing/toggle | Controls director guest video mute/hide. |
| `addScene2` through `addScene8` | `12` through `18` | optional `true`/`false` | Legacy scene-specific aliases; behavior is unchanged for compatibility. Prefer `addScene` + `value2=true/false` or `setScene` for idempotent state. |
| `forceKeyframe` | `19` | none | Requests keyframe from target guest. |
| `soloVideo` | `20` | optional `true`/`false` | Highlights/solos target video. |
| `sendChat` | `21` | text | Sends chat to the target. |
| `sendDirectorChat` | `22` | text | Sends director chat/overlay to target. |
| `sendPinnedDirectorChat` | none | text | Sends pinned director chat/overlay to target. |
| `volume` | `27` | integer percent | Sets target guest volume control. |
| `setslot` | `28` | slot value | Sets the guest slot. |
| `mixorder` | `29` | `true`, `false`, integer | `true` moves down/+1, `false` moves up/-1, integer is passed through. |
| `channel` | `pgm` | integer or null | Sets isolated channel/PGM routing. |
| `requestResolution` | none | `WIDTHxHEIGHT` | Requests preview/scene resolution from target. |
| `requestAspectRatio` | none | decimal or `16:9`; `value2` max dimension | Computes a `WIDTHxHEIGHT` request. Default max dimension is `1920`. |
| `setWidth` | none | integer | Requests target capture width constraint. |
| `setHeight` | none | integer | Requests target capture height constraint. |
| `setAspectRatio` | none | decimal | Requests target capture aspect ratio constraint. |
| `startRoomTimer` | none | seconds | Starts target guest timer. |
| `pauseRoomTimer` | none | none | Pauses/resumes target guest timer. |
| `stopRoomTimer` | none | none | Stops target guest timer. |
| `refreshVideo` | `refreshCamera` | none | Sends `{ refreshVideo: true }` to target. |
| `refreshConnection` | `restartConnection` | none | Sends `{ refreshConnection: true }` to target. |
| `refreshAll` | `recoverStream` | none | Sends `{ refreshAll: true }` to target. |
| `ptzZoom` | `remoteZoom` | decimal | Guest PTZ zoom. `value2` absolute when `true`, `"true"`, `"abs"`, `"absolute"`, `1`, or `"1"`. |
| `ptzPan` | `remotePan` | decimal | Guest PTZ pan. Same absolute values as `ptzZoom`. |
| `ptzTilt` | `remoteTilt` | decimal | Guest PTZ tilt. Same absolute values as `ptzZoom`. |
| `ptzFocus` | `remoteFocus` | decimal | Guest PTZ focus. Same absolute values as `ptzZoom`. |
| `ptzAutofocus` | `remoteAutofocus`, `resetAutofocus` | optional boolean/string | Enabled by default. Strings `0`, `false`, `off`, `manual`, `disable`, `disabled` disable autofocus. |
| `mirror` | `remoteMirror`, `mirrorGuest` | `true`, `false`, `on`, `off`, missing/toggle | Sets or toggles director mirror state for target. |
| `rotate` | `remoteRotate`, `rotateGuest` | missing/toggle, `false`, `reset`, degrees integer | Missing/toggle sends `true` to advance; `false`/`reset` resets; integer sets rotation value. |

If a targeted action is not matched by `targetGuest`, it falls back to `Commands[action](value, target)`. This is intentionally supported for `setBufferDelay`, so `target` can be a stream ID/UUID/`*` while `value` remains the delay in ms.

Custom scene nuance: `targetGuest("addScene", target, value)` without `value2` still toggles the scene control for backward compatibility. Use `addScene` with `value2=true/false`, or `setScene`, when explicit set-on/set-off is required for custom scenes.

## State and Snapshot Commands

### `getDetails`

`&api` command:

```json
{ "action": "getDetails" }
```

Iframe command:

```json
{ "getDetailedState": true, "cib": "optional-callback-id" }
```

Returns a map keyed by stream ID:

```json
{
  "guestStreamId": {
    "streamID": "guestStreamId",
    "label": "Guest",
    "group": ["1"],
    "localStream": false,
    "muted": false,
    "videoMuted": false
  },
  "localStreamId": {
    "streamID": "localStreamId",
    "localStream": true,
    "director": true
  }
}
```

Remote stream fields:

| Field | Meaning |
| --- | --- |
| `streamID` | Public stream ID for the inbound remote stream. |
| `UUID` | Live internal peer UUID for the inbound remote stream. Use this for the most reliable current-session API targeting when present. |
| `label` | Guest label, when available. |
| `group` | Guest group membership/state. |
| `chunkedBufferDefault` | Current default playout/chunk buffer delay in ms. |
| `chunkedBufferOverride` | Per-stream buffer override, or `false`. |
| `chunkedBufferRequested` | Effective requested buffer for the stream. |
| `chunkedBufferCeil` | Adaptive buffer ceiling, or `false`. |
| `chunkedBufferAdaptive` | Whether adaptive chunked buffer behavior is enabled. |
| `miscellaneous` | Raw `session.rpcs[UUID].stats.info`; includes guest-published metadata and feature flags. |
| `layout` | Layout object/state associated with the stream. |
| `slot` | Current slot number when slot mode/current slot data exists. |
| `featured` | Whether this stream is featured/solo/highlighted. |
| `iframeSrc` | Iframe source associated with the remote stream, when present. |
| `localStream` | `false` for remote entries. |
| `muted` | Remote sender microphone mute state as known by director/viewer. |
| `videoMuted` | Remote sender video mute state. |
| `activeSpeaker` | Whether the stream is currently considered actively speaking. |
| `defaultSpeaker` | Default speaker flag from session state. |
| `videoVisible` | DOM visibility of the stream video element. |
| `videoVolume` | Playback element volume, usually 0.0 to 1.0 but can be set higher by API. |
| `iframeVisible` | DOM visibility of the stream iframe, when present. |
| `director` | Whether the stream UUID is in `session.directorList`. |
| `position` | Director UI order/locked position when available. |
| `scenes` | Map of scene ID/name to boolean, read from add-to-scene controls. |
| `others` | Map of director UI control states by `data-action-type`; includes queue, hand, mute/hide, solo, order, and similar controls. |

Local stream fields:

| Field | Meaning |
| --- | --- |
| `label` | Local page label. |
| `meta` | Local metadata object. |
| `group` | Local talk group membership. |
| `groupView` | Local viewed groups. |
| `scene` | Local scene value. |
| `streamID` | Local stream ID. |
| `iframeSrc` | Local iframe source, when present. |
| `director` | Actual director state (`session.directorState`). |
| `localstream` | Deprecated local marker. |
| `localStream` | Current local marker. |
| `seeding` | Whether the page is publishing/seeding. |
| `muted` | Local microphone mute state. |
| `videoMuted` | Local camera/video mute state. |
| `speakerMuted` | Local playback/speaker mute state. |
| `videoVisible` | DOM visibility of local video element. |
| `position` | Local director UI position, if shown in guest list. |
| `slot` | Local slot if slot mode maps the local stream. |
| `meshcast` | Meshcast state/config. |
| `layout` | Current layout state. |
| `outbound` | Local outbound stats from `session.info.out`, when available. |
| `screenSharing` | Screen share state when screen-share notifications are enabled. |
| `audioTrack` | Whether local source has audio tracks. |
| `videoTrack` | Whether local source has video tracks. |
| `scenes` | Local director scene membership map when director UI exists. |
| `featured` | Local featured/highlighted state. |

Important: `getDetailedState` is built on demand from live session objects and DOM controls. It is not a separate persistent scene database.

### `getStats`

`&api` command:

```json
{ "action": "getStats" }
{ "action": "getStats", "value": "streamID" }
```

Iframe command:

```json
{ "getStats": true, "streamID": "optionalStreamID", "cib": "optional-id" }
```

Full response shape:

```json
{
  "streamID": "localStreamID",
  "inbound": {
    "guestStreamID": {}
  },
  "outbound": {
    "uuid": {}
  }
}
```

Fields:

| Field | Meaning |
| --- | --- |
| `streamID` | Local stream ID for the controlled page. |
| `inbound` | Map keyed by inbound remote stream ID, value is `session.rpcs[uuid].stats`. |
| `outbound` | Map keyed by outbound peer UUID, value is `session.pcs[uuid].stats`. |

If a stream ID is supplied, `getStats` returns only `stats.inbound[streamID]` or `null`.

Note: current source appears to reference `myStats` instead of `stats` for WHIP/WHEP in `getQuickStats`; do not rely on WHIP/WHEP fields from this quick path until tested.

### `requestStats`

`&api` command only:

```json
{ "action": "requestStats" }
```

Returns a broader object:

| Field | Meaning |
| --- | --- |
| local stats fields | Shallow copy of `session.stats`. |
| `streamID` | Local stream ID. |
| `whipStats` | `session.whipOut.stats`, when present. |
| `whepStats` | `session.whepIn.stats`, when present. |
| `pcs` | Map of outbound peer UUID to stats. |
| `rpcs` | Map of inbound peer UUID to stats, with `streamID` added. |

Use this for diagnostics or explicit stats pages. It is heavier than `getStats`.

### `getGuestList`

`&api` command:

```json
{ "action": "getGuestList" }
```

Iframe command:

```json
{ "getGuestList": true, "cib": "optional-id" }
```

Returns a position keyed map in visible director order:

```json
{
  "1": { "streamID": "abc123", "label": "Guest" },
  "2": { "streamID": "directorStream:s", "label": "Screen" }
}
```

Fields:

| Field | Meaning |
| --- | --- |
| object key | One-based visible position in `#guestFeeds`. |
| `streamID` | Guest, director, or director screen-share stream ID. |
| `label` | Label or empty string. |

### Iframe `getStreamIDs`

Iframe command only:

```json
{ "getStreamIDs": true, "cib": "optional-id" }
```

Response:

```json
{
  "streamIDs": {
    "streamID": "label"
  },
  "cib": "optional-id"
}
```

This only includes remote `session.rpcs` entries, not the local stream.

### Iframe `getStreamInfo`

Iframe command only:

```json
{ "getStreamInfo": true, "cib": "optional-id" }
```

Response:

```json
{
  "streamInfo": {
    "uuid": {
      "label": "Guest",
      "streamID": "abc123",
      "info": {}
    }
  },
  "cib": "optional-id"
}
```

Fields:

| Field | Meaning |
| --- | --- |
| object key | Internal connection UUID. |
| `label` | Remote label or `false`. |
| `streamID` | Remote stream ID or `false`. |
| `info` | Raw `session.rpcs[uuid].stats.info` or `{}`. |

This is likely what users mean by "getStreamDetails". In current local source the iframe name is `getStreamInfo`; the broader API snapshot command is `getDetails`/`getDetailedState`.

### Iframe `getDeviceList`

Iframe command only:

```json
{ "getDeviceList": true, "cib": "optional-id" }
```

Response:

```json
{
  "deviceList": [
    {
      "deviceId": "...",
      "kind": "videoinput",
      "label": "Camera"
    }
  ],
  "cib": "optional-id"
}
```

The values come from `enumerateDevices()` and follow browser `MediaDeviceInfo` fields.

### Iframe Guest Device Requests

Request:

```json
{
  "function": "getGuestMediaDevices",
  "target": "guestStreamOrSlotOrUUID",
  "cib": "optional-id"
}
```

Success response:

```json
{
  "guestMediaDevices": {
    "ok": true,
    "target": "abc123",
    "UUID": "uuid",
    "streamID": "abc123",
    "devices": [],
    "currentVideoLabel": "Camera",
    "currentAudioLabel": "Microphone",
    "currentSpeakerLabel": "Speaker"
  },
  "cib": "optional-id"
}
```

Error response includes:

| Field | Meaning |
| --- | --- |
| `ok` | `false`. |
| `error` | Reason, such as guest not found, timeout, or unable to request devices. |
| `target` | Requested target. |
| `UUID` | Target UUID when known. |
| `streamID` | Target stream ID when known. |
| `devices` | Empty list on timeout/errors. |

Device change request:

```json
{
  "function": "setGuestMediaDevice",
  "target": "guestStreamOrSlotOrUUID",
  "kind": "camera",
  "deviceId": "device-id",
  "cib": "optional-id"
}
```

Accepted kind aliases:

| Kind aliases | Normalized kind |
| --- | --- |
| `camera`, `video`, `videoinput` | `camera` |
| `microphone`, `mic`, `audio`, `audioinput` | `microphone` |
| `speaker`, `output`, `audiooutput` | `speaker` |

Response key is `guestMediaDeviceChange` with `ok`, `error`, `target`, `UUID`, `streamID`, `kind`, and `deviceId`.

### Iframe Queue Activation

Request:

```json
{
  "function": "activateQueuedGuest",
  "target": "guestStreamOrSlotOrUUID",
  "cib": "optional-id"
}
```

Response key is `queuedGuestActivation`:

| Field | Meaning |
| --- | --- |
| `ok` | `true` if the queue button was found and clicked. |
| `error` | Reason on failure, such as guest not found or activate button not found. |
| `target` | Requested target. |
| `UUID` | Target UUID when known. |
| `streamID` | Target stream ID when known. |

## Iframe Inbound Command Surface

The iframe API is wider than `&api`. It only applies when a parent page embeds/controls a VDO.Ninja iframe.

Common inbound commands checked in `main.js`:

| Command | Values / targeting | Response / notes |
| --- | --- | --- |
| `function: "targetGuest"` | `target`, `action`, `value`, `value2` | Calls the same `targetGuest` path. |
| `function: "commands"` | `action`, `value`, `value2` | Calls local `Commands[action]`. |
| `function: "routeMessage"` | `value` raw socket message | Passes raw value to `session.ws.onmessage`; dev only. |
| `function: "eval"` | JavaScript string | Dangerous; do not expose in plugin UI. |
| `sendData` | payload plus optional `UUID`, `streamID`, `type` | Calls `sendGenericData`; received by peer as `dataReceived`. |
| `PPT` | `true`, `false`, `"toggle"` | Push-to-talk style local mic control. |
| `sendChat` | text | Sends chat. |
| `mic` | `true`, `false`, `"toggle"` | Local mic. |
| `toggleSettings` | truthy/falsy/`"toggle"` | Settings menu. |
| `camera` | `true`, `false`, `"toggle"` | Local camera/video. |
| `pauseinvisible` | `true`, `false`, `"toggle"` | Pause hidden videos behavior. |
| `keyframe` | any | Sends keyframe for scenes. |
| `groups` | object/array preferred | Sets local groups and sends group message to peers. Current source has a singular/plural check quirk, so a plain comma string can clear groups unless a truthy `group` field is also present. Prefer object/array or the `&api` `group`/`joinGroup`/`leaveGroup` commands. |
| `groupView` | object/array or comma string | Sets viewed groups. |
| `mute` | `true`, `false`, `"toggle"` | Iframe speaker control, but its boolean semantics differ from `speaker`; prefer `speaker`. |
| `speaker` | `true`, `false`, `"toggle"` | Local playback/speaker mute. |
| `record` | `true`, `false`, or video element ID | Local recording. |
| `volume` | `0.0` to `1.0`, or percent fallback | Sets playback volume; optional `target`. |
| `enableYouTube` | key string or truthy | Starts YouTube chat integration. |
| `nextSlide` | any | Next slide. |
| `prevSlide` | any | Previous slide. |
| `panning` | integer; optional `UUID` | Adjusts pan for all inbound streams. Current source appears to reference `UUID` instead of `e.data.UUID` in the UUID branch, so test before relying on iframe UUID-targeted panning. |
| `targetBitrate` | kbps; optional `target`, `UUID`, `streamID`, `requestAs`, `remote` | Sends target bitrate request to publishers. |
| `targetAudioBitrate` | kbps; same targeting as `targetBitrate` | Sends target audio bitrate request. |
| `manualBitrate` | kbps; optional `target`, `UUID`, `streamID` | Sets manual bandwidth then requests rate limit. |
| `bitrate` | kbps; optional `lock`, `target`, `UUID`, `streamID` | Requests video rate limit. |
| `audiobitrate` | kbps; optional `lock`, `target`, `UUID`, `streamID` | Requests audio rate limit. |
| `changeVideoDevice` | device ID | Changes local camera device. |
| `changeAudioDevice` | device ID | Changes local microphone device. |
| `changeAudioOutputDevice` | device ID | Changes local speaker/output device. |
| `getDeviceList` | truthy | Returns `deviceList`. |
| `sceneState` | boolean | Sends OBS/tally-style scene state to peers. |
| `layouts` | layout list; optional `obsSceneTriggers` | Sets predefined layout data and forwards to layout peers. |
| `sendMessage` | object | Calls `session.sendMessage` to viewer-side peers. |
| `sendRequest` | object | Calls `session.sendRequest` to publisher-side peers. |
| `sendRawMIDI` | MIDI payload; optional `UUID`/`streamID` | Sends raw MIDI to peers. |
| `sendPeers` | object | Calls `session.sendPeers` to every peer. |
| `reload` | any | Reloads page. |
| `getFaces` | uses `faceTrack` | Enables/disables face data grab. |
| `getFreshStats` | any | Queries fresh outbound WebRTC stats and posts `stats` after about 1 second. |
| `getStats` | optional `streamID` | Posts `stats`. |
| `getRemoteStats` | any | Sends stats request to publishers. |
| `requestStatsContinuous` | boolean/rate value | Asks publishers for continuous stats. |
| `getLoudness` | `true`/false | Enables/disables loudness posts. Initial response has `action: "loudness"`, `mode: "snapshot"`. |
| `getEffectsData` | effect ID or `false` | Enables/disables ML/effects data pipeline. |
| `getStreamIDs` | truthy | Posts `streamIDs`. |
| `getStreamInfo` | any | Posts `streamInfo`. |
| `close` / `hangup` | `"estop"`, `"reload"`, or other | Hangs up/reloads local page. |
| `style` | CSS string | Injects style element; dev-only. |
| `getDetailedState` | any | Posts `detailedState`. |
| `getGuestList` | any | Posts `guestList`. |
| `saveVideoFrameToDisk` | optional `filename`, `streamID`, `UUID` | Saves video frame locally. |
| `getVideoFrame` | optional `streamID`, `UUID` | Posts image-frame response via helper. |
| `copyVideoFrameToClipboard` | optional `streamID`, `UUID` | Copies video frame locally. |
| `setBufferDelay` | ms; optional `streamID`, `label`, `UUID` or `UUID: "*"` | Sets inbound buffer delay. |
| `automixer` | boolean | Enables/disables automixer/manual mode. |
| `advancedMode` | boolean | Shows/hides advanced controls. |
| `requestStream` | stream ID | Requests a stream. |
| `layout` | layout object/array | Sets layout and may issue it if director. |
| `previewMode` | mode value | Switches preview mode. |
| `obsCommand` | command object; optional `remote`, `UUID`, `streamID` | Encodes and sends OBS command. |
| `slotmode` | integer/falsy | Updates slot mode. |
| `targetWidth` / `targetHeight` | pixels; requires `UUID` | Requests remote resolution. |
| `scale` | percent or `false`; optional `UUID`, `target` | Sends scale request. |
| `action` | any `&api` action | Bridges to `processMessage`; response is posted back when non-null. |
| `target` without `action` | stream ID or `*` plus `settings`, `add`, `remove`, `replace` | Direct DOM/video element manipulation path. |

Use `cib` for iframe request correlation. Many response helpers echo `cib`; pure control commands often do not return anything.

Iframe `action` bridge responses:

```json
{
  "action": "mic",
  "result": false,
  "cib": "optional-id"
}
```

If `processMessage` returns an object, that object is posted directly and `cib` is added when supplied. If it returns a primitive and `cib` was supplied, the response is wrapped as `{ "action": "...", "result": primitive, "cib": "..." }`. If the action throws and `cib` was supplied, the iframe posts `{ "action": "...", "error": true, "result": false, "message": "...", "cib": "..." }`.

## WebRTC / P2P Helper Behavior

These helpers are reachable from an iframe-controlled page. A native Stream Deck plugin should normally use `&api` unless it owns an embedded browser page.

| Helper | Direction | Targeting | Notes |
| --- | --- | --- | --- |
| `session.sendGenericData(data, UUID, streamID, type)` | generic P2P | optional UUID or streamID; `type` can be `rpcs`, `pcs`, or missing | Wraps payload as `{ pipe: data }`. Receiver posts `dataReceived` to iframe. |
| `session.sendPeers(data, UUID, exclude)` | all peer classes | optional UUID/exclude | Sends to `pcs` and `rpcs`, avoids double send, uses relay WSS when enabled. |
| `session.sendMessage(msg, UUID)` | viewer-side/outbound peers in `session.pcs` | optional UUID | Also uses relay WSS if enabled. |
| `session.sendRequest(msg, UUID, callback)` | publisher-side/inbound peers in `session.rpcs` | optional UUID | Optional callback adds `cbid` and times out after 5 seconds. |
| `session.anysend(data, peers)` | WebRTC then WSS fallback | `data.UUID` or all peers/server | Chooses WebRTC first when possible. |

`sendGenericData` receive path:

```json
{
  "dataReceived": {},
  "UUID": "sender-uuid"
}
```

Best practices for any future embedded controller:

- Namespace plugin payloads, for example `{ "vdoStreamDeck": { ... } }`.
- Keep payloads small.
- Include timestamps and message IDs.
- Track peer UUID to stream ID mapping from iframe events and state snapshots.
- Do not expose raw `sendMessage`, `sendRequest`, `routeMessage`, or `eval` in normal Marketplace UI.

## Stream Deck Plugin State Guidance

Recommended state model:

| State bucket | Source |
| --- | --- |
| connection state | WebSocket open/close/error and heartbeat/poll timers |
| raw details | `getDetails` callbacks and `update.action == "details"` |
| slot map | `getGuestList` and `positionChange` updates |
| stream choices | `getDetails`, `getGuestList`, `getStreamInfo` if iframe mode exists |
| local toggles | command callbacks plus `muted`, `videoMuted`, `speakerMuted`, `seeding` updates |
| guest toggles | `getDetails` fields plus `remoteMuted`, `remoteVideoMuted`, `directorMuted`, `directorVideoHide` updates |
| scene feedback | `getDetails[streamID].scenes` |
| queue/hand feedback | `getDetails[streamID].others["remove-queue"]` and `others["hand-raised"]` |
| stats feedback | `getStats` for lightweight polling; `requestStats` for diagnostics |
| loudness feedback | iframe-only `getLoudness` unless a future `&api` bridge is added |

Implementation rules:

- Treat callback `result` as the command result, not necessarily the final durable state.
- Merge async updates into the latest snapshot, but refresh full details after connection, guest join/leave, position change, `details`, `seeding`, and track/stream events.
- Normalize boolean strings before storing state.
- Preserve raw fields in a debug view because `miscellaneous` and stats fields vary by feature flags and browser support.
- Prefer `prevSlide`, not `previousSlide`, in VDO API payloads.
- Prefer lowercase `pauseRoomTimer`.
- For buffer delay over `&api`, use `value` for milliseconds. `target` and `value2` now both support stream ID/UUID/`*`; `value2` remains supported for older clients.
- Preserve explicit `false`/`0` in `value2`; these are valid secondary values and should not be collapsed to missing/null.
