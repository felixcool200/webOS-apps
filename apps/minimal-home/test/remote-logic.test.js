"use strict";

const test = require("node:test");
const assert = require("node:assert");
const RemoteLogic = require("../app/remote-logic.js");

const SCREEN = { action: "exec", command: RemoteLogic.SCREEN_TOGGLE };

test("the MR24 list leaves out the buttons that keep the remote usable", () => {
  const codes = RemoteLogic.listedCodes("mr24", {}, []);
  assert.ok(codes.includes("2") && codes.includes("1044") && codes.includes("115"), "numbers, app keys and volume");
  for (const kept of ["28", "103", "105", "106", "108", "412", "773"]) { assert.ok(!codes.includes(kept), kept); }
  assert.strictEqual(new Set(codes).size, codes.length);
});

test("a code bound some other way is listed too, unless it is a kept button", () => {
  const codes = RemoteLogic.listedCodes("mr24", { "9999": { action: "ignore" }, "28": { action: "ignore" } }, []);
  assert.strictEqual(codes[codes.length - 1], "9999");
  assert.ok(!codes.includes("28"));
});

test("a Blank preset lists its own buttons in order, then other bound codes", () => {
  const custom = [{ code: "500", name: "Ambilight" }, { code: "1044", name: "Screen" }];
  assert.deepStrictEqual(RemoteLogic.listedCodes("blank", { "1038": { action: "ignore" } }, custom), ["500", "1044", "1038"]);
});

test("a test disables the listed codes, every bindable MR24 button and Home", () => {
  const codes = RemoteLogic.testCodes(["500"]);
  assert.ok(codes.includes("500") && codes.includes("2") && codes.includes("773"));
  assert.ok(!codes.includes("28") && !codes.includes("412"));
  assert.deepStrictEqual(RemoteLogic.disabledBinds(["2"]), { "2": { action: "ignore" } });
});

test("buttons are named by the Custom remote first, then the MR24, then their code", () => {
  const custom = [{ code: "1044", name: "Screen" }];
  assert.strictEqual(RemoteLogic.nameFor("1044", custom), "Screen");
  assert.strictEqual(RemoteLogic.nameFor("1037", custom), "Netflix");
  assert.strictEqual(RemoteLogic.nameFor(4242, custom), "Button 4242");
});

test("a binding made elsewhere stays on offer as Custom after stepping away from it", () => {
  const handMade = { action: "exec", command: "echo hi" };
  const apps = [{ id: "netflix", title: "Netflix" }];
  const now = RemoteLogic.choices(apps, handMade, handMade);
  assert.deepStrictEqual(now.map((choice) => choice.label), ["Normal", "Custom", "Disabled", "Screen on/off",
    "Open Sources", "Open Home settings", "Acts as Back", "Acts as OK", "Acts as Up", "Acts as Down", "Acts as Left", "Acts as Right", "Acts as Home", "Open Netflix"]);
  const later = RemoteLogic.choices(apps, { action: "ignore" }, handMade);
  assert.strictEqual(later[RemoteLogic.indexOf(later, handMade)].label, "Custom");
  assert.strictEqual(RemoteLogic.choices(apps, SCREEN, null).length, 13, "standard bindings add no Custom");
});

test("only non-standard bindings are remembered as Custom", () => {
  const apps = [{ id: "netflix", title: "Netflix" }];
  const binds = { "1": SCREEN, "2": { action: "launch", id: "netflix" }, "3": { action: "launch", id: "removed.app" },
    "4": { action: "replace", keycode: 5 }, "5": { action: "replace", keycode: 412 } };
  assert.deepStrictEqual(Object.keys(RemoteLogic.customBinds(binds, apps)), ["3", "4"]);
});

test("the button log poll finds new presses and follows the log", () => {
  assert.deepStrictEqual(RemoteLogic.readPresses("#120\n", null), { codes: [], position: 120, missing: false });
  assert.deepStrictEqual(RemoteLogic.readPresses("1044\n103\n#124\n", 120), { codes: ["1044", "103"], position: 124, missing: false });
  assert.deepStrictEqual(RemoteLogic.readPresses("#3\n", 124), { codes: [], position: 0, missing: false }, "log started over");
  assert.strictEqual(RemoteLogic.readPresses("", 124).missing, true);
  assert.strictEqual(RemoteLogic.readPresses("#missing\n", 124).missing, true);
});

