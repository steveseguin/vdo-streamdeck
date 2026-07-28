/**
 * Renders every icon in `icon-set.mjs` to SVG and to anti-aliased PNG.
 *
 * The raster path supersamples each shape inside its own bounding box, so
 * circles, rings, arcs, and diagonals get real edge coverage instead of the
 * hard pixel steps a nearest-neighbour rasteriser produces. Each `@2x` file is
 * rendered natively at its own size rather than upscaled, so it carries twice
 * the detail rather than twice the pixels.
 *
 * Deliberately dependency-free: the plugin build has to work offline and in CI
 * without a native image toolchain.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { ACTION_ICONS, KEY_ICONS } from "./icon-set.mjs";

/** Sub-samples per axis for pixels that straddle a shape edge. */
const SAMPLES = 8;
const DEG = Math.PI / 180;

const imageDir = join(process.cwd(), "imgs");
const actionIconDir = join(imageDir, "actions");
let written = 0;

for (const [name, icon] of Object.entries(KEY_ICONS)) {
	await write(join(imageDir, `${name}.svg`), renderSvg(icon));
	for (const [index, width] of icon.raster.entries()) {
		const suffix = index === 0 ? "" : `@${index + 1}x`;
		await write(join(imageDir, `${name}${suffix}.png`), renderPng(icon, width));
	}
}

for (const [name, icon] of Object.entries(ACTION_ICONS)) {
	await write(join(actionIconDir, `${name}.svg`), renderSvg(icon));
}

console.log(`Generated ${written} icon files in imgs/.`);

async function write(path, contents) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents);
	written += 1;
}

/* -------------------------------------------------------------- vector ---- */

function renderSvg(icon) {
	const body = icon.shapes.map(shape => `  ${svgShape(shape)}`).join("\n");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.size} ${icon.size}">\n${body}\n</svg>\n`;
}

function svgShape(shape) {
	const fill = `fill="${shape.fill}"`;
	switch (shape.type) {
		case "rect": {
			const radius = shape.r ? ` rx="${num(shape.r)}"` : "";
			return `<rect x="${num(shape.x)}" y="${num(shape.y)}" width="${num(shape.w)}" height="${num(shape.h)}"${radius} ${fill}/>`;
		}
		case "circle":
			return `<circle cx="${num(shape.cx)}" cy="${num(shape.cy)}" r="${num(shape.r)}" ${fill}/>`;
		case "ring":
			return `<circle cx="${num(shape.cx)}" cy="${num(shape.cy)}" r="${num(shape.r)}" fill="none" stroke="${shape.fill}" stroke-width="${num(shape.width)}"/>`;
		case "arc": {
			const [x1, y1] = polar(shape.cx, shape.cy, shape.r, shape.from);
			const [x2, y2] = polar(shape.cx, shape.cy, shape.r, shape.to);
			const largeArc = shape.to - shape.from > 180 ? 1 : 0;
			const cap = shape.cap === "round" ? ` stroke-linecap="round"` : "";
			const d = `M ${num(x1)} ${num(y1)} A ${num(shape.r)} ${num(shape.r)} 0 ${largeArc} 1 ${num(x2)} ${num(y2)}`;
			return `<path d="${d}" fill="none" stroke="${shape.fill}" stroke-width="${num(shape.width)}"${cap}/>`;
		}
		case "polygon":
			return `<polygon points="${shape.points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ")}" ${fill}/>`;
		case "line": {
			const cap = shape.cap === "round" ? ` stroke-linecap="round"` : "";
			return `<line x1="${num(shape.x1)}" y1="${num(shape.y1)}" x2="${num(shape.x2)}" y2="${num(shape.y2)}" stroke="${shape.fill}" stroke-width="${num(shape.width)}"${cap}/>`;
		}
		default:
			throw new Error(`Unsupported shape type: ${shape.type}`);
	}
}

function num(value) {
	return Number(value.toFixed(3)).toString();
}

function polar(cx, cy, r, degrees) {
	return [cx + r * Math.cos(degrees * DEG), cy + r * Math.sin(degrees * DEG)];
}

/* -------------------------------------------------------------- raster ---- */

