import streamDeck from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { VdoClient } from "./api/vdo-client.js";
import { normalizeGlobalSettings } from "./api/settings.js";
import type { ConnectionStateName, GlobalSettings } from "./api/types.js";
import { SelectedTargetStore } from "./state/selected-target-store.js";
import { SessionStore } from "./state/session-store.js";
import { sendActionError } from "./actions/action-feedback.js";

export const vdoClient = new VdoClient();
export const sessionStore = new SessionStore();
export const selectedTargetStore = new SelectedTargetStore();

const DETAILS_REFRESH_UPDATES = new Set(["details", "newViewConnection", "endViewConnection", "streamAdded", "seeding"]);
const GUEST_LIST_REFRESH_UPDATES = new Set(["newViewConnection", "endViewConnection", "positionChange"]);
let refreshTimer: NodeJS.Timeout | null = null;
let pendingGuestListRefresh = false;
let pollTimer: NodeJS.Timeout | null = null;
let pollInFlight = false;

export async function initializeServices(): Promise<void> {
	const settings = normalizeGlobalSettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
	registerPropertyInspectorMessages();
	selectedTargetStore.subscribe(() => {
		if (streamDeck.ui.action) void sendInspectorTargets().catch(() => undefined);
	});
	vdoClient.onState(state => sessionStore.setConnectionState(state));
	vdoClient.onCallback(callback => sessionStore.applyCallback(callback));
	vdoClient.onUpdate(update => {
		sessionStore.applyUpdate(update);
		if (update.action && (DETAILS_REFRESH_UPDATES.has(update.action) || GUEST_LIST_REFRESH_UPDATES.has(update.action))) {
			scheduleStateRefresh(GUEST_LIST_REFRESH_UPDATES.has(update.action));
		}
	});

	vdoClient.configure(settings);
	startDetailsPolling(settings);

	streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>(ev => {
		const next = normalizeGlobalSettings(ev.settings);
		vdoClient.configure(next);
		startDetailsPolling(next);
	});
}

function registerPropertyInspectorMessages(): void {
	streamDeck.ui.onSendToPlugin(async ev => {
		const payload = ev.payload;
		if (!isJsonObject(payload)) {
			return;
		}

		const type = typeof payload.type === "string" ? payload.type : "";
		if (type === "requestStatus") {
			await sendActionError(ev.action);
			await sendInspectorStatus("status");
			await sendInspectorTargets();
		} else if (type === "requestTargets") {
			await refreshState(true);
			await sendInspectorTargets();
		} else if (type === "testConnection") {
			await testConnectionFromInspector();
		} else if (type === "openUrl") {
			await openUrlFromInspector(payload);
		}
	});
}

async function testConnectionFromInspector(): Promise<void> {
	const settings = normalizeGlobalSettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
	if (!settings.apiKey) {
		sessionStore.setConnectionState("missing-key");
		await sendInspectorStatus("connectionTestResult", false, "Enter or generate an API key first.");
		return;
	}

	try {
		vdoClient.configure(settings);
		let ok = false;
		if (settings.httpFallback === false) {
			const response = waitForFreshPageResponse((settings.requestTimeoutMs || 5000) + 1500);
			// If the socket is still opening, its normal startup probe will send
			// getDetails. Only a fresh page response counts as a successful test.
			await vdoClient.sendCommand({ action: "getDetails" }).catch(() => undefined);
			ok = await response;
		} else {
			try {
				await vdoClient.sendCommand({ action: "getDetails" });
				ok = isVdoConnected();
			} catch {
				ok = false;
			}
		}
		await sendInspectorStatus(
			"connectionTestResult",
			ok,
			ok ? "VDO.Ninja page answered." : isVdoConnected() ? "No fresh response from the VDO.Ninja page." : statusMessage(vdoClient.connectionState)
		);
	} catch (error) {
		await sendInspectorStatus(
			"connectionTestResult",
			false,
			error instanceof Error ? error.message : "Connection test failed."
		);
	}
}

function isVdoConnected(): boolean {
	return vdoClient.connectionState === "connected";
}

