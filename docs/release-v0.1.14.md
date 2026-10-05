Run your VDO.Ninja show from Stream Deck: mute guests, switch scenes, move PTZ cameras, and adjust audio, with live feedback on every key.

![The plugin controlling a live VDO.Ninja director room: muting a guest, turning off a camera, toggling a scene, and a confirmed hang-up](https://github.com/steveseguin/vdo-streamdeck/raw/main/docs/assets/demo.gif)

▶️ **[Watch the narrated demo with sound](https://steveseguin.github.io/vdo-streamdeck/)**

### ⬇️ Install or update

1. Download **`ninja.vdo.streamdeck.streamDeckPlugin`** from the assets below.
2. Double-click it. Stream Deck installs it, or updates your current version and keeps your keys and settings.
3. New here? Drag **Connection Status** onto a key and click **Generate secure key**. The [setup guide](https://github.com/steveseguin/vdo-streamdeck/blob/main/docs/getting-started.md) walks through the rest.

Requires the Stream Deck app 6.8+ on Windows 10+ or macOS 12+. Dial actions need a Stream Deck +.

---

### ✨ New

- **Guests List key.** Shows who has joined, or who is in a scene, right on a key. Text scales to fit, and long lists rotate. Thanks @Marsic1!
- **Multi-line key titles.** Every action's title template accepts line breaks. Thanks @Marsic1!
- **Clear error messages.** When a key fails, its settings panel now says why, such as "No guest available for this target" or "The connection is unavailable", instead of only flashing a warning.
- **Clearer icons.** A new hang-up icon, a dedicated Guests List icon, and direction-aware PTZ artwork.
- **Tidier settings panel.** The QR code opens right under its button, and options that don't apply to the chosen control stay hidden.

### 🛠️ Fixed

- **Guest camera keys** now show the right on/off state when the camera is toggled from Stream Deck or the director page.
- **Commands for an empty guest slot** now show an alert instead of a false success.
- **Hang-up and Transfer all confirmations** no longer reset on their own. Before, a background status check could cancel the "Press again" prompt, or let the key go back to normal while still armed.
- **PTZ Dial** press and touch set to "None" no longer flash an alert.
- Multi-line guest lists and hidden key refreshes are handled correctly.

### ✅ Tested

All 215 automated tests and the bundled runtime test pass. New live tests drive a real VDO.Ninja director room with two test guests through the plugin and compare each key with the director page: guest mic and camera, guest selection, scenes, the Guests List, the volume dial, director chat, layout, custom commands, missing-guest errors, and confirmed hang-up. They pass on vdo.ninja and on the alpha.

---

This plugin is in beta and is not in the Elgato Marketplace yet. It controls VDO.Ninja through its API and does not replace OBS's own Stream Deck integration. Found a problem? [Open an issue](https://github.com/steveseguin/vdo-streamdeck/issues).
