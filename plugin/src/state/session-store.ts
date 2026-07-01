import type { JsonObject } from "@elgato/utils";
import type { ConnectionStateName, GuestListEntry, StreamChoice, StreamState, VdoCallback, VdoUpdate } from "../api/types.js";

type Listener = () => void;
type DetailsMode = "replace" | "merge";

export class SessionStore {
	private connectionState: ConnectionStateName = "missing-key";
	private details = new Map<string, StreamState>();
	private guestList = new Map<string, GuestListEntry>();
	private localStreamId: string | null = null;
	private lastError: string | null = null;
	private lastCommandResult: unknown = null;
	private listeners = new Set<Listener>();

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	setConnectionState(state: ConnectionStateName): void {
		this.connectionState = state;
		this.emit();
	}

	getConnectionState(): ConnectionStateName {
		return this.connectionState;
	}

	getLastError(): string | null {
		return this.lastError;
	}

	getStreamCount(): number {
		return this.details.size;
	}

	getLocalStream(): StreamState | undefined {
		return this.localStreamId ? this.details.get(this.localStreamId) : undefined;
	}

	getLocalBoolean(field: keyof StreamState): boolean | undefined {
		const local = this.getLocalStream();
		const value = local?.[field];
		return typeof value === "boolean" ? value : undefined;
	}

	getGuestList(): Map<string, GuestListEntry> {
		return new Map(this.guestList);
	}

	getStream(streamId: string): StreamState | undefined {
		return this.details.get(streamId);
	}

	getStreamChoices(options: { includeLocal?: boolean } = {}): StreamChoice[] {
		const positions = new Map<string, number>();
		for (const [position, entry] of this.guestList) {
			const parsed = parseInt(position, 10);
			if (!Number.isNaN(parsed)) {
				positions.set(entry.streamID, parsed);
			}
		}

		const choices = Array.from(this.details.values())
			.filter(stream => options.includeLocal || !(stream.localStream || stream.localstream))
			.map(stream => {
				const choice: StreamChoice = {
					streamID: stream.streamID,
					label: stream.label || stream.streamID,
					position: typeof stream.position === "number" ? stream.position : positions.get(stream.streamID),
					slot: stream.slot,
					localStream: !!(stream.localStream || stream.localstream),
					held: isTruthyMapValue(stream.others?.["remove-queue"]),
					handRaised: isTruthyMapValue(stream.others?.["hand-raised"]),
					scenes: stream.scenes
				};
				if (typeof stream.UUID === "string") {
					choice.UUID = stream.UUID;
				}
				return choice;
			});

		return choices.sort((left, right) => {
			if (typeof left.position === "number" && typeof right.position === "number") {
				return left.position - right.position;
			}
			if (typeof left.position === "number") {
				return -1;
			}
			if (typeof right.position === "number") {
				return 1;
			}
			return left.label.localeCompare(right.label);
		});
	}

	applyCallback(callback: VdoCallback): void {
		this.lastCommandResult = callback.result;
		this.lastError = callback.error ? callback.message || "Command failed" : null;

		if (callback.action === "getDetails" && callback.result && typeof callback.result === "object") {
			this.applyDetails(callback.result as JsonObject, callback.value ? "merge" : "replace");
			return;
		}

		if (callback.action === "getGuestList" && callback.result && typeof callback.result === "object") {
			this.applyGuestList(callback.result as JsonObject);
			return;
		}

		this.emit();
	}

	applyUpdate(update: VdoUpdate): void {
		if (update.action === "details" && update.value && typeof update.value === "object") {
			this.applyDetails(update.value as JsonObject, "merge");
			return;
		}

		if (update.action === "muted") {
			this.patchLocal({ muted: toBoolean(update.value) });
		} else if (update.action === "videoMuted") {
			this.patchLocal({ videoMuted: toBoolean(update.value) });
		} else if (update.action === "speakerMuted") {
			this.patchLocal({ speakerMuted: toBoolean(update.value) });
		} else if (update.action === "seeding") {
			this.patchLocal({ seeding: toBoolean(update.value) });
		} else if (update.action === "director") {
			const director = toBoolean(update.value);
			this.patchLocal(director ? { director } : { director, codirector: false });
		} else if (update.action === "codirector") {
			const codirector = toBoolean(update.value);
			this.patchLocal({ director: codirector, codirector });
		} else if (update.action === "remoteMuted" && update.streamID) {
			this.patchStream(update.streamID, { muted: toBoolean(update.value) });
		} else if (update.action === "remoteVideoMuted" && update.streamID) {
			this.patchStream(update.streamID, { videoMuted: toBoolean(update.value) });
		} else if (update.action === "directorMuted" && update.streamID) {
			this.patchStream(update.streamID, { directorMuted: toBoolean(update.value) });
		} else if (update.action === "directorVideoHide" && update.streamID) {
			this.patchStream(update.streamID, { directorVideoHide: toBoolean(update.value) });
		} else if (update.action === "positionChange" && update.value && typeof update.value === "object" && !Array.isArray(update.value)) {
			this.patchPositions(update.value as JsonObject);
		} else if (update.action === "endViewConnection") {
			if (typeof update.value === "string") {
				this.removeStream(update.value);
			} else {
				this.emit();
			}
		} else if (update.action === "hangup") {
			this.details.clear();
			this.guestList.clear();
			this.localStreamId = null;
			this.emit();
		} else {
			this.emit();
		}
	}

