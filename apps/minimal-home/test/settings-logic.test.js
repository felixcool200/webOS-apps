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
  energySaving: { category: "picture", kind: "choice", order: ["auto", "off"] }, soundMode: { category: "sound", kind: "choice" },
  sleepTimer: { category: "timer", kind: "choice" }
};
const CHOICES = ["pictureMode", "energySaving", "soundMode"];
const values = (...list) => ({ values: { arrayExt: list.map((value) => ({ value })) } });
const replies = () => [
  { settings: { pictureMode: "normal", backlight: "100", energySaving: "auto" } }, { settings: { soundMode: "standard" } },
  values("normal", "vivid"), values("off", "auto"), values("standard", "movie"),
  { wifi: { state: "connected" } }, { status: "connectionStateChanged" }, { sleepTimeSecond: 0 }
];

test("a load fills in values and the choices on offer, with ranges as numbers", () => {
  const { state, failed } = SettingsLogic.applyReadings(SPECS, {}, replies(), {}, CHOICES);
  assert.strictEqual(failed, null);
  assert.strictEqual(state.backlight.value, 100, "the TV reports \"100\"; it must compare equal to 100");
  assert.deepStrictEqual(state.pictureMode.values, ["normal", "vivid"]);
  assert.deepStrictEqual(state.energySaving.values, ["auto", "off"], "in the spec's order");
  assert.strictEqual(state.sleepTimer.value, "off");
  assert.strictEqual(SettingsLogic.nextValue(SPECS.backlight, state.backlight, 1), state.backlight.value, "no step past the maximum");
});

test("one failed read leaves the rest of Settings working", () => {
  const read = replies();
  read[3] = new Error("Unknown key energySaving");
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
    [["pictureMode", "backlight", "energySaving"], ["soundMode"]]);
  const read = replies();
  read.splice(5, 0, values("x", "y"));
  const fiveChoices = CHOICES.concat(["backlight"]);
  const { network } = SettingsLogic.applyReadings(Object.assign({}, SPECS, { backlight: SPECS.pictureMode }), {}, read, {}, fiveChoices);
  assert.deepStrictEqual(network, { connection: { wifi: { state: "connected" } }, wifi: { status: "connectionStateChanged" } });
});

test("a failed network read shows nothing new and counts as a failure, rather than Wi-Fi Off", () => {
  const read = replies();
  read[5] = new Error("No reply");
  const { network, failed } = SettingsLogic.applyReadings(SPECS, {}, read, {}, CHOICES);
  assert.strictEqual(network, null);
  assert.match(failed.message, /No reply/);
});

test("a failed read of the choices on offer keeps the ones known from before", () => {
  const before = SettingsLogic.applyReadings(SPECS, {}, replies(), {}, CHOICES).state;
  const read = replies();
  read[3] = new Error("Timed out");
  const { state } = SettingsLogic.applyReadings(SPECS, before, read, {}, CHOICES);
  assert.deepStrictEqual(state.energySaving.values, ["auto", "off"]);
  assert.strictEqual(SettingsLogic.nextValue(SPECS.energySaving, state.energySaving, 1), "off", "Right still changes it");
});

// Settings pages, with descriptions and replies in the TV's shapes.
const PAGE = {
  context: "picture",
  extra: [{ key: "pictureSettingModified", category: "picture" }],
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
    [true, "Not available now"]);
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
  assert.deepStrictEqual(SettingsLogic.writeOperations(ROWS[3], 26, state, PAGE), [
    { method: "setSystemSettings", params: { category: "picture", settings: { sharpness: 26 }, dimension: { input: "dtv", pictureMode: "eco" } } },
    { method: "setSystemSettings", params: { category: "picture", settings: { pictureSettingModified: { normal: false, eco: true, vivid: true } }, dimension: { input: "dtv" } } }
  ]);
  assert.deepStrictEqual(SettingsLogic.writeOperations(ROWS[1], "max", state, PAGE),
    [{ method: "setSystemSettings", params: { category: "picture", settings: { energySaving: "max" } } }], "no dimension, no flag for a key of every input");
  assert.deepStrictEqual(SettingsLogic.writeOperations(ROWS[0], "vivid", state, PAGE),
    [{ method: "setSystemSettings", params: { category: "picture", settings: { pictureMode: "vivid" }, dimension: { input: "dtv", dynamicRange: "sdr" } } }]);
  const vivid = Object.assign({}, state, { context: Object.assign({}, state.context, { pictureMode: "vivid" }) });
  assert.strictEqual(SettingsLogic.writeOperations(ROWS[3], 26, vivid, PAGE).length, 1, "the flag is already set");
  const unknown = Object.assign({}, state, { context: { input: "hdmi2", dynamicRange: "sdr" } });
  assert.strictEqual(SettingsLogic.writeOperations(ROWS[3], 26, unknown, PAGE), null, "the mode of HDMI 2 isn't known yet");
});

