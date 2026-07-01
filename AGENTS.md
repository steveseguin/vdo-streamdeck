# VDO.Ninja Stream Deck Plugin Workspace

## Scope
- This folder is for the native Stream Deck plugin project, research notes, build notes, and plugin-specific docs.
- Do not edit files outside `vdo-streamdeck/` unless Steve explicitly gives permission for that change.
- Reading local VDO.Ninja source/docs is allowed for reference. Do not update the root VDO.Ninja app, `release/webrtc.js`, or anything under `web/`.
- `Companion-Ninja/` may be read as an API reference. Only edit it when Steve explicitly asks for a correction or fix.

## Goal
Build a native Elgato Stream Deck plugin for VDO.Ninja that exposes the practical VDO.Ninja control surface users expect from Companion, plus Stream Deck specific niceties:
- Button actions with live state feedback.
- Dial/encoder actions for PTZ, volume, bitrate, and other continuous controls.
- Property inspectors for API key, target guest/stream, scene/group values, and command presets.
- Marketplace-ready packaging, docs, icons, and privacy posture.

## Design Rules
- Use the official Stream Deck SDK/tooling unless there is a concrete reason not to.
- Prefer TypeScript and the current Stream Deck SDK patterns.
- Treat VDO.Ninja as an external controlled app. The user must open a VDO.Ninja URL with `&api=KEY`; the plugin connects to that API key.
- Use WebSocket or HTTP POST for structured commands. Use HTTP GET only for simple compatibility examples.
- Do not store or log API keys in plain project docs, screenshots, or test output.
- Keep all action definitions driven by a command registry so new VDO.Ninja API commands are easy to add.
- Keep Stream Deck hardware differences in mind: keys, dials/encoders, touch strip/infobar, foot pedals, and virtual/mobile surfaces.

## Local References
- Root quick guide: `../streamdeck.html`
- API docs/reference repo: `../Companion-Ninja/`
- Current HTTP/WSS API notes: `../Companion-Ninja/httpwssapi.md`
- Iframe API notes: `../Companion-Ninja/iframeapi.md`
- PTZ controller page: `../ptz.html`
- Zoom-specific page: `../zoom.html`

## Development Notes
- Before proposing plugin architecture changes, inspect the current docs in this folder and the local API references above.
- When adding plugin code later, keep generated/build output ignored unless it is required for marketplace packaging.
- Record SDK/API source URLs in docs when research affects implementation decisions.
