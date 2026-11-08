import WebSocket from "ws";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { DEFAULT_API_HOST, normalizeGlobalSettings } from "./settings.js";
import type { ConnectionStateName, GlobalSettings, VdoCallback, VdoClientMessage, VdoCommandPayload, VdoUpdate } from "./types.js";

type Listener<T> = (payload: T) => void;

export class VdoClient {
	private settings: GlobalSettings = normalizeGlobalSettings(undefined);
	private socket: WebSocket | null = null;
	private state: ConnectionStateName = "missing-key";
	private reconnectTimer: NodeJS.Timeout | null = null;
	private reconnectAttempt = 0;
	private sentTimestamps: number[] = [];
	private skippedRealtimeCommands = 0;
	private connectionGeneration = 0;
	private checkingHttpGeneration: number | undefined;
	private listeners = {
		state: new Set<Listener<ConnectionStateName>>(),
		callback: new Set<Listener<VdoCallback>>(),
		update: new Set<Listener<VdoUpdate>>(),
		message: new Set<Listener<VdoClientMessage>>()
	};

	get connectionState(): ConnectionStateName {
		return this.state;
	}

	get currentSettings(): GlobalSettings {
		return this.settings;
	}

	getTransportStats(): JsonObject {
		this.pruneSentTimestamps(Date.now());
		return {
			messagesPerSecond: this.sentTimestamps.length,
			bufferedAmount: this.socket?.bufferedAmount || 0,
			skippedRealtimeCommands: this.skippedRealtimeCommands
		};
	}

	onState(listener: Listener<ConnectionStateName>): () => void {
		return this.addListener("state", listener);
	}

	onCallback(listener: Listener<VdoCallback>): () => void {
		return this.addListener("callback", listener);
	}

	onUpdate(listener: Listener<VdoUpdate>): () => void {
		return this.addListener("update", listener);
	}

	onMessage(listener: Listener<VdoClientMessage>): () => void {
		return this.addListener("message", listener);
	}

	configure(settings: Partial<GlobalSettings> | undefined): void {
		const next = normalizeGlobalSettings(settings);
		const changed =
			next.apiKey !== this.settings.apiKey ||
			next.apiHost !== this.settings.apiHost ||
			next.useTls !== this.settings.useTls ||
			next.httpFallback !== this.settings.httpFallback;

		this.settings = next;
		if (changed) {
			this.connectionGeneration += 1;
		}

		if (!next.apiKey) {
			this.disconnect("missing-key");
			return;
		}

		if (changed) this.setState("connecting");
		if (changed || !this.isSocketOpen()) {
			this.connect();
		}
	}

	connect(): void {
		this.clearReconnect();
		this.closeSocket();

		if (!this.settings.apiKey) {
			this.setState("missing-key");
			return;
		}

		const protocol = this.settings.useTls === false ? "ws" : "wss";
		// Keep HTTP page status while the relay socket retries.
		if (this.settings.httpFallback === false) this.setState("connecting");

		try {
			this.socket = new WebSocket(this.buildEndpoint(protocol, protocol === "wss" ? "443" : "80"));
		} catch (error) {
			void this.handleRelayFailure("error");
			this.scheduleReconnect();
			return;
		}

		this.socket.on("open", () => {
			this.reconnectAttempt = 0;
			this.sendRaw({ join: this.settings.apiKey || "" });
			// HTTP failures already report their specific state. A late failure
			// from a previous connection must not overwrite the current state.
			void this.sendCommand({ action: "getDetails" }).catch(() => undefined);
		});

		this.socket.on("message", data => {
			this.handleMessage(data.toString());
		});

		this.socket.on("close", () => {
			if (this.settings.apiKey) {
				void this.handleRelayFailure("disconnected");
				this.scheduleReconnect();
			}
		});

		this.socket.on("error", () => {
			void this.handleRelayFailure("error");
		});
	}

	private async handleRelayFailure(state: "error" | "disconnected"): Promise<void> {
		if (this.settings.httpFallback === false) {
			this.setState(state);
			return;
		}
		const generation = this.connectionGeneration;
		if (this.checkingHttpGeneration === generation) return;
		this.checkingHttpGeneration = generation;
		try {
			await this.sendCommand({ action: "getDetails" });
		} catch {
			// HTTP reports the page/network failure, with stale responses rejected.
		} finally {
			if (this.checkingHttpGeneration === generation) this.checkingHttpGeneration = undefined;
		}
	}