test("after a write the page keeps the value and the flag, and a new picture mode becomes the context's", () => {
  const { state } = opened();
  const operations = SettingsLogic.writeOperations(ROWS[3], 26, state, PAGE);
  const written = SettingsLogic.applyWrite(state, ROWS[3], 26, operations, [{ returnValue: true }, { returnValue: true }]);
  assert.strictEqual(written.values.sharpness, 26);
  assert.strictEqual(written.values.pictureSettingModified.eco, true);
  const flagFailed = SettingsLogic.applyWrite(state, ROWS[3], 26, operations, [{ returnValue: true }, { returnValue: false }]);
  assert.strictEqual(flagFailed.values.pictureSettingModified.eco, false);
  const mode = SettingsLogic.applyWrite(state, ROWS[0], "vivid", SettingsLogic.writeOperations(ROWS[0], "vivid", state, PAGE), [{ returnValue: true }]);
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
  assert.strictEqual(SettingsLogic.scopeText(ROWS[3], SettingsLogic.rowView(ROWS[3], state), state, PAGE, labels, PAGE.sections[0].rows[0].labels),
    "Applies to Live TV in Auto Power Save");
  assert.strictEqual(SettingsLogic.scopeText(ROWS[0], SettingsLogic.rowView(ROWS[0], state), state, PAGE, labels), "Applies to Live TV with SDR signals");
  assert.strictEqual(SettingsLogic.scopeText(ROWS[1], SettingsLogic.rowView(ROWS[1], state), state, PAGE, labels), "Applies to every input");
});

test("the sleep timer shows the shortest choice that covers the time left, and the minutes left", () => {
  assert.deepStrictEqual(SettingsLogic.sleepTimerFrom({ sleepTimeSecond: 0 }), { value: "off", note: "" });
  assert.deepStrictEqual(SettingsLogic.sleepTimerFrom({ sleepTimeMinute: 9, sleepTimeSecond: 58 }), { value: "10", note: "10 min left" },
    "as the TV answered 2 s after a 10 minute timer was set");
  assert.deepStrictEqual(SettingsLogic.sleepTimerFrom({ sleepTimeMinute: 27, sleepTimeSecond: 30 }), { value: "30", note: "28 min left" });
  assert.deepStrictEqual(SettingsLogic.sleepTimerFrom({ sleepTimeMinute: 300, sleepTimeSecond: 0 }).value, "240");
  const off = { kind: "choice", key: "sleepTimer", source: "sleepTimer" };
  assert.deepStrictEqual(SettingsLogic.sourceWrite(off, "off"), ["luna://com.webos.service.tvReservationAgent/timer/sleep/add", { sleepTimeMinute: "0" }]);
  assert.deepStrictEqual(SettingsLogic.sourceWrite(off, "30")[1], { sleepTimeMinute: "30" });
});

const SOURCE_ROWS = [
  { key: "sleepTimer", source: "sleepTimer", kind: "choice" }, { key: "wifiEnabled", source: "network", kind: "choice" },
  { key: "wifiStatus", source: "network", kind: "info" }, { key: "ethernet", source: "network", kind: "info" }
];

