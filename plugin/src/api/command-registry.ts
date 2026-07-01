import type { JsonValue } from "@elgato/utils";
import type { GuestCommandSettings, GuestSceneSettings, LocalControlSettings, PtzDialSettings, PtzKeySettings, ValueDialSettings, VdoCommandPayload } from "./types.js";

export type LocalControlStateField = "muted" | "videoMuted" | "speakerMuted" | "seeding";

export type LocalControlDefinition = {
	id: string;
	label: string;
	action: string;
	stateField?: LocalControlStateField;
	invertState?: boolean;
	dangerous?: boolean;
	pressOnly?: boolean;
	toggleValue?: JsonValue;
};

export type GuestCommandValueKind = "toggle" | "none" | "text" | "number";

export type GuestCommandDefinition = {
	id: string;
	label: string;
	action: string;
	valueKind: GuestCommandValueKind;
	defaultValue?: JsonValue;
	dangerous?: boolean;
	pressOnly?: boolean;
	stateField?: "muted" | "videoMuted" | "speakerMuted" | "directorMuted" | "directorVideoHide";
	invertState?: boolean;
};

export const LOCAL_CONTROLS: Record<string, LocalControlDefinition> = {
	mic: {
		id: "mic",
		label: "Mic",
		action: "mic",
		stateField: "muted",
		invertState: true
	},
	camera: {
		id: "camera",
		label: "Camera",
		action: "camera",
		stateField: "videoMuted",
		invertState: true
	},
	speaker: {
		id: "speaker",
		label: "Speaker",
		action: "speaker",
		stateField: "speakerMuted",
		invertState: true
	},
	record: {
		id: "record",
		label: "Record",
		action: "record",
		pressOnly: false,
		toggleValue: true
	},
	screenshare: {
		id: "screenshare",
		label: "Share",
		action: "togglescreenshare",
		pressOnly: true
	},
	hand: {
		id: "hand",
		label: "Hand",
		action: "togglehand",
		pressOnly: true
	},
	keyframe: {
		id: "keyframe",
		label: "Keyframe",
		action: "forceKeyframe",
		pressOnly: true
	},
	reload: {
		id: "reload",
		label: "Reload",
		action: "reload",
		dangerous: true,
		pressOnly: true
	},
	hangup: {
		id: "hangup",
		label: "Hang Up",
		action: "hangup",
		dangerous: true,
		pressOnly: true
	}
};

export const GUEST_COMMANDS: Record<string, GuestCommandDefinition> = {
	mic: {
		id: "mic",
		label: "Guest Mic",
		action: "mic",
		valueKind: "toggle",
		stateField: "directorMuted",
		invertState: true
	},
	camera: {
		id: "camera",
		label: "Guest Cam",
		action: "camera",
		valueKind: "toggle",
		stateField: "directorVideoHide",
		invertState: true
	},
	speaker: {
		id: "speaker",
		label: "Guest Speaker",
		action: "speaker",
		valueKind: "toggle",
		stateField: "speakerMuted",
		invertState: true
	},
	display: {
		id: "display",
		label: "Guest Display",
		action: "display",
		valueKind: "toggle"
	},
	volume: {
		id: "volume",
		label: "Guest Volume",
		action: "volume",
		valueKind: "number",
		defaultValue: 100
	},
	group: {
		id: "group",
		label: "Guest Group",
		action: "group",
		valueKind: "text",
		defaultValue: "1"
	},
	forward: {
		id: "forward",
		label: "Transfer",
		action: "forward",
		valueKind: "text",
		dangerous: true
	},
	activateQueuedGuest: {
		id: "activateQueuedGuest",
		label: "Activate Guest",
		action: "activateQueuedGuest",
		valueKind: "none",
		pressOnly: true
	},
	hangup: {
		id: "hangup",
		label: "Hang Up Guest",
		action: "hangup",
		valueKind: "none",
		dangerous: true,
		pressOnly: true
	},
	soloVideo: {
		id: "soloVideo",
		label: "Solo Video",
		action: "soloVideo",
		valueKind: "toggle"
	},
	soloChat: {
		id: "soloChat",
		label: "Solo Talk",
		action: "soloChat",
		valueKind: "toggle"
	},
	soloChatBidirectional: {
		id: "soloChatBidirectional",
		label: "Two-way Talk",
		action: "soloChatBidirectional",
		valueKind: "toggle"
	},
	sendDirectorChat: {
		id: "sendDirectorChat",
		label: "Overlay",
		action: "sendDirectorChat",
		valueKind: "text"
	},
	sendPinnedDirectorChat: {
		id: "sendPinnedDirectorChat",
		label: "Pinned Overlay",
		action: "sendPinnedDirectorChat",
		valueKind: "text"
	},
	forceKeyframe: {
		id: "forceKeyframe",
		label: "Guest Keyframe",
		action: "forceKeyframe",
		valueKind: "none",
		pressOnly: true
	},
	refreshVideo: {
		id: "refreshVideo",
		label: "Refresh Video",
		action: "refreshVideo",
		valueKind: "none",
		pressOnly: true
	},
	refreshConnection: {
		id: "refreshConnection",
		label: "Refresh Conn",
		action: "refreshConnection",
		valueKind: "none",
		pressOnly: true
	},
	recoverStream: {
		id: "recoverStream",
		label: "Recover",
		action: "recoverStream",
		valueKind: "none",
		dangerous: true,
		pressOnly: true
	}
};

