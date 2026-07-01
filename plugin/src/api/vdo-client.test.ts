import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlobalSettings, VdoCallback, VdoCommandPayload } from "./types.js";
import { VdoClient } from "./vdo-client.js";

type VdoClientHarness = VdoClient & {
	settings: GlobalSettings;
	socket: { readyState: number; send: ReturnType<typeof vi.fn>; bufferedAmount?: number } | null;
	sendHttp(payload: VdoCommandPayload): Promise<VdoCallback>;
	buildEndpoint(protocol: "ws" | "wss" | "http" | "https", defaultPort?: string): string;
	buildHttpUrl(protocol: "http" | "https", payload: VdoCommandPayload): string;
	closeSocket(): void;
};

describe("VdoClient", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("treats HTTP relay failed responses as no-page errors", async () => {
		const client = new VdoClient() as VdoClientHarness;
		client.settings = { apiKey: "key", apiHost: "api.example", useTls: true };
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("failed", { status: 200 })));

		await expect(client.sendHttp({ action: "getDetails", get: "request-1" })).rejects.toThrow("No VDO.Ninja page");
		expect(client.connectionState).toBe("no-page");
	});

	it("treats HTTP relay timeout responses as timeout errors", async () => {
		const client = new VdoClient() as VdoClientHarness;
		client.settings = { apiKey: "key", apiHost: "api.example", useTls: true };
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("timeout", { status: 200 })));

		await expect(client.sendHttp({ action: "mic", get: "request-1" })).rejects.toThrow("Timed out");
		expect(client.connectionState).toBe("timeout");
	});

	it("uses HTTP fallback for no-wait commands when WebSocket is closed", async () => {
		const client = new VdoClient() as VdoClientHarness;
		client.settings = { apiKey: "key", apiHost: "api.example", useTls: true, httpFallback: true };
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("true", { status: 200 })));

		await expect(client.sendCommand({ action: "mic" }, { awaitCallback: false })).resolves.toMatchObject({
			action: "mic",
			result: true
		});
	});

	it("encodes simple commands with the existing HTTP GET route shape", async () => {
		const client = new VdoClient() as VdoClientHarness;
		client.settings = { apiKey: "key value", apiHost: "api.example", useTls: true, httpFallback: true };

		expect(client.buildHttpUrl("https", { action: "mic", value: "toggle" })).toBe("https://api.example/key%20value/mic/toggle");
		expect(client.buildHttpUrl("https", { action: "addScene", target: "guest/1", value: "Scene A" })).toBe(
			"https://api.example/key%20value/addScene/guest%2F1/Scene%20A"
		);
	});

	it("uses the HTTP GET route for awaited commands by default", async () => {
		const client = new VdoClient() as VdoClientHarness;
		client.settings = { apiKey: "key", apiHost: "api.example", useTls: true };
		const fetchMock = vi.fn().mockResolvedValue(new Response("false", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(client.sendCommand({ action: "camera", value: "toggle" })).resolves.toMatchObject({
			action: "camera",
			value: "toggle",
			result: false
		});
		expect(fetchMock).toHaveBeenCalledWith("https://api.example/key/camera/toggle");
	});

	it("keeps value2 commands on the raw WebSocket path without request IDs", async () => {
		const client = new VdoClient() as VdoClientHarness;
		const send = vi.fn();
		client.settings = { apiKey: "key", apiHost: "api.example", useTls: true, httpFallback: true };
		client.socket = { readyState: 1, send };

		await expect(client.sendCommand({ action: "zoom", value: 0.5, value2: "abs" })).resolves.toMatchObject({
			action: "zoom",
			value: 0.5,
			value2: "abs"
		});
		expect(JSON.parse(send.mock.calls[0][0])).toEqual({
			action: "zoom",
			value: 0.5,
			value2: "abs"
		});
	});

	it("skips overloaded no-wait realtime commands without dropping discrete commands", async () => {
		const client = new VdoClient() as VdoClientHarness;
		const send = vi.fn();
		client.settings = { apiKey: "key", apiHost: "api.example", useTls: true, httpFallback: true };
		client.socket = { readyState: 1, bufferedAmount: 262145, send };

		await expect(client.sendCommand({ action: "ptzZoom", target: "guest1", value: 0.1 }, { awaitCallback: false })).resolves.toMatchObject({
			action: "ptzZoom",
			target: "guest1",
			value: 0.1
		});
		expect(send).not.toHaveBeenCalled();
		expect(client.getTransportStats()).toMatchObject({
			skippedRealtimeCommands: 1
		});

		await client.sendCommand({ action: "setslot", target: "guest1", value: 2 }, { awaitCallback: false });
		expect(JSON.parse(send.mock.calls[0][0])).toEqual({
			action: "setslot",
			target: "guest1",
			value: 2
		});
	});

	it("terminates connecting sockets without emitting unhandled close errors", () => {
		const client = new VdoClient() as VdoClientHarness;
		const socket = {
			readyState: 0,
			removeAllListeners: vi.fn(),
			on: vi.fn(),
			terminate: vi.fn(),
			close: vi.fn()
		};
		client.socket = socket as unknown as VdoClientHarness["socket"];

		expect(() => client.closeSocket()).not.toThrow();

		expect(socket.removeAllListeners).toHaveBeenCalled();
		expect(socket.on).toHaveBeenCalledWith("error", expect.any(Function));
		expect(socket.terminate).toHaveBeenCalled();
		expect(socket.close).not.toHaveBeenCalled();
		expect(client.socket).toBeNull();
	});

	it("emits HTTP fallback callbacks through the normal callback path", async () => {
		const client = new VdoClient() as VdoClientHarness;
		client.settings = { apiKey: "key", apiHost: "api.example", useTls: true, httpFallback: true };
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ local123: { streamID: "local123", localStream: true } }), { status: 200 })
			)
		);
		const callbacks: VdoCallback[] = [];
		client.onCallback(callback => callbacks.push(callback));

		await client.sendCommand({ action: "getDetails" });

		expect(callbacks).toHaveLength(1);
		expect(callbacks[0]).toMatchObject({
			action: "getDetails",
			result: { local123: { streamID: "local123", localStream: true } }
		});
		expect(client.connectionState).toBe("connected");
	});

	it("builds API endpoints without double-appending ports or protocols", () => {
		const client = new VdoClient() as VdoClientHarness;
		client.settings = { apiKey: "key", apiHost: "localhost:8080", useTls: false };
		expect(client.buildEndpoint("ws", "80")).toBe("ws://localhost:8080");

		client.settings = { apiKey: "key", apiHost: "https://api.vdo.ninja/", useTls: true };
		expect(client.buildEndpoint("wss", "443")).toBe("wss://api.vdo.ninja:443");
		expect(client.buildEndpoint("https")).toBe("https://api.vdo.ninja");
	});
});
