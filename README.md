# VDO.Ninja Stream Deck Plugin

This folder is an isolated workspace for a native Elgato Stream Deck plugin for VDO.Ninja. It should stay self-contained until Steve explicitly approves changes elsewhere in the VDO.Ninja repo.

## Current Direction

Confirmed from local references:
- VDO.Ninja already exposes a remote API when a controlled page is opened with `&api=YOUR_KEY`.
- The API supports WebSocket, HTTP GET, HTTP POST, and SSE through `api.vdo.ninja`.
- `Companion-Ninja/` documents the command set and provides examples.
- `ptz.html` confirms the guest-targeted PTZ path should use `ptzZoom`, `ptzPan`, `ptzTilt`, `ptzFocus`, and `ptzAutofocus`, not plain local `zoom`/`pan`/`tilt`/`focus`.
- The existing Bitfocus Companion module is a useful action/feedback model, but this project should be a dedicated native Stream Deck plugin, not a Companion dependency.

Working assumption:
- The first real implementation should use the official Stream Deck SDK with a TypeScript/Node plugin, a persistent WebSocket client, and property inspectors for configuration.

## Proposed MVP

1. Connection action/status:
   - Global API key and optional API host.
   - Connect/reconnect to `wss://api.vdo.ninja:443`.
   - Button state shows connected, disconnected, timeout, or no VDO.Ninja page joined.

2. Local controls:
   - Mic, camera, speaker, volume, record, screen share, raise hand, reload, hangup, force keyframe, bitrate, buffer delay.

3. Director controls:
   - Guest mic/camera/speaker/display, guest volume, add/mute scene, group/view group, solo chat, solo video, hangup, transfer, force keyframe, mix order.

4. PTZ controls:
   - Button actions for nudges and presets.
   - Dial actions for zoom, pan, tilt, focus, exposure, and guest-targeted PTZ.
   - Dial push for autofocus or cycling the controlled parameter.

5. Feedback:
   - Use `getDetails`, `getGuestList`, `getStats`, and callbacks to update button titles/colors.
   - Surface guest labels, stream IDs, scene membership, mic/camera/speaker state, and basic stats.

6. Power-user action:
   - Custom VDO.Ninja API command action that can send arbitrary `{ action, target, value, value2 }`.

## Folder Contents

- `AGENTS.md` - project-specific guardrails for future work.
- `plugin/` - native Stream Deck plugin implementation.
- `docs/hardware-and-sdk-notes.md` - Stream Deck hardware and SDK notes.
- `docs/vdo-api-action-map.md` - VDO.Ninja command/action mapping for plugin design.
- `docs/companion-module-research.md` - Bitfocus Companion module behavior, parity baseline, and native enhancements.
- `docs/api-surfaces-and-state.md` - `&api`, iframe, WebRTC/P2P, and state reference for implementation.
- `docs/runtime-comparison-audit.md` - second-pass comparison against current VDO.Ninja signaling, callbacks, roomless links, transfer behavior, and custom scenes.
- `docs/verified-api-command-and-callback-reference.md` - runtime-checked command values, callback shapes, iframe responses, and state field meanings.
- `docs/onboarding-and-configuration-review.md` - Stream Deck plugin setup patterns, QR-code fit, VDO.Ninja setup wizard recommendations, and marketplace copy direction.
- `docs/professional-parity-and-no-regression-review.md` - Companion parity, GitHub request signals, professional workflow expectations, and release gates to avoid regression.
- `docs/plugin-architecture.md` - implementation shape, milestones, and open questions.
- `docs/streamdeck-plugin-build-plan.md` - concrete product/build plan with action classes, default profiles, milestones, and testing.

## Source Links

Primary local references:
- `../Companion-Ninja/httpwssapi.md`
- `../Companion-Ninja/README.md`
- `../Companion-Ninja/python_sample/readme.md`
- `../ptz.html`
- `../streamdeck.html`

External references used during initial review:
- Elgato Stream Deck SDK: https://docs.elgato.com/streamdeck/sdk/
- Stream Deck SDK getting started: https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/
- Bitfocus Companion VDO.Ninja module: https://github.com/bitfocus/companion-module-vdo-ninja
