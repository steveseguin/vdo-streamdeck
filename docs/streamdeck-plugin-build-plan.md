# VDO.Ninja Stream Deck Plugin Build Plan

Planning date: 2026-06-30.

This is the concrete plan for a native Elgato Stream Deck plugin dedicated to VDO.Ninja. It assumes no changes outside `vdo-streamdeck/` until Steve explicitly approves them.

## Product Goal

Build a Marketplace-ready native Stream Deck plugin that controls VDO.Ninja pages opened with `&api=KEY`.

The plugin should:

- Mirror the practical Bitfocus Companion VDO.Ninja module workflow.
- Add first-class Stream Deck dials/touch-strip handling for PTZ, volume, pan, bitrate, and buffer delay.
- Make director and co-director operation faster than generic custom commands.
- Keep an escape hatch for raw VDO.Ninja commands.
- Provide useful feedback from `getDetails`, `getGuestList`, callbacks, and live API updates.

Primary transport is VDO.Ninja's `&api` WebSocket. Iframe/P2P controls stay documented as future/advanced mode unless the plugin later owns an embedded controller page.

## No-Regression Release Gate

The current native plugin is an early MVP, not yet a full Companion replacement. Do not position it as Marketplace-ready until it passes the no-regression checklist in `professional-parity-and-no-regression-review.md`.

Minimum gate:

- First-class guest command action with slot, stream ID, UUID, selected-target, and first-held-guest targeting. First-pass implementation covers slot, stream ID, selected guest, and first-held-guest targeting; UUID/manual UI polish remains.
- First-class guest scene action with arbitrary scene IDs/names and scene membership feedback.
- Dynamic titles and target pickers using guest labels, stream IDs, slots, and scene lists.
- Token support in action values/titles so stream IDs and labels can be reused like Companion variables.
- Momentary mic controls for push-to-talk/push-to-mute with release-safe ordering.
  First-pass implementation exists in `Local Control` via `pushToTalk` and `pushToMute`; physical key/pedal release testing is pending.
- Presets/profiles for at least 15-key and XL director workflows.
- Local and guest PTZ actions; Stream Deck + PTZ Dial hardware verification before claiming production dial support.
- Feedback parity for mic, camera, speaker, and guest-in-scene across all guest positions.
- Stale/missing target, timeout, and command error states.
- Clear support path for self-hosted/custom API host and separate API keys per controlled page.

## Onboarding Goal

The plugin should not assume users already know VDO.Ninja's `&api` parameter. The connection action/property inspector should guide first-time setup:

- Explain that VDO.Ninja is free, browser-based, and does not require a login.
- Generate a private API key.
- Build common VDO.Ninja URLs with the API key already appended.
- Support director room, push link, view link, scene/clean output, and custom URL setup.
- Provide copy/open URL controls.
- Optionally show a QR code for generated push/guest/mobile links.
- Run a `getDetails` connection test and distinguish "relay reachable" from "VDO.Ninja page answering".
- Warn that one API key should map to one controlled page/session unless broadcast control is intentional.

See `onboarding-and-configuration-review.md` for the comparison against other Stream Deck plugin setup patterns.

## Current SDK Assumptions

Use the official Elgato Stream Deck SDK with TypeScript/Node.

Current official docs checked:

- Node.js 24+ prerequisite.
- Stream Deck 7.1+ prerequisite.
- `create streamdeck` scaffolder.
- Plugin output as a `*.sdPlugin` folder with a manifest, compiled code, assets, UI/property inspector files, and logs.
- Dials use dedicated dial/touch events and separate touch-strip layouts.

Candidate plugin identity:

| Field | Candidate |
| --- | --- |
| Display name | `VDO.Ninja` |
| Category | `Video` |
| Identifier | `ninja.vdo.streamdeck` |

Do not lock the identifier until Marketplace submission rules are checked during packaging. Elgato plugin identifiers should be treated as effectively permanent once published.

## User Modes

