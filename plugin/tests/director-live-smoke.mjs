// Opt-in live test: a real director room with two synthetic guests, driven
// through the bundled plugin by simulated Stream Deck host events. Every check
// compares the key feedback with the director page's own state.
// VDO_BASE selects the deployment (default https://vdo.ninja/).
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
const base = process.env.VDO_BASE || "https://vdo.ninja/";
const apiKey = randomUUID().replaceAll("-", "");
const room = "sdqa" + randomUUID().slice(0, 8);
const guests = [{ id: "sdqa" + randomUUID().slice(0, 6), label: "Alice" }, { id: "sdqa" + randomUUID().slice(0, 6), label: "Bob" }];
const isolatedRoot = await mkdtemp(join(tmpdir(), "vdo-streamdeck-director-"));
const pluginRoot = join(isolatedRoot, "ninja.vdo.streamdeck.sdPlugin");
const messages = [];
const settingsByContext = new Map();
const actionsByContext = new Map();
const results = [];
let browser, child, socket, server, director;
const guestPages = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(predicate, label, timeout = 20000) {
	const deadline = Date.now() + timeout;
	while (!(await predicate())) {
		if (child && child.exitCode !== null) throw new Error("Plugin exited during " + label);
		if (Date.now() >= deadline) throw new Error("Timed out: " + label);
		await delay(150);
	}
}
function send(message) { socket.send(JSON.stringify(message)); }
function hostEvent(type, context, action, settings, extra = {}) {
	settingsByContext.set(context, settings);
	actionsByContext.set(context, action);
	const controller = extra.controller || "Keypad";
	send({ event: type, action: "ninja.vdo.streamdeck." + action, context, device: "qa-device",
		payload: { controller, coordinates: { column: 0, row: 0 }, settings, isInMultiAction: false, state: 0, ...extra.payload } });
}
const appear = (context, action, settings, controller) => hostEvent("willAppear", context, action, settings, { controller });
const press = (context, action, settings) => { hostEvent("keyDown", context, action, settings); hostEvent("keyUp", context, action, settings); };
const rotate = (context, settings, ticks) => hostEvent("dialRotate", context, "value-dial", settings, { controller: "Encoder", payload: { ticks, pressed: false } });
const count = (context, name) => messages.filter(m => m.context === context && m.event === name).length;
function latest(context, name) { return messages.findLast(m => m.context === context && m.event === name)?.payload; }
function listText() {
	const image = latest("list", "setImage")?.image || "";
	const svg = Buffer.from(image.split(",")[1] || "", "base64").toString("utf8");
	return Array.from(svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g), match => match[1]).join(" | ");
}
const guestState = () => director.evaluate(() => Object.values(getDetailedState()).filter(item => item.position && !item.director));
const guestAt = async position => (await guestState()).find(item => item.position === position);
// Director controls report "0"/"1" strings, pressed buttons report true.
const flag = value => value === true || value === 1 || value === "1";
const others = async (position, key) => (await guestAt(position))?.others?.[key];
async function feedback(context, before, kind) {
	await waitFor(() => count(context, kind) > before, context + " " + kind);
}

