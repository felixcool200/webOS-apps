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
  pictureMode: { category: "picture", kind: "choice" }, backlight: { category: "picture", kind: "range", min: 0, max: 100, step: 5 },
  energySaving: { category: "picture", kind: "choice" }, soundMode: { category: "sound", kind: "choice" },
  quickStartMode: { category: "option", kind: "choice", order: ["off", "on"] }, wifiEnabled: { category: "network", kind: "choice" }
};
const CHOICES = ["pictureMode", "energySaving", "soundMode", "quickStartMode"];
const values = (...list) => ({ values: { arrayExt: list.map((value) => ({ value })) } });
const replies = () => [
  { settings: { pictureMode: "normal", backlight: "100", energySaving: "auto" } }, { settings: { soundMode: "standard" } },
  { settings: { quickStartMode: "on" } }, values("normal", "vivid"), values("auto", "off"), values("standard", "movie"), values("on", "off"),
  { wifi: { state: "connected" } }, { status: "connectionStateChanged" }
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

test("a load reads each category's settings, and the network replies after the choices however many there are", () => {
  assert.deepStrictEqual(SettingsLogic.READ_CATEGORIES.map((category) => SettingsLogic.keysIn(SPECS, category)),
    [["pictureMode", "backlight", "energySaving"], ["soundMode"], ["quickStartMode"]]);
  const read = replies();
  read.splice(7, 0, values("x", "y"));
  const fiveChoices = CHOICES.concat(["backlight"]);
  const { network } = SettingsLogic.applyReadings(Object.assign({}, SPECS, { backlight: SPECS.pictureMode }), {}, read, {}, fiveChoices);
  assert.deepStrictEqual(network, { connection: { wifi: { state: "connected" } }, wifi: { status: "connectionStateChanged" } });
});

test("a failed network read shows nothing new and counts as a failure, rather than Wi-Fi Off", () => {
  const read = replies();
  read[7] = new Error("No reply");
  const { network, failed } = SettingsLogic.applyReadings(SPECS, {}, read, {}, CHOICES);
  assert.strictEqual(network, null);
  assert.match(failed.message, /No reply/);
});

test("a failed read of the choices on offer keeps the ones known from before", () => {
  const before = SettingsLogic.applyReadings(SPECS, {}, replies(), {}, CHOICES).state;
  const read = replies();
  read[4] = new Error("Timed out");
  const { state } = SettingsLogic.applyReadings(SPECS, before, read, {}, CHOICES);
  assert.deepStrictEqual(state.energySaving.values, ["auto", "off"]);
  assert.strictEqual(SettingsLogic.nextValue(SPECS.energySaving, state.energySaving, 1), "off", "Right still changes it");
});

// Settings pages, with descriptions and replies in the TV's shapes.
const PAGE = {
  context: "picture",
  sections: [
    { title: "Mode", rows: [
      { key: "pictureMode", category: "picture", kind: "choice", label: "Picture mode", labels: { normal: "Standard", eco: "Auto Power Save" } },
      { key: "energySaving", category: "picture", kind: "choice", label: "Energy saving" }
    ] },
    { title: "Brightness", rows: [
      { key: "backlight", category: "picture", kind: "range", label: "Panel brightness",
        greyedWhen: { key: "energySaving", values: ["auto", "max"], reason: "Energy saving sets it" } },
      { key: "sharpness", category: "picture", kind: "range", label: "Sharpness" },
      { key: "ai_Brightness", category: "aiPicture", kind: "choice", label: "AI brightness" }
    ] }
  ]
};
const ROWS = SettingsLogic.pageRows(PAGE);
const MODE = ["input", "pictureMode"];
const desc = (key, dims, values, ui) => ({ key, dimension: dims, ui: Object.assign({ visible: true, active: true }, ui), values });
const choices = (...list) => ({ arrayExt: list.map((value) => ({ value, visible: true, active: true })) });
const range = (min, max) => ({ range: { min, max, interval: 1 } });
const DESCS = [
  desc("pictureMode", ["input", "dynamicRange"], choices("normal", "eco", "vivid")), desc("energySaving", [], choices("auto", "off", "max")),
  desc("pictureSettingModified", ["input"], {}), desc("backlight", MODE, range(0, 100)), desc("sharpness", MODE, range(0, 50))
];
const FLAGS = { normal: false, eco: false, vivid: true };
const pageReplies = () => [
  { returnValue: false, errorKey: ["hgig"], dimension: { dynamicRange: "sdr", pictureMode: "eco", input: "dtv" },
    settings: { pictureMode: "eco", energySaving: "off", backlight: 70, sharpness: "25", pictureSettingModified: FLAGS } },
  { returnValue: true, results: DESCS },
  { returnValue: true, dimension: { input: "dtv", pictureMode: "eco" }, settings: { ai_Brightness: "off" } },
  { returnValue: true, results: [desc("ai_Brightness", MODE, choices("on", "off"))] }
];
const opened = () => {
  const operations = SettingsLogic.currentReads(ROWS, PAGE);
  const applied = SettingsLogic.applyReads(SettingsLogic.emptyPageState(), ROWS, operations, pageReplies(), {});
  return Object.assign({}, applied, { state: Object.assign({}, applied.state, { context: applied.dimension }) });
};

test("a page reads each category's values and descriptions in the context the TV is in, with LG's mode flags", () => {
  assert.deepStrictEqual(SettingsLogic.currentReads(ROWS, PAGE), [
    { method: "getSystemSettings", params: { category: "picture", keys: ["pictureMode", "energySaving", "backlight", "sharpness", "pictureSettingModified"] } },
    { method: "getSystemSettingDesc", params: { category: "picture", keys: ["pictureMode", "energySaving", "backlight", "sharpness", "pictureSettingModified"] } },
    { method: "getSystemSettings", params: { category: "aiPicture", keys: ["ai_Brightness"] } },
    { method: "getSystemSettingDesc", params: { category: "aiPicture", keys: ["ai_Brightness"] } }
  ]);
});

test("a reply that lacks a key still gives the others, and names the context the TV is in", () => {
  const { state, failed, dimension } = opened();
  assert.strictEqual(failed, null, "returnValue false with values is not a failure");
  assert.deepStrictEqual(dimension, { dynamicRange: "sdr", pictureMode: "eco", input: "dtv" });
  assert.strictEqual(state.values.sharpness, 25, "ranges are numbers");
  assert.strictEqual(state.values.energySaving, "off");
  assert.deepStrictEqual(state.descs.backlight.dims, MODE);
  const replies = pageReplies();
  replies[2] = { returnValue: false, errorText: "There is no matched result from DB" };
  const partly = SettingsLogic.applyReads(SettingsLogic.emptyPageState(), ROWS, SettingsLogic.currentReads(ROWS, PAGE), replies, {});
  assert.match(partly.failed.message, /no matched result/, "a reply without any values is a failure");
  assert.strictEqual(SettingsLogic.rowView(ROWS[4], partly.state).hidden, true, "and its rows don't show");
  assert.strictEqual(SettingsLogic.rowView(ROWS[3], partly.state).hidden, false);
});

test("a key changed while the page read keeps its new value", () => {
  const before = { values: { backlight: 55 }, descs: {}, context: {} };
  const { state } = SettingsLogic.applyReads(before, ROWS, SettingsLogic.currentReads(ROWS, PAGE), pageReplies(), { backlight: true });
  assert.strictEqual(state.values.backlight, 55);
  assert.strictEqual(before.values.sharpness, undefined, "the old state isn't changed in place");
});

test("rows the TV doesn't offer are hidden; greyed rows say why", () => {
  const { state } = opened();
  assert.strictEqual(SettingsLogic.rowView(ROWS[1], state).hidden, false);
  state.descs.sharpness = Object.assign({}, state.descs.sharpness, { visible: false });
  assert.strictEqual(SettingsLogic.rowView(ROWS[3], state).hidden, true);
  state.descs.sharpness = Object.assign({}, state.descs.sharpness, { visible: true, active: false });
  assert.deepStrictEqual([SettingsLogic.rowView(ROWS[3], state).greyed, SettingsLogic.rowView(ROWS[3], state).reason],
    [true, "Not available with this picture mode or signal"]);
  const backlight = SettingsLogic.rowView(ROWS[2], state);
  assert.strictEqual(backlight.greyed, false, "energy saving is off");
  state.values.energySaving = "auto";
  assert.deepStrictEqual([SettingsLogic.rowView(ROWS[2], state).greyed, SettingsLogic.rowView(ROWS[2], state).reason], [true, "Energy saving sets it"]);
});

test("ranges of 100 step by 5 and smaller ones by 1, within the TV's range; choices follow the TV's list", () => {
  const { state } = opened();
  const backlight = SettingsLogic.rowView(ROWS[2], state);
  assert.deepStrictEqual([backlight.min, backlight.max, backlight.step, backlight.fill], [0, 100, 5, 70]);
  assert.strictEqual(SettingsLogic.nextRowValue(ROWS[2], backlight, 1), 75);
  const sharpness = SettingsLogic.rowView(ROWS[3], state);
  assert.deepStrictEqual([sharpness.step, SettingsLogic.nextRowValue(ROWS[3], sharpness, -1)], [1, 24]);
  state.values.sharpness = 50;
  assert.strictEqual(SettingsLogic.nextRowValue(ROWS[3], SettingsLogic.rowView(ROWS[3], state), 1), 50, "no step past the maximum");
  const mode = SettingsLogic.rowView(ROWS[0], state);
  assert.deepStrictEqual([mode.values, mode.text, SettingsLogic.nextRowValue(ROWS[0], mode, 1)], [["normal", "eco", "vivid"], "Auto Power Save", "vivid"]);
});

test("a write targets the context, and the first change in a mode also sets LG's flag for it, per input", () => {
  const { state } = opened();
  assert.deepStrictEqual(SettingsLogic.writeOperations(ROWS[3], 26, state), [
    { method: "setSystemSettings", params: { category: "picture", settings: { sharpness: 26 }, dimension: { input: "dtv", pictureMode: "eco" } } },
    { method: "setSystemSettings", params: { category: "picture", settings: { pictureSettingModified: { normal: false, eco: true, vivid: true } }, dimension: { input: "dtv" } } }
  ]);
  assert.deepStrictEqual(SettingsLogic.writeOperations(ROWS[1], "max", state),
    [{ method: "setSystemSettings", params: { category: "picture", settings: { energySaving: "max" } } }], "no dimension, no flag for a key of every input");
  assert.deepStrictEqual(SettingsLogic.writeOperations(ROWS[0], "vivid", state),
    [{ method: "setSystemSettings", params: { category: "picture", settings: { pictureMode: "vivid" }, dimension: { input: "dtv", dynamicRange: "sdr" } } }]);
  const vivid = Object.assign({}, state, { context: Object.assign({}, state.context, { pictureMode: "vivid" }) });
  assert.strictEqual(SettingsLogic.writeOperations(ROWS[3], 26, vivid).length, 1, "the flag is already set");
  const unknown = Object.assign({}, state, { context: { input: "hdmi2", dynamicRange: "sdr" } });
  assert.strictEqual(SettingsLogic.writeOperations(ROWS[3], 26, unknown), null, "the mode of HDMI 2 isn't known yet");
});

test("after a write the page keeps the value and the flag, and a new picture mode becomes the context's", () => {
  const { state } = opened();
  const operations = SettingsLogic.writeOperations(ROWS[3], 26, state);
  const written = SettingsLogic.applyWrite(state, ROWS[3], 26, operations, [{ returnValue: true }, { returnValue: true }]);
  assert.strictEqual(written.values.sharpness, 26);
  assert.strictEqual(written.values.pictureSettingModified.eco, true);
  const flagFailed = SettingsLogic.applyWrite(state, ROWS[3], 26, operations, [{ returnValue: true }, { returnValue: false }]);
  assert.strictEqual(flagFailed.values.pictureSettingModified.eco, false);
  const mode = SettingsLogic.applyWrite(state, ROWS[0], "vivid", SettingsLogic.writeOperations(ROWS[0], "vivid", state), [{ returnValue: true }]);
  assert.strictEqual(mode.context.pictureMode, "vivid");
  assert.throws(() => SettingsLogic.applyWrite(state, ROWS[3], 26, operations, [{ returnValue: false, errorText: "Busy" }]), /Busy/);
});

test("another input is read in two steps: its picture mode, then that mode's settings", () => {
  const { state, dimension } = opened();
  const hdmi2 = Object.assign({}, state, { context: SettingsLogic.contextFor("hdmi2", dimension) });
  assert.deepStrictEqual(hdmi2.context, { input: "hdmi2", dynamicRange: "sdr" });
  assert.deepStrictEqual(SettingsLogic.contextFor("dtv", { input: "dtv", dynamicRange: "hdr" }), { input: "dtv", dynamicRange: "hdr" },
    "the current input keeps the signal on screen");
  const first = SettingsLogic.contextReads(ROWS, PAGE, hdmi2);
  assert.deepStrictEqual(first, [
    { method: "getSystemSettings", params: { category: "picture", keys: ["pictureMode"], dimension: { input: "hdmi2", dynamicRange: "sdr" } } },
    { method: "getSystemSettings", params: { category: "picture", keys: ["energySaving"] } },
    { method: "getSystemSettings", params: { category: "picture", keys: ["pictureSettingModified"], dimension: { input: "hdmi2" } } }
  ], "one read per dimension; the mode's settings wait for the mode");
  const applied = SettingsLogic.applyReads(hdmi2, ROWS, first, [
    { returnValue: true, settings: { pictureMode: "vivid" } }, { returnValue: true, settings: { energySaving: "off" } },
    { returnValue: true, settings: { pictureSettingModified: FLAGS } }
  ], {});
  const filled = SettingsLogic.fillContext(applied.state, applied.read);
  assert.deepStrictEqual(filled.context, { input: "hdmi2", dynamicRange: "sdr", pictureMode: "vivid" });
  assert.deepStrictEqual(SettingsLogic.contextReads(ROWS, PAGE, filled, "pictureMode"), [
    { method: "getSystemSettings", params: { category: "picture", keys: ["backlight", "sharpness"], dimension: { input: "hdmi2", pictureMode: "vivid" } } },
    { method: "getSystemSettings", params: { category: "aiPicture", keys: ["ai_Brightness"], dimension: { input: "hdmi2", pictureMode: "vivid" } } }
  ]);
});

test("Applies to offers the apps, live TV and each HDMI input, and says what a row applies to", () => {
  const status = { devices: [{ id: "HDMI_1", label: "HDMI 1" }, { id: "HDMI_2", label: "Apple TV" }, { id: "AV_1", label: "AV" }] };
  const inputs = SettingsLogic.inputChoices(status, "atv", { "default": "Apps", dtv: "Live TV", atv: "Analogue TV" });
  assert.deepStrictEqual(inputs.values, ["default", "dtv", "hdmi1", "hdmi2", "atv"]);
  assert.deepStrictEqual([inputs.labels.hdmi2, inputs.labels.atv], ["Apple TV", "Analogue TV"]);
  assert.deepStrictEqual(SettingsLogic.inputChoices(null, "hdmi3", {}).values, ["default", "dtv", "hdmi3"], "without the inputs, the current one");
  const { state } = opened();
  const labels = { labels: { dtv: "Live TV" } };
  assert.strictEqual(SettingsLogic.scopeText(ROWS[3], SettingsLogic.rowView(ROWS[3], state), state, labels, PAGE.sections[0].rows[0].labels),
    "Applies to Live TV in Auto Power Save");
  assert.strictEqual(SettingsLogic.scopeText(ROWS[0], SettingsLogic.rowView(ROWS[0], state), state, labels), "Applies to Live TV with SDR signals");
  assert.strictEqual(SettingsLogic.scopeText(ROWS[1], SettingsLogic.rowView(ROWS[1], state), state, labels), "Applies to every input");
});