The plugin should be designed around four practical modes:

| Mode | User | Main needs |
| --- | --- | --- |
| Local / Guest | A performer controlling their own VDO.Ninja page | Mic, camera, speaker, hand, screen share, record, chat, local PTZ. |
| Director | A producer running a room | Guest target selection, guest mic/camera/display, scenes, groups, solo talk, transfer, hangup, stats. |
| Technical Operator | Someone managing stream quality | Bitrate, buffer delay, keyframes, refresh/recover, stats, connection health. |
| PTZ Operator | Camera operator | Guest/local PTZ keys, dials, presets, autofocus, invert axes, selected target. |

## Implementation Shape

Expected package layout after scaffolding:

```text
vdo-streamdeck/
  plugin/
    package.json
    *.sdPlugin/
      manifest.json
      bin/
      imgs/
      ui/
      logs/
    src/
      plugin.ts
      api/
        vdo-client.ts
        command-registry.ts
        request-tracker.ts
        types.ts
      state/
        session-store.ts
        selectors.ts
      actions/
        connection-status.ts
        local-command.ts
        local-toggle.ts
        guest-command.ts
        guest-scene.ts
        selected-target.ts
        ptz-key.ts
        ptz-dial.ts
        value-dial.ts
        stats-display.ts
        custom-command.ts
      ui/
        property-inspector/
      test/
        fake-api-server.ts
        fixtures/
```

Keep the exact folder names aligned with the scaffolder output when implementation starts.

## Core Runtime Modules

### VdoClient

Responsibilities:

- Read global settings: API key, API host, HTTP fallback enabled, polling intervals.
- Connect to `wss://api.vdo.ninja:443` by default.
- Send `{ "join": apiKey }` on WebSocket open.
- Queue commands while reconnecting when safe.
- Add request/correlation IDs to commands for feedback-sensitive actions.
- Match `callback.get` or command callbacks to pending requests.
- Ingest async `update` events.
- Use the HTTP relay routes for awaited one-shot commands; use raw WebSocket delivery for realtime or `value2` payloads.
- Redact API keys from logs.
- Emit connection states: `missing-key`, `connecting`, `connected`, `no-page`, `timeout`, `disconnected`, `error`.

### Command Registry

The registry is the source of truth for actions and property inspector choices.

Each command definition should include:

```ts
type VdoCommandDefinition = {
	id: string;
	action: string;
	category: "local" | "guest" | "scene" | "group" | "ptz" | "stats" | "utility";
	label: string;
	target: "none" | "optional" | "required" | "value2";
	valueType: "none" | "toggle" | "boolean" | "number" | "text" | "select" | "json";
	value2Type?: "none" | "boolean" | "number" | "text" | "select";
	min?: number;
	max?: number;
	step?: number;
	feedback?: boolean;
	dangerous?: boolean;
	dialFriendly?: boolean;
	requiresDirector?: boolean;
	notes?: string;
};
```

Important registry rules:

- Use `prevSlide`, not `previousSlide`.
- Use lowercase `pauseRoomTimer`.
- For `setBufferDelay`, put milliseconds in `value`. Use `value2` for broad compatibility; current VDO.Ninja also accepts stream ID/UUID/`*` in `target`.
- For guest PTZ, use `ptzZoom`, `ptzPan`, `ptzTilt`, `ptzFocus`, and `ptzAutofocus`.
- Treat `muteScene` as a guest mute-scene toggle/set action, not as a scene selector.
- Keep Companion action names as labels/compatibility where helpful, not as the runtime VDO action if they differ.

### Session Store

State buckets:

| Bucket | Source |
| --- | --- |
| `connection` | WebSocket lifecycle and command timeouts. |
| `detailsRaw` | `getDetails` callbacks and `update.action == "details"`. |
| `guestList` | `getGuestList` callbacks and `positionChange` refreshes. |
| `streamsById` | Normalized from `getDetails`. |
| `slotsByPosition` | Normalized from `getGuestList`. |
| `selectedTarget` | Local plugin setting per profile/connection. |
| `statsByStream` | `getStats` polling for visible stats actions. |
| `lastCommand` | Per-action command result, timeout, and error. |

