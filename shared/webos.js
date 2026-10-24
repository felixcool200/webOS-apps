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

  // timeoutMs: how long to wait for the reply (CALL_TIMEOUT_MS when left out).
  function lunaCall(uri, payload, timeoutMs) {
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
      }, timeoutMs || CALL_TIMEOUT_MS);
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
  function rootExec(command, timeoutMs) {
    return lunaCall("luna://org.webosbrew.hbchannel.service/exec", { command: command }, timeoutMs);
  }

  // Like rootExec, but rejects when the command fails or Homebrew Channel does not answer.
  function rootShell(command, timeoutMs) {
    return rootExec(command, timeoutMs).then(function (result) {
      if (!result || result.returnValue === false) {
        throw new Error(String((result && (result.stderrString || result.errorText)) || "No response").trim());
      }
      return result;
    });
  }

  function lunaSendCommand(uri, payload) {
    return "luna-send -n 1 -f '" + uri + "' '" + JSON.stringify(payload || {}).replace(/'/g, "'\\''") + "'";
  }

  // A luna-send reply (its text), or an Error when there is none or it says returnValue false.
  function readReply(text, fallbackError) {
    if (!text) { return new Error(fallbackError || "No response"); }
    var response;
    try { response = JSON.parse(text); } catch (error) { return new Error("Unreadable reply: " + error.message); }
    if (response.returnValue === false) { return new Error(response.errorText || response.error || "Request failed"); }
    return response;
  }

  // Runs a Luna call as root. Rejects when there is no answer or the call answers returnValue false.
  function rootLuna(uri, payload, timeoutMs) {
    return rootExec(lunaSendCommand(uri, payload), timeoutMs).then(function (outer) {
      var response = readReply(outer && outer.stdoutString, outer && outer.errorText);
      if (response instanceof Error) { throw response; }
      return response;
    });
  }

  // Runs several Luna calls as root in one shell, side by side: one root call instead of one each.
  // `calls` are [uri, payload] pairs. Resolves to their replies in order; a call that failed gives an
  // Error in its place, so one failure doesn't lose the others.
  function rootLunaBatch(calls, timeoutMs) {
    var marker = "--- reply ";
    var script = "d=$(mktemp -d); " + calls.map(function (call, index) {
      return "(" + lunaSendCommand(call[0], call[1]) + " > $d/" + index + " 2>/dev/null) & ";
    }).join("") + "wait; for i in " + calls.map(function (call, index) { return index; }).join(" ") +
      "; do echo '" + marker + "'$i; cat $d/$i; done; rm -rf $d";
    return rootShell(script, timeoutMs).then(function (result) {
      var parts = String(result.stdoutString || "").split(marker);
      return calls.map(function (call, index) {
        var part = parts.filter(function (text) { return text.indexOf(index + "\n") === 0; })[0];
        return readReply(part && part.slice(String(index).length + 1).trim());
      });
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
    rootLunaBatch: rootLunaBatch,
    wait: wait, retry: retry, base64: base64, backToHome: backToHome
  };
}());

if (typeof module !== "undefined") { module.exports = WebOS; }
