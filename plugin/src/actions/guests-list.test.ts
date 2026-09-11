import { describe, expect, it } from "vitest";
import type { StreamChoice } from "../api/types.js";
import { normalizeGuestsListSettings } from "../api/settings.js";
import { buildGuestsListLines, fitGuestsListFont, renderGuestsListImage, renderGuestsListSvg } from "./guests-list.js";

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
			scene: "2",
			headerTitle: "Scene {scene} ({count})",
			rowTitle: "{label} [{streamID}]"
		});
		expect(buildGuestsListLines(settings, choices)).toEqual(["Scene 2 (0)"]);
	});

	it("preserves newlines inside row templates", () => {
		const settings = normalizeGuestsListSettings({ rowTitle: "{slot}\n{label}" });
		expect(buildGuestsListLines(settings, [choices[0]])).toEqual(["1\nGuest A"]);
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
