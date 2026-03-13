/**
 * Icon generator for ISW English PWA
 * Usage: node generate-icons.js
 * Requires: npm install sharp
 */
const fs = require("fs");
const path = require("path");

async function generateIcons() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.error("sharp not installed. Run: npm install sharp --save-dev");
    process.exit(1);
  }

  const svgPath = path.join(__dirname, "www", "icons", "icon.svg");
  const svgBuffer = fs.readFileSync(svgPath);
  const outDir = path.join(__dirname, "www", "icons");

  const sizes = [
    { name: "favicon-16.png", size: 16 },
    { name: "favicon-32.png", size: 32 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 },
  ];

  for (const { name, size } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, name));
    console.log(`Generated: ${name} (${size}x${size})`);
  }

  // Maskable icons (with 20% padding for safe zone)
  for (const size of [192, 512]) {
    const padding = Math.floor(size * 0.1);
    const innerSize = size - padding * 2;
    const bg = Buffer.from(
      `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#4f46e5"/></svg>`,
    );
    const icon = await sharp(svgBuffer)
      .resize(innerSize, innerSize)
      .png()
      .toBuffer();
    await sharp(bg)
      .composite([{ input: icon, left: padding, top: padding }])
      .png()
      .toFile(path.join(outDir, `icon-maskable-${size}.png`));
    console.log(`Generated: icon-maskable-${size}.png`);
  }

  // Favicon ICO (use 32px PNG as favicon)
  fs.copyFileSync(
    path.join(outDir, "favicon-32.png"),
    path.join(__dirname, "www", "favicon.png"),
  );
  console.log("Copied: favicon.png");

  // OG Image (1200x630)
  const ogBg = Buffer.from(
    `<svg width="1200" height="630">
      <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4f46e5"/><stop offset="50%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="#ec4899"/>
      </linearGradient></defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <text x="600" y="280" font-family="Arial" font-size="80" font-weight="bold" fill="white" text-anchor="middle">ISW English</text>
      <text x="600" y="380" font-family="Arial" font-size="36" fill="rgba(255,255,255,0.85)" text-anchor="middle">실전 영어회화 1000문장 학습</text>
    </svg>`,
  );
  await sharp(ogBg).png().toFile(path.join(outDir, "og-image.png"));
  console.log("Generated: og-image.png");

  console.log("\nAll icons generated successfully!");
}

generateIcons().catch(console.error);
