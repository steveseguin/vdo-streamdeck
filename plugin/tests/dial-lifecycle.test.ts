import { afterEach, describe, expect, it, vi } from "vitest";
import { ValueDialAction } from "../src/actions/value-dial.js";
import { PtzDialAction } from "../src/actions/ptz-dial.js";
import { vdoClient } from "../src/services.js";

function dial(initial: Record<string, unknown>) {
	let settings = initial;
	return {
		id: "test-dial",
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
