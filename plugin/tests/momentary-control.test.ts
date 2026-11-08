import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalControlAction } from "../src/actions/local-control.js";
import { sessionStore, vdoClient } from "../src/services.js";
import { ObsClient } from "../src/api/obs-client.js";

function key() {
	return { id: "momentary-test", isKey: () => true, setImage: vi.fn(), setTitle: vi.fn(), setState: vi.fn(), showAlert: vi.fn() };
}

describe("momentary microphone lifecycle", () => {
	afterEach(() => vi.restoreAllMocks());
	it("orders release after an outstanding press request", async () => {
		let finish!: () => void;
		const send = vi.spyOn(vdoClient, "sendCommand")
			.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ result: true }); }))
			.mockResolvedValue({ result: true });
		const handler = new LocalControlAction();
		const action = key();
		const event = { action, payload: { settings: { command: "mic", behavior: "pushToTalk" } } } as never;
		const down = handler.onKeyDown(event);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		const up = handler.onKeyUp(event);
		await Promise.resolve();
		expect(send).toHaveBeenCalledTimes(1);
		finish();
		await Promise.all([down, up]);
		expect(send.mock.calls.map(call => call[0].value)).toEqual([true, false]);
	});

	it("releases the original mic behavior when settings change while held", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new LocalControlAction();
		const action = key();
		await handler.onKeyDown({ action, payload: { settings: { command: "mic", behavior: "pushToTalk" } } } as never);
		await handler.onDidReceiveSettings({ action, payload: { settings: { command: "camera", behavior: "toggle" } } } as never);
		expect(send.mock.calls.map(call => call[0])).toEqual([{ action: "mic", value: true }, { action: "mic", value: false }]);
	});

	it.each(["pushToTalk", "pushToMute"])("releases %s when the key disappears", async behavior => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new LocalControlAction();
		const action = key();
		await handler.onKeyDown({ action, payload: { settings: { command: "mic", behavior } } } as never);
		await handler.onWillDisappear({ action: { id: action.id } } as never);
		expect(send.mock.calls.map(call => call[0].value)).toEqual(behavior === "pushToTalk" ? [true, false] : [false, true]);
	});

	it.each([
		["pushToTalk", "pushToMute", [true, false]],
		["pushToMute", "pushToTalk", [false, true]]
	])("ignores the later key-up when %s changes to %s while held", async (before, after, values) => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new LocalControlAction();
		const action = key();
		await handler.onKeyDown({ action, payload: { settings: { command: "mic", behavior: before } } } as never);
		const changed = { action, payload: { settings: { command: "mic", behavior: after } } } as never;
		await handler.onDidReceiveSettings(changed);
		await handler.onKeyUp(changed);
		expect(send.mock.calls.map(call => call[0].value)).toEqual(values);
	});

	it("ignores a push-to-mute key-up without a matching press", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new LocalControlAction();
		await handler.onKeyUp({ action: key(), payload: { settings: { command: "mic", behavior: "pushToMute" } } } as never);
		expect(send).not.toHaveBeenCalled();
	});

	it("ignores a late key-up after the held key disappears", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new LocalControlAction();
		const action = key();
		const event = { action, payload: { settings: { command: "mic", behavior: "pushToTalk" } } } as never;
		await handler.onKeyDown(event);
		await handler.onWillDisappear({ action: { id: action.id } } as never);
		await handler.onKeyUp(event);
		expect(send.mock.calls.map(call => call[0].value)).toEqual([true, false]);
	});

	it("keeps an outstanding press and settings-change release ordered without a second release", async () => {
		let finish!: () => void;
		const send = vi.spyOn(vdoClient, "sendCommand")
			.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ result: true }); }))
			.mockResolvedValue({ result: true });
		const handler = new LocalControlAction();
		const action = key();
		const down = handler.onKeyDown({ action, payload: { settings: { command: "mic", behavior: "pushToTalk" } } } as never);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		const event = { action, payload: { settings: { command: "mic", behavior: "pushToMute" } } } as never;
		const changed = handler.onDidReceiveSettings(event);
		const up = handler.onKeyUp(event);
		finish();
		await Promise.all([down, changed, up]);
		expect(send.mock.calls.map(call => call[0].value)).toEqual([true, false]);
		await handler.onKeyDown(event);
		await handler.onKeyUp(event);
		expect(send.mock.calls.map(call => call[0].value)).toEqual([true, false, false, true]);
	});
});

