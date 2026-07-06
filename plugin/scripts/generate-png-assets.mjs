import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

let SIZE = 144;
const assets = {
	category: { bg: [18, 21, 27], fg: [53, 208, 127], mark: "grid" },
	connection: { bg: [20, 24, 32], fg: [56, 189, 248], mark: "link" },
	custom: { bg: [26, 30, 40], fg: [245, 158, 11], mark: "bolt" },
	guest: { bg: [20, 24, 32], fg: [99, 102, 241], mark: "person" },
	local: { bg: [20, 24, 32], fg: [53, 208, 127], mark: "screen" },
	mixer: { bg: [18, 23, 33], fg: [53, 208, 127], mark: "mixer" },
	"mixer-off": { bg: [18, 23, 33], fg: [71, 85, 105], mark: "mixer-off" },
	"mixer-on": { bg: [16, 107, 63], fg: [255, 255, 255], mark: "mixer-on" },
	ptz: { bg: [18, 23, 33], fg: [56, 189, 248], mark: "cross" },
	scene: { bg: [18, 23, 33], fg: [168, 85, 247], mark: "layers" },
	select: { bg: [20, 24, 32], fg: [250, 204, 21], mark: "target" },
	"state-neutral": { bg: [31, 36, 48], fg: [148, 163, 184], mark: "dash" },
	"state-off": { bg: [42, 23, 28], fg: [239, 68, 68], mark: "x" },
	"state-on": { bg: [16, 107, 63], fg: [255, 255, 255], mark: "check" },
	value: { bg: [18, 23, 33], fg: [34, 197, 94], mark: "dial" }
};

for (const [name, config] of Object.entries(assets)) {
	const pixels = createCanvas(SIZE, SIZE, config.bg);
	drawRoundedRect(pixels, 8, 8, 128, 128, 22, config.bg);
	drawMark(pixels, config.mark, config.fg);
	await writePng(join(process.cwd(), "imgs", name + ".png"), pixels, SIZE, SIZE);
	await writePng(join(process.cwd(), "imgs", name + "@2x.png"), scalePixels(pixels, SIZE, SIZE, 2), SIZE * 2, SIZE * 2);
}

// Plugin icon: Stream Deck preferences/marketplace requires PNG at 256x256 and 512x512 (@2x).
{
	const bg = [20, 23, 31];
	const fg = [53, 208, 127];
	SIZE = 256;
	const pixels = createCanvas(SIZE, SIZE, bg);
	drawRoundedRect(pixels, 39, 75, 135, 96, 18, fg);
	drawPolygon(pixels, [[174, 103], [224, 75], [224, 171], [174, 142]], fg);
	drawRect(pixels, 68, 107, 68, 32, bg);
	await writePng(join(process.cwd(), "imgs", "plugin.png"), pixels, SIZE, SIZE);
	await writePng(join(process.cwd(), "imgs", "plugin@2x.png"), scalePixels(pixels, SIZE, SIZE, 2), SIZE * 2, SIZE * 2);
	SIZE = 144;
}

function createCanvas(width, height, color) {
	const pixels = new Uint8Array(width * height * 4);
	for (let i = 0; i < pixels.length; i += 4) {
		pixels[i] = color[0];
		pixels[i + 1] = color[1];
		pixels[i + 2] = color[2];
		pixels[i + 3] = 255;
	}
	return pixels;
}

