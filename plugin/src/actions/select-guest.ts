import { action, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { normalizeSelectGuestSettings } from "../api/settings.js";
import type { SelectGuestSettings, StreamChoice } from "../api/types.js";
import { selectedTargetStore, sessionStore } from "../services.js";
import { resolveGuestTargetChoice } from "./guest-targeting.js";

@action({ UUID: "ninja.vdo.streamdeck.select-guest" })
export class SelectGuestAction extends SingletonAction<SelectGuestSettings> {
	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
		selectedTargetStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<SelectGuestSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<SelectGuestSettings>): Promise<void> {
		const settings = normalizeSelectGuestSettings(ev.payload.settings);
		const next = resolveNextSelection(settings);
		if (settings.mode !== "clear" && !next) {
			await ev.action.showAlert();
			await this.render(ev.action, settings);
			return;
		}

		selectedTargetStore.setSelectedStreamID(next);
		await ev.action.showOk();
		await this.render(ev.action, settings);
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isKey()) {
				const settings = await visible.getSettings<SelectGuestSettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: KeyAction<SelectGuestSettings>, rawSettings?: SelectGuestSettings): Promise<void> {
		const settings = normalizeSelectGuestSettings(rawSettings || (await actionContext.getSettings<SelectGuestSettings>()));
		const selectedID = selectedTargetStore.getSelectedStreamID();
		const selected = selectedID ? choiceForStreamID(selectedID) : undefined;
		const fixed = settings.mode === "fixed" ? resolveGuestTargetChoice(settings) : undefined;
		const titleChoice = settings.mode === "fixed" ? fixed : selected;
		const active = resolveActive(settings, selectedID, fixed, selected);
		const title = renderSelectTitle(settings, titleChoice, selectedID, active);

		await actionContext.setState(active ? 1 : 0);
		await actionContext.setTitle(title);
	}
}

function resolveNextSelection(settings: SelectGuestSettings): string | null | undefined {
	const choices = sessionStore.getStreamChoices({ includeLocal: false });
	if (settings.mode === "clear") {
		return null;
	}
	if (settings.mode === "firstHeld") {
		return choices.find(choice => choice.held)?.streamID;
	}
	if (settings.mode === "next" || settings.mode === "previous") {
		return cycleSelection(choices, settings.mode);
	}

	const choice = resolveGuestTargetChoice(settings);
	return choice?.streamID;
}

function cycleSelection(choices: StreamChoice[], direction: "next" | "previous"): string | undefined {
	if (!choices.length) {
		return undefined;
	}
	const selectedID = selectedTargetStore.getSelectedStreamID();
	const currentIndex = selectedID ? choices.findIndex(choice => choice.streamID === selectedID) : -1;
	if (direction === "previous") {
		const previousIndex = currentIndex <= 0 ? choices.length - 1 : currentIndex - 1;
		return choices[previousIndex]?.streamID;
	}
	const nextIndex = currentIndex < 0 || currentIndex >= choices.length - 1 ? 0 : currentIndex + 1;
	return choices[nextIndex]?.streamID;
}

function resolveActive(
	settings: SelectGuestSettings,
	selectedID: string | null,
	fixed: StreamChoice | undefined,
	selected: StreamChoice | undefined
): boolean {
	if (settings.mode === "clear") {
		return !selectedID;
	}
	if (settings.mode === "fixed") {
		return !!selectedID && !!fixed && selectedID === fixed.streamID;
	}
	return !!selected && selected.label !== "Missing target";
}

function choiceForStreamID(streamID: string): StreamChoice {
	return sessionStore.getStreamChoices({ includeLocal: false }).find(choice => choice.streamID === streamID) || {
		streamID,
		label: "Missing target"
	};
}

function renderSelectTitle(
	settings: SelectGuestSettings,
	choice: StreamChoice | undefined,
	selectedID: string | null,
	active: boolean
): string {
	const defaultTitle = defaultSelectTitle(settings, choice, selectedID);
	if (!settings.title) {
		return defaultTitle;
	}
	const slot = typeof choice?.position === "number" ? String(choice.position) : "";
	const replacements: Record<string, string> = {
		label: choice?.label || "",
		streamID: choice?.streamID || selectedID || "",
		slot,
		mode: settings.mode || "fixed",
		state: active ? "Selected" : "Off"
	};

	return Object.entries(replacements).reduce((title, [key, value]) => title.replaceAll(`{${key}}`, value), settings.title || "");
}

function defaultSelectTitle(settings: SelectGuestSettings, choice: StreamChoice | undefined, selectedID: string | null): string {
	if (settings.mode === "clear") {
		return selectedID ? "Clear\nTarget" : "No\nTarget";
	}
	if (choice) {
		const prefix = settings.mode === "fixed" ? "Select" : "Target";
		if (typeof choice.position === "number") {
			return `${prefix}\nG${choice.position}`;
		}
		return `${prefix}\n${shortLabel(choice.label || choice.streamID)}`;
	}
	if (selectedID) {
		return `Target\n${shortLabel(selectedID)}`;
	}
	if (settings.mode === "next") {
		return "Next\nTarget";
	}
	if (settings.mode === "previous") {
		return "Prev\nTarget";
	}
	if (settings.mode === "firstHeld") {
		return "Held\nTarget";
	}
	return "Select\nTarget";
}

function shortLabel(value: string): string {
	return value.length > 12 ? `${value.slice(0, 11)}...` : value;
}
