import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Stream Deck resolves manifest image paths without an extension, so a typo or
 * a stale reference only shows up as a blank key at runtime. These checks pin
 * the manifest to what `npm run assets` actually generates, in both directions:
 * nothing referenced may be missing, and nothing generated may be unreferenced.
 */

type Manifest = {
	Icon: string;
	CategoryIcon: string;
	Actions: Array<{
		UUID: string;
		Icon: string;
		Encoder?: { Icon?: string };
		States: Array<{ Image: string }>;
	}>;
};

const pluginRoot = join(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(pluginRoot, "manifest.json"), "utf8")) as Manifest;

const referenced = new Set<string>([
	manifest.Icon,
	manifest.CategoryIcon,
	...manifest.Actions.flatMap(action => [
		action.Icon,
		...(action.Encoder?.Icon ? [action.Encoder.Icon] : []),
		...action.States.map(state => state.Image)
	])
]);

/** Key images ship at 144px, the marketplace tile at 256px; each doubles at @2x. */
const expectedWidths: Record<string, number> = { "imgs/plugin": 256 };

describe("manifest assets", () => {
	it("references only images that exist", () => {
		for (const path of referenced) {
			expect(path, `${path} should not carry a file extension`).not.toMatch(/\.(png|svg)$/);
			const vector = existsSync(join(pluginRoot, `${path}.svg`));
			const raster = existsSync(join(pluginRoot, `${path}.png`));
			expect(vector || raster, `${path} has neither a .svg nor a .png`).toBe(true);
			if (raster) {
				expect(existsSync(join(pluginRoot, `${path}@2x.png`)), `${path} is missing its @2x file`).toBe(true);
			}
		}
	});

	it("renders every raster image at its expected size", () => {
		for (const path of referenced) {
			const file = join(pluginRoot, `${path}.png`);
			if (!existsSync(file)) {
				continue;
			}
			const width = expectedWidths[path] ?? 144;
			expect(pngSize(file), `${path}.png`).toEqual([width, width]);
			expect(pngSize(join(pluginRoot, `${path}@2x.png`)), `${path}@2x.png`).toEqual([width * 2, width * 2]);
		}
	});

	it("ships no unreferenced images", () => {
		const orphans = [
			...listImages("imgs", ".png").filter(name => !name.endsWith("@2x")),
			...listImages("imgs/actions", ".svg")
		].filter(name => !referenced.has(name));
		expect(orphans, "generated but never referenced by the manifest").toEqual([]);
	});
});

function listImages(directory: string, extension: string): string[] {
	return readdirSync(join(pluginRoot, directory))
		.filter(file => file.endsWith(extension))
		.map(file => `${directory}/${file.slice(0, -extension.length)}`);
}

function pngSize(file: string): [number, number] {
	const header = readFileSync(file).subarray(16, 24);
	return [header.readUInt32BE(0), header.readUInt32BE(4)];
}
