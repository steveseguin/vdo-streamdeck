import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PtzDialSettings } from "../api/types.js";

vi.mock("@elgato/streamdeck", () => ({
	action: () => (constructor: unknown) => constructor,
	SingletonAction: class { actions: unknown[] = []; },
	default: { ui: {} }
}));
vi.mock("../services.js", async () => {
	const { SessionStore } = await import("../state/session-store.js");
	const { SelectedTargetStore } = await import("../state/selected-target-store.js");
	return {
		sessionStore: new SessionStore(), selectedTargetStore: new SelectedTargetStore(),
		vdoClient: { sendCommand: vi.fn().mockResolvedValue({ result: true }) }
	};
});

const base: PtzDialSettings = { scope: "guest", targetMode: "selected", control: "pan", step: "0.05", intervalMs: 80 };
let dial: import("./ptz-dial.js").PtzDialAction;
let services: typeof import("../services.js");
let settings: PtzDialSettings;
let context: ReturnType<typeof makeContext>;

function makeContext() {
	return {
		id: "ptz-dial", isDial: () => true,
		getSettings: vi.fn(async () => settings),
		setSettings: vi.fn(async (next: PtzDialSettings) => { settings = next; }),
		setTitle: vi.fn().mockResolvedValue(undefined), setFeedback: vi.fn().mockResolvedValue(undefined),
		setTriggerDescription: vi.fn().mockResolvedValue(undefined), showAlert: vi.fn().mockResolvedValue(undefined)
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(res => { resolve = res; });
	return { promise, resolve };
}
function roster({ swapped = false, held = "a", uuid = "uuid-a", includeA = true } = {}) {
	services.sessionStore.applyCallback({ action: "getDetails", result: {
		director: { streamID: "director", localStream: true, director: true },
		...(includeA ? { a: { streamID: "a", UUID: uuid, position: swapped ? 2 : 1, others: { "remove-queue": held === "a" } } } : {}),
		b: { streamID: "b", UUID: "uuid-b", position: swapped ? 1 : 2, others: { "remove-queue": held === "b" } }
	} });
}
async function rotate(ticks: number) {
	await dial.onDialRotate({ action: context, payload: { settings, ticks } } as never);
}
async function edit(next: Partial<PtzDialSettings>) {
	settings = { ...settings, ...next };
	await dial.onDidReceiveSettings?.({ action: context, payload: { settings } } as never);
}
async function advance(ms = 80) { await vi.advanceTimersByTimeAsync(ms); }
function payloads() { return vi.mocked(services.vdoClient.sendCommand).mock.calls.map(([payload]) => payload); }
async function queue(ticks = 4) {
	await rotate(1); await advance(0);
	vi.mocked(services.vdoClient.sendCommand).mockClear();
	await rotate(ticks);
}
beforeEach(async () => {
	vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
	services = await import("../services.js");
	vi.mocked(services.vdoClient.sendCommand).mockReset().mockResolvedValue({ result: true });
	services.selectedTargetStore.clear();
	services.sessionStore.applyCallback({ action: "getDetails", result: {} });
	settings = { ...base }; context = makeContext();
	const { PtzDialAction } = await import("./ptz-dial.js"); dial = new PtzDialAction();
	roster(); services.selectedTargetStore.setSelectedStreamID("a");
});
afterEach(() => {
	dial.onWillDisappear({ action: context } as never);
	vi.clearAllTimers(); vi.useRealTimers();
});

describe("PTZ dial queued movement ownership", () => {
	it("drops queued movement when selected guest changes", async () => {
		await queue(); services.selectedTargetStore.setSelectedStreamID("b"); await advance();
		expect(payloads()).toEqual([]);
	});
	it("does not revive old ticks after selection A to B to A", async () => {
		await queue(); services.selectedTargetStore.setSelectedStreamID("b");
		services.selectedTargetStore.setSelectedStreamID("a"); await advance(); expect(payloads()).toEqual([]);
	});
	it("does not combine old guest ticks with a fresh guest rotation", async () => {
		await queue(4); services.selectedTargetStore.setSelectedStreamID("b"); await rotate(1); await advance();
		expect(payloads()).toEqual([{ action: "ptzPan", target: "uuid-b", value: 0.05 }]);
	});
	it("drops unresolved-target ticks when a guest is later selected", async () => {
		services.selectedTargetStore.clear(); await rotate(4);
		services.selectedTargetStore.setSelectedStreamID("b"); await advance(); expect(payloads()).toEqual([]);
	});
	it("drops first-held ticks when the held guest changes", async () => {
		settings.targetMode = "firstHeld"; await queue(); roster({ held: "b" }); await advance(); expect(payloads()).toEqual([]);
	});
	it("drops fixed-position ticks when the roster swaps that position", async () => {
		settings = { ...settings, targetMode: "slot", target: "1" };
		await queue(); roster({ swapped: true }); await advance(); expect(payloads()).toEqual([]);
	});
	it("drops queued ticks if the selected stream reconnects with a new UUID", async () => {
		await queue(); roster({ uuid: "uuid-a-new" }); await advance(); expect(payloads()).toEqual([]);
	});
	it("drops ticks when the target leaves, even if it returns before the timer", async () => {
		await queue(); roster({ includeA: false }); roster(); await advance(); expect(payloads()).toEqual([]);
	});
	it.each([
		{ targetMode: "streamId", target: "b" }, { scope: "local" }, { control: "tilt" },
		{ step: "0.2" }, { invert: true }, { acceleration: true }, { disableAutofocus: true }
	] satisfies Partial<PtzDialSettings>[]) ("drops queued ticks on movement-setting change %j", async next => {
		await queue(); await edit(next); await advance(); expect(payloads()).toEqual([]);
	});
	it("invalidates immediately on a settings event while getSettings is delayed", async () => {
		const read = deferred<PtzDialSettings>(); context.getSettings.mockReturnValueOnce(read.promise);
		await rotate(4); await advance(0); await edit({ targetMode: "streamId", target: "b" });
		read.resolve({ ...base }); await advance(); expect(payloads()).toEqual([]);
	});
	it("drops movement when selection changes during delayed getSettings", async () => {
		const read = deferred<PtzDialSettings>(); context.getSettings.mockReturnValueOnce(read.promise);
		await rotate(4); await advance(0); services.selectedTargetStore.setSelectedStreamID("b");
		read.resolve(settings); await advance(); expect(payloads()).toEqual([]);
	});
	it("checks changed settings returned by getSettings even without a settings event", async () => {
		await queue(); settings = { ...settings, targetMode: "streamId", target: "b" };
		await advance(); expect(payloads()).toEqual([]);
	});
	it("does not revive ticks after settings change away and back", async () => {
		await queue(); await edit({ control: "tilt" }); await edit({ control: "pan" });
		await advance(); expect(payloads()).toEqual([]);
	});
	it("takes only fresh ticks when a rotation arrives with changed settings", async () => {
		await queue(); settings = { ...settings, control: "tilt" }; await rotate(1); await advance();
		expect(payloads()).toEqual([{ action: "ptzTilt", target: "uuid-a", value: 0.05 }]);
	});
	it("invalidates a changed roster while getSettings is delayed", async () => {
		settings = { ...settings, targetMode: "slot", target: "1" };
		const read = deferred<PtzDialSettings>(); context.getSettings.mockReturnValueOnce(read.promise);
		await rotate(4); await advance(0); roster({ swapped: true });
		read.resolve(settings); await advance(); expect(payloads()).toEqual([]);
	});
	it("drops explicit-stream ticks on departure even when no UUID was known", async () => {
		settings = { ...settings, targetMode: "streamId", target: "a" };
		roster({ uuid: "" }); await queue(); roster({ includeA: false });
		await advance(); expect(payloads()).toEqual([]);
	});
	it("does not let a slow old render schedule a replacement burst", async () => {
		const rendered = deferred<void>(); context.setTitle.mockReturnValueOnce(rendered.promise);
		const oldRotation = rotate(4);
		services.selectedTargetStore.setSelectedStreamID("b");
		await rotate(1); await advance(0); await rotate(2);
		rendered.resolve(); await oldRotation; await advance(79);
		expect(payloads()).toEqual([{ action: "ptzPan", target: "uuid-b", value: 0.05 }]);
		await advance(1); expect(payloads().at(-1)).toEqual({ action: "ptzPan", target: "uuid-b", value: 0.1 });
	});
	it("stops remaining autofocus/focus payloads after a target change in flight", async () => {
		settings = { ...settings, control: "focus", disableAutofocus: true };
		const send = deferred<{ result: boolean }>(); vi.mocked(services.vdoClient.sendCommand).mockReturnValueOnce(send.promise);
		await rotate(4); await advance(0);
		expect(payloads()).toEqual([{ action: "ptzAutofocus", target: "uuid-a", value: false }]);
		services.selectedTargetStore.setSelectedStreamID("b"); send.resolve({ result: true });
		await advance(); expect(payloads()).toHaveLength(1);
	});
	it("old in-flight completion cannot flush a new guest queue early or mix ticks", async () => {
		const send = deferred<{ result: boolean }>(); vi.mocked(services.vdoClient.sendCommand).mockReturnValueOnce(send.promise);
		await rotate(4); await advance(0); services.selectedTargetStore.setSelectedStreamID("b");
		await rotate(1); await advance(0); await rotate(2); send.resolve({ result: true }); await advance(79);
		expect(payloads()).toEqual([
			{ action: "ptzPan", target: "uuid-a", value: 0.2 }, { action: "ptzPan", target: "uuid-b", value: 0.05 }
		]);
		await advance(1); expect(payloads().at(-1)).toEqual({ action: "ptzPan", target: "uuid-b", value: 0.1 });
	});
	it.each(["settings", "roster"])("stops remaining focus payloads after an in-flight %s change", async change => {
		settings = { ...settings, targetMode: "slot", target: "1", control: "focus", disableAutofocus: true };
		const send = deferred<{ result: boolean }>(); vi.mocked(services.vdoClient.sendCommand).mockReturnValueOnce(send.promise);
		await rotate(4); await advance(0);
		if (change === "settings") await edit({ target: "2" });
		else roster({ swapped: true });
		send.resolve({ result: true }); await advance();
		expect(payloads()).toEqual([{ action: "ptzAutofocus", target: "1", value: false }]);
	});
	it("drops work when the dial disappears during getSettings", async () => {
		const read = deferred<PtzDialSettings>(); context.getSettings.mockReturnValueOnce(read.promise);
		await rotate(4); await advance(0); dial.onWillDisappear({ action: context } as never);
		read.resolve(settings); await advance(); expect(payloads()).toEqual([]);
	});
});

describe("PTZ dial unchanged-target controls", () => {
	it.each(["slot", "firstHeld"] as const)("preserves unchanged %s targeting through refreshes", async targetMode => {
		settings = { ...settings, targetMode, target: "1" }; await queue(); roster(); await advance();
		expect(payloads()).toEqual([{ action: "ptzPan", target: targetMode === "slot" ? "1" : "uuid-a", value: 0.2 }]);
	});
	it("reports a missing target without sending a movement", async () => {
		services.selectedTargetStore.clear(); await rotate(1); await advance();
		expect(context.showAlert).toHaveBeenCalledOnce(); expect(payloads()).toEqual([]);
	});
	it("releases the queue after getSettings rejects so later ticks can send", async () => {
		context.getSettings.mockRejectedValueOnce(new Error("Settings unavailable"));
		await rotate(1); await advance(); expect(context.showAlert).toHaveBeenCalledOnce();
		await rotate(2); await advance();
		expect(payloads()).toEqual([{ action: "ptzPan", target: "uuid-a", value: 0.1 }]);
	});
	it("accumulates ticks and preserves the interval", async () => {
		await queue(2); await rotate(3); await advance(79); expect(payloads()).toEqual([]); await advance(1);
		expect(payloads()).toEqual([{ action: "ptzPan", target: "uuid-a", value: 0.25 }]);
	});
	it("preserves pending movement across unrelated state, roster and selection notifications", async () => {
		settings = { ...settings, targetMode: "streamId", target: "a" }; await queue();
		services.selectedTargetStore.setSelectedStreamID("b");
		services.sessionStore.applyUpdate({ action: "remoteMuted", streamID: "b", value: true });
		roster({ swapped: true }); await advance();
		expect(payloads()).toEqual([{ action: "ptzPan", target: "a", value: 0.2 }]);
	});
	it("preserves a selected guest through position changes and title-only settings edits", async () => {
		await queue(); roster({ swapped: true }); await edit({ title: "Camera {label}" }); await advance();
		expect(payloads()).toEqual([{ action: "ptzPan", target: "uuid-a", value: 0.2 }]);
	});
	it("preserves same-target settings during delayed getSettings", async () => {
		const read = deferred<PtzDialSettings>(); context.getSettings.mockReturnValueOnce(read.promise);
		await rotate(4); await advance(0); roster(); read.resolve(settings); await advance();
		expect(payloads()).toEqual([{ action: "ptzPan", target: "uuid-a", value: 0.2 }]);
	});
	it("continues same-target autofocus/focus payloads and subsequent queued ticks", async () => {
		settings = { ...settings, control: "focus", disableAutofocus: true };
		const send = deferred<{ result: boolean }>(); vi.mocked(services.vdoClient.sendCommand).mockReturnValueOnce(send.promise);
		await rotate(1); await advance(0); await rotate(2); send.resolve({ result: true }); await advance(80);
		expect(payloads()).toEqual([
			{ action: "ptzAutofocus", target: "uuid-a", value: false }, { action: "ptzFocus", target: "uuid-a", value: 0.05 },
			{ action: "ptzAutofocus", target: "uuid-a", value: false }, { action: "ptzFocus", target: "uuid-a", value: 0.1 }
		]);
	});
	it("retains local inversion and acceleration despite guest changes", async () => {
		settings = { ...settings, scope: "local", invert: true, acceleration: true }; await queue(4);
		services.selectedTargetStore.setSelectedStreamID("b"); roster({ swapped: true }); await advance();
		expect(payloads()).toEqual([{ action: "pan", value: -0.4 }]);
	});
	it("does not send zero or non-finite ticks", async () => {
		await rotate(0); await rotate(NaN); await rotate(Infinity); await advance(); expect(payloads()).toEqual([]);
	});
});
