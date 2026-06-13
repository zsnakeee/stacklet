// Generates a branded Stacklet app icon (dark rounded square + 3 teal "stack"
// bars) as build/icon.png (256x256) and build/icon.ico — pure Node, no deps.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const S = 256;
const buildDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');

// Colors (RGBA)
const BG = [18, 26, 34, 255]; // #121a22 surface
const TEAL = [45, 212, 170, 255]; // #2dd4aa
const ACCENT = [96, 165, 250, 255]; // #60a5fa

function insideRoundRect(x, y, x0, y0, w, h, r) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  // corner circles
  const corners = [
    [x0 + r, y0 + r],
    [x1 - r, y0 + r],
    [x0 + r, y1 - r],
    [x1 - r, y1 - r],
  ];
  const inCornerBox =
    (x < x0 + r || x > x1 - r) && (y < y0 + r || y > y1 - r);
  if (!inCornerBox) return true;
  for (const [cx, cy] of corners) {
    if (Math.abs(x - cx) <= r && Math.abs(y - cy) <= r) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
    }
  }
  return false;
}

function buildPixels() {
  const px = Buffer.alloc(S * S * 4, 0);
  // Three stacked bars (top→bottom), top accent, others teal.
  const bars = [
    { y: 64, color: ACCENT },
    { y: 112, color: TEAL },
    { y: 160, color: TEAL },
  ];
  const barX = 56;
  const barW = 144;
  const barH = 32;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      let c = null;
      if (insideRoundRect(x, y, 16, 16, S - 32, S - 32, 48)) c = BG;
      for (const bar of bars) {
        if (insideRoundRect(x, y, barX, bar.y, barW, barH, 10)) c = bar.color;
      }
      if (c) {
        px[i] = c[0];
        px[i + 1] = c[1];
        px[i + 2] = c[2];
        px[i + 3] = c[3];
      }
    }
  }
  return px;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(px) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256 → 0
  entry[1] = 0; // height 256 → 0
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuf.length, 8); // size
  entry.writeUInt32LE(6 + 16, 12); // offset
  return Buffer.concat([header, entry, pngBuf]);
}

fs.mkdirSync(buildDir, { recursive: true });
const png = encodePng(buildPixels());
fs.writeFileSync(path.join(buildDir, 'icon.png'), png);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), encodeIco(png));
console.log('[icon] wrote build/icon.png + build/icon.ico');