Derived flags:

| Flag | How to derive |
| --- | --- |
| `localMicMuted` | `details[local].muted` or `update.action == "muted"`. |
| `localCameraMuted` | `details[local].videoMuted` or `update.action == "videoMuted"`. |
| `localSpeakerMuted` | `details[local].speakerMuted` or `update.action == "speakerMuted"`. |
| `guestAudioMutedEffective` | `stream.muted` plus `stream.others["mute-guest"]` when present. |
| `guestVideoMutedEffective` | `stream.videoMuted` plus director hide/camera controls in `others`. |
| `guestInScene(scene)` | `stream.scenes[scene] === true`. |
| `guestHeldOrQueued` | `stream.others["remove-queue"] === true`. |
| `guestHandRaised` | `stream.others["hand-raised"] === true`. |
| `stale` | Last update or snapshot older than a configured threshold. |

Polling defaults:

| Poll | Default |
| --- | --- |
| `getDetails` | On connect, after join/leave/position/detail events, and every 2 seconds while feedback actions are visible. |
| `getGuestList` | On connect, when property inspector opens, after `positionChange`, and every 5 seconds while target dropdowns are visible. |
| `getStats` | Only while visible stats actions exist; default 2 to 5 seconds. |
| `requestStats` | Manual diagnostics only. |

## Action Classes

Keep the manifest action list high-level. Use settings and the command registry to avoid one manifest action per VDO command.

### 1. Connection Status

Purpose:

- Shows whether the plugin is connected to the API server and whether a VDO.Ninja page has joined the same key.
- Press action refreshes `getDetails`.
- Serves as the first-run setup wizard when no API key has been configured.

Settings:

- Connection profile/API key.
- Optional show room label or stream count.
- Link builder fields for room, push/view stream ID, scene ID/name, and custom URL.
- Setup helper controls: generate key, copy key, copy URL, open URL, show QR, test connection.

Feedback:

- Green: connected and page responding.
- Yellow: connected to API server but no page/details yet.
- Red: disconnected/error.
- Gray: missing API key.

### 2. Local Toggle

Commands:

- `mic`
- `camera` / `video`
- `speaker`
- `record`
- `togglescreenshare`
- `togglehand`
- `forceKeyframe`

Settings:

- Command.
- Press behavior: toggle, force on, force off.
- Hold behavior for push-to-talk/push-to-mute.

Feedback:

- Use command callback immediately.
- Confirm with next `getDetails`/update event.

Implementation status:

- First-pass `pushToTalk` and `pushToMute` implemented on the `Local Control` mic action.
- Key down sends explicit `mic=true` or `mic=false`; key up sends the inverse final state.
- Sequence guards prevent older async completions from repainting the key after a newer release.
- Still needs physical Stream Deck/Pedal release testing.

### 3. Local Command

Commands:

- `reload`
- `hangup`
- `sendChat`
- `showChatOverlay`
- `bitrate`
- `setBufferDelay`
- `tallylight`
- `activeSpeaker`
- `layout`
- `nextSlide`
- `prevSlide`
- local `zoom`/`focus`/`pan`/`tilt`/`exposure` as button nudges.

Settings:

- Command, value, value2.
- Dangerous command confirmation for reload/hangup.
- Optional double-tap or long-press requirement for destructive actions.

### 4. Guest Command

Commands:

- `mic`
- `camera`
- `speaker`
- `display`
- `volume`
- `hangup`
- `forward`
- `group`
- `soloChat`
- `soloChatBidirectional`
- `soloVideo`
- `forceKeyframe`
- `sendDirectorChat`
- `sendPinnedDirectorChat`
- `mirror`
- `rotate`
- `channel` / `pgm`
- `mixorder`
- `refreshVideo`
- `refreshConnection`
- `recoverStream`
- `requestResolution`
- `setWidth`
- `setHeight`
- `setAspectRatio`

