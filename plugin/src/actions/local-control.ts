import { clearActionError, showActionAlert } from "./action-feedback.js";
import { setCommandIcon } from "./command-icon.js";
import { action, type KeyAction, type KeyDownEvent, type KeyUpEvent, SingletonAction, type DidReceiveSettingsEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import {
	buildLocalControlPayload,
	buildLocalMomentaryPayload,
	getLocalControlDefinition,
	getLocalControlTrackField,
	isMomentaryLocalBehavior
} from "../api/command-registry.js";
import { normalizeLocalControlSettings } from "../api/settings.js";
import type { LocalControlSettings } from "../api/types.js";
import { sessionStore, vdoClient } from "../services.js";

@action({ UUID: "ninja.vdo.streamdeck.local-control" })
export class LocalControlAction extends SingletonAction<LocalControlSettings> {
	private armedUntil = new Map<string, number>();
	private momentarySequence = new Map<string, number>();
	private momentaryPressed = new Set<string>();
	private momentarySettings = new Map<string, { settings: LocalControlSettings; action: KeyAction<LocalControlSettings> }>();
	private momentaryRequests = new Map<string, Promise<void>>();

	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<LocalControlSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<LocalControlSettings>): Promise<void> {
		this.armedUntil.delete(ev.action.id);
		if (ev.action.isKey()) {
			const held = this.momentarySettings.get(ev.action.id);
			const next = normalizeLocalControlSettings(ev.payload.settings);
			if (held && (held.settings.command !== next.command || held.settings.behavior !== next.behavior)) {
				await this.sendMomentary(ev.action, held.settings, "up");
			}
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onWillDisappear(ev: WillDisappearEvent<LocalControlSettings>): Promise<void> {
		const held = this.momentarySettings.get(ev.action.id);
		if (held) {
			await this.sendMomentary(held.action, held.settings, "up", false);
		}
		this.armedUntil.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<LocalControlSettings>): Promise<void> {
		const settings = normalizeLocalControlSettings(ev.payload.settings);
		const definition = getLocalControlDefinition(settings.command);
		if (this.isTrackInactive(definition)) {
			await showActionAlert(ev.action, "media");
			await this.render(ev.action, settings);
			return;
		}

		if (isMomentaryLocalBehavior(settings.behavior)) {
			await this.sendMomentary(ev.action, settings, "down");
			return;
		}

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

		try {
			const payload = buildLocalControlPayload(settings);
			await vdoClient.sendCommand(payload);
			clearActionError(ev.action);
			await ev.action.showOk();
		} catch (error) {
			await showActionAlert(ev.action, "command", error);
		}

		this.armedUntil.delete(ev.action.id);
		await this.render(ev.action, settings);
	}

	override async onKeyUp(ev: KeyUpEvent<LocalControlSettings>): Promise<void> {
		const held = this.momentarySettings.get(ev.action.id);
		if (held) {
			await this.sendMomentary(ev.action, held.settings, "up");
			return;
		}
		const settings = normalizeLocalControlSettings(ev.payload.settings);
		const definition = getLocalControlDefinition(settings.command);
		if (this.isTrackInactive(definition)) {
			await this.render(ev.action, settings);
			return;
		}
		if (isMomentaryLocalBehavior(settings.behavior)) {
			await this.sendMomentary(ev.action, settings, "up");
		}
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isKey()) {
				const settings = await visible.getSettings<LocalControlSettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: KeyAction<LocalControlSettings>, rawSettings?: LocalControlSettings): Promise<void> {
		const settings = normalizeLocalControlSettings(rawSettings || (await actionContext.getSettings<LocalControlSettings>()));
		const definition = getLocalControlDefinition(settings.command);
		await setCommandIcon(actionContext, definition.icon, !definition.stateField);
		const label = settings.title || definition.label;
		if (this.isTrackInactive(definition)) {
			await actionContext.setState(0);
			await actionContext.setTitle(`${label}\nInactive`);
			return;
		}
		if (isMomentaryLocalBehavior(settings.behavior)) {
			await this.renderMomentary(actionContext, settings);
			return;
		}

		const active = this.resolveActive(definition);
		if (active === true) {
			await actionContext.setState(1);
			await actionContext.setTitle(`${label}\nOn`);
		} else if (active === false) {
			await actionContext.setState(0);
			await actionContext.setTitle(`${label}\nOff`);
		} else {
			await actionContext.setState(0);
			await actionContext.setTitle(label);
		}
	}

	private async sendMomentary(actionContext: KeyAction<LocalControlSettings>, settings: LocalControlSettings, phase: "down" | "up", render = true): Promise<void> {
		const sequence = this.nextMomentarySequence(actionContext.id);
		if (phase === "down") {
			this.momentaryPressed.add(actionContext.id);
			this.momentarySettings.set(actionContext.id, { settings, action: actionContext });
		} else {
			this.momentaryPressed.delete(actionContext.id);
			this.momentarySettings.delete(actionContext.id);
		}

		// HTTP requests can complete out of order. Keep each key's press/release
		// commands ordered so a late press cannot leave the microphone live.
		const previous = this.momentaryRequests.get(actionContext.id) || Promise.resolve();
		const request = previous.catch(() => undefined).then(async () => {
			const payload = buildLocalMomentaryPayload(settings, phase);
			await vdoClient.sendCommand(payload, { awaitCallback: false });
		});
		this.momentaryRequests.set(actionContext.id, request);
		try {
			await request;
			if (this.isCurrentMomentarySequence(actionContext.id, sequence)) clearActionError(actionContext);
		} catch (error) {
			if (this.isCurrentMomentarySequence(actionContext.id, sequence)) {
				this.momentaryPressed.delete(actionContext.id);
				await showActionAlert(actionContext, "command", error);
			}
		} finally {
			if (this.momentaryRequests.get(actionContext.id) === request) {
				this.momentaryRequests.delete(actionContext.id);
			}
		}

		if (render && this.isCurrentMomentarySequence(actionContext.id, sequence)) {
			await this.render(actionContext, settings);
		}
	}

	private async renderMomentary(actionContext: KeyAction<LocalControlSettings>, settings: LocalControlSettings): Promise<void> {
		if (getLocalControlDefinition(settings.command).id !== "mic") {
			await actionContext.setState(0);
			await actionContext.setTitle("Mic\nOnly");
			return;
		}
		const pressed = this.momentaryPressed.has(actionContext.id);
		const label = settings.title || "Mic";
		if (settings.behavior === "pushToMute") {
			await actionContext.setState(pressed ? 0 : 1);
			await actionContext.setTitle(pressed ? `${label}\nMuted` : `${label}\nHold Mute`);
			return;
		}
		await actionContext.setState(pressed ? 1 : 0);
		await actionContext.setTitle(pressed ? `${label}\nLive` : `${label}\nHold Talk`);
	}

	private resolveActive(definition: ReturnType<typeof getLocalControlDefinition>): boolean | undefined {
		if (!definition.stateField) {
			return undefined;
		}
		const value = sessionStore.getLocalBoolean(definition.stateField);
		if (typeof value === "undefined") {
			return undefined;
		}
		return definition.invertState ? !value : value;
	}

	private isTrackInactive(definition: ReturnType<typeof getLocalControlDefinition>): boolean {
		const trackField = getLocalControlTrackField(definition.id);
		return !!trackField && sessionStore.getLocalBoolean(trackField) === false;
	}

	private arm(actionId: string): void {
		this.armedUntil.set(actionId, Date.now() + 2000);
	}

	private nextMomentarySequence(actionId: string): number {
		const sequence = (this.momentarySequence.get(actionId) || 0) + 1;
		this.momentarySequence.set(actionId, sequence);
		return sequence;
	}

	private isCurrentMomentarySequence(actionId: string, sequence: number): boolean {
		return this.momentarySequence.get(actionId) === sequence;
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
