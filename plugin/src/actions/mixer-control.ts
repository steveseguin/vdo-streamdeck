import { action, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { buildMixerControlPayloads } from "../api/command-registry.js";
import { normalizeMixerControlSettings } from "../api/settings.js";
import type { MixerControlSettings, StreamChoice, StreamState } from "../api/types.js";
import { selectedTargetStore, sessionStore, vdoClient } from "../services.js";
import { resolveGuestTargetChoice, resolveGuestTargetValue } from "./guest-targeting.js";

@action({ UUID: "ninja.vdo.streamdeck.mixer-control" })
export class MixerControlAction extends SingletonAction<MixerControlSettings> {
	private armedUntil = new Map<string, number>();

	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
		selectedTargetStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<MixerControlSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<MixerControlSettings>): Promise<void> {
		const settings = normalizeMixerControlSettings(ev.payload.settings);
		const command = settings.command || "layout";

		if (command === "transferAllGuests" && settings.dangerousConfirm !== false && !this.isArmed(ev.action.id)) {
			this.arm(ev.action.id);
			await ev.action.setState(0);
			await ev.action.setTitle("Press\nagain");
			return;
		}

		const target = command === "setGuestSlot" ? resolveGuestTargetValue(settings) : undefined;
		const streams = command === "transferAllGuests" ? sessionStore.getStreamChoices({ includeLocal: false }) : undefined;

		try {
			const payloads = buildMixerControlPayloads(settings, { target, streams });
			for (let index = 0; index < payloads.length; index += 1) {
				await vdoClient.sendCommand(payloads[index]);
				if (payloads.length > 1 && index < payloads.length - 1) {
					await delay(75);
				}
			}
			await ev.action.showOk();
		} catch {
			await ev.action.showAlert();
		}

		this.armedUntil.delete(ev.action.id);
		await this.render(ev.action, settings);
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isKey()) {
				const settings = await visible.getSettings<MixerControlSettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: KeyAction<MixerControlSettings>, rawSettings?: MixerControlSettings): Promise<void> {
		const settings = normalizeMixerControlSettings(rawSettings || (await actionContext.getSettings<MixerControlSettings>()));
		const command = settings.command || "layout";
		let title = settings.title || defaultTitle(settings);
		let active = false;

		if (command === "setGuestSlot") {
			const choice = resolveGuestTargetChoice(settings);
			active = isSlotActive(choice, settings.slot);
			title = renderTargetTitle(settings.title, choice, settings.slot);
		} else if (command === "muteAllGuests") {
			active = allGuestsMuted();
		}

		await actionContext.setState(active ? 1 : 0);
		await actionContext.setTitle(title);
	}

	private arm(actionId: string): void {
		this.armedUntil.set(actionId, Date.now() + 2500);
	}

	private isArmed(actionId: string): boolean {
		const until = this.armedUntil.get(actionId) || 0;
		if (until > Date.now()) {
			return true;
		}
		this.armedUntil.delete(actionId);
		return false;
	}
}

function defaultTitle(settings: MixerControlSettings): string {
	if (settings.command === "setGuestSlot") {
		const destinationSlot = settings.slot || "1";
		return destinationSlot === "0" ? "Unset\nSlot" : `Set\nSlot ${destinationSlot}`;
	}
	if (settings.command === "muteAllGuests") {
		if (settings.muteBehavior === "on") {
			return "Mute\nAll";
		}
		if (settings.muteBehavior === "off") {
			return "Unmute\nAll";
		}
		return "Mute All\nGuests";
	}
	if (settings.command === "transferAllGuests") {
		return settings.transferRoom ? `Transfer\n${shortLabel(settings.transferRoom)}` : "Transfer\nAll";
	}
	const layout = settings.layout || "0";
	return layout === "0" ? "Layout\nAuto" : `Layout\n${layout}`;
}

function renderTargetTitle(template: string | undefined, choice: StreamChoice | undefined, slot: string | undefined): string {
	const label = choice?.label || "Guest";
	const sourceSlot = typeof choice?.position === "number" ? String(choice.position) : "";
	const destinationSlot = slot || "1";
	const destinationLabel = destinationSlot === "0" ? "Unslot" : `Slot ${destinationSlot}`;
	if (!template) {
		return sourceSlot ? `G${sourceSlot}\n${destinationLabel}` : `${shortLabel(label)}\n${destinationLabel}`;
	}
	const replacements: Record<string, string> = {
		label,
		streamID: choice?.streamID || "",
		slot: sourceSlot,
		destinationSlot
	};
	return Object.entries(replacements).reduce((title, [key, value]) => title.replaceAll(`{${key}}`, value), template);
}

function isSlotActive(choice: StreamChoice | undefined, slot: string | undefined): boolean {
	if (!choice) {
		return false;
	}
	const destination = parseInt(slot || "1", 10);
	if (!Number.isFinite(destination)) {
		return false;
	}
	if (destination === 0) {
		return choice.slot === false || choice.slot === 0;
	}
	return choice.slot === destination;
}

function allGuestsMuted(): boolean {
	const choices = sessionStore.getStreamChoices({ includeLocal: false });
	if (!choices.length) {
		return false;
	}
	return choices.every(choice => {
		const stream = sessionStore.getStream(choice.streamID);
		return isDirectorMuted(stream);
	});
}

function isDirectorMuted(stream: StreamState | undefined): boolean {
	if (!stream) {
		return false;
	}
	if (typeof stream.directorMuted === "boolean") {
		return stream.directorMuted;
	}
	const value = stream.others?.["mute-guest"];
	return value === true || value === "true" || value === 1 || value === "1";
}

function shortLabel(value: string): string {
	return value.length > 12 ? `${value.slice(0, 11)}...` : value;
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
