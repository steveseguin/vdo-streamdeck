import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUEST_COMMANDS, LOCAL_CONTROLS } from "./api/command-registry.js";

const pluginRoot = join(import.meta.dirname, "..");
const inspector = readFileSync(join(pluginRoot, "ui", "action-settings.html"), "utf8");
const inlineScript = Array.from(inspector.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
	.map(match => match[1])
	.filter(Boolean)[0];
const manifest = JSON.parse(readFileSync(join(pluginRoot, "manifest.json"), "utf8")) as {
	Actions: Array<{ UUID: string }>;
};

describe("property inspector contract", () => {
	it("contains valid JavaScript", () => {
		expect(inlineScript).toBeTruthy();
		expect(() => new Function(inlineScript)).not.toThrow();
	});

	it("wires every property-inspector button", () => {
		const buttonIds = Array.from(inspector.matchAll(/<button\b[^>]*\bid="([^"]+)"/gi), match => match[1]);
		expect(buttonIds.length).toBeGreaterThan(0);
		for (const id of buttonIds) {
			expect(inspector, `${id} is missing an onclick handler`).toContain(`byId("${id}").onclick`);
		}
	});

	it("uses unique control IDs with matching labels", () => {
		const ids = Array.from(inspector.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/gi), match => match[1]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids.filter(id => id !== "generatedUrl" && id !== "currentSelectedTarget")) {
			const hasLabel = new RegExp(`<label\\b[^>]*\\bfor=["']${escapeRegExp(id)}["']`, "i").test(inspector);
			const control = inspector.match(new RegExp(`<[^>]+id=["']${escapeRegExp(id)}["'][^>]*>`, "i"))?.[0] || "";
			expect(hasLabel || /\baria-label=["'][^"']+["']/i.test(control), `${id} is missing a label`).toBe(true);
		}
	});

	it("renders settings for every manifest action", () => {
		for (const action of manifest.Actions) {
			expect(inspector).toContain(action.UUID);
		}
	});

	it("keeps local and guest command choices aligned with the runtime registry", () => {
		expect(selectOptionValues("localCommand")).toEqual(Object.keys(LOCAL_CONTROLS));
		expect(selectOptionValues("guestCommand")).toEqual(Object.keys(GUEST_COMMANDS));
	});

	it("keeps first-run setup focused and advanced transport controls collapsed", () => {
		expect(inspector).toContain("Choose a private key");
		expect(inspector).toContain("Build the page link");
		expect(inspector).toContain("Confirm it answers");
		expect(inspector).toContain("Advanced and self-hosted setup");
		expect(inspector).toContain('id="apiProtocol"');
		expect(inspector).toContain('id="commandTransport"');
		expect(inspector).not.toContain('id="httpFallback"');
	});

	it("executes every inspector button handler from a configured setup", async () => {
		const harness = createInspectorHarness();
		harness.connect();
		harness.socket.onopen();
		harness.socket.onmessage({
			data: JSON.stringify({
				event: "didReceiveGlobalSettings",
				payload: {
					settings: {
						apiKey: "test-key",
						setupPageType: "director",
						setupRoom: "test-room"
					}
				}
			})
		});
		expect(harness.elements.get("generatedUrl")?.value).toContain("/mixer?room=test-room&api=test-key");

		const pageType = harness.elements.get("pageType");
		const customUrl = harness.elements.get("customUrl");
		pageType!.value = "custom";
		pageType!.onchange?.();
		customUrl!.value = "https://vdo.ninja/?view=guest-one";
		customUrl!.oninput?.();
		const readyUrl = new URL(harness.elements.get("generatedUrl")?.value || "");
		expect(readyUrl.searchParams.get("view")).toBe("guest-one");
		expect(readyUrl.searchParams.get("api")).toBe("test-key");

		const buttonIds = Array.from(inspector.matchAll(/<button\b[^>]*\bid="([^"]+)"/gi), match => match[1]);
		for (const id of buttonIds) {
			const handler = harness.elements.get(id)?.onclick;
			expect(handler, `${id} has no executable click handler`).toBeTypeOf("function");
			expect(() => handler?.()).not.toThrow();
			await Promise.resolve();
		}

		expect(harness.socket.sent.some(message => message.includes('"type":"openUrl"'))).toBe(true);
		expect(harness.socket.sent.some(message => message.includes('"type":"testConnection"'))).toBe(true);
	});
});

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function selectOptionValues(id: string): string[] {
	const select = inspector.match(new RegExp(`<select\\b[^>]*id=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/select>`, "i"))?.[1] || "";
	return Array.from(select.matchAll(/<option\b[^>]*value="([^"]+)"/gi), match => match[1]);
}