async function openUrlFromInspector(payload: JsonObject): Promise<void> {
	const url = typeof payload.url === "string" ? payload.url.trim() : "";
	if (!isHttpUrl(url)) {
		await sendInspectorResponse({ type: "openUrlResult", ok: false, message: "Only http:// and https:// URLs can be opened." });
		return;
	}

	try {
		await streamDeck.system.openUrl(url);
		await sendInspectorResponse({ type: "openUrlResult", ok: true, message: "Opened generated VDO.Ninja link." });
	} catch (error) {
		await sendInspectorResponse({
			type: "openUrlResult",
			ok: false,
			message: error instanceof Error ? error.message : "Could not open URL."
		});
	}
}

function waitForFreshPageResponse(timeoutMs: number): Promise<boolean> {
	return new Promise(resolve => {
		const finish = (ok: boolean) => {
			clearTimeout(timer);
			unsubscribeCallback();
			unsubscribeUpdate();
			resolve(ok);
		};
		const unsubscribeCallback = vdoClient.onCallback(() => finish(true));
		const unsubscribeUpdate = vdoClient.onUpdate(() => finish(true));
		const timer = setTimeout(() => finish(false), timeoutMs);
	});
}

async function sendInspectorStatus(type: string, ok?: boolean, message?: string): Promise<void> {
	await sendInspectorResponse({
		type,
		ok: ok ?? vdoClient.connectionState === "connected",
		state: vdoClient.connectionState,
		streamCount: sessionStore.getStreamCount(),
		transport: vdoClient.getTransportStats(),
		capabilities: getInspectorCapabilities(),
		message: message || statusMessage(vdoClient.connectionState)
	});
}

async function sendInspectorTargets(): Promise<void> {
	await sendInspectorResponse({
		type: "targetChoices",
		streams: sessionStore.getStreamChoices({ includeLocal: false }),
		selectedStreamID: selectedTargetStore.getSelectedStreamID()
	});
}

async function sendInspectorResponse(payload: JsonObject): Promise<void> {
	await streamDeck.ui.sendToPropertyInspector(payload);
}

function statusMessage(state: ConnectionStateName): string {
	if (state === "connected") {
		return "VDO.Ninja page answered.";
	}
	if (state === "missing-key") {
		return "Enter or generate an API key first.";
	}
	if (state === "connecting") {
		return "Connecting to the API relay.";
	}
	if (state === "no-page") {
		return "Waiting for a VDO.Ninja page using this API key.";
	}
	if (state === "timeout") {
		return "Timed out waiting for a VDO.Ninja page to answer.";
	}
	if (state === "error") {
		return "The API connection reported an error.";
	}
	return "Disconnected from the API relay.";
}

function getInspectorCapabilities(): JsonObject {
	const local = sessionStore.getLocalStream();
	return {
		director: local?.director === true,
		slotmodeKnown: typeof local?.slotmode !== "undefined",
		slotmode: typeof local?.slotmode === "number" ? local.slotmode : local?.slotmode === true,
		ptzKnown: typeof local?.ptz !== "undefined",
		ptz: local?.ptz === true,
		ptzSlider: local?.ptzSlider === true,
		remote: local?.remote === true
	};
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function isJsonObject(value: JsonValue): value is JsonObject {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function scheduleStateRefresh(includeGuestList: boolean): void {
	pendingGuestListRefresh = pendingGuestListRefresh || includeGuestList;
	if (refreshTimer) {
		clearTimeout(refreshTimer);
	}
	refreshTimer = setTimeout(() => {
		const shouldRefreshGuestList = pendingGuestListRefresh;
		pendingGuestListRefresh = false;
		refreshTimer = null;
		void refreshState(shouldRefreshGuestList);
	}, 250);
}

async function refreshState(includeGuestList: boolean): Promise<void> {
	await Promise.all([
		vdoClient.sendCommand({ action: "getDetails" }).catch(() => undefined),
		includeGuestList ? vdoClient.sendCommand({ action: "getGuestList" }).catch(() => undefined) : Promise.resolve(undefined)
	]);
}

function startDetailsPolling(settings: GlobalSettings): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	if (!settings.apiKey) {
		return;
	}
	const poll = () => {
		if (pollInFlight) {
			return;
		}
		pollInFlight = true;
		refreshState(true)
			.catch(() => undefined)
			.finally(() => {
				pollInFlight = false;
			});
	};

	// Fetch both streams and numbered guest positions immediately. VDO's API
	// relay can occasionally miss a live connection update, so relying on that
	// event alone leaves fixed-slot actions unable to resolve an otherwise
	// visible guest until another position event happens.
	poll();
	pollTimer = setInterval(poll, settings.detailsPollMs || 5000);
}
