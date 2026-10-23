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
  const status = { devices: [hdmi(1, { label: "Apple TV", connected: true, activate: true }), hdmi(2, { connected: true }), hdmi(3)] };
  const [, appleTv, second, third] = SourcesLogic.list(status, null);
  assert.strictEqual(appleTv.label, "Apple TV");
  assert.strictEqual(appleTv.icon, "/usr/palm/plugins/inputapps/assets/small/HDMI_1.png");
  assert.deepStrictEqual([appleTv.stateText, second.stateText, third.stateText], ["On", "Connected", "Nothing connected"]);
});

test("the input used last says so", () => {
  const sources = SourcesLogic.list({ devices: [hdmi(1, { connected: true }), hdmi(2)] }, "com.webos.app.hdmi1");
  assert.strictEqual(sources[1].last, true);
  assert.strictEqual(sources[1].stateText, "Last used");
  assert.strictEqual(sources[0].last, false);
});

test("without an answer from the TV only Live TV is offered", () => {
  assert.deepStrictEqual(SourcesLogic.list(null, null).map((source) => source.appId), ["com.webos.app.livetv"]);
});
