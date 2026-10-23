// Shared by every app: remote key codes and Luna service calls. The build puts this in front of
// each app's own app.js.
var WebOS = (function () {
  "use strict";

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461 };

  function lunaCall(uri, payload) {
    return new Promise(function (resolve, reject) {
      try {
        var bridge = new window.PalmServiceBridge();
        bridge.onservicecallback = function (raw) {
          try { resolve(JSON.parse(raw)); }
          catch (error) { reject(error); }
        };
        bridge.call(uri, JSON.stringify(payload || {}));
      } catch (error) { reject(error); }
    });
  }

  // Runs a shell command as root through Homebrew Channel's exec service.
  function rootExec(command) {
    return lunaCall("luna://org.webosbrew.hbchannel.service/exec", { command: command });
  }

  // Runs a Luna call as root. Rejects when there is no answer or the call answers returnValue false.
  function rootLuna(uri, payload) {
    var encoded = JSON.stringify(payload || {}).replace(/'/g, "'\\''");
    return rootExec("luna-send -n 1 -f '" + uri + "' '" + encoded + "'").then(function (outer) {
      if (!outer || !outer.stdoutString) { throw new Error((outer && outer.errorText) || "No response"); }
      var response = JSON.parse(outer.stdoutString);
      if (response.returnValue === false) { throw new Error(response.errorText || response.error || "Request failed"); }
      return response;
    });
  }

  // Back in an app opened from Minimal Home: bring Home to the front and leave this app running.
  // close() makes webOS show its own last-input screen for about a second before Home, and
  // platformBack() asks "exit the app?".
  function backToHome() {
    var home = { id: "org.webosbrew.minimalhome" };
    lunaCall("luna://com.webos.service.applicationManager/launch", home).then(function (response) {
      if (response.returnValue === false) { throw new Error(response.errorText || "Launch denied"); }
    }).catch(function () {
      return rootLuna("luna://com.webos.service.applicationManager/launch", home);
    }).catch(function () {
      if (window.webOSSystem && window.webOSSystem.close) { window.webOSSystem.close(); }
    });
  }

  return { KEY: KEY, lunaCall: lunaCall, rootExec: rootExec, rootLuna: rootLuna, backToHome: backToHome };
}());
