/**
 * create-icons.js
 * Generates PNG icon files for Style Spy without any npm dependencies.
 * Uses raw PNG binary construction (IHDR, IDAT, IEND chunks).
 * Run: node create-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

// ── Minimal PNG encoder ──────────────────────────────────────────────────────

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function uint32BE(n) {
  return Buffer.from([(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]);
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf    = uint32BE(data.length);
  const crcBuf    = uint32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function encodePNG(width, height, pixels) {
  // pixels: Uint8Array of RGBA values, row by row
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.concat([
    uint32BE(width), uint32BE(height),
    Buffer.from([8, 2, 0, 0, 0]) // 8-bit depth, RGB color type (2), no interlace
    // We'll use RGBA (color type 6) instead:
  ]);
  // Rebuild: color type 6 = RGBA
  const ihdrData = Buffer.concat([
    uint32BE(width), uint32BE(height),
    Buffer.from([8, 6, 0, 0, 0]) // 8-bit, RGBA
  ]);

  // Build raw scanlines with filter byte 0 (None)
  const rawLines = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      row[1 + x * 4 + 0] = pixels[i + 0]; // R
      row[1 + x * 4 + 1] = pixels[i + 1]; // G
      row[1 + x * 4 + 2] = pixels[i + 2]; // B
      row[1 + x * 4 + 3] = pixels[i + 3]; // A
    }
    rawLines.push(row);
  }
  const rawData = Buffer.concat(rawLines);
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// ── Icon Drawing ─────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = 0, g = 0, b = 0, a = 0;

      // Background gradient circle (indigo/violet)
      if (dist < outerR) {
        const t = Math.sqrt((x / size) * (x / size) + (y / size) * (y / size)) / Math.sqrt(2);
        r = Math.round(lerp(129, 99,  t)); // #818cf8 -> #6366f1
        g = Math.round(lerp(140, 102, t));
        b = Math.round(lerp(248, 241, t));
        a = 255;

        // Anti-alias outer edge
        if (dist > outerR - 1.2) {
          a = Math.round(clamp((outerR - dist) / 1.2, 0, 1) * 255);
        }
      }

      // White iris (eyeball)
      const irisR = outerR * 0.38;
      if (dist < irisR && a > 0) {
        const tIris = clamp((irisR - dist) / 1.2, 0, 1);
        r = Math.round(lerp(r, 255, tIris * 0.92));
        g = Math.round(lerp(g, 255, tIris * 0.92));
        b = Math.round(lerp(b, 255, tIris * 0.92));
      }

      // Indigo pupil
      const pupilR = outerR * 0.18;
      if (dist < pupilR && a > 0) {
        const tPupil = clamp((pupilR - dist) / 1.0, 0, 1);
        r = Math.round(lerp(r, 99,  tPupil));
        g = Math.round(lerp(g, 102, tPupil));
        b = Math.round(lerp(b, 241, tPupil));
      }

      // Specular highlight dot (top-right of iris)
      const hx = cx + irisR * 0.32;
      const hy = cy - irisR * 0.32;
      const hdx = x - hx + 0.5;
      const hdy = y - hy + 0.5;
      const hdist = Math.sqrt(hdx * hdx + hdy * hdy);
      if (hdist < outerR * 0.08 && a > 0) {
        const tH = clamp((outerR * 0.08 - hdist) / 0.8, 0, 1);
        r = Math.round(lerp(r, 255, tH * 0.75));
        g = Math.round(lerp(g, 255, tH * 0.75));
        b = Math.round(lerp(b, 255, tH * 0.75));
      }

      const idx = (y * size + x) * 4;
      pixels[idx + 0] = clamp(r, 0, 255);
      pixels[idx + 1] = clamp(g, 0, 255);
      pixels[idx + 2] = clamp(b, 0, 255);
      pixels[idx + 3] = a;
    }
  }

  return pixels;
}

// ── Generate and write icons ─────────────────────────────────────────────────

const sizes = [16, 32, 48, 128];

sizes.forEach((size) => {
  const pixels = drawIcon(size);
  const png    = encodePNG(size, size, pixels);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✓ Written: icons/icon${size}.png (${png.length} bytes)`);
});

console.log('\n✅ All icons generated successfully!');
