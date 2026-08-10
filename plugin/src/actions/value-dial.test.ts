import { describe, expect, it } from "vitest";
import { guestVolumeFromStream } from "./value-dial.js";

describe("guestVolumeFromStream", () => {
	it("prefers VDO's controlled guest-volume slider over the media element volume", () => {
		expect(
			guestVolumeFromStream({
				streamID: "guest-1",
				videoVolume: 1,
				others: { volume: "160" }
			})
		).toBe(160);
	});

	it("falls back to media volume for older detail payloads", () => {
		expect(guestVolumeFromStream({ streamID: "guest-1", videoVolume: 0.75 })).toBe(75);
	});

	it("ignores malformed volume state", () => {
		expect(guestVolumeFromStream({ streamID: "guest-1", others: { volume: "loud" } })).toBeUndefined();
	});
});
