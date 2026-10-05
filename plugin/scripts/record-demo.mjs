// Records the README demo: the built plugin drives a live VDO.Ninja director
// room while a virtual Stream Deck draws exactly what the plugin sends
// (images, titles, states). Guests use synthetic media and the API key is
// fresh, so nothing private appears in the video.
//
//   npm run build
//   FFMPEG=/path/to/ffmpeg node scripts/record-demo.mjs
//
// Writes docs/assets/demo.mp4 and demo.gif (FFMPEG required), or demo.webm without it.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "../docs/assets");
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(root, "../../tests/playwright/node_modules/@playwright/test"));
const base = process.env.VDO_BASE || "https://vdo.ninja/";
const apiKey = randomUUID().replaceAll("-", "");
const room = "deckdemo" + randomUUID().slice(0, 6);
const workDir = await mkdtemp(join(tmpdir(), "vdo-streamdeck-demo-"));
const pluginRoot = join(workDir, "ninja.vdo.streamdeck.sdPlugin");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Deck layout, left to right and top to bottom: [context, action, settings].
const keys = [
	["connection", "connection", {}],
	["list", "guests-list", {}],
	["select-bob", "select-guest", { mode: "fixed", targetMode: "slot", target: "2" }],
	["mic-1", "guest-command", { command: "mic", targetMode: "slot", target: "1", behavior: "toggle" }],
	["cam-2", "guest-command", { command: "camera", targetMode: "slot", target: "2", behavior: "toggle" }],
	["scene-1", "guest-scene", { targetMode: "slot", target: "1", scene: "1", mode: "toggle" }],
	["selected-mic", "guest-command", { command: "mic", targetMode: "selected", behavior: "toggle" }],
	["layout", "mixer-control", { command: "layout", layout: "0" }],
	["hangup-2", "guest-command", { command: "hangup", targetMode: "slot", target: "2", dangerousConfirm: true }]
];
const settingsByContext = new Map(keys.map(([context, , settings]) => [context, settings]));
const actionByContext = new Map(keys.map(([context, action]) => [context, action]));
const imageCache = new Map();
let browser, child, server, socket, stage;

// The deck is injected into the director page itself; an iframed director
// did not receive guests in headless Chrome.
const DECK_WIDTH = 430;
const deckCss = `
	#deck { position: fixed; left: 0; top: 0; bottom: 0; width: ${DECK_WIDTH}px; z-index: 2147483647; padding: 26px 24px; box-sizing: border-box; display: flex; flex-direction: column; background: #0b0d12; border-right: 1px solid #2c313c; font-family: "Segoe UI", system-ui, sans-serif; color: #e8edf5; }
	h1 { font-size: 17px; margin: 0 0 4px; font-weight: 650; }
	.sub { font-size: 12px; color: #93a0b4; margin-bottom: 18px; }
	#grid { display: grid; grid-template-columns: repeat(3, 108px); gap: 12px; padding: 16px; background: #1a1d24; border: 1px solid #2c313c; border-radius: 18px; align-self: flex-start; }
	.key { position: relative; width: 108px; height: 108px; border-radius: 14px; overflow: hidden; background: #111318; transition: transform 90ms ease; }
	.key img { position: absolute; inset: 0; width: 100%; height: 100%; }
	.key .title { position: absolute; left: 4px; right: 4px; bottom: 7px; text-align: center; font-size: 13px; font-weight: 600; line-height: 1.15; white-space: pre-line; text-shadow: 0 1px 3px #000, 0 0 2px #000; }
	.key.pressed { transform: scale(0.9); }
	.key.pressed::after { content: ""; position: absolute; inset: 0; border-radius: 14px; box-shadow: inset 0 0 0 3px #ffffffcc; }
	#caption { margin-top: 22px; min-height: 64px; font-size: 18px; line-height: 1.35; font-weight: 600; }
	#note { margin-top: auto; font-size: 11px; color: #6f7b8f; }
`;
const keyHtml = keys.map(([context]) => '<div class="key" data-key="' + context + '"><img alt=""><div class="title"></div></div>').join("");
const deckHtml = '<div id="deck"><h1>VDO.Ninja for Stream Deck</h1><div class="sub">Live director room · two guests</div><div id="grid">' + keyHtml +
	'</div><div id="caption"></div><div id="note">Keys are drawn from the plugin\'s own output. Guests use synthetic camera and mic.</div></div>';

async function injectDeck() {
	await stage.evaluate(([css, html, width]) => {
		const host = document.createElement("div");
		document.documentElement.appendChild(host);
		const shadow = host.attachShadow({ mode: "open" });
		shadow.innerHTML = "<style>" + css + "</style>" + html;
		window.__deck = shadow;
		// The director page renders in the remaining width.
		const style = document.createElement("style");
		style.textContent = "body { margin-left: " + width + "px !important; width: calc(100vw - " + width + "px) !important; }";
		document.head.appendChild(style);
	}, [deckCss, deckHtml, DECK_WIDTH]);
}

