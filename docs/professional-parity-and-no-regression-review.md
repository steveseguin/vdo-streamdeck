# Professional Parity and No-Regression Review

Review date: 2026-06-30.

This review asks whether the native Stream Deck plugin would be a regression for current VDO.Ninja + Bitfocus Companion users, and what must be true before the plugin is positioned as Marketplace-ready.

## Sources Checked

- Bitfocus VDO.Ninja module repo: https://github.com/bitfocus/companion-module-vdo-ninja
- Bitfocus VDO.Ninja module releases: https://github.com/bitfocus/companion-module-vdo-ninja/releases
- Original Companion module request: https://github.com/bitfocus/companion-module-requests/issues/293
- Current module feature requests/issues:
  - Stream ID variables: https://github.com/bitfocus/companion-module-vdo-ninja/issues/35
  - Guest mic feedback issue: https://github.com/bitfocus/companion-module-vdo-ninja/issues/27
  - Push-to-talk/missed inputs: https://github.com/bitfocus/companion-module-vdo-ninja/issues/19
  - Self-hosted VDO.Ninja/API host: https://github.com/bitfocus/companion-module-vdo-ninja/issues/17
  - Guest label variable: https://github.com/bitfocus/companion-module-vdo-ninja/issues/14
- Local comparison docs:
  - `companion-module-research.md`
  - `runtime-comparison-audit.md`
  - `verified-api-command-and-callback-reference.md`
  - `onboarding-and-configuration-review.md`
- Pro Stream Deck pattern references:
  - Elgato OBS Studio integration: https://help.elgato.com/hc/en-us/articles/360028239431-Elgato-Stream-Deck-OBS-Studio-Integration
  - BarRaider OBS Tools setup wizard: https://docs.barraider.com/faqs/obs-tools/getting-started/
  - StreamYard Stream Deck profile/hotkey workflow: https://support.streamyard.com/hc/en-us/articles/360061032132-Using-the-Elgato-Stream-Deck-with-StreamYard

## Executive Finding

The current native plugin MVP is not yet a Companion replacement. It is a useful foundation with better onboarding, connection handling, callback correlation, first-pass guest commands, and a raw custom-command escape hatch, but it currently ships only:

- Connection status/setup.
- Local control action.
- First-pass guest command action.
- Custom command action.

If released broadly in this state, professional Companion users would lose too much:

- Scene membership feedback.
- Dynamic guest label and stream ID titles.
- Director/guest presets.
- Variables/placeholders in actions.
- PTZ-specific actions/dials.
- Guest mic/camera/speaker feedback parity.

Therefore, the native plugin needs a no-regression release gate before Marketplace positioning.

## What Users Actually Want

### First-time / Casual Users

They want:

- A setup flow that explains `&api=KEY`.
- A generated VDO.Ninja URL they can open without manual URL editing.
- A visible connection test that says whether the VDO.Ninja page is actually answering.
- Safe defaults for local mic, camera, speaker, hand, record, and hangup.

Current native status: mostly covered by the setup-first property inspector and local controls.

### Director / Producer Users

They want:

- Guest labels on buttons.
- Guest slot and stream ID targeting.
- Mic/camera/speaker/display controls for each guest.
- Add/remove guest from scene with feedback.
- Solo video / solo talk / two-way solo talk.
- Send guest to group or transfer room.
- Guest volume and mute-scene.
- Queue/held guest visibility.
- Clear warning state when a guest disappears or a command times out.

Current native status: first-pass guest command, guest scene, and selected-target actions exist for common controls, but presets and broader feedback are still pending.

### Technical Operators

They want:

- Stats and health feedback.
- Keyframe, refresh video, refresh connection, recover stream.
- Bitrate and buffer delay controls.
- Audio panning and volume.
- Safe destructive controls with confirmation.
- Separate control of director page, clean output page, push page, and view page.

Current native status: partial local controls and connection health; most operator controls are planned.

### Camera / PTZ Operators

They want:

- Dedicated PTZ keys.
- Stream Deck + dial mappings for zoom, pan, tilt, focus, volume, bitrate, and buffer delay.
- Selected-target workflow so dials do not need one static guest each.
- Absolute and relative modes.
- Autofocus or control-cycle behavior on dial press.