Target modes:

- Guest slot.
- Stream ID.
- UUID.
- Selected target.
- First held/queued guest.

Feedback:

- Button title can use guest label/slot/stream ID.
- State uses normalized guest flags.
- Command rejection/timeout shows temporary warning state.

Implementation status:

- First pass implemented in `plugin/src/actions/guest-command.ts`.
- Supports slot, stream ID, selected guest, and first-held-guest targeting.
- Supports dynamic stream choices from `getDetails`/`getGuestList`.
- Supports title tokens `{slot}`, `{label}`, `{streamID}`, `{command}`, and `{state}`.
- Still needs UUID/manual UI polish, richer per-command value validation, and profile presets.

### 5. Guest Scene

Commands:

- `addScene`
- `addScene2` through `addScene8`
- `muteScene`

Settings:

- Target mode.
- Scene ID/name.
- Toggle/set on/set off.

Feedback:

- Scene membership from `details[streamID].scenes`.
- Mic-in-scene feedback for `muteScene` is weaker; treat it as command-result feedback unless a reliable state field is present.
- Custom scene IDs/names are supported as toggle operations through `addScene` with `value` set to the scene key. Explicit set-on/set-off is supported in current VDO.Ninja with `addScene` + `value2=true/false`, or `setScene`.

Implementation status:

- First pass implemented in `plugin/src/actions/guest-scene.ts`.
- Supports slot, stream ID, selected guest, and first-held-guest targeting.
- Supports arbitrary scene ID/name toggles through `addScene`.
- Supports force on/off without requiring current-month API extensions: fixed scenes use legacy aliases, while arbitrary scenes use observed scene state plus the legacy toggle and alert when state is unavailable.
- Uses scene membership from `getDetails[streamID].scenes` for button feedback.
- Property inspector scene choices include observed scene IDs/names plus fixed scenes 1-8.
- Still needs `muteScene`, richer stale-target display, and profile presets.

### 6. Group / View Group

Commands:

- `group`
- `joinGroup`
- `leaveGroup`
- `viewGroup`
- `joinViewGroup`
- `leaveViewGroup`
- guest `group`

Settings:

- Local vs guest.
- Group ID 1 through 8 or custom string.
- Toggle/join/leave mode.

### 7. Selected Target

Purpose:

- Let one key select the active guest used by other keys/dials.

Settings:

- Target source: fixed slot, fixed stream ID, next/previous guest, first held guest, or clear.
- Optional title template.

Feedback:

- Shows selected guest label/slot.
- Shows missing-target state when the selected stream ID is stale.

Implementation status:

- First pass implemented in `plugin/src/actions/select-guest.ts`.
- Selection is stored as a stream ID, not a slot. A fixed-slot select action resolves the current slot to a stream ID when pressed, so selected-guest actions follow that stream ID after position changes.
- `Guest Command` and `Guest Scene` can target `Selected guest`.
- Still needs active-speaker selection, richer stale-target visuals, and profile presets.

### 8. PTZ Key

Commands:

- Local: `zoom`, `focus`, `pan`, `tilt`, `exposure`.
- Guest: `ptzZoom`, `ptzFocus`, `ptzPan`, `ptzTilt`, `ptzAutofocus`.

Settings:

- Local or guest target.
- Axis.
- Relative step.
- Absolute preset value.
- Invert axis.
- Auto-repeat while held if SDK events allow.

Implementation status:

- First pass implemented in `plugin/src/actions/ptz-key.ts`.
- Local controls send `zoom`, `pan`, `tilt`, `focus`, or `exposure`.
- Guest controls send `ptzZoom`, `ptzPan`, `ptzTilt`, `ptzFocus`, or `ptzAutofocus` and support slot, stream ID, selected guest, and first-held targeting.
- Absolute mode sets `value2` to `abs`; relative mode sends signed numeric deltas.
- Guest focus can optionally send `ptzAutofocus: false` before the focus command.
- Guest exposure and local autofocus are blocked because the current VDO.Ninja API command paths do not expose those combinations.
- Still needs hold-to-repeat behavior and presets/profile layouts.

