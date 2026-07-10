import type {
	CustomCommandSettings,
	GlobalSettings,
	GuestCommandSettings,
	GuestSceneSettings,
	GuestTargetMode,
	LocalControlSettings,
	MixerControlSettings,
	PtzDialSettings,
	PtzKeySettings,
	SelectGuestSettings,
	ValueDialSettings
} from "./types.js";

export const DEFAULT_API_HOST = "api.vdo.ninja";

export function normalizeGlobalSettings(settings: Partial<GlobalSettings> | undefined): GlobalSettings {
	return {
		apiKey: stringOrEmpty(settings?.apiKey),
		apiHost: stringOrEmpty(settings?.apiHost) || DEFAULT_API_HOST,
		useTls: settings?.useTls !== false,
		httpFallback: settings?.httpFallback !== false,
		requestTimeoutMs: positiveNumber(settings?.requestTimeoutMs, 5000),
		detailsPollMs: positiveNumber(settings?.detailsPollMs, 2000),
		statsPollMs: positiveNumber(settings?.statsPollMs, 5000)
	};
}

export function normalizeLocalControlSettings(settings: Partial<LocalControlSettings> | undefined): LocalControlSettings {
	return {
		command: stringOrEmpty(settings?.command) || "mic",
		behavior: normalizeLocalBehavior(settings?.behavior),
		dangerousConfirm: settings?.dangerousConfirm !== false,
		title: stringOrEmpty(settings?.title)
	};
}

export function normalizeGuestCommandSettings(settings: Partial<GuestCommandSettings> | undefined): GuestCommandSettings {
	return {
		command: stringOrEmpty(settings?.command) || "mic",
		targetMode: normalizeTargetMode(settings?.targetMode),
		target: stringOrEmpty(settings?.target),
		behavior: normalizeBehavior(settings?.behavior),
		value: stringOrEmpty(settings?.value),
		title: stringOrEmpty(settings?.title),
		dangerousConfirm: settings?.dangerousConfirm !== false
	};
}

export function normalizeGuestSceneSettings(settings: Partial<GuestSceneSettings> | undefined): GuestSceneSettings {
	return {
		targetMode: normalizeTargetMode(settings?.targetMode),
		target: stringOrEmpty(settings?.target),
		scene: stringOrEmpty(settings?.scene) || "1",
		mode: normalizeSceneMode(settings?.mode),
		title: stringOrEmpty(settings?.title)
	};
}

export function normalizeSelectGuestSettings(settings: Partial<SelectGuestSettings> | undefined): SelectGuestSettings {
	return {
		mode: normalizeSelectMode(settings?.mode),
		targetMode: normalizeSelectionTargetMode(settings?.targetMode),
		target: stringOrEmpty(settings?.target),
		title: stringOrEmpty(settings?.title)
	};
}

export function normalizePtzKeySettings(settings: Partial<PtzKeySettings> | undefined): PtzKeySettings {
	const scope = settings?.scope === "guest" ? "guest" : "local";
	let control = normalizePtzControl(settings?.control);
	if ((scope === "guest" && control === "exposure") || (scope === "local" && control === "autofocus")) {
		control = "zoom";
	}
	return {
		scope,
		targetMode: normalizeTargetMode(settings?.targetMode),
		target: stringOrEmpty(settings?.target),
		control,
		mode: normalizePtzMode(settings?.mode),
		direction: settings?.direction === "negative" ? "negative" : "positive",
		value: stringOrEmpty(settings?.value) || defaultPtzValue(control),
		disableAutofocus: settings?.disableAutofocus === true,
		title: stringOrEmpty(settings?.title)
	};
}

export function normalizePtzDialSettings(settings: Partial<PtzDialSettings> | undefined): PtzDialSettings {
	const scope = settings?.scope === "guest" ? "guest" : "local";
	let control = normalizePtzDialControl(settings?.control);
	if (scope === "guest" && control === "exposure") {
		control = "zoom";
	}
	let pushAction = normalizePtzDialPushAction(settings?.pushAction);
	if (scope !== "guest" && (pushAction === "autofocusOn" || pushAction === "autofocusOff")) {
		pushAction = "none";
	}
	return {
		scope,
		targetMode: normalizeTargetMode(settings?.targetMode),
		target: stringOrEmpty(settings?.target),
		control,
		step: normalizePositiveString(settings?.step, "0.05"),
		intervalMs: positiveNumber(settings?.intervalMs, 80),
		acceleration: settings?.acceleration === true,
		invert: settings?.invert === true,
		pushAction,
		disableAutofocus: settings?.disableAutofocus === true,
		title: stringOrEmpty(settings?.title)
	};
}

export function normalizeMixerControlSettings(settings: Partial<MixerControlSettings> | undefined): MixerControlSettings {
	return {
		command: normalizeMixerCommand(settings?.command),
		targetMode: normalizeTargetMode(settings?.targetMode),
		target: stringOrEmpty(settings?.target),
		layout: normalizeNumberString(settings?.layout, "0"),
		slot: normalizeNumberString(settings?.slot, "1"),
		muteBehavior: normalizeMixerMuteBehavior(settings?.muteBehavior),
		transferRoom: stringOrEmpty(settings?.transferRoom),
		title: stringOrEmpty(settings?.title),
		dangerousConfirm: settings?.dangerousConfirm !== false
	};
}