Current native status: first-pass PTZ Key action exists for local and guest PTZ buttons. First-pass Stream Deck + PTZ Dial exists for local/guest relative PTZ with selected-target support, rate limiting, inversion, optional acceleration, guest autofocus press actions, and control cycling. Hold-to-repeat, packaged profiles, presets, and hardware smoke testing are still pending.

## Companion Feature Baseline

The native plugin should reach at least this baseline before being considered a non-regression:

| Area | Companion behavior | Native requirement |
| --- | --- | --- |
| Connection | API key plus custom/self-hosted WebSocket host. | Keep API key, host, TLS, timeout, and fallback settings. |
| Local controls | Mic, camera, speaker, volume, chat, record, reload, hangup, bitrate, panning, hand, screenshare, keyframe, slide controls, local PTZ. | First-class local action coverage, not only raw custom commands. |
| Guest controls | Forward/transfer, add scene, mute scene, group, mic, hangup, solo talk, speaker, display, overlay, keyframe, solo video, volume. | First-class guest command action and presets. |
| Feedbacks | Mic, camera, speaker, guest in scene. | Same feedback plus connection, timeout, stale stream, queue/held, hand raised, stats. |
| Variables | Director state; guest by position labels/mic/camera/scenes; stream ID variables. | Title templates and property inspector choices using labels, stream IDs, slots, and scene lists. |
| Presets | Dynamic director and guest presets. | Device-specific profiles plus dynamic target/title behavior. |
| PTZ | Added local PTZ actions in v2.4.0. | Local PTZ plus guest PTZ and Stream Deck + dial support. |
| Action variables | v2.5.0 supports variables in actions. | Target/value fields should allow tokens such as selected target, slot label, stream ID, scene ID, and custom text. |

## GitHub Request Signals

The public request/issue history points to these priorities:

1. Original Companion request explicitly asked for group-room scene add/remove with feedback, feed mute/unmute with feedback, director push-to-talk, and own camera toggle.
2. Self-hosted VDO.Ninja support was requested and later addressed in Companion; native plugin must not lose custom host support.
3. Guest labels and stream IDs as variables were requested because users build button titles and external workflows around them.
4. Guest mic feedback correctness matters beyond Guest 1/2; fixed-position assumptions are risky.
5. Push-to-talk/release reliability matters; a missed release leaves talent live when they should be muted.

## Common Pro Stream Deck Expectations

Across OBS, StreamYard, Companion-style workflows, and production control surfaces, professional users expect:

- Drag-and-drop action setup with clear property inspectors.
- Prebuilt profiles or presets, not a blank toolbox only.
- Dynamic titles/feedback so operators do not memorize which guest is where.
- Reliable press/release handling for push-to-talk and momentary actions.
- Immediate visual confirmation, plus durable state reconciliation from real app state.
- Separate actions for common workflows; raw custom commands are an escape hatch, not the main UX.
- Dials for continuous values on Stream Deck +.
- Safety guards for destructive operations.
- Support for multiple controlled endpoints in real productions.

## Current Native Plugin Gap Assessment

| Requirement | Current status | Regression risk |
| --- | --- | --- |
| Setup wizard | Implemented. | Low. Better than Companion for first-time setup. |
| API host/custom server | Implemented in settings. | Low. Must remain visible in advanced setup. |
| Connection state | Implemented with page-present distinction. | Low. Better than Companion. |
| Local mic/camera/speaker | Implemented. | Low. |
| Local PTT press/release | First-pass push-to-talk and push-to-mute implemented on `Local Control` mic with explicit key-down/key-up states; physical key/pedal release testing is pending. | Medium. |
| Local volume/panning/bitrate/buffer | First-pass Value Dial implemented for local volume, panning, bitrate, and buffer delay; hardware tests and per-stream buffer/bitrate targeting are pending. | Medium-low. |
| Director/guest actions | First-pass `Guest Command`, `Guest Scene`, and `Select Guest` actions implemented for common controls. | Medium until presets and richer stale/timeout states are done. |
| Scene feedback | First-pass `Guest Scene` action reads `getDetails[streamID].scenes`. | Medium until presets and stale-target states are done. |
| Dynamic labels/stream IDs | Implemented for guest command/scene/select titles and target pickers. | Medium until profile presets are done. |
| Variables/tokens in actions | Title tokens implemented for guest actions; command value tokens are still pending. | Medium. |
| Presets/profiles | Not implemented. | High. |
| PTZ keys/dials | First-pass PTZ Key and PTZ Dial actions implemented; presets/profiles and hardware smoke tests are pending. | Medium. |
| Multi-connection/named endpoints | Not implemented. | Medium-high. |
| Queue/held guest UX | Store can see `others`, but no action UI. | Medium-high. |
| Stats/operator health | Not implemented. | Medium. |