### 9. PTZ Dial

Dial rotation:

- Sends relative PTZ steps.
- Supports acceleration when turned quickly.
- Accumulates multiple dial ticks and rate-limits API sends to avoid flooding the VDO.Ninja relay.

Dial press:

- Guest autofocus on/off.
- Cycle axis/control.

Touch strip:

- Shows target label, axis/control, and recent movement/status using the encoder title/feedback APIs.

Implementation status:

- First pass implemented in `plugin/src/actions/ptz-dial.ts`.
- Supports local zoom/pan/tilt/focus/exposure and guest zoom/pan/tilt/focus.
- Uses slot, stream ID, selected guest, and first-held targeting for guest PTZ.
- Dial press/touch can cycle the active PTZ control or send guest autofocus on/off.
- Supports inversion, optional acceleration, configurable step size, and configurable send interval.
- Guest exposure is blocked because the current VDO.Ninja API command path does not expose it.
- Still needs hardware smoke testing on Stream Deck + / + XL, packaged profiles, and optional preset workflows.

Default dial mappings:

| Dial | Stream Deck + | Stream Deck + XL |
| --- | --- | --- |
| 1 | Selected target volume | Selected target volume |
| 2 | Zoom | Zoom |
| 3 | Pan/Tilt cycle | Pan |
| 4 | Focus/Autofocus | Tilt |
| 5 | N/A | Focus/Autofocus |
| 6 | N/A | Exposure/bitrate/buffer |

### 10. Value Dial

Commands:

- `volume`
- `panning`
- `bitrate`
- `setBufferDelay`
- guest `volume`

Settings:

- Command.
- Local/guest/selected target.
- Min/max/step.
- Push reset value.
- Touch-strip title template.

Implementation status:

- First pass implemented in `plugin/src/actions/value-dial.ts`.
- Supports local `volume`, `panning`, `bitrate`, and `setBufferDelay`.
- Supports guest `volume` with slot, stream ID, selected guest, and first-held targeting.
- Sends absolute values with min/max clamps, configurable step, reset value, inversion, optional acceleration, and rate limiting.
- Buffer delay supports default/future streams or all current inbound streams via `value2: "*"`.
- Still needs physical Stream Deck + / + XL hardware testing and follow-up per-stream buffer/bitrate targeting if operators need that workflow.

### 11. Stats Display

Purpose:

- Shows a compact health readout for a stream.

Data:

- `getStats` for lightweight feedback.
- `requestStats` only on press or diagnostics profile.

Display ideas:

- Bitrate.
- Packet loss if present.
- Resolution/fps if present.
- Audio loudness only in future iframe mode unless bridged over `&api`.
- Chunked buffer state from `getDetails`.

### 12. Custom Command

Purpose:

- Power-user escape hatch.

Settings:

- `action`
- `target`
- `value`
- `value2`
- Optional JSON mode.
- Optional title and success/failure colors.

Guardrails:

- Warn when targeting dangerous commands.
- Never log API key.

## Default Profiles

Profiles should be included as importable examples. Users can customize after install.

### Stream Deck Mini - 6 Keys

```text
+------------+------------+------------+
| Connection | Mic        | Camera     |
+------------+------------+------------+
| Speaker    | Record/Hand| Panic Page |
+------------+------------+------------+
```

Recommended behavior:

- `Record/Hand` defaults to hand for guests and record for directors via setting.
- `Panic Page` opens a folder with reload, hangup, and custom command.

### Stream Deck / 15 Keys

