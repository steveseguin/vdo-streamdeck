import { afterEach, describe, expect, it, vi } from "vitest";
import { VdoClient } from "../src/api/vdo-client.js";

const sockets = vi.hoisted(() => [] as Array<{ emit(event: string, ...args: unknown[]): void; readyState: number }>);
vi.mock("ws", async () => {
	const { EventEmitter } = await import("node:events");
	return { default: class extends EventEmitter {
		static OPEN = 1;
		static CONNECTING = 0;
		static CLOSING = 2;
		readyState = 0;
		send = vi.fn();
		close = vi.fn();
		terminate = vi.fn();
		constructor() { super(); sockets.push(this); }
	} };
});

describe("connection lifecycle", () => {
	afterEach(() => { vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers(); sockets.length = 0; });

	it.each(["true", "failed", "timeout"])("ignores an old HTTP %s response after removing the key", async body => {
		const client = new VdoClient();
		vi.spyOn(client, "connect").mockImplementation(() => undefined);
		client.configure({ apiKey: "test-only" });
		let respond!: (response: Response) => void;
		vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
		const callback = vi.fn();
		client.onCallback(callback);
		const request = client.sendCommand({ action: "getDetails" });
		client.configure({ apiKey: "" });
		respond(new Response(body));
		await expect(request).rejects.toThrow();
		expect(callback).not.toHaveBeenCalled();
		expect(client.connectionState).toBe("missing-key");
	});

	it("ignores old network errors after disconnect", async () => {
		const client = new VdoClient();
		vi.spyOn(client, "connect").mockImplementation(() => undefined);
		client.configure({ apiKey: "test-only" });
		let reject!: (error: Error) => void;
		vi.stubGlobal("fetch", vi.fn(() => new Promise((_resolve, fail) => { reject = fail; })));
		const request = client.sendCommand({ action: "getDetails" });
		client.disconnect();
		reject(new Error("Old request failed"));
		await expect(request).rejects.toThrow();
		expect(client.connectionState).toBe("disconnected");
	});

	it("ignores invalid relay envelopes without crashing or claiming a page answered", () => {
		const client = new VdoClient();
		const receive = (client as unknown as { handleMessage(raw: string): void }).handleMessage.bind(client);
		for (const message of [null, [], 3, "hello", { callback: [] }, { update: "bad" }, { msg: [] }]) {
			expect(() => receive(JSON.stringify(message))).not.toThrow();
		}
		expect(client.connectionState).toBe("missing-key");
	});

	it("keeps healthy HTTP status through relay failure and retry", async () => {
		vi.useFakeTimers();
		vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
		const client = new VdoClient();
		client.configure({ apiKey: "test-only" });
		await client.sendCommand({ action: "getDetails" });
		const states: string[] = [];
		client.onState(state => states.push(state));
		sockets.at(-1)!.emit("error", new Error("Relay unavailable"));
		sockets.at(-1)!.emit("close");
		await vi.advanceTimersByTimeAsync(1000);
		expect(client.connectionState).toBe("connected");
		expect(states).toEqual([]);
		client.disconnect();
	});

	it("checks HTTP once for overlapping relay error and close events", async () => {
		vi.useFakeTimers();
		let respond!: (response: Response) => void;
		const fetch = vi.fn(() => new Promise<Response>(resolve => { respond = resolve; }));
		vi.stubGlobal("fetch", fetch);
		const client = new VdoClient();
		client.configure({ apiKey: "test-only" });
		expect(client.connectionState).toBe("connecting");
		sockets.at(-1)!.emit("error", new Error("Relay unavailable"));
		sockets.at(-1)!.emit("close");
		expect(fetch).toHaveBeenCalledOnce();
		respond(new Response("{}"));
		await vi.advanceTimersByTimeAsync(0);
		expect(client.connectionState).toBe("connected");
		client.disconnect();
	});

	it.each([["failed", "no-page"], ["timeout", "timeout"], ["network", "error"]])("reports HTTP %s during relay failure and recovers", async (body, expected) => {
		vi.useFakeTimers();
		const fetch = vi.fn(async () => new Response("{}"));
		vi.stubGlobal("fetch", fetch);
		const client = new VdoClient();
		client.configure({ apiKey: "test-only" });
		await client.sendCommand({ action: "getDetails" });
		if (body === "network") fetch.mockRejectedValueOnce(new Error("Network unavailable"));
		else fetch.mockResolvedValueOnce(new Response(body));
		sockets.at(-1)!.emit("error", new Error("Relay unavailable"));
		sockets.at(-1)!.emit("close");
		await vi.advanceTimersByTimeAsync(0);
		expect(client.connectionState).toBe(expected);
		await vi.advanceTimersByTimeAsync(1000);
		expect(client.connectionState).toBe(expected);
		sockets.at(-1)!.emit("error", new Error("Relay still unavailable"));
		await vi.advanceTimersByTimeAsync(0);
		expect(client.connectionState).toBe("connected");
		client.disconnect();
	});

	it("keeps immediate failure reporting in WebSocket-only mode", () => {
		vi.useFakeTimers();
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		const client = new VdoClient();
		client.configure({ apiKey: "test-only", httpFallback: false });
		sockets.at(-1)!.emit("message", JSON.stringify({ update: { action: "details" } }));
		expect(client.connectionState).toBe("connected");
		sockets.at(-1)!.emit("error", new Error("Relay unavailable"));
		expect(client.connectionState).toBe("error");
		sockets.at(-1)!.emit("close");
		expect(client.connectionState).toBe("disconnected");
		expect(fetch).not.toHaveBeenCalled();
		client.disconnect();
	});

	it.each(["remove-key", "websocket-only"])("ignores an HTTP relay check after %s", async change => {
		vi.useFakeTimers();
		let respond!: (response: Response) => void;
		vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
		const client = new VdoClient();
		client.configure({ apiKey: "test-only" });
		sockets.at(-1)!.emit("error", new Error("Relay unavailable"));
		expect(respond).toBeTypeOf("function");
		client.configure(change === "remove-key" ? { apiKey: "" } : { apiKey: "test-only", httpFallback: false });
		respond(new Response("{}"));
		await vi.advanceTimersByTimeAsync(0);
		expect(client.connectionState).toBe(change === "remove-key" ? "missing-key" : "connecting");
		client.disconnect();
	});
});
