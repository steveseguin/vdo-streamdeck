import { describe, expect, it } from "vitest";
import { selectedTargetStore, sessionStore } from "../services.js";
import { resolveGuestTargetChoice, resolveGuestTargetValue } from "./guest-targeting.js";

describe("guest targeting", () => {
	it("resolves selected guest targets by UUID when available", () => {
		sessionStore.applyCallback({
			action: "getDetails",
			result: {
				guestA: { streamID: "guestA", label: "First" },
				guestB: { streamID: "guestB", UUID: "uuidB", label: "Second" }
			}
		});
		selectedTargetStore.setSelectedStreamID("guestB");

		expect(resolveGuestTargetValue({ targetMode: "selected" })).toBe("uuidB");
		expect(resolveGuestTargetChoice({ targetMode: "selected" })).toEqual(expect.objectContaining({ streamID: "guestB", UUID: "uuidB", label: "Second" }));

		selectedTargetStore.clear();
	});

	it("falls back to stream ID when UUID is absent", () => {
		sessionStore.applyCallback({
			action: "getDetails",
			result: {
				guestA: { streamID: "guestA", label: "First" }
			}
		});
		selectedTargetStore.setSelectedStreamID("guestA");

		expect(resolveGuestTargetValue({ targetMode: "selected" })).toBe("guestA");

		selectedTargetStore.clear();
	});

	it("keeps manual stream ID targets literal even when UUID is known", () => {
		sessionStore.applyCallback({
			action: "getDetails",
			result: {
				guestA: { streamID: "guestA", UUID: "uuidA", label: "First" }
			}
		});

		expect(resolveGuestTargetValue({ targetMode: "streamId", target: "guestA" })).toBe("guestA");
	});

	it("keeps a fallback selected target when the stream is stale", () => {
		sessionStore.applyCallback({ action: "getDetails", result: {} });
		selectedTargetStore.setSelectedStreamID("missing-stream");

		expect(resolveGuestTargetValue({ targetMode: "selected" })).toBe("missing-stream");
		expect(resolveGuestTargetChoice({ targetMode: "selected" })).toEqual({
			streamID: "missing-stream",
			label: "Missing target"
		});

		selectedTargetStore.clear();
	});
});
