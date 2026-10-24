// Renders the splash webOS shows while an app starts (appinfo.json's splashBackground): base.css's
// background in each of shared/theme.js's backgrounds, at 1280x720 (smaller splashes can stay on screen:
// README, "Keeping Minimal Home open"). Writes Minimal Home's app/splashes/<background id>.png, which Home
// copies over the apps' splash.png when a theme is chosen, and shared/splash.png, the default
// background's, which the build puts in every app. Run it after changing base.css's background or
// theme.js's backgrounds. Usage: node scripts/render-splashes.js
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const Theme = require("../shared/theme.js");

const root = path.join(__dirname, "..");
const WIDTH = 1280;
const HEIGHT = 720;
const out = path.join(root, "apps", "minimal-home", "app", "splashes");

function rgba(text) {
  const parts = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(text);
  return { rgb: parts.slice(1, 4).map(Number), alpha: Number(parts[4]) };
}

// base.css's two radial-gradient() glows, as (x, y, rx, ry, end) in pixels: a colour fading to
// see-through at end, a fraction of the way to the edge of the rx by ry ellipse. Listed bottom first.
function glows(background) {
  return [
    { color: rgba(background.glowB), x: WIDTH, y: HEIGHT, rx: 0.55 * WIDTH, ry: 0.65 * HEIGHT, end: 0.72 },
    { color: rgba(background.glowA), x: 0.04 * WIDTH, y: 0, rx: 0.7 * WIDTH, ry: 0.65 * HEIGHT, end: 0.68 }
  ];
}

// The background's pixels as RGB, without the dithering Chrome adds to gradients: smooth pixels keep
// the PNG small.
function draw(background) {
  const page = [1, 3, 5].map((start) => parseInt(background.bg.slice(start, start + 2), 16));
  const layers = glows(background);
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const colour = page.slice();
      for (const glow of layers) {
        const distance = Math.hypot((x + 0.5 - glow.x) / glow.rx, (y + 0.5 - glow.y) / glow.ry);
        const alpha = glow.color.alpha * Math.max(0, 1 - distance / glow.end);
        for (let i = 0; i < 3; i += 1) { colour[i] = glow.color.rgb[i] * alpha + colour[i] * (1 - alpha); }
      }
      for (let i = 0; i < 3; i += 1) { pixels[(y * WIDTH + x) * 3 + i] = Math.round(colour[i]); }
    }
  }
  return pixels;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

// An RGB PNG, every row with the Paeth filter, which suits two-way gradients.
function png(pixels) {
  const row = WIDTH * 3;
  const filtered = Buffer.alloc((row + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    filtered[y * (row + 1)] = 4;
    for (let i = 0; i < row; i += 1) {
      const left = i >= 3 ? pixels[y * row + i - 3] : 0;
      const up = y > 0 ? pixels[(y - 1) * row + i] : 0;
      const upLeft = i >= 3 && y > 0 ? pixels[(y - 1) * row + i - 3] : 0;
      const guess = left + up - upLeft;
      const toLeft = Math.abs(guess - left);
      const toUp = Math.abs(guess - up);
      const toUpLeft = Math.abs(guess - upLeft);
      const predicted = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      filtered[y * (row + 1) + 1 + i] = (pixels[y * row + i] - predicted) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(filtered, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

fs.mkdirSync(out, { recursive: true });
for (const background of Theme.BACKGROUNDS) {
  const file = path.join(out, background.id + ".png");
  fs.writeFileSync(file, png(draw(background)));
  console.log("Rendered " + path.relative(root, file) + " (" + fs.statSync(file).size + " bytes)");
}
fs.copyFileSync(path.join(out, Theme.BACKGROUNDS[0].id + ".png"), path.join(root, "shared", "splash.png"));
console.log("Copied the " + Theme.BACKGROUNDS[0].id + " splash to shared/splash.png");