	disconnect(state: ConnectionStateName = "disconnected"): void {
		this.connectionGeneration += 1;
		this.clearReconnect();
		this.closeSocket();
		this.setState(state);
	}

	async sendCommand(payload: VdoCommandPayload, options: { awaitCallback?: boolean } = {}): Promise<VdoCallback> {
		const awaitCallback = options.awaitCallback !== false;
		const request = { ...payload };
		const generation = this.connectionGeneration;

		if (!awaitCallback) {
			// Prefer the request/response HTTP route whenever the command fits it.
			// The hosted WebSocket relay can remain open while silently failing to
			// forward controller messages to the VDO page; an open socket therefore
			// is not sufficient proof that a realtime dial command was delivered.
			if (this.shouldUseHttp(request)) {
				const callback = await this.sendHttp(request);
				this.assertCurrentConnection(generation);
				this.handleCallback(callback);
				return callback;
			}
			if (this.isRealtimeIncremental(request) && this.shouldSkipRealtimeCommand()) {
				this.skippedRealtimeCommands += 1;
				return request as VdoCallback;
			}
			if (this.isSocketOpen()) {
				this.sendRaw(request);
				return request as VdoCallback;
			}
			throw new Error("VDO.Ninja API WebSocket is not connected");
		}

		if (this.shouldUseHttp(request)) {
			const callback = await this.sendHttp(request);
			this.assertCurrentConnection(generation);
			this.handleCallback(callback);
			return callback;
		}

		// Raw WebSocket sends are fire-and-forget: the reference API relay owns
		// `get` callback correlation for its HTTP route and does not forward
		// request-scoped callbacks to WebSocket peers.
		if (!this.isSocketOpen()) {
			throw new Error("VDO.Ninja API WebSocket is not connected");
		}
		this.sendRaw(request);
		return request as VdoCallback;
	}