export function getLocalControlDefinition(command: string | undefined): LocalControlDefinition {
	if (command && LOCAL_CONTROLS[command]) {
		return LOCAL_CONTROLS[command];
	}
	return LOCAL_CONTROLS.mic;
}

export function getGuestCommandDefinition(command: string | undefined): GuestCommandDefinition {
	if (command && GUEST_COMMANDS[command]) {
		return GUEST_COMMANDS[command];
	}
	return GUEST_COMMANDS.mic;
}

export function buildLocalControlPayload(settings: LocalControlSettings): VdoCommandPayload {
	if (isMomentaryLocalBehavior(settings.behavior)) {
		throw new Error("Momentary local control requires a key phase");
	}
	const definition = getLocalControlDefinition(settings.command);
	const payload: VdoCommandPayload = { action: definition.action };
	const value = behaviorToValue(settings.behavior || "toggle", definition);

	if (typeof value !== "undefined") {
		payload.value = value;
	}

	return payload;
}

export function buildLocalMomentaryPayload(settings: LocalControlSettings, phase: "down" | "up"): VdoCommandPayload {
	const definition = getLocalControlDefinition(settings.command);
	if (definition.id !== "mic") {
		throw new Error("Momentary local control currently supports mic only");
	}
	if (settings.behavior === "pushToTalk") {
		return {
			action: "mic",
			value: phase === "down"
		};
	}
	if (settings.behavior === "pushToMute") {
		return {
			action: "mic",
			value: phase === "up"
		};
	}
	throw new Error("Local momentary payload requires push-to-talk or push-to-mute behavior");
}

export function isMomentaryLocalBehavior(behavior: LocalControlSettings["behavior"]): boolean {
	return behavior === "pushToTalk" || behavior === "pushToMute";
}

export function buildGuestCommandPayload(settings: GuestCommandSettings, target: JsonValue): VdoCommandPayload {
	const definition = getGuestCommandDefinition(settings.command);
	const payload: VdoCommandPayload = {
		action: definition.action,
		target
	};
	const value = guestValueToPayload(settings, definition);
	if (typeof value !== "undefined") {
		payload.value = value;
	}
	return payload;
}

export function buildGuestScenePayload(settings: GuestSceneSettings, target: JsonValue): VdoCommandPayload {
	const scene = typeof settings.scene === "string" && settings.scene.trim() ? settings.scene.trim() : "1";
	const payload: VdoCommandPayload = {
		action: "addScene",
		target
	};
	payload.value = scene;
	if (settings.mode === "on" || settings.mode === "off") {
		payload.value2 = settings.mode === "on";
	}
	return payload;
}

export function buildPtzKeyPayloads(settings: PtzKeySettings, target?: JsonValue): VdoCommandPayload[] {
	const control = settings.control || "zoom";
	const scope = settings.scope || "local";

	if (scope === "guest") {
		if (typeof target === "undefined" || target === "") {
			throw new Error("Guest PTZ requires a target");
		}
		if (control === "exposure") {
			throw new Error("Guest-targeted exposure is not supported by VDO.Ninja");
		}
		if (control === "autofocus") {
			return [{ action: "ptzAutofocus", target, value: autofocusValue(settings.value) }];
		}

		const payloads: VdoCommandPayload[] = [];
		if (control === "focus" && settings.disableAutofocus) {
			payloads.push({ action: "ptzAutofocus", target, value: false });
		}
		payloads.push(buildPtzMovementPayload(guestPtzAction(control), settings, target));
		return payloads;
	}

	if (control === "autofocus") {
		throw new Error("Local autofocus is not exposed by the current VDO.Ninja API command path");
	}
	return [buildPtzMovementPayload(control, settings)];
}

