// Records the narrated demo: the built plugin drives a live VDO.Ninja director
// room while a virtual Stream Deck draws exactly what the plugin sends
// (images, titles, states). Guests use synthetic media and the API key is
// fresh, so nothing private appears in the video.
//
//   npm run build
//   python scripts/demo-voice.py <voice-dir>
//   VOICE_DIR=<voice-dir> FFMPEG=/path/to/ffmpeg node scripts/record-demo.mjs
//
// Each scene lasts as long as its voice clip, and captions are drawn in the
// page from the same narration, so speech, captions, and key presses line up.
// Writes docs/assets/demo.mp4 (with voice), demo.gif (silent), and demo-poster.jpg.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const voiceDir = process.env.VOICE_DIR;
const ffmpegPath = process.env.FFMPEG;
if (!voiceDir || !ffmpegPath) throw new Error("Set VOICE_DIR (from scripts/demo-voice.py) and FFMPEG");
const apiKey = randomUUID().replaceAll("-", "");
const room = "deckdemo" + randomUUID().slice(0, 6);
const workDir = await mkdtemp(join(tmpdir(), "vdo-streamdeck-demo-"));
const pluginRoot = join(workDir, "ninja.vdo.streamdeck.sdPlugin");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const narration = JSON.parse(await readFile(join(root, "scripts/demo-narration.json"), "utf8"));
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
	#deck { position: fixed; left: 0; top: 0; bottom: 0; width: ${DECK_WIDTH}px; z-index: 2147483646; padding: 26px 24px; box-sizing: border-box; display: flex; flex-direction: column; background: #0b0d12; border-right: 1px solid #2c313c; font-family: "Segoe UI", system-ui, sans-serif; color: #e8edf5; }
	h1 { font-size: 17px; margin: 0 0 4px; font-weight: 650; }
	.sub { font-size: 12px; color: #93a0b4; margin-bottom: 18px; }
	#grid { display: grid; grid-template-columns: repeat(3, 108px); gap: 12px; padding: 16px; background: #1a1d24; border: 1px solid #2c313c; border-radius: 18px; align-self: flex-start; }
	.key { position: relative; width: 108px; height: 108px; border-radius: 14px; overflow: hidden; background: #111318; transition: transform 90ms ease; }
	.key img { position: absolute; inset: 0; width: 100%; height: 100%; }
	.key .title { position: absolute; left: 4px; right: 4px; bottom: 7px; text-align: center; font-size: 13px; font-weight: 600; line-height: 1.15; white-space: pre-line; text-shadow: 0 1px 3px #000, 0 0 2px #000; }
	.key.pressed { transform: scale(0.9); }
	.key.pressed::after { content: ""; position: absolute; inset: 0; border-radius: 14px; box-shadow: inset 0 0 0 3px #ffffffcc; }
	#step { margin-top: 22px; font-size: 13px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: #35d07f; min-height: 18px; }
	#note { margin-top: auto; font-size: 11px; color: #6f7b8f; }
	#subs { position: fixed; left: ${DECK_WIDTH + 30}px; right: 30px; bottom: 74px; z-index: 2147483647; display: flex; justify-content: center; pointer-events: none; }
	#subs span { max-width: 760px; padding: 8px 16px; border-radius: 8px; background: rgba(0, 0, 0, 0.82); color: #fff; font-family: "Segoe UI", system-ui, sans-serif; font-size: 25px; line-height: 1.32; font-weight: 600; text-align: center; }
	#subs span:empty { display: none; }
	#card { position: fixed; left: ${DECK_WIDTH}px; right: 0; top: 0; bottom: 0; z-index: 2147483645; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: #0b0d12f2; font-family: "Segoe UI", system-ui, sans-serif; color: #e8edf5; }
	#card.show { display: flex; }
	#card .big { font-size: 40px; font-weight: 700; }
	#card .url { font-size: 24px; color: #35d07f; font-weight: 600; }
	#card .small { font-size: 16px; color: #93a0b4; }
`;
const keyHtml = keys.map(([context]) => '<div class="key" data-key="' + context + '"><img alt=""><div class="title"></div></div>').join("");
const deckHtml = '<div id="deck"><h1>VDO.Ninja for Stream Deck</h1><div class="sub">Live director room · two guests</div><div id="grid">' + keyHtml +
	'</div><div id="step"></div><div id="note">Keys are drawn from the plugin\'s own output. Guests use synthetic camera and mic.</div></div>' +
	'<div id="card"><div class="big">Get the free plugin</div><div class="url">github.com/steveseguin/vdo-streamdeck</div><div class="small">Requires the Stream Deck app 6.8 or later</div></div>' +
	'<div id="subs"><span></span></div>';

async function injectDeck() {
	await stage.evaluate(([css, html, width]) => {
		const host = document.createElement("div");
		document.documentElement.appendChild(host);
		const shadow = host.attachShadow({ mode: "open" });
		shadow.innerHTML = "<style>" + css + "</style>" + html;
		window.__deck = shadow;
		// The director page renders beside the deck; captions replace its bottom toolbar.
		const style = document.createElement("style");
		style.textContent = "body { margin-left: " + width + "px !important; width: calc(100vw - " + width + "px) !important; } #controlButtons { display: none !important; }";
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

// WAV duration from the header, so scene timing needs no audio library.
async function wavSeconds(path) {
	const data = await readFile(path);
	const byteRate = data.readUInt32LE(28);
	let offset = 12;
	while (offset < data.length) {
		const id = data.toString("ascii", offset, offset + 4);
		const size = data.readUInt32LE(offset + 4);
		if (id === "data") return size / byteRate;
		offset += 8 + size;
	}
	throw new Error("No audio data in " + path);
}

// Captions: one cue per sentence, timed by its share of the line's characters.
function captionCues(text, start, duration) {
	// Split only at sentence ends followed by a space, so "VDO.Ninja" stays whole.
	const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
	const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
	let at = start;
	return sentences.map(sentence => {
		const length = duration * sentence.length / total;
		const cue = { start: at, end: at + length, text: sentence };
		at += length;
		return cue;
	});
}

function sendHost(message) { socket.send(JSON.stringify(message)); }
function hostEvent(type, context, extra = {}) {
	sendHost({ event: type, action: "ninja.vdo.streamdeck." + actionByContext.get(context), context, device: "demo-device",
		payload: { controller: "Keypad", coordinates: { column: 0, row: 0 }, settings: settingsByContext.get(context), isInMultiAction: false, state: 0, ...extra } });
}
async function press(context) {
	const toggle = on => stage.evaluate(([id, value]) => window.__deck.querySelector('[data-key="' + id + '"]').classList.toggle("pressed", value), [context, on]);
	await toggle(true);
	hostEvent("keyDown", context);
	await delay(160);
	await toggle(false);
	hostEvent("keyUp", context);
}
const guests = () => stage.evaluate(() => Object.values(getDetailedState()).filter(item => item.position && !item.director));
async function until(predicate, label, timeout = 60000) {
	const deadline = Date.now() + timeout;
	while (!(await predicate())) {
		if (Date.now() > deadline) throw new Error("Timed out: " + label);
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
async function startPlugin() {
	server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await new Promise(resolve => server.once("listening", resolve));
	server.on("connection", connection => {
		socket = connection;
		// Late redraws can arrive after the recording page closes.
		connection.on("message", raw => void onPluginMessage(JSON.parse(raw.toString())).catch(() => undefined));
	});
	const info = { application: { language: "en", platform: "windows", platformVersion: "10.0.0", version: "7.5.0" }, colors: {}, devicePixelRatio: 2, devices: [{ id: "demo-device", name: "Demo", size: { columns: 3, rows: 3 }, type: 0 }], plugin: { uuid: "ninja.vdo.streamdeck", version: manifest.Version } };
	child = spawn(process.execPath, [join(pluginRoot, "bin/plugin.js"), "-port", String(server.address().port), "-pluginUUID", "demo-plugin", "-registerEvent", "registerPlugin", "-info", JSON.stringify(info)], { cwd: pluginRoot, windowsHide: true, stdio: "ignore" });
	await until(() => Boolean(socket), "plugin registration", 15000);
	for (const [context] of keys) hostEvent("willAppear", context);
}

// Chrome's screencast stamps every frame with its capture time. Playwright's
// own recorder drifted seconds behind the voice under load, so the video is
// rebuilt from these timestamps instead.
const frames = [];
const frameWrites = [];
async function startScreencast() {
	const cdp = await stage.context().newCDPSession(stage);
	cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
		const file = join(workDir, "frame-" + String(frames.length).padStart(6, "0") + ".jpg");
		frames.push({ file, time: metadata.timestamp });
		frameWrites.push(writeFile(file, Buffer.from(data, "base64")));
		void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
	});
	await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1280, maxHeight: 720 });
	return cdp;
}
// ffconcat list holding each frame until the next one, from `start` (epoch seconds).
async function writeFrameList(start, length) {
	if (Math.abs(frames[0].time - Date.now() / 1000) > 3600) throw new Error("Screencast timestamps are not wall-clock time");
	const first = Math.max(0, frames.findLastIndex(frame => frame.time <= start));
	const used = frames.slice(first).filter(frame => frame.time < start + length);
	const lines = ["ffconcat version 1.0"];
	used.forEach((frame, index) => {
		const from = Math.max(frame.time, start);
		const to = index + 1 < used.length ? used[index + 1].time : start + length;
		lines.push("file '" + frame.file.replaceAll("\\", "/") + "'", "duration " + Math.max(0.001, to - from).toFixed(4));
	});
	lines.push("file '" + used.at(-1).file.replaceAll("\\", "/") + "'");
	const list = join(workDir, "frames.txt");
	await writeFile(list, lines.join("\n") + "\n");
	return list;
}

// Scenes play in narration order; `at(fraction)` waits until that share of the clip.
const clips = new Map();
let timelineStart = 0;
const elapsed = () => (Date.now() - timelineStart) / 1000;
async function scene(id, step, action = async () => undefined) {
	const line = narration.lines.find(item => item.id === id);
	const { duration } = clips.get(id);
	const start = elapsed();
	clips.get(id).start = start;
	const sceneCues = captionCues(line.text, start, duration);
	await stage.evaluate(([label, schedule]) => {
		window.__deck.getElementById("step").textContent = label;
		const span = window.__deck.querySelector("#subs span");
		for (const cue of schedule) setTimeout(() => { span.textContent = cue.text; }, cue.delay);
		setTimeout(() => { span.textContent = ""; }, schedule.at(-1).end);
	}, [step, sceneCues.map(cue => ({ text: cue.text, delay: (cue.start - start) * 1000, end: (cue.end - start) * 1000 }))]);
	const sceneStart = Date.now();
	const at = async fraction => { const wait = sceneStart + duration * fraction * 1000 - Date.now(); if (wait > 0) await delay(wait); };
	await action(at);
	await at(1);
	await delay(650);
}

try {
	for (const line of narration.lines) {
		const path = join(voiceDir, line.id + ".wav");
		clips.set(line.id, { path, duration: await wavSeconds(path) });
	}
	await cp(join(root, "ninja.vdo.streamdeck.sdPlugin"), pluginRoot, { recursive: true });
	browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
	const recording = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	stage = await recording.newPage();
	await stage.goto(base + "?" + new URLSearchParams({ director: room, api: apiKey, cleandirector: "" }), { waitUntil: "domcontentloaded", timeout: 60000 });
	await until(() => stage.evaluate(() => typeof getDetailedState === "function").catch(() => false), "director page");
	await injectDeck();
	// Alice joins first so she is guest 1. This pre-roll is trimmed from the video.
	for (const [push, label] of [["alice" + randomUUID().slice(0, 4), "Alice"], ["bob" + randomUUID().slice(0, 4), "Bob"]]) {
		const page = await (await browser.newContext()).newPage();
		await page.goto(base + "?" + new URLSearchParams({ room, push, label, webcam: "", autostart: "", testmedia: "1" }), { waitUntil: "domcontentloaded", timeout: 60000 });
		await until(async () => (await guests()).some(item => item.label === label), label + " joins");
	}
	if ((await guests()).find(item => item.label === "Alice")?.position !== 1) throw new Error("Guests joined out of order; rerun the recording");
	await delay(2500);

	const screencast = await startScreencast();
	await delay(500);
	timelineStart = Date.now();
	await delay(400);
	await scene("intro", "VDO.Ninja for Stream Deck");
	await scene("connect", "Connect", async at => { await at(0.3); await startPlugin(); });
	await scene("mic", "Mute a guest", async at => { await at(0.12); await press("mic-1"); await at(0.8); await press("mic-1"); });
	await scene("camera", "Camera on and off", async at => { await at(0.45); await press("cam-2"); await at(0.85); await press("cam-2"); });
	await scene("scene", "Scenes", async at => { await at(0.3); await press("scene-1"); await at(1.05); await press("scene-1"); });
	await scene("select", "Select a guest", async at => { await at(0.4); await press("select-bob"); await at(0.78); await press("selected-mic"); });
	// The second press must land inside the plugin's 2-second confirmation window.
	await scene("hangup", "Safe hang-up", async at => {
		await at(0.27);
		await press("hangup-2");
		await at(0.45);
		await press("hangup-2");
		await until(async () => (await guests()).every(item => item.label !== "Bob"), "Bob leaves", 8000);
	});
	await scene("outro", "Get started", async () => {
		await stage.evaluate(() => window.__deck.getElementById("card").classList.add("show"));
	});
	await delay(1200);
	const totalSeconds = elapsed();

	await screencast.send("Page.stopScreencast");
	await Promise.all(frameWrites);
	const frameList = await writeFrameList(timelineStart / 1000, totalSeconds);

	const ffmpeg = (...args) => {
		const result = spawnSync(ffmpegPath, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
		if (result.status !== 0) throw new Error("ffmpeg failed");
	};
	const timed = narration.lines.map(line => clips.get(line.id));
	const audioInputs = timed.flatMap(clip => ["-i", clip.path]);
	const mix = timed.map((clip, index) => `[${index + 1}:a]adelay=${Math.round(clip.start * 1000)}:all=1[a${index}]`).join(";") +
		";" + timed.map((_, index) => `[a${index}]`).join("") + `amix=inputs=${timed.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad[voice]`;
	ffmpeg("-f", "concat", "-safe", "0", "-i", frameList, ...audioInputs,
		"-filter_complex", mix + ";[0:v]fps=30,format=yuv420p[video]", "-map", "[video]", "-map", "[voice]", "-t", totalSeconds.toFixed(2),
		"-c:v", "libx264", "-preset", "slow", "-crf", "22", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
		join(assets, "demo.mp4"));
	// The README GIF is silent; captions are part of the picture.
	const palette = join(workDir, "palette.png");
	const scale = "fps=8,scale=800:-1:flags=lanczos";
	ffmpeg("-i", join(assets, "demo.mp4"), "-vf", scale + ",palettegen=max_colors=96:stats_mode=diff", palette);
	ffmpeg("-i", join(assets, "demo.mp4"), "-i", palette, "-lavfi", scale + "[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle", join(assets, "demo.gif"));
	// Poster: the moment Alice is muted, so the still frame shows the deck at work.
	const muted = clips.get("mic");
	ffmpeg("-ss", (muted.start + muted.duration * 0.45).toFixed(2), "-i", join(assets, "demo.mp4"), "-frames:v", "1", "-q:v", "3", join(assets, "demo-poster.jpg"));
	console.log(`Wrote demo.mp4, demo.gif, and demo-poster.jpg (${totalSeconds.toFixed(1)}s)`);
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
