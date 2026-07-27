import { describe, expect, it } from "vitest";
import type { StreamChoice } from "../api/types.js";
import { cycleGuestSelection } from "./select-guest.js";

const choices: StreamChoice[] = [
	{ streamID: "guest-a", label: "Guest A", position: 1 },
	{ streamID: "co-director", label: "Co-director", position: 2, director: true },
	{ streamID: "guest-b", label: "Guest B", position: 3 }
];

describe("guest selection cycling", () => {
	it("skips co-directors when moving in either direction", () => {
		expect(cycleGuestSelection(choices, "next", "guest-a")).toBe("guest-b");
		expect(cycleGuestSelection(choices, "previous", "guest-b")).toBe("guest-a");
	});

	it("wraps among guests when the current target is missing or at an edge", () => {
		expect(cycleGuestSelection(choices, "next", "missing")).toBe("guest-a");
		expect(cycleGuestSelection(choices, "next", "guest-b")).toBe("guest-a");
		expect(cycleGuestSelection(choices, "previous", "guest-a")).toBe("guest-b");
	});
});