function drawMark(pixels, mark, color) {
	if (mark === "camera") {
		drawRoundedRect(pixels, 22, 42, 76, 54, 10, color);
		drawPolygon(pixels, [[98, 58], [126, 42], [126, 96], [98, 80]], color);
		drawRect(pixels, 38, 60, 38, 18, [20, 23, 31]);
		return;
	}
	if (mark === "screen") {
		drawRoundedRect(pixels, 28, 36, 88, 58, 8, color);
		drawRect(pixels, 40, 48, 64, 34, [20, 24, 32]);
		drawRect(pixels, 64, 94, 16, 18, color);
		drawRect(pixels, 48, 112, 48, 8, color);
		return;
	}
	if (mark === "person") {
		drawCircle(pixels, 72, 50, 21, color);
		drawRoundedRect(pixels, 34, 80, 76, 42, 20, color);
		return;
	}
	if (mark === "scene" || mark === "layers") {
		drawPolygon(pixels, [[72, 24], [122, 52], [72, 80], [22, 52]], color);
		drawPolygon(pixels, [[72, 58], [122, 86], [72, 114], [22, 86]], color);
		drawPolygon(pixels, [[72, 74], [122, 102], [72, 130], [22, 102]], [210, 180, 255]);
		return;
	}
	if (mark === "target") {
		drawRing(pixels, 72, 72, 42, 7, color);
		drawRing(pixels, 72, 72, 22, 6, color);
		drawRect(pixels, 69, 24, 6, 96, color);
		drawRect(pixels, 24, 69, 96, 6, color);
		return;
	}
	if (mark === "cross") {
		drawRect(pixels, 66, 22, 12, 100, color);
		drawRect(pixels, 22, 66, 100, 12, color);
		drawTriangle(pixels, 72, 18, 58, 36, 86, 36, color);
		drawTriangle(pixels, 72, 126, 58, 108, 86, 108, color);
		drawTriangle(pixels, 18, 72, 36, 58, 36, 86, color);
		drawTriangle(pixels, 126, 72, 108, 58, 108, 86, color);
		return;
	}
	if (mark === "dial") {
		drawRing(pixels, 72, 72, 43, 10, color);
		drawLine(pixels, 72, 72, 101, 43, color, 9);
		drawCircle(pixels, 72, 72, 10, color);
		return;
	}
	if (mark === "link") {
		drawRing(pixels, 54, 72, 26, 9, color);
		drawRing(pixels, 90, 72, 26, 9, color);
		drawRect(pixels, 52, 66, 40, 12, color);
		return;
	}
	if (mark === "bolt") {
		drawPolygon(pixels, [[81, 18], [40, 80], [68, 80], [58, 126], [104, 58], [75, 58]], color);
		return;
	}
	if (mark === "grid") {
		for (let y = 34; y <= 86; y += 30) {
			for (let x = 34; x <= 86; x += 30) {
				drawRoundedRect(pixels, x, y, 24, 24, 5, color);
			}
		}
		return;
	}
	if (mark === "mixer") {
		const muted = [15, 23, 42];
		drawRoundedRect(pixels, 24, 26, 42, 38, 7, color);
		drawRoundedRect(pixels, 78, 26, 42, 38, 7, [96, 165, 250]);
		drawRoundedRect(pixels, 24, 80, 42, 38, 7, [168, 85, 247]);
		drawRoundedRect(pixels, 78, 80, 42, 38, 7, [250, 204, 21]);
		drawRect(pixels, 35, 45, 20, 6, muted);
		drawRect(pixels, 89, 45, 20, 6, muted);
		drawRect(pixels, 35, 99, 20, 6, muted);
		drawRect(pixels, 89, 99, 20, 6, muted);
		drawRing(pixels, 72, 72, 13, 5, [255, 255, 255]);
		return;
	}
	if (mark === "mixer-off") {
		drawRoundedRect(pixels, 24, 26, 42, 38, 7, color);
		drawRoundedRect(pixels, 78, 26, 42, 38, 7, [51, 65, 85]);
		drawRoundedRect(pixels, 24, 80, 42, 38, 7, [51, 65, 85]);
		drawRoundedRect(pixels, 78, 80, 42, 38, 7, color);
		drawRing(pixels, 72, 72, 13, 5, [148, 163, 184]);
		return;
	}
	if (mark === "mixer-on") {
		const muted = [16, 107, 63];
		drawRoundedRect(pixels, 24, 26, 42, 38, 7, color);
		drawRoundedRect(pixels, 78, 26, 42, 38, 7, [191, 219, 254]);
		drawRoundedRect(pixels, 24, 80, 42, 38, 7, [221, 214, 254]);
		drawRoundedRect(pixels, 78, 80, 42, 38, 7, [254, 240, 138]);
		drawRect(pixels, 35, 45, 20, 6, muted);
		drawRect(pixels, 89, 45, 20, 6, muted);
		drawRect(pixels, 35, 99, 20, 6, muted);
		drawRect(pixels, 89, 99, 20, 6, muted);
		drawRing(pixels, 72, 72, 13, 5, [255, 255, 255]);
		return;
	}
	if (mark === "check") {
		drawLine(pixels, 34, 75, 62, 101, color, 13);
		drawLine(pixels, 62, 101, 112, 42, color, 13);
		return;
	}
	if (mark === "x") {
		drawLine(pixels, 40, 40, 104, 104, color, 13);
		drawLine(pixels, 104, 40, 40, 104, color, 13);
		return;
	}
	drawRect(pixels, 36, 66, 72, 12, color);
}

