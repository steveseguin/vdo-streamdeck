# Set Up VDO.Ninja on Stream Deck

Use Stream Deck to control a VDO.Ninja page while it stays open in your browser.

## Install

You need the Stream Deck app **6.8+**, Stream Deck hardware or Stream Deck Mobile, and a browser that supports VDO.Ninja, such as Chrome or Edge.

[Download the latest plugin](https://github.com/steveseguin/vdo-streamdeck/releases/latest). Under **Assets**, choose **ninja.vdo.streamdeck.streamDeckPlugin**, then double-click it and choose **Install**. You do not need Node.js or Companion. The plugin is in beta and is not yet in the Elgato Marketplace.

## Connect your page

1. Open Stream Deck and find **VDO.Ninja** in the action list.
2. Drag **Connection Status** onto an empty key.
3. In the panel below the keys, click **Generate secure key**.
4. Leave **Director mixer room** selected and enter your room name.
5. Click **Open VDO.Ninja** and finish opening the room in your browser.
6. Keep the browser tab open, return to Stream Deck, and click **Test connection**.

You are connected when the panel says **VDO.Ninja page answered** and the connection key turns green.

All VDO.Ninja keys and dials share this connection, including those on other profiles. Changing the connection key affects all of them. Changing the room or page link does not switch the active browser page: close the old controlled tab, open the new link, then test again.

The connection key is a remote-control password. **Show key** reveals both the key and the generated link. Keep the key, link, and QR code private.

### Use an existing page or a camera

If your page's URL already contains `api=`, paste the full URL into **Connection key or VDO.Ninja link**. The plugin fills in the key and keeps your page options, including `/alpha/`. Leave that page open and click **Test connection**.

Under **Page to control**, choose:

- **Existing VDO.Ninja URL** to paste a director, guest, mixer, or camera link you already use. The generated link keeps its options and sets the connection key. Open that generated link in place of the original page.
- **Push camera** to publish a camera using a stream ID.
- **View stream** to control a page that watches a stream.
- **Scene / clean output** to control an output for a room and scene.

**Local Control** always affects this connected page, even when it runs on another computer. Guest controls need a director or mixer page.

## Add controls

Drag another VDO.Ninja action onto an empty key and choose its settings. The connection section starts collapsed once a key is configured; expand it to change the shared connection.

| Goal | Action and setting |
| --- | --- |
| Toggle your microphone or camera | **Local Control → Mic** or **Camera**, with **Toggle**. |
| Hold a key to speak | **Local Control → Mic → Hold to talk**. Releasing the key mutes it. |
| Start and stop recording | Two **Local Control → Record** keys: one **Start recording**, one **Stop recording**. |
| Mute a guest | **Guest Command → Mic**, choose the guest, then **Turn off**. |
| Add or remove a guest from a scene | **Guest Scene**, choose the guest and scene, then **Toggle**. |
| See who is connected | **Guests List → All connected guests**. |

Reload, hangup, recovery, and transfer actions require a second press within two seconds by default. Their settings let you turn this confirmation off.

### Choose a guest

- **Guest position (G1, G2...)** follows the guest number shown in the director. It is not a mixer destination slot.
- **Stream ID** follows a particular stream. Pick a detected guest, or use **Manual ID** if it has not joined yet.
- **Selected guest** follows your **Select Guest** keys. Add a Select Guest key set to **Select next guest**, then set your Guest Command or Guest Scene keys to **Selected guest**. Press the selection key before using those controls.
- **First held guest** targets the first guest waiting to be activated. **Activate Guest** needs VDO.Ninja v30.2 or newer.

### Mixer slots and layouts

Use the default **Director mixer room** link for these controls. **Mixer Control → Assign guest to mixer slot** takes both a guest position and a destination slot. Destination **1** means mixer slot 1; **0** removes the assignment. Layout **0** selects the automatic layout.

## Use Stream Deck + dials

Choose **Dials** in Stream Deck, then drag **Value Dial** or **PTZ Dial** onto a dial.

- **Value Dial** adjusts volume, audio panning, bitrate, or buffer delay. Choose **Guest volume** to adjust one guest. Set the step per tick and the dial press action as needed.
- **PTZ Dial** controls a supported camera's zoom, pan, tilt, focus, or local exposure. Smaller steps give finer movement; **Invert dial direction** reverses it.

| Gesture | What happens |
| --- | --- |
| Turn clockwise / counterclockwise | Increase / decrease by the configured step. **Invert dial direction** reverses this. |
| Press the dial or tap its display | Run the chosen **Dial press / touch** action. Value Dial resets by default; PTZ Dial sends no command by default. |

For example, a volume dial set to 100 with a step of 5 drops to 95 with one counterclockwise click. Press it to return to its reset value, 100 by default.

PTZ needs `&ptz` on the camera page's URL and approval of the browser's camera-control permission. For guest PTZ, add it to the guest's camera link. The camera must support the chosen control.

Audio panning needs `&panning` on the controlled page's URL. It adjusts the incoming audio you hear on that page.

## Read the keys

Icons and text accompany the colours:

- **Green with a check:** connected, selected, on, or ready, depending on the action.
- **Dark red with an X:** off, inactive, or unavailable. Read the key's label for the specific state.
- **Grey:** waiting for connection, or a command without an on/off state, such as screen share or recording.
- **Amber lightning:** a Custom Command. This colour does not indicate connection status.

If a key says **Set API Key**, finish the connection setup. A guest key can be unavailable while Connection Status is green; check that the guest has joined and is selected.

If a key or dial flashes a warning, select it in Stream Deck and read **Last action** for help. The message clears when that action next succeeds. A missing reply does not prove a command failed; check the VDO.Ninja page before repeating it.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| No VDO page / timeout | Keep the controlled tab open, let it finish loading, and click **Test connection**. Confirm its URL uses the same `api` key. |
| Guest missing / no selection | Check the guest's G number or stream ID. For **Selected guest**, press a Select Guest key first. |
| Mic or camera says Inactive | Enable that media source on the connected VDO.Ninja page. A director without a local camera cannot toggle one. |
| Wrong page responds | Close other tabs using the same API key. Give separately controlled pages different keys. |
| Named scene will not Force On/Off | Use **Toggle**, or a page that reports live scene membership. |
| PTZ does nothing | Enable `&ptz` on the camera page, approve browser permission, and check that the camera supports that control. |
| Copy fails | Click **Show key**, then select and copy the key or link manually. |

## Use VDO.Ninja alpha

[Alpha](https://vdo.ninja/alpha/) has the newest VDO.Ninja code.

1. Expand **Connect VDO.Ninja**, then **Advanced and self-hosted setup**.
2. Set **VDO.Ninja base URL** to `https://vdo.ninja/alpha/`.
3. Close the old controlled tab, click **Open VDO.Ninja**, and test the connection again.

Director links stay under `/alpha/mixer`. If you chose **Existing VDO.Ninja URL**, edit that URL to use `/alpha/` instead; the base URL setting does not change an existing link.

For source builds, see the [plugin build instructions](../plugin/README.md#build).