test("rows from other services read in one go, each source's replies in turn", () => {
  assert.deepStrictEqual(SettingsLogic.sourceCalls(SOURCE_ROWS).map((call) => call[0].replace("luna://com.webos.service.", "")),
    ["tvReservationAgent/timer/sleep/getRemainTime", "connectionmanager/getstatus", "wifi/getstatus"]);
  const { state, failed } = SettingsLogic.applySources(SettingsLogic.emptyPageState(), SOURCE_ROWS, [
    { sleepTimeMinute: 27, sleepTimeSecond: 30 },
    { wired: { state: "disconnected", plugged: false }, wifi: { state: "connected", ssid: "Home", ipAddress: "192.168.1.5" } },
    { status: "connectionStateChanged" }
  ], {});
  assert.strictEqual(failed, null);
  assert.deepStrictEqual([state.values.sleepTimer, state.notes.sleepTimer], ["30", "28 min left"]);
  assert.deepStrictEqual([state.values.wifiEnabled, state.values.wifiStatus, state.values.ethernet, state.notes.ethernet],
    ["enabled", "Home · 192.168.1.5", "Unplugged", "No cable connected"]);
  const wifi = SettingsLogic.rowView(SOURCE_ROWS[1], state);
  assert.deepStrictEqual([wifi.hidden, wifi.values], [false, ["disabled", "enabled"]]);
  assert.strictEqual(SettingsLogic.rowView(SOURCE_ROWS[2], state).text, "Home · 192.168.1.5");
});

test("a source whose read failed leaves its rows as they were, and the others work", () => {
  const { state, failed } = SettingsLogic.applySources(SettingsLogic.emptyPageState(), SOURCE_ROWS, [
    new Error("No reply"), { wired: {}, wifi: { state: "connected" } }, { status: "serviceDisabled" }
  ], {});
  assert.match(failed.message, /No reply/);
  assert.strictEqual(SettingsLogic.rowView(SOURCE_ROWS[0], state).hidden, true);
  assert.strictEqual(state.values.wifiEnabled, "disabled", "the radio is off although the last state said connected");
  assert.strictEqual(state.values.wifiStatus, "Wireless radio is off");
});

const SOUND = {
  sections: [{ title: "Sync", rows: [
    { key: "soundOutput", category: "sound", kind: "info", labels: { tv_external_speaker: "Optical Out Device + TV Speaker" } },
    { key: "avSyncSpeaker", category: "sound", kind: "range", hideWhen: { key: "soundOutput", values: ["external_arc"] },
      greyedWhen: { key: "avSyncBypassInput", values: ["on"], reason: "Bypass is on" } },
    { key: "avSyncSpdif", category: "sound", kind: "range", showWhen: { key: "soundOutput", values: ["external_arc"] } },
    { key: "highContrast", category: "option", kind: "choice", "with": { adjustments: { blackAndWhite: "off", colorInversion: "off" } },
      greyedWhen: [{ key: "adjustments", field: "blackAndWhite", values: ["on"], reason: "Grayscale is on" },
        { key: "adjustments", field: "colorInversion", values: ["on"], reason: "Invert colours is on" }] },
    { key: "wifiEnabled", source: "network", kind: "choice", confirm: { values: ["disabled"], prompt: "OK again" } },
    { key: "userGuide", kind: "link", launch: { id: "com.webos.app.tvuserguide" } }
  ] }]
};
const SOUND_ROWS = SettingsLogic.pageRows(SOUND);
const soundState = (values) => ({
  values: Object.assign({ soundOutput: "tv_external_speaker", avSyncSpeaker: 0, avSyncSpdif: 0, avSyncBypassInput: "off", highContrast: "off",
    adjustments: { blackAndWhite: "off", colorInversion: "off" } }, values),
  descs: { soundOutput: { dims: ["audioOutput"], visible: true, active: true }, avSyncSpeaker: { dims: ["audioInput"], visible: true, active: true, range: { min: 0, max: 60 } },
    avSyncSpdif: { dims: ["audioInput"], visible: true, active: true, range: { min: 0, max: 60 } },
    highContrast: { dims: [], visible: true, active: true, choices: [{ value: "on" }, { value: "off" }] } },
  notes: {}, context: { audioInput: "hdmi2", audioOutput: "default" }
});

