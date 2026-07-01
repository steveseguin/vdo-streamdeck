# Plugin Architecture and Roadmap

See `streamdeck-plugin-build-plan.md` for the concrete product/build plan, action classes, default profiles, state model, and acceptance checks. This file is the higher-level architecture and roadmap summary.

## Recommended Architecture

Use the official Stream Deck SDK with TypeScript.

Future code layout:

```text
vdo-streamdeck/
  plugin/
    package.json
    manifest.json or *.sdPlugin/manifest.json
    src/
      plugin.ts
      api/
        vdo-client.ts
        command-registry.ts
        types.ts
      state/
        session-store.ts
      actions/
        local-toggle.ts
        director-guest-action.ts
        ptz-dial.ts
        custom-command.ts
        connection-status.ts
      ui/
        property-inspector/
```

Keep the actual package shape aligned with whatever `npm create streamdeck@latest` generates at implementation time.

## Core Components

### VdoClient

Responsibilities:
- Store API host and API key from global settings.
- Connect to `wss://api.vdo.ninja:443`.
- Send `{ join: apiKey }` on open.
- Reconnect with backoff after disconnect/timeout.
- Send JSON commands with optional `target`, `value`, `value2`, and request IDs.
- Match callbacks to pending commands when possible.
- Provide HTTP POST fallback for one-shot commands when WebSocket is disconnected.
- Avoid logging the API key.

### Command Registry

Responsibilities:
- Define all supported commands in one place.
- Provide labels, categories, option schema, defaults, valid value ranges, and whether a command supports target/value/value2.
- Mark actions as local-only, director-only, guest-targeted, PTZ, dial-friendly, feedback-friendly, or dangerous.
- Generate property inspector choices from the same registry so UI and runtime do not drift.

### Session Store

Responsibilities:
- Keep the latest `getDetails`, `getGuestList`, and selected stats snapshots.
- Normalize guest slot, stream ID, label, scene membership, muted state, camera state, speaker state, and director flag.
- Let actions subscribe to the exact pieces of state they need.
- Debounce feedback updates so Stream Deck UI does not flicker during polling.

### Property Inspectors

Needed inspectors:
- Global connection settings: API key, API host, reconnect behavior, polling interval.
- Local action settings: command, value/toggle behavior.
- Guest action settings: target mode, guest slot, stream ID, scene/group number, message text.
- PTZ dial settings: local vs guest target, parameter, relative step, absolute range, invert pan/tilt, push behavior.
- Custom command settings: raw action/target/value/value2 JSON-friendly fields.

## Transport Strategy

MVP:
- Maintain one WebSocket connection per configured API key.
- Treat that API key as one controlled VDO.Ninja page/session for state feedback. The relay broadcasts to every page using the same key, and callbacks do not identify which page answered.
- Poll `getDetails` every 2 seconds while at least one feedback-capable action is visible.
- Poll `getGuestList` when property inspectors open and periodically while connected.
- Request `getStats` only for visible stats actions.

Later:
- Add SSE monitoring only if it provides lower-latency events not available through the WebSocket path.
- Add multi-profile/multi-room support by allowing multiple named API connections.
- Add true multi-page same-key aggregation only if VDO.Ninja exposes a stable page/session identity in callbacks or the plugin owns an iframe/controller page.

## Marketplace Considerations

Before submission:
- Confirm package naming and UUID with Elgato Marketplace requirements.
- Prepare icons at all required sizes.
- Add a privacy note: API keys remain local to Stream Deck settings and are only sent to the configured VDO.Ninja API host.
- Provide a setup-first property inspector: generate/copy an API key, build a VDO.Ninja URL with `&api=KEY`, open/copy the URL, optionally show a QR code, and test for a responding VDO.Ninja page.
- Explain in-product that VDO.Ninja is free, browser-based, and does not require a login.
- Include sample profiles for Mini, 15-key, XL, Stream Deck +, and Pedal.
- Include warnings for destructive actions such as guest hangup, transfer, reload, and recover stream.

Candidate plugin identity:
- Display name: `VDO.Ninja`
- Category: `Video`
- Plugin identifier placeholder: `ninja.vdo.streamdeck`

Do not treat this identifier as final until Marketplace rules are checked.

## Milestones

### Phase 0 - Reference workspace

- Create this folder and docs.
- Keep all work isolated from root VDO.Ninja source.
- Capture hardware, SDK, API, and Companion references.

### Phase 1 - Scaffold

- Run the official Stream Deck scaffolder inside `vdo-streamdeck/plugin/`.
- Add lint/build scripts.
- Add a minimal connection/status action.
- Verify the plugin loads in Stream Deck locally.

### Phase 2 - Core controls

- Implement local mic/camera/speaker/record/reload/hangup/screen share.
- Mirror the current Bitfocus Companion v2.5.0 local action set before adding native-only actions.
- Add global settings and connection status feedback.
- Add `getDetails` polling and local state feedback.

### Phase 3 - Director and guest controls

- Add guest target selector and guest list refresh.
- Implement guest mic/camera/speaker/display, scene, group, volume, solo talk, hangup, transfer.
- Add dynamic titles from guest labels.
- Mirror Companion feedbacks and variables: mic, camera, speaker, guest-in-scene, guest labels, stream IDs, and scene lists.

### Phase 4 - PTZ and dials

- Add local PTZ button/dial controls.
- Add guest-targeted `ptz*` controls.
- Add presets and push behavior.
- Validate on Stream Deck + or + XL hardware.
- Treat dials as slider-like controls for volume, audio pan, bitrate, buffer delay, and PTZ.

### Phase 5 - Profiles and marketplace polish

- Create default profiles for Mini, 15-key, XL, Stream Deck +, + XL, and Pedal.
- Add marketplace icons, README, setup guide, and privacy notes.
- Package and validate with current Stream Deck tooling.

## Open Questions

- Should the plugin support multiple VDO.Ninja API keys at once, or should users duplicate profiles per room?
- Should API keys live in global settings only, or can individual actions override the connection?
- Should the plugin expose an "unsafe action confirmation" setting for hangup/transfer/reload?
- How much of `requestStats` should be exposed by default without creating noisy polling?
- What is the minimum Stream Deck app version we want to support?
- How should the native plugin handle co-director vs director authority when a command is rejected?
