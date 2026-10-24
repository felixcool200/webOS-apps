"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const Theme = require("../../../shared/theme.js");

const splashes = path.join(__dirname, "..", "app", "splashes");

// An 8-bit RGB PNG's size and pixels (RGB bytes, row by row).
function decode(file) {
  const data = fs.readFileSync(file);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  assert.deepStrictEqual([data[24], data[25]], [8, 2], "8-bit RGB");
  const parts = [];
  for (let at = 8; at < data.length; at += 12 + data.readUInt32BE(at)) {
    if (data.toString("ascii", at + 4, at + 8) === "IDAT") { parts.push(data.subarray(at + 8, at + 8 + data.readUInt32BE(at))); }
  }
  const filtered = zlib.inflateSync(Buffer.concat(parts));
  const row = width * 3;
  const pixels = Buffer.alloc(row * height);
  for (let y = 0; y < height; y += 1) {
    const type = filtered[y * (row + 1)];
    for (let i = 0; i < row; i += 1) {
      const left = i >= 3 ? pixels[y * row + i - 3] : 0;
      const up = y > 0 ? pixels[(y - 1) * row + i] : 0;
      const upLeft = i >= 3 && y > 0 ? pixels[(y - 1) * row + i - 3] : 0;
      const guess = left + up - upLeft;
      const paeth = Math.abs(guess - left) <= Math.abs(guess - up) && Math.abs(guess - left) <= Math.abs(guess - upLeft) ? left
        : Math.abs(guess - up) <= Math.abs(guess - upLeft) ? up : upLeft;
      const predicted = [0, left, up, (left + up) >> 1, paeth][type];
      pixels[y * row + i] = (filtered[y * (row + 1) + 1 + i] + predicted) & 255;
    }
  }
  return { width, height, pixels };
}

test("every background has a 1280x720 splash in its page colour, for Home to copy when a theme is chosen", () => {
  for (const background of Theme.BACKGROUNDS) {
    const { width, height, pixels } = decode(path.join(splashes, background.id + ".png"));
    assert.deepStrictEqual([width, height], [1280, 720], background.id);
    const middle = (360 * width + 640) * 3;
    const page = [1, 3, 5].map((start) => parseInt(background.bg.slice(start, start + 2), 16));
    assert.deepStrictEqual(Array.from(pixels.subarray(middle, middle + 3)), page, background.id + "'s middle has no glow");
  }
});

test("the default splash every app starts with is the first background's", () => {
  assert.ok(fs.readFileSync(path.join(__dirname, "..", "..", "..", "shared", "splash.png"))
    .equals(fs.readFileSync(path.join(splashes, Theme.BACKGROUNDS[0].id + ".png"))));
});
