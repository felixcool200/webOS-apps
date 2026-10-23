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

test("the Custom remote lists its own buttons in order, then other bound codes", () => {
  const custom = [{ code: "500", name: "Ambilight" }, { code: "1044", name: "Screen" }];
  assert.deepStrictEqual(RemoteLogic.listedCodes("custom", { "1038": { action: "ignore" } }, custom), ["500", "1044", "1038"]);
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
  assert.deepStrictEqual(now.map((choice) => choice.label), ["Normal", "Custom", "Disabled", "Screen on/off", "Open Netflix"]);
  const later = RemoteLogic.choices(apps, { action: "ignore" }, handMade);
  assert.strictEqual(later[RemoteLogic.indexOf(later, handMade)].label, "Custom");
  assert.strictEqual(RemoteLogic.choices(apps, SCREEN, null).length, 4, "standard bindings add no Custom");
});

test("only non-standard bindings are remembered as Custom", () => {
  const apps = [{ id: "netflix", title: "Netflix" }];
  const binds = { "1": SCREEN, "2": { action: "launch", id: "netflix" }, "3": { action: "launch", id: "removed.app" }, "4": { action: "replace", code: 5 } };
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
