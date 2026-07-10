import { action, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { buildGuestScenePayload } from "../api/command-registry.js";
import { normalizeGuestSceneSettings } from "../api/settings.js";
import type { GuestSceneSettings } from "../api/types.js";
import { selectedTargetStore, sessionStore, vdoClient } from "../services.js";
import { renderGuestTitle, resolveGuestTargetChoice, resolveGuestTargetValue } from "./guest-targeting.js";

@action({ UUID: "ninja.vdo.streamdeck.guest-scene" })
export class GuestSceneAction extends SingletonAction<GuestSceneSettings> {
	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
		selectedTargetStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<GuestSceneSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<GuestSceneSettings>): Promise<void> {
		const settings = normalizeGuestSceneSettings(ev.payload.settings);
		const target = resolveGuestTargetValue(settings);
		if (typeof target === "undefined" || target === "") {
			await ev.action.showAlert();
			await this.render(ev.action, settings);
			return;
		}

		try {
			const choice = resolveGuestTargetChoice(settings);
			const currentState = choice ? getSceneState(choice.streamID, settings.scene || "1") : undefined;
			const payload = buildGuestScenePayload(settings, target, currentState);
			if (payload) {
				await vdoClient.sendCommand(payload);
			}
			await ev.action.showOk();
		} catch {
			await ev.action.showAlert();
		}
		await this.render(ev.action, settings);
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isKey()) {
				const settings = await visible.getSettings<GuestSceneSettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: KeyAction<GuestSceneSettings>, rawSettings?: GuestSceneSettings): Promise<void> {
		const settings = normalizeGuestSceneSettings(rawSettings || (await actionContext.getSettings<GuestSceneSettings>()));
		const choice = resolveGuestTargetChoice(settings);
		const scene = settings.scene || "1";
		const active = choice ? getSceneState(choice.streamID, scene) : undefined;
		const title = renderGuestTitle(settings.title, `Scene ${scene}`, choice, {
			scene,
			state: active === true ? "On" : active === false ? "Off" : ""
		});

		await actionContext.setState(active === true ? 1 : 0);
		await actionContext.setTitle(title);
	}
}

function getSceneState(streamID: string, scene: string): boolean | undefined {
	const stream = sessionStore.getStream(streamID);
	if (!stream?.scenes || typeof stream.scenes !== "object") {
		return undefined;
	}
	const value = stream.scenes[scene];
	if (typeof value === "boolean") {
		return value;
	}
	if (value === "true" || value === 1 || value === "1") {
		return true;
	}
	if (value === "false" || value === 0 || value === "0") {
		return false;
	}
	return undefined;
}
