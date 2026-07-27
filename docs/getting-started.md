# Set Up VDO.Ninja on Stream Deck

This guide is for everyday use. You do not need a VDO.Ninja account, and you do not need to know anything about programming.

## Before You Start

You need:

- The Stream Deck app, version 6.8 or newer.
- A Stream Deck, Stream Deck +, or Stream Deck Mobile.
- Chrome, Edge, or another browser that can run VDO.Ninja.
- The VDO.Ninja Stream Deck plugin file. Its name ends in `.streamDeckPlugin`.

The plugin is still in testing and is not in the Stream Deck Marketplace yet. If you were given a test copy, double-click the `.streamDeckPlugin` file and choose **Install**.

## Connect Your First VDO.Ninja Page

1. Open the Stream Deck app.
2. Search for **VDO.Ninja** in the action list.
3. Drag **Connection Status** onto an empty key.
4. In the setup panel below the keys, click **Generate secure key**.
5. Leave **Director mixer room** selected and type your VDO.Ninja room name.
6. Click **Open VDO.Ninja**.
7. Leave the VDO.Ninja browser tab open while you use Stream Deck.
8. Return to the Stream Deck app and click **Test connection**.

You are ready when the setup panel says **VDO.Ninja page answered** and the Stream Deck key turns green.

The connection key is a private remote-control password. The plugin puts it into the VDO.Ninja link for you, so you do not need to copy it anywhere. Do not share the key or a screenshot that shows the full link.

## Add Useful Controls

Drag another VDO.Ninja action onto an empty key, then choose what it should control in the panel below the keys.

- **Local Control → Mic** turns your own microphone on or off.
- **Local Control → Camera** turns your own camera on or off.
- **Guest Command → Mic** controls a guest's microphone.
- **Select Guest** lets one set of guest buttons follow G1, G2, G3, and so on.
- **Guest Scene** adds or removes a guest from a scene.

The G1, G2, and G3 numbers are the guest numbers shown in the VDO.Ninja director. They are not mixer destination slots.

## Use the Stream Deck + Dials

Choose **Dials** near the top-right of the Stream Deck app, then drag an action onto a dial.

- **Value Dial** can adjust local volume, guest volume, bitrate, panning, or buffer delay.
- **PTZ Dial** can adjust camera zoom, pan, tilt, focus, or exposure.

PTZ camera movement needs extra browser permission. Open the controlled camera page with PTZ enabled and approve the camera-control request. If you do not use a movable camera, you can ignore PTZ.

## What the Colours Mean

- **Green check:** connected and ready, or the selected setting is on.
- **Red X:** the page or guest is unavailable, or the selected setting is off.
- **Set API Key:** finish the connection steps above.

A guest control can be red while the main connection key is green. This usually means the guest has not joined yet or that no guest is selected.

## If It Does Not Connect

Try these in order:

1. Make sure the VDO.Ninja browser tab is still open.
2. Make sure the browser page finished loading.
3. Click **Test connection** again.
4. If you opened more than one controlled page, give each page its own generated connection key.
5. For a guest control, confirm that the guest is in the room and that the correct G number is selected.
6. Restart the Stream Deck app, reopen the VDO.Ninja link, and test again.

## Testing the Alpha Version

Only use this when you have been asked to test upcoming VDO.Ninja changes.

1. Open **Advanced and self-hosted setup** in the Connection Status panel.
2. Set **VDO.Ninja base URL** to `https://vdo.ninja/alpha/`.
3. Close the advanced section.
4. Use **Open VDO.Ninja** as normal.

The generated director link will stay under `/alpha/mixer`.

## For a Developer or Technical Helper

If you do not have an installable test file, a technical helper can build one from the repository:

```text
cd plugin
npm install
npm run build
npx @elgato/cli@1.7.4 pack ninja.vdo.streamdeck.sdPlugin
```

The resulting `.streamDeckPlugin` file can be installed by double-clicking it.
