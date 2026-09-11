import type { KeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

// Reuse the native state images; Stream Deck continues to honor user artwork.
const rendered = new WeakMap<object, string>();

export const PTZ_ICONS: Record<string, string> = {
	zoom: "zoom", pan: "pan", tilt: "tilt", focus: "focus", autofocus: "focus", exposure: "exposure",
	"pan-left": "pan-left", "pan-right": "pan-right", "tilt-up": "tilt-up", "tilt-down": "tilt-down",
	"zoom-out": "zoom-out", "zoom-absolute": "zoom-absolute"
};
export const MIXER_ICONS: Record<string, string> = {
	layout: "layout", setGuestSlot: "slot", muteAllGuests: "mic", transferAllGuests: "transfer"
};

export async function setCommandIcon<T extends JsonObject>(action: KeyAction<T>, icon: string, neutral = false): Promise<void> {
	const identity = `${icon}:${neutral}`;
	if (rendered.get(action) === identity) return;
	// Record before awaiting so simultaneous feedback refreshes cannot flood images.
	rendered.set(action, identity);
	try {
		await action.setImage(`imgs/command-${icon}-${neutral ? "neutral" : "off"}.png`, { state: 0 });
		if (rendered.get(action) !== identity) return;
		await action.setImage(`imgs/command-${icon}-on.png`, { state: 1 });
	} catch (error) {
		if (rendered.get(action) === identity) rendered.delete(action);
		throw error;
	}
}
