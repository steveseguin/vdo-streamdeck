import streamDeck from "@elgato/streamdeck";
import { ConnectionStatusAction } from "./actions/connection-status.js";
import { CustomCommandAction } from "./actions/custom-command.js";
import { GuestCommandAction } from "./actions/guest-command.js";
import { GuestSceneAction } from "./actions/guest-scene.js";
import { LocalControlAction } from "./actions/local-control.js";
import { MixerControlAction } from "./actions/mixer-control.js";
import { PtzDialAction } from "./actions/ptz-dial.js";
import { PtzKeyAction } from "./actions/ptz-key.js";
import { SelectGuestAction } from "./actions/select-guest.js";
import { ValueDialAction } from "./actions/value-dial.js";
import { initializeServices } from "./services.js";

streamDeck.actions.registerAction(new ConnectionStatusAction());
streamDeck.actions.registerAction(new LocalControlAction());
streamDeck.actions.registerAction(new SelectGuestAction());
streamDeck.actions.registerAction(new GuestCommandAction());
streamDeck.actions.registerAction(new GuestSceneAction());
streamDeck.actions.registerAction(new MixerControlAction());
streamDeck.actions.registerAction(new PtzKeyAction());
streamDeck.actions.registerAction(new PtzDialAction());
streamDeck.actions.registerAction(new ValueDialAction());
streamDeck.actions.registerAction(new CustomCommandAction());

await streamDeck.connect();
await initializeServices();
