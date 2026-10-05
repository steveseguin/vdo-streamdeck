/**
 * Single source of truth for every icon the plugin ships.
 *
 * Each icon is a list of primitive shapes in its own coordinate space. The
 * generator renders the same list two ways, so the vector and raster artwork
 * can never drift apart:
 *
 *   - `imgs/actions/*.svg`  action-list icons (Stream Deck draws these small)
 *   - `imgs/*.svg`          vector source for the key/encoder artwork
 *   - `imgs/*.png`          the key/encoder images the manifest actually loads
 *
 * Shapes: rect, circle, ring, arc, polygon, line. `ring`/`arc` use SVG stroke
 * semantics, so `r` is the centre-line radius and `width` is the thickness.
 * Arc angles are degrees, 0 pointing right and increasing clockwise.
 */

const colors = {
	white: "#ffffff",

	// Key state fields. Dark enough that Stream Deck's white title stays legible.
	greenField: "#0f6b41",
	redField: "#4a1d23",
	slateField: "#1e2532",
	// A step lighter, for keys that are ready rather than inactive.
	readyField: "#252d3d",

	// Corner status badges.
	greenBadge: "#35d07f",
	redBadge: "#f87171",
	slateBadge: "#94a3b8",
	amberBadge: "#fbbf24",

	// Glyphs punched out of the badges.
	greenGlyph: "#06301d",
	redGlyph: "#3a0f14",
	slateGlyph: "#141a24",
	amberGlyph: "#3a2606",

	// Encoder glyphs, matching the manifest StackColor of each dial action.
	sky: "#38bdf8",
	green: "#22c55e",

	// Plugin tile.
	pluginField: "#12161f",
	brand: "#35d07f"
};

const KEY = 144;

/** Every keypad state image places its badge here, clear of the two-line title. */
const badge = { cx: 108, cy: 33, r: 16 };

function field(fill) {
	return { type: "rect", x: 0, y: 0, w: KEY, h: KEY, fill };
}

function badgeDisc(fill) {
	return { type: "circle", cx: badge.cx, cy: badge.cy, r: badge.r, fill };
}

function smallBadgeGlyph(shapes) {
	return shapes.map(shape => {
		const result = { ...shape };
		for (const key of ["x1", "x2"]) if (key in shape) result[key] = badge.cx + (shape[key] - badge.cx) * 0.7;
		for (const key of ["y1", "y2"]) if (key in shape) result[key] = badge.cy + (shape[key] - badge.cy) * 0.7;
		if (shape.width) result.width = shape.width * 0.7;
		if (shape.points) result.points = shape.points.map(([x, y]) => [badge.cx + (x - badge.cx) * 0.7, badge.cy + (y - badge.cy) * 0.7]);
		return result;
	});
}

function checkGlyph(fill) {
	return smallBadgeGlyph([
		{ type: "line", x1: 97.5, y1: 33.5, x2: 104.5, y2: 40.5, width: 6.5, cap: "round", fill },
		{ type: "line", x1: 104.5, y1: 40.5, x2: 119, y2: 25.5, width: 6.5, cap: "round", fill }
	]);
}

function crossGlyph(fill) {
	return smallBadgeGlyph([
		{ type: "line", x1: 99, y1: 24, x2: 117, y2: 42, width: 6.5, cap: "round", fill },
		{ type: "line", x1: 117, y1: 24, x2: 99, y2: 42, width: 6.5, cap: "round", fill }
	]);
}

function ellipsisGlyph(fill) {
	return [-6, 0, 6].map(offset => ({ type: "circle", cx: badge.cx + offset, cy: badge.cy, r: 2.4, fill }));
}

function gridGlyph(fill) {
	const tile = 6;
	const gap = 4;
	const origin = badge.cx - (tile * 2 + gap) / 2;
	const top = badge.cy - (tile * 2 + gap) / 2;
	return [0, 1].flatMap(row =>
		[0, 1].map(column => ({
			type: "rect",
			x: origin + column * (tile + gap),
			y: top + row * (tile + gap),
			w: tile,
			h: tile,
			r: 2.4,
			fill
		}))
	);
}

function boltGlyph(fill) {
	return smallBadgeGlyph([
		{
			type: "polygon",
			points: [
				[111.5, 20],
				[99.5, 34.5],
				[106.5, 34.5],
				[104.5, 46],
				[116.5, 31.5],
				[109.5, 31.5]
			],
			fill
		}
	]);
}