```text
+------------+------------+------------+------------+------------+
| Connect    | Mic        | Camera     | Speaker    | Record     |
+------------+------------+------------+------------+------------+
| Share      | Hand       | Layout 1   | Layout 2   | Stats      |
+------------+------------+------------+------------+------------+
| Select G1  | G1 Mic     | G1 Cam     | G1 Scene   | G1 Solo    |
+------------+------------+------------+------------+------------+
```

Alternative director profile:

- Bottom row uses selected target instead of hard-coded Guest 1.
- A folder holds Guest 1 through Guest 4 pages.

### Stream Deck Neo - 8 Keys

```text
+------------+------------+------------+------------+
| Connect    | Mic        | Camera     | Speaker    |
+------------+------------+------------+------------+
| Record     | Share      | Select     | Scene      |
+------------+------------+------------+------------+
```

Use the infobar for connection status, selected guest label, and last command result when supported by SDK profile assets.

### Stream Deck XL - 32 Keys

Director-first layout:

```text
+----------+----------+----------+----------+----------+----------+----------+----------+
| Connect  | LocalMic | LocalCam | Speaker  | Record   | Layout1  | Layout2  | Stats    |
+----------+----------+----------+----------+----------+----------+----------+----------+
| G1 Label | G1 Mic   | G1 Cam   | G1 Scene | G1 Talk  | G1 Solo  | G1 Vol   | G1 Hang  |
+----------+----------+----------+----------+----------+----------+----------+----------+
| G2 Label | G2 Mic   | G2 Cam   | G2 Scene | G2 Talk  | G2 Solo  | G2 Vol   | G2 Hang  |
+----------+----------+----------+----------+----------+----------+----------+----------+
| Select   | Group    | ViewGrp  | Transfer | Keyframe | Refresh  | PTZ Page | Custom   |
+----------+----------+----------+----------+----------+----------+----------+----------+
```

Add folders/pages for:

- Guests 3 through 8.
- Scenes 1 through 8.
- PTZ.
- Diagnostics.

### Stream Deck + - 8 Keys + 4 Dials

Keys:

```text
+------------+------------+------------+------------+
| Connect    | Mic        | Camera     | Record     |
+------------+------------+------------+------------+
| Select     | G Mic      | G Cam      | G Scene    |
+------------+------------+------------+------------+
```

Dials:

| Dial | Rotate | Press | Touch strip |
| --- | --- | --- | --- |
| 1 | Selected target volume | Reset to 100% | target + volume |
| 2 | Selected target zoom | Toggle absolute/relative | target + zoom |
| 3 | Pan/Tilt | Cycle pan/tilt | axis + step |
| 4 | Focus | Toggle autofocus | focus/autofocus |

### Stream Deck + XL - 36 Keys + 6 Dials

Use as the premium director/PTZ profile:

- Top keys: local/session controls.
- Middle keys: four guest rows or scene bank.
- Bottom keys: selected target, transfer, refresh/recover, groups, diagnostics, custom.
- Dials: volume, zoom, pan, tilt, focus/autofocus, exposure/bitrate/buffer.

### Stream Deck Pedal - 3 Footswitches

```text
+------------+------------+------------+
| PTT/Mic    | Cough/Speak| Marker/Rec |
+------------+------------+------------+
```

Alternative director pedal:

- Guest solo talk.
- Mute selected guest.
- Advance slide.

### Stream Deck Mobile / Virtual

Provide a key-only profile based on the 15-key profile. No dial-only features should be required for core workflows.

## Property Inspector Plan

### Global Settings

Fields:

- API key.
- API host, default `api.vdo.ninja`.
- Use secure WebSocket.
- HTTP request/response routing enabled for simple awaited commands; raw WebSocket delivery handles realtime and `value2` commands.
- Request timeout ms, default 5000.
- Details poll interval.
- Stats poll interval.
- Dangerous action mode: off, double-tap, long-press.
- Debug logging level.

### Action Settings

Common fields:

- Connection profile.
- Command mode/action.
- Target mode.
- Target value.
- Value mode.
- Value.
- Value2.
- Title template.
- Show last error.

