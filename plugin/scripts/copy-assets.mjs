import { copyFile, cp, mkdir } from "node:fs/promises";
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

await cp(join(process.cwd(), "imgs"), join(process.cwd(), "ninja.vdo.streamdeck.sdPlugin/imgs"), {
	recursive: true
});
