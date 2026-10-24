"use strict";

const test = require("node:test");
const assert = require("node:assert");
const AppearanceLogic = require("../app/appearance-logic.js");
const Theme = require("../../../shared/theme.js");

const night = Theme.PRESETS[0];

test("changing a preset's accent makes a theme of your own and leaves the preset alone", () => {
  const { customs, theme } = AppearanceLogic.withChange([], night, "accent", "#ff8fb1");
  assert.deepStrictEqual(theme, { id: "custom-1", name: "Custom 1", accent: "#ff8fb1", background: "night" });
  assert.deepStrictEqual(customs, [theme]);
  assert.strictEqual(night.accent, "#72d6ff");
});

test("changing your own theme changes it in place", () => {
  const first = AppearanceLogic.withChange([], night, "accent", "#ff8fb1");
  const second = AppearanceLogic.withChange(first.customs, first.theme, "background", "forest");
  assert.strictEqual(second.customs.length, 1);
  assert.deepStrictEqual(second.theme, { id: "custom-1", name: "Custom 1", accent: "#ff8fb1", background: "forest" });
});

test("new themes of your own get the next free number, also after deleting one", () => {
  let state = AppearanceLogic.withChange([], night, "accent", "#ff8fb1");
  state = AppearanceLogic.withChange(state.customs, night, "accent", "#7ee2a8");
  assert.deepStrictEqual(state.customs.map((own) => own.name), ["Custom 1", "Custom 2"]);
  const left = AppearanceLogic.withoutTheme(state.customs, "custom-1");
  assert.strictEqual(AppearanceLogic.withChange(left, night, "accent", "#ecb22e").theme.name, "Custom 3");
});

test("a theme of your own that was lost from the list is kept as a new one when changed", () => {
  const lost = { id: "custom-4", name: "Custom 4", accent: "#ff8fb1", background: "night" };
  const { customs, theme } = AppearanceLogic.withChange([], lost, "background", "forest");
  assert.deepStrictEqual(customs, [theme]);
  assert.strictEqual(theme.background, "forest");
});

test("stepping through a list wraps at both ends", () => {
  assert.strictEqual(AppearanceLogic.step(["a", "b", "c"], "c", 1), "a");
  assert.strictEqual(AppearanceLogic.step(["a", "b", "c"], "a", -1), "c");
  assert.strictEqual(AppearanceLogic.step(["a", "b", "c"], "x", 1), "b", "an unknown value counts as the first");
});

test("saved themes of your own are read back without broken ones", () => {
  const saved = JSON.stringify([{ id: "custom-1", name: "Custom 1", accent: "#ff8fb1", background: "night" }, { id: "x", accent: "red" }]);
  assert.strictEqual(AppearanceLogic.parseCustoms(saved, Theme.isTheme).length, 1);
  assert.deepStrictEqual(AppearanceLogic.parseCustoms("{oops", Theme.isTheme), []);
});