	private applyDetails(raw: JsonObject, mode: DetailsMode): void {
		if (mode === "replace") {
			this.details.clear();
			this.localStreamId = null;
		}

		for (const [streamId, value] of Object.entries(raw)) {
			if (!value || typeof value !== "object" || Array.isArray(value)) {
				continue;
			}
			const stream = unwrapDetailsEntry(streamId, value as JsonObject);
			const resolvedStreamId = typeof stream.streamID === "string" ? stream.streamID : streamId;
			const current = mode === "merge" ? this.details.get(resolvedStreamId) || {} : {};
			const normalized: StreamState = {
				...current,
				...stream,
				streamID: resolvedStreamId
			};
			this.details.set(normalized.streamID, normalized);
			if (normalized.localStream || normalized.localstream) {
				this.localStreamId = normalized.streamID;
			}
		}

		this.emit();
	}

	private applyGuestList(raw: JsonObject): void {
		this.guestList.clear();
		for (const [position, value] of Object.entries(raw)) {
			if (!value || typeof value !== "object" || Array.isArray(value)) {
				continue;
			}
			const entry = value as GuestListEntry;
			if (typeof entry.streamID === "string") {
				this.guestList.set(position, {
					streamID: entry.streamID,
					label: typeof entry.label === "string" ? entry.label : ""
				});
			}
		}
		this.emit();
	}

	private patchLocal(patch: Partial<StreamState>): void {
		if (!this.localStreamId) {
			this.emit();
			return;
		}
		this.patchStream(this.localStreamId, patch);
	}

	private patchStream(streamId: string, patch: Partial<StreamState>): void {
		const target = this.details.get(streamId);
		if (target) {
			this.details.set(streamId, { ...target, ...patch });
		} else if (streamId) {
			this.details.set(streamId, { streamID: streamId, ...patch });
		}
		this.emit();
	}

	private patchPositions(raw: JsonObject): void {
		for (const [streamId, position] of Object.entries(raw)) {
			const parsed = typeof position === "number" ? position : parseInt(String(position), 10);
			if (!Number.isNaN(parsed)) {
				this.patchStreamWithoutEmit(streamId, { position: parsed });
			}
		}
		this.emit();
	}

	private patchStreamWithoutEmit(streamId: string, patch: Partial<StreamState>): void {
		const target = this.details.get(streamId);
		if (target) {
			this.details.set(streamId, { ...target, ...patch });
		} else if (streamId) {
			this.details.set(streamId, { streamID: streamId, ...patch });
		}
	}

	private removeStream(streamId: string): void {
		this.details.delete(streamId);
		if (this.localStreamId === streamId) {
			this.localStreamId = null;
		}
		for (const [position, entry] of this.guestList) {
			if (entry.streamID === streamId) {
				this.guestList.delete(position);
			}
		}
		this.emit();
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

function toBoolean(value: unknown): boolean {
	if (value === true || value === "true" || value === 1 || value === "1") {
		return true;
	}
	return false;
}

function isTruthyMapValue(value: unknown): boolean {
	return value === true || value === "true" || value === 1 || value === "1";
}

function unwrapDetailsEntry(streamId: string, value: JsonObject): StreamState {
	if (typeof value.streamID === "string") {
		return value as StreamState;
	}

	const directNested = value[streamId];
	if (directNested && typeof directNested === "object" && !Array.isArray(directNested)) {
		return directNested as StreamState;
	}

	const nestedValues = Object.values(value).filter(
		entry => entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as StreamState).streamID === "string"
	);
	if (nestedValues.length === 1) {
		return nestedValues[0] as StreamState;
	}

	return value as StreamState;
}
