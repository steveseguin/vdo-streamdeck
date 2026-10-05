import { afterEach, describe, expect, it, vi } from "vitest";
import streamDeck from "@elgato/streamdeck";
import { clearActionError, sendActionError, showActionAlert } from "../src/actions/action-feedback.js";
import { CustomCommandAction } from "../src/actions/custom-command.js";
import { vdoClient } from "../src/services.js";
import { LocalControlAction } from "../src/actions/local-control.js";
import { GuestCommandAction } from "../src/actions/guest-command.js";
import { PtzKeyAction } from "../src/actions/ptz-key.js";
import { MixerControlAction } from "../src/actions/mixer-control.js";

function key() {
	return { id: "feedback-test", isKey: () => true, setImage: vi.fn(), setTitle: vi.fn(), setState: vi.fn(), showAlert: vi.fn(), showOk: vi.fn() };
}

afterEach(() => vi.restoreAllMocks());

describe("immediate command feedback", () => {
	it("changes a local key's artwork and label without a connection or key press", async () => {
		const handler = new LocalControlAction();
		const action = key();
		await handler.onDidReceiveSettings({ action, payload: { settings: { command: "camera" } } } as never);
		expect(action.setTitle).toHaveBeenLastCalledWith("Camera");
		expect(action.setImage).toHaveBeenCalledWith("imgs/command-camera-off.png", { state: 0 });
		await handler.onDidReceiveSettings({ action, payload: { settings: { command: "record" } } } as never);
		expect(action.setTitle).toHaveBeenLastCalledWith("Record");
		expect(action.setImage).toHaveBeenCalledWith("imgs/command-record-neutral.png", { state: 0 });
	});

	it.each([
		[GuestCommandAction, { command: "forward", target: "1" }, "transfer"],
		[PtzKeyAction, { control: "pan", scope: "local" }, "pan-right"],
		[PtzKeyAction, { control: "pan", direction: "negative" }, "pan-left"],
		[PtzKeyAction, { control: "tilt", direction: "positive" }, "tilt-up"],
		[PtzKeyAction, { control: "tilt", direction: "negative" }, "tilt-down"],
		[PtzKeyAction, { control: "pan", mode: "absolute", direction: "negative" }, "pan"],
		[PtzKeyAction, { control: "tilt", mode: "absolute" }, "tilt"],
		[PtzKeyAction, { control: "zoom", direction: "negative" }, "zoom-out"],
		[PtzKeyAction, { control: "zoom", mode: "absolute" }, "zoom-absolute"],
		[MixerControlAction, { command: "setGuestSlot", target: "1" }, "slot"]
	] as const)("selects artwork for %s", async (Action, settings, icon) => {
		const action = key();
		await new Action().onDidReceiveSettings({ action, payload: { settings } } as never);
		expect(action.setImage).toHaveBeenCalledWith(`imgs/command-${icon}-neutral.png`, { state: 0 });
	});

	it("does not resend unchanged artwork on each feedback refresh", async () => {
		const handler = new LocalControlAction();
		const action = key();
		for (let i = 0; i < 5; i++) {
			await handler.onDidReceiveSettings({ action, payload: { settings: { command: "mic" } } } as never);
		}
		expect(action.setImage).toHaveBeenCalledTimes(2);
	});

	it("keeps an error for its action until success, even when the inspector was closed", async () => {
		const action = key();
		const current = vi.spyOn(streamDeck.ui, "action", "get").mockReturnValue(undefined);
		const send = vi.spyOn(streamDeck.ui, "sendToPropertyInspector").mockResolvedValue();
		await showActionAlert(action, "target");
		expect(action.showAlert).toHaveBeenCalledOnce();
		expect(send).not.toHaveBeenCalled();
		current.mockReturnValue(action as never);
		await sendActionError(action);
		expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ context: action.id, message: expect.stringContaining("Select Guest") }));
		const other = { ...key(), id: "another-key" };
		await showActionAlert(other, "media");
		expect(send).toHaveBeenCalledTimes(1);
		clearActionError(action);
		expect(send).toHaveBeenLastCalledWith({ type: "actionError", context: action.id, message: "" });
		// A new SDK action object must not inherit a previous profile's error.
		const replacement = { ...other };
		current.mockReturnValue(replacement as never);
		await sendActionError(replacement);
		expect(send).toHaveBeenLastCalledWith({ type: "actionError", context: replacement.id, message: "" });
	});

	it("explains a command timeout without exposing private values, then clears on success", async () => {
		const action = key();
		vi.spyOn(streamDeck.ui, "action", "get").mockReturnValue(action as never);
		const send = vi.spyOn(streamDeck.ui, "sendToPropertyInspector").mockResolvedValue();
		vi.spyOn(vdoClient, "sendCommand")
			.mockRejectedValueOnce(new Error("Timed out waiting for private-command-and-key callback"))
			.mockResolvedValue({ result: true });
		const handler = new CustomCommandAction();
		const ev = { action, payload: { settings: { action: "getDetails" } } } as never;
		await handler.onKeyDown(ev);
		expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining("may already have run") }));
		expect(JSON.stringify(send.mock.calls)).not.toContain("private-command-and-key");
		await handler.onKeyDown(ev);
		expect(send).toHaveBeenLastCalledWith({ type: "actionError", context: action.id, message: "" });
		expect(action.showOk).toHaveBeenCalledOnce();
	});

	it("gives PTZ permission guidance when VDO.Ninja rejects the control", async () => {
		const action = key();
		vi.spyOn(streamDeck.ui, "action", "get").mockReturnValue(action as never);
		const send = vi.spyOn(streamDeck.ui, "sendToPropertyInspector").mockResolvedValue();
		vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: false });
		await new PtzKeyAction().onKeyDown({ action, payload: { settings: { scope: "local", control: "zoom" } } } as never);
		expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining("Enable &ptz") }));
		expect(action.showAlert).toHaveBeenCalledOnce();
		expect(action.showOk).not.toHaveBeenCalled();
	});

	it("keeps unknown transport errors private and tolerates a closed inspector", async () => {
		const action = key();
		vi.spyOn(streamDeck.ui, "action", "get").mockReturnValue(action as never);
		const send = vi.spyOn(streamDeck.ui, "sendToPropertyInspector").mockRejectedValue(new Error("Inspector closed"));
		await expect(showActionAlert(action, "command", new Error("https://example.test/?api=private-key"))).resolves.toBeUndefined();
		expect(JSON.stringify(send.mock.calls)).not.toContain("private-key");
		expect(action.showAlert).toHaveBeenCalledOnce();
	});
});