test("saved Custom buttons are checked and cleaned", () => {
  const saved = JSON.stringify([{ code: 500, name: "  Ambi   light " }, { code: "x", name: "bad" }, { code: "500", name: "again" }, null, { code: "7", name: "" }]);
  assert.deepStrictEqual(RemoteLogic.parseCustom(saved), [{ code: "500", name: "Ambi light" }, { code: "7", name: "6" }]);
  assert.deepStrictEqual(RemoteLogic.parseCustom("{oops"), []);
  assert.deepStrictEqual(RemoteLogic.parseCustom(null), []);
});

test("adding a known button names it after the MR24, adding it again renames it", () => {
  let custom = RemoteLogic.withButton([], "1044", "");
  assert.deepStrictEqual(custom, [{ code: "1044", name: "Rakuten TV" }]);
  custom = RemoteLogic.withButton(custom, "1044", "Skärm av");
  assert.deepStrictEqual(custom, [{ code: "1044", name: "Skärm av" }]);
  assert.deepStrictEqual(RemoteLogic.withoutButton(custom, 1044), []);
});

test("kept buttons can't be added to the Custom remote", () => {
  assert.strictEqual(RemoteLogic.canAdd("28"), false);
  assert.strictEqual(RemoteLogic.canAdd("773"), false);
  assert.strictEqual(RemoteLogic.canAdd("4242"), true);
});

test("only Blank presets show your own names, so renaming there leaves MR24 presets alone", () => {
  const custom = [{ code: "1044", name: "Screen" }];
  assert.strictEqual(RemoteLogic.displayName("blank", "1044", custom), "Screen");
  assert.strictEqual(RemoteLogic.displayName("mr24", "1044", custom), "Rakuten TV");
  assert.strictEqual(RemoteLogic.displayName("mr24", "4242", custom), "Button 4242");
});

test("arrows move between drawn buttons along rows and columns", () => {
  const named = (name) => RemoteLogic.MR24.find((button) => button.name === name);
  const move = (from, direction) => (RemoteLogic.nearestButton(named(from), direction) || { name: null }).name;
  assert.strictEqual(move("1", "right"), "2");
  assert.strictEqual(move("1", "down"), "4");
  assert.strictEqual(move("1", "up"), "Power");
  assert.strictEqual(move("Power", "up"), null, "top edge");
  assert.strictEqual(move("1", "left"), null, "left edge");
  assert.strictEqual(move("0", "down"), "Mute");
  assert.strictEqual(move("Mic", "down"), "Up");
  assert.strictEqual(move("Up", "down"), "OK");
  assert.strictEqual(move("OK", "right"), "Right");
  assert.strictEqual(move("Back", "down"), "Red");
  assert.strictEqual(move("Red", "right"), "Green");
  assert.strictEqual(move("Netflix", "right"), "Prime Video");
  assert.strictEqual(move("Google Assistant", "down"), null, "bottom edge");
  assert.strictEqual(move("Left", "left"), null, "no jump to a button far below");
  assert.strictEqual(move("3", "up"), "Power");
  assert.strictEqual(move("Home", "down"), "Left");
  assert.strictEqual(move("Down", "down"), "Green", "the colour keys sit straight below");
  assert.strictEqual(move("Down", "left"), "Back");
  assert.strictEqual(move("Settings", "down"), "Blue");
});

test("another remote's button can act as Back, so that remote can leave pages", () => {
  const list = RemoteLogic.choices([], null, null);
  assert.deepStrictEqual(list[RemoteLogic.indexOf(list, { action: "replace", keycode: 412 })].label, "Acts as Back");
  assert.deepStrictEqual(list[RemoteLogic.indexOf(list, { action: "replace", keycode: 773 })].label, "Acts as Home");
});

test("pressing one button three times within two seconds stops a test", () => {
  let result = RemoteLogic.stopStreak(null, "1044", 0);
  result = RemoteLogic.stopStreak(result.streak, "1044", 600);
  assert.strictEqual(result.stop, false);
  assert.strictEqual(RemoteLogic.stopStreak(result.streak, "1044", 1200).stop, true);
  assert.strictEqual(RemoteLogic.stopStreak(result.streak, "1037", 1200).stop, false, "another button starts over");
  assert.strictEqual(RemoteLogic.stopStreak(result.streak, "1044", 2700).stop, false, "too slow");
});

test("a button can open Minimal Home's Sources view", () => {
  const open = RemoteLogic.choices([], null, null).find((choice) => choice.label === "Open Sources").bind;
  assert.strictEqual(open.action, "exec");
  assert.match(open.command, /applicationManager\/launch '\{"id":"org\.webosbrew\.minimalhome","params":\{"view":"sources"\}\}'/);
});

