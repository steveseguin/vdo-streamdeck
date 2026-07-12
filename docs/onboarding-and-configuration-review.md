# Onboarding and Configuration Review

Review date: 2026-06-30.

This file captures how Stream Deck plugins usually guide setup, and what that implies for the VDO.Ninja native plugin.

## Sources Checked

- Elgato Stream Deck SDK docs:
  - Property inspector UI: https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/
  - Settings: https://docs.elgato.com/streamdeck/sdk/guides/settings/
  - Profiles: https://docs.elgato.com/streamdeck/sdk/guides/profiles/
  - Manifest and support URL behavior: https://docs.elgato.com/streamdeck/sdk/references/manifest/
  - Distribution: https://docs.elgato.com/streamdeck/sdk/introduction/distribution/
- Elgato setup examples:
  - OBS Studio plugin setup: https://www.elgato.com/us/en/explorer/products/marketplace/streamline-your-production-with-the-obs-studio-plugin-for-stream-deck/
  - Twitch account setup: https://help.elgato.com/hc/en-us/articles/360028233511-Elgato-Stream-Deck-Twitch-Integration
  - Stream Deck Mobile QR pairing: https://help.elgato.com/hc/en-us/articles/360040314512-Elgato-Stream-Deck-Mobile-Pairing-Stream-Deck-Mobile
  - OBS portable-mode plugin setup: https://help.elgato.com/hc/en-us/articles/15525011385229-Elgato-Stream-Deck-How-to-use-with-OBS-Studio-Portable-Mode
- Third-party setup examples:
  - BarRaider OBS Tools setup wizard: https://docs.barraider.com/faqs/obs-tools/getting-started/
  - StreamYard Stream Deck profile/hotkey setup: https://support.streamyard.com/hc/en-us/articles/360061032132-Using-the-Elgato-Stream-Deck-with-StreamYard
- VDO.Ninja references:
  - Home/about: https://vdo.ninja/
  - API reference: https://docs.vdo.ninja/advanced-settings/api-and-midi-parameters/api/api-reference
  - API quick setup note: https://docs.vdo.ninja/advanced-settings/api-and-midi-parameters/api/api-reference-ai-generated

## Setup Patterns Seen Elsewhere

### Action Property Inspector First

Most plugins rely on the Stream Deck property inspector as the main setup surface. The normal user flow is:

1. Install plugin.
2. Drag an action onto a key or dial.
3. Configure that action in the property inspector.
4. The action stores global settings or per-action settings.

This matches the Stream Deck SDK model. Property inspectors are local HTML views that can read/write plugin settings and talk to the plugin over Stream Deck's local WebSocket bridge.

Implication for VDO.Ninja: the first `Connection Status` action should double as the setup screen. Users should not need to read external docs before seeing what `&api=...` means.

### External App Connection

OBS-style plugins usually require a companion app or local service to be running. The setup docs tell users to enable a local WebSocket/server, then configure host, port, and password in Stream Deck. BarRaider's OBS Tools explicitly sends users through a setup wizard after they drag an action.

Implication for VDO.Ninja: our equivalent is not a local app server. It is a VDO.Ninja browser page opened with the same `&api=KEY`. The wizard should explain that the controlled page must stay open.

### Account Authorization

Twitch-style integrations use Stream Deck's account flow: users add an account in Stream Deck preferences, sign in through a browser, then select that account per action.

Implication for VDO.Ninja: do not copy an OAuth/account model. VDO.Ninja is free, browser-based, no sign-in, and no account token is required for normal use. The plugin only needs a private API key shared between Stream Deck and the VDO.Ninja URL.

### Device Pairing and Discovery

Philips Hue-style plugins often discover local devices, prompt a hardware pairing step, then populate action dropdowns from discovered devices. Failure modes are mostly discovery/pairing confusion.

Implication for VDO.Ninja: we can avoid discovery complexity. Once the API key is known, connection status can prove whether a matching VDO.Ninja page is present.

### Profiles and Templates

Elgato supports bundling profiles into plugins. Profiles are useful when a plugin has many actions and a first-time user should not have to build a layout from scratch. StreamYard uses a profile/hotkey workflow rather than a native API plugin.

Implication for VDO.Ninja: include default profiles by device class later:

- Mini: local mic/camera/speaker/hand/record/connection.
- 15-key: local controls plus first few guest controls and scene toggles.
- XL: director room layout with guest rows, scenes, groups, transfer, and stats.
- Stream Deck + / + XL: keys plus dial pages for volume, pan, PTZ, bitrate, and buffer delay.
- Pedal: push-to-talk/cough mute/record marker/emergency hangup.

### QR Codes

QR codes are common for pairing Stream Deck Mobile to the desktop Stream Deck app. They are not the normal configuration path for desktop plugins.

Implication for VDO.Ninja: QR codes should be optional and task-specific:

- Useful: show a QR for a generated `push` link so a phone can join with `&api=KEY`.
- Useful: show a QR for a guest invite or reusable `permaid`/`push` link.
- Not ideal: making desktop users scan a QR just to configure Stream Deck.

The plugin can generate QR codes locally in the property inspector from the setup URL. This does not require a VDO.Ninja account or external service.

## Recommended VDO.Ninja Setup Experience

