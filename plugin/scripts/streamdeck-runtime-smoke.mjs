import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, "..");
const builtPluginRoot = join(pluginRoot, "ninja.vdo.streamdeck.sdPlugin");
const builtPluginEntry = join(builtPluginRoot, "bin", "plugin.js");
const apiKey = "runtime-test-key";

if (!existsSync(builtPluginEntry)) {
	throw new Error("Compiled plugin missing. Run `npm run build` before `npm run test:runtime`.");
}

const isolatedRoot = await mkdtemp(join(tmpdir(), "vdo-streamdeck-runtime-"));
const isolatedPluginRoot = join(isolatedRoot, "ninja.vdo.streamdeck.sdPlugin");
await cp(builtPluginRoot, isolatedPluginRoot, { recursive: true });

const apiRequests = [];
const apiSocketMessages = [];
const apiState = {
	localMuted: false,
	guestMuted: false,
	guestVolume: 100,
	guestScene1: false
};

const apiServer = createServer((request, response) => {
	const segments = (request.url || "")
		.split("?")[0]
		.split("/")
		.filter(Boolean)
		.map(decodeURIComponent);
	const [key, action, target, value] = segments;
	apiRequests.push({ key, action, target, value });

	response.writeHead(key === apiKey ? 200 : 404, { "content-type": "application/json" });
	if (key !== apiKey) {
		response.end(JSON.stringify(false));
		return;
	}
	if (action === "getDetails") {
		response.end(
			JSON.stringify({
				local: {
					streamID: "local",
					label: "Director",
					localStream: true,
					director: true,
					position: 1,
					slot: 2,
					audioTrack: true,
					videoTrack: false,
					muted: apiState.localMuted,
					videoMuted: true,
					ptz: true
				},
				guest: {
					streamID: "guest",
					label: "Runtime Guest",
					position: 2,
					slot: 1,
					audioTrack: true,
					videoTrack: true,
					directorMuted: apiState.guestMuted,
					videoVolume: 1,
					scenes: { 1: apiState.guestScene1 },
					others: { volume: String(apiState.guestVolume), "mute-guest": apiState.guestMuted }
				}
			})
		);
		return;
	}
	if (action === "getGuestList") {
		response.end(
			JSON.stringify({
				1: { streamID: "local", label: "Director" },
				2: { streamID: "guest", label: "Runtime Guest" }
			})
		);
		return;
	}
	if (action === "volume" && target === "1") {
		apiState.guestVolume = Number(value);
		response.end(JSON.stringify(apiState.guestVolume));
		return;
	}
	if (action === "mic" && target === "1") {
		apiState.guestMuted = value === "toggle" ? !apiState.guestMuted : value === "false";
		response.end(JSON.stringify(!apiState.guestMuted));
		return;
	}
	if (action === "mic" && typeof target !== "undefined") {
		apiState.localMuted = target === "toggle" ? !apiState.localMuted : target === "false";
		response.end(JSON.stringify(!apiState.localMuted));
		return;
	}
	if (action === "addScene" && target === "1") {
		apiState.guestScene1 = !apiState.guestScene1;
		response.end(JSON.stringify(apiState.guestScene1));
		return;
	}
	response.end(JSON.stringify(true));
});
const apiWebSockets = new WebSocketServer({ noServer: true });
apiServer.on("upgrade", (request, socket, head) => {
	apiWebSockets.handleUpgrade(request, socket, head, client => apiWebSockets.emit("connection", client, request));
});
apiWebSockets.on("connection", socket => {
	socket.on("message", raw => apiSocketMessages.push(JSON.parse(raw.toString())));
});
await listen(apiServer);
const apiPort = apiServer.address().port;

const streamDeckMessages = [];
const contextSettings = new Map();
let streamDeckSocket;
const streamDeckServer = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await onceListening(streamDeckServer);
streamDeckServer.on("connection", socket => {
	streamDeckSocket = socket;
	socket.on("message", raw => {
		const message = JSON.parse(raw.toString());
		streamDeckMessages.push(message);
		if (message.event === "getGlobalSettings") {
			sendToPlugin({
				event: "didReceiveGlobalSettings",
				payload: {
					settings: {
						apiKey,
						apiHost: `127.0.0.1:${apiPort}`,
						useTls: false,
						httpFallback: true,
						requestTimeoutMs: 1000,
						detailsPollMs: 200
					}
				}
			});
		} else if (message.event === "getSettings") {
			sendToPlugin({
				action: message.action,
				context: message.context,
				event: "didReceiveSettings",
				device: "runtime-device",
				payload: { settings: contextSettings.get(message.context) || {}, coordinates: { column: 0, row: 0 } }
			});
		} else if (message.event === "setSettings") {
			contextSettings.set(message.context, message.payload || {});
		}
	});
});

