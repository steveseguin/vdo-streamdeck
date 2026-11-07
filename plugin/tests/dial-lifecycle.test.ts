import { afterEach, describe, expect, it, vi } from "vitest";
import { ValueDialAction } from "../src/actions/value-dial.js";
import { PtzDialAction } from "../src/actions/ptz-dial.js";
import { selectedTargetStore, sessionStore, vdoClient } from "../src/services.js";

function dial(initial: Record<string, unknown>) {
	let settings = initial;
	return {
		id: "test-dial",
		isDial: () => true,
		getSettings: vi.fn(async () => settings),
		setSettings: vi.fn(async next => { settings = next; }),
		setTitle: vi.fn(), setFeedback: vi.fn(), setTriggerDescription: vi.fn(), showAlert: vi.fn()
	};
}

describe("queued dial input", () => {
	afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

	it.each(["onDialDown", "onTouchTap"] as const)("ignores %s when PTZ press/touch is set to None, even without a guest", async method => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const settings = { scope: "guest", targetMode: "selected", pushAction: "none" };
		const action = dial(settings);
		await new PtzDialAction()[method]({ action, payload: { settings } } as never);
		expect(send).not.toHaveBeenCalled();
		expect(action.showAlert).not.toHaveBeenCalled();
	});

	it.each(["value", "ptz"])("does not send queued %s ticks after cycling control", async kind => {
		vi.useFakeTimers();
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = kind === "value" ? new ValueDialAction() : new PtzDialAction();
		const settings = { scope: "local", control: kind === "value" ? "volume" : "zoom", value: "50", pushAction: "cycleControl" };
		const action = dial(settings);
		await handler.onDialRotate({ action, payload: { settings, ticks: 1 } } as never);
		await handler.onDialDown({ action, payload: { settings } } as never);
		await vi.runAllTimersAsync();
		expect(send).not.toHaveBeenCalled();
		expect((await action.getSettings()).control).toBe(kind === "value" ? "panning" : "pan");
	});

	it("does not let queued rotation overwrite a value reset", async () => {
		vi.useFakeTimers();
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const settings = { scope: "local", control: "volume", value: "50", pushAction: "reset", resetValue: "100" };
		const action = dial(settings);
		await handler.onDialRotate({ action, payload: { settings, ticks: 1 } } as never);
		await handler.onDialDown({ action, payload: { settings } } as never);
		await vi.runAllTimersAsync();
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("does not persist a late value response over a newly selected control", async () => {
		vi.useFakeTimers();
		let complete!: () => void;
		vi.spyOn(vdoClient, "sendCommand").mockImplementation(() => new Promise(resolve => { complete = () => resolve({ result: true }); }));
		const handler = new ValueDialAction();
		const settings = { scope: "local", control: "volume", value: "50", pushAction: "cycleControl" };
		const action = dial(settings);
		await handler.onDialRotate({ action, payload: { settings, ticks: 1 } } as never);
		await vi.advanceTimersByTimeAsync(1);
		await handler.onDialDown({ action, payload: { settings } } as never);
		complete();
		await vi.runAllTimersAsync();
		expect(await action.getSettings()).toMatchObject({ control: "panning", value: "90" });
	});

	it("sends a clamped queued value only once when the inspector lowers its maximum", async () => {
		vi.useFakeTimers();
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const settings = { scope: "local", control: "volume", value: "50", max: "100" };
		const action = dial(settings);
		await handler.onDialRotate({ action, payload: { settings, ticks: 1 } } as never);
		await action.setSettings({ ...settings, max: "40" });
		await vi.advanceTimersByTimeAsync(1000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0][0]).toMatchObject({ action: "volume", value: 40 });
		vi.clearAllTimers();
	});
});