test("the sound delay row of the output in use shows, and Bypass greys it", () => {
  const optical = soundState({});
  assert.deepStrictEqual(SOUND_ROWS.slice(1, 3).map((row) => SettingsLogic.rowView(row, optical).hidden), [false, true]);
  const arc = soundState({ soundOutput: "external_arc" });
  assert.deepStrictEqual(SOUND_ROWS.slice(1, 3).map((row) => SettingsLogic.rowView(row, arc).hidden), [true, false]);
  assert.strictEqual(SettingsLogic.rowView(SOUND_ROWS[1], soundState({ avSyncBypassInput: "on" })).reason, "Bypass is on");
  assert.strictEqual(SettingsLogic.rowView(SOUND_ROWS[0], optical).text, "Optical Out Device + TV Speaker", "an info row shows its label");
});

test("pages without Applies to write as LG Settings does, without a dimension, and with LG's combined settings", () => {
  const state = soundState({});
  assert.deepStrictEqual(SettingsLogic.writeOperations(SOUND_ROWS[1], 20, state, SOUND),
    [{ method: "setSystemSettings", params: { category: "sound", settings: { avSyncSpeaker: 20 } } }]);
  const operations = SettingsLogic.writeOperations(SOUND_ROWS[3], "on", state, SOUND);
  assert.deepStrictEqual(operations, [{ method: "setSystemSettings", params: { category: "option",
    settings: { highContrast: "on", adjustments: { blackAndWhite: "off", colorInversion: "off" } } } }]);
  assert.deepStrictEqual(SettingsLogic.applyWrite(state, SOUND_ROWS[3], "on", operations, [{ returnValue: true }]).values.adjustments,
    { blackAndWhite: "off", colorInversion: "off" });
  assert.strictEqual(SettingsLogic.writeOperations(SOUND_ROWS[4], "disabled", state, SOUND), null, "a source row writes through its service");
  assert.strictEqual(SettingsLogic.scopeText(SOUND_ROWS[1], SettingsLogic.rowView(SOUND_ROWS[1], state), state, SOUND), "Applies to what is playing now");
});

test("a rule can read a field of an object value, and the first rule that holds says why", () => {
  const grey = soundState({ adjustments: { blackAndWhite: "off", colorInversion: "on" } });
  assert.deepStrictEqual([SettingsLogic.rowView(SOUND_ROWS[3], grey).greyed, SettingsLogic.rowView(SOUND_ROWS[3], grey).reason], [true, "Invert colours is on"]);
  assert.strictEqual(SettingsLogic.rowView(SOUND_ROWS[3], soundState({})).greyed, false);
});

test("turning Wi-Fi off asks first; links always show and open what they name", () => {
  assert.strictEqual(SettingsLogic.needsConfirm(SOUND_ROWS[4], "disabled"), true);
  assert.strictEqual(SettingsLogic.needsConfirm(SOUND_ROWS[4], "enabled"), false);
  assert.strictEqual(SettingsLogic.needsConfirm(SOUND_ROWS[1], 20), false);
  assert.deepStrictEqual(SettingsLogic.rowView(SOUND_ROWS[5], soundState({})), { hidden: false, greyed: false, reason: "", text: "›", note: "", perInput: false });
  assert.deepStrictEqual(SettingsLogic.currentReads(SOUND_ROWS, SOUND, false).map((operation) => operation.params), [
    { category: "sound", keys: ["soundOutput", "avSyncSpeaker", "avSyncSpdif"] }, { category: "option", keys: ["highContrast"] }
  ], "values only; sources and links aren't settingsservice keys");
});

test("a time zone shows its city and name", () => {
  const row = { key: "timeZone", category: "time", kind: "info", format: "timeZone" };
  const state = { values: { timeZone: { City: "Stockholm", Description: "Central European Time", ZoneID: "Europe/Stockholm" } },
    descs: { timeZone: { dims: [], visible: true, active: true } }, notes: {}, context: {} };
  assert.strictEqual(SettingsLogic.rowView(row, state).text, "Stockholm · Central European Time");
});