try {
	await cp(join(root, "ninja.vdo.streamdeck.sdPlugin"), pluginRoot, { recursive: true });
	browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
	const pageErrors = [];
	const open = async (query, label) => {
		const page = await (await browser.newContext()).newPage();
		page.on("pageerror", error => pageErrors.push(label + ": " + error.message));
		await page.goto(base + "?" + new URLSearchParams(query), { waitUntil: "domcontentloaded", timeout: 60000 });
		await page.waitForFunction(() => typeof getDetailedState === "function", null, { timeout: 60000 });
		return page;
	};
	director = await open({ director: room, api: apiKey }, "director");
	for (const guest of guests) {
		guestPages.push(await open({ room, push: guest.id, label: guest.label, webcam: "", autostart: "", testmedia: "1" }, guest.label));
	}
	await waitFor(async () => { const state = await guestState(); return state.length === 2 && guests.every(guest => state.some(item => item.label === guest.label)); }, "both guests visible to the director with labels", 60000);
	const byLabel = Object.fromEntries((await guestState()).map(item => [item.label, item.position]));
	console.log("Director room ready on " + base + " with guests " + JSON.stringify(byLabel));

	server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await new Promise(resolve => server.once("listening", resolve));
	server.on("connection", connection => {
		socket = connection;
		connection.on("message", raw => {
			const message = JSON.parse(raw.toString());
			messages.push(message);
			if (message.event === "getGlobalSettings") send({ event: "didReceiveGlobalSettings", payload: { settings: { apiKey, apiHost: "api.vdo.ninja", useTls: true, httpFallback: true, requestTimeoutMs: 8000, detailsPollMs: 1000 } } });
			if (message.event === "getSettings") hostEvent("didReceiveSettings", message.context, actionsByContext.get(message.context) || "connection", settingsByContext.get(message.context) || {});
			if (message.event === "setSettings") settingsByContext.set(message.context, message.payload);
		});
	});
	child = spawn(process.execPath, [join(pluginRoot, "bin/plugin.js"), "-port", String(server.address().port), "-pluginUUID", "qa-plugin", "-registerEvent", "registerPlugin", "-info", JSON.stringify({ application: { language: "en", platform: "windows", platformVersion: "10.0.0", version: "7.5.0" }, colors: {}, devicePixelRatio: 2, devices: [{ id: "qa-device", name: "QA host", size: { columns: 8, rows: 4 }, type: 7 }], plugin: { uuid: "ninja.vdo.streamdeck", version: "0.1.13.0" } })], { cwd: pluginRoot, windowsHide: true, stdio: "ignore" });
	await waitFor(() => messages.some(m => m.event === "registerPlugin"), "plugin registration");

	appear("connection", "connection", {});
	await waitFor(() => latest("connection", "setState")?.state === 1, "API connection to the director page");
	results.push("connection status reaches the live director page");

	appear("list", "guests-list", {});
	await waitFor(() => listText().includes("Alice") && listText().includes("Bob"), "guests list shows both guests");
	results.push("guests list renders live guests: " + listText());

	// Fixed slot target: mute Alice's mic, check the director agrees, restore.
	const aliceMic = { command: "mic", targetMode: "slot", target: String(byLabel.Alice), behavior: "toggle" };
	appear("alice-mic", "guest-command", aliceMic);
	await waitFor(() => latest("alice-mic", "setState")?.state === 1, "Alice mic initial readback (live)");
	for (const [muted, keyState] of [[true, 0], [false, 1]]) {
		press("alice-mic", "guest-command", aliceMic);
		await waitFor(async () => flag(await others(byLabel.Alice, "mute-guest")) === muted, "director mute-guest = " + muted);
		await waitFor(() => latest("alice-mic", "setState")?.state === keyState, "Alice mic key readback " + keyState);
	}
	results.push("guest mic by slot: director state and key feedback agree, both directions");

	const bobCamera = { command: "camera", targetMode: "slot", target: String(byLabel.Bob), behavior: "toggle" };
	appear("bob-camera", "guest-command", bobCamera);
	for (const [off, keyState] of [[true, 0], [false, 1]]) {
		press("bob-camera", "guest-command", bobCamera);
		await waitFor(async () => flag(await others(byLabel.Bob, "mute-video-guest")) === off, "director video off = " + off);
		await waitFor(() => latest("bob-camera", "setState")?.state === keyState, "Bob camera key readback " + keyState);
	}
	results.push("guest camera by slot: director video-off state and key feedback agree, both directions");

	// Select Guest drives every "selected" target.
	const selectBob = { mode: "fixed", targetMode: "slot", target: String(byLabel.Bob) };
	appear("select", "select-guest", selectBob);
	let okBefore = count("select", "showOk");
	press("select", "select-guest", selectBob);
	await feedback("select", okBefore, "showOk");
	const selectedMic = { command: "mic", targetMode: "selected", behavior: "toggle" };
	appear("selected-mic", "guest-command", selectedMic);
	press("selected-mic", "guest-command", selectedMic);
	await waitFor(async () => flag(await others(byLabel.Bob, "mute-guest")) && !flag(await others(byLabel.Alice, "mute-guest")), "selected guest (Bob) muted, Alice untouched");
	press("selected-mic", "guest-command", selectedMic);
	await waitFor(async () => !flag(await others(byLabel.Bob, "mute-guest")), "Bob unmuted");
	const cycle = { mode: "next" };
	appear("select-next", "select-guest", cycle);
	press("select-next", "select-guest", cycle);
	await delay(300);
	press("selected-mic", "guest-command", selectedMic);
	await waitFor(async () => flag(await others(byLabel.Alice, "mute-guest")) && !flag(await others(byLabel.Bob, "mute-guest")), "Next moved the selection to Alice");
	press("selected-mic", "guest-command", selectedMic);
	await waitFor(async () => !flag(await others(byLabel.Alice, "mute-guest")), "Alice unmuted");
	results.push("select guest (fixed and next) retargets selected-guest commands");

	const aliceScene = { targetMode: "slot", target: String(byLabel.Alice), scene: "1", mode: "toggle" };
	appear("alice-scene", "guest-scene", aliceScene);
	press("alice-scene", "guest-scene", aliceScene);
	await waitFor(async () => (await guestAt(byLabel.Alice))?.scenes?.["1"] === true, "Alice added to scene 1");
	await waitFor(() => latest("alice-scene", "setState")?.state === 1, "scene key shows in-scene");
	appear("list", "guests-list", { scope: "scene", scene: "1" });
	hostEvent("didReceiveSettings", "list", "guests-list", { scope: "scene", scene: "1" });
	await waitFor(() => listText().includes("Alice") && !listText().includes("Bob"), "scene list shows only Alice");
	press("alice-scene", "guest-scene", aliceScene);
	await waitFor(async () => (await guestAt(byLabel.Alice))?.scenes?.["1"] === false, "Alice removed from scene 1");
	await waitFor(() => latest("alice-scene", "setState")?.state === 0, "scene key shows not-in-scene");
	results.push("guest scene toggle on/off with key readback and scene-filtered guests list");

	const volume = { scope: "guest", targetMode: "slot", target: String(byLabel.Alice), control: "volume", value: "100", min: "0", max: "200", step: "5", intervalMs: 50 };
	appear("alice-volume", "value-dial", volume, "Encoder");
	rotate("alice-volume", volume, -4);
	await waitFor(async () => String(await others(byLabel.Alice, "volume")) === "80", "director volume slider at 80");
	results.push("value dial sets guest volume (100 -> 80) on the director");

	const chatText = "Stream Deck QA " + randomUUID().slice(0, 4);
	const chat = { command: "sendDirectorChat", targetMode: "slot", target: String(byLabel.Alice), value: chatText };
	appear("chat", "guest-command", chat);
	okBefore = count("chat", "showOk");
	press("chat", "guest-command", chat);
	await feedback("chat", okBefore, "showOk");
	const aliceIndex = guests.findIndex(guest => guest.label === "Alice");
	await waitFor(() => guestPages[aliceIndex].evaluate(text => document.body.innerText.includes(text), chatText), "Alice's page received the director chat");
	results.push("director chat reaches the targeted guest page");

	const layout = { command: "layout", layout: "0" };
	appear("layout", "mixer-control", layout);
	okBefore = count("layout", "showOk");
	press("layout", "mixer-control", layout);
	await feedback("layout", okBefore, "showOk");
	const custom = { action: "getDetails", awaitCallback: true };
	appear("custom", "custom-command", custom);
	okBefore = count("custom", "showOk");
	press("custom", "custom-command", custom);
	await feedback("custom", okBefore, "showOk");
	results.push("mixer layout and custom command acknowledged by the live page");

	// Error path: a missing guest alerts, and the inspector explains why.
	const missing = { command: "mic", targetMode: "slot", target: "9", behavior: "toggle" };
	appear("missing", "guest-command", missing);
	const alertBefore = count("missing", "showAlert");
	press("missing", "guest-command", missing);
	await feedback("missing", alertBefore, "showAlert");
	send({ event: "propertyInspectorDidAppear", action: "ninja.vdo.streamdeck.guest-command", context: "missing", device: "qa-device" });
	send({ event: "sendToPlugin", action: "ninja.vdo.streamdeck.guest-command", context: "missing", payload: { type: "requestStatus" } });
	await waitFor(() => messages.some(m => m.context === "missing" && m.event === "sendToPropertyInspector" && m.payload.type === "actionError" && /No guest available/.test(m.payload.message)), "inspector shows the missing-guest error");
	send({ event: "propertyInspectorDidDisappear", action: "ninja.vdo.streamdeck.guest-command", context: "missing", device: "qa-device" });
	results.push("missing guest alerts and the inspector explains the failure");

	// Destructive command needs two presses; the first must not hang up.
	const hangup = { command: "hangup", targetMode: "slot", target: String(byLabel.Bob), dangerousConfirm: true };
	appear("hangup", "guest-command", hangup);
	press("hangup", "guest-command", hangup);
	await waitFor(() => latest("hangup", "setTitle")?.title === "Press\nagain", "first hangup press arms the key");
	await delay(500);
	assert.equal((await guestState()).length, 2, "first hangup press must not hang up");
	press("hangup", "guest-command", hangup);
	await waitFor(async () => (await guestState()).every(item => item.label !== "Bob"), "Bob removed after confirming");
	hostEvent("didReceiveSettings", "list", "guests-list", {});
	await waitFor(() => listText().includes("Alice") && !listText().includes("Bob"), "guests list drops Bob");
	results.push("hangup needs a confirming second press, then the guests list updates");

	assert.deepEqual(pageErrors, [], "uncaught page errors");
	console.log(JSON.stringify({ base, browser: await browser.version(), passed: results, pageErrors: 0 }, null, 2));
} catch (error) {
	if (process.env.QA_DEBUG) {
		console.log(JSON.stringify(messages.filter(m => ["showOk", "showAlert", "setTitle"].includes(m.event)).slice(-30).map(m => [m.context, m.event, m.payload?.title])));
		if (director) console.log(JSON.stringify((await guestState().catch(() => [])).map(item => ({ label: item.label, position: item.position, others: item.others, scenes: item.scenes }))));
	}
	// Never print the ephemeral API key in diagnostics.
	throw new Error(String(error.message).replaceAll(apiKey, "[redacted]"));
} finally {
	if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
	if (server) { for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); }
	if (browser) await browser.close();
	const target = resolve(isolatedRoot);
	assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("vdo-streamdeck-director-"));
	await rm(target, { recursive: true, force: true });
}
