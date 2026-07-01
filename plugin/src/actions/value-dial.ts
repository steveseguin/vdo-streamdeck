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
import { buildValueDialPayload, clampValueDialNumber, nextValueDialValue } from "../api/command-registry.js";
import { normalizeValueDialSettings } from "../api/settings.js";
import type { ValueDialSettings } from "../api/types.js";
import { selectedTargetStore, sessionStore, vdoClient } from "../services.js";
import { renderGuestTitle, resolveGuestTargetChoice, resolveGuestTargetValue } from "./guest-targeting.js";

type PendingValue = {
	action: DialAction<ValueDialSettings>;
	value: number;
	lastSentAt: number;
	timer?: NodeJS.Timeout;
	sending?: boolean;
};

@action({ UUID: "ninja.vdo.streamdeck.value-dial" })
export class ValueDialAction extends SingletonAction<ValueDialSettings> {
	private readonly pending = new Map<string, PendingValue>();

	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
		selectedTargetStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<ValueDialSettings>): Promise<void> {
		if (ev.action.isDial()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<ValueDialSettings>): void {
		this.clearPending(ev.action.id);
	}

	override async onDialRotate(ev: DialRotateEvent<ValueDialSettings>): Promise<void> {
		const settings = normalizeValueDialSettings(ev.payload.settings);
		if (!Number.isFinite(ev.payload.ticks) || ev.payload.ticks === 0) {
			return;
		}

		const currentValue = this.resolveCurrentValue(ev.action.id, settings);
		const nextValue = nextValueDialValue(settings, currentValue, ev.payload.ticks);
		const pending = this.ensurePending(ev.action, nextValue);
		pending.value = nextValue;

		await this.render(ev.action, settings, nextValue);
		this.scheduleFlush(ev.action.id, settings.intervalMs || 100);
	}

	override async onDialDown(ev: DialDownEvent<ValueDialSettings>): Promise<void> {
		await this.handlePush(ev.action, ev.payload.settings);
	}

	override async onTouchTap(ev: TouchTapEvent<ValueDialSettings>): Promise<void> {
		await this.handlePush(ev.action, ev.payload.settings);
	}

	private ensurePending(actionContext: DialAction<ValueDialSettings>, value: number): PendingValue {
		const existing = this.pending.get(actionContext.id);
		if (existing) {
			existing.action = actionContext;
			return existing;
		}
		const pending: PendingValue = {
			action: actionContext,
			value,
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
		pending.sending = true;
		pending.lastSentAt = Date.now();

		const actionContext = pending.action;
		const settings = normalizeValueDialSettings(await actionContext.getSettings<ValueDialSettings>());
		const value = clampValueDialNumber(pending.value, settings);

		try {
			await this.sendValue(actionContext, settings, value);
		} finally {
			pending.sending = false;
			if (this.pending.get(actionId) === pending && pending.value === value) {
				this.pending.delete(actionId);
			} else if (this.pending.get(actionId) === pending) {
				this.scheduleFlush(actionId, settings.intervalMs || 100);
			}
		}
	}

	private async handlePush(actionContext: DialAction<ValueDialSettings>, rawSettings?: ValueDialSettings): Promise<void> {
		const settings = normalizeValueDialSettings(rawSettings || (await actionContext.getSettings<ValueDialSettings>()));
		if (settings.pushAction === "cycleControl") {
			const control = nextControl(settings);
			const nextSettings = normalizeValueDialSettings({
				...settings,
				control,
				value: defaultValue(control),
				min: defaultMin(control),
				max: defaultMax(control),
				step: defaultStep(control),
				resetValue: defaultResetValue(control)
			});
			await actionContext.setSettings(nextSettings);
			await this.render(actionContext, nextSettings);
			return;
		}

		if (settings.pushAction === "none") {
			await this.render(actionContext, settings);
			return;
		}

		const resetValue = clampValueDialNumber(finiteNumber(settings.resetValue, finiteNumber(defaultResetValue(settings.control || "volume"), 0)), settings);
		await this.sendValue(actionContext, settings, resetValue);
	}

	private async sendValue(actionContext: DialAction<ValueDialSettings>, settings: ValueDialSettings, value: number): Promise<void> {
		const target = settings.scope === "guest" ? resolveGuestTargetValue(settings) : undefined;
		if (settings.scope === "guest" && (typeof target === "undefined" || target === "")) {
			await actionContext.showAlert();
			await this.render(actionContext, settings);
			return;
		}

		try {
			const payload = buildValueDialPayload(settings, value, target);
			await vdoClient.sendCommand(payload, { awaitCallback: false });
			const persisted = {
				...settings,
				value: String(value)
			};
			await actionContext.setSettings(persisted);
			await this.render(actionContext, persisted, value);
		} catch {
			await actionContext.showAlert();
			await this.render(actionContext, settings);
		}
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isDial()) {
				const settings = await visible.getSettings<ValueDialSettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: DialAction<ValueDialSettings>, rawSettings?: ValueDialSettings, currentValue?: number): Promise<void> {
		const settings = normalizeValueDialSettings(rawSettings || (await actionContext.getSettings<ValueDialSettings>()));
		const value = typeof currentValue === "number" ? currentValue : this.resolveCurrentValue(actionContext.id, settings);
		const control = controlLabel(settings.control || "volume");
		const valueText = valueLabel(value, settings);
		const defaultLabel = `${control}\n${valueText}`;

		if (settings.scope === "guest") {
			const choice = resolveGuestTargetChoice(settings);
			const title = renderGuestTitle(settings.title, defaultLabel, choice, {
				control,
				value: String(value),
				unit: unitLabel(settings.control || "volume"),
				status: valueText
			});
			await this.setDialTitle(actionContext, title);
			await actionContext.setTriggerDescription({
				rotate: `Adjust guest ${control.toLowerCase()}`,
				push: pushDescription(settings),
				touch: pushDescription(settings)
			});
			return;
		}

		await this.setDialTitle(actionContext, settings.title || `Local\n${defaultLabel}`);
		await actionContext.setTriggerDescription({
			rotate: `Adjust local ${control.toLowerCase()}`,
			push: pushDescription(settings),
			touch: pushDescription(settings)
		});
	}

	private resolveCurrentValue(actionId: string, settings: ValueDialSettings): number {
		const pending = this.pending.get(actionId);
		if (pending) {
			return clampValueDialNumber(pending.value, settings);
		}

		const observed = observedValue(settings);
		if (typeof observed === "number") {
			return clampValueDialNumber(observed, settings);
		}
		return clampValueDialNumber(finiteNumber(settings.value, finiteNumber(defaultValue(settings.control || "volume"), 0)), settings);
	}

	private async setDialTitle(actionContext: DialAction<ValueDialSettings>, title: string): Promise<void> {
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

function observedValue(settings: ValueDialSettings): number | undefined {
	if (settings.scope === "guest" && (settings.control || "volume") === "volume") {
		const choice = resolveGuestTargetChoice(settings);
		const stream = choice ? sessionStore.getStream(choice.streamID) : undefined;
		if (typeof stream?.videoVolume === "number") {
			return stream.videoVolume * 100;
		}
	}
	return undefined;
}

function nextControl(settings: ValueDialSettings): ValueDialSettings["control"] {
	const controls: NonNullable<ValueDialSettings["control"]>[] =
		settings.scope === "guest" ? ["volume"] : ["volume", "panning", "bitrate", "bufferDelay"];
	const index = controls.indexOf(settings.control || "volume");
	return controls[(index + 1) % controls.length];
}

function controlLabel(control: ValueDialSettings["control"]): string {
	if (control === "panning") {
		return "Pan";
	}
	if (control === "bitrate") {
		return "Bitrate";
	}
	if (control === "bufferDelay") {
		return "Buffer";
	}
	return "Volume";
}

function valueLabel(value: number, settings: ValueDialSettings): string {
	const control = settings.control || "volume";
	if (control === "bitrate" && value === -1) {
		return "Auto";
	}
	const unit = unitLabel(control);
	return unit ? `${value}${unit}` : String(value);
}

function unitLabel(control: ValueDialSettings["control"]): string {
	if (control === "volume") {
		return "%";
	}
	if (control === "bitrate") {
		return "kbps";
	}
	if (control === "bufferDelay") {
		return "ms";
	}
	return "";
}

function pushDescription(settings: ValueDialSettings): string {
	if (settings.pushAction === "cycleControl") {
		return "Cycle value control";
	}
	if (settings.pushAction === "none") {
		return "No push action";
	}
	if ((settings.control || "volume") === "bitrate" && (settings.resetValue || defaultResetValue(settings.control || "volume")) === "-1") {
		return "Reset to Auto";
	}
	return `Reset to ${settings.resetValue || defaultResetValue(settings.control || "volume")}${unitLabel(settings.control || "volume")}`;
}

function defaultValue(control: ValueDialSettings["control"]): string {
	if (control === "panning") {
		return "90";
	}
	if (control === "bitrate") {
		return "2500";
	}
	if (control === "bufferDelay") {
		return "0";
	}
	return "100";
}

function defaultMin(control: ValueDialSettings["control"]): string {
	if (control === "panning" || control === "bufferDelay" || control === "bitrate") {
		return "0";
	}
	return "0";
}

function defaultMax(control: ValueDialSettings["control"]): string {
	if (control === "panning") {
		return "180";
	}
	if (control === "bitrate") {
		return "6000";
	}
	if (control === "bufferDelay") {
		return "5000";
	}
	return "200";
}

function defaultStep(control: ValueDialSettings["control"]): string {
	if (control === "panning" || control === "volume") {
		return "5";
	}
	if (control === "bitrate") {
		return "250";
	}
	return "100";
}

function defaultResetValue(control: ValueDialSettings["control"]): string {
	if (control === "panning") {
		return "90";
	}
	if (control === "bitrate") {
		return "-1";
	}
	if (control === "bufferDelay") {
		return "0";
	}
	return "100";
}

function finiteNumber(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
	return Number.isFinite(parsed) ? parsed : fallback;
}
