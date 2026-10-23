// Shared by every app: remote key codes, Luna service calls and root shell commands. The build copies
// it into each app as webos.js, which index.html loads before the app's own scripts.
var WebOS = (function () {
  "use strict";

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461 };
  var HOME_ID = "org.webosbrew.minimalhome";
  // A call without a reply by then fails, so a lost reply can't hold up whatever waits for it.
  var CALL_TIMEOUT_MS = 15000;
  // Bridges of calls still waiting for their reply. A bridge that is garbage collected may drop its call.
  var waiting = [];

  function lunaCall(uri, payload) {
    return new Promise(function (resolve, reject) {
      var bridge;
      var timer = null;
      function settle(error, response) {
        if (timer === null) { return; }
        clearTimeout(timer);
        timer = null;
        waiting.splice(waiting.indexOf(bridge), 1);
        if (error) { reject(error); } else { resolve(response); }
      }
      try {
        bridge = new window.PalmServiceBridge();
      } catch (error) {
        reject(error);
        return;
      }
      waiting.push(bridge);
      timer = setTimeout(function () {
        settle(new Error("No reply from " + uri));
        try { bridge.cancel(); } catch (ignore) { /* The call may have ended meanwhile. */ }
      }, CALL_TIMEOUT_MS);
      bridge.onservicecallback = function (raw) {
        try { settle(null, JSON.parse(raw)); }
        catch (error) { settle(error); }
      };
      try { bridge.call(uri, JSON.stringify(payload || {})); }
      catch (error) { settle(error); }
    });
  }

  // Runs a shell command as root through Homebrew Channel's exec service. The reply holds the output
  // in stdoutString, and returnValue is false when the command fails.
  function rootExec(command) {
    return lunaCall("luna://org.webosbrew.hbchannel.service/exec", { command: command });
  }

  // Like rootExec, but rejects when the command fails or Homebrew Channel does not answer.
  function rootShell(command) {
    return rootExec(command).then(function (result) {
      if (!result || result.returnValue === false) {
        throw new Error(String((result && (result.stderrString || result.errorText)) || "No response").trim());
      }
      return result;
    });
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

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Runs task (a function returning a promise), and again after each of the delays in turn while it
  // fails. Settles like the last try.
  function retry(task, delays) {
    return task().catch(function (error) {
      if (!delays.length) { throw error; }
      return wait(delays[0]).then(function () { return retry(task, delays.slice(1)); });
    });
  }

  // Base64 of the text's UTF-8 bytes, so any text can pass through a shell command unchanged.
  function base64(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    for (var i = 0; i < bytes.length; i += 1) { binary += String.fromCharCode(bytes[i]); }
    return btoa(binary);
  }

  // Back in an app opened from Minimal Home: bring Home to the front and leave this app running.
  // close() makes webOS show its own last-input screen for about a second before Home, and
  // platformBack() asks "exit the app?".
  function backToHome() {
    var home = { id: HOME_ID };
    lunaCall("luna://com.webos.service.applicationManager/launch", home).then(function (response) {
      if (response.returnValue === false) { throw new Error(response.errorText || "Launch denied"); }
    }).catch(function () {
      return rootLuna("luna://com.webos.service.applicationManager/launch", home);
    }).catch(function () {
      if (window.webOSSystem && window.webOSSystem.close) { window.webOSSystem.close(); }
    });
  }

  return {
    KEY: KEY, HOME_ID: HOME_ID, lunaCall: lunaCall, rootExec: rootExec, rootShell: rootShell, rootLuna: rootLuna,
    wait: wait, retry: retry, base64: base64, backToHome: backToHome
  };
}());

if (typeof module !== "undefined") { module.exports = WebOS; }
