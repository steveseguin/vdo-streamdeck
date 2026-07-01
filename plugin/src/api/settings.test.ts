import { describe, expect, it } from "vitest";
import {
	normalizeGlobalSettings,
	normalizeGuestCommandSettings,
	normalizeGuestSceneSettings,
	normalizeLocalControlSettings,
	normalizePtzDialSettings,
	normalizePtzKeySettings,
	normalizeSelectGuestSettings,
	normalizeValueDialSettings
} from "./settings.js";

describe("settings normalization", () => {
	it("enables the HTTP API route by default", () => {
		expect(normalizeGlobalSettings(undefined).httpFallback).toBe(true);
		expect(normalizeGlobalSettings({ httpFallback: false }).httpFallback).toBe(false);
	});

	it("preserves selected guest target mode for guest actions", () => {
		expect(normalizeGuestCommandSettings({ targetMode: "selected" }).targetMode).toBe("selected");
		expect(normalizeGuestSceneSettings({ targetMode: "selected" }).targetMode).toBe("selected");
	});

	it("normalizes select guest settings without allowing recursive selected targets", () => {
		expect(
			normalizeSelectGuestSettings({
				mode: "next",
				targetMode: "selected" as never,
				target: " guest123 "
			})
		).toEqual({
			mode: "next",
			targetMode: "slot",
			target: "guest123",
			title: ""
		});
	});

	it("normalizes momentary local mic behaviors", () => {
		expect(normalizeLocalControlSettings({ behavior: "pushToTalk" }).behavior).toBe("pushToTalk");
		expect(normalizeLocalControlSettings({ behavior: "pushToMute" }).behavior).toBe("pushToMute");
		expect(normalizeGuestCommandSettings({ behavior: "pushToTalk" as never }).behavior).toBe("toggle");
	});

	it("normalizes PTZ key settings with safe defaults", () => {
		expect(normalizePtzKeySettings(undefined)).toEqual({
			scope: "local",
			targetMode: "slot",
			target: "",
			control: "zoom",
			mode: "relative",
			direction: "positive",
			value: "0.1",
			disableAutofocus: false,
			title: ""
		});
	});

	it("normalizes guest PTZ autofocus values", () => {
		expect(
			normalizePtzKeySettings({
				scope: "guest",
				targetMode: "selected",
				control: "autofocus",
				value: ""
			})
		).toEqual(
			expect.objectContaining({
				scope: "guest",
				targetMode: "selected",
				control: "autofocus",
				value: "true"
			})
		);
	});

	it("normalizes PTZ dial settings with conservative defaults", () => {
		expect(normalizePtzDialSettings(undefined)).toEqual({
			scope: "local",
			targetMode: "slot",
			target: "",
			control: "zoom",
			step: "0.05",
			intervalMs: 80,
			acceleration: false,
			invert: false,
			pushAction: "none",
			disableAutofocus: false,
			title: ""
		});
	});

	it("normalizes PTZ dial user values", () => {
		expect(
			normalizePtzDialSettings({
				scope: "guest",
				targetMode: "selected",
				control: "focus",
				step: " 0.2 ",
				intervalMs: "40" as never,
				acceleration: true,
				invert: true,
				pushAction: "autofocusOff",
				disableAutofocus: true,
				title: " {label} focus "
			})
		).toEqual({
			scope: "guest",
			targetMode: "selected",
			target: "",
			control: "focus",
			step: "0.2",
			intervalMs: 40,
			acceleration: true,
			invert: true,
			pushAction: "autofocusOff",
			disableAutofocus: true,
			title: "{label} focus"
		});
	});

	it("normalizes value dial settings with volume defaults", () => {
		expect(normalizeValueDialSettings(undefined)).toEqual({
			scope: "local",
			targetMode: "slot",
			target: "",
			control: "volume",
			value: "100",
			min: "0",
			max: "200",
			step: "5",
			resetValue: "100",
			intervalMs: 100,
			acceleration: false,
			invert: false,
			pushAction: "reset",
			bufferApply: "all",
			title: ""
		});
	});

	it("normalizes value dial bitrate defaults", () => {
		expect(
			normalizeValueDialSettings({
				control: "bitrate",
				value: "",
				min: "",
				max: "",
				step: "",
				resetValue: ""
			})
		).toEqual(
			expect.objectContaining({
				control: "bitrate",
				value: "2500",
				min: "0",
				max: "6000",
				step: "250",
				resetValue: "-1"
			})
		);
	});
});
