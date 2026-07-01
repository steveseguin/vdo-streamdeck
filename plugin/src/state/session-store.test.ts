import { describe, expect, it } from "vitest";
import { SessionStore } from "./session-store.js";

describe("SessionStore", () => {
	it("normalizes getDetails callbacks and local state", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getDetails",
			result: {
				local123: {
					streamID: "local123",
					localStream: true,
					muted: true,
					videoMuted: false,
					speakerMuted: false
				},
				guest123: {
					streamID: "guest123",
					label: "Guest"
				}
			}
		});

		expect(store.getStreamCount()).toBe(2);
		expect(store.getLocalBoolean("muted")).toBe(true);
		expect(store.getLocalBoolean("videoMuted")).toBe(false);
	});

	it("applies local update events", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getDetails",
			result: {
				local123: {
					streamID: "local123",
					localStream: true,
					muted: true
				}
			}
		});

		store.applyUpdate({ action: "muted", value: false });
		expect(store.getLocalBoolean("muted")).toBe(false);
	});

	it("merges partial details updates without dropping existing room state", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getDetails",
			result: {
				local123: {
					streamID: "local123",
					localStream: true,
					muted: true
				},
				guest123: {
					streamID: "guest123",
					label: "Guest",
					scenes: { custom_scene: true }
				}
			}
		});

		store.applyUpdate({
			action: "details",
			value: {
				local123: {
					streamID: "local123",
					videoMuted: true
				}
			}
		});

		expect(store.getStreamCount()).toBe(2);
		expect(store.getLocalBoolean("muted")).toBe(true);
		expect(store.getLocalBoolean("videoMuted")).toBe(true);
		expect(store.getStream("guest123")?.scenes).toEqual({ custom_scene: true });
	});

	it("unwraps nested details entries from sync-state style payloads", () => {
		const store = new SessionStore();
		store.applyUpdate({
			action: "details",
			value: {
				guest123: {
					guest123: {
						streamID: "guest123",
						label: "Nested Guest",
						others: { "remove-queue": true }
					}
				}
			}
		});

		expect(store.getStreamCount()).toBe(1);
		expect(store.getStream("guest123")?.label).toBe("Nested Guest");
		expect(store.getStream("guest123")?.others).toEqual({ "remove-queue": true });
	});

	it("merges targeted getDetails callbacks without replacing full state", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getDetails",
			result: {
				local123: { streamID: "local123", localStream: true },
				guest123: { streamID: "guest123", label: "Guest" }
			}
		});

		store.applyCallback({
			action: "getDetails",
			value: "guest123",
			result: {
				guest123: { streamID: "guest123", muted: true }
			}
		});

		expect(store.getStreamCount()).toBe(2);
		expect(store.getStream("guest123")?.label).toBe("Guest");
		expect(store.getStream("guest123")?.muted).toBe(true);
	});

	it("applies remote stream updates and position changes", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getDetails",
			result: {
				guest123: { streamID: "guest123", label: "Guest" }
			}
		});

		store.applyUpdate({ action: "remoteMuted", streamID: "guest123", value: true });
		store.applyUpdate({ action: "remoteVideoMuted", streamID: "guest123", value: "true" });
		store.applyUpdate({ action: "directorVideoHide", streamID: "guest123", value: true });
		store.applyUpdate({ action: "positionChange", value: { guest123: 3 } });

		const guest = store.getStream("guest123");
		expect(guest?.muted).toBe(true);
		expect(guest?.videoMuted).toBe(true);
		expect(guest?.directorVideoHide).toBe(true);
		expect(guest?.position).toBe(3);
	});

	it("preserves codirector update state on the local stream", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getDetails",
			result: {
				local123: { streamID: "local123", localStream: true, director: false }
			}
		});

		store.applyUpdate({ action: "codirector", value: true });

		expect(store.getLocalStream()?.director).toBe(true);
		expect(store.getLocalStream()?.codirector).toBe(true);
	});

	it("removes ended viewer streams using update value", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getDetails",
			result: {
				local123: { streamID: "local123", localStream: true },
				guest123: { streamID: "guest123", label: "Guest" }
			}
		});
		store.applyCallback({
			action: "getGuestList",
			result: {
				"1": { streamID: "guest123", label: "Guest" }
			}
		});

		store.applyUpdate({ action: "endViewConnection", streamID: "local123", value: "guest123" });

		expect(store.getStreamCount()).toBe(1);
		expect(store.getStream("guest123")).toBeUndefined();
		expect(store.getGuestList().size).toBe(0);
	});

	it("normalizes guest lists", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getGuestList",
			result: {
				"1": { streamID: "guest123", label: "Guest" }
			}
		});

		expect(store.getGuestList().get("1")).toEqual({ streamID: "guest123", label: "Guest" });
	});

	it("builds stream choices ordered by guest position with held flags", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getDetails",
			result: {
				local123: { streamID: "local123", localStream: true, label: "Director" },
				guestB: { streamID: "guestB", label: "Second" },
				guestA: { streamID: "guestA", label: "First", others: { "remove-queue": true, "hand-raised": true } }
			}
		});
		store.applyCallback({
			action: "getGuestList",
			result: {
				"1": { streamID: "guestA", label: "First" },
				"2": { streamID: "guestB", label: "Second" }
			}
		});

		expect(store.getStreamChoices()).toEqual([
			expect.objectContaining({ streamID: "guestA", label: "First", position: 1, held: true, handRaised: true }),
			expect.objectContaining({ streamID: "guestB", label: "Second", position: 2, held: false })
		]);
	});

	it("includes arbitrary scene maps in stream choices for scene feedback", () => {
		const store = new SessionStore();
		store.applyCallback({
			action: "getDetails",
			result: {
				guest123: {
					streamID: "guest123",
					label: "Guest",
					scenes: {
						"1": true,
						"custom-scene": false
					}
				}
			}
		});

		expect(store.getStreamChoices()).toEqual([
			expect.objectContaining({
				streamID: "guest123",
				scenes: {
					"1": true,
					"custom-scene": false
				}
			})
		]);
	});
});
