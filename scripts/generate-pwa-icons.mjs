import {deflateSync} from "node:zlib";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(root, "icons");
mkdirSync(outputDirectory, {recursive: true});

const customIconPath = join(outputDirectory, "custom-app-icon.png");
if (existsSync(customIconPath)) {
  throw new Error(
    "Existe icons/custom-app-icon.png. Usa scripts/generate-custom-pwa-icons.ps1 para no reemplazar el logotipo personalizado.",
  );
}

const palette = {
  navy: [15, 23, 42, 255],
  orange: [249, 115, 22, 255],
  white: [255, 255, 255, 255],
  sky: [186, 230, 253, 255],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createIcon(size, safePadding = 0.1) {
  const pixels = Buffer.alloc(size * size * 4);
  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
    pixels.set(color, offset);
  };
  const rectangle = (x, y, width, height, color) => {
    for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
      for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) setPixel(px, py, color);
    }
  };
  const circle = (cx, cy, radius, color) => {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(x, y, color);
      }
    }
  };
  const triangle = (top, left, right, color) => {
    const area = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    for (let y = Math.floor(top.y); y <= Math.ceil(Math.max(left.y, right.y)); y += 1) {
      for (let x = Math.floor(left.x); x <= Math.ceil(right.x); x += 1) {
        const point = {x, y};
        const first = area(top, left, point);
        const second = area(left, right, point);
        const third = area(right, top, point);
        if ((first >= 0 && second >= 0 && third >= 0) || (first <= 0 && second <= 0 && third <= 0)) setPixel(x, y, color);
      }
    }
  };

  rectangle(0, 0, size, size, palette.navy);
  const inset = size * safePadding;
  const center = size / 2;
  const badgeRadius = (size - inset * 2) / 2;
  circle(center, center, badgeRadius, palette.orange);
  circle(center, center + size * 0.025, badgeRadius * 0.82, palette.white);

  const buildingWidth = size * 0.46;
  const buildingX = center - buildingWidth / 2;
  const buildingY = size * 0.45;
  rectangle(buildingX, buildingY, buildingWidth, size * 0.26, palette.navy);
  triangle(
    {x: center, y: size * 0.28},
    {x: buildingX - size * 0.055, y: buildingY},
    {x: buildingX + buildingWidth + size * 0.055, y: buildingY},
    palette.navy,
  );
  rectangle(center - size * 0.055, size * 0.575, size * 0.11, size * 0.135, palette.orange);
  rectangle(buildingX + size * 0.06, size * 0.51, size * 0.08, size * 0.075, palette.sky);
  rectangle(buildingX + buildingWidth - size * 0.14, size * 0.51, size * 0.08, size * 0.075, palette.sky);

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, {level: 9})),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync(join(outputDirectory, "app-icon-192.png"), createIcon(192, 0.08));
writeFileSync(join(outputDirectory, "app-icon-512.png"), createIcon(512, 0.08));
writeFileSync(join(outputDirectory, "app-icon-maskable-512.png"), createIcon(512, 0.18));
writeFileSync(join(outputDirectory, "apple-touch-icon.png"), createIcon(180, 0.08));
