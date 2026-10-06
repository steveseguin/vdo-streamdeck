import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ValueDialAction } from "../src/actions/value-dial.js";
import { selectedTargetStore, sessionStore, vdoClient } from "../src/services.js";

function dial(initial: Record<string, unknown>) {
	let settings = initial;
	return {
		id: "target-lifecycle-dial",
		getSettings: vi.fn(async () => settings),
		setSettings: vi.fn(async next => { settings = next; }),
		setTitle: vi.fn(), setFeedback: vi.fn(), setTriggerDescription: vi.fn(), showAlert: vi.fn()
	};
}

const settings = { scope: "guest", targetMode: "selected", control: "volume", step: "5", intervalMs: 100 };
function rotate(handler: ValueDialAction, action: ReturnType<typeof dial>, currentSettings: Record<string, unknown> = settings) {
	return handler.onDialRotate({ action, payload: { settings: currentSettings, ticks: 1 } } as never);
}

function deferred() {
	let resolve!: (value: { result: boolean }) => void;
	const promise = new Promise<{ result: boolean }>(done => { resolve = done; });
	return { promise, resolve };
}

beforeEach(() => {
	vi.useFakeTimers();
	sessionStore.applyCallback({ action: "getDetails", result: {
		director: { streamID: "director", localStream: true, director: true },
		guestA: { streamID: "guestA", UUID: "uuidA", position: 1, others: { volume: "100" } },
		guestB: { streamID: "guestB", UUID: "uuidB", position: 2, others: { volume: "20" } }
	} });
	selectedTargetStore.setSelectedStreamID("guestA");
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	selectedTargetStore.clear();
});

describe("value dial target lifecycle", () => {
	it("starts from the new guest's volume during the previous guest's persistence window", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const action = dial(settings);
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(1);
		selectedTargetStore.setSelectedStreamID("guestB");
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(100);
		expect(send.mock.calls.map(([payload]) => payload)).toEqual([
			{ action: "volume", target: "uuidA", value: 105 },
			{ action: "volume", target: "uuidB", value: 25 }
		]);
	});

	it("does not carry the previous guest's in-flight value into a new rotation", async () => {
		const first = deferred();
		const send = vi.spyOn(vdoClient, "sendCommand").mockImplementationOnce(() => first.promise).mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const action = dial(settings);
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(1);
		selectedTargetStore.setSelectedStreamID("guestB");
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(100);
		first.resolve({ result: true });
		await vi.advanceTimersByTimeAsync(600);
		expect(send.mock.calls.map(([payload]) => payload)).toEqual([
			{ action: "volume", target: "uuidA", value: 105 },
			{ action: "volume", target: "uuidB", value: 25 }
		]);
		expect(await action.getSettings()).toMatchObject({ value: "25" });
	});

	it.each(["slot", "firstHeld"])("uses the new guest's observed volume when %s resolves to a different stream", async targetMode => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const currentSettings = { ...settings, targetMode, target: "1" };
		const action = dial(currentSettings);
		sessionStore.applyUpdate({ action: "details", value: { guestA: { others: { volume: "100", "remove-queue": true } } } });
		await rotate(handler, action, currentSettings);
		await vi.advanceTimersByTimeAsync(1);
		sessionStore.applyUpdate({ action: "details", value: {
			guestA: { position: 2, others: { volume: "100", "remove-queue": false } },
			guestB: { position: 1, others: { volume: "20", "remove-queue": true } }
		} });
		await rotate(handler, action, currentSettings);
		await vi.advanceTimersByTimeAsync(100);
		expect(send).toHaveBeenLastCalledWith({ action: "volume", target: targetMode === "slot" ? "1" : "uuidB", value: 25 }, { awaitCallback: false });
	});

	it("does not reuse or persist a cached value after an inspector target edit", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const firstSettings = { ...settings, targetMode: "streamId", target: "guestA" };
		const action = dial(firstSettings);
		await rotate(handler, action, firstSettings);
		await vi.advanceTimersByTimeAsync(1);
		const nextSettings = { ...firstSettings, target: "guestB" };
		await action.setSettings(nextSettings);
		await rotate(handler, action, nextSettings);
		await vi.advanceTimersByTimeAsync(600);
		expect(send).toHaveBeenLastCalledWith({ action: "volume", target: "guestB", value: 25 }, { awaitCallback: false });
		expect(await action.getSettings()).toMatchObject({ target: "guestB", value: "25" });
	});

	it("drops queued input when an unobserved numeric target changes", async () => {
		sessionStore.applyCallback({ action: "getDetails", result: {
			viewer: { streamID: "viewer", localStream: true, director: false }
		} });
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const firstSettings = { ...settings, targetMode: "slot", target: "1", value: "50" };
		const action = dial(firstSettings);
		await rotate(handler, action, firstSettings);
		await action.setSettings({ ...firstSettings, target: "2" });
		await vi.advanceTimersByTimeAsync(600);
		expect(send).not.toHaveBeenCalled();
	});

	it("starts from observed volume when a stream reconnects with a different UUID", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const action = dial(settings);
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(1);
		sessionStore.applyUpdate({ action: "details", value: {
			guestA: { UUID: "replacementUUID", others: { volume: "20" } }
		} });
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(600);
		expect(send).toHaveBeenLastCalledWith({ action: "volume", target: "replacementUUID", value: 25 }, { awaitCallback: false });
		expect(await action.getSettings()).toMatchObject({ value: "25" });
	});

	it("drops a queued value when selection changes before its send", async () => {
		const first = deferred();
		const send = vi.spyOn(vdoClient, "sendCommand").mockImplementationOnce(() => first.promise).mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const action = dial(settings);
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(1);
		await rotate(handler, action);
		selectedTargetStore.setSelectedStreamID("guestB");
		first.resolve({ result: true });
		await vi.advanceTimersByTimeAsync(1000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(action.setSettings).not.toHaveBeenCalled();
	});

	it("does not persist the old guest's value after selection changes", async () => {
		vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const action = dial(settings);
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(1);
		selectedTargetStore.setSelectedStreamID("guestB");
		await vi.advanceTimersByTimeAsync(500);
		expect(action.setSettings).not.toHaveBeenCalled();
	});

	it("rechecks the target after awaiting settings for persistence", async () => {
		vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const action = dial(settings);
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(1);
		let complete!: (value: Record<string, unknown>) => void;
		action.getSettings.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
		await vi.advanceTimersByTimeAsync(500);
		selectedTargetStore.setSelectedStreamID("guestB");
		complete(settings);
		await vi.advanceTimersByTimeAsync(1);
		expect(action.setSettings).not.toHaveBeenCalled();
	});

	it("preserves same-target persistence and merges unrelated inspector edits", async () => {
		vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const action = dial(settings);
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(1);
		await action.setSettings({ ...settings, title: "New title" });
		await vi.advanceTimersByTimeAsync(500);
		expect(await action.getSettings()).toMatchObject({ value: "105", title: "New title" });
	});

	it("still flushes the current guest's value when the dial disappears", async () => {
		vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const action = dial(settings);
		await rotate(handler, action);
		await vi.advanceTimersByTimeAsync(1);
		handler.onWillDisappear({ action, payload: { settings } } as never);
		await vi.advanceTimersByTimeAsync(1);
		expect(await action.getSettings()).toMatchObject({ value: "105" });
	});
});
