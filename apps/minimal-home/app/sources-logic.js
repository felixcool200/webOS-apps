// The Sources view's rules without the page: which inputs to offer, in what order, and what state to
// show for each. sources.js uses them; test/sources-logic.test.js checks them in Node.
var SourcesLogic = (function () {
  "use strict";

  var ICONS = "/usr/palm/plugins/inputapps/assets/small/";
  var LIVE_TV = { id: "LIVE_TV", appId: "com.webos.app.livetv", label: "Live TV", icon: ICONS + "tv.png", port: 0 };
  // External inputs by kind, in this order; anything else (AV, component, SCART) comes last.
  var KINDS = ["HDMI", "DP", "USBC"];
  var STATES = { last: "Last used", active: "On", connected: "Connected", empty: "Nothing connected" };

  function kindRank(id) {
    var index = KINDS.indexOf(String(id).split("_")[0]);
    return index < 0 ? KINDS.length : index;
  }

  // The inputs from eim/getAllInputStatus (`status`), after Live TV, by kind and port. `lastAppId` is
  // the input app used last (eim/getLastInput), shown as such. An input is active with a live device,
  // connected with a device that is off or idle, and empty otherwise.
  function list(status, lastAppId) {
    var devices = (status && status.devices || []).filter(function (device) { return device && device.appId; })
      .slice().sort(function (left, right) {
        return kindRank(left.id) - kindRank(right.id) || (left.port || 0) - (right.port || 0);
      }).map(function (device) {
        return {
          id: device.id,
          appId: device.appId,
          label: device.label || device.id,
          icon: (device.iconPrefix || ICONS) + (device.icon || "HDMI_sub.png"),
          state: device.activate ? "active" : device.connected ? "connected" : "empty"
        };
      });
    return [Object.assign({ state: "active" }, LIVE_TV)].concat(devices).map(function (source) {
      source.last = source.appId === lastAppId;
      source.stateText = source.last ? STATES.last : STATES[source.state];
      return source;
    });
  }

  return { list: list, LIVE_TV: LIVE_TV };
}());

if (typeof module !== "undefined") { module.exports = SourcesLogic; }
