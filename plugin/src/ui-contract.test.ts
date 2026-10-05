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

	it("renders every title template as a multi-line field", () => {
		for (const id of [
			"localTitle",
			"selectTitle",
			"guestTitle",
			"sceneTitle",
			"mixerTitle",
			"ptzTitle",
			"ptzDialTitle",
			"valueDialTitle",
			"customTitle"
		]) {
			expect(inspector, `${id} is not a textarea`).toMatch(new RegExp(`<textarea\\b[^>]*\\bid="${id}"`, "i"));
			expect(inspector, `${id} is too short`).toMatch(new RegExp(`<textarea\\b[^>]*\\bid="${id}"[^>]*\\brows="[3-9]\\d*"`, "i"));
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
		expect(inspector).toContain("Create a secure connection key");
		expect(inspector).toContain("Build the page link");
		expect(inspector).toContain("Confirm it answers");
		expect(inspector).toContain('<details id="setupDetails" open>');
		expect(inspector).toContain('role="status" aria-live="polite"');
		expect(inspector).toContain("Guest position (G1, G2...)");
		expect(inspector).not.toContain(">Guest slot<");
		expect(inspector).toContain("Advanced and self-hosted setup");
		expect(inspector).toContain('id="apiProtocol"');
		expect(inspector).toContain('id="commandTransport"');
		expect(inspector).not.toContain('id="httpFallback"');
	});

	it("uses the property-inspector UUID for inspector commands", () => {
		const harness = createInspectorHarness();
		harness.connect();
		harness.socket.onopen();

		const messages = harness.socket.sent.map(message => JSON.parse(message) as Record<string, unknown>);
		expect(messages).toContainEqual({
			event: "getSettings",
			action: "ninja.vdo.streamdeck.connection",
			context: "plugin-uuid"
		});
		expect(messages).toContainEqual({
			event: "sendToPlugin",
			action: "ninja.vdo.streamdeck.connection",
			context: "plugin-uuid",
			payload: { type: "requestStatus" }
		});
		expect(messages.some(message => message.context === "action-context")).toBe(false);
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
						setupBaseUrl: "https://vdo.ninja/alpha/",
						setupPageType: "director",
						setupRoom: "test-room"
					}
				}
			})
		});
		expect(harness.elements.get("generatedUrl")?.value).toContain("/alpha/mixer?director=test-room&api=test-key");

		const pageType = harness.elements.get("pageType");
		const roomName = harness.elements.get("roomName");
		const sceneId = harness.elements.get("sceneId");
		pageType!.value = "scene";
		pageType!.onchange?.();
		roomName!.value = "test-room";
		roomName!.oninput?.();
		sceneId!.value = "2";
		sceneId!.oninput?.();
		const sceneUrl = new URL(harness.elements.get("generatedUrl")?.value || "");
		expect(sceneUrl.searchParams.get("room")).toBe("test-room");
		expect(sceneUrl.searchParams.get("scene")).toBe("2");
		expect(sceneUrl.searchParams.has("director")).toBe(false);

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

	it("keeps incomplete base URLs recoverable and independent of existing URLs", () => {
		const harness = createInspectorHarness();
		harness.connect();
		harness.socket.onopen();
		const field = (id: string) => harness.elements.get(id)!;
		field("apiKey").value = "test-key";
		field("roomName").value = "test-room";
		field("pageType").value = "director";
		field("baseUrl").value = "https://";
		expect(() => field("baseUrl").oninput?.()).not.toThrow();
		expect(field("openUrl").disabled).toBe(true);
		expect(field("linkHelp").textContent).toContain("valid VDO.Ninja base URL");
		field("pageType").value = "custom";
		field("customUrl").value = "https://vdo.ninja/alpha/?view=test-stream";
		field("customUrl").oninput?.();
		expect(field("openUrl").disabled).toBe(false);
		expect(new URL(field("generatedUrl").value).searchParams.get("view")).toBe("test-stream");
		field("pageType").value = "director";
		field("baseUrl").value = "https://vdo.ninja/alpha/";
		field("baseUrl").oninput?.();
		expect(field("openUrl").disabled).toBe(false);
		expect(new URL(field("generatedUrl").value).pathname).toBe("/alpha/mixer");
	});

	it("hides generated keys and links until explicitly revealed", () => {
		const harness = createInspectorHarness();
		harness.connect();
		harness.socket.onopen();
		harness.elements.get("generateKey")!.onclick?.();
		for (const id of ["apiKey", "generatedUrl"]) {
			expect(harness.elements.get(id)!.type).toBe("password");
		}
		harness.elements.get("hideKey")!.onclick?.();
		for (const id of ["apiKey", "generatedUrl"]) {
			expect(harness.elements.get(id)!.type).toBe("text");
		}
		harness.elements.get("hideKey")!.onclick?.();
		expect(harness.elements.get("generatedUrl")!.type).toBe("password");
	});

	it("imports a pasted connection link while preserving its page options", () => {
		const harness = createInspectorHarness();
		harness.connect();
		harness.socket.onopen();
		const field = (id: string) => harness.elements.get(id)!;
		field("apiHost").value = "localhost:8080";
		field("apiProtocol").value = "insecure";
		let prevented = false;
		field("apiKey").onpaste?.({
			clipboardData: { getData: () => "https://vdo.ninja/alpha/?director=test-room&api=test%2Bkey&label=Test%20Director&slotmode=1" },
			preventDefault: () => { prevented = true; }
		});
		expect(prevented).toBe(true);
		expect(field("apiKey").value).toBe("test+key");
		expect(field("apiKey").type).toBe("password");
		expect(field("pageType").value).toBe("custom");
		expect(new URL(field("customUrl").value).searchParams.has("api")).toBe(false);
		const url = new URL(field("generatedUrl").value);
		expect(url.pathname).toBe("/alpha/");
		expect(Object.fromEntries(url.searchParams)).toEqual({ director: "test-room", api: "test+key", label: "Test Director", slotmode: "1" });
		expect(field("generatedUrl").type).toBe("password");
		expect(field("testConnection").disabled).toBe(false);
		const saved = harness.socket.sent.map(message => JSON.parse(message)).find(message => message.event === "setGlobalSettings");
		expect(saved.payload.apiKey).toBe("test+key");
		expect(saved.payload.apiHost).toBe("localhost:8080");
		expect(saved.payload.useTls).toBe(false);
	});

	it.each(["https://", "https://vdo.ninja/?director=test-room", "https://vdo.ninja/?api=%20"])("rejects unusable connection link %s without saving or testing it", link => {
		const harness = createInspectorHarness();
		harness.connect();
		harness.socket.onopen();
		const field = (id: string) => harness.elements.get(id)!;
		field("apiKey").value = link;
		field("apiKey").onchange?.();
		field("testConnection").onclick?.();
		expect(field("statusText").textContent).toContain("Link not imported");
		expect(field("testConnection").disabled).toBe(true);
		expect(field("openUrl").disabled).toBe(true);
		expect(field("generatedUrl").value).toBe("");
		expect(harness.socket.sent.some(message => message.includes('"setGlobalSettings"') || message.includes('"testConnection"'))).toBe(false);
		field("apiKey").value = "plain-test-key";
		field("apiKey").onchange?.();
		expect(field("testConnection").disabled).toBe(false);
		const saved = harness.socket.sent.map(message => JSON.parse(message)).find(message => message.event === "setGlobalSettings");
		expect(saved.payload.apiKey).toBe("plain-test-key");
	});

	it("reports a failed clipboard fallback instead of claiming success", async () => {
		const harness = createInspectorHarness({ clipboardFails: true, copyResult: false });
		harness.connect();
		harness.socket.onopen();
		harness.elements.get("apiKey")!.value = "test-key";
		harness.elements.get("copyKey")!.onclick?.();
		await Promise.resolve();
		expect(harness.elements.get("copyState")!.textContent).toContain("Could not copy");
	});

	it("copies through the fallback when clipboard access is unavailable", async () => {
		const harness = createInspectorHarness({ clipboardFails: true, copyResult: true });
		harness.connect();
		harness.socket.onopen();
		harness.elements.get("apiKey")!.value = "test-key";
		harness.elements.get("copyKey")!.onclick?.();
		await Promise.resolve();
		expect(harness.elements.get("copyState")!.textContent).toBe("API key copied.");
	});

	it("shows only this action's last error and hides it after success", () => {
		const harness = createInspectorHarness();
		harness.connect();
		harness.socket.onopen();
		const reply = (context: string, message: string) => harness.socket.onmessage({ data: JSON.stringify({
			event: "sendToPropertyInspector", payload: { type: "actionError", context, message }
		}) });
		reply("action-context", "Check the guest target.");
		expect(harness.elements.get("actionErrorBox")!.classList.contains("hidden")).toBe(false);
		expect(harness.elements.get("actionErrorText")!.textContent).toBe("Check the guest target.");
		reply("another-action", "Different error");
		expect(harness.elements.get("actionErrorText")!.textContent).toBe("Check the guest target.");
		reply("action-context", "");
		expect(harness.elements.get("actionErrorBox")!.classList.contains("hidden")).toBe(true);
	});

	it("names the selected guest and updates the hint when its target mode changes", () => {
		const harness = createInspectorHarness({ action: "guest-command", settings: { targetMode: "selected" } });
		harness.connect();
		harness.socket.onopen();
		const hint = harness.elements.get("selectedGuestHint")!;
		expect(hint.textContent).toContain("Press a Select Guest key");
		harness.socket.onmessage({ data: JSON.stringify({ event: "sendToPropertyInspector", payload: {
			type: "targetChoices", selectedStreamID: "test-guest", streams: [{ streamID: "test-guest", position: 2, label: "Guest Two" }]
		} }) });
		expect(hint.textContent).toBe("Selected guest: G2 - Guest Two");
		const mode = harness.elements.get("guestTargetMode")!;
		mode.value = "slot";
		mode.onchange?.();
		expect(hint.classList.contains("hidden")).toBe(true);
	});
});

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function selectOptionValues(id: string): string[] {
	const select = inspector.match(new RegExp(`<select\\b[^>]*id=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/select>`, "i"))?.[1] || "";
	return Array.from(select.matchAll(/<option\b[^>]*value="([^"]+)"/gi), match => match[1]);
}

function createInspectorHarness(options: { clipboardFails?: boolean; copyResult?: boolean; action?: string; settings?: Record<string, unknown> } = {}): {
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
		execCommand: () => options.copyResult !== false,
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
			writeText: async () => {
				if (options.clipboardFails) throw new Error("Clipboard unavailable");
			}
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
					action: "ninja.vdo.streamdeck." + (options.action || "connection"),
					payload: { settings: options.settings || {} }
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
	readonly style: Record<string, string> = {};
	value = "";
	checked = false;
	disabled = false;
	type = "text";
	onclick: (() => unknown) | null = null;
	oninput: (() => unknown) | null = null;
	onchange: (() => unknown) | null = null;
	onpaste: ((event: { clipboardData: { getData: () => string }; preventDefault: () => void }) => unknown) | null = null;
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

	setAttribute(): void {}

	focus(): void {}
	select(): void {}
	remove(): void {}
}