// Phase 7: rows LG keeps per app, action rows, and settings with more than one key behind them.
const PER_APP = {
  context: "picture",
  extra: [{ key: "pictureSettingModified", category: "picture" }],
  sections: [{ title: "Motion", rows: [
    { key: "truMotionMode", category: "picture", kind: "choice", appId: "org.webosbrew.minimalhome" },
    { key: "arcPerApp", category: "aspectRatio", kind: "choice", appId: "com.webos.app.livetv", hideWhen: { context: "input", values: ["default"] } },
    { key: "sharpness", category: "picture", kind: "range" },
    { key: "applyToAllInput", category: "picture", kind: "action", action: { write: { applyToAllInput: "picture" } }, confirm: { prompt: "?" }, done: "!" },
    { key: "pictureReset", kind: "action", action: { reset: "picture" }, confirm: { prompt: "?" }, done: "!" }
  ] }]
};
const PER_APP_ROWS = SettingsLogic.pageRows(PER_APP);
const perAppState = (context, now) => ({
  values: { truMotionMode: "natural", arcPerApp: "16x9", sharpness: 25, applyToAllInput: "done", pictureSettingModified: { eco: true, normal: false } },
  descs: { truMotionMode: { dims: MODE, visible: true, active: true, choices: [{ value: "natural" }, { value: "smooth" }] },
    arcPerApp: { dims: ["input", "twinMode"], visible: true, active: true, choices: [{ value: "16x9" }, { value: "4x3" }] },
    sharpness: { dims: MODE, visible: true, active: true, range: { min: 0, max: 50 } },
    applyToAllInput: { dims: MODE, visible: true, active: true, choices: [] }, pictureSettingModified: { dims: ["input"], visible: true, active: true } },
  notes: {}, context: context, now: now
});

test("keys LG keeps per app are read and written with an app id, and show only for the input that played last", () => {
  assert.deepStrictEqual(SettingsLogic.currentReads(PER_APP_ROWS, PER_APP).filter((operation) => operation.params.app_id), [
    { method: "getSystemSettings", params: { category: "picture", keys: ["truMotionMode"], app_id: "org.webosbrew.minimalhome" } },
    { method: "getSystemSettings", params: { category: "aspectRatio", keys: ["arcPerApp"], app_id: "com.webos.app.livetv" } }
  ]);
  const playing = perAppState({ input: "hdmi2", pictureMode: "eco" }, { input: "hdmi2", pictureMode: "eco" });
  assert.deepStrictEqual(PER_APP_ROWS.slice(0, 2).map((row) => SettingsLogic.rowView(row, playing).hidden), [false, false]);
  assert.deepStrictEqual(SettingsLogic.writeOperations(PER_APP_ROWS[0], "smooth", playing, PER_APP)[0].params,
    { category: "picture", settings: { truMotionMode: "smooth" }, app_id: "org.webosbrew.minimalhome" }, "no dimension: the TV keeps it for what plays");
  const other = perAppState({ input: "hdmi3", pictureMode: "eco" }, { input: "hdmi2", pictureMode: "eco" });
  assert.deepStrictEqual(PER_APP_ROWS.slice(0, 2).map((row) => SettingsLogic.rowView(row, other).hidden), [true, true]);
  assert.strictEqual(SettingsLogic.contextReads(PER_APP_ROWS, PER_APP, other).some((operation) => operation.params.app_id), false);
  assert.strictEqual(SettingsLogic.contextReads(PER_APP_ROWS, PER_APP, playing).filter((operation) => operation.params.app_id).length, 2);
  const apps = perAppState({ input: "default", pictureMode: "normal" }, { input: "default", pictureMode: "normal" });
  assert.deepStrictEqual(PER_APP_ROWS.slice(0, 2).map((row) => SettingsLogic.rowView(row, apps).hidden), [false, true], "no aspect ratio for apps");
});

