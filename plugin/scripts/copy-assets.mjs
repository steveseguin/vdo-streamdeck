import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const files = [
  ["manifest.json", "ninja.vdo.streamdeck.sdPlugin/manifest.json"],
  ["ui/global-settings.html", "ninja.vdo.streamdeck.sdPlugin/ui/global-settings.html"],
  ["ui/action-settings.html", "ninja.vdo.streamdeck.sdPlugin/ui/action-settings.html"],
  ["node_modules/qrcode-generator/dist/qrcode.js", "ninja.vdo.streamdeck.sdPlugin/ui/qrcode.js"]
];

for (const [source, destination] of files) {
	const dest = join(process.cwd(), destination);
	await mkdir(dirname(dest), { recursive: true });
	await copyFile(join(process.cwd(), source), dest);
}

const sourceImageDir = join(process.cwd(), "imgs");
const destinationImageDir = join(process.cwd(), "ninja.vdo.streamdeck.sdPlugin/imgs");
await rm(destinationImageDir, { recursive: true, force: true });
await mkdir(destinationImageDir, { recursive: true });

for (const file of await readdir(sourceImageDir)) {
	if (file.endsWith(".png")) {
		await copyFile(join(sourceImageDir, file), join(destinationImageDir, file));
	}
}

const sourceActionIconDir = join(sourceImageDir, "actions");
const destinationActionIconDir = join(destinationImageDir, "actions");
await mkdir(destinationActionIconDir, { recursive: true });

for (const file of await readdir(sourceActionIconDir)) {
	if (file.endsWith(".svg")) {
		await copyFile(join(sourceActionIconDir, file), join(destinationActionIconDir, file));
	}
}