export function buildPtzDialPayloads(settings: PtzDialSettings, ticks: number, target?: JsonValue): VdoCommandPayload[] {
	if (!Number.isFinite(ticks) || ticks === 0) {
		return [];
	}

	const step = positivePtzDialStep(settings.step);
	const magnitude = roundPtzDialValue(Math.min(1, Math.abs(ticks) * step * dialAccelerationFactor(settings, ticks)));
	const signed = (ticks < 0 ? -magnitude : magnitude) * (settings.invert ? -1 : 1);
	const keySettings: PtzKeySettings = {
		scope: settings.scope,
		targetMode: settings.targetMode,
		target: settings.target,
		control: settings.control || "zoom",
		mode: "relative",
		direction: signed < 0 ? "negative" : "positive",
		value: String(Math.abs(signed)),
		disableAutofocus: settings.disableAutofocus
	};

	return buildPtzKeyPayloads(keySettings, target);
}

export function buildPtzDialPushPayloads(settings: PtzDialSettings, target?: JsonValue): VdoCommandPayload[] {
	if (settings.pushAction === "autofocusOn" || settings.pushAction === "autofocusOff") {
		if (settings.scope !== "guest") {
			throw new Error("Dial autofocus push action requires a guest target");
		}
		return buildPtzKeyPayloads(
			{
				scope: "guest",
				targetMode: settings.targetMode,
				target: settings.target,
				control: "autofocus",
				value: settings.pushAction === "autofocusOn" ? "true" : "false"
			},
			target
		);
	}
	return [];
}

export function buildValueDialPayload(settings: ValueDialSettings, value: number, target?: JsonValue): VdoCommandPayload {
	const control = settings.control || "volume";
	const scope = settings.scope || "local";
	const clamped = clampValueDialNumber(value, settings);

	if (scope === "guest") {
		if (control !== "volume") {
			throw new Error("Guest value dials currently support volume only");
		}
		if (typeof target === "undefined" || target === "") {
			throw new Error("Guest value dial requires a target");
		}
		return {
			action: "volume",
			target,
			value: clamped
		};
	}

	if (control === "panning") {
		return {
			action: "panning",
			value: clamped
		};
	}
	if (control === "bitrate") {
		return {
			action: "bitrate",
			value: clamped
		};
	}
	if (control === "bufferDelay") {
		const payload: VdoCommandPayload = {
			action: "setBufferDelay",
			value: clamped
		};
		if (settings.bufferApply !== "default") {
			payload.value2 = "*";
		}
		return payload;
	}
	return {
		action: "volume",
		value: clamped
	};
}

export function nextValueDialValue(settings: ValueDialSettings, currentValue: number, ticks: number): number {
	if (!Number.isFinite(ticks) || ticks === 0) {
		return clampValueDialNumber(currentValue, settings);
	}
	const step = positiveValueDialStep(settings.step);
	const direction = (ticks < 0 ? -1 : 1) * (settings.invert ? -1 : 1);
	const delta = Math.abs(ticks) * step * valueDialAccelerationFactor(settings, ticks) * direction;
	return clampValueDialNumber(currentValue + delta, settings);
}

export function clampValueDialNumber(value: number, settings: ValueDialSettings): number {
	if (settings.control === "bitrate" && value === -1) {
		return -1;
	}
	const defaults = valueDialNumericDefaults(settings.control || "volume");
	const min = finiteNumber(settings.min, defaults.min);
	const max = finiteNumber(settings.max, defaults.max);
	const low = Math.min(min, max);
	const high = Math.max(min, max);
	const rounded = roundValueDialNumber(value, settings.control);
	return clamp(rounded, low, high);
}

function behaviorToValue(behavior: LocalControlSettings["behavior"], definition: LocalControlDefinition): JsonValue | undefined {
	if (definition.pressOnly || behavior === "press") {
		return undefined;
	}
	if (behavior === "on") {
		return true;
	}
	if (behavior === "off") {
		return false;
	}
	if (typeof definition.toggleValue !== "undefined") {
		return definition.toggleValue;
	}
	return "toggle";
}