function renderPng(icon, size) {
	const scale = size / icon.size;
	// Straight (non-premultiplied) RGBA in 0..1, composited source-over.
	const canvas = new Float64Array(size * size * 4);

	for (const shape of icon.shapes) {
		const color = parseColor(shape.fill);
		const [minX, minY, maxX, maxY] = pixelBounds(shape, scale, size);
		for (let y = minY; y < maxY; y += 1) {
			for (let x = minX; x < maxX; x += 1) {
				const alpha = coverage(shape, x, y, scale);
				if (alpha > 0) {
					blend(canvas, (y * size + x) * 4, color, alpha);
				}
			}
		}
	}

	const pixels = new Uint8Array(size * size * 4);
	for (let i = 0; i < pixels.length; i += 1) {
		pixels[i] = Math.round(Math.min(1, Math.max(0, canvas[i])) * 255);
	}
	return encodePng(pixels, size, size);
}

function blend(canvas, offset, color, alpha) {
	const dstA = canvas[offset + 3];
	const outA = alpha + dstA * (1 - alpha);
	if (outA <= 0) {
		return;
	}
	for (let channel = 0; channel < 3; channel += 1) {
		const src = color[channel] * alpha;
		const dst = canvas[offset + channel] * dstA * (1 - alpha);
		canvas[offset + channel] = (src + dst) / outA;
	}
	canvas[offset + 3] = outA;
}

/**
 * Coverage of one pixel by one shape. Pixels that are wholly inside or wholly
 * outside resolve from five probes; only edge pixels pay for supersampling.
 */
function coverage(shape, x, y, scale) {
	const center = contains(shape, (x + 0.5) / scale, (y + 0.5) / scale);
	if (
		center === contains(shape, (x + 0.02) / scale, (y + 0.02) / scale) &&
		center === contains(shape, (x + 0.98) / scale, (y + 0.02) / scale) &&
		center === contains(shape, (x + 0.02) / scale, (y + 0.98) / scale) &&
		center === contains(shape, (x + 0.98) / scale, (y + 0.98) / scale)
	) {
		return center ? 1 : 0;
	}

	let hits = 0;
	for (let sy = 0; sy < SAMPLES; sy += 1) {
		for (let sx = 0; sx < SAMPLES; sx += 1) {
			if (contains(shape, (x + (sx + 0.5) / SAMPLES) / scale, (y + (sy + 0.5) / SAMPLES) / scale)) {
				hits += 1;
			}
		}
	}
	return hits / (SAMPLES * SAMPLES);
}

function contains(shape, x, y) {
	switch (shape.type) {
		case "rect":
			return inRoundedRect(x, y, shape.x, shape.y, shape.w, shape.h, shape.r || 0);
		case "circle":
			return distanceSquared(x, y, shape.cx, shape.cy) <= shape.r * shape.r;
		case "ring":
			return inAnnulus(x, y, shape.cx, shape.cy, shape.r, shape.width);
		case "arc":
			return inArc(x, y, shape);
		case "polygon":
			return inPolygon(x, y, shape.points);
		case "line":
			return inSegment(x, y, shape);
		default:
			throw new Error(`Unsupported shape type: ${shape.type}`);
	}
}

function inRoundedRect(x, y, rectX, rectY, width, height, radius) {
	if (x < rectX || y < rectY || x > rectX + width || y > rectY + height) {
		return false;
	}
	if (radius <= 0) {
		return true;
	}
	const innerLeft = rectX + radius;
	const innerRight = rectX + width - radius;
	const innerTop = rectY + radius;
	const innerBottom = rectY + height - radius;
	const nearestX = Math.min(Math.max(x, innerLeft), innerRight);
	const nearestY = Math.min(Math.max(y, innerTop), innerBottom);
	if (x === nearestX || y === nearestY) {
		return true;
	}
	return distanceSquared(x, y, nearestX, nearestY) <= radius * radius;
}

function inAnnulus(x, y, cx, cy, radius, width) {
	const distance = Math.sqrt(distanceSquared(x, y, cx, cy));
	return distance >= radius - width / 2 && distance <= radius + width / 2;
}

