import type { JsonObject, JsonValue } from "@elgato/utils";

export type ConnectionStateName =
	| "missing-key"
	| "connecting"
	| "connected"
	| "no-page"
	| "timeout"
	| "disconnected"
	| "error";

export interface GlobalSettings extends JsonObject {
	apiKey?: string;
	apiHost?: string;
	useTls?: boolean;
	httpFallback?: boolean;
	requestTimeoutMs?: number;
	detailsPollMs?: number;
	statsPollMs?: number;
	setupBaseUrl?: string;
	setupPageType?: "director" | "push" | "view" | "scene" | "custom";
	setupRoom?: string;
	setupStreamId?: string;
	setupScene?: string;
	setupCustomUrl?: string;
}

export interface VdoCommandPayload extends JsonObject {
	action: string;
	target?: JsonValue;
	value?: JsonValue;
	value2?: JsonValue;
	get?: string;
}

export interface VdoCallback extends JsonObject {
	action?: string;
	target?: JsonValue;
	value?: JsonValue;
	value2?: JsonValue;
	get?: string;
	result?: JsonValue;
	error?: boolean;
	message?: string;
}

export interface VdoUpdate extends JsonObject {
	streamID?: string;
	action?: string;
	value?: JsonValue;
}

export interface VdoClientMessage extends JsonObject {
	callback?: VdoCallback;
	update?: VdoUpdate;
	msg?: JsonObject;
}

export interface StreamState extends JsonObject {
	streamID: string;
	UUID?: string;
	label?: string;
	localStream?: boolean;
	localstream?: boolean;
	director?: boolean;
	codirector?: boolean;
	seeding?: boolean;
	muted?: boolean;
	videoMuted?: boolean;
	directorMuted?: boolean;
	directorVideoHide?: boolean;
	speakerMuted?: boolean;
	scenes?: JsonObject;
	others?: JsonObject;
	videoVolume?: number;
	position?: number | null;
	slot?: number | boolean;
}

export interface GuestListEntry extends JsonObject {
	streamID: string;
	label?: string;
}

export interface StreamChoice extends JsonObject {
	streamID: string;
	UUID?: string;
	label: string;
	position?: number;
	localStream?: boolean;
	held?: boolean;
	handRaised?: boolean;
	scenes?: JsonObject;
}

export type GuestTargetMode = "slot" | "streamId" | "firstHeld" | "selected";

export interface LocalControlSettings extends JsonObject {
	command?: string;
	behavior?: "toggle" | "on" | "off" | "press" | "pushToTalk" | "pushToMute";
	dangerousConfirm?: boolean;
	title?: string;
}

export interface GuestCommandSettings extends JsonObject {
	command?: string;
	targetMode?: GuestTargetMode;
	target?: string;
	behavior?: "toggle" | "on" | "off" | "press";
	value?: string;
	title?: string;
	dangerousConfirm?: boolean;
}

export interface GuestSceneSettings extends JsonObject {
	targetMode?: GuestTargetMode;
	target?: string;
	scene?: string;
	mode?: "toggle" | "on" | "off";
	title?: string;
}

export interface SelectGuestSettings extends JsonObject {
	mode?: "fixed" | "next" | "previous" | "firstHeld" | "clear";
	targetMode?: Exclude<GuestTargetMode, "selected">;
	target?: string;
	title?: string;
}

export interface PtzKeySettings extends JsonObject {
	scope?: "local" | "guest";
	targetMode?: GuestTargetMode;
	target?: string;
	control?: "zoom" | "pan" | "tilt" | "focus" | "exposure" | "autofocus";
	mode?: "relative" | "absolute";
	direction?: "positive" | "negative";
	value?: string;
	disableAutofocus?: boolean;
	title?: string;
}

export interface PtzDialSettings extends JsonObject {
	scope?: "local" | "guest";
	targetMode?: GuestTargetMode;
	target?: string;
	control?: "zoom" | "pan" | "tilt" | "focus" | "exposure";
	step?: string;
	intervalMs?: number;
	acceleration?: boolean;
	invert?: boolean;
	pushAction?: "none" | "autofocusOn" | "autofocusOff" | "cycleControl";
	disableAutofocus?: boolean;
	title?: string;
}

export interface MixerControlSettings extends JsonObject {
	command?: "layout" | "setGuestSlot" | "muteAllGuests" | "transferAllGuests";
	targetMode?: GuestTargetMode;
	target?: string;
	layout?: string;
	slot?: string;
	muteBehavior?: "toggle" | "on" | "off";
	transferRoom?: string;
	title?: string;
	dangerousConfirm?: boolean;
}

export interface ValueDialSettings extends JsonObject {
	scope?: "local" | "guest";
	targetMode?: GuestTargetMode;
	target?: string;
	control?: "volume" | "panning" | "bitrate" | "bufferDelay";
	value?: string;
	min?: string;
	max?: string;
	step?: string;
	resetValue?: string;
	intervalMs?: number;
	acceleration?: boolean;
	invert?: boolean;
	pushAction?: "none" | "reset" | "cycleControl";
	bufferApply?: "default" | "all";
	title?: string;
}

export interface CustomCommandSettings extends JsonObject {
	action?: string;
	target?: JsonValue;
	value?: JsonValue;
	value2?: JsonValue;
	title?: string;
	awaitCallback?: boolean;
}

export interface ConnectionStatusSettings extends JsonObject {
	title?: string;
}
