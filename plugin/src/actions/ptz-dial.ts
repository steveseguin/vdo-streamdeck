import {
	action,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	SingletonAction,
	type TouchTapEvent,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";
import { buildPtzDialPayloads, buildPtzDialPushPayloads } from "../api/command-registry.js";
import { normalizePtzDialSettings } from "../api/settings.js";
import type { PtzDialSettings } from "../api/types.js";
import { selectedTargetStore, sessionStore, vdoClient } from "../services.js";
import { renderGuestTitle, resolveGuestTargetChoice, resolveGuestTargetValue } from "./guest-targeting.js";

type PendingDial = {
	action: DialAction<PtzDialSettings>;
	ticks: number;
	lastSentAt: number;
	timer?: NodeJS.Timeout;
	sending?: boolean;
};

@action({ UUID: "ninja.vdo.streamdeck.ptz-dial" })
export class PtzDialAction extends SingletonAction<PtzDialSettings> {
	private readonly pending = new Map<string, PendingDial>();

	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
		selectedTargetStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<PtzDialSettings>): Promise<void> {
		if (ev.action.isDial()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<PtzDialSettings>): void {
		this.clearPending(ev.action.id);
	}

	override async onDialRotate(ev: DialRotateEvent<PtzDialSettings>): Promise<void> {
		const settings = normalizePtzDialSettings(ev.payload.settings);
		if (!Number.isFinite(ev.payload.ticks) || ev.payload.ticks === 0) {
			return;
		}

		const pending = this.ensurePending(ev.action);
		pending.ticks += ev.payload.ticks;
		await this.render(ev.action, settings, tickStatus(pending.ticks, settings));
		this.scheduleFlush(ev.action.id, settings.intervalMs || 80);
	}

	override async onDialDown(ev: DialDownEvent<PtzDialSettings>): Promise<void> {
		await this.handlePush(ev.action, ev.payload.settings);
	}

	override async onTouchTap(ev: TouchTapEvent<PtzDialSettings>): Promise<void> {
		await this.handlePush(ev.action, ev.payload.settings);
	}

	private ensurePending(actionContext: DialAction<PtzDialSettings>): PendingDial {
		const existing = this.pending.get(actionContext.id);
		if (existing) {
			existing.action = actionContext;
			return existing;
		}
		const pending: PendingDial = {
			action: actionContext,
			ticks: 0,
			lastSentAt: 0
		};
		this.pending.set(actionContext.id, pending);
		return pending;
	}

	private scheduleFlush(actionId: string, intervalMs: number): void {
		const pending = this.pending.get(actionId);
		if (!pending || pending.timer || pending.sending) {
			return;
		}
		const delay = Math.max(0, intervalMs - (Date.now() - pending.lastSentAt));
		pending.timer = setTimeout(() => {
			pending.timer = undefined;
			void this.flush(actionId);
		}, delay);
	}

	private async flush(actionId: string): Promise<void> {
		const pending = this.pending.get(actionId);
		if (!pending || pending.sending) {
			return;
		}
		const ticks = pending.ticks;
		if (!ticks) {
			return;
		}
		pending.ticks = 0;
		pending.sending = true;
		pending.lastSentAt = Date.now();

		const actionContext = pending.action;
		const settings = normalizePtzDialSettings(await actionContext.getSettings<PtzDialSettings>());
		const target = settings.scope === "guest" ? resolveGuestTargetValue(settings) : undefined;

		if (settings.scope === "guest" && (typeof target === "undefined" || target === "")) {
			await actionContext.showAlert();
			await this.render(actionContext, settings, "No target");
			pending.sending = false;
			if (pending.ticks) {
				this.scheduleFlush(actionId, settings.intervalMs || 80);
			}
			return;
		}

		try {
			const payloads = buildPtzDialPayloads(settings, ticks, target);
			for (const payload of payloads) {
				await vdoClient.sendCommand(payload, { awaitCallback: false });
			}
			await this.render(actionContext, settings, tickStatus(ticks, settings));
		} catch {
			await actionContext.showAlert();
			await this.render(actionContext, settings, "Blocked");
		} finally {
			pending.sending = false;
			if (pending.ticks) {
				this.scheduleFlush(actionId, settings.intervalMs || 80);
			}
		}
	}

	private async handlePush(actionContext: DialAction<PtzDialSettings>, rawSettings?: PtzDialSettings): Promise<void> {
		const settings = normalizePtzDialSettings(rawSettings || (await actionContext.getSettings<PtzDialSettings>()));
		if (settings.pushAction === "cycleControl") {
			const nextSettings = {
				...settings,
				control: nextControl(settings)
			};
			await actionContext.setSettings(nextSettings);
			await this.render(actionContext, nextSettings, "Changed");
			return;
		}

		const target = settings.scope === "guest" ? resolveGuestTargetValue(settings) : undefined;
		if (settings.scope === "guest" && (typeof target === "undefined" || target === "")) {
			await actionContext.showAlert();
			await this.render(actionContext, settings, "No target");
			return;
		}

		try {
			const payloads = buildPtzDialPushPayloads(settings, target);
			for (const payload of payloads) {
				await vdoClient.sendCommand(payload);
			}
			await this.render(actionContext, settings, pushStatus(settings));
		} catch {
			await actionContext.showAlert();
			await this.render(actionContext, settings, "Blocked");
		}
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isDial()) {
				const settings = await visible.getSettings<PtzDialSettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: DialAction<PtzDialSettings>, rawSettings?: PtzDialSettings, status?: string): Promise<void> {
		const settings = normalizePtzDialSettings(rawSettings || (await actionContext.getSettings<PtzDialSettings>()));
		const control = controlLabel(settings.control || "zoom");
		const label = status ? `${control}\n${status}` : control;

		if (settings.scope === "guest") {
			const choice = resolveGuestTargetChoice(settings);
			const title = renderGuestTitle(settings.title, label, choice, {
				control,
				step: settings.step || "0.05",
				status
			});
			await this.setDialTitle(actionContext, title);
			await actionContext.setTriggerDescription({
				rotate: `Adjust guest ${control.toLowerCase()}`,
				push: pushDescription(settings),
				touch: pushDescription(settings)
			});
			return;
		}

		const title = settings.title || `Local\n${label}`;
		await this.setDialTitle(actionContext, title);
		await actionContext.setTriggerDescription({
			rotate: `Adjust local ${control.toLowerCase()}`,
			push: pushDescription(settings),
			touch: pushDescription(settings)
		});
	}

	private async setDialTitle(actionContext: DialAction<PtzDialSettings>, title: string): Promise<void> {
		await actionContext.setTitle(title);
		try {
			await actionContext.setFeedback({ title });
		} catch {
			// Older Stream Deck app builds may ignore feedback updates for built-in layouts.
		}
	}

	private clearPending(actionId: string): void {
		const pending = this.pending.get(actionId);
		if (pending?.timer) {
			clearTimeout(pending.timer);
		}
		this.pending.delete(actionId);
	}
}

function nextControl(settings: PtzDialSettings): PtzDialSettings["control"] {
	const localControls: NonNullable<PtzDialSettings["control"]>[] = ["zoom", "pan", "tilt", "focus", "exposure"];
	const guestControls: NonNullable<PtzDialSettings["control"]>[] = ["zoom", "pan", "tilt", "focus"];
	const controls = settings.scope === "guest" ? guestControls : localControls;
	const index = controls.indexOf(settings.control || "zoom");
	return controls[(index + 1) % controls.length];
}

function controlLabel(control: PtzDialSettings["control"]): string {
	if (control === "pan") {
		return "Pan";
	}
	if (control === "tilt") {
		return "Tilt";
	}
	if (control === "focus") {
		return "Focus";
	}
	if (control === "exposure") {
		return "Exposure";
	}
	return "Zoom";
}

function tickStatus(ticks: number, settings: PtzDialSettings): string {
	const direction = (ticks < 0 ? -1 : 1) * (settings.invert ? -1 : 1);
	return direction < 0 ? "Down" : "Up";
}

function pushStatus(settings: PtzDialSettings): string {
	if (settings.pushAction === "autofocusOn") {
		return "AF On";
	}
	if (settings.pushAction === "autofocusOff") {
		return "AF Off";
	}
	return "Ready";
}

function pushDescription(settings: PtzDialSettings): string {
	if (settings.pushAction === "cycleControl") {
		return "Cycle PTZ control";
	}
	if (settings.pushAction === "autofocusOn") {
		return "Enable guest autofocus";
	}
	if (settings.pushAction === "autofocusOff") {
		return "Disable guest autofocus";
	}
	return "No push action";
}
