# Stream Deck Hardware and SDK Notes

Research date: 2026-06-30.

## Hardware Surface Summary

| Device | Controls to consider | Plugin design impact |
| --- | --- | --- |
| Stream Deck Mini | 6 LCD keys | Must keep default profiles compact. Good for guest/local essentials only. |
| Stream Deck | 15 LCD keys | Good baseline target for a default VDO.Ninja profile. |
| Stream Deck XL | 32 LCD keys | Best for director pages with guests, scenes, groups, and stats. |
| Stream Deck Neo | 8 keys, LCD Infobar, Touch Points | Good for simple local controls plus page navigation/status. |
| Stream Deck + | 8 keys, 4 dials, LCD Infobar/touch strip | First-class target for PTZ, volume, bitrate, and scene/group selection. |
| Stream Deck + XL | 36 keys, 6 dials, LCD Infobar/touch strip | Best high-end native target for a full director plus PTZ layout. |
| Stream Deck Pedal | 3 footswitches | Hands-free push-to-talk, cough mute, scene toggle, record marker, or emergency hangup. |
| Stream Deck Studio | 32 keys, 2 fixed encoders, NFC, PoE/USB-C; designed around Bitfocus Buttons/Companion workflows | Useful reference for pro broadcast users. Native Stream Deck app compatibility should be validated on real hardware before treating it as a primary marketplace target. |
| Stream Deck Mobile / Virtual Stream Deck | Virtual keys, no hardware dials | Profiles should degrade cleanly to key actions. |

## SDK Notes

Confirmed from the official SDK docs:
- The official SDK supports Node.js plugins and a `create streamdeck` scaffolder.
- The getting-started flow creates a `*.sdPlugin` plugin folder with a `manifest.json`, JavaScript output, and UI/property inspector assets.
- The SDK currently documents Node.js 24+ and Stream Deck 7.1+ as prerequisites.
- Actions are declared in `manifest.json` and implemented in code.
- Key actions receive key lifecycle events such as appear/disappear and key up/down.
- Dial/encoder actions should be separate action classes where the plugin handles dial rotate, dial press, and touch-strip/touch-tap behavior.
- Property inspectors are HTML/JS UIs loaded by Stream Deck to edit per-action or global settings.
- Marketplace packaging should be checked against current Elgato distribution docs before submission.

## Native Plugin Implications

Current Stream Deck hardware reviewed does not provide physical faders/sliders. For continuous controls, treat dials/encoders plus the touch strip/infobar as the slider-like surface.

The plugin should have two broad action types:

1. Button/key actions:
   - Local toggle actions: mic, camera, speaker, record, screenshare, raise hand.
   - Director target actions: guest mic/camera/display/speaker, scene toggles, group toggles, guest hangup, transfer.
   - State display actions: connection status, selected guest, stats summary.
   - Custom command action.

2. Dial/encoder actions:
   - Local PTZ: zoom, focus, pan, tilt, exposure.
   - Guest PTZ: `ptzZoom`, `ptzFocus`, `ptzPan`, `ptzTilt`.
   - Volume: local playback or guest mic volume.
   - Bitrate/buffer delay: useful for technical operators.
   - Push behavior: reset, autofocus, cycle target, or switch relative/absolute mode.

Pedal actions can reuse the key-action implementation path, but their profile suggestions should be different because there is no display feedback.

## Sources

- Elgato SDK getting started: https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/
- Elgato Stream Deck product page: https://www.elgato.com/us/en/p/stream-deck
- Elgato Stream Deck Neo: https://www.elgato.com/us/en/p/stream-deck-neo
- Elgato Stream Deck +: https://www.elgato.com/us/en/p/stream-deck-plus
- Elgato Stream Deck + XL: https://www.elgato.com/us/en/p/stream-deck-plus-xl
- Elgato Stream Deck Studio: https://www.elgato.com/us/en/p/stream-deck-studio
- Elgato Stream Deck Pedal: https://www.elgato.com/us/en/p/stream-deck-pedal
