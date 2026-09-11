import { action, type KeyAction, SingletonAction, type DidReceiveSettingsEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { normalizeGuestsListSettings } from "../api/settings.js";
import type { GuestsListSettings, StreamChoice } from "../api/types.js";
import { sessionStore } from "../services.js";

const KEY_SIZE = 144;
const VISIBLE_HEIGHT = 132;
const MAX_FONT = 24;
const MIN_FONT = 9;
const LINE_HEIGHT_FACTOR = 1.2;
const ROTATE_INTERVAL_MS = 3000;
const ROTATE_WINDOW_ROWS = Math.floor(VISIBLE_HEIGHT / (MIN_FONT * LINE_HEIGHT_FACTOR));
// Matches the neutral key field in scripts/icon-set.mjs (colors.slateField).
const KEY_BACKGROUND = "#1e2532";

@action({ UUID: "ninja.vdo.streamdeck.guests-list" })
export class GuestsListAction extends SingletonAction<GuestsListSettings> {
	private readonly rotateTimers = new Map<string, NodeJS.Timeout>();
	private readonly lastLines = new Map<string, string>();

	constructor() {
		super();
		sessionStore.subscribe(() => {
			void this.refreshVisible();
		});
	}

	override async onWillAppear(ev: WillAppearEvent<GuestsListSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<GuestsListSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.render(ev.action, ev.payload.settings);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<GuestsListSettings>): void {
		const timer = this.rotateTimers.get(ev.action.id);
		if (timer) {
			clearInterval(timer);
			this.rotateTimers.delete(ev.action.id);
		}
		this.lastLines.delete(ev.action.id);
	}

	private async refreshVisible(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isKey()) {
				const settings = await visible.getSettings<GuestsListSettings>();
				await this.render(visible, settings);
			}
		}
	}

	private async render(actionContext: KeyAction<GuestsListSettings>, rawSettings?: GuestsListSettings): Promise<void> {
		const settings = normalizeGuestsListSettings(rawSettings || (await actionContext.getSettings<GuestsListSettings>()));
		const lines = buildGuestsListLines(settings, sessionStore.getStreamChoices({ includeLocal: false }));
		const id = actionContext.id;
		const linesKey = lines.join("\n");
		// State polls fire every few seconds; skip redraws when nothing changed.
		if (this.lastLines.get(id) === linesKey) {
			return;
		}
		this.lastLines.set(id, linesKey);
		this.stopRotation(id);

		const font = fitGuestsListFont(lines.length);
		if (font) {
			await actionContext.setImage(renderGuestsListImage(lines, font));
			return;
		}

		// ponytail: fixed-window page rotation; switch to smooth pixel scroll if it ever feels too coarse.
		let windowIndex = 0;
		const drawWindow = () => {
			const windowLines = lines.slice(windowIndex * ROTATE_WINDOW_ROWS, (windowIndex + 1) * ROTATE_WINDOW_ROWS);
			void actionContext.setImage(renderGuestsListImage(windowLines, MIN_FONT));
			windowIndex = (windowIndex + 1) * ROTATE_WINDOW_ROWS < lines.length ? windowIndex + 1 : 0;
		};
		drawWindow();
		this.rotateTimers.set(id, setInterval(drawWindow, ROTATE_INTERVAL_MS));
	}

	private stopRotation(id: string): void {
		const timer = this.rotateTimers.get(id);
		if (timer) {
			clearInterval(timer);
			this.rotateTimers.delete(id);
		}
	}
}

export function buildGuestsListLines(settings: GuestsListSettings, choices: StreamChoice[]): string[] {
	const guests = choices.filter(choice => typeof choice.position === "number" && !choice.director);
	if (settings.scope !== "scene") {
		const rows = guests.map(choice => applyGuestsListTemplate(settings.rowTitle || "{slot} {label}", choice));
		return rows.length ? rows : ["No guests"];
	}
	const scene = settings.scene || "1";
	const inScene = guests.filter(choice => isSceneMember(choice, scene));
	const header = applyTemplateTokens(settings.headerTitle || "Scene {scene}", {
		scene,
		count: String(inScene.length)
	});
	return [header, ...inScene.map(choice => applyGuestsListTemplate(settings.rowTitle || "{slot} {label}", choice))];
}

export function fitGuestsListFont(lineCount: number): number | undefined {
	if (lineCount <= 0) {
		return MAX_FONT;
	}
	const font = Math.min(MAX_FONT, Math.floor(VISIBLE_HEIGHT / (lineCount * LINE_HEIGHT_FACTOR)));
	return font >= MIN_FONT ? font : undefined;
}

export function renderGuestsListImage(lines: string[], fontPx: number): string {
	// Stream Deck ignores bare SVG strings; a base64 data URI is the documented form.
	return `data:image/svg+xml;base64,${Buffer.from(renderGuestsListSvg(lines, fontPx), "utf8").toString("base64")}`;
}

export function renderGuestsListSvg(lines: string[], fontPx: number): string {
	const lineHeight = Math.round(fontPx * LINE_HEIGHT_FACTOR);
	const startY = Math.round((KEY_SIZE - lineHeight * lines.length) / 2 + fontPx);
	const maxChars = Math.max(4, Math.floor((KEY_SIZE - 8) / (fontPx * 0.6)));
	const text = lines
		.map(
			(line, index) =>
				`<text x="72" y="${startY + index * lineHeight}" font-family="sans-serif" font-size="${fontPx}" fill="#ffffff" text-anchor="middle">${escapeXml(truncateLine(line, maxChars))}</text>`
		)
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}"><rect width="${KEY_SIZE}" height="${KEY_SIZE}" fill="${KEY_BACKGROUND}"/>${text}</svg>`;
}

function applyGuestsListTemplate(template: string, choice: StreamChoice): string {
	return applyTemplateTokens(template, {
		slot: typeof choice.position === "number" ? String(choice.position) : "",
		label: choice.label,
		streamID: choice.streamID
	});
}

function applyTemplateTokens(template: string, values: Record<string, string>): string {
	return Object.entries(values).reduce((title, [key, value]) => title.replaceAll(`{${key}}`, value), template);
}

function isSceneMember(choice: StreamChoice, scene: string): boolean {
	const value = choice.scenes?.[scene];
	return value === true || value === "true" || value === 1 || value === "1";
}

function truncateLine(line: string, maxChars: number): string {
	return line.length > maxChars ? `${line.slice(0, Math.max(1, maxChars - 1))}…` : line;
}

function escapeXml(value: string): string {
	return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] || char);
}
