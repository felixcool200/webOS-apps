"use strict";

const test = require("node:test");
const assert = require("node:assert");
const SettingsLogic = require("../app/settings-logic.js");

test("choice settings offer the TV's active values, including the current one", () => {
  const response = { values: { arrayExt: [{ value: "on" }, { value: "off" }, { value: "auto", active: false }, { value: "max", visible: false }] } };
  assert.deepStrictEqual(SettingsLogic.allowedValues(response, "on", null), ["on", "off"]);
  assert.deepStrictEqual(SettingsLogic.allowedValues(response, "eco", null), ["eco", "on", "off"]);
  assert.deepStrictEqual(SettingsLogic.allowedValues(response, "on", ["off", "on"]), ["off", "on"]);
  assert.deepStrictEqual(SettingsLogic.allowedValues(null, "on", null), ["on"]);
});

test("stepping a setting stays within its range or list", () => {
  const range = { kind: "range", min: 0, max: 100, step: 5 };
  assert.strictEqual(SettingsLogic.nextValue(range, { value: 50 }, 1), 55);
  assert.strictEqual(SettingsLogic.nextValue(range, { value: 98 }, 1), 100);
  assert.strictEqual(SettingsLogic.nextValue(range, { value: 2 }, -1), 0);
  const choice = { kind: "choice" };
  assert.strictEqual(SettingsLogic.nextValue(choice, { value: "b", values: ["a", "b", "c"] }, 1), "c");
  assert.strictEqual(SettingsLogic.nextValue(choice, { value: "c", values: ["a", "b", "c"] }, 1), "c");
  assert.strictEqual(SettingsLogic.nextValue(choice, { value: "a", values: ["a", "b", "c"] }, -1), "a");
  assert.strictEqual(SettingsLogic.nextValue(choice, { value: "a", values: [] }, 1), undefined);
  assert.strictEqual(SettingsLogic.nextValue(choice, undefined, 1), undefined);
});

const SPECS = {
  pictureMode: { kind: "choice" }, backlight: { kind: "range", min: 0, max: 100, step: 5 },
  energySaving: { kind: "choice" }, soundMode: { kind: "choice" }, quickStartMode: { kind: "choice", order: ["off", "on"] }
};
const CHOICES = ["pictureMode", "energySaving", "soundMode", "quickStartMode"];
const values = (...list) => ({ values: { arrayExt: list.map((value) => ({ value })) } });
const replies = () => [
  { settings: { pictureMode: "normal", backlight: "100", energySaving: "auto" } }, { settings: { soundMode: "standard" } },
  { settings: { quickStartMode: "on" } }, values("normal", "vivid"), values("auto", "off"), values("standard", "movie"), values("on", "off")
];

test("a load fills in values and the choices on offer, with ranges as numbers", () => {
  const { state, failed } = SettingsLogic.applyReadings(SPECS, {}, replies(), {}, CHOICES);
  assert.strictEqual(failed, null);
  assert.strictEqual(state.backlight.value, 100, "the TV reports \"100\"; it must compare equal to 100");
  assert.deepStrictEqual(state.pictureMode.values, ["normal", "vivid"]);
  assert.deepStrictEqual(state.quickStartMode.values, ["off", "on"]);
  assert.strictEqual(SettingsLogic.nextValue(SPECS.backlight, state.backlight, 1), state.backlight.value, "no step past the maximum");
});

test("one failed read leaves the rest of Settings working", () => {
  const read = replies();
  read[4] = new Error("Unknown key energySaving");
  read[1] = new Error("No response");
  const { state, failed } = SettingsLogic.applyReadings(SPECS, {}, read, {}, CHOICES);
  assert.match(failed.message, /No response/);
  assert.strictEqual(state.backlight.value, 100);
  assert.deepStrictEqual(state.energySaving.values, ["auto"], "only the current value without the TV's list");
  assert.strictEqual(state.soundMode, undefined, "sound wasn't read");
  assert.deepStrictEqual(state.pictureMode.values, ["normal", "vivid"]);
});

test("a setting changed while a load ran keeps its new value", () => {
  const before = { backlight: { value: 80 } };
  const { state } = SettingsLogic.applyReadings(SPECS, before, replies(), { backlight: true }, CHOICES);
  assert.strictEqual(state.backlight.value, 80);
  assert.strictEqual(state.pictureMode.value, "normal");
  assert.strictEqual(before.backlight.value, 80, "the old state isn't changed in place");
});