## No-Regression Release Gate

Do not present the plugin as a full Companion replacement or Marketplace-ready until these are implemented and tested:

1. Guest command action:
   - Target by slot, stream ID, UUID, selected target, first held guest.
   - Guest mic, camera, speaker, display, volume, hangup, solo video, solo talk, two-way solo talk, overlay/chat, group, transfer, keyframe, refresh/recover.
   - Current status: first-pass action supports slot, stream ID, selected guest, and first-held-guest targeting plus common commands. UUID/manual UI polish still needs work.

2. Guest scene action:
   - Arbitrary scene ID/name support.
   - Scene membership feedback from `getDetails[streamID].scenes`.
   - Custom scene explicit set-on/set-off through `addScene` + `value2=true/false` on current VDO.Ninja; older self-hosted pages only support toggle behavior.
   - Current status: first-pass action supports slot, stream ID, selected guest, and first-held-guest targeting; arbitrary scene IDs/names toggle through `addScene`; fixed scenes 1-8 and current custom scenes support force on/off.

3. Dynamic titles and target pickers:
   - Guest labels and stream IDs in dropdowns.
   - Title templates for slot, label, stream ID, scene, connection state, command result.
   - Stream ID variables/tokens usable in action value fields.

4. Momentary controls:
   - Press/release local mic for push-to-talk and push-to-mute.
   - Release-safe behavior: command queue/order guard so the final release state wins.
   - Visible warning if a release command times out.
   - Current status: first-pass local mic `pushToTalk` and `pushToMute` modes send explicit `mic=true/false` on key-down/key-up and use sequence guards for stale async completions. Physical Stream Deck/Pedal release testing is pending.

5. Presets/profiles:
   - Mini, 15-key, XL, Stream Deck +, and Pedal starter profiles.
   - Director profile with dynamic guest rows.
   - Stream Deck + profile with dials for selected target volume/PTZ.
   - Current status: first-pass Value Dial exists for local volume, panning, bitrate, buffer delay, and guest volume with selected-target support. Packaged profiles and physical dial verification are pending.

6. PTZ:
   - Local PTZ buttons.
   - Guest PTZ buttons.
   - Stream Deck + dial actions for zoom, pan, tilt, focus, exposure where supported, guest autofocus, and control cycling.
   - Current status: first-pass PTZ Key supports local zoom/pan/tilt/focus/exposure and guest zoom/pan/tilt/focus/autofocus. First-pass PTZ Dial supports local/guest relative PTZ turns, selected-target support, guest autofocus press actions, inversion, optional acceleration, and rate-limited sends. Hold-to-repeat, profiles, presets, and physical Stream Deck + verification are pending.

7. State and feedback:
   - Mic/camera/speaker feedback for local and all guest positions.
   - Guest-in-scene feedback.
   - Held/queued and hand-raised feedback.
   - Stale/missing target state.
   - Command timeout/error feedback.

8. Multi-page production support:
   - Named connections for director room, guest push page, clean output page, and backup room.
   - Per-action connection override.
   - Continue warning against same API key on multiple pages unless broadcast control is intended.

## Implementation Priority

### P0: Avoid Professional Regression

- Guest command action.
- Guest scene action.
- Dynamic titles/target picker.
- Momentary local mic controls.
- Presets for 15-key and XL.

### P1: Beat Companion

- Stream Deck + dial controls.
- Guest PTZ.
- Selected target workflow.
- Better setup wizard and QR/link tooling.
- Stale/timeout states.

### P2: Advanced Production

- Named connections.
- Stats display.
- Multi-page profile packs.
- Optional iframe-backed advanced controls for device selection, loudness, frames, and P2P helpers.

## Current Product Positioning

Use this wording until the release gate is passed:

```text
Early native VDO.Ninja Stream Deck plugin prototype. Provides setup, connection status, local controls, selected guest targeting, guest commands, guest scene toggles, PTZ keys, first-pass PTZ/value dials, and custom commands. Companion-parity presets, hardware dial verification, and broader dynamic feedback are still in progress.
```

Do not use:

```text
Full replacement for Bitfocus Companion VDO.Ninja.
```
