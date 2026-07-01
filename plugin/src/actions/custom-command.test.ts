import { describe, expect, it } from "vitest";
import { parseValue } from "./custom-command.js";

describe("parseValue", () => {
	it("normalizes primitive strings for custom commands", () => {
		expect(parseValue("true")).toBe(true);
		expect(parseValue("false")).toBe(false);
		expect(parseValue("null")).toBeNull();
		expect(parseValue("12.5")).toBe("12.5");
	});

	it("parses JSON values when valid", () => {
		expect(parseValue('{"scene":1}')).toEqual({ scene: 1 });
		expect(parseValue("[1,2]")).toEqual([1, 2]);
	});

	it("leaves normal text alone", () => {
		expect(parseValue("guest-one")).toBe("guest-one");
		expect(parseValue("01")).toBe("01");
		expect(parseValue("")).toBeUndefined();
	});
});