Target modes:

- None/local.
- Slot number.
- Stream ID.
- UUID.
- Selected target.
- First queued guest.
- Active speaker.

Title template tokens:

| Token | Meaning |
| --- | --- |
| `{label}` | Stream label. |
| `{streamID}` | Stream ID. |
| `{slot}` | Guest slot. |
| `{state}` | Derived state label. |
| `{scene}` | Scene ID/name. |
| `{command}` | Command label. |
| `{value}` | Configured value. |
| `{lastResult}` | Last command result. |

## Feedback and Visual States

Use consistent colors across profiles:

| State | Color intent |
| --- | --- |
| Connected/on/active | Green. |
| Muted/off/disabled | Red or dark gray depending action. |
| Pending/connecting | Yellow. |
| Error/rejected/timeout | Red pulse or temporary warning icon. |
| Stale/missing target | Gray with warning title. |
| Dangerous armed | Orange/red until confirmed. |

Icon groups:

- Local audio/video.
- Guest controls.
- Scenes/groups.
- PTZ.
- Stats/diagnostics.
- Dangerous actions.

Use generated or custom bitmap icons for Marketplace polish later. During implementation, start with simple SDK-compatible SVG/PNG assets inside the plugin folder.

## Queue / Approval Plan

State:

- Detect queued/held guests from `getDetails[streamID].others["remove-queue"]`.
- Show "Held" / "Queued" state on guest label and selected target actions.

Control:

- Current VDO.Ninja exposes `activateQueuedGuest` over native `&api`, with `removeQueue` and `removeQueuedGuest` aliases.
- The plugin should pair this with the existing first-held-guest target mode, so a key can activate the next held guest without embedding an iframe.
- Older self-hosted pages can still detect held guests through `getDetails`, but activation requires a VDO.Ninja build that includes the native action.

This is a specific area where the native plugin can go beyond Companion while staying on the standard `&api` control path.

## Implementation Milestones

### Phase 1 - Scaffolding and Connection

Deliverables:

- Scaffold official SDK plugin under `vdo-streamdeck/plugin/`.
- Add build, lint, and test commands.
- Implement `VdoClient`.
- Implement fake API server for tests.
- Implement Connection Status action.
- Global settings: API key, host, timeout.

Acceptance:

- Plugin loads in Stream Deck.
- Connects to `wss://api.vdo.ninja:443`.
- Sends `join`.
- Shows connected/disconnected/missing-key states.
- Can send `getDetails` and display stream count.

### Phase 2 - Local Controls MVP

Deliverables:

- Command registry initial set.
- Local Toggle action.
- Local Command action.
- Custom Command action.
- State store for local mic/camera/speaker/seeding.

Commands:

- `mic`, `camera`, `speaker`, `record`, `togglescreenshare`, `togglehand`, `forceKeyframe`, `reload`, `hangup`, `sendChat`, `layout`, `nextSlide`, `prevSlide`.

Acceptance:

- Buttons update from callbacks and `getDetails`.
- Dangerous actions require configured confirmation.
- Custom command can send arbitrary action/target/value/value2.

### Phase 3 - Director Guest Controls

Deliverables:

- Guest target selector.
- Guest Command action.
- Guest Scene action.
- Selected Target action.
- Target dropdowns populated from `getGuestList`/`getDetails`.

Commands:

- guest `mic`, `camera`, `speaker`, `display`, `volume`, `addScene`, `muteScene`, `group`, `soloChat`, `soloChatBidirectional`, `soloVideo`, `hangup`, `forward`, `forceKeyframe`, `mirror`, `rotate`, `mixorder`, `refreshVideo`, `refreshConnection`, `recoverStream`.

Acceptance:

- Guest labels appear on keys.
- Guest mic/camera/scene feedback works for slot and stream ID targets.
- Guest join/leave/position changes refresh target mappings.

### Phase 4 - PTZ and Dials

