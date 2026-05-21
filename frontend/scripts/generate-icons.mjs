/**
 * Minimal PNG icon generator.
 * Creates a chat-bubble icon on a dark background without any dependencies.
 * Uses Node.js built-in zlib for PNG compression.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

// Accent color (orange-red): oklch(71.2% 0.194 13.428) ≈ #D45D3D
const BG_R = 0x1a;
const BG_G = 0x1b;
const BG_B = 0x1e;
const ACCENT_R = 0xd4;
const ACCENT_G = 0x5d;
const ACCENT_B = 0x3d;

function generateIcon(size) {
  // Create raw pixel buffer (RGBA)
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Normalize coordinates to [-1, 1]
      const nx = (x / size) * 2 - 1;
      const ny = (y / size) * 2 - 1;

      // Chat bubble: rounded rect shape
      const bubbleCx = 0;
      const bubbleCy = 0.05;
      const bubbleRx = 0.65;
      const bubbleRy = 0.45;
      const cornerR = 0.28;

      // Tail triangle pointing bottom-left
      const tailIn = isInsideBubble(nx, ny, bubbleCx, bubbleCy, bubbleRx, bubbleRy, cornerR);
      const tailTriangle = isInsideTail(nx, ny);

      if (tailIn || tailTriangle) {
        pixels[idx] = ACCENT_R;
        pixels[idx + 1] = ACCENT_G;
        pixels[idx + 2] = ACCENT_B;
        pixels[idx + 3] = 255;
      } else {
        pixels[idx] = BG_R;
        pixels[idx + 1] = BG_G;
        pixels[idx + 2] = BG_B;
        pixels[idx + 3] = 255;
      }
    }
  }

  // Apply filter byte (0 = None) at start of each scanline
  const rawData = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    rawData[y * (1 + size * 4)] = 0; // filter: None
    pixels.copy(rawData, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }

  // Compress
  const compressed = deflateSync(rawData);

  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = createIHDR(size, size);

  // IDAT
  const idat = createChunk("IDAT", compressed);

  // IEND
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function isInsideBubble(nx, ny, cx, cy, rx, ry, cr) {
  // Transform to bubble-center coordinates
  const dx = Math.abs(nx - cx);
  const dy = Math.abs(ny - cy);

  // Outside the rectangle + corner radius
  if (dx > rx || dy > ry) return false;

  // Inside the inner region (not in corner zone)
  if (dx < rx - cr || dy < ry - cr) return true;

  // Corner check: distance from corner center
  const cornerDx = dx - (rx - cr);
  const cornerDy = dy - (ry - cr);
  return cornerDx * cornerDx + cornerDy * cornerDy <= cr * cr;
}

function isInsideTail(nx, ny) {
  // Triangle pointing down-left from bubble bottom-left
  const tx = nx + 0.55;
  const ty = ny - 0.3;

  if (tx < -0.25 || tx > 0 || ty < 0 || ty > 0.25) return false;

  // Diagonal check
  return ty <= 0.25 + tx; // tx is negative, so this creates the triangle shape
}

function createIHDR(width, height) {
  const buf = Buffer.alloc(13);
  buf.writeUInt32BE(width, 0);
  buf.writeUInt32BE(height, 4);
  buf[8] = 8;  // bit depth
  buf[9] = 6;  // color type: RGBA
  buf[10] = 0; // compression
  buf[11] = 0; // filter
  buf[12] = 0; // interlace
  return createChunk("IHDR", buf);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBytes = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBytes, data]));

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBytes, data, crcBuf]);
}

// CRC32 for PNG chunks
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate both icons
for (const size of [192, 512]) {
  const png = generateIcon(size);
  const path = join(publicDir, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`Generated ${path} (${png.length} bytes)`);
}