/**
 * Key and encoder artwork. `raster` lists the PNG widths to emit; the second
 * entry becomes the `@2x` file and is rendered natively rather than upscaled.
 */
export const KEY_ICONS = {
	"state-on": {
		size: KEY,
		description: "Connected, or the controlled setting is on",
		raster: [144, 288],
		shapes: [field(colors.greenField), badgeDisc(colors.greenBadge), ...checkGlyph(colors.greenGlyph)]
	},

	"state-off": {
		size: KEY,
		description: "Unavailable, or the controlled setting is off",
		raster: [144, 288],
		shapes: [field(colors.redField), badgeDisc(colors.redBadge), ...crossGlyph(colors.redGlyph)]
	},

	"state-neutral": {
		size: KEY,
		description: "Waiting for the VDO.Ninja page to answer",
		raster: [144, 288],
		shapes: [field(colors.slateField), badgeDisc(colors.slateBadge), ...ellipsisGlyph(colors.slateGlyph)]
	},

	"mixer-on": {
		size: KEY,
		description: "Mixer control active",
		raster: [144, 288],
		shapes: [field(colors.greenField), badgeDisc(colors.greenBadge), ...gridGlyph(colors.greenGlyph)]
	},

	"mixer-off": {
		size: KEY,
		description: "Mixer control inactive",
		raster: [144, 288],
		shapes: [field(colors.slateField), badgeDisc(colors.slateBadge), ...gridGlyph(colors.slateGlyph)]
	},

	"list-field": {
		size: KEY,
		description: "Guests list placeholder until live guests are drawn",
		raster: [144, 288],
		shapes: [field(colors.slateField)]
	},

	custom: {
		size: KEY,
		description: "Custom API command ready to send",
		raster: [144, 288],
		shapes: [field(colors.readyField), badgeDisc(colors.amberBadge), ...boltGlyph(colors.amberGlyph)]
	},

	// Encoder icons sit on the Stream Deck + touch strip, so they stay
	// transparent and let the strip supply its own background.
	ptz: {
		size: KEY,
		description: "PTZ dial glyph",
		raster: [144, 288],
		shapes: [
			{ type: "rect", x: 63, y: 26, w: 18, h: 92, fill: colors.sky },
			{ type: "rect", x: 26, y: 63, w: 92, h: 18, fill: colors.sky },
			{ type: "polygon", points: [[72, 10], [45, 40], [99, 40]], fill: colors.sky },
			{ type: "polygon", points: [[72, 134], [45, 104], [99, 104]], fill: colors.sky },
			{ type: "polygon", points: [[10, 72], [40, 45], [40, 99]], fill: colors.sky },
			{ type: "polygon", points: [[134, 72], [104, 45], [104, 99]], fill: colors.sky }
		]
	},

	value: {
		size: KEY,
		description: "Value dial glyph",
		raster: [144, 288],
		shapes: [
			{ type: "arc", cx: 72, cy: 81, r: 46, width: 15, from: 150, to: 390, cap: "round", fill: colors.green },
			{ type: "line", x1: 72, y1: 81, x2: 99, y2: 54, width: 12, cap: "round", fill: colors.green },
			{ type: "circle", cx: 72, cy: 81, r: 10.5, fill: colors.green }
		]
	},

	plugin: {
		size: 256,
		description: "Marketplace and category tile",
		raster: [256, 512],
		shapes: [
			{ type: "rect", x: 0, y: 0, w: 256, h: 256, r: 56, fill: colors.pluginField },
			{ type: "rect", x: 44, y: 82, w: 120, h: 92, r: 22, fill: colors.brand },
			{ type: "polygon", points: [[170, 106], [214, 80], [214, 176], [170, 150]], fill: colors.brand },
			{ type: "rect", x: 72, y: 108, w: 64, h: 40, r: 8, fill: colors.pluginField }
		]
	}
};

const glyph = colors.white;

/**
 * Action-list icons. Stream Deck renders these at roughly 20px on a dark
 * panel, so every glyph is a single white silhouette on a 24-unit grid with a
 * shared ~2px stroke weight.
 */
