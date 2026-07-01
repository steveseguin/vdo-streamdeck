import type { JsonValue } from "@elgato/utils";
import type { GuestCommandSettings, GuestSceneSettings, PtzDialSettings, PtzKeySettings, StreamChoice, ValueDialSettings } from "../api/types.js";
import { selectedTargetStore, sessionStore } from "../services.js";

export type GuestTargetSettings = Pick<GuestCommandSettings | GuestSceneSettings | PtzKeySettings | PtzDialSettings | ValueDialSettings, "targetMode" | "target">;

export function resolveGuestTargetValue(settings: GuestTargetSettings): JsonValue | undefined {
	if (settings.targetMode === "selected") {
		const choice = resolveGuestTargetChoice(settings);
		return choice?.UUID || selectedTargetStore.getSelectedStreamID() || undefined;
	}
	if (settings.targetMode === "firstHeld") {
		const choice = resolveGuestTargetChoice(settings);
		return choice?.UUID || choice?.streamID;
	}
	if (settings.targetMode === "streamId") {
		return settings.target || resolveGuestTargetChoice(settings)?.streamID;
	}
	return settings.target || "1";
}

export function resolveGuestTargetChoice(settings: GuestTargetSettings): StreamChoice | undefined {
	const choices = sessionStore.getStreamChoices({ includeLocal: false });
	if (settings.targetMode === "selected") {
		const streamID = selectedTargetStore.getSelectedStreamID();
		return streamID ? findChoiceOrFallback(choices, streamID) : undefined;
	}
	if (settings.targetMode === "firstHeld") {
		return choices.find(choice => choice.held);
	}
	if (settings.targetMode === "streamId") {
		return settings.target ? findChoiceOrFallback(choices, settings.target) : undefined;
	}
	const slot = parseInt(settings.target || "1", 10);
	if (!Number.isNaN(slot)) {
		return choices.find(choice => choice.position === slot);
	}
	return undefined;
}

export function renderGuestTitle(
	template: string | undefined,
	defaultLabel: string,
	choice: StreamChoice | undefined,
	values: Record<string, string | undefined> = {}
): string {
	const label = choice?.label || "Guest";
	const slot = typeof choice?.position === "number" ? String(choice.position) : "";
	const fallback = slot ? `G${slot}\n${defaultLabel}` : `${label}\n${defaultLabel}`;
	if (!template) {
		return fallback;
	}
	const replacements: Record<string, string> = {
		label,
		streamID: choice?.streamID || "",
		slot,
		...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value || ""]))
	};

	return Object.entries(replacements).reduce((title, [key, value]) => title.replaceAll(`{${key}}`, value), template);
}

function findChoiceOrFallback(choices: StreamChoice[], streamID: string): StreamChoice {
	return choices.find(choice => choice.streamID === streamID) || {
		streamID,
		label: "Missing target"
	};
}