export function normalizeValueDialSettings(settings: Partial<ValueDialSettings> | undefined): ValueDialSettings {
	const control = normalizeValueDialControl(settings?.control);
	const defaults = valueDialDefaults(control);
	return {
		scope: settings?.scope === "guest" ? "guest" : "local",
		targetMode: normalizeTargetMode(settings?.targetMode),
		target: stringOrEmpty(settings?.target),
		control,
		value: normalizeNumberString(settings?.value, defaults.value),
		min: normalizeNumberString(settings?.min, defaults.min),
		max: normalizeNumberString(settings?.max, defaults.max),
		step: normalizePositiveString(settings?.step, defaults.step),
		resetValue: normalizeNumberString(settings?.resetValue, defaults.resetValue),
		intervalMs: positiveNumber(settings?.intervalMs, 100),
		acceleration: settings?.acceleration === true,
		invert: settings?.invert === true,
		pushAction: normalizeValueDialPushAction(settings?.pushAction),
		bufferApply: settings?.bufferApply === "default" ? "default" : "all",
		title: stringOrEmpty(settings?.title)
	};
}

export function normalizeCustomCommandSettings(settings: Partial<CustomCommandSettings> | undefined): CustomCommandSettings {
	return {
		action: stringOrEmpty(settings?.action) || "getDetails",
		target: emptyToUndefined(settings?.target),
		value: emptyToUndefined(settings?.value),
		value2: emptyToUndefined(settings?.value2),
		title: stringOrEmpty(settings?.title),
		awaitCallback: settings?.awaitCallback !== false
	};
}

function normalizeLocalBehavior(value: unknown): LocalControlSettings["behavior"] {
	if (value === "pushToTalk" || value === "pushToMute") {
		return value;
	}
	return normalizeBehavior(value);
}

function normalizeBehavior(value: unknown): GuestCommandSettings["behavior"] {
	if (value === "on" || value === "off" || value === "press") {
		return value;
	}
	return "toggle";
}

function normalizeTargetMode(value: unknown): GuestTargetMode {
	if (value === "streamId" || value === "firstHeld" || value === "selected") {
		return value;
	}
	return "slot";
}

function normalizeSelectionTargetMode(value: unknown): SelectGuestSettings["targetMode"] {
	if (value === "streamId" || value === "firstHeld") {
		return value;
	}
	return "slot";
}

function normalizeSelectMode(value: unknown): SelectGuestSettings["mode"] {
	if (value === "next" || value === "previous" || value === "firstHeld" || value === "clear") {
		return value;
	}
	return "fixed";
}

function normalizePtzControl(value: unknown): PtzKeySettings["control"] {
	if (value === "pan" || value === "tilt" || value === "focus" || value === "exposure" || value === "autofocus") {
		return value;
	}
	return "zoom";
}

function normalizePtzDialControl(value: unknown): PtzDialSettings["control"] {
	if (value === "pan" || value === "tilt" || value === "focus" || value === "exposure") {
		return value;
	}
	return "zoom";
}

function normalizePtzMode(value: unknown): PtzKeySettings["mode"] {
	if (value === "absolute") {
		return "absolute";
	}
	return "relative";
}

function defaultPtzValue(control: PtzKeySettings["control"]): string {
	if (control === "autofocus") {
		return "true";
	}
	return "0.1";
}

function normalizePtzDialPushAction(value: unknown): PtzDialSettings["pushAction"] {
	if (value === "autofocusOn" || value === "autofocusOff" || value === "cycleControl") {
		return value;
	}
	return "none";
}

function normalizeMixerCommand(value: unknown): MixerControlSettings["command"] {
	if (value === "setGuestSlot" || value === "muteAllGuests" || value === "transferAllGuests") {
		return value;
	}
	return "layout";
}

function normalizeMixerMuteBehavior(value: unknown): MixerControlSettings["muteBehavior"] {
	if (value === "on" || value === "off") {
		return value;
	}
	return "toggle";
}

function normalizeValueDialControl(value: unknown): ValueDialSettings["control"] {
	if (value === "panning" || value === "bitrate" || value === "bufferDelay") {
		return value;
	}
	return "volume";
}

function normalizeValueDialPushAction(value: unknown): ValueDialSettings["pushAction"] {
	if (value === "none" || value === "cycleControl") {
		return value;
	}
	return "reset";
}

function valueDialDefaults(control: ValueDialSettings["control"]): { value: string; min: string; max: string; step: string; resetValue: string } {
	if (control === "panning") {
		return { value: "90", min: "0", max: "180", step: "5", resetValue: "90" };
	}
	if (control === "bitrate") {
		return { value: "2500", min: "0", max: "6000", step: "250", resetValue: "-1" };
	}
	if (control === "bufferDelay") {
		return { value: "0", min: "0", max: "5000", step: "100", resetValue: "0" };
	}
	return { value: "100", min: "0", max: "200", step: "5", resetValue: "100" };
}

function normalizeSceneMode(value: unknown): GuestSceneSettings["mode"] {
	if (value === "on" || value === "off") {
		return value;
	}
	return "toggle";
}

function stringOrEmpty(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePositiveString(value: unknown, fallback: string): string {
	const text = stringOrEmpty(value);
	const parsed = text ? Number(text) : NaN;
	return Number.isFinite(parsed) && parsed > 0 ? text : fallback;
}

function normalizeNumberString(value: unknown, fallback: string): string {
	const text = stringOrEmpty(value);
	const parsed = text ? Number(text) : NaN;
	return Number.isFinite(parsed) ? text : fallback;
}

function emptyToUndefined<T>(value: T): T | undefined {
	return value === "" || value === null ? undefined : value;
}