export const ACTION_ICONS = {
	// Camera mark, matching the plugin tile.
	category: {
		size: 24,
		shapes: [
			{ type: "rect", x: 2.4, y: 7.2, w: 12.6, h: 9.6, r: 2.4, fill: glyph },
			{ type: "polygon", points: [[15.8, 10], [21.6, 6.8], [21.6, 17.2], [15.8, 14]], fill: glyph }
		]
	},

	// Live signal radiating from the controlled page.
	connection: {
		size: 24,
		shapes: [
			{ type: "circle", cx: 12, cy: 12, r: 2.4, fill: glyph },
			{ type: "arc", cx: 12, cy: 12, r: 6.2, width: 2, from: 305, to: 415, cap: "round", fill: glyph },
			{ type: "arc", cx: 12, cy: 12, r: 6.2, width: 2, from: 125, to: 235, cap: "round", fill: glyph },
			{ type: "arc", cx: 12, cy: 12, r: 10, width: 2, from: 312, to: 408, cap: "round", fill: glyph },
			{ type: "arc", cx: 12, cy: 12, r: 10, width: 2, from: 132, to: 228, cap: "round", fill: glyph }
		]
	},

	// Microphone: the local page's most-used control.
	local: {
		size: 24,
		shapes: [
			{ type: "rect", x: 9.2, y: 2.6, w: 5.6, h: 10.6, r: 2.8, fill: glyph },
			{ type: "arc", cx: 12, cy: 11.4, r: 4.8, width: 2, from: 20, to: 160, cap: "round", fill: glyph },
			{ type: "line", x1: 12, y1: 16.2, x2: 12, y2: 19.8, width: 2, cap: "round", fill: glyph },
			{ type: "line", x1: 8.6, y1: 20.8, x2: 15.4, y2: 20.8, width: 2, cap: "round", fill: glyph }
		]
	},

	// Crosshair: pick the guest other actions follow.
	select: {
		size: 24,
		shapes: [
			{ type: "ring", cx: 12, cy: 12, r: 7.4, width: 2, fill: glyph },
			{ type: "circle", cx: 12, cy: 12, r: 2.3, fill: glyph },
			{ type: "line", x1: 12, y1: 2.2, x2: 12, y2: 5.4, width: 2, cap: "round", fill: glyph },
			{ type: "line", x1: 12, y1: 18.6, x2: 12, y2: 21.8, width: 2, cap: "round", fill: glyph },
			{ type: "line", x1: 2.2, y1: 12, x2: 5.4, y2: 12, width: 2, cap: "round", fill: glyph },
			{ type: "line", x1: 18.6, y1: 12, x2: 21.8, y2: 12, width: 2, cap: "round", fill: glyph }
		]
	},

	guest: {
		size: 24,
		shapes: [
			{ type: "circle", cx: 12, cy: 8, r: 4, fill: glyph },
			{ type: "rect", x: 4.4, y: 14.2, w: 15.2, h: 8.6, r: 4.3, fill: glyph }
		]
	},

	// Roster rows: the live guest list, distinct from a single guest target.
	list: {
		size: 24,
		shapes: [0, 11].flatMap(dy => [
			{ type: "circle", cx: 5.5, cy: 4.6 + dy, r: 2.3, fill: glyph },
			{ type: "rect", x: 2.2, y: 7.8 + dy, w: 6.6, h: 3.6, r: 1.8, fill: glyph },
			{ type: "line", x1: 12, y1: 5.2 + dy, x2: 21.4, y2: 5.2 + dy, width: 2.2, cap: "round", fill: glyph },
			{ type: "line", x1: 12, y1: 9.6 + dy, x2: 18, y2: 9.6 + dy, width: 2.2, cap: "round", fill: glyph }
		])
	},

	// Four-pane scene grid, matching VDO.Ninja's scene controls.
	scene: {
		size: 24,
		shapes: [3, 14].flatMap(x => [3, 14].map(y => ({ type: "rect", x, y, w: 7, h: 7, r: 1, fill: glyph })))
	},

	// Console faders: layouts and slot assignment.
	mixer: {
		size: 24,
		shapes: [
			{ type: "line", x1: 2.6, y1: 6.6, x2: 21.4, y2: 6.6, width: 1.8, cap: "round", fill: glyph },
			{ type: "line", x1: 2.6, y1: 12, x2: 21.4, y2: 12, width: 1.8, cap: "round", fill: glyph },
			{ type: "line", x1: 2.6, y1: 17.4, x2: 21.4, y2: 17.4, width: 1.8, cap: "round", fill: glyph },
			{ type: "rect", x: 14.6, y: 3.8, w: 3.4, h: 5.6, r: 1.5, fill: glyph },
			{ type: "rect", x: 6.2, y: 9.2, w: 3.4, h: 5.6, r: 1.5, fill: glyph },
			{ type: "rect", x: 12.4, y: 14.6, w: 3.4, h: 5.6, r: 1.5, fill: glyph }
		]
	},

	// Four-way arrows, shared by PTZ Key and PTZ Dial.
	ptz: {
		size: 24,
		shapes: [
			{ type: "rect", x: 10.8, y: 5, w: 2.4, h: 14, fill: glyph },
			{ type: "rect", x: 5, y: 10.8, w: 14, h: 2.4, fill: glyph },
			{ type: "polygon", points: [[12, 2.3], [8.3, 7.3], [15.7, 7.3]], fill: glyph },
			{ type: "polygon", points: [[12, 21.7], [8.3, 16.7], [15.7, 16.7]], fill: glyph },
			{ type: "polygon", points: [[2.3, 12], [7.3, 8.3], [7.3, 15.7]], fill: glyph },
			{ type: "polygon", points: [[21.7, 12], [16.7, 8.3], [16.7, 15.7]], fill: glyph }
		]
	},

	// Gauge, deliberately unlike the mixer faders so the two never read alike.
	value: {
		size: 24,
		shapes: [
			{ type: "arc", cx: 12, cy: 12.8, r: 7.8, width: 2.4, from: 150, to: 390, cap: "round", fill: glyph },
			{ type: "line", x1: 12, y1: 12.8, x2: 17.4, y2: 7.9, width: 2.4, cap: "round", fill: glyph },
			{ type: "circle", cx: 12, cy: 12.8, r: 2.1, fill: glyph }
		]
	},

	// Terminal prompt: raw API payloads.
	custom: {
		size: 24,
		shapes: [
			{ type: "line", x1: 6.6, y1: 6.8, x2: 12.6, y2: 12, width: 2.6, cap: "round", fill: glyph },
			{ type: "line", x1: 12.6, y1: 12, x2: 6.6, y2: 17.2, width: 2.6, cap: "round", fill: glyph },
			{ type: "line", x1: 14.8, y1: 17.2, x2: 20.4, y2: 17.2, width: 2.6, cap: "round", fill: glyph }
		]
	}
};

