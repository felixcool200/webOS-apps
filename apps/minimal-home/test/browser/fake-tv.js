// A fake TV for the browser tests: Homebrew Channel's exec service and the Luna calls Minimal Home
// makes, answered from memory. It is loaded before webos.js. A test changes it through the `tv`
// options of BrowserTest.define (window.TEST_TV), read when the first call comes in:
//   apps, inputs: what listApps and eim/getAllInputStatus report
//   hooked: false when the button hook's library is not in the input program
//   bindings: the bindings file's contents
//   settings: { picture: {...}, sound: {...}, option: {...} } values for every input and mode
//   inputSettings: { hdmi2: { picture: {...} } } values for one input, in every mode
//   now: the context the TV is in, such as { input: "hdmi2" } (apps, SDR, media sound by default)
//   desc: { "picture.localDimming": { visible: false } } changes a key's description's ui
//   delays: { name: ms or [ms for the 1st call, 2nd, ...] } for listApps, settings, bindings, inputs
//   lose: { name: [call numbers whose reply never comes, from 1] }
//   fail: ["getSystemSettingValues:energySaving", "getSystemSettingDesc:picture", ...] reads that
//     answer returnValue false
// window.FAKE_TV keeps what happened: files, launched apps (with their params in `launches`),
// settings written (`written` as [key, value], `writes` with their category and dimension), calls made.
(function () {
  "use strict";

  var CONFIG = "/home/root/.config/lginputhook/keybinds.json";
  var BACKUP = CONFIG + ".before-test";
  var tv = window.FAKE_TV = { files: {}, hookLog: ["boot"], launched: [], launches: [], written: [], writes: [], calls: [], counts: {}, ready: false };

  var APPS = [
    { id: "youtube.leanback.v4", title: "YouTube" }, { id: "netflix", title: "Netflix" },
    { id: "x.departures", title: "Departures" }, { id: "org.webosbrew.hbchannel", title: "Homebrew Channel" },
    { id: "amazon.alexa.view", title: "Alexa" }, { id: "com.webos.app.camera", title: "Camera" }
  ];

  function options() { return window.TEST_TV || {}; }

  // settingsservice's keys: their dimension fields (a key with some keeps a value per dimension, such
  // as per input and picture mode), and their choices or range, as the TV describes them.
  var MODE = ["input", "pictureMode"];
  var LEVELS = ["off", "low", "medium", "high"];
  var DESC = {
    picture: {
      pictureMode: { dims: ["input", "dynamicRange"], choices: ["normal", "vivid", "cinema", "eco"] },
      energySaving: { dims: [], choices: ["auto", "off", "min", "med", "max"] },
      pictureSettingModified: { dims: ["input"] },
      backlight: { dims: MODE, range: [0, 100] }, contrast: { dims: MODE, range: [0, 100] }, brightness: { dims: MODE, range: [0, 100] },
      dynamicContrast: { dims: MODE, choices: LEVELS }, gamma: { dims: MODE, choices: ["low", "medium", "high1", "high2"] },
      localDimming: { dims: MODE, choices: LEVELS }, motionEyeCare: { dims: MODE, choices: ["off", "on"] },
      color: { dims: MODE, range: [0, 100] }, tint: { dims: MODE, range: [-50, 50] }, colorTemperature: { dims: MODE, range: [-50, 50] },
      colorGamut: { dims: MODE, choices: ["auto", "native", "adobeRGB"] }, dynamicColor: { dims: MODE, choices: LEVELS.concat("user") },
      sharpness: { dims: MODE, range: [0, 50] }, superResolution: { dims: MODE, choices: LEVELS },
      noiseReduction: { dims: MODE, choices: LEVELS.concat("auto") }, mpegNoiseReduction: { dims: MODE, choices: LEVELS.concat("auto") },
      smoothGradation: { dims: MODE, choices: LEVELS }, realCinema: { dims: MODE, choices: ["on", "off"] },
      eyeComfortMode: { dims: [], choices: ["on", "off"] }, filmMakerMode: { dims: [], choices: ["on", "off"] }
    },
    aiPicture: { ai_Brightness: { dims: MODE, choices: ["on", "off"] } },
    sound: { soundMode: { dims: ["audioInput", "soundOutput"], choices: ["standard", "movie"] } },
    option: { quickStartMode: { dims: [], choices: ["on", "off"] } }
  };
  // Values as the TV reports them, most ranges as text.
  var DEFAULTS = {
    picture: {
      pictureMode: "normal", energySaving: "off", backlight: "80", brightness: 50, contrast: "85", colorTemperature: "0",
      dynamicContrast: "low", gamma: "high1", localDimming: "low", motionEyeCare: "off", color: "55", tint: "0", colorGamut: "native",
      dynamicColor: "low", sharpness: "25", superResolution: "off", noiseReduction: "off", mpegNoiseReduction: "off",
      smoothGradation: "low", realCinema: "on", eyeComfortMode: "off", filmMakerMode: "on",
      pictureSettingModified: { normal: false, vivid: false, cinema: false, eco: false }
    },
    aiPicture: { ai_Brightness: "off" },
    sound: { soundMode: "standard" },
    option: { quickStartMode: "on" }
  };

  function setUp() {
    if (tv.ready) { return; }
    tv.ready = true;
    // Values written or set by the test, by category, key and dimension (storeKey).
    tv.values = {};
    tv.now = Object.assign({ input: "default", dynamicRange: "sdr", audioInput: "media", soundOutput: "tv_external_speaker" }, options().now);
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

  function descOf(category, key) {
    return DESC[category] && DESC[category][key];
  }

  function storeKey(category, key, dimension) {
    return category + "." + key + "|" + Object.keys(dimension).sort().map(function (field) { return field + "=" + dimension[field]; }).join(",");
  }

  // A key's value in a dimension: written, set by the test for that input or for all, or the default.
  function valueOf(category, key, dimension) {
    var stored = tv.values[storeKey(category, key, dimension)];
    if (stored !== undefined) { return stored; }
    var forInput = dimension.input && ((options().inputSettings || {})[dimension.input] || {})[category];
    if (forInput && forInput[key] !== undefined) { return forInput[key]; }
    var set = (options().settings || {})[category];
    return set && set[key] !== undefined ? set[key] : DEFAULTS[category][key];
  }

  // The dimension a request targets: the one it names, or the TV's current context, where the
  // picture mode is the mode of the input in question.
  function dimensionOf(category, key, given) {
    var dimension = {};
    descOf(category, key).dims.forEach(function (field) {
      if (given) { dimension[field] = given[field]; }
      else if (field === "pictureMode") { dimension[field] = valueOf("picture", "pictureMode", { dynamicRange: tv.now.dynamicRange, input: tv.now.input }); }
      else { dimension[field] = tv.now[field]; }
    });
    return dimension;
  }

  // Whether a key can be asked for with this dimension: the TV refuses one that doesn't name exactly
  // the key's dimension fields.
  function fits(category, key, given) {
    var desc = descOf(category, key);
    if (!desc) { return false; }
    return !given || Object.keys(given).sort().join(",") === desc.dims.slice().sort().join(",");
  }

  // getSystemSettings, getSystemSettingDesc and setSystemSettings as the TV answers them: a key it
  // can't answer makes returnValue false while the reply still carries the others.
  function readSettings(payload) {
    if (fails("getSystemSettings:" + payload.category)) { return { returnValue: false, errorText: "Unknown category" }; }
    var settings = {};
    var dimension = {};
    var missing = [];
    (payload.keys || []).forEach(function (key) {
      if (!fits(payload.category, key, payload.dimension)) { missing.push(key); return; }
      var full = dimensionOf(payload.category, key, payload.dimension);
      settings[key] = valueOf(payload.category, key, full);
      Object.assign(dimension, full);
    });
    if (!Object.keys(settings).length) { return { returnValue: false, errorText: "There is no matched result from DB", category: payload.category }; }
    var reply = { returnValue: !missing.length, category: payload.category, method: "getSystemSettings", settings: settings, dimension: dimension };
    if (missing.length) { reply.errorKey = missing; }
    return reply;
  }

  function describeSettings(payload) {
    if (fails("getSystemSettingDesc:" + payload.category)) { return { returnValue: false, errorText: "Unknown category" }; }
    var results = [];
    (payload.keys || []).forEach(function (key) {
      var desc = descOf(payload.category, key);
      if (!desc) { return; }
      var ui = Object.assign({ visible: true, active: true }, (options().desc || {})[payload.category + "." + key]);
      var values = desc.range ? { range: { min: desc.range[0], max: desc.range[1], interval: 1 } } :
        { arrayExt: (desc.choices || []).map(function (value) { return { value: value, visible: true, active: true }; }) };
      results.push({ key: key, category: payload.category, dimension: desc.dims, ui: ui, values: values, vtype: desc.range ? "Range" : "ArrayExt" });
    });
    if (!results.length) { return { returnValue: false, errorText: "no result in DB" }; }
    // Like the TV, a reply that lacks a key lists every key asked for in errorKey.
    var reply = { returnValue: results.length === payload.keys.length, method: "getSystemSettingDesc", results: results };
    if (!reply.returnValue) { reply.errorKey = payload.keys.slice(); }
    return reply;
  }

  function writeSettings(payload) {
    var failed = [];
    var completed = [];
    Object.keys(payload.settings).forEach(function (key) {
      if (!fits(payload.category, key, payload.dimension)) { failed.push(key); return; }
      var value = payload.settings[key];
      tv.values[storeKey(payload.category, key, dimensionOf(payload.category, key, payload.dimension))] = typeof value === "number" ? String(value) : value;
      tv.written.push([key, value]);
      var settings = {};
      settings[key] = value;
      tv.writes.push({ category: payload.category, settings: settings, dimension: payload.dimension || null });
      completed.push(key);
    });
    return failed.length ? { returnValue: false, method: "setSystemSettings", completed: completed, errorKey: failed } : { returnValue: true, method: "setSystemSettings" };
  }

  var SETTINGS_METHODS = { getSystemSettings: readSettings, getSystemSettingDesc: describeSettings, setSystemSettings: writeSettings };

  // The reply of a Luna call (an object), or null for a service the fake doesn't know.
  function lunaReply(uri, payload) {
    var method = uri.replace("luna://", "");
    if (/applicationManager\/listApps$/i.test(method)) { return { returnValue: true, apps: options().apps || APPS }; }
    if (/applicationManager\/launch$/i.test(method)) {
      tv.launched.push(payload.id);
      tv.launches.push(payload);
      return { returnValue: true };
    }
    var settingsMethod = /settingsservice\/(\w+)$/.exec(method);
    if (settingsMethod && SETTINGS_METHODS[settingsMethod[1]]) { return SETTINGS_METHODS[settingsMethod[1]](payload); }
    if (/settingsservice\/batch$/.test(method)) {
      return { returnValue: true, results: payload.operations.map(function (operation) {
        return SETTINGS_METHODS[operation.method] ? SETTINGS_METHODS[operation.method](operation.params) : { returnValue: false, errorText: "Unknown method" };
      }) };
    }
    if (/settingsservice\/getSystemSettingValues$/.test(method)) {
      if (fails("getSystemSettingValues:" + payload.key)) { return { returnValue: false, errorText: "Unknown key " + payload.key }; }
      return { returnValue: true, values: { arrayExt: (descOf(payload.category, payload.key).choices || []).map(function (value) { return { value: value }; }) } };
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
