import streamDeck from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { VdoClient } from "./api/vdo-client.js";
import { normalizeGlobalSettings } from "./api/settings.js";
import type { ConnectionStateName, GlobalSettings } from "./api/types.js";
import { SelectedTargetStore } from "./state/selected-target-store.js";
import { SessionStore } from "./state/session-store.js";

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
			await sendInspectorStatus("status");
			await sendInspectorTargets();
		} else if (type === "requestTargets") {
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
		try {
			await vdoClient.sendCommand({ action: "getDetails" });
		} catch {
			await waitForConnectionResult((settings.requestTimeoutMs || 5000) + 1500);
		}
		const ok = vdoClient.connectionState === "connected";
		await sendInspectorStatus(
			"connectionTestResult",
			ok,
			ok ? "VDO.Ninja page answered." : statusMessage(vdoClient.connectionState)
		);
	} catch (error) {
		await sendInspectorStatus(
			"connectionTestResult",
			false,
			error instanceof Error ? error.message : "Connection test failed."
		);
	}
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

function waitForConnectionResult(timeoutMs: number): Promise<ConnectionStateName> {
	const terminal = new Set<ConnectionStateName>(["connected", "no-page", "timeout", "error", "disconnected", "missing-key"]);
	if (terminal.has(vdoClient.connectionState) && vdoClient.connectionState !== "disconnected") {
		return Promise.resolve(vdoClient.connectionState);
	}

	return new Promise(resolve => {
		let settled = false;
		let unsubscribe: () => void = () => undefined;
		const timer = setTimeout(() => finish(vdoClient.connectionState === "connecting" ? "timeout" : vdoClient.connectionState), timeoutMs);

		const finish = (state: ConnectionStateName) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			unsubscribe();
			resolve(state);
		};

		unsubscribe = vdoClient.onState(state => {
			if (terminal.has(state)) {
				finish(state);
			}
		});
	});
}

async function sendInspectorStatus(type: string, ok?: boolean, message?: string): Promise<void> {
	await sendInspectorResponse({
		type,
		ok: ok ?? vdoClient.connectionState === "connected",
		state: vdoClient.connectionState,
		streamCount: sessionStore.getStreamCount(),
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
	pollTimer = setInterval(() => {
		if (pollInFlight) {
			return;
		}
		pollInFlight = true;
		vdoClient
			.sendCommand({ action: "getDetails" })
			.catch(() => undefined)
			.finally(() => {
				pollInFlight = false;
			});
	}, settings.detailsPollMs || 2000);
}
