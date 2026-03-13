/**
 * gen-icons.js
 * Generates PNG icons for the ISW English app using only Node.js built-ins (zlib + Buffer).
 * No external dependencies required.
 */

"use strict";

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// CRC32 table (pre-computed for speed)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// PNG encoder
// ---------------------------------------------------------------------------
function makePNG(width, height, getPixel) {
  const channels = 4; // RGBA
  const rawData = Buffer.alloc(height * (1 + width * channels));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      rawData[offset++] = r & 0xff;
      rawData[offset++] = g & 0xff;
      rawData[offset++] = b & 0xff;
      rawData[offset++] = a & 0xff;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  function chunk(type, data) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function hexToRGB(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// ---------------------------------------------------------------------------
// Gradient background
// indigo #4f46e5 → purple #7c3aed → pink #ec4899 (diagonal)
// ---------------------------------------------------------------------------
const C_INDIGO = hexToRGB("#4f46e5");
const C_PURPLE = hexToRGB("#7c3aed");
const C_PINK = hexToRGB("#ec4899");

function gradientColor(x, y, w, h) {
  // Diagonal t: 0 at top-left, 1 at bottom-right
  const t = (x / (w - 1) + y / (h - 1)) / 2;
  // Two-segment: 0-0.5 → indigo→purple, 0.5-1 → purple→pink
  let r, g, b;
  if (t <= 0.5) {
    const s = t * 2;
    r = lerp(C_INDIGO[0], C_PURPLE[0], s);
    g = lerp(C_INDIGO[1], C_PURPLE[1], s);
    b = lerp(C_INDIGO[2], C_PURPLE[2], s);
  } else {
    const s = (t - 0.5) * 2;
    r = lerp(C_PURPLE[0], C_PINK[0], s);
    g = lerp(C_PURPLE[1], C_PINK[1], s);
    b = lerp(C_PURPLE[2], C_PINK[2], s);
  }
  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

// ---------------------------------------------------------------------------
// Anti-aliased circle fill helper (returns alpha 0-255)
// ---------------------------------------------------------------------------
function circleAlpha(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Smooth edge over 1px
  return clamp(Math.round((r + 0.5 - dist) * 255), 0, 255);
}

// Anti-aliased arc stroke helper
function arcStrokeAlpha(px, py, cx, cy, r, strokeHalf) {
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ringDist = Math.abs(dist - r);
  return clamp(Math.round((strokeHalf + 0.5 - ringDist) * 255), 0, 255);
}

// ---------------------------------------------------------------------------
// Rounded-rectangle mask (returns 0 or 255)
// ---------------------------------------------------------------------------
function roundRectAlpha(px, py, rx, ry, rw, rh, cornerR) {
  // Clamp to inner rect corners
  const cx = clamp(px, rx + cornerR, rx + rw - cornerR);
  const cy = clamp(py, ry + cornerR, ry + rh - cornerR);
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return clamp(Math.round((cornerR + 0.5 - dist) * 255), 0, 255);
}

// ---------------------------------------------------------------------------
// Blend a foreground color (with alpha) onto a background pixel
// ---------------------------------------------------------------------------
function blendOver(bg, fg, fgAlpha) {
  const a = fgAlpha / 255;
  return [
    Math.round(lerp(bg[0], fg[0], a)),
    Math.round(lerp(bg[1], fg[1], a)),
    Math.round(lerp(bg[2], fg[2], a)),
    255,
  ];
}

// ---------------------------------------------------------------------------
// Draw headphone icon on a pixel buffer (width × height Float32 RGBA array)
// Returns a getPixel(x,y) function.
// ---------------------------------------------------------------------------
function makeIconPixel(size, padding) {
  // padding: extra safe-zone fraction for maskable icons (0 for normal)
  const scale = size / 512; // design is in 512-space
  // We work in design-space coordinates for drawing

  return function getPixel(px, py) {
    // Map pixel to design space
    const dx = px / scale;
    const dy = py / scale;

    // Base gradient background
    let [r, g, b, a] = gradientColor(px, py, size, size);

    // -----------------------------------------------------------------------
    // 1. Rounded rectangle background (white card) — only for non-maskable
    // -----------------------------------------------------------------------
    // (Skipped for simplicity — headphones on gradient look great)

    // -----------------------------------------------------------------------
    // 2. Headphone band arc
    //    Center of arc: (256, 310) in design space, radius 130
    //    Only draw TOP half (angle 180°-360°, i.e. y < centerY)
    // -----------------------------------------------------------------------
    const bandCX = 256,
      bandCY = 310,
      bandR = 130;
    const bandStroke = 12; // half-stroke width

    // Check if pixel is in the arc region (upper semicircle)
    {
      const ax = dx - bandCX;
      const ay = dy - bandCY;
      const dist = Math.sqrt(ax * ax + ay * ay);
      const ringDist = Math.abs(dist - bandR);
      if (dy < bandCY && ringDist < bandStroke + 1) {
        const alpha = clamp(
          Math.round((bandStroke + 0.5 - ringDist) * 255),
          0,
          255,
        );
        if (alpha > 0) {
          [r, g, b, a] = blendOver([r, g, b], [255, 255, 255], alpha);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 3. Left ear cup: centered around (145, 310), size 52×80, corner r=14
    // -----------------------------------------------------------------------
    {
      const ex = 119,
        ey = 260,
        ew = 52,
        eh = 90,
        er = 14;
      const alpha = roundRectAlpha(dx, dy, ex, ey, ew, eh, er);
      if (alpha > 0) {
        [r, g, b, a] = blendOver([r, g, b], [255, 255, 255], alpha);
      }
    }

    // -----------------------------------------------------------------------
    // 4. Right ear cup: centered around (367, 310), size 52×80, corner r=14
    // -----------------------------------------------------------------------
    {
      const ex = 341,
        ey = 260,
        ew = 52,
        eh = 90,
        er = 14;
      const alpha = roundRectAlpha(dx, dy, ex, ey, ew, eh, er);
      if (alpha > 0) {
        [r, g, b, a] = blendOver([r, g, b], [255, 255, 255], alpha);
      }
    }

    // -----------------------------------------------------------------------
    // 5. Sound waves (right side)
    //    Three arcs centered at (362, 305) with increasing radii
    // -----------------------------------------------------------------------
    const waveCX = 362,
      waveCY = 305;
    const waves = [
      { r: 42, sw: 4, opacity: 230 },
      { r: 72, sw: 3.5, opacity: 180 },
      { r: 102, sw: 3, opacity: 120 },
    ];

    for (const wave of waves) {
      const ax = dx - waveCX;
      const ay = dy - waveCY;
      const dist = Math.sqrt(ax * ax + ay * ay);
      const ringDist = Math.abs(dist - wave.r);
      // Only right side (positive x from waveCX) and constrained angle
      const angle = Math.atan2(ay, ax); // -π to π
      // Draw arc from -45° to +45° (-π/4 to π/4)
      if (ax > 0 && Math.abs(angle) < Math.PI / 4 && ringDist < wave.sw + 0.5) {
        const edgeAlpha = clamp(
          Math.round((wave.sw + 0.5 - ringDist) * 255),
          0,
          255,
        );
        const finalAlpha = Math.round((edgeAlpha * wave.opacity) / 255);
        if (finalAlpha > 0) {
          [r, g, b, a] = blendOver([r, g, b], [255, 255, 255], finalAlpha);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 6. ISW text — rendered as pixel blocks for letters
    //    Baseline y=420, centered at x=256
    //    Using a simple 5×7 pixel font scaled up
    // -----------------------------------------------------------------------
    {
      const textY = 380; // top of text block in design space
      const letterH = 60;
      const letterW = 42;
      const gap = 10;
      const totalW = 3 * letterW + 2 * gap;
      const textX = 256 - totalW / 2;

      // Simple 5-column × 7-row bitmap font (1=on, 0=off)
      // I
      const glyphI = [
        [1, 1, 1, 1, 1],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [1, 1, 1, 1, 1],
      ];
      // S
      const glyphS = [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0],
        [1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
      ];
      // W
      const glyphW = [
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 1, 0, 1, 1],
        [1, 0, 0, 0, 1],
      ];

      const glyphs = [glyphI, glyphS, glyphW];
      const colW = letterW / 5;
      const rowH = letterH / 7;

      for (let gi = 0; gi < 3; gi++) {
        const gx = textX + gi * (letterW + gap);
        const glyph = glyphs[gi];
        for (let row = 0; row < 7; row++) {
          for (let col = 0; col < 5; col++) {
            if (!glyph[row][col]) continue;
            const px0 = gx + col * colW;
            const py0 = textY + row * rowH;
            const px1 = px0 + colW;
            const py1 = py0 + rowH;
            if (dx >= px0 && dx < px1 && dy >= py0 && dy < py1) {
              // Anti-alias edges slightly
              const ex = Math.min(dx - px0, px1 - dx);
              const ey = Math.min(dy - py0, py1 - dy);
              const edgeA = clamp(Math.min(ex, ey) * 4, 0, 1);
              const alpha = Math.round(lerp(200, 255, edgeA));
              [r, g, b, a] = blendOver([r, g, b], [255, 255, 255], alpha);
            }
          }
        }
      }
    }

    return [r, g, b, a];
  };
}

// ---------------------------------------------------------------------------
// OG image pixel function (1200×630 — landscape banner)
// ---------------------------------------------------------------------------
function makeOGPixel(w, h) {
  return function getPixel(px, py) {
    // Gradient background
    let [r, g, b, a] = gradientColor(px, py, w, h);

    // Draw icon in left-center region
    const iconSize = 300;
    const iconX = Math.round(w * 0.5 - iconSize / 2); // centered horizontally
    const iconY = Math.round(h * 0.5 - iconSize / 2) - 40;

    const lx = px - iconX;
    const ly = py - iconY;

    if (lx >= 0 && lx < iconSize && ly >= 0 && ly < iconSize) {
      // Delegate to icon pixel function
      const iconFn = makeIconPixel(iconSize, 0);
      return iconFn(lx, ly);
    }

    // "ISW English" text below icon (very simple: just show app name area)
    // (For OG, we keep it simple with just the icon centered on gradient)

    return [r, g, b, a];
  };
}

// ---------------------------------------------------------------------------
// Generate & save all icons
// ---------------------------------------------------------------------------
const OUT_DIR = path.join(__dirname, "..", "www", "icons");
fs.mkdirSync(OUT_DIR, { recursive: true });

const TASKS = [
  {
    name: "icon-192.png",
    w: 192,
    h: 192,
    fn: () => makeIconPixel(192, 0),
  },
  {
    name: "icon-512.png",
    w: 512,
    h: 512,
    fn: () => makeIconPixel(512, 0),
  },
  {
    name: "icon-maskable-512.png",
    w: 512,
    h: 512,
    // Maskable: scale design to 80% to add 10% safe zone on each side
    fn: () => {
      const inner = 512 * 0.8;
      const offset = 512 * 0.1;
      const innerFn = makeIconPixel(inner, 0);
      return function (px, py) {
        const lx = px - offset;
        const ly = py - offset;
        if (lx >= 0 && lx < inner && ly >= 0 && ly < inner) {
          return innerFn(lx, ly);
        }
        // Gradient fill for padding area
        return gradientColor(px, py, 512, 512);
      };
    },
  },
  {
    name: "apple-touch-icon.png",
    w: 180,
    h: 180,
    fn: () => makeIconPixel(180, 0),
  },
  {
    name: "favicon.ico", // actually a 32×32 PNG
    w: 32,
    h: 32,
    fn: () => makeIconPixel(32, 0),
  },
];

console.log("Generating icons in:", OUT_DIR);

for (const task of TASKS) {
  process.stdout.write(`  ${task.name} (${task.w}×${task.h})... `);
  const pixelFn = task.fn();
  const buf = makePNG(task.w, task.h, pixelFn);
  fs.writeFileSync(path.join(OUT_DIR, task.name), buf);
  console.log(`OK (${buf.length} bytes)`);
}

// OG image (1200×630)
{
  const w = 1200,
    h = 630;
  process.stdout.write(`  og-image.png (${w}×${h})... `);
  const buf = makePNG(w, h, makeOGPixel(w, h));
  // Save to www root for social sharing
  const ogPath = path.join(__dirname, "..", "www", "og-image.png");
  fs.writeFileSync(ogPath, buf);
  console.log(`OK (${buf.length} bytes)`);
}

console.log("\nAll icons generated successfully!");