function inArc(x, y, shape) {
	if (shape.cap === "round") {
		const half = shape.width / 2;
		for (const angle of [shape.from, shape.to]) {
			const [capX, capY] = polar(shape.cx, shape.cy, shape.r, angle);
			if (distanceSquared(x, y, capX, capY) <= half * half) {
				return true;
			}
		}
	}
	if (!inAnnulus(x, y, shape.cx, shape.cy, shape.r, shape.width)) {
		return false;
	}
	let angle = Math.atan2(y - shape.cy, x - shape.cx) / DEG;
	while (angle < shape.from) {
		angle += 360;
	}
	return angle <= shape.to;
}

function inPolygon(x, y, points) {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
		const [xi, yi] = points[i];
		const [xj, yj] = points[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

function inSegment(x, y, shape) {
	const dx = shape.x2 - shape.x1;
	const dy = shape.y2 - shape.y1;
	const lengthSquared = dx * dx + dy * dy;
	let t = lengthSquared === 0 ? 0 : ((x - shape.x1) * dx + (y - shape.y1) * dy) / lengthSquared;
	if (shape.cap === "round") {
		t = Math.min(1, Math.max(0, t));
	} else if (t < 0 || t > 1) {
		return false;
	}
	const half = shape.width / 2;
	return distanceSquared(x, y, shape.x1 + t * dx, shape.y1 + t * dy) <= half * half;
}

function distanceSquared(x, y, px, py) {
	return (x - px) * (x - px) + (y - py) * (y - py);
}

function pixelBounds(shape, scale, size) {
	let minX;
	let minY;
	let maxX;
	let maxY;

	switch (shape.type) {
		case "rect":
			[minX, minY, maxX, maxY] = [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h];
			break;
		case "circle":
			[minX, minY, maxX, maxY] = [shape.cx - shape.r, shape.cy - shape.r, shape.cx + shape.r, shape.cy + shape.r];
			break;
		case "ring":
		case "arc": {
			const reach = shape.r + shape.width / 2;
			[minX, minY, maxX, maxY] = [shape.cx - reach, shape.cy - reach, shape.cx + reach, shape.cy + reach];
			break;
		}
		case "polygon": {
			const xs = shape.points.map(point => point[0]);
			const ys = shape.points.map(point => point[1]);
			[minX, minY, maxX, maxY] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
			break;
		}
		case "line": {
			const half = shape.width / 2;
			minX = Math.min(shape.x1, shape.x2) - half;
			minY = Math.min(shape.y1, shape.y2) - half;
			maxX = Math.max(shape.x1, shape.x2) + half;
			maxY = Math.max(shape.y1, shape.y2) + half;
			break;
		}
		default:
			throw new Error(`Unsupported shape type: ${shape.type}`);
	}

	return [
		Math.max(0, Math.floor(minX * scale)),
		Math.max(0, Math.floor(minY * scale)),
		Math.min(size, Math.ceil(maxX * scale) + 1),
		Math.min(size, Math.ceil(maxY * scale) + 1)
	];
}

function parseColor(hex) {
	const value = hex.replace("#", "");
	return [
		parseInt(value.slice(0, 2), 16) / 255,
		parseInt(value.slice(2, 4), 16) / 255,
		parseInt(value.slice(4, 6), 16) / 255
	];
}

/* ----------------------------------------------------------------- png ---- */

function encodePng(pixels, width, height) {
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y += 1) {
		const row = y * (stride + 1);
		raw[row] = 0;
		Buffer.from(pixels.buffer, y * stride, stride).copy(raw, row + 1);
	}

	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", ihdr(width, height)),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0))
	]);
}

function ihdr(width, height) {
	const buffer = Buffer.alloc(13);
	buffer.writeUInt32BE(width, 0);
	buffer.writeUInt32BE(height, 4);
	buffer[8] = 8; // bit depth
	buffer[9] = 6; // truecolour with alpha
	return buffer;
}

function chunk(type, data) {
	const name = Buffer.from(type, "ascii");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
	return Buffer.concat([length, name, data, crc]);
}

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc ^= byte;
		for (let i = 0; i < 8; i += 1) {
			crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}