test("Apply to all inputs copies what plays, as LG writes it; a picture reset also clears the mode's (User Settings)", () => {
  const state = perAppState({ input: "hdmi3", pictureMode: "eco", dynamicRange: "sdr" }, { input: "hdmi2" });
  const apply = Object.assign({}, PER_APP_ROWS[3], { playing: true });
  assert.deepStrictEqual(SettingsLogic.actionOperations(apply, state), [
    { method: "setSystemSettings", params: { category: "picture", settings: { applyToAllInput: "picture" } } }
  ]);
  assert.strictEqual(SettingsLogic.rowView(apply, state).hidden, true, "HDMI 3 isn't playing");
  assert.strictEqual(SettingsLogic.rowView(apply, perAppState({ input: "hdmi2", pictureMode: "eco" }, { input: "hdmi2" })).hidden, false);
  assert.deepStrictEqual(SettingsLogic.actionOperations(PER_APP_ROWS[4], state), [
    { method: "resetSystemSettings", params: { category: "picture", dimension: { input: "hdmi3", pictureMode: "eco" } } },
    { method: "setSystemSettings", params: { category: "picture", settings: { pictureSettingModified: { eco: false, normal: false } }, dimension: { input: "hdmi3" } } }
  ]);
  const unchanged = Object.assign({}, state, { context: { input: "hdmi3", pictureMode: "normal" } });
  assert.strictEqual(SettingsLogic.actionOperations(PER_APP_ROWS[4], unchanged).length, 1, "the flag is already off");
  assert.strictEqual(SettingsLogic.actionOperations(PER_APP_ROWS[4], perAppState({ input: "hdmi3" }, {})), null, "the mode isn't known yet");
  const view = SettingsLogic.rowView(PER_APP_ROWS[4], state);
  assert.deepStrictEqual([view.hidden, view.text], [false, ""], "an action without a key of its own shows");
});

test("the sound reset restores LG's keys for the sound mode, which only Standard offers", () => {
  const reset = { key: "soundReset", kind: "action", action: { reset: "sound" }, greyedWhen: { key: "soundMode", except: ["standard"], reason: "Standard only" } };
  const standard = { values: { soundMode: "standard" }, descs: {}, notes: {}, context: {}, now: {} };
  assert.deepStrictEqual(SettingsLogic.actionOperations(reset, standard),
    [{ method: "resetSystemSettings", params: { category: "sound", keys: ["audioBalance", "userEqualizerValues", "soundModeModified"] } }]);
  assert.deepStrictEqual(SettingsLogic.soundResetKeys("movie"), ["audioBalance", "soundModeModified"]);
  assert.strictEqual(SettingsLogic.rowView(reset, standard).greyed, false);
  assert.strictEqual(SettingsLogic.rowView(reset, Object.assign({}, standard, { values: { soundMode: "movie" } })).reason, "Standard only");
  assert.throws(() => SettingsLogic.checkResults([{ returnValue: true }, { returnValue: false, errorText: "Busy" }]), /Busy/);
  assert.doesNotThrow(() => SettingsLogic.checkResults(undefined));
});

test("a row that asks before its first change asks once while it is being changed", () => {
  const row = { key: "energySavingAutoMin", kind: "range", confirm: { any: true, prompt: "?" } };
  assert.strictEqual(SettingsLogic.needsConfirm(row, 4, false), true);
  assert.strictEqual(SettingsLogic.needsConfirm(row, 3, true), false);
});

test("Sound out offers the TV speaker and optical always, and the outputs the audio service names", () => {
  const rows = [{ key: "soundOutput", source: "soundOut", kind: "choice" }];
  // As the TV answered after Home switched to the TV speaker: the list holds only the output in use.
  const { state } = SettingsLogic.applySources(SettingsLogic.emptyPageState(), rows,
    [{ soundOutput: "tv_speaker", lastSoundOutput: "external_arc", settingsSoundOutputs: ["tv_speaker"] }], {});
  assert.deepStrictEqual(SettingsLogic.rowView(rows[0], state).values, ["tv_speaker", "tv_external_speaker", "external_optical", "external_arc"],
    "so it can switch back");
  assert.deepStrictEqual(SettingsLogic.sourceWrite(rows[0], "tv_speaker"),
    ["luna://com.webos.settingsservice/setSystemSettings", { category: "sound", settings: { soundOutput: "tv_speaker" } }]);
});

