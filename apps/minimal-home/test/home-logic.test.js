"use strict";

const test = require("node:test");
const assert = require("node:assert");
const HomeLogic = require("../app/home-logic.js");
const SettingsLogic = require("../app/settings-logic.js");

const app = (id, extra) => Object.assign({ id: id, title: id }, extra);
const ids = (apps) => apps.map((entry) => entry.id);

test("installed apps leave out invisible apps and Home, preferred apps first", () => {
  const listed = [app("tv4"), app("netflix"), app("hidden.service", { visible: false }), app("org.webosbrew.minimalhome"), app("youtube"), app("svt")];
  assert.deepStrictEqual(ids(HomeLogic.sortInstalled(listed, ["youtube", "netflix"], ["org.webosbrew.minimalhome"])),
    ["youtube", "netflix", "tv4", "svt"]);
});

test("the rows follow the saved order, with newly installed apps after it", () => {
  const installed = [app("a"), app("b"), app("c"), app("new")];
  const rows = HomeLogic.arrange(installed, [], [], ["c", "a", "b"]);
  assert.deepStrictEqual(ids(rows.apps), ["c", "a", "b", "new"]);
});

test("hidden apps are left out and counted, tools go to their own row", () => {
  const installed = [app("a"), app("b"), app("tool"), app("gone")];
  const rows = HomeLogic.arrange(installed, ["gone"], ["tool"], []);
  assert.deepStrictEqual(ids(rows.apps), ["a", "b"]);
  assert.deepStrictEqual(ids(rows.tools), ["tool"]);
  assert.strictEqual(rows.hiddenCount, 1);
});

test("the Hidden apps view lists hidden apps by title", () => {
  const installed = [app("x", { title: "Zattoo" }), app("y", { title: "Alexa" }), app("z", { title: "Mail" })];
  assert.deepStrictEqual(ids(HomeLogic.hiddenApps(installed, ["x", "y"])), ["y", "x"]);
});

test("a missing or broken saved list falls back to a copy of the default", () => {
  const fallback = ["a"];
  assert.deepStrictEqual(HomeLogic.parseList(null, fallback), ["a"]);
  assert.deepStrictEqual(HomeLogic.parseList("{oops", fallback), ["a"]);
  assert.deepStrictEqual(HomeLogic.parseList("{\"a\":1}", fallback), ["a"]);
  assert.notStrictEqual(HomeLogic.parseList(null, fallback), fallback);
  assert.deepStrictEqual(HomeLogic.parseList("[\"b\"]", fallback), ["b"]);
});

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
