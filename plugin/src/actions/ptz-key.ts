import { action, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { buildPtzKeyPayloads } from "../api/command-registry.js";
import { normalizePtzKeySettings } from "../api/settings.js";
import type { PtzKeySettings } from "../api/types.js";
import { selectedTargetStore, sessionStore, vdoClient } from "../services.js";
import { renderGuestTitle, resolveGuestTargetChoice, resolveGuestTargetValue } from "./guest-targeting.js";

@action({ UUID: "ninja.vdo.streamdeck.ptz-key" })
export class PtzKeyAction extends SingletonAction<PtzKeySettings> {
	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
		selectedTargetStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<PtzKeySettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<PtzKeySettings>): Promise<void> {
		const settings = normalizePtzKeySettings(ev.payload.settings);
		const target = settings.scope === "guest" ? resolveGuestTargetValue(settings) : undefined;

		if (settings.scope === "guest" && (typeof target === "undefined" || target === "")) {
			await ev.action.showAlert();
			await this.render(ev.action, settings);
			return;
		}

		try {
			const payloads = buildPtzKeyPayloads(settings, target);
			for (const payload of payloads) {
				const callback = await vdoClient.sendCommand(payload);
				if (callback.result === false) {
					throw new Error(`${payload.action} was rejected by VDO.Ninja`);
				}
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
				const settings = await visible.getSettings<PtzKeySettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: KeyAction<PtzKeySettings>, rawSettings?: PtzKeySettings): Promise<void> {
		const settings = normalizePtzKeySettings(rawSettings || (await actionContext.getSettings<PtzKeySettings>()));
		const label = ptzLabel(settings);
		if (settings.scope === "guest") {
			const choice = resolveGuestTargetChoice(settings);
			const title = renderGuestTitle(settings.title, label, choice, {
				control: controlLabel(settings.control || "zoom"),
				direction: directionLabel(settings),
				mode: settings.mode || "relative",
				value: settings.value || ""
			});
			await actionContext.setState(choice ? 1 : 0);
			await actionContext.setTitle(title);
			return;
		}

		await actionContext.setState(1);
		await actionContext.setTitle(settings.title || `Local\n${label}`);
	}
}

function ptzLabel(settings: PtzKeySettings): string {
	const control = settings.control || "zoom";
	if (control === "autofocus") {
		return autofocusLabel(settings.value);
	}
	return `${controlLabel(control)} ${directionLabel(settings)}`.trim();
}

function controlLabel(control: PtzKeySettings["control"]): string {
	if (control === "pan") {
		return "Pan";
	}
	if (control === "tilt") {
		return "Tilt";
	}
	if (control === "focus") {
		return "Focus";
	}
	if (control === "exposure") {
		return "Exposure";
	}
	if (control === "autofocus") {
		return "Autofocus";
	}
	return "Zoom";
}

function directionLabel(settings: PtzKeySettings): string {
	if (settings.mode === "absolute") {
		return "Abs";
	}
	if (settings.direction === "negative") {
		if (settings.control === "pan") {
			return "Left";
		}
		if (settings.control === "tilt") {
			return "Down";
		}
		if (settings.control === "focus") {
			return "Near";
		}
		return "-";
	}
	if (settings.control === "pan") {
		return "Right";
	}
	if (settings.control === "tilt") {
		return "Up";
	}
	if (settings.control === "focus") {
		return "Far";
	}
	return "+";
}

function autofocusLabel(value: string | undefined): string {
	const normalized = (value || "true").trim().toLowerCase();
	if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "manual" || normalized === "disable" || normalized === "disabled") {
		return "AF Off";
	}
	return "AF On";
}
