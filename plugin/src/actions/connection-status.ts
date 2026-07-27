import { action, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import type { ConnectionStatusSettings } from "../api/types.js";
import { sessionStore, vdoClient } from "../services.js";

@action({ UUID: "ninja.vdo.streamdeck.connection" })
export class ConnectionStatusAction extends SingletonAction<ConnectionStatusSettings> {
	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<ConnectionStatusSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<ConnectionStatusSettings>): Promise<void> {
		try {
			await vdoClient.sendCommand({ action: "getDetails" });
			await ev.action.showOk();
		} catch {
			await ev.action.showAlert();
		}
		await this.render(ev.action);
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isKey()) {
				await this.render(visible);
			}
		}
	}

	private async render(actionContext: KeyAction<ConnectionStatusSettings>): Promise<void> {
		const state = sessionStore.getConnectionState();
		const count = sessionStore.getStreamCount();

		if (state === "connected") {
			await actionContext.setState(1);
			const header = pageIdentity() || "VDO";
			await actionContext.setTitle(count ? `${header}\n${count} stream${count === 1 ? "" : "s"}` : `${header}\nReady`);
			return;
		}

		await actionContext.setState(0);
		if (state === "missing-key") {
			await actionContext.setTitle("Set API\nKey");
		} else if (state === "connecting") {
			await actionContext.setTitle("VDO\nConnecting");
		} else if (state === "no-page") {
			await actionContext.setTitle("No VDO\nPage");
		} else if (state === "timeout") {
			await actionContext.setTitle("VDO\nTimeout");
		} else if (state === "error") {
			await actionContext.setTitle("VDO\nError");
		} else {
			await actionContext.setTitle("VDO\nOffline");
		}
	}
}

function pageIdentity(): string {
	const local = sessionStore.getLocalStream();
	if (!local) {
		return "";
	}
	// The API reports no room name; the page label, director role, or an
	// explicit push stream ID are the best identity the wire format offers.
	const label = typeof local.label === "string" ? local.label.trim() : "";
	const identity = label || (local.director === true ? "Director" : local.streamID || "");
	return identity ? shortLabel(identity) : "";
}

function shortLabel(value: string): string {
	return value.length > 12 ? `${value.slice(0, 11)}...` : value;
}