async function imageUrl(path) {
	if (path.startsWith("data:")) return path;
	if (!imageCache.has(path)) {
		const file = /\.(png|svg)$/.test(path) ? path : path + ".png";
		const data = await readFile(join(pluginRoot, file));
		imageCache.set(path, "data:image/" + (file.endsWith(".svg") ? "svg+xml" : "png") + ";base64," + data.toString("base64"));
	}
	return imageCache.get(path);
}

function sendHost(message) { socket.send(JSON.stringify(message)); }
function hostEvent(type, context, extra = {}) {
	sendHost({ event: type, action: "ninja.vdo.streamdeck." + actionByContext.get(context), context, device: "demo-device",
		payload: { controller: "Keypad", coordinates: { column: 0, row: 0 }, settings: settingsByContext.get(context), isInMultiAction: false, state: 0, ...extra } });
}
async function caption(text, hold = 0) {
	await stage.evaluate(value => { window.__deck.getElementById("caption").textContent = value; }, text);
	if (hold) await delay(hold);
}
async function press(context, hold = 1600) {
	const toggle = on => stage.evaluate(([id, value]) => window.__deck.querySelector('[data-key="' + id + '"]').classList.toggle("pressed", value), [context, on]);
	await toggle(true);
	hostEvent("keyDown", context);
	await delay(160);
	await toggle(false);
	hostEvent("keyUp", context);
	await delay(hold);
}
const guests = () => stage.evaluate(() => Object.values(getDetailedState()).filter(item => item.position && !item.director));
let untilCount = 0;
async function until(predicate, timeout = 20000) {
	const step = ++untilCount;
	const deadline = Date.now() + timeout;
	while (!(await predicate())) {
		if (Date.now() > deadline) throw new Error("Demo step " + step + " timed out");
		await delay(150);
	}
}

// Mirrors Stream Deck: each key keeps one image per state and shows the current state.
const keyState = new Map(keys.map(([context, action]) => {
	const states = manifest.Actions.find(item => item.UUID === "ninja.vdo.streamdeck." + action).States;
	return [context, { images: states.map(state => state.Image), state: 0, title: "" }];
}));
async function drawKey(context) {
	const key = keyState.get(context);
	const image = await imageUrl(key.images[key.state] || key.images[0]);
	await stage.evaluate(([id, src, title]) => {
		const element = window.__deck.querySelector('[data-key="' + id + '"]');
		element.querySelector("img").src = src;
		element.querySelector(".title").textContent = title;
	}, [context, image, key.title]);
}
async function onPluginMessage(message) {
	const key = keyState.get(message.context);
	if (message.event === "getGlobalSettings") {
		sendHost({ event: "didReceiveGlobalSettings", payload: { settings: { apiKey, apiHost: "api.vdo.ninja", useTls: true, httpFallback: true, requestTimeoutMs: 8000, detailsPollMs: 1000 } } });
	} else if (message.event === "getSettings") {
		hostEvent("didReceiveSettings", message.context);
	} else if (key && message.event === "setImage") {
		const states = typeof message.payload.state === "number" ? [message.payload.state] : key.images.map((_, index) => index);
		for (const state of states) key.images[state] = message.payload.image;
		await drawKey(message.context);
	} else if (key && message.event === "setTitle") {
		key.title = message.payload.title || "";
		await drawKey(message.context);
	} else if (key && message.event === "setState") {
		key.state = message.payload.state;
		await drawKey(message.context);
	}
}

