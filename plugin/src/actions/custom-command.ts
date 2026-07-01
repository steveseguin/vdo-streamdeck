import { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { normalizeCustomCommandSettings } from "../api/settings.js";
import type { CustomCommandSettings, VdoCommandPayload } from "../api/types.js";
import { vdoClient } from "../services.js";

@action({ UUID: "ninja.vdo.streamdeck.custom-command" })
export class CustomCommandAction extends SingletonAction<CustomCommandSettings> {
	override async onWillAppear(ev: WillAppearEvent<CustomCommandSettings>): Promise<void> {
		const settings = normalizeCustomCommandSettings(ev.payload.settings);
		await ev.action.setTitle(settings.title || `VDO\n${settings.action || "Command"}`);
	}

	override async onKeyDown(ev: KeyDownEvent<CustomCommandSettings>): Promise<void> {
		const settings = normalizeCustomCommandSettings(ev.payload.settings);
		const payload: VdoCommandPayload = {
			action: settings.action || "getDetails"
		};

		const target = parseValue(settings.target);
		const value = parseValue(settings.value);
		const value2 = parseValue(settings.value2);

		if (typeof target !== "undefined") {
			payload.target = target;
		}
		if (typeof value !== "undefined") {
			payload.value = value;
		}
		if (typeof value2 !== "undefined") {
			payload.value2 = value2;
		}

		try {
			await vdoClient.sendCommand(payload, { awaitCallback: settings.awaitCallback !== false });
			await ev.action.showOk();
		} catch {
			await ev.action.showAlert();
		}
	}
}

export function parseValue(value: JsonValue | undefined): JsonValue | undefined {
	if (typeof value !== "string") {
		return value;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}
	if (trimmed === "true") {
		return true;
	}
	if (trimmed === "false") {
		return false;
	}
	if (trimmed === "null") {
		return null;
	}
	if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
		try {
			return JSON.parse(trimmed) as JsonValue;
		} catch {
			return trimmed;
		}
	}
	return trimmed;
}