describe("OBS microphone hold", () => {
	afterEach(() => { vi.restoreAllMocks(); sessionStore.applyUpdate({ action: "hangup" }); });

	function setup() {
		vi.spyOn(ObsClient.prototype, "connect").mockResolvedValue();
		const unmute = vi.spyOn(ObsClient.prototype, "unmute").mockResolvedValue();
		const release = vi.spyOn(ObsClient.prototype, "release").mockResolvedValue();
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const handler = new LocalControlAction();
		const action = key();
		const settings = { command: "mic", behavior: "pushToTalk", obsSync: true, obsInput: "OBS mic" };
		const event = { action, payload: { settings } } as never;
		return { handler, action, settings, event, send, unmute, release };
	}

	function connectionState(state: string) {
		(vdoClient as unknown as { setState(state: string): void }).setState(state);
	}

	it("controls OBS even when the browser has no active audio track", async () => {
		const { handler, event, action, unmute, send } = setup();
		sessionStore.applyCallback({ action: "getDetails", result: { local: { streamID: "local", localStream: true, audioTrack: false } } });
		await handler.onWillAppear(event);
		expect(action.setTitle).toHaveBeenLastCalledWith("Hold\nTalk");
		await handler.onKeyDown(event);
		expect(unmute).toHaveBeenCalledWith("OBS mic");
		expect(action.setTitle).toHaveBeenLastCalledWith("Mic\nLive");
		await handler.onKeyUp(event);
		expect(send.mock.calls.map(([payload]) => payload.value)).toEqual([true, false]);
		expect(action.showAlert).not.toHaveBeenCalled();
	});

	it("retains the inactive-track guard for ordinary VDO microphone keys", async () => {
		const { handler, action, settings, unmute, send } = setup();
		sessionStore.applyCallback({ action: "getDetails", result: { local: { streamID: "local", localStream: true, audioTrack: false } } });
		await handler.onKeyDown({ action, payload: { settings: { ...settings, obsSync: false } } } as never);
		expect(unmute).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
		expect(action.showAlert).toHaveBeenCalledOnce();
	});

	it("shows Wait until OBS and the caption command have completed", async () => {
		const { handler, event, action, send } = setup();
		let finish!: () => void;
		send.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ result: true }); }));
		const down = handler.onKeyDown(event);
		await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
		await handler.onDidReceiveSettings(event);
		expect(action.setState).toHaveBeenLastCalledWith(0);
		expect(action.setTitle).toHaveBeenLastCalledWith("Mic\nWait");
		finish(); await down;
		expect(action.setTitle).toHaveBeenLastCalledWith("Mic\nLive");
		await handler.onKeyUp(event);
	});

	it("keeps a held OBS mic live when HTTP works during a relay reconnect", async () => {
		const { handler, event, send, release } = setup();
		connectionState("connected");
		await handler.onKeyDown(event);
		connectionState("disconnected");
		await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ action: "getDetails" }));
		expect(release).not.toHaveBeenCalled();
		await handler.onKeyUp(event);
		expect(release).toHaveBeenCalled();
		expect(send.mock.calls.filter(([payload]) => payload.action === "mic").map(([payload]) => payload.value)).toEqual([true, false]);
	});

	it("mutes OBS when the caption page no longer answers", async () => {
		const { handler, event, send, release } = setup();
		connectionState("connected");
		await handler.onKeyDown(event);
		send.mockRejectedValueOnce(new Error("No VDO.Ninja page is joined to this API key"));
		connectionState("error");
		await vi.waitFor(() => expect(release).toHaveBeenCalled());
		await vi.waitFor(() => expect(send).toHaveBeenLastCalledWith({ action: "mic", value: false }, { awaitCallback: false }));
		await handler.onKeyUp(event);
	});

	it("does not cancel a newer hold when an older health check fails", async () => {
		const { handler, event, send, release } = setup();
		connectionState("connected");
		await handler.onKeyDown(event);
		let fail!: (error: Error) => void;
		send.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
		connectionState("disconnected");
		await vi.waitFor(() => expect(fail).toBeTypeOf("function"));
		await handler.onKeyUp(event);
		await handler.onKeyDown(event);
		release.mockClear();
		fail(new Error("Old check failed"));
		await new Promise(resolve => setTimeout(resolve, 10));
		expect(release).not.toHaveBeenCalled();
		await handler.onKeyUp(event);
	});

	it("still releases immediately for a WebSocket-only connection", async () => {
		const { handler, event, release } = setup();
		vi.spyOn(vdoClient, "currentSettings", "get").mockReturnValue({ httpFallback: false });
		connectionState("connected");
		await handler.onKeyDown(event);
		connectionState("disconnected");
		expect(release).toHaveBeenCalled();
		await handler.onKeyUp(event);
	});
});