// Command glyphs use the same 24-unit grid as the action-list artwork.
// These stay above the title, so a white label never obscures the symbol.
const line = (x1, y1, x2, y2) => ({ type: "line", x1, y1, x2, y2, width: 2, cap: "round", fill: glyph });
const rect = (x, y, w, h, r = 1) => ({ type: "rect", x, y, w, h, r, fill: glyph });
const ring = (cx, cy, r) => ({ type: "ring", cx, cy, r, width: 2, fill: glyph });
const polygon = points => ({ type: "polygon", points, fill: glyph });
const icon = (...shapes) => ({ size: 24, shapes });
export const COMMAND_ICONS = {
	mic: ACTION_ICONS.local,
	camera: ACTION_ICONS.category,
	speaker: icon(polygon([[3,9],[7,9],[12,5],[12,19],[7,15],[3,15]]),
		{ type: "arc", cx: 11, cy: 12, r: 6, width: 2, from: 310, to: 410, fill: glyph },
		{ type: "arc", cx: 11, cy: 12, r: 10, width: 2, from: 315, to: 405, fill: glyph }),
	record: icon(ring(12,12,9), { type: "circle", cx: 12, cy: 12, r: 5, fill: glyph }),
	display: icon(line(3,4,21,4),line(3,4,3,17),line(21,4,21,17),line(3,17,21,17),line(12,17,12,21),line(8,21,16,21)),
	share: icon(line(3,4,12,4),line(3,4,3,17),line(3,17,21,17),line(21,11,21,17),line(12,17,12,21),line(8,21,16,21),line(12,11,21,2),line(15,2,21,2),line(21,2,21,8)),
	hand: icon(rect(7,9,12,12,5),rect(7,4,2.5,11),rect(10.3,2,2.5,12),rect(13.6,3,2.5,11),rect(17,6,2,10),line(8,17,3,11)),
	keyframe: icon(line(3,4,21,4),line(3,4,3,20),line(21,4,21,20),line(3,20,21,20),polygon([[9,7],[17,12],[9,17]])),
	reload: icon({type:"arc",cx:12,cy:12,r:8,width:2.4,from:30,to:315,fill:glyph},polygon([[19,3],[21,11],[13,8]])),
	// Handset laid flat with its ear and mouth pieces down: the usual "end call" mark.
	hangup: icon({type:"arc",cx:12,cy:17,r:11,width:4.5,from:215,to:325,fill:glyph},polygon([[0.8,9.6],[5.4,8.2],[6.4,13.4],[2,14.6]]),polygon([[23.2,9.6],[18.6,8.2],[17.6,13.4],[22,14.6]])),
	group: icon({type:"circle",cx:8,cy:7,r:3,fill:glyph},{type:"circle",cx:17,cy:8,r:2.5,fill:glyph},rect(2,12,12,9,4),rect(15,13,7,8,3)),
	transfer: icon(line(3,4,10,4),line(3,4,3,20),line(3,20,10,20),line(8,12,21,12),line(16,7,21,12),line(16,17,21,12)),
	activate: icon({type:"circle",cx:8,cy:7,r:3.5,fill:glyph},rect(2,13,11,9,4),line(14,12,17,15),line(17,15,22,8)),
	solo: icon(line(2,3,8,3),line(2,3,2,9),line(16,3,22,3),line(22,3,22,9),line(2,15,2,21),line(2,21,8,21),line(16,21,22,21),line(22,15,22,21),{type:"circle",cx:12,cy:9,r:3,fill:glyph},rect(7,14,10,5,2)),
	talk: icon(line(3,4,21,4),line(3,4,3,16),line(21,4,21,16),line(8,16,21,16),line(3,21,8,16),line(3,16,3,21),line(7,9,17,9)),
	overlay: icon(line(2,3,16,3),line(2,3,2,15),line(2,15,6,15),line(16,3,16,6),line(8,8,22,8),line(8,8,8,21),line(22,8,22,21),line(8,21,22,21)),
	pin: icon(rect(7,2,10,3),polygon([[9,5],[15,5],[16,12],[19,15],[5,15],[8,12]]),line(12,15,12,22)),
	zoom: icon(ring(10,10,6),line(15,15,22,22),line(7,10,13,10),line(10,7,10,13)),
	"pan-left": icon(line(3,12,21,12),line(3,12,10,5),line(3,12,10,19)),
	"pan-right": icon(line(3,12,21,12),line(21,12,14,5),line(21,12,14,19)),
	"tilt-up": icon(line(12,3,12,21),line(12,3,5,10),line(12,3,19,10)),
	"tilt-down": icon(line(12,3,12,21),line(12,21,5,14),line(12,21,19,14)),
	"zoom-out": icon(ring(10,10,6),line(15,15,22,22),line(7,10,13,10)),
	"zoom-absolute": icon(ring(10,10,6),line(15,15,22,22)),
	pan: icon(line(2,12,22,12),line(2,12,7,7),line(2,12,7,17),line(22,12,17,7),line(22,12,17,17)),
	tilt: icon(line(12,2,12,22),line(12,2,7,7),line(12,2,17,7),line(12,22,7,17),line(12,22,17,17)),
	focus: icon(ring(12,12,6),line(2,3,7,3),line(2,3,2,8),line(17,3,22,3),line(22,3,22,8),line(2,16,2,21),line(2,21,7,21),line(17,21,22,21),line(22,16,22,21)),
	exposure: icon(ring(12,12,5),...Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return line(12+8*Math.cos(a),12+8*Math.sin(a),12+10*Math.cos(a),12+10*Math.sin(a));})),
	layout: ACTION_ICONS.scene,
	slot: icon(line(3,3,21,3),line(3,3,3,21),line(21,3,21,21),line(3,21,21,21),line(12,3,12,21),line(3,12,21,12),rect(14,14,5,5,0)),
	volume: ACTION_ICONS.mixer
};

// The field-colored clearance keeps the mute slash readable across solid glyphs.
export const OFF_COMMAND_ICONS = Object.fromEntries(["mic", "camera", "speaker"].map(name => [name, icon(
	...COMMAND_ICONS[name].shapes,
	{ ...line(3, 3, 21, 21), width: 4.5, fill: colors.redField },
	line(3, 3, 21, 21)
)]));