test("a new TV starts with Input opening Sources and Settings opening Home's settings", () => {
  const defaults = RemoteLogic.defaultBinds();
  const list = RemoteLogic.choices([], null, null);
  assert.strictEqual(list[RemoteLogic.indexOf(list, defaults["241"])].label, "Open Sources");
  assert.strictEqual(list[RemoteLogic.indexOf(list, defaults["139"])].label, "Open Home settings");
  const script = require("fs").readFileSync(require("path").join(__dirname, "../app/remote-hook/load-remote-hook.sh"), "utf8");
  const written = /<<'EOF'\n([\s\S]*?)\nEOF/.exec(script)[1];
  assert.deepStrictEqual(JSON.parse(written), defaults, "the boot script writes the same defaults");
});

test("before presets existed: an LG MR24 preset, and Custom buttons become a Blank preset", () => {
  const custom = JSON.stringify([{ code: "1044", name: "Skärm av" }]);
  const presets = RemoteLogic.parsePresets(null, "mr24", custom);
  assert.deepStrictEqual(presets.list.map((preset) => [preset.name, preset.template, preset.binds]), [["LG MR24", "mr24", null], ["Custom", "blank", null]]);
  assert.strictEqual(presets.active, "p1");
  assert.deepStrictEqual(presets.list[1].buttons, [{ code: "1044", name: "Skärm av" }]);
  assert.strictEqual(RemoteLogic.parsePresets(null, null, null).list.length, 1, "a new TV starts with one preset");
  assert.strictEqual(RemoteLogic.parsePresets(null, "custom", null).active, "p2");
});

test("saved presets are read back, and a broken active id falls back to the first", () => {
  const saved = { active: "p9", list: [{ id: "p1", name: "Movie night", template: "mr24", buttons: [], binds: { "1037": { action: "ignore" } } }, { id: "p2", name: "?", template: "nope" }] };
  const presets = RemoteLogic.parsePresets(JSON.stringify(saved), null, null);
  assert.deepStrictEqual(presets.list.map((preset) => preset.name), ["Movie night"]);
  assert.strictEqual(presets.active, "p1");
});

test("a new preset becomes active, MR24 ones with the default bindings and Blank ones with none", () => {
  let presets = RemoteLogic.parsePresets(null, null, null);
  presets = RemoteLogic.withNewPreset(presets, "mr24", "  Movie   night ");
  assert.strictEqual(presets.active, "p2");
  assert.strictEqual(RemoteLogic.activePreset(presets).name, "Movie night");
  assert.deepStrictEqual(RemoteLogic.activePreset(presets).binds, RemoteLogic.defaultBinds());
  presets = RemoteLogic.withNewPreset(presets, "blank", "");
  assert.deepStrictEqual([RemoteLogic.activePreset(presets).name, RemoteLogic.activePreset(presets).binds], ["Blank", {}]);
});

test("presets can be renamed, and deleted unless it is the last one", () => {
  let presets = RemoteLogic.withNewPreset(RemoteLogic.parsePresets(null, null, null), "blank", "Living room");
  presets = RemoteLogic.withPresetRenamed(presets, "p2", "Bedroom");
  assert.strictEqual(RemoteLogic.activePreset(presets).name, "Bedroom");
  presets = RemoteLogic.withoutPreset(presets, "p2");
  assert.deepStrictEqual([presets.active, presets.list.length], ["p1", 1], "deleting the active one activates the one before");
  assert.strictEqual(RemoteLogic.withoutPreset(presets, "p1"), presets, "the last preset stays");
});

test("the preset row steps through the presets only; the menu acts on the one shown", () => {
  const one = RemoteLogic.parsePresets(null, null, null);
  assert.deepStrictEqual(RemoteLogic.presetChoices(one).map((choice) => choice.label), ["LG MR24"]);
  assert.deepStrictEqual(RemoteLogic.presetActions(one).map((action) => action.label), ["New preset…", "Rename “LG MR24”…"], "no deleting the last one");
  const two = RemoteLogic.withNewPreset(one, "blank", "Living room");
  assert.deepStrictEqual(RemoteLogic.presetChoices(two).map((choice) => choice.label), ["LG MR24", "Living room"]);
  assert.deepStrictEqual(RemoteLogic.presetActions(two).map((action) => action.label), ["New preset…", "Rename “Living room”…", "Delete “Living room”…"]);
});
