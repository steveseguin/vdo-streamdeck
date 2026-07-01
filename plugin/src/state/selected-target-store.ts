type Listener = () => void;

export class SelectedTargetStore {
	private selectedStreamID: string | null = null;
	private listeners = new Set<Listener>();

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getSelectedStreamID(): string | null {
		return this.selectedStreamID;
	}

	setSelectedStreamID(streamID: string | null | undefined): void {
		const next = typeof streamID === "string" && streamID.trim() ? streamID.trim() : null;
		if (this.selectedStreamID === next) {
			return;
		}
		this.selectedStreamID = next;
		this.emit();
	}

	clear(): void {
		this.setSelectedStreamID(null);
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
