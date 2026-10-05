import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalControlAction } from "../src/actions/local-control.js";
import { GuestCommandAction } from "../src/actions/guest-command.js";
import { MixerControlAction } from "../src/actions/mixer-control.js";
import { sessionStore, vdoClient } from "../src/services.js";

describe("dangerous-action confirmation lifecycle", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
	for (const [name, Action, settings] of [
		["local", LocalControlAction, { command: "hangup" }],
		["guest", GuestCommandAction, { command: "hangup", target: "1" }],
		["mixer", MixerControlAction, { command: "transferAllGuests", transferRoom: "test-room" }]
	] as const) {
		for (const transition of ["unchanged", "echo", "settings", "disappear"]) {
			it(`${name} confirmation handles ${transition}`, async () => {
				const send = vi.spyOn(vdoClient, "sendCommand").mockResolvedValue({ result: true });
				vi.spyOn(sessionStore, "getStreamChoices").mockReturnValue([{ streamID: "test-guest", UUID: "guest-uuid", label: "Test Guest", position: 1 }]);
				const handler = new Action();
				const action = { id: "confirmation-test", isKey: () => true, setImage: vi.fn(), setTitle: vi.fn(), setState: vi.fn(), showOk: vi.fn(), showAlert: vi.fn() };
				const event = { action, payload: { settings } } as never;
				await handler.onKeyDown(event);
				expect(send).not.toHaveBeenCalled();
				expect(action.setTitle).toHaveBeenLastCalledWith("Press\nagain");
				// A state poll redraws the key while it is armed.
				await (handler as unknown as { render(a: unknown, s: unknown): Promise<void> }).render(action, settings);
				expect(action.setTitle).toHaveBeenLastCalledWith("Press\nagain");
				if (transition === "echo") {
					// Each state poll's getSettings reply arrives as didReceiveSettings.
					await handler.onDidReceiveSettings({ action, payload: { settings } } as never);
				} else if (transition === "settings") {
					await handler.onDidReceiveSettings({ action, payload: { settings: { ...settings, title: "Updated action" } } } as never);
				} else if (transition === "disappear") {
					await handler.onWillDisappear?.(event);
					await handler.onWillAppear(event);
				}
				await handler.onKeyDown(event);
				if (transition === "unchanged" || transition === "echo") {
					expect(action.showOk).toHaveBeenCalledOnce();
				} else {
					expect(send).not.toHaveBeenCalled();
					expect(action.showOk).not.toHaveBeenCalled();
					expect(action.setTitle).toHaveBeenLastCalledWith("Press\nagain");
				}
			});
		}
	}
});
