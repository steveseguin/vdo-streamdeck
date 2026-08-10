import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, "..");
const builtPluginRoot = join(pluginRoot, "ninja.vdo.streamdeck.sdPlugin");
const builtPluginEntry = join(builtPluginRoot, "bin", "plugin.js");

if (!existsSync(builtPluginEntry)) {
	throw new Error("Compiled plugin missing. Run `npm run build` before `npm run test:runtime`.");
}

const isolatedRoot = await mkdtemp(join(tmpdir(), "vdo-streamdeck-runtime-"));
const isolatedPluginRoot = join(isolatedRoot, "ninja.vdo.streamdeck.sdPlugin");
await cp(builtPluginRoot, isolatedPluginRoot, { recursive: true });

const messages = [];
const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise((resolve, reject) => {
	server.once("listening", resolve);
	server.once("error", reject);
});
server.on("connection", socket => {
	socket.on("message", raw => messages.push(JSON.parse(raw.toString())));
});

const port = server.address().port;
const child = spawn(
	process.execPath,
	[
		join(isolatedPluginRoot, "bin", "plugin.js"),
		"-port",
		String(port),
		"-pluginUUID",
		"runtime-plugin",
		"-registerEvent",
		"registerPlugin",
		"-info",
		JSON.stringify({
			application: { language: "en", platform: "windows", platformVersion: "10.0.0", version: "7.5.0" },
			colors: {},
			devicePixelRatio: 2,
			devices: [],
			plugin: { uuid: "ninja.vdo.streamdeck", version: "0.1.3.0" },
		}),
	],
	{
		cwd: isolatedPluginRoot,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
	}
);

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", chunk => (stdout += chunk));
child.stderr.on("data", chunk => (stderr += chunk));

try {
	const started = Date.now();
	while (!messages.some(message => message.event === "registerPlugin" && message.uuid === "runtime-plugin")) {
		if (child.exitCode !== null) {
			throw new Error(`Plugin exited before registration with code ${child.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
		}
		if (Date.now() - started > 5000) {
			throw new Error(`Timed out waiting for plugin registration\nstdout:\n${stdout}\nstderr:\n${stderr}`);
		}
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	console.log("streamdeck plugin isolated runtime smoke passed");
} finally {
	if (child.exitCode === null) child.kill();
	for (const client of server.clients) client.terminate();
	await new Promise(resolve => server.close(resolve));
	await rm(isolatedRoot, { recursive: true, force: true });
}
