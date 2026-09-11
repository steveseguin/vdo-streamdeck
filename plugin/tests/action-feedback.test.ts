import { describe, expect, it, vi } from "vitest";
import { LocalControlAction } from "../src/actions/local-control.js";
import { GuestCommandAction } from "../src/actions/guest-command.js";
import { PtzKeyAction } from "../src/actions/ptz-key.js";
import { MixerControlAction } from "../src/actions/mixer-control.js";

function key() {
	return { id: "feedback-test", isKey: () => true, setImage: vi.fn(), setTitle: vi.fn(), setState: vi.fn() };
}

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
});