const streamDeckPort = streamDeckServer.address().port;
const child = spawn(
	process.execPath,
	[
		join(isolatedPluginRoot, "bin", "plugin.js"),
		"-port",
		String(streamDeckPort),
		"-pluginUUID",
		"runtime-plugin",
		"-registerEvent",
		"registerPlugin",
		"-info",
		JSON.stringify({
			application: { language: "en", platform: "windows", platformVersion: "10.0.0", version: "7.5.0" },
			colors: {},
			devicePixelRatio: 2,
			devices: [
				{
					id: "runtime-device",
					name: "Runtime Stream Deck +",
					size: { columns: 8, rows: 4 },
					type: 7
				}
			],
			plugin: { uuid: "ninja.vdo.streamdeck", version: "0.1.12.0" }
		}),
	],
	{
		cwd: isolatedPluginRoot,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true
	}
);

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", chunk => (stdout += chunk));
child.stderr.on("data", chunk => (stderr += chunk));

try {
	await waitFor(
		() => streamDeckMessages.some(message => message.event === "registerPlugin" && message.uuid === "runtime-plugin"),
		"plugin registration"
	);
	await waitFor(
		() => apiRequests.some(request => request.action === "getDetails") && apiRequests.some(request => request.action === "getGuestList"),
		"initial VDO state polling"
	);

	const selectSettings = { mode: "fixed", targetMode: "slot", target: "1", title: "" };
	const guestMicSettings = { command: "mic", targetMode: "slot", target: "1", behavior: "toggle", title: "" };
	const localMicSettings = { command: "mic", behavior: "toggle", title: "" };
	const volumeSettings = {
		scope: "guest",
		targetMode: "slot",
		target: "1",
		control: "volume",
		value: "100",
		min: "0",
		max: "200",
		step: "5",
		resetValue: "100",
		intervalMs: 20,
		pushAction: "reset",
		title: ""
	};
	const ptzSettings = {
		scope: "guest",
		targetMode: "slot",
		target: "1",
		control: "zoom",
		step: "0.05",
		intervalMs: 20,
		pushAction: "none",
		title: ""
	};
	const cameraInactiveSettings = { command: "camera", behavior: "toggle", title: "" };
	const sceneSettings = { targetMode: "slot", target: "1", scene: "1", mode: "toggle", title: "" };
	const mixerSettings = { command: "layout", layout: "1", title: "" };
	const ptzKeySettings = {
		scope: "guest",
		targetMode: "slot",
		target: "1",
		control: "zoom",
		mode: "relative",
		direction: "positive",
		value: "0.1",
		title: ""
	};
	const customSettings = { action: "getDetails", title: "Runtime", awaitCallback: true };

	appear("ninja.vdo.streamdeck.connection", "connection", "Keypad", {}, 0);
	appear("ninja.vdo.streamdeck.select-guest", "select", "Keypad", selectSettings, 0);
	appear("ninja.vdo.streamdeck.guest-command", "guest-mic", "Keypad", guestMicSettings, 1);
	appear("ninja.vdo.streamdeck.local-control", "local-mic", "Keypad", localMicSettings, 2);
	appear("ninja.vdo.streamdeck.local-control", "local-camera-inactive", "Keypad", cameraInactiveSettings, 3);
	appear("ninja.vdo.streamdeck.guest-scene", "guest-scene", "Keypad", sceneSettings, 4);
	appear("ninja.vdo.streamdeck.mixer-control", "mixer", "Keypad", mixerSettings, 5);
	appear("ninja.vdo.streamdeck.ptz-key", "ptz-key", "Keypad", ptzKeySettings, 6);
	appear("ninja.vdo.streamdeck.custom-command", "custom", "Keypad", customSettings, 7);
	appear("ninja.vdo.streamdeck.value-dial", "guest-volume", "Encoder", volumeSettings, 0);
	appear("ninja.vdo.streamdeck.ptz-dial", "guest-ptz", "Encoder", ptzSettings, 1);

	await waitFor(
		() => hasOutput("connection", "setTitle", payload => payload.title === "Director\n2 streams"),
		"connected page identity rendering"
	);
	await waitFor(
		() => hasOutput("select", "setTitle", payload => payload.title === "Select\nG1"),
		"fixed G1 selection rendering"
	);
	await waitFor(
		() => hasOutput("guest-volume", "setFeedback", payload => feedbackValue(payload) === "100%"),
		"guest volume readback rendering"
	);

	keyDown("ninja.vdo.streamdeck.select-guest", "select", selectSettings, 0);
	await waitFor(() => hasOutput("select", "setState", payload => payload.state === 1), "G1 selected state");
	assert.ok(hasEvent("select", "showOk"), "Select Guest should acknowledge a valid fixed target");

	const initialDetailsRequests = apiRequests.filter(request => request.action === "getDetails").length;
	keyDown("ninja.vdo.streamdeck.connection", "connection", {}, 0);
	await waitFor(
		() => apiRequests.filter(request => request.action === "getDetails").length > initialDetailsRequests,
		"connection status refresh"
	);
	await waitFor(() => hasEvent("connection", "showOk"), "connection status success feedback");

	keyDown("ninja.vdo.streamdeck.guest-command", "guest-mic", guestMicSettings, 1);
	await waitFor(
		() => apiRequests.some(request => request.action === "mic" && request.target === "1" && request.value === "toggle"),
		"guest mic HTTP command"
	);
	await waitFor(() => hasEvent("guest-mic", "showOk"), "guest mic success feedback");

	keyDown("ninja.vdo.streamdeck.local-control", "local-mic", localMicSettings, 2);
	await waitFor(
		() => apiRequests.some(request => request.action === "mic" && request.target === "toggle"),
		"local mic HTTP command"
	);
	await waitFor(() => hasEvent("local-mic", "showOk"), "local mic success feedback");

	const cameraRequestsBefore = apiRequests.filter(request => request.action === "camera").length;
	keyDown("ninja.vdo.streamdeck.local-control", "local-camera-inactive", cameraInactiveSettings, 3);
	await waitFor(() => hasEvent("local-camera-inactive", "showAlert"), "inactive local camera warning");
	assert.equal(
		apiRequests.filter(request => request.action === "camera").length,
		cameraRequestsBefore,
		"Inactive camera control must not send a command"
	);

	keyDown("ninja.vdo.streamdeck.guest-scene", "guest-scene", sceneSettings, 4);
	await waitFor(
		() => apiRequests.some(request => request.action === "addScene" && request.target === "1" && request.value === "1"),
		"guest scene command"
	);
	await waitFor(() => hasEvent("guest-scene", "showOk"), "guest scene success feedback");

	keyDown("ninja.vdo.streamdeck.mixer-control", "mixer", mixerSettings, 5);
	await waitFor(
		() => apiRequests.some(request => request.action === "layout" && request.target === "1"),
		"mixer layout command"
	);
	await waitFor(() => hasEvent("mixer", "showOk"), "mixer success feedback");

	keyDown("ninja.vdo.streamdeck.ptz-key", "ptz-key", ptzKeySettings, 6);
	await waitFor(
		() => apiRequests.some(request => request.action === "ptzZoom" && request.target === "1" && request.value === "0.1"),
		"guest PTZ key command"
	);
	await waitFor(() => hasEvent("ptz-key", "showOk"), "guest PTZ key success feedback");

	const customDetailsRequests = apiRequests.filter(request => request.action === "getDetails").length;
	keyDown("ninja.vdo.streamdeck.custom-command", "custom", customSettings, 7);
	await waitFor(
		() => apiRequests.filter(request => request.action === "getDetails").length > customDetailsRequests,
		"custom command delivery"
	);
	await waitFor(() => hasEvent("custom", "showOk"), "custom command success feedback");

	dialRotate("ninja.vdo.streamdeck.value-dial", "guest-volume", volumeSettings, 1, 0);
	await waitFor(
		() => apiRequests.some(request => request.action === "volume" && request.target === "1" && request.value === "105"),
		"guest volume dial HTTP delivery"
	);
	await waitFor(
		() => hasOutput("guest-volume", "setFeedback", payload => feedbackValue(payload) === "105%"),
		"guest volume 105 feedback"
	);
	await waitFor(() => contextSettings.get("guest-volume")?.value === "105", "guest volume settings persistence", 2500);
	await delay(500);
	const latestVolumeTitle = feedbackValue(latestOutput("guest-volume", "setFeedback")?.payload || {});
	assert.match(
		latestVolumeTitle,
		/105%/,
		`Polled VDO state must not snap guest volume back to media volume; latest title was ${JSON.stringify(latestVolumeTitle)}`
	);
	assert.equal(apiSocketMessages.some(message => message.action === "volume"), false, "Volume must use reliable HTTP while WS is open");

	dialDown("ninja.vdo.streamdeck.value-dial", "guest-volume", contextSettings.get("guest-volume"), 0);
	await waitFor(
		() => apiRequests.filter(request => request.action === "volume" && request.target === "1" && request.value === "100").length >= 1,
		"guest volume reset command"
	);
	await waitFor(() => contextSettings.get("guest-volume")?.value === "100", "guest volume reset persistence", 2500);

	dialRotate("ninja.vdo.streamdeck.ptz-dial", "guest-ptz", ptzSettings, 1, 1);
	await waitFor(
		() => apiRequests.some(request => request.action === "ptzZoom" && request.target === "1" && request.value === "0.05"),
		"guest PTZ dial HTTP delivery"
	);
	await waitFor(
		() => hasOutput("guest-ptz", "setFeedback", payload => feedbackValue(payload) === "Up"),
		"guest PTZ visible direction feedback"
	);
	assert.equal(apiSocketMessages.some(message => message.action === "ptzZoom"), false, "PTZ increments must use HTTP while WS is open");

	assert.ok(apiSocketMessages.some(message => message.join === apiKey), "Plugin should still join the live update WebSocket");
	console.log("streamdeck bundled runtime integration passed: every action type, polling, keys, dials, persistence, readback, and transport");
} catch (error) {
	throw new Error(`${error instanceof Error ? error.message : String(error)}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
} finally {
	if (child.exitCode === null) child.kill();
	for (const client of streamDeckServer.clients) client.terminate();
	for (const client of apiWebSockets.clients) client.terminate();
	await closeWebSocketServer(streamDeckServer);
	apiWebSockets.close();
	await closeHttpServer(apiServer);
	await rm(isolatedRoot, { recursive: true, force: true });
}

function sendToPlugin(message) {
	if (!streamDeckSocket) throw new Error("Stream Deck runtime socket is not connected");
	streamDeckSocket.send(JSON.stringify(message));
}

function appear(action, context, controller, settings, column) {
	contextSettings.set(context, settings);
	sendToPlugin({
		action,
		context,
		device: "runtime-device",
		event: "willAppear",
		payload: { controller, coordinates: { column, row: 0 }, isInMultiAction: false, settings }
	});
}

function keyDown(action, context, settings, column) {
	sendToPlugin({
		action,
		context,
		device: "runtime-device",
		event: "keyDown",
		payload: { controller: "Keypad", coordinates: { column, row: 0 }, isInMultiAction: false, settings, state: 0, userDesiredState: 0 }
	});
}

function dialRotate(action, context, settings, ticks, column) {
	sendToPlugin({
		action,
		context,
		device: "runtime-device",
		event: "dialRotate",
		payload: { controller: "Encoder", coordinates: { column, row: 0 }, settings, ticks, pressed: false }
	});
}

function dialDown(action, context, settings, column) {
	sendToPlugin({
		action,
		context,
		device: "runtime-device",
		event: "dialDown",
		payload: { controller: "Encoder", coordinates: { column, row: 0 }, settings }
	});
}

function hasEvent(context, event) {
	return streamDeckMessages.some(message => message.context === context && message.event === event);
}

function hasOutput(context, event, predicate) {
	return streamDeckMessages.some(message => message.context === context && message.event === event && predicate(message.payload || {}));
}

function latestOutput(context, event) {
	return streamDeckMessages.findLast(message => message.context === context && message.event === event);
}

function feedbackValue(payload) {
	return String(payload?.payload?.value || payload?.value || "");
}

async function waitFor(predicate, label, timeoutMs = 5000) {
	const started = Date.now();
	while (!predicate()) {
		if (child.exitCode !== null) {
			throw new Error(`Plugin exited before ${label} with code ${child.exitCode}`);
		}
		if (Date.now() - started > timeoutMs) {
			throw new Error(`Timed out waiting for ${label}`);
		}
		await delay(20);
	}
}

function delay(milliseconds) {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function listen(server) {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
}

function onceListening(server) {
	return new Promise((resolve, reject) => {
		server.once("listening", resolve);
		server.once("error", reject);
	});
}

function closeWebSocketServer(server) {
	return new Promise(resolve => server.close(resolve));
}

function closeHttpServer(server) {
	return new Promise(resolve => server.close(resolve));
}
