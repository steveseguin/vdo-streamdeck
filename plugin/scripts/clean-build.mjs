import { rm } from "node:fs/promises";
import { join } from "node:path";

const bundleRoot = join(process.cwd(), "ninja.vdo.streamdeck.sdPlugin");
const generatedPaths = ["bin", "imgs", "ui", "logs", "manifest.json"];

for (const item of generatedPaths) {
	await rm(join(bundleRoot, item), { recursive: true, force: true });
}