test("Always Ready and Power on screen are made of LG's keys and written as LG writes them", () => {
  const rows = [{ key: "alwaysReady", source: "alwaysReady", kind: "choice" }, { key: "powerOnScreen", source: "powerOnScreen", kind: "choice" }];
  const read = (mode, home, input) => SettingsLogic.applySources(SettingsLogic.emptyPageState(), rows, [
    { settings: { lifeOnScreenMode: mode } }, { settings: { homeAutoLaunch: home, selectedInputApp: input } }
  ], {}).state.values;
  assert.deepStrictEqual(read("none", "on", "off"), { alwaysReady: "off", powerOnScreen: "home" });
  assert.deepStrictEqual(read("alwaysReady", "off", "off"), { alwaysReady: "on", powerOnScreen: "recent" });
  assert.deepStrictEqual(read("allEnabled", "off", "HDMI_2"), { alwaysReady: "on", powerOnScreen: "HDMI_2" });
  assert.deepStrictEqual(SettingsLogic.sourceWrite(rows[0], "on")[1].operations.map((operation) => operation.params.settings),
    [{ lifeOnScreenMode: "allEnabled" }, { erpUserConfirm: true }]);
  assert.deepStrictEqual(SettingsLogic.sourceWrite(rows[0], "off")[1].operations.map((operation) => operation.params.settings), [{ lifeOnScreenMode: "off" }]);
  assert.deepStrictEqual(SettingsLogic.sourceWrite(rows[1], "recent")[1].settings,
    { homeAutoLaunch: "off", selectedInputApp: "off", checkHomeAutoLaunchValue: "user" });
  assert.deepStrictEqual(SettingsLogic.sourceWrite(rows[1], "home")[1].settings,
    { homeAutoLaunch: "on", selectedInputApp: "off", checkHomeAutoLaunchValue: "user" });
});

test("grayscale turns screen zoom off first, then writes both colour filters with high contrast off", () => {
  const rows = [{ key: "grayscale", source: "colourFilters", kind: "choice" }, { key: "invertColours", source: "colourFilters", kind: "choice" }];
  const { state } = SettingsLogic.applySources(SettingsLogic.emptyPageState(), rows, [{ settings: { adjustments: { blackAndWhite: "off", colorInversion: "on" } } }], {});
  assert.deepStrictEqual([state.values.grayscale, state.values.invertColours], ["off", "on"]);
  assert.deepStrictEqual(SettingsLogic.sourceWrite(rows[0], "on")[1].operations.map((operation) => operation.params.settings), [
    { screenMagnification: "off" },
    { adjustments: { blackAndWhite: "on", colorInversion: "off" }, highContrast: "off", focusEmphasis: "off" }
  ]);
});

test("on/off choices go off first, so Left turns a switch off and Right on", () => {
  const row = { key: "wolwowlOnOff", category: "network", kind: "choice" };
  const state = { values: { wolwowlOnOff: "true" }, descs: { wolwowlOnOff: { dims: [], visible: true, active: true,
    choices: [{ value: "true" }, { value: "false" }] } }, notes: {}, context: {}, now: {} };
  const view = SettingsLogic.rowView(row, state);
  assert.deepStrictEqual(view.values, ["false", "true"]);
  assert.strictEqual(SettingsLogic.nextRowValue(row, view, -1), "false");
  state.descs.wolwowlOnOff.choices = [{ value: "low" }, { value: "high" }];
  assert.deepStrictEqual(SettingsLogic.rowView(row, Object.assign({}, state, { values: { wolwowlOnOff: "low" } })).values, ["low", "high"], "other pairs keep the TV's order");
});
