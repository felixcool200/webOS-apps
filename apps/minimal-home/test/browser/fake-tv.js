// A fake TV for the browser tests: Homebrew Channel's exec service and the Luna calls Minimal Home
// makes, answered from memory. It is loaded before webos.js. A test changes it through the `tv`
// options of BrowserTest.define (window.TEST_TV), read when the first call comes in:
//   apps, inputs: what listApps and eim/getAllInputStatus report
//   hooked: false when the button hook's library is not in the input program
//   bindings: the bindings file's contents
//   settings: { picture: {...}, sound: {...}, option: {...} } as getSystemSettings reports them
//   delays: { name: ms or [ms for the 1st call, 2nd, ...] } for listApps, settings, bindings, inputs
//   lose: { name: [call numbers whose reply never comes, from 1] }
//   fail: ["getSystemSettingValues:energySaving", ...] reads that answer returnValue false
// window.FAKE_TV keeps what happened: files, launched apps, settings written, calls made.
(function () {
  "use strict";

  var CONFIG = "/home/root/.config/lginputhook/keybinds.json";
  var BACKUP = CONFIG + ".before-test";
  var tv = window.FAKE_TV = { files: {}, hookLog: ["boot"], launched: [], written: [], calls: [], counts: {}, ready: false };

  var APPS = [
    { id: "youtube.leanback.v4", title: "YouTube" }, { id: "netflix", title: "Netflix" },
    { id: "x.departures", title: "Departures" }, { id: "org.webosbrew.hbchannel", title: "Homebrew Channel" },
    { id: "amazon.alexa.view", title: "Alexa" }, { id: "com.webos.app.camera", title: "Camera" }
  ];

  function options() { return window.TEST_TV || {}; }

  function setUp() {
    if (tv.ready) { return; }
    tv.ready = true;
    var settings = options().settings || {};
    tv.settings = {
      picture: Object.assign({ pictureMode: "normal", backlight: "80", brightness: "50", contrast: "85", colorTemperature: "0", energySaving: "auto" }, settings.picture),
      sound: Object.assign({ soundMode: "standard" }, settings.sound),
      option: Object.assign({ quickStartMode: "on" }, settings.option)
    };
    tv.files[CONFIG] = JSON.stringify(options().bindings || { "1038": { action: "ignore" } });
    tv.hooked = options().hooked !== false;
  }

  // How long the reply to this call takes, and whether it comes at all.
  function timing(name) {
    tv.counts[name] = (tv.counts[name] || 0) + 1;
    var number = tv.counts[name];
    var delay = (options().delays || {})[name];
    if (Array.isArray(delay)) { delay = delay[Math.min(number, delay.length) - 1]; }
    var lost = ((options().lose || {})[name] || []).indexOf(number) >= 0;
    return { delay: delay || 20, lost: lost };
  }

  function fails(what) {
    return (options().fail || []).indexOf(what) >= 0;
  }

  var VALUES = {
    pictureMode: ["normal", "vivid", "cinema"], energySaving: ["off", "auto", "max"],
    soundMode: ["standard", "movie"], quickStartMode: ["on", "off"]
  };

  // The reply of a Luna call (an object), or null for a service the fake doesn't know.
  function lunaReply(uri, payload) {
    var method = uri.replace("luna://", "");
    if (/applicationManager\/listApps$/i.test(method)) { return { returnValue: true, apps: options().apps || APPS }; }
    if (/applicationManager\/launch$/i.test(method)) {
      tv.launched.push(payload.id);
      return { returnValue: true };
    }
    if (/settingsservice\/getSystemSettings$/.test(method)) {
      if (fails("getSystemSettings:" + payload.category)) { return { returnValue: false, errorText: "Unknown category" }; }
      var read = {};
      (payload.keys || []).forEach(function (key) { read[key] = tv.settings[payload.category][key]; });
      return { returnValue: true, settings: read, dimension: payload.category === "picture" ? { input: "hdmi1", pictureMode: "normal" } : {} };
    }
    if (/settingsservice\/getSystemSettingValues$/.test(method)) {
      if (fails("getSystemSettingValues:" + payload.key)) { return { returnValue: false, errorText: "Unknown key " + payload.key }; }
      return { returnValue: true, values: { arrayExt: (VALUES[payload.key] || []).map(function (value) { return { value: value }; }) } };
    }
    if (/settingsservice\/setSystemSettings$/.test(method)) {
      Object.keys(payload.settings).forEach(function (key) {
        tv.settings[payload.category][key] = String(payload.settings[key]);
        tv.written.push([key, payload.settings[key]]);
      });
      return { returnValue: true };
    }
    if (/connectionmanager\/getstatus$/.test(method)) { return { returnValue: true, wired: { state: "disconnected" }, wifi: { state: "connected", ssid: "Home" } }; }
    if (/wifi\/getstatus$/.test(method)) { return { returnValue: true, status: "connectionStateChanged" }; }
    if (/eim\/getAllInputStatus$/.test(method)) {
      var count = options().inputs || 3;
      var devices = [];
      for (var port = 1; port <= count; port += 1) {
        devices.push({ id: "HDMI_" + port, port: port, label: "HDMI " + port, appId: "com.webos.app.hdmi" + port, icon: "HDMI_" + port + ".png",
          iconPrefix: "/usr/palm/plugins/inputapps/assets/small/", connected: true, hdmiPlugIn: port === 1, activate: false });
      }
      return { returnValue: true, devices: devices };
    }
    if (/eim\/getLastInput$/.test(method)) { return { returnValue: true, lastSourceAppId: "com.webos.app.hdmi1" }; }
    if (/notification\/createToast$/.test(method)) { return { returnValue: true }; }
    return null;
  }

  // The luna-send calls in a shell command: [uri, payload] pairs.
  function lunaSends(command) {
    var found = [];
    var pattern = /luna-send -n 1 -f '([^']+)' '((?:[^']|'\\'')*)'/g;
    var match;
    while ((match = pattern.exec(command))) { found.push([match[1], JSON.parse(match[2].replace(/'\\''/g, "'"))]); }
    return found;
  }

  function decode(text) {
    return new TextDecoder().decode(Uint8Array.from(atob(text), function (character) { return character.charCodeAt(0); }));
  }

  function restore() {
    if (tv.files[BACKUP] !== undefined) {
      tv.files[CONFIG] = tv.files[BACKUP];
      delete tv.files[BACKUP];
    }
  }

  // The reply to a Homebrew Channel exec command, and the name used for its timing.
  function execReply(command) {
    var writes = /echo (\S+) \| base64 -d > (\S+)\.new/g;
    var write = writes.exec(command);
    if (write) {
      // Every file the command writes; a copied file is kept as the path it came from.
      for (; write; write = writes.exec(command)) { tv.files[write[2]] = decode(write[1]); }
      var copies = /cp (\S+) (\S+)\.new/g;
      for (var copy = copies.exec(command); copy; copy = copies.exec(command)) { tv.files[copy[2]] = { from: copy[1] }; }
      return ["write", ""];
    }
    if (command.indexOf("ln -s / ") >= 0) { return ["iconLink", options().firstStart ? "made\n" : ""]; }
    if (command.indexOf("[ ! -f " + BACKUP + " ] ||") === 0) {
      restore();
      if (command.indexOf("libinputhookpp") < 0) { return ["restore", ""]; }
      return ["bindings", (tv.hooked ? "hooked" : "unhooked") + "\n" + (tv.files[CONFIG] || "{}")];
    }
    if (command.indexOf("[ -f " + BACKUP + " ] || cp") === 0) {
      if (tv.files[BACKUP] === undefined) { tv.files[BACKUP] = tv.files[CONFIG] || "{}"; }
      return ["setAside", ""];
    }
    if (command.indexOf("awk -v s=") >= 0) {
      var start = parseInt(command.split("s=")[1], 10);
      var codes = [];
      tv.hookLog.forEach(function (line, index) {
        var match = /state=1 uinput_code=(\d+)/.exec(line);
        if (index + 1 > start && start >= 0 && match) { codes.push(match[1]); }
      });
      return ["poll", codes.concat(["#" + tv.hookLog.length]).join("\n") + "\n"];
    }
    var sends = lunaSends(command);
    if (command.indexOf("& wait;") >= 0) {
      var name = /settingsservice/.test(command) ? "settings" : /eim\//.test(command) ? "inputs" : "batch";
      return [name, sends.map(function (call, index) {
        var reply = lunaReply(call[0], call[1]);
        return "--- reply " + index + "\n" + (reply ? JSON.stringify(reply) : "") + "\n";
      }).join("")];
    }
    if (sends.length === 1) {
      var single = lunaReply(sends[0][0], sends[0][1]);
      var kind = /listApps/.test(sends[0][0]) ? "listApps" : /launch/.test(sends[0][0]) ? "launch" : "luna";
      return [kind, single ? JSON.stringify(single) : ""];
    }
    return ["unknown", ""];
  }

  window.PalmServiceBridge = function () {};
  window.PalmServiceBridge.prototype.call = function (uri, payload) {
    setUp();
    var bridge = this;
    var body = JSON.parse(payload || "{}");
    var name;
    var reply;
    if (uri === "luna://org.webosbrew.hbchannel.service/exec") {
      // The reply is worked out when the call is made, as on the TV, and arrives after its delay.
      var answer = execReply(body.command || "");
      name = answer[0];
      reply = { returnValue: true, stdoutString: answer[1] };
    } else {
      reply = lunaReply(uri, body) || { returnValue: false, errorText: "Unknown method" };
      name = uri.split("/").pop();
    }
    var when = timing(name);
    tv.calls.push([name, Math.round(performance.now()), body.command ? body.command.slice(0, 60) : uri]);
    if (when.lost) { return; }
    setTimeout(function () { bridge.onservicecallback(JSON.stringify(reply)); }, when.delay);
  };
  window.PalmServiceBridge.prototype.cancel = function () {};
}());