function drawRoundedRect(pixels, x, y, width, height, radius, color) {
	for (let py = y; py < y + height; py += 1) {
		for (let px = x; px < x + width; px += 1) {
			const dx = px < x + radius ? x + radius - px : px >= x + width - radius ? px - (x + width - radius - 1) : 0;
			const dy = py < y + radius ? y + radius - py : py >= y + height - radius ? py - (y + height - radius - 1) : 0;
			if (dx * dx + dy * dy <= radius * radius || dx === 0 || dy === 0) {
				setPixel(pixels, px, py, color);
			}
		}
	}
}

function drawRect(pixels, x, y, width, height, color) {
	for (let py = y; py < y + height; py += 1) {
		for (let px = x; px < x + width; px += 1) {
			setPixel(pixels, px, py, color);
		}
	}
}

function drawCircle(pixels, cx, cy, radius, color) {
	for (let y = cy - radius; y <= cy + radius; y += 1) {
		for (let x = cx - radius; x <= cx + radius; x += 1) {
			if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius) {
				setPixel(pixels, x, y, color);
			}
		}
	}
}

function drawRing(pixels, cx, cy, radius, thickness, color) {
	const inner = radius - thickness;
	for (let y = cy - radius; y <= cy + radius; y += 1) {
		for (let x = cx - radius; x <= cx + radius; x += 1) {
			const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
			if (d <= radius * radius && d >= inner * inner) {
				setPixel(pixels, x, y, color);
			}
		}
	}
}

function drawLine(pixels, x1, y1, x2, y2, color, width) {
	const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
	for (let i = 0; i <= steps; i += 1) {
		const t = steps === 0 ? 0 : i / steps;
		const x = Math.round(x1 + (x2 - x1) * t);
		const y = Math.round(y1 + (y2 - y1) * t);
		drawCircle(pixels, x, y, Math.floor(width / 2), color);
	}
}

function drawTriangle(pixels, x1, y1, x2, y2, x3, y3, color) {
	drawPolygon(pixels, [[x1, y1], [x2, y2], [x3, y3]], color);
}

function drawPolygon(pixels, points, color) {
	const minX = Math.floor(Math.min(...points.map(point => point[0])));
	const maxX = Math.ceil(Math.max(...points.map(point => point[0])));
	const minY = Math.floor(Math.min(...points.map(point => point[1])));
	const maxY = Math.ceil(Math.max(...points.map(point => point[1])));
	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			if (pointInPolygon(x, y, points)) {
				setPixel(pixels, x, y, color);
			}
		}
	}
}

function pointInPolygon(x, y, points) {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
		const xi = points[i][0];
		const yi = points[i][1];
		const xj = points[j][0];
		const yj = points[j][1];
		const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersect) {
			inside = !inside;
		}
	}
	return inside;
}

function setPixel(pixels, x, y, color) {
	if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
		return;
	}
	const index = (y * SIZE + x) * 4;
	pixels[index] = color[0];
	pixels[index + 1] = color[1];
	pixels[index + 2] = color[2];
	pixels[index + 3] = 255;
}

function scalePixels(pixels, width, height, scale) {
	const scaled = new Uint8Array(width * scale * height * scale * 4);
	const scaledWidth = width * scale;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const source = (y * width + x) * 4;
			for (let sy = 0; sy < scale; sy += 1) {
				for (let sx = 0; sx < scale; sx += 1) {
					const target = ((y * scale + sy) * scaledWidth + x * scale + sx) * 4;
					scaled[target] = pixels[source];
					scaled[target + 1] = pixels[source + 1];
					scaled[target + 2] = pixels[source + 2];
					scaled[target + 3] = pixels[source + 3];
				}
			}
		}
	}
	return scaled;
}

async function writePng(path, pixels, width, height) {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y += 1) {
		const row = y * (width * 4 + 1);
		raw[row] = 0;
		Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(raw, row + 1);
	}

	const chunks = [
		chunk("IHDR", ihdr(width, height)),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0))
	];
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]));
}

function ihdr(width, height) {
	const buffer = Buffer.alloc(13);
	buffer.writeUInt32BE(width, 0);
	buffer.writeUInt32BE(height, 4);
	buffer[8] = 8;
	buffer[9] = 6;
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
