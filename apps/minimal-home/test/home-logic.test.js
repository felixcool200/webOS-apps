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

test("hidden apps keep the order they were arranged in", () => {
  const installed = [app("x", { title: "Zattoo" }), app("y", { title: "Alexa" }), app("z", { title: "Mail" })];
  assert.deepStrictEqual(ids(HomeLogic.hiddenApps(installed, ["x", "gone", "y"])), ["x", "y"]);
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

const layout = () => ({ apps: ["yt", "nf", "sr"], tools: ["hb"], hidden: ["alexa", "camera"] });

test("arranging moves an app along its row, not past either end", () => {
  assert.deepStrictEqual(HomeLogic.moveInLayout(layout(), "nf", "right").apps, ["yt", "sr", "nf"]);
  assert.deepStrictEqual(HomeLogic.moveInLayout(layout(), "nf", "left").apps, ["nf", "yt", "sr"]);
  assert.deepStrictEqual(HomeLogic.moveInLayout(layout(), "sr", "right"), layout());
});

test("arranging moves an app down into Tools and then into Hidden, and back up", () => {
  let next = HomeLogic.moveInLayout(layout(), "nf", "down");
  assert.deepStrictEqual([next.apps, next.tools], [["yt", "sr"], ["hb", "nf"]]);
  next = HomeLogic.moveInLayout(next, "nf", "down");
  assert.deepStrictEqual([next.tools, next.hidden], [["hb"], ["alexa", "nf", "camera"]]);
  next = HomeLogic.moveInLayout(next, "camera", "up");
  assert.deepStrictEqual(next.tools, ["hb", "camera"]);
  assert.deepStrictEqual(HomeLogic.moveInLayout(layout(), "yt", "up"), layout(), "nothing above the apps");
  assert.deepStrictEqual(HomeLogic.moveInLayout(layout(), "alexa", "down"), layout(), "nothing below Hidden");
  assert.deepStrictEqual(HomeLogic.moveInLayout(layout(), "alexa", "right").hidden, ["camera", "alexa"], "Hidden can be sorted too");
});

test("saving a layout keeps tools and hidden apps that aren't installed now", () => {
  const lists = HomeLogic.savedLists(layout(), ["hb", "old.tool"], ["alexa", "gone.app"], ["yt", "nf", "sr", "hb", "alexa", "camera"]);
  assert.deepStrictEqual(lists, {
    order: ["yt", "nf", "sr", "hb"], tools: ["hb", "old.tool"], hidden: ["alexa", "camera", "gone.app"]
  });
});
