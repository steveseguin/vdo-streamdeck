import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestCommandAction } from "../src/actions/guest-command.js";
import { sessionStore, vdoClient } from "../src/services.js";
import type { GuestCommandSettings } from "../src/api/types.js";

function snapshot(firstHeld = true) {
	sessionStore.applyCallback({ action: "getDetails", result: {
		director: { streamID: "director", localStream: true, director: true, position: 0 },
		"guest-a": { streamID: "guest-a", UUID: "uuid-a", label: "A", position: 1, others: { "remove-queue": firstHeld } },
		"guest-b": { streamID: "guest-b", UUID: "uuid-b", label: "B", position: 2, others: { "remove-queue": true } }
	} });
}

function setup(settings: GuestCommandSettings) {
	const handler = new GuestCommandAction();
	const action = { id: "target-confirmation", isKey: () => true, setImage: vi.fn(), setTitle: vi.fn(), setState: vi.fn(), showOk: vi.fn(), showAlert: vi.fn() };
	return { handler, action, event: { action, payload: { settings } } as never };
}

describe("dangerous guest confirmations follow the observed guest identity", () => {
	beforeEach(() => { vi.useFakeTimers(); snapshot(); });
	afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); sessionStore.applyUpdate({ action: "hangup" }); });

	it.each(["hangup", "forward"])("requires a new confirmation when the first held guest changes for %s", async command => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const { handler, event } = setup({ command, targetMode: "firstHeld", value: "other-room" });
		await handler.onKeyDown(event);
		snapshot(false);
		await handler.onKeyDown(event);
		expect(send).not.toHaveBeenCalled();
		await handler.onKeyDown(event);
		expect(send).toHaveBeenCalledOnce();
		expect(send.mock.calls[0][0].target).toBe("uuid-b");
	});

	it("requires a new confirmation when guest positions are reordered", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const { handler, event } = setup({ command: "hangup", target: "1" });
		await handler.onKeyDown(event);
		sessionStore.applyUpdate({ action: "positionChange", value: { "guest-a": 2, "guest-b": 1 } });
		await handler.onKeyDown(event);
		expect(send).not.toHaveBeenCalled();
		await handler.onKeyDown(event);
		expect(send).toHaveBeenCalledOnce();
	});

	it("requires a new confirmation when the guest in the slot leaves", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const { handler, event } = setup({ command: "hangup", target: "1" });
		await handler.onKeyDown(event);
		sessionStore.applyUpdate({ action: "endViewConnection", value: "guest-a" });
		await handler.onKeyDown(event);
		expect(send).not.toHaveBeenCalled();
		await handler.onKeyDown(event);
		expect(send).toHaveBeenCalledOnce();
	});

	it("does not count a press without a held guest as confirmation", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		sessionStore.applyUpdate({ action: "hangup" });
		const { handler, event } = setup({ command: "hangup", targetMode: "firstHeld" });
		await handler.onKeyDown(event);
		snapshot();
		await handler.onKeyDown(event);
		expect(send).not.toHaveBeenCalled();
		await handler.onKeyDown(event);
		expect(send).toHaveBeenCalledOnce();
	});

	it("keeps confirmation when the same guest receives an ordinary state update", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const { handler, event } = setup({ command: "hangup", targetMode: "firstHeld" });
		await handler.onKeyDown(event);
		sessionStore.applyUpdate({ action: "remoteMuted", streamID: "guest-a", value: true });
		await handler.onKeyDown(event);
		expect(send).toHaveBeenCalledOnce();
		expect(send.mock.calls[0][0].target).toBe("uuid-a");
	});

	it("preserves explicitly disabled confirmations", async () => {
		const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
		const { handler, event } = setup({ command: "hangup", targetMode: "firstHeld", dangerousConfirm: false });
		await handler.onKeyDown(event);
		expect(send).toHaveBeenCalledOnce();
	});
});
