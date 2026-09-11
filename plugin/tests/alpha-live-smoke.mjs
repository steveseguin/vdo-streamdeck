// Opt-in live test: real alpha page and API, simulated Stream Deck host events.
// Uses synthetic media, a fresh API key, and no existing profiles or sessions.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// Reuse the workspace's existing browser test installation.
const { chromium } = require(resolve(root, "../../tests/playwright/node_modules/@playwright/test"));
const apiKey = randomUUID().replaceAll("-", "");
const isolatedRoot = await mkdtemp(join(tmpdir(), "vdo-streamdeck-alpha-"));
const pluginRoot = join(isolatedRoot, "ninja.vdo.streamdeck.sdPlugin");
const messages = [];
const settingsByContext = new Map();
const actionsByContext = new Map();
let browser, child, socket, server;
const results = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, label, timeout = 30000) {
	const deadline = Date.now() + timeout;
	while (!(await predicate())) {
		if (child && child.exitCode !== null) throw new Error("Plugin exited during " + label);
		if (Date.now() >= deadline) throw new Error("Timed out: " + label);
		await delay(100);
	}
}
function send(message) { socket.send(JSON.stringify(message)); }
function event(type, context, settings, action = "local-control") {
	settingsByContext.set(context, settings);
	actionsByContext.set(context, action);
	send({ event: type, action: "ninja.vdo.streamdeck." + action, context, device: "alpha-test-device",
		payload: { controller: "Keypad", coordinates: { column: 0, row: 0 }, settings, isInMultiAction: false, state: 0 } });
}
function latest(context, name) { return messages.findLast(message => message.context === context && message.event === name)?.payload; }
try {
	await cp(join(root, "ninja.vdo.streamdeck.sdPlugin"), pluginRoot, { recursive: true });
	browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
	const context = await browser.newContext();
	const page = await context.newPage();
	const pageErrors = [];
	page.on("pageerror", error => pageErrors.push(error.message));
	await page.goto("https://vdo.ninja/alpha/?" + new URLSearchParams({ push: "sdtest" + randomUUID().slice(0, 8), api: apiKey, webcam: "", autostart: "", testmedia: "1", label: "Stream Deck QA" }), { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForFunction(() => typeof getDetailedState === "function" && Object.values(getDetailedState()).some(item => item.localStream && item.audioTrack && item.videoTrack), null, { timeout: 60000 });
	console.log("Alpha Chrome publisher ready with synthetic audio/video");
	server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await new Promise(resolve => server.once("listening", resolve));
	server.on("connection", connection => {
		socket = connection;
		connection.on("message", raw => {
			const message = JSON.parse(raw.toString());
			messages.push(message);
			if (message.event === "getGlobalSettings") send({ event: "didReceiveGlobalSettings", payload: { settings: { apiKey, apiHost: "api.vdo.ninja", useTls: true, httpFallback: true, requestTimeoutMs: 8000, detailsPollMs: 1000 } } });
			if (message.event === "getSettings") event("didReceiveSettings", message.context, settingsByContext.get(message.context) || {}, actionsByContext.get(message.context) || "connection");
		});
	});
	child = spawn(process.execPath, [join(pluginRoot, "bin/plugin.js"), "-port", String(server.address().port), "-pluginUUID", "alpha-test-plugin", "-registerEvent", "registerPlugin", "-info", JSON.stringify({ application: { language: "en", platform: "windows", platformVersion: "10.0.0", version: "7.5.0" }, colors: {}, devicePixelRatio: 2, devices: [{ id: "alpha-test-device", name: "QA host", size: { columns: 8, rows: 4 }, type: 7 }], plugin: { uuid: "ninja.vdo.streamdeck", version: "0.1.13.0" } })], { cwd: pluginRoot, windowsHide: true, stdio: "ignore" });
	await waitFor(() => messages.some(m => m.event === "registerPlugin"), "plugin registration");
	event("willAppear", "connection", {}, "connection");
	await waitFor(() => latest("connection", "setState")?.state === 1, "live alpha API connection");
	results.push("real API connection and page identity polling");
	const localState = () => page.evaluate(() => Object.values(getDetailedState()).find(item => item.localStream));
	for (const [command, field, button] of [["mic", "muted", "mutebutton"], ["camera", "videoMuted", "mutevideobutton"], ["speaker", "speakerMuted", "mutespeakerbutton"]]) {
		const settings = { command, behavior: "toggle" };
		const initial = (await localState())[field];
		assert.equal(typeof initial, "boolean", command + " state available");
		event("willAppear", command, settings);
		await waitFor(() => latest(command, "setState")?.state === (initial ? 0 : 1), command + " initial readback");
		assert.ok(messages.some(m => m.context === command && m.event === "setImage" && m.payload.image === `imgs/command-${command}-off.png`));
		for (const expected of [!initial, initial]) {
			event("keyDown", command, settings);
			event("keyUp", command, settings);
			await waitFor(async () => (await localState())[field] === expected, command + " browser state changed");
			await waitFor(() => latest(command, "setState")?.state === (expected ? 0 : 1), command + " key readback");
		}
		results.push(command + " toggle and restore, browser state and key feedback agree");
		for (const expected of [!initial, initial]) {
			// Muted controls intentionally pulse. Click their observed center rather
			// than waiting for the animated rectangle to become stationary.
			const control = page.locator("#" + button);
			assert.ok(await control.isVisible(), command + " browser control visible");
			const bounds = await control.boundingBox();
			assert.ok(bounds, command + " browser control bounds");
			await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
			await waitFor(async () => (await localState())[field] === expected, command + " browser control changed state");
			await waitFor(() => latest(command, "setState")?.state === (expected ? 0 : 1), command + " external change readback");
		}
		results.push(command + " browser control changes flow back to key feedback");
	}
	for (const [control, direction, mode, icon] of [["pan", "negative", "relative", "pan-left"], ["pan", "positive", "relative", "pan-right"], ["tilt", "negative", "relative", "tilt-down"], ["tilt", "positive", "relative", "tilt-up"], ["pan", "negative", "absolute", "pan"], ["zoom", "negative", "relative", "zoom-out"], ["zoom", "positive", "absolute", "zoom-absolute"]]) {
		event(settingsByContext.has("ptz") ? "didReceiveSettings" : "willAppear", "ptz", { scope: "local", control, direction, mode, value: "0.1" }, "ptz-key");
		await waitFor(() => latest("ptz", "setImage")?.image === `imgs/command-${icon}-on.png`, "PTZ artwork " + icon);
	}
	results.push("PTZ direction and absolute-mode artwork updates in bundled runtime");
	assert.deepEqual(pageErrors, [], "alpha page uncaught errors");
	console.log(JSON.stringify({ browser: await browser.version(), passed: results, pageErrors: 0 }, null, 2));
} catch (error) {
	// Never print the ephemeral API key or test page URL in diagnostics.
	throw new Error(String(error.message).replaceAll(apiKey, "[redacted]"));
} finally {
	if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
	if (server) { for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); }
	if (browser) await browser.close();
	const target = resolve(isolatedRoot);
	assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("vdo-streamdeck-alpha-"));
	await rm(target, { recursive: true, force: true });
}
