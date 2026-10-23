"use strict";

const test = require("node:test");
const assert = require("node:assert");
const SourcesLogic = require("../app/sources-logic.js");

const hdmi = (port, extra) => Object.assign({
  id: "HDMI_" + port, port: port, label: "HDMI " + port, appId: "com.webos.app.hdmi" + port,
  icon: "HDMI_" + port + ".png", iconPrefix: "/usr/palm/plugins/inputapps/assets/small/", connected: false, activate: false
}, extra);

test("Live TV comes first, then the inputs by kind and port", () => {
  const status = { devices: [hdmi(3), { id: "DP_1", port: 1, label: "DP 1", appId: "com.webos.app.dp1" }, hdmi(1), { id: "AV_1", port: 1, label: "AV", appId: "com.webos.app.externalinput.av1" }] };
  assert.deepStrictEqual(SourcesLogic.list(status, null).map((source) => source.id), ["LIVE_TV", "HDMI_1", "HDMI_3", "DP_1", "AV_1"]);
});

test("each input shows the user's name, LG's icon and its state", () => {
  const status = { devices: [hdmi(1, { label: "Apple TV", connected: true, hdmiPlugIn: true, activate: true }), hdmi(2, { connected: true, hdmiPlugIn: true }), hdmi(3)] };
  const [liveTv, appleTv, second, third] = SourcesLogic.list(status, null);
  assert.strictEqual(appleTv.label, "Apple TV");
  assert.strictEqual(appleTv.icon, "/usr/palm/plugins/inputapps/assets/small/HDMI_1.png");
  assert.deepStrictEqual([liveTv.stateText, appleTv.stateText, second.stateText, third.stateText], ["TV channels", "On", "Connected", "Nothing detected"]);
});

test("an HDMI port eim calls connected, with nothing plugged in, shows as empty", () => {
  // As read on the TV with no HDMI device attached: connected stays true, hdmiPlugIn is false.
  const [, port] = SourcesLogic.list({ devices: [hdmi(3, { connected: true, hdmiPlugIn: false })] }, null);
  assert.strictEqual(port.stateText, "Nothing detected");
  const [, dp] = SourcesLogic.list({ devices: [{ id: "DP_1", port: 1, label: "DP 1", appId: "com.webos.app.dp1", connected: true }] }, null);
  assert.strictEqual(dp.stateText, "Connected", "inputs without hdmiPlugIn use connected");
});

test("the input used last is marked and still shows its state", () => {
  const sources = SourcesLogic.list({ devices: [hdmi(1, { connected: true, hdmiPlugIn: false }), hdmi(2)] }, "com.webos.app.hdmi1");
  assert.strictEqual(sources[1].last, true);
  assert.strictEqual(sources[1].stateText, "Nothing detected");
  assert.strictEqual(sources[0].last, false);
});

test("without an answer from the TV only Live TV is offered", () => {
  assert.deepStrictEqual(SourcesLogic.list(null, null).map((source) => source.appId), ["com.webos.app.livetv"]);
});