try {
	await cp(join(root, "ninja.vdo.streamdeck.sdPlugin"), pluginRoot, { recursive: true });
	browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
	const recording = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: workDir, size: { width: 1280, height: 720 } } });
	stage = await recording.newPage();
	await stage.goto(base + "?" + new URLSearchParams({ director: room, api: apiKey, cleandirector: "" }), { waitUntil: "domcontentloaded", timeout: 60000 });
	await until(() => stage.evaluate(() => typeof getDetailedState === "function").catch(() => false), 60000);
	// Keys stay dark until the plugin draws them, like a deck before the plugin starts.
	await injectDeck();
	await caption("Two guests join the room…");
	// Alice joins first so she is guest 1.
	for (const [push, label] of [["alice" + randomUUID().slice(0, 4), "Alice"], ["bob" + randomUUID().slice(0, 4), "Bob"]]) {
		const page = await (await browser.newContext()).newPage();
		await page.goto(base + "?" + new URLSearchParams({ room, push, label, webcam: "", autostart: "", testmedia: "1" }), { waitUntil: "domcontentloaded", timeout: 60000 });
		await until(async () => (await guests()).some(item => item.label === label), 60000);
	}
	const order = Object.fromEntries((await guests()).map(item => [item.label, item.position]));
	if (order.Alice !== 1) throw new Error("Guests joined out of order; rerun the recording");

	server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await new Promise(resolve => server.once("listening", resolve));
	server.on("connection", connection => {
		socket = connection;
		// Late redraws can arrive after the recording page closes.
		connection.on("message", raw => void onPluginMessage(JSON.parse(raw.toString())).catch(() => undefined));
	});
	child = spawn(process.execPath, [join(pluginRoot, "bin/plugin.js"), "-port", String(server.address().port), "-pluginUUID", "demo-plugin", "-registerEvent", "registerPlugin", "-info", JSON.stringify({ application: { language: "en", platform: "windows", platformVersion: "10.0.0", version: "7.5.0" }, colors: {}, devicePixelRatio: 2, devices: [{ id: "demo-device", name: "Demo", size: { columns: 3, rows: 3 }, type: 0 }], plugin: { uuid: "ninja.vdo.streamdeck", version: "0.1.13.0" } })], { cwd: pluginRoot, windowsHide: true, stdio: "ignore" });
	await until(() => Boolean(socket));
	for (const [context] of keys) hostEvent("willAppear", context);
	await caption("The plugin connects with the page's API key", 3500);

	const othersOf = async (label, field) => (await guests()).find(item => item.label === label)?.others?.[field];
	const inScene = async label => (await guests()).find(item => item.label === label)?.scenes?.["1"];
	await caption("Mute Alice (guest 1) from the deck");
	await press("mic-1", 300);
	await until(async () => (await othersOf("Alice", "mute-guest")) === "1");
	await delay(1800);
	await caption("Press again to unmute");
	await press("mic-1", 300);
	await until(async () => (await othersOf("Alice", "mute-guest")) === "0");
	await delay(1600);

	await caption("Turn off Bob's camera, then back on");
	await press("cam-2", 300);
	await until(async () => (await othersOf("Bob", "mute-video-guest")) === "1");
	await delay(2200);
	await press("cam-2", 300);
	await until(async () => (await othersOf("Bob", "mute-video-guest")) === "0");
	await delay(1400);

	await caption("Add Alice to scene 1; the key shows live scene state");
	await press("scene-1", 300);
	await until(async () => (await inScene("Alice")) === true);
	await delay(2200);
	await press("scene-1", 300);
	await until(async () => (await inScene("Alice")) === false);
	await delay(1200);

	await caption("Select Bob; \"Selected guest\" keys now follow him");
	await press("select-bob", 2200);
	await press("selected-mic", 300);
	await until(async () => (await othersOf("Bob", "mute-guest")) === "1");
	await delay(1800);
	await press("selected-mic", 300);
	await until(async () => (await othersOf("Bob", "mute-guest")) === "0");
	await delay(1200);

	await caption("Hang up asks for a second press");
	await press("hangup-2", 1400);
	await caption("Second press removes Bob; the guest list updates");
	await press("hangup-2", 300);
	await until(async () => (await guests()).every(item => item.label !== "Bob"));
	await delay(3500);
	await caption("", 600);

	const video = stage.video();
	await recording.close();
	const webm = process.env.FFMPEG ? join(workDir, "demo.webm") : join(assets, "demo.webm");
	await copyFile(await video.path(), webm);
	if (!process.env.FFMPEG) console.log("Wrote " + webm + "; set FFMPEG for demo.mp4 and demo.gif");
	if (process.env.FFMPEG) {
		const ffmpeg = (...args) => {
			const result = spawnSync(process.env.FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
			if (result.status !== 0) throw new Error("ffmpeg failed");
		};
		ffmpeg("-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-movflags", "+faststart", join(assets, "demo.mp4"));
		const palette = join(workDir, "palette.png");
		const scale = "fps=8,scale=800:-1:flags=lanczos";
		// A small flat palette keeps the README GIF near 2 MB without visible banding.
		ffmpeg("-i", webm, "-vf", scale + ",palettegen=max_colors=96:stats_mode=diff", palette);
		ffmpeg("-i", webm, "-i", palette, "-lavfi", scale + "[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle", join(assets, "demo.gif"));
		console.log("Wrote demo.mp4 and demo.gif");
	}
} catch (error) {
	if (process.env.DEMO_DEBUG && stage) await stage.screenshot({ path: process.env.DEMO_DEBUG }).catch(() => undefined);
	throw new Error(String(error.message).replaceAll(apiKey, "[redacted]"));
} finally {
	if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
	if (server) { for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); }
	if (browser) await browser.close();
	// Chrome can hold the video file briefly after closing on Windows.
	await rm(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => undefined);
}
