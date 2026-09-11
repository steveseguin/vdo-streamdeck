import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	normalizeCustomCommandSettings,
	normalizeGuestCommandSettings,
	normalizeGuestSceneSettings,
	normalizeLocalControlSettings,
	normalizeMixerControlSettings,
	normalizePtzDialSettings,
	normalizePtzKeySettings,
	normalizeSelectGuestSettings,
	normalizeValueDialSettings
} from "../src/api/settings.js";
import { CustomCommandAction } from "../src/actions/custom-command.js";
import { PtzDialAction } from "../src/actions/ptz-dial.js";
import { SelectGuestAction, renderSelectTitle } from "../src/actions/select-guest.js";
import { ValueDialAction } from "../src/actions/value-dial.js";

const normalizers = [
	["Local Control", normalizeLocalControlSettings],
	["Select Guest", normalizeSelectGuestSettings],
	["Guest Command", normalizeGuestCommandSettings],
	["Guest Scene", normalizeGuestSceneSettings],
	["Mixer", normalizeMixerControlSettings],
	["PTZ Key", normalizePtzKeySettings],
	["PTZ Dial", normalizePtzDialSettings],
	["Value Dial", normalizeValueDialSettings],
	["Custom Command", normalizeCustomCommandSettings]
] as const;

describe("title templates", () => {
	it.each(normalizers)("preserves multiline formatting for %s", (_name, normalize) => {
		for (const title of ["\n{slot}\n{label}\n", "\r\nFirst\r\nSecond\r\n", "  First\nSecond  "]) {
			expect(normalize({ title }).title).toBe(title);
		}
	});

	it.each(normalizers)("keeps single-line and blank-title defaults for %s", (_name, normalize) => {
		expect(normalize({ title: "  Existing title  " }).title).toBe("Existing title");
		for (const title of [undefined, "", " \t\r\n ", 42, null]) {
			expect(normalize({ title: title as never }).title).toBe("");
		}
	});

	it("still trims non-title fields", () => {
		const settings = normalizeGuestCommandSettings({ target: "\n guest-1 \n", value: "\n true \n", title: "\nGuest\n" });
		expect(settings.target).toBe("guest-1");
		expect(settings.value).toBe("true");
		expect(settings.title).toBe("\nGuest\n");
	});

	it("preserves blank first and last lines around Select Guest tokens", () => {
		const settings = normalizeSelectGuestSettings({ title: "\n{slot}\n{label}\n" });
		expect(renderSelectTitle(settings, { streamID: "test-guest", label: "Test Guest", position: 1 }, null, false))
			.toBe("\n1\nTest Guest\n");
	});

	it.each([["Select Guest", SelectGuestAction], ["Custom Command", CustomCommandAction]] as const)(
		"passes multiline formatting to setTitle for %s on load and edit", async (_name, Action) => {
			const action = { isKey: () => true, setTitle: vi.fn(), setState: vi.fn() };
			const handler = new Action();
			for (const title of ["\nFirst\nSecond\n", "\nEdited\n"]) {
				const event = { action, payload: { settings: { title } } } as never;
				await handler.onWillAppear(event);
				expect(action.setTitle).toHaveBeenLastCalledWith(title);
				await handler.onDidReceiveSettings(event);
				expect(action.setTitle).toHaveBeenLastCalledWith(title);
			}
		}
	);

	it.each([["PTZ Dial", PtzDialAction], ["Value Dial", ValueDialAction]] as const)(
		"keeps the existing single-line display for %s", async (_name, Action) => {
			const action = { isDial: () => true, setTitle: vi.fn(), setFeedback: vi.fn(), setTriggerDescription: vi.fn() };
			await new Action().onWillAppear({ action, payload: { settings: { scope: "local", title: "\nFirst\nSecond\n" } } } as never);
			expect(action.setTitle).toHaveBeenLastCalledWith("First Second");
			expect(action.setFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ title: "First Second" }));
		}
	);

	it("explains the single-line display beside both dial title fields", () => {
		const inspector = readFileSync(join(import.meta.dirname, "../ui/action-settings.html"), "utf8");
		for (const id of ["ptzDialTitle", "valueDialTitle"]) {
			const hint = inspector.match(new RegExp(`<textarea\\b[^>]*id="${id}"[^>]*>[\\s\\S]*?<div class="hint">([\\s\\S]*?)</div>`))?.[1];
			expect(hint).toContain("Title lines are combined into one line on the dial display.");
		}
	});
});
