"use strict";

const test = require("node:test");
const assert = require("node:assert");
const Theme = require("../theme.js");

test("a theme sets the accent, its rgb parts for tints, and its background's colours", () => {
  assert.deepStrictEqual(Theme.variables({ id: "x", name: "X", accent: "#72d6ff", background: "forest" }), {
    "--accent": "#72d6ff", "--accent-rgb": "114, 214, 255", "--bg": "#06120d",
    "--glow-a": "rgba(22, 110, 72, 0.4)", "--glow-b": "rgba(90, 120, 40, 0.22)"
  });
});

test("only well-formed themes are accepted, so a broken saved theme falls back to the first preset", () => {
  assert.strictEqual(Theme.isTheme(Theme.PRESETS[1]), true);
  assert.strictEqual(Theme.isTheme({ id: "x", name: "X", accent: "red", background: "night" }), false);
  assert.strictEqual(Theme.isTheme({ id: "x", name: "X", accent: "#ffffff", background: "space" }), false);
  assert.strictEqual(Theme.parse("{oops"), null);
});

test("every preset uses a known background and a palette accent", () => {
  Theme.PRESETS.forEach((preset) => {
    assert.ok(Theme.isTheme(preset), preset.id);
    assert.ok(Theme.ACCENTS.some((accent) => accent.color === preset.accent), preset.id + "'s accent is in the palette");
  });
});
