import { action, type KeyAction, type KeyDownEvent, type KeyUpEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { buildLocalControlPayload, buildLocalMomentaryPayload, getLocalControlDefinition, isMomentaryLocalBehavior } from "../api/command-registry.js";
import { normalizeLocalControlSettings } from "../api/settings.js";
import type { LocalControlSettings } from "../api/types.js";
import { sessionStore, vdoClient } from "../services.js";

@action({ UUID: "ninja.vdo.streamdeck.local-control" })
export class LocalControlAction extends SingletonAction<LocalControlSettings> {
	private armedUntil = new Map<string, number>();
	private momentarySequence = new Map<string, number>();
	private momentaryPressed = new Set<string>();

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

	override async onKeyDown(ev: KeyDownEvent<LocalControlSettings>): Promise<void> {
		const settings = normalizeLocalControlSettings(ev.payload.settings);
		const definition = getLocalControlDefinition(settings.command);

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
			await ev.action.showOk();
		} catch {
			await ev.action.showAlert();
		}

		this.armedUntil.delete(ev.action.id);
		await this.render(ev.action, settings);
	}

	override async onKeyUp(ev: KeyUpEvent<LocalControlSettings>): Promise<void> {
		const settings = normalizeLocalControlSettings(ev.payload.settings);
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
		if (isMomentaryLocalBehavior(settings.behavior)) {
			await this.renderMomentary(actionContext, settings);
			return;
		}

		const active = this.resolveActive(definition);
		const label = settings.title || definition.label;

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

	private async sendMomentary(actionContext: KeyAction<LocalControlSettings>, settings: LocalControlSettings, phase: "down" | "up"): Promise<void> {
		const sequence = this.nextMomentarySequence(actionContext.id);
		if (phase === "down") {
			this.momentaryPressed.add(actionContext.id);
		} else {
			this.momentaryPressed.delete(actionContext.id);
		}

		try {
			const payload = buildLocalMomentaryPayload(settings, phase);
			await vdoClient.sendCommand(payload, { awaitCallback: false });
		} catch {
			if (this.isCurrentMomentarySequence(actionContext.id, sequence)) {
				await actionContext.showAlert();
			}
		}

		if (this.isCurrentMomentarySequence(actionContext.id, sequence)) {
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