function guestValueToPayload(settings: GuestCommandSettings, definition: GuestCommandDefinition): JsonValue | undefined {
	if (definition.pressOnly || definition.valueKind === "none" || settings.behavior === "press") {
		return undefined;
	}
	if (definition.valueKind === "toggle") {
		return behaviorToToggleValue(settings.behavior || "toggle");
	}

	const rawValue = typeof settings.value === "string" && settings.value.trim() ? settings.value.trim() : definition.defaultValue;
	if (typeof rawValue === "undefined") {
		return undefined;
	}
	if (definition.valueKind === "number") {
		const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
		return Number.isFinite(parsed) ? parsed : definition.defaultValue;
	}
	return rawValue;
}

function behaviorToToggleValue(behavior: GuestCommandSettings["behavior"]): JsonValue {
	if (behavior === "on") {
		return true;
	}
	if (behavior === "off") {
		return false;
	}
	return "toggle";
}

function buildPtzMovementPayload(action: string, settings: PtzKeySettings, target?: JsonValue): VdoCommandPayload {
	const value = ptzNumericValue(settings);
	const payload: VdoCommandPayload = { action, value };
	if (typeof target !== "undefined") {
		payload.target = target;
	}
	if (settings.mode === "absolute") {
		payload.value2 = "abs";
	}
	return payload;
}

function guestPtzAction(control: PtzKeySettings["control"]): string {
	if (control === "pan") {
		return "ptzPan";
	}
	if (control === "tilt") {
		return "ptzTilt";
	}
	if (control === "focus") {
		return "ptzFocus";
	}
	return "ptzZoom";
}

function ptzNumericValue(settings: PtzKeySettings): number {
	const control = settings.control || "zoom";
	const mode = settings.mode || "relative";
	const raw = typeof settings.value === "string" && settings.value.trim() ? Number(settings.value) : 0.1;
	const parsed = Number.isFinite(raw) ? raw : 0.1;
	const signed = mode === "relative" && settings.direction === "negative" ? -Math.abs(parsed) : parsed;

	if (mode === "absolute") {
		if (control === "pan" || control === "tilt") {
			return clamp(signed, -1, 1);
		}
		return clamp(signed, 0, 1);
	}
	return clamp(signed, -1, 1);
}

function positivePtzDialStep(value: unknown): number {
	const raw = typeof value === "string" && value.trim() ? Number(value) : 0.05;
	const parsed = Number.isFinite(raw) && raw > 0 ? raw : 0.05;
	return Math.min(parsed, 1);
}

function dialAccelerationFactor(settings: PtzDialSettings, ticks: number): number {
	if (!settings.acceleration) {
		return 1;
	}
	return Math.min(4, 1 + Math.floor(Math.max(0, Math.abs(ticks) - 1) / 3));
}

function roundPtzDialValue(value: number): number {
	return Math.round(value * 1000000) / 1000000;
}

function positiveValueDialStep(value: unknown): number {
	const raw = typeof value === "string" && value.trim() ? Number(value) : 1;
	const parsed = Number.isFinite(raw) && raw > 0 ? raw : 1;
	return parsed;
}

function valueDialAccelerationFactor(settings: ValueDialSettings, ticks: number): number {
	if (!settings.acceleration) {
		return 1;
	}
	return Math.min(5, 1 + Math.floor(Math.max(0, Math.abs(ticks) - 1) / 3));
}

function roundValueDialNumber(value: number, control: ValueDialSettings["control"]): number {
	if (control === "volume" || control === "panning" || control === "bitrate" || control === "bufferDelay") {
		return Math.round(value);
	}
	return Math.round(value * 1000000) / 1000000;
}

function finiteNumber(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
	return Number.isFinite(parsed) ? parsed : fallback;
}

function valueDialNumericDefaults(control: ValueDialSettings["control"]): { min: number; max: number } {
	if (control === "panning") {
		return { min: 0, max: 180 };
	}
	if (control === "bitrate") {
		return { min: 0, max: 6000 };
	}
	if (control === "bufferDelay") {
		return { min: 0, max: 5000 };
	}
	return { min: 0, max: 200 };
}

function autofocusValue(value: unknown): boolean {
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return !(normalized === "0" || normalized === "false" || normalized === "off" || normalized === "manual" || normalized === "disable" || normalized === "disabled");
	}
	if (typeof value === "boolean") {
		return value;
	}
	return true;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