function createInspectorHarness(): {
	connect: () => void;
	socket: FakeSocket;
	elements: Map<string, FakeElement>;
} {
	const elements = new Map<string, FakeElement>();
	for (const match of inspector.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
		elements.set(match[2], new FakeElement(match[1], match[2]));
	}

	const document = {
		getElementById: (id: string) => elements.get(id) || null,
		createElement: (tag: string) => new FakeElement(tag, ""),
		execCommand: () => true,
		body: {
			appendChild: () => undefined
		}
	};
	const windowObject: Record<string, unknown> = {};
	const sockets: FakeSocket[] = [];
	class HarnessSocket extends FakeSocket {
		constructor(url: string) {
			super(url);
			sockets.push(this);
		}
	}
	const navigator = {
		clipboard: {
			writeText: async () => undefined
		}
	};
	const crypto = {
		getRandomValues: (bytes: Uint8Array) => {
			bytes.fill(7);
			return bytes;
		}
	};
	const makeQr = () => ({
		addData: () => undefined,
		make: () => undefined,
		getModuleCount: () => 21,
		isDark: (row: number, column: number) => (row + column) % 2 === 0
	});
	const run = new Function(
		"window",
		"document",
		"WebSocket",
		"navigator",
		"crypto",
		"qrcode",
		"setTimeout",
		"clearTimeout",
		inlineScript
	);
	run(windowObject, document, HarnessSocket, navigator, crypto, makeQr, () => 1, () => undefined);

	return {
		connect: () => {
			(windowObject.connectElgatoStreamDeckSocket as (...args: unknown[]) => void)(
				1234,
				"plugin-uuid",
				"registerPropertyInspector",
				"{}",
				JSON.stringify({
					context: "action-context",
					action: "ninja.vdo.streamdeck.connection",
					payload: { settings: {} }
				})
			);
		},
		get socket() {
			return sockets[0];
		},
		elements
	};
}

class FakeSocket {
	static readonly OPEN = 1;
	readonly sent: string[] = [];
	readyState = FakeSocket.OPEN;
	onopen: () => void = () => undefined;
	onmessage: (event: { data: string }) => void = () => undefined;

	constructor(readonly url: string) {}

	send(message: string): void {
		this.sent.push(message);
	}
}

class FakeClassList {
	private readonly values = new Set<string>();

	add(...values: string[]): void {
		values.forEach(value => this.values.add(value));
	}

	remove(...values: string[]): void {
		values.forEach(value => this.values.delete(value));
	}

	toggle(value: string, force?: boolean): boolean {
		const next = typeof force === "boolean" ? force : !this.values.has(value);
		if (next) {
			this.values.add(value);
		} else {
			this.values.delete(value);
		}
		return next;
	}

	contains(value: string): boolean {
		return this.values.has(value);
	}
}

class FakeElement {
	value = "";
	checked = false;
	disabled = false;
	type = "text";
	onclick: (() => unknown) | null = null;
	oninput: (() => unknown) | null = null;
	onchange: (() => unknown) | null = null;
	readonly classList = new FakeClassList();
	readonly options: FakeElement[] = [];
	private text = "";

	constructor(readonly tagName: string, readonly id: string) {}

	get textContent(): string {
		return this.text;
	}

	set textContent(value: string) {
		this.text = value;
		if (this.tagName.toLowerCase() === "select" && value === "") {
			this.options.length = 0;
		}
	}

	appendChild(child: FakeElement): FakeElement {
		this.options.push(child);
		return child;
	}

	querySelector(selector: string): FakeElement | null {
		const value = selector.match(/option\[value=['"]([^'"]+)['"]\]/)?.[1];
		return typeof value === "string" ? this.options.find(option => option.value === value) || null : null;
	}

	getContext(): { fillStyle: string; fillRect: () => void } {
		return { fillStyle: "", fillRect: () => undefined };
	}

	focus(): void {}
	select(): void {}
	remove(): void {}
}
