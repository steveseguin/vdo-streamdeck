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
import { ObsClient } from "../api/obs-client.js";
import { getObsConnectionSettings, sessionStore, vdoClient } from "../services.js";

@action({ UUID: "ninja.vdo.streamdeck.local-control" })
export class LocalControlAction extends SingletonAction<LocalControlSettings> {
	private armedUntil = new Map<string, number>();
	private armedSettings = new Map<string, string>();
	private momentarySequence = new Map<string, number>();
	private momentaryPressed = new Set<string>();
	private momentarySettings = new Map<string, { settings: LocalControlSettings; action: KeyAction<LocalControlSettings> }>();
	private momentaryRequests = new Map<string, Promise<void>>();
	private obsMics = new Map<string, ObsClient>();
	private checkingCaptionConnection = new WeakSet<object>();

	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
		vdoClient.onState(state => {
			if (state === "connected") return;
			for (const held of this.momentarySettings.values()) {
				if (!held.settings.obsSync) continue;
				if (state === "missing-key" || vdoClient.currentSettings.httpFallback === false) {
					void this.sendMomentary(held.action, held.settings, "up");
				} else {
					// HTTP commands can still work while the relay socket reconnects.
					void this.checkCaptionConnection(held);
				}
			}
		});
	}

	override async onWillAppear(ev: WillAppearEvent<LocalControlSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<LocalControlSettings>): Promise<void> {
		// getSettings replies also arrive here; only a real change cancels a pending confirmation.
		if (this.armedSettings.get(ev.action.id) !== JSON.stringify(ev.payload.settings)) {
			this.armedUntil.delete(ev.action.id);
		}
		if (ev.action.isKey()) {
			const held = this.momentarySettings.get(ev.action.id);
			const next = normalizeLocalControlSettings(ev.payload.settings);
			if (held && (held.settings.command !== next.command || held.settings.behavior !== next.behavior || held.settings.obsSync !== next.obsSync || held.settings.obsInput !== next.obsInput)) {
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
		if (settings.obsSync && ev.payload.isInMultiAction) {
			await showActionAlert(ev.action, "command", new Error("OBS: Put Hold to talk on its own key, outside a Multi Action."));
			return;
		}
		if (settings.obsSync && this.momentaryPressed.has(ev.action.id)) return;
		const definition = getLocalControlDefinition(settings.command);
		if (!settings.obsSync && this.isTrackInactive(definition)) {
			await showActionAlert(ev.action, "media");
			await this.render(ev.action, settings);
			return;
		}

		if (isMomentaryLocalBehavior(settings.behavior)) {
			await this.sendMomentary(ev.action, settings, "down");
			return;
		}

		if (definition.dangerous && settings.dangerousConfirm !== false && !this.isArmed(ev.action.id)) {
			this.arm(ev.action.id, ev.payload.settings);
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
		// Settings changes and disappearance may already have released the press.
		// Never synthesize a second release from the key's current behavior: a
		// PTT-to-PTM edit would otherwise turn the microphone back on at key-up.
		const held = this.momentarySettings.get(ev.action.id);
		if (held) {
			await this.sendMomentary(ev.action, held.settings, "up");
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
		// State polls redraw visible keys; keep the confirmation prompt while armed.
		if (this.isArmed(actionContext.id)) {
			await actionContext.setTitle("Press\nagain");
			return;
		}
		const settings = normalizeLocalControlSettings(rawSettings || (await actionContext.getSettings<LocalControlSettings>()));
		const definition = getLocalControlDefinition(settings.command);
		await setCommandIcon(actionContext, definition.icon, !definition.stateField);
		const label = settings.title || definition.label;
		if (!settings.obsSync && this.isTrackInactive(definition)) {
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
		// Stop OBS immediately on release, even while a caption request is pending.
		const heldObs = this.obsMics.get(actionContext.id);
		const obsRelease = phase === "up" && heldObs ? heldObs.release() : Promise.resolve();
		void obsRelease.catch(() => undefined);

		// HTTP requests can complete out of order. Keep each key's press/release
		// commands ordered so a late press cannot leave the microphone live.
		const previous = this.momentaryRequests.get(actionContext.id) || Promise.resolve();
		const request = previous.catch(() => undefined).then(async () => {
			const payload = buildLocalMomentaryPayload(settings, phase);
			if (!settings.obsSync) {
				await vdoClient.sendCommand(payload, { awaitCallback: false });
				return;
			}
			if (phase === "up") {
				const obs = this.obsMics.get(actionContext.id);
				const results = await Promise.allSettled([
					vdoClient.sendCommand(payload, { awaitCallback: false }),
					obs ? obs.release() : obsRelease
				]);
				if (results[1].status === "fulfilled" && this.obsMics.get(actionContext.id) === obs) this.obsMics.delete(actionContext.id);
				for (const result of results) if (result.status === "rejected") throw result.reason;
				return;
			}
			if (!this.isCurrentMomentarySequence(actionContext.id, sequence)) return;
			const previousObs = this.obsMics.get(actionContext.id);
			if (previousObs) await previousObs.release();
			if (!this.isCurrentMomentarySequence(actionContext.id, sequence)) return;
			// Reading global settings through the SDK also emits a settings event,
			// which can restart the API connection in the middle of this press.
			const obs = new ObsClient(getObsConnectionSettings());
			this.obsMics.set(actionContext.id, obs);
			obs.onDisconnect = () => {
				if (this.obsMics.get(actionContext.id) === obs && this.momentaryPressed.has(actionContext.id)) {
					void this.sendMomentary(actionContext, settings, "up");
				}
			};
			try {
				await obs.connect();
				if (!this.isCurrentMomentarySequence(actionContext.id, sequence)) return;
				await obs.unmute(settings.obsInput || "");
				if (!this.isCurrentMomentarySequence(actionContext.id, sequence)) return;
				await vdoClient.sendCommand(payload, { awaitCallback: false });
			} catch (error) {
				const cleanup = await Promise.allSettled([
					obs.release(),
					vdoClient.sendCommand(buildLocalMomentaryPayload(settings, "up"), { awaitCallback: false })
				]);
				if (cleanup[0].status === "fulfilled" && this.obsMics.get(actionContext.id) === obs) this.obsMics.delete(actionContext.id);
				throw error;
			}
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
		if (settings.obsSync && pressed && this.momentaryRequests.has(actionContext.id)) {
			await actionContext.setState(0);
			await actionContext.setTitle(`${label}\nWait`);
			return;
		}
		if (settings.behavior === "pushToMute") {
			await actionContext.setState(pressed ? 0 : 1);
			await actionContext.setTitle(pressed ? `${label}\nMuted` : settings.title ? `${label}\nHold Mute` : "Hold\nMute");
			return;
		}
		await actionContext.setState(pressed ? 1 : 0);
		await actionContext.setTitle(pressed ? `${label}\nLive` : settings.title ? `${label}\nHold Talk` : "Hold\nTalk");
	}

	private async checkCaptionConnection(held: { settings: LocalControlSettings; action: KeyAction<LocalControlSettings> }): Promise<void> {
		if (this.checkingCaptionConnection.has(held)) return;
		this.checkingCaptionConnection.add(held);
		try {
			await vdoClient.sendCommand({ action: "getDetails" });
		} catch {
			// A late check must not cancel a newer press on this key.
			if (this.momentarySettings.get(held.action.id) === held) {
				await this.sendMomentary(held.action, held.settings, "up");
			}
		} finally {
			this.checkingCaptionConnection.delete(held);
		}
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

	private arm(actionId: string, settings: LocalControlSettings): void {
		this.armedUntil.set(actionId, Date.now() + 2000);
		this.armedSettings.set(actionId, JSON.stringify(settings));
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
