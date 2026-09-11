import streamDeck from "@elgato/streamdeck";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StreamChoice } from "../src/api/types.js";
import { normalizeGuestsListSettings } from "../src/api/settings.js";
import { GuestsListAction, buildGuestsListLines, fitGuestsListFont, renderGuestsListImage, renderGuestsListSvg } from "../src/actions/guests-list.js";
import { sessionStore } from "../src/services.js";
import { SessionStore } from "../src/state/session-store.js";

const choices: StreamChoice[] = [
	{ streamID: "guest-a", label: "Guest A", position: 1, scenes: { "1": true, "2": false } },
	{ streamID: "co-director", label: "Co-director", position: 2, director: true },
	{ streamID: "guest-b", label: "Guest B", position: 3, scenes: { "1": "false" } },
	{ streamID: "guest-c", label: "Guest C", position: 4, scenes: { "1": "true" } }
];

describe("guests list", () => {
	it("lists every connected guest by slot when no scene is selected", () => {
		expect(buildGuestsListLines(normalizeGuestsListSettings({}), choices)).toEqual([
			"1 Guest A",
			"3 Guest B",
			"4 Guest C"
		]);
	});

	it("filters to scene members with a scene header", () => {
		const settings = normalizeGuestsListSettings({ scope: "scene", scene: "1" });
		expect(buildGuestsListLines(settings, choices)).toEqual(["Scene 1", "1 Guest A", "4 Guest C"]);
	});

	it("accepts truthy scene membership value forms", () => {
		const mixed: StreamChoice[] = [
			{ streamID: "a", label: "A", position: 1, scenes: { s: 1 } },
			{ streamID: "b", label: "B", position: 2, scenes: { s: "1" } },
			{ streamID: "c", label: "C", position: 3, scenes: { s: false } }
		];
		expect(buildGuestsListLines(normalizeGuestsListSettings({ scope: "scene", scene: "s" }), mixed)).toEqual(["Scene s", "1 A", "2 B"]);
	});

	it("applies header and row templates with tokens", () => {
		const settings = normalizeGuestsListSettings({
			scope: "scene",
			scene: "1",
			headerTitle: "Scene {scene} ({count})",
			rowTitle: "{label} [{streamID}]"
		});
		expect(buildGuestsListLines(settings, choices)).toEqual(["Scene 1 (2)", "Guest A [guest-a]", "Guest C [guest-c]"]);
	});

	it("renders row template newlines on separate SVG baselines", () => {
		const settings = normalizeGuestsListSettings({ rowTitle: "{slot}\n{label}" });
		const lines = buildGuestsListLines(settings, [choices[0]]);
		expect(lines).toEqual(["1", "Guest A"]);
		const svg = renderGuestsListSvg(lines, fitGuestsListFont(lines.length)!);
		const baselines = [...svg.matchAll(/<text x="72" y="(\d+)"/g)].map(match => match[1]);
		expect(new Set(baselines).size).toBe(2);
	});

	it("preserves blank lines and spaces in header and row templates", () => {
		const settings = normalizeGuestsListSettings({ scope: "scene", headerTitle: "\nScene {scene}\r\n{count}\n", rowTitle: " {slot}\r{label} \n" });
		expect(buildGuestsListLines(settings, [choices[0]])).toEqual(["", "Scene 1", "1", "", " 1", "Guest A ", ""]);
	});

	it("shows a fallback line when no guests are connected", () => {
		expect(buildGuestsListLines(normalizeGuestsListSettings({}), [])).toEqual(["No guests"]);
	});

	it("scales the font down until the list no longer fits", () => {
		expect(fitGuestsListFont(0)).toBe(24);
		expect(fitGuestsListFont(1)).toBe(24);
		expect(fitGuestsListFont(5)).toBe(22);
		expect(fitGuestsListFont(20)).toBeUndefined();
	});

	it("renders the slate key background behind centered escaped text", () => {
		const svg = renderGuestsListSvg(['<A>&"B"'], 24);
		expect(svg).toContain('<rect width="144" height="144" fill="#1e2532"/>');
		expect(svg).toContain("text-anchor=\"middle\"");
		expect(svg).toContain("&lt;A&gt;&amp;&quot;B&quot;");
	});

	it("encodes the key image as a base64 data URI", () => {
		const image = renderGuestsListImage(["Guest A"], 24);
		expect(image.startsWith("data:image/svg+xml;base64,")).toBe(true);
		expect(Buffer.from(image.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8")).toContain("Guest A");
	});

	it("truncates long lines so they stay inside the key", () => {
		const svg = renderGuestsListSvg(["A very long guest label that cannot fit"], 24);
		expect(svg).toContain("…");
	});
});

describe("guests list lifecycle and API positions", () => {
	afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

	function setup(count = 14) {
		vi.useFakeTimers();
		let refresh!: () => void;
		vi.spyOn(sessionStore, "subscribe").mockImplementation(listener => { refresh = listener; return () => {}; });
		const roster = vi.spyOn(sessionStore, "getStreamChoices").mockReturnValue(Array.from({ length: count }, (_, i) => ({
			streamID: `guest-${i + 1}`, label: `Guest ${i + 1}`, position: i + 1
		})));
		const key = {
			id: "guests-list-test", isKey: () => true,
			getSettings: vi.fn().mockResolvedValue({}), setImage: vi.fn().mockResolvedValue(undefined)
		};
		const current = vi.spyOn(streamDeck.actions, "getActionById").mockReturnValue(key as never);
		const handler = new GuestsListAction();
		Object.defineProperty(handler, "actions", { get: () => {
			const visible = streamDeck.actions.getActionById(key.id);
			return visible ? [visible] : [];
		} });
		const appear = (settings = {}) => handler.onWillAppear({ action: key, payload: { settings } } as never);
		const disappear = () => {
			current.mockReturnValue(undefined);
			handler.onWillDisappear({ action: { id: key.id } } as never);
		};
		const imageLines = () => {
			const image = key.setImage.mock.calls.at(-1)![0];
			const svg = Buffer.from(image.split(",")[1], "base64").toString("utf8");
			return [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(match => match[1]);
		};
		return { handler, key, roster, current, refresh: () => refresh(), appear, disappear, imageLines };
	}

	it("rotates long rosters every three seconds and stops on disappear", async () => {
		const { key, appear, disappear, imageLines } = setup();
		await appear();
		expect(imageLines()).toHaveLength(12);
		await vi.advanceTimersByTimeAsync(2999);
		expect(key.setImage).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(imageLines()).toEqual(["13 Guest 13", "14 Guest 14"]);
		disappear();
		await vi.advanceTimersByTimeAsync(6000);
		expect(key.setImage).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("counts multiline rows when fitting and rotating", async () => {
		const { appear, imageLines } = setup(7);
		await appear({ rowTitle: "{slot}\n{label}" });
		expect(imageLines()).toHaveLength(12);
		await vi.advanceTimersByTimeAsync(3000);
		expect(imageLines()).toEqual(["7", "Guest 7"]);
	});

	it("leaves an unchanged roster rotation running and stops it when the roster shrinks", async () => {
		const { key, appear, refresh, roster, imageLines } = setup();
		await appear();
		await vi.advanceTimersByTimeAsync(2000);
		refresh();
		await vi.advanceTimersByTimeAsync(0);
		expect(key.setImage).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(imageLines()[0]).toBe("13 Guest 13");
		roster.mockReturnValue([{ streamID: "a", label: "Amy", position: 1 }]);
		refresh();
		await vi.advanceTimersByTimeAsync(0);
		expect(imageLines()).toEqual(["1 Amy"]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each([false, true])("ignores a pending refresh after disappear (same context reappears: %s)", async reappear => {
		const { handler, key, current, appear, disappear, refresh } = setup();
		await appear();
		let finishSettings!: (settings: {}) => void;
		key.getSettings.mockImplementation(() => new Promise(resolve => { finishSettings = resolve; }));
		refresh();
		disappear();
		if (reappear) {
			const nextKey = { ...key, setImage: vi.fn().mockResolvedValue(undefined) };
			current.mockReturnValue(nextKey as never);
			await handler.onWillAppear({ action: nextKey, payload: { settings: { scope: "scene", scene: "empty" } } } as never);
		}
		key.setImage.mockClear();
		finishSettings({});
		await vi.advanceTimersByTimeAsync(6000);
		expect(key.setImage.mock.calls.length).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("requires an API position only for Guests List and retains existing choice defaults", async () => {
		const store = new SessionStore();
		store.applyCallback({ action: "getDetails", result: {
			local: { streamID: "local", localStream: true, director: true },
			a: { streamID: "a", label: "Amy", position: 2 },
			b: { streamID: "b", label: "Ben" },
			missing: { streamID: "missing", label: "Unpositioned" },
			co: { streamID: "co", director: true, position: 4 }
		} });
		store.applyCallback({ action: "getGuestList", result: { "3": { streamID: "b", label: "Ben" } } });
		expect(store.getStreamChoices().some(choice => choice.streamID === "missing" && typeof choice.position === "number")).toBe(true);
		const { appear, roster, imageLines } = setup();
		roster.mockImplementation(options => store.getStreamChoices(options));
		await appear();
		expect(imageLines()).toEqual(["1 Amy", "2 Ben"]);
		expect(roster).toHaveBeenCalledWith({ includeLocal: false, requirePosition: true });
	});
});