### First Screen

When the user selects any VDO.Ninja action and no API key exists, show a compact setup panel:

```text
VDO.Ninja is free, browser-based, and does not require a login.

To control a VDO.Ninja page from Stream Deck:
1. Choose or generate an API key.
2. Open your VDO.Ninja link with &api=that-key.
3. Keep that VDO.Ninja page open while using Stream Deck.
```

Then provide:

- `Generate key`
- `Copy key`
- `Open VDO.Ninja`
- `Test connection`
- `Advanced API host`

### Link Builder

Provide a link builder instead of making users edit URLs manually:

- Page type:
  - Director room
  - Push camera
  - View stream
  - Scene/clean output
  - Custom URL
- Common fields:
  - Room name
  - Push/view stream ID
  - Scene ID/name
  - API key
- Output:
  - Full URL
  - Copy URL
  - Open URL
  - Show QR

Example outputs:

```text
https://vdo.ninja/mixer?director=ROOM&api=KEY
https://vdo.ninja/?push=STREAMID&api=KEY
https://vdo.ninja/?view=STREAMID&api=KEY
https://vdo.ninja/?room=ROOM&scene=custom-scene&api=KEY
```

Use `&api=` when appending to an existing URL that already has `?`. Use `?api=` only when adding API to a URL with no query string.

### Connection Feedback

The setup panel should show one of these states:

- `Missing key`: no API key configured.
- `Waiting for page`: API relay reachable, but no VDO.Ninja page has answered.
- `Connected`: at least one callback/update has returned.
- `Timeout`: a command was sent but no page answered in time.
- `Disconnected`: WebSocket closed; reconnecting.
- `Error`: host/network/configuration error.

This language matters because users may confuse "plugin connected to relay" with "VDO.Ninja page connected". For VDO.Ninja, the second state is what matters.

### Explain Scope Without Overloading

Use plain setup copy:

```text
The API key is like a private remote-control channel. Use a different key for each VDO.Ninja page you want to control separately.
```

Avoid leading with implementation details like WebSockets, callbacks, `getDetails`, or relay rooms. Put those under an "Advanced" disclosure.

### Room and Roomless Modes

The wizard should explicitly support all common page modes:

- Director room: best for full guest lists, scene membership, queue/hold state, and room control.
- Push link: controls only that publisher page unless it also receives streams.
- View link: controls that viewer/output page and its inbound streams.
- Scene/clean output: controls that output page; scene state may be partial if director controls are not present.
- Transfer rooms: state changes after transfer; actions should refresh rather than assume old slot/room.

## Configuration Model Recommendation

### MVP

- One global connection:
  - API key
  - API host
  - timeout
  - polling interval
  - HTTP fallback
- Per-action settings:
  - action type
  - behavior/value
  - title override
  - danger confirmation

This is simple and matches most Stream Deck users' expectations.

### Next

Add named connections:

```text
Director Room A
Guest Phone Push
OBS Clean Output
Backup Room
```

Each action can use:

- Default connection
- A named connection override

This is better than same-key multi-page aggregation because current VDO.Ninja callbacks do not identify the responding page.

### Later

Add an onboarding wizard action or command:

- `Setup VDO.Ninja`
- Generates a key.
- Builds a URL.
- Opens/copies/shows QR.
- Runs `getDetails`.
- Shows detected mode: director, push, view, scene/output, unknown.

## Marketplace Page Copy Direction

Use approachable copy:

```text
Control VDO.Ninja from Stream Deck. VDO.Ninja is free, browser-based, and requires no account. Add &api=your-key to the VDO.Ninja page you want to control, paste the same key into Stream Deck, and start controlling mic, camera, guests, scenes, PTZ, and production actions from physical keys and dials.
```

Avoid promising "auto-discovers every room" until multi-connection and page identity are implemented.

## Required Product Changes

- Replace the current raw key-only connection panel with a setup-first property inspector section. Implemented in `plugin/ui/action-settings.html`.
- Add API key generation. Implemented.
- Add copy/open URL helpers. Implemented; open requests route through the Stream Deck plugin system API.
- Add a local QR code for generated VDO.Ninja links. Implemented with a bundled local QR generator.
- Add an inline "what is VDO.Ninja?" note. Implemented.
- Add a "how this API key works" note. Implemented in the advanced connection section.
- Add a visible connection test result. Implemented with `sendToPlugin` / `sendToPropertyInspector` messages and a real `getDetails` test.
- Add `SupportURL` in `manifest.json` before marketplace packaging.
- Bundle default profiles once the action set is broader.

## Copy Drafts

Short intro:

```text
VDO.Ninja is free, browser-based, and does not require a login. This plugin controls a VDO.Ninja page that has been opened with a matching &api key.
```

API key help:

```text
Use the same private key in Stream Deck and in your VDO.Ninja URL. Example: https://vdo.ninja/mixer?director=myshow&api=abc123
```

Waiting state:

```text
Waiting for a VDO.Ninja page using this API key. Open your generated link and keep that page open.
```

QR help:

```text
Scan this to open the generated VDO.Ninja link on a phone or guest device.
```

Multiple pages warning:

```text
Use different API keys for pages you want to control separately. Reusing one key on multiple pages can make feedback ambiguous.
```
