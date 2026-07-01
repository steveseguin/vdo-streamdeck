import { describe, expect, it } from "vitest";
import { SelectedTargetStore } from "./selected-target-store.js";

describe("SelectedTargetStore", () => {
	it("stores trimmed stream IDs and clears empty selections", () => {
		const store = new SelectedTargetStore();
		store.setSelectedStreamID(" guest123 ");
		expect(store.getSelectedStreamID()).toBe("guest123");

		store.setSelectedStreamID("");
		expect(store.getSelectedStreamID()).toBeNull();
	});

	it("emits only when the selection changes", () => {
		const store = new SelectedTargetStore();
		let count = 0;
		store.subscribe(() => {
			count += 1;
		});

		store.setSelectedStreamID("guest123");
		store.setSelectedStreamID("guest123");
		store.clear();

		expect(count).toBe(2);
	});
});