describe("dial target changes", () => {
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
		selectedTargetStore.clear();
		sessionStore.applyUpdate({ action: "hangup" });
	});

	function roster(swapped = false, uuid = "uuidA") {
		sessionStore.applyCallback({ action: "getDetails", result: {
			director: { streamID: "director", localStream: true, director: true },
			guestA: { streamID: "guestA", UUID: uuid, position: swapped ? 2 : 1, others: { volume: "100", "remove-queue": !swapped } },
			guestB: { streamID: "guestB", UUID: "uuidB", position: swapped ? 1 : 2, others: { volume: "20", "remove-queue": swapped } }
		} });
	}

	it.each(["slot", "firstHeld", "selected"])("starts from the new %s guest's volume after a send", async targetMode => {
		vi.useFakeTimers();
		roster();
		selectedTargetStore.setSelectedStreamID("guestA");
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new ValueDialAction();
		const settings = { scope: "guest", control: "volume", targetMode, target: "1", step: "5" };
		const action = dial(settings);
		await handler.onDialRotate({ action, payload: { settings, ticks: 1 } } as never);
		await vi.advanceTimersByTimeAsync(1);
		roster(true);
		selectedTargetStore.setSelectedStreamID("guestB");
		await handler.onDialRotate({ action, payload: { settings, ticks: 1 } } as never);
		await vi.advanceTimersByTimeAsync(600);
		expect(send.mock.calls.map(([payload]) => payload.value)).toEqual([105, 25]);
		expect(await action.getSettings()).toMatchObject({ value: "25" });
	});

	it.each(["value", "ptz"])("discards queued %s input when a slot changes away and back", async kind => {
		vi.useFakeTimers();
		roster();
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = kind === "value" ? new ValueDialAction() : new PtzDialAction();
		const settings = { scope: "guest", targetMode: "slot", target: "1", control: kind === "value" ? "volume" : "pan" };
		const action = dial(settings);
		await handler.onDialRotate({ action, payload: { settings, ticks: 4 } } as never);
		roster(true);
		roster();
		await vi.advanceTimersByTimeAsync(1000);
		expect(send).not.toHaveBeenCalled();
		expect(action.setSettings).not.toHaveBeenCalled();
	});

	it.each(["value", "ptz"])("discards queued %s input when a stream reconnects", async kind => {
		vi.useFakeTimers();
		roster();
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = kind === "value" ? new ValueDialAction() : new PtzDialAction();
		const settings = { scope: "guest", targetMode: "streamId", target: "guestA", control: kind === "value" ? "volume" : "pan" };
		const action = dial(settings);
		await handler.onDialRotate({ action, payload: { settings, ticks: 4 } } as never);
		roster(false, "replacementUUID");
		await vi.advanceTimersByTimeAsync(1000);
		expect(send).not.toHaveBeenCalled();
	});

	it.each(["value", "ptz"])("cancels %s input when settings change during a delayed read", async kind => {
		vi.useFakeTimers();
		roster();
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = kind === "value" ? new ValueDialAction() : new PtzDialAction();
		const settings = { scope: "guest", targetMode: "streamId", target: "guestA", control: kind === "value" ? "volume" : "pan" };
		const action = dial(settings);
		let finish!: (settings: Record<string, unknown>) => void;
		action.getSettings.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		await handler.onDialRotate({ action, payload: { settings, ticks: 4 } } as never);
		await vi.advanceTimersByTimeAsync(1);
		await handler.onDidReceiveSettings({ action, payload: { settings: { ...settings, target: "guestB" } } } as never);
		finish(settings);
		await vi.advanceTimersByTimeAsync(1000);
		expect(send).not.toHaveBeenCalled();
	});

	it.each(["value", "ptz"])("recovers %s input after a settings read fails", async kind => {
		vi.useFakeTimers();
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = kind === "value" ? new ValueDialAction() : new PtzDialAction();
		const settings = { scope: "local", control: kind === "value" ? "volume" : "pan", value: "50" };
		const action = dial(settings);
		action.getSettings.mockRejectedValueOnce(new Error("Settings unavailable"));
		await handler.onDialRotate({ action, payload: { settings, ticks: 1 } } as never);
		await vi.advanceTimersByTimeAsync(1000);
		expect(action.showAlert).toHaveBeenCalledOnce();
		await handler.onDialRotate({ action, payload: { settings, ticks: 1 } } as never);
		await vi.advanceTimersByTimeAsync(1000);
		expect(send).toHaveBeenCalledOnce();
	});

	it.each(["value", "ptz"])("preserves fixed-guest %s input on unrelated selection and title changes", async kind => {
		vi.useFakeTimers();
		roster();
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = kind === "value" ? new ValueDialAction() : new PtzDialAction();
		const settings = { scope: "guest", targetMode: "streamId", target: "guestA", control: kind === "value" ? "volume" : "pan" };
		const action = dial(settings);
		await handler.onDialRotate({ action, payload: { settings, ticks: 1 } } as never);
		selectedTargetStore.setSelectedStreamID("guestB");
		roster(true);
		await handler.onDidReceiveSettings({ action, payload: { settings: { ...settings, title: "My dial" } } } as never);
		await vi.advanceTimersByTimeAsync(1000);
		expect(send).toHaveBeenCalledOnce();
		expect(send.mock.calls[0][0].target).toBe("guestA");
	});
});