Deliverables:

- PTZ Key action.
- PTZ Dial action.
- Value Dial action.
- Dial touch-strip layouts.

Commands:

- local `zoom`, `focus`, `pan`, `tilt`, `exposure`.
- guest `ptzZoom`, `ptzPan`, `ptzTilt`, `ptzFocus`, `ptzAutofocus`.
- `volume`, `panning`, `bitrate`, `setBufferDelay`.

Acceptance:

- Dials send smooth relative changes without flooding API.
- Dial press can reset/toggle autofocus/cycle axis.
- Guest PTZ works via selected target.
- Local PTZ works on supported devices.

### Phase 5 - Stats, Profiles, and Polish

Deliverables:

- Stats Display action.
- Default profiles for Mini, 15-key, Neo, XL, Stream Deck +, + XL, Pedal, Mobile.
- Icons and color themes.
- Setup guide and privacy note.
- Marketplace package validation.

Acceptance:

- Profile import works.
- Stats actions poll only when visible.
- API key is never logged.
- Documentation explains VDO.Ninja URL setup with `&api=KEY`.

## Testing Plan

Automated:

- Unit test command registry definitions.
- Unit test callback/update parser.
- Unit test target resolution and state selectors.
- Fake API server integration tests:
  - join flow.
  - command callback.
  - timeout.
  - async updates.
  - malformed messages.

Manual:

- Local VDO.Ninja page with `&api=KEY`.
- Director room with at least two guests.
- Slot changes and guest disconnect/reconnect.
- Guest mic/camera/scene feedback.
- PTZ commands using `ptz.html` reference values.
- Stream Deck + or + XL dial behavior.
- No-page and wrong-key states.

Marketplace smoke:

- Fresh Stream Deck install.
- Import profiles.
- Connect with a new API key.
- Verify no secret values appear in logs.

## Deferred / Requires Permission

These are useful but should not block MVP:

- Embedded iframe controller mode for iframe-only calls, P2P data, loudness, and frames.
- Multi-room/multi-API-key dashboards.
- SSE-only monitor mode.
- Preset PTZ positions if reliable state/position feedback becomes available.
- Rich stats graphs on touch strips.

## Open Decisions

| Decision | Default recommendation |
| --- | --- |
| Multiple API keys in v1? | No. Start with one global connection profile, design data model so multiple profiles can be added. |
| HTTP fallback? | Yes, optional and off by default for command paths that need reliable feedback. |
| Custom command in Marketplace build? | Yes, but with warnings and no unsafe raw WebSocket routing. |
| Queue activation in MVP? | Display queued state only. Add control after a VDO API action exists or embedded mode is approved. |
| Stats polling default? | Disabled unless a stats action is visible. |
| Dangerous command safety? | Double-tap by default for hangup, guest hangup, reload, transfer, recover stream. |

## Immediate Next Work

1. Add `muteScene` and group/view-group actions.
2. Add default profiles/presets for 15-key, XL, Stream Deck +, and Pedal.
3. Validate callbacks and live updates against a running VDO.Ninja page with room, push/view, scene, transfer-room, and PTZ-capable camera cases.
4. Smoke test PTZ Dial behavior on physical Stream Deck + / + XL hardware with a PTZ-capable VDO.Ninja setup.
5. Add richer stale-target and command-timeout visual states.

Completed implementation baseline:

- SDK plugin scaffold exists in `plugin/`.
- `VdoClient` connects to the `&api` WebSocket and correlates callbacks with `callback.get`.
- Connection Status, Local Control, Select Guest, PTZ Key, PTZ Dial, Value Dial, and Custom Command actions exist.
- Guest Command and Guest Scene actions exist with dynamic target pickers, selected guest targeting, and title tokens.
- State handling now matches the current runtime audit: full `getDetails` callbacks replace state, partial `details` updates merge, and join/leave/position events trigger refreshes.
- Tests cover command payloads, custom value parsing, and state normalization.
