import streamDeck from "@elgato/streamdeck";

type FeedbackAction = { id: string; showAlert(): Promise<void> };
type FailureReason = "command" | "target" | "selection" | "media" | "ptz";

// SDK events and the inspector share the same action object. Keeping errors
// against that object lets them expire when the action leaves the deck.
const lastErrors = new WeakMap<object, string>();

export async function showActionAlert(action: FeedbackAction, reason: FailureReason = "command", error?: unknown): Promise<void> {
	lastErrors.set(action, errorMessage(reason, error));
	void sendActionError(action);
	await action.showAlert();
}

export function clearActionError(action: { id: string }): void {
	if (lastErrors.delete(action)) {
		void sendActionError(action);
	}
}

export async function sendActionError(action: { id: string } | undefined): Promise<void> {
	if (!action || streamDeck.ui.action !== action) return;
	try {
		await streamDeck.ui.sendToPropertyInspector({
			type: "actionError",
			context: action.id,
			message: lastErrors.get(action) || ""
		});
	} catch {
		// Closing the inspector must not affect a button or dial command.
	}
}

function errorMessage(reason: FailureReason, error: unknown): string {
	if (reason === "target") return "No guest available for this target. Check the guest position or stream ID. For Selected guest, press a Select Guest key first.";
	if (reason === "selection") return "No matching guest is available. Check this key's selection settings and confirm the guest has joined the connected page.";
	if (reason === "media") return "This media source is inactive. Enable it on the connected VDO.Ninja page first.";

	// Do not display raw errors: custom commands and transport errors can
	// contain private URLs, keys, or command values.
	const message = error instanceof Error ? error.message : "";
	if (message === "Missing VDO.Ninja API key") return "Set up the connection key under Connect VDO.Ninja, then test the connection.";
	if (message === "No VDO.Ninja page is joined to this API key") return "Open the VDO.Ninja page with the same API key, then test the connection.";
	if (message.startsWith("Timed out waiting for ")) return "No reply arrived. Check the VDO.Ninja page before trying again; the command may already have run.";
	if (message === "VDO.Ninja API WebSocket is not connected" || message === "VDO.Ninja API connection changed during request") {
		return "The connection is unavailable. Open the VDO.Ninja page and test the connection before trying again.";
	}
	if (message.startsWith("Named scene on/off requires live scene state")) return "Scene state is unavailable. Choose Toggle, or use a page that reports live scene membership.";
	if (message === "Slot assignment requires a guest target") return "No guest available for this target. Check the guest position or select a guest first.";
	if (message === "Mute all requires at least one guest" || message === "Transfer all requires at least one guest") return "No guests are available. Wait for a guest to join the connected director page.";
	if (message === "Transfer all requires a destination room") return "Enter a destination room in this action's settings.";
	if (message === "Guest-targeted exposure is not supported by VDO.Ninja") return "Guest exposure control is unavailable. Choose another PTZ control.";
	if (message === "Local autofocus is not exposed by the current VDO.Ninja API command path" || message === "Dial autofocus push action requires a guest target") return "Autofocus requires a guest camera. Change the scope to Guest and choose a target.";
	if (message === "Guest value dials currently support volume only") return "Guest Value Dials support volume. Use Local scope for the other controls.";
	if (message === "Momentary local control currently supports mic only") return "Push to talk and push to mute work with the microphone. Choose Mic or change the button behavior.";
	if (reason === "ptz") return "PTZ did not complete. Enable &ptz on the camera page, allow camera control in the browser, and check that the camera supports this control.";
	return "The command did not complete. Check the target and command settings, then test the connection. Check the VDO.Ninja page before trying again.";
}
