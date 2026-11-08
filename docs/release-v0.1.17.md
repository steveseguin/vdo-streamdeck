This update fixes OBS microphone holds that could stay muted or stop during a caption relay reconnect.

- **Control OBS mic** no longer requires an active microphone track on the connected browser page.
- A relay WebSocket reconnect no longer cancels a held key when caption commands still work over HTTP. Failed caption connection checks still release the OBS microphone.
- Holding the key uses the saved OBS connection settings without restarting caption polling. The button shows **Wait** until the press completes, then **Live**.

Download **ninja.vdo.streamdeck.streamDeckPlugin** below and double-click it to update. Keep **Mic > Hold to talk** and **Control OBS mic** selected on your standalone key.

[Microphone, English captions, font and color setup](https://github.com/steveseguin/vdo-streamdeck/blob/main/docs/captions-and-obs.md).
