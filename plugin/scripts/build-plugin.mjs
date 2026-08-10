import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const outfile = join(process.cwd(), "ninja.vdo.streamdeck.sdPlugin", "bin", "plugin.js");

await mkdir(dirname(outfile), { recursive: true });
await build({
	entryPoints: [join(process.cwd(), "src", "plugin.ts")],
	outfile,
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	banner: {
		js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
	},
	logLevel: "info",
});
