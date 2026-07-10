import { action, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { buildGuestCommandPayload, getGuestCommandDefinition } from "../api/command-registry.js";
import { normalizeGuestCommandSettings } from "../api/settings.js";
import type { GuestCommandSettings, StreamState } from "../api/types.js";
import { selectedTargetStore, sessionStore, vdoClient } from "../services.js";
import { renderGuestTitle, resolveGuestTargetChoice, resolveGuestTargetValue } from "./guest-targeting.js";

@action({ UUID: "ninja.vdo.streamdeck.guest-command" })
export class GuestCommandAction extends SingletonAction<GuestCommandSettings> {
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

	override async onWillAppear(ev: WillAppearEvent<GuestCommandSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<GuestCommandSettings>): Promise<void> {
		const settings = normalizeGuestCommandSettings(ev.payload.settings);
		const definition = getGuestCommandDefinition(settings.command);
		const target = resolveGuestTargetValue(settings);

		if (definition.dangerous && settings.dangerousConfirm !== false && !this.isArmed(ev.action.id)) {
			this.arm(ev.action.id);
			await ev.action.setState(0);
			await ev.action.setTitle("Press\nagain");
			setTimeout(() => {
				if (!this.isArmed(ev.action.id)) {
					void this.render(ev.action, settings);
				}
			}, 2100);
			return;
		}

		if (typeof target === "undefined" || target === "") {
			await ev.action.showAlert();
			await this.render(ev.action, settings);
			return;
		}

		try {
			const payload = buildGuestCommandPayload(settings, target);
			const callback = await vdoClient.sendCommand(payload, { awaitCallback: definition.awaitCallback !== false });
			if (definition.falseMeansFailure && callback.result === false) {
				throw new Error(`${definition.label} was rejected by VDO.Ninja`);
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
				const settings = await visible.getSettings<GuestCommandSettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: KeyAction<GuestCommandSettings>, rawSettings?: GuestCommandSettings): Promise<void> {
		const settings = normalizeGuestCommandSettings(rawSettings || (await actionContext.getSettings<GuestCommandSettings>()));
		const definition = getGuestCommandDefinition(settings.command);
		const choice = resolveGuestTargetChoice(settings);
		const stream = choice ? sessionStore.getStream(choice.streamID) : undefined;
		const active = this.resolveActive(definition.id, stream);
		const title = renderGuestTitle(settings.title, definition.label.replace(/^Guest /, ""), choice, {
			command: definition.label,
			state: active === true ? "On" : active === false ? "Off" : ""
		});

		if (active === true) {
			await actionContext.setState(1);
		} else {
			await actionContext.setState(0);
		}
		await actionContext.setTitle(title);
	}

	private resolveActive(commandId: string, stream: StreamState | undefined): boolean | undefined {
		if (!stream) {
			return undefined;
		}
		if (commandId === "mic") {
			const muted = firstBoolean(stream.directorMuted, stream.muted);
			return typeof muted === "boolean" ? !muted : undefined;
		}
		if (commandId === "camera") {
			const hidden = firstBoolean(stream.directorVideoHide, stream.videoMuted);
			return typeof hidden === "boolean" ? !hidden : undefined;
		}
		if (commandId === "speaker") {
			return typeof stream.speakerMuted === "boolean" ? !stream.speakerMuted : undefined;
		}
		if (commandId === "activateQueuedGuest") {
			return isTruthyMapValue(stream.others?.["remove-queue"]);
		}
		return undefined;
	}

	private arm(actionId: string): void {
		this.armedUntil.set(actionId, Date.now() + 2000);
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

function firstBoolean(...values: unknown[]): boolean | undefined {
	for (const value of values) {
		if (typeof value === "boolean") {
			return value;
		}
	}
	return undefined;
}

function isTruthyMapValue(value: unknown): boolean {
	return value === true || value === "true" || value === 1 || value === "1";
}
