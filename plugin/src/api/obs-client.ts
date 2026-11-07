import { createHash, randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { GlobalSettings } from "./types.js";

export class ObsRequestError extends Error {
	constructor(message: string, readonly code: number) {
		super("OBS: " + message);
	}
}

// OBS WebSocket v5: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
// Each held key owns its connection, so changing settings cannot retarget a release.
export class ObsClient {
	private socket: WebSocket | null = null;
	private opening: Promise<void> | null = null;
	private ready = false;
	private released = false;
	private liveInputs = new Map<string, Record<string, string>>();
	private releasePromise: Promise<void> | null = null;
	private retryTimer: NodeJS.Timeout | null = null;
	private pending = new Map<string, { resolve(value: Record<string, unknown>): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
	onDisconnect?: () => void;

	constructor(private settings: Pick<GlobalSettings, "obsPort" | "obsPassword">) {}

	connect(): Promise<void> {
		if (this.ready) return Promise.resolve();
		if (this.opening) return this.opening;
		const port = this.settings.obsPort || 4455;
		if (!Number.isInteger(port) || port < 1 || port > 65535) return Promise.reject(new Error("OBS: Enter a port between 1 and 65535."));
		this.opening = new Promise<void>((resolve, reject) => {
			const socket = new WebSocket(`ws://127.0.0.1:${port}`);
			this.socket = socket;
			const timer = setTimeout(() => fail(new Error("OBS: Connection timed out. Check the WebSocket server and port.")), 2500);
			const fail = (error: Error) => {
				clearTimeout(timer);
				reject(error);
				if (this.socket === socket) {
					this.close();
					if (!this.released && this.liveInputs.size) this.onDisconnect?.();
				}
			};
			socket.on("message", raw => {
				if (this.socket !== socket) return;
				try {
					const message = JSON.parse(raw.toString());
					const data = message.d || {};
					if (message.op === 0) {
						const identify: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 0 };
						if (data.authentication) {
							const hash = (value: string) => createHash("sha256").update(value).digest("base64");
							const secret = hash((this.settings.obsPassword || "") + data.authentication.salt);
							identify.authentication = hash(secret + data.authentication.challenge);
						}
						socket.send(JSON.stringify({ op: 1, d: identify }));
					} else if (message.op === 2) {
						clearTimeout(timer);
						this.ready = true;
						resolve();
					} else if (message.op === 7) {
						const request = this.pending.get(data.requestId);
						if (!request) return;
						this.pending.delete(data.requestId);
						clearTimeout(request.timer);
						if (data.requestStatus?.result === true) request.resolve(data.responseData || {});
						else request.reject(new ObsRequestError(data.requestStatus?.comment || "Request failed. Check the selected microphone.", data.requestStatus?.code));
					}
				} catch {
					fail(new Error("OBS: Invalid WebSocket response."));
				}
			});
			socket.on("error", () => fail(new Error("OBS: Cannot connect. Enable the WebSocket server and check its port.")));
			socket.on("close", code => {
				clearTimeout(timer);
				reject(new Error(code === 4009 ? "OBS: Incorrect WebSocket password." : "OBS: Connection closed."));
				if (this.socket !== socket) return;
				this.close();
				if (!this.released && this.liveInputs.size) this.onDisconnect?.();
			});
		}).finally(() => { this.opening = null; });
		return this.opening;
	}

	async request(requestType: string, requestData: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
		await this.connect();
		if (this.released && requestType === "SetInputMute" && requestData.inputMuted === false) return {};
		return new Promise((resolve, reject) => {
			const requestId = randomUUID();
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				reject(new Error("OBS: Request timed out. Check the microphone in OBS."));
				this.close();
				if (!this.released && this.liveInputs.size) this.onDisconnect?.();
			}, 2500);
			this.pending.set(requestId, { resolve, reject, timer });
			this.socket!.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }), error => {
				if (!error) return;
				clearTimeout(timer);
				this.pending.delete(requestId);
				reject(new Error("OBS: Could not send the microphone command."));
			});
		});
	}

	async unmute(inputName: string): Promise<void> {
		if (!inputName) throw new Error("OBS: Select a microphone first.");
		const list = await this.request("GetInputList");
		const input = Array.isArray(list.inputs) ? list.inputs.find(item => item.inputName === inputName) : undefined;
		if (!input) throw new Error("OBS: Microphone not found. Connect to OBS and choose it again.");
		if (this.released) return;
		// Recent OBS versions provide a stable ID, including if a live source is renamed.
		const target: Record<string, string> = typeof input.inputUuid === "string" ? { inputUuid: input.inputUuid } : { inputName };
		// A lost acknowledgement does not prove that the unmute failed.
		this.liveInputs.set(inputName, target);
		try {
			await this.request("SetInputMute", { ...target, inputMuted: false });
		} catch (error) {
			if (error instanceof ObsRequestError) this.liveInputs.delete(inputName);
			throw error;
		}
	}

	release(): Promise<void> {
		this.released = true;
		if (this.releasePromise) return this.releasePromise;
		this.releasePromise = (async () => {
			try {
				for (const [inputName, target] of this.liveInputs) {
					try {
						await this.request("SetInputMute", { ...target, inputMuted: true });
					} catch (error) {
						// A removed source cannot still be playing audio.
						if (!(error instanceof ObsRequestError) || error.code !== 600 || !target.inputUuid) throw error;
					}
					this.liveInputs.delete(inputName);
				}
				if (this.retryTimer) clearTimeout(this.retryTimer);
				this.retryTimer = null;
				this.close();
			} catch (error) {
				// Reconnect only to finish a pending mute, never to resume talking.
				if (!this.retryTimer) {
					this.retryTimer = setTimeout(() => {
						this.retryTimer = null;
						void this.release().catch(() => undefined);
					}, 2000);
					this.retryTimer.unref();
				}
				throw error;
			}
		})().finally(() => { this.releasePromise = null; });
		return this.releasePromise;
	}

	close(): void {
		this.ready = false;
		const socket = this.socket;
		this.socket = null;
		if (socket) socket.terminate();
		for (const request of this.pending.values()) {
			clearTimeout(request.timer);
			request.reject(new Error("OBS: Connection closed."));
		}
		this.pending.clear();
	}
}