	private async sendHttp(payload: VdoCommandPayload): Promise<VdoCallback> {
		const generation = this.connectionGeneration;
		if (!this.settings.apiKey) {
			throw new Error("Missing VDO.Ninja API key");
		}
		const protocol = this.settings.useTls === false ? "http" : "https";
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.settings.requestTimeoutMs || 5000);
		let response: Response;
		let text: string;
		try {
			response = await fetch(this.buildHttpUrl(protocol, payload), { signal: controller.signal });
			text = await response.text();
		} catch (error) {
			this.assertCurrentConnection(generation);
			if (controller.signal.aborted) {
				this.setState("timeout");
				throw new Error(`Timed out waiting for ${payload.action} HTTP response`);
			}
			this.setState("error");
			throw error;
		} finally {
			clearTimeout(timeout);
		}
		this.assertCurrentConnection(generation);
		const trimmed = text.trim();
		if (!response.ok) {
			this.setState("error");
			throw new Error(`VDO.Ninja API HTTP request failed with ${response.status}`);
		}
		if (trimmed === "failed") {
			this.setState("no-page");
			throw new Error("No VDO.Ninja page is joined to this API key");
		}
		if (trimmed === "timeout") {
			this.setState("timeout");
			throw new Error(`Timed out waiting for ${payload.action} callback`);
		}
		let result: JsonValue = text;
		try {
			result = JSON.parse(text) as JsonValue;
		} catch {
			// The reference relay returns primitive strings for simple HTTP results.
		}
		return {
			action: payload.action,
			target: payload.target,
			value: payload.value,
			value2: payload.value2,
			get: payload.get,
			result
		};
	}

	private shouldUseHttp(payload: VdoCommandPayload): boolean {
		return this.settings.httpFallback !== false && !this.requiresRawWebSocket(payload);
	}

	private requiresRawWebSocket(payload: VdoCommandPayload): boolean {
		return hasOwn(payload, "value2");
	}

	private isRealtimeIncremental(payload: VdoCommandPayload): boolean {
		return isRealtimeAction(payload.action);
	}

	private shouldSkipRealtimeCommand(): boolean {
		if (!this.isSocketOpen()) {
			return false;
		}
		const now = Date.now();
		this.pruneSentTimestamps(now);
		return this.sentTimestamps.length >= 30 || (this.socket?.bufferedAmount || 0) > 262144;
	}

	private recordSend(): void {
		const now = Date.now();
		this.sentTimestamps.push(now);
		this.pruneSentTimestamps(now);
	}

	private pruneSentTimestamps(now: number): void {
		const cutoff = now - 1000;
		while (this.sentTimestamps.length && this.sentTimestamps[0] < cutoff) {
			this.sentTimestamps.shift();
		}
	}

	private sendRaw(payload: JsonObject): void {
		if (!this.isSocketOpen() || !this.socket) {
			throw new Error("VDO.Ninja API WebSocket is not connected");
		}
		this.socket.send(JSON.stringify(payload));
		this.recordSend();
	}

	private handleMessage(raw: string): void {
		let message: VdoClientMessage;
		try {
			message = JSON.parse(raw) as VdoClientMessage;
		} catch {
			return;
		}

		if (!isJsonObject(message)) {
			return;
		}
		if (isJsonObject(message.msg)) {
			message = message.msg as VdoClientMessage;
		}

		this.emit("message", message);

		if (isJsonObject(message.callback)) {
			this.handleCallback(message.callback);
		}
		if (isJsonObject(message.update)) {
			this.setState("connected");
			this.emit("update", message.update);
		}
	}

	private handleCallback(callback: VdoCallback): void {
		this.setState("connected");
		this.emit("callback", callback);
	}

	private assertCurrentConnection(generation: number): void {
		if (generation !== this.connectionGeneration) {
			throw new Error("VDO.Ninja API connection changed during request");
		}
	}

	private isSocketOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	private closeSocket(): void {
		if (!this.socket) {
			return;
		}
		const socket = this.socket;
		this.socket = null;
		socket.removeAllListeners();
		socket.on("error", () => {
			// ws emits an error when a connecting socket is closed during settings changes.
		});
		try {
			if (socket.readyState === WebSocket.CONNECTING) {
				socket.terminate();
			} else if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
				socket.close();
			}
		} catch {
			// Ignore close races.
		}
	}

	private scheduleReconnect(): void {
		this.clearReconnect();
		if (!this.settings.apiKey) {
			return;
		}
		this.reconnectAttempt += 1;
		const delay = Math.min(30000, 1000 * Math.max(1, this.reconnectAttempt));
		this.reconnectTimer = setTimeout(() => this.connect(), delay);
	}

	private clearReconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private buildEndpoint(protocol: "ws" | "wss" | "http" | "https", defaultPort?: string): string {
		let host = this.settings.apiHost || DEFAULT_API_HOST;
		host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/.*$/, "");
		const hasPort = /:\d+$/.test(host);
		const port = defaultPort && !hasPort ? `:${defaultPort}` : "";
		return `${protocol}://${host}${port}`;
	}

	private buildHttpUrl(protocol: "http" | "https", payload: VdoCommandPayload): string {
		const parts: JsonValue[] = [this.settings.apiKey || "", payload.action];
		if (hasOwn(payload, "target")) {
			parts.push(payload.target ?? "null");
			parts.push(hasOwn(payload, "value") ? payload.value ?? "null" : "null");
		} else if (hasOwn(payload, "value")) {
			parts.push(payload.value ?? "null");
		}
		return `${this.buildEndpoint(protocol)}/${parts.map(valueToPathSegment).join("/")}`;
	}

	private setState(state: ConnectionStateName): void {
		if (this.state === state) {
			return;
		}
		this.state = state;
		this.emit("state", state);
	}

	private addListener<K extends keyof VdoClient["listeners"]>(
		type: K,
		listener: VdoClient["listeners"][K] extends Set<Listener<infer T>> ? Listener<T> : never
	): () => void {
		const set = this.listeners[type] as Set<typeof listener>;
		set.add(listener);
		return () => set.delete(listener);
	}

	private emit<K extends keyof VdoClient["listeners"]>(
		type: K,
		payload: VdoClient["listeners"][K] extends Set<Listener<infer T>> ? T : never
	): void {
		const set = this.listeners[type] as Set<Listener<typeof payload>>;
		for (const listener of set) {
			listener(payload);
		}
	}
}

function isRealtimeAction(action: string): boolean {
	return action === "zoom" ||
		action === "focus" ||
		action === "pan" ||
		action === "tilt" ||
		action === "exposure" ||
		action === "ptzZoom" ||
		action === "ptzFocus" ||
		action === "ptzPan" ||
		action === "ptzTilt" ||
		action === "volume" ||
		action === "panning" ||
		action === "bitrate" ||
		action === "setBufferDelay";
}

function hasOwn(object: JsonObject, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(object, key);
}

function isJsonObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valueToPathSegment(value: JsonValue): string {
	if (value === null || value === "") {
		return "null";
	}
	if (typeof value === "object") {
		return encodeURIComponent(JSON.stringify(value));
	}
	return encodeURIComponent(String(value));
}
