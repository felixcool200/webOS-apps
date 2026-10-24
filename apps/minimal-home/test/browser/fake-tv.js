// A fake TV for the browser tests: Homebrew Channel's exec service and the Luna calls Minimal Home
// makes, answered from memory. It is loaded before webos.js. A test changes it through the `tv`
// options of BrowserTest.define (window.TEST_TV), read when the first call comes in:
//   apps, inputs: what listApps and eim/getAllInputStatus report
//   hooked: false when the button hook's library is not in the input program
//   bindings: the bindings file's contents
//   settings: { picture: {...}, sound: {...}, option: {...} } values for every input and mode
//   inputSettings: { hdmi2: { picture: {...} } } values for one input, in every mode
//   now: the context the TV is in, such as { input: "hdmi2" } (apps, SDR, media sound by default)
//   sleepSeconds: the sleep timer's time left; wifiOff: true when the Wi-Fi radio is off
//   desc: { "picture.localDimming": { visible: false } } changes a key's description's ui
//   delays: { name: ms or [ms for the 1st call, 2nd, ...] } for listApps, settings, bindings, inputs
//   lose: { name: [call numbers whose reply never comes, from 1] }
//   fail: ["getSystemSettingValues:energySaving", "getSystemSettingDesc:picture", ...] reads that
//     answer returnValue false
// window.FAKE_TV keeps what happened: files, launched apps (with their params in `launches`),
// settings written (`written` as [key, value], `writes` with their category, dimension and app_id),
// resets (`resets`), sleep timers set (`sleep`, in minutes), Wi-Fi turned on or off (`wifi`), calls made.
// Keys read or written with an app_id (TruMotion, the aspect ratio) keep one value, as this TV keeps
// TruMotion for whatever plays.
(function () {
  "use strict";

  var CONFIG = "/home/root/.config/lginputhook/keybinds.json";
  var BACKUP = CONFIG + ".before-test";
  var tv = window.FAKE_TV = { files: {}, hookLog: ["boot"], launched: [], launches: [], written: [], writes: [], resets: [], sleep: [], wifi: [], calls: [], counts: {}, ready: false };

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
  var ON_OFF = ["on", "off"];
  var SWITCH = { dims: [], choices: ON_OFF };
  var DELAY = { dims: ["audioInput"], range: [0, 60] };
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
      eyeComfortMode: { dims: [], choices: ["on", "off"] }, filmMakerMode: { dims: [], choices: ["on", "off"] },
      truMotionMode: { dims: MODE, choices: ["off", "cinemaClear", "natural", "smooth", "user"] }, truMotionJudder: { dims: MODE, range: [0, 10] },
      applyToAllInput: { dims: MODE, choices: ["picture", "done"] }, energySavingAutoMin: { dims: [], range: [0, 10] }, erpUserConfirm: { dims: [] }
    },
    aiPicture: { ai_Brightness: { dims: MODE, choices: ["on", "off"] } },
    aspectRatio: { arcPerApp: { dims: ["input", "twinMode"], choices: ["16x9", "original", "4x3"] } },
    sound: {
      soundMode: { dims: ["audioInput", "soundOutput"], choices: ["standard", "movie", "news"] },
      soundOutput: { dims: ["audioOutput"], choices: ["tv_speaker", "external_optical", "external_arc", "tv_external_speaker"] },
      supportATMOS: SWITCH, audioBalance: { dims: [], range: [-50, 50] }, tvSetupConfiguration: { dims: [], choices: ["stand", "wall_mount"] },
      autoVolume: SWITCH, avSyncSpeaker: DELAY, avSyncSpdif: DELAY, avSyncBtSurround: DELAY, avSyncWisa: DELAY,
      avSyncBypassInput: { dims: ["audioInput"], choices: ON_OFF }, digitalAudioPriority: { dims: [], choices: ["mpeg", "dolbyDigital", "auto"] },
      soundOutputDigital: { dims: ["audioInput"], choices: ["pcm", "auto", "passThrough"] }, lgSoundSync: SWITCH, ac4DialogueEnhancer: SWITCH,
      tvPowerSound: SWITCH, audioDescription: SWITCH, audioDescriptionVolume: { dims: [], range: [-15, 15] },
      applyToAllInputSSM: { dims: [], choices: ["sound", "done"] }, soundModeModified: { dims: ["soundMode", "soundOutput"], choices: ["true", "false"] },
      userEqualizerValues: { dims: [], range: [-10, 10] }
    },
    time: {
      automaticStandBy: { dims: [], choices: ["0", "2", "4", "6", "8"] }, autoOff15Min: SWITCH, autoOff2HourOnTimer: SWITCH,
      autoClock: SWITCH, timeZone: { dims: [] }
    },
    option: {
      quickStartMode: SWITCH, standByLight: SWITCH, screenSaverTimer: { dims: [], choices: ["3", "10", "20", "30"] },
      pointerSpeed: { dims: [], choices: ["slow", "normal", "fast"] }, pointerSize: { dims: [], choices: ["small", "medium", "large"] },
      livePlus: SWITCH, menuLanguage: { dims: [] }, highContrast: SWITCH, focusEmphasis: SWITCH, adjustments: { dims: [] },
      subtitleLanguageFirst: { dims: [], choices: ["eng", "fin", "swe"] }, subtitleLanguageSecond: { dims: [], choices: ["eng", "fin", "swe"] },
      audioGuidance: SWITCH, audioGuidanceSpeed: { dims: [], choices: ["slow", "medium", "fast"] },
      audioGuidanceVolume: { dims: [], choices: ["low", "medium", "high"] }, audioGuidancePitch: { dims: [], choices: ["low", "medium", "high"] },
      remoteSlowInput: SWITCH, longPressInterval: { dims: [], choices: ["basic", "1.5", "2"] }, repeatInterval: { dims: [], choices: ["basic", "0.5", "1"] },
      screenMagnification: SWITCH
    },
    general: {
      screenSaverAd: SWITCH, lmt: SWITCH, lifeOnScreenMode: { dims: [], choices: ["off", "lifeOnScreen", "alwaysReady", "allEnabled"] },
      homeAutoLaunch: SWITCH, selectedInputApp: { dims: [], choices: ["off", "HDMI_1", "HDMI_2"] }, checkHomeAutoLaunchValue: { dims: [] }
    },
    other: { simplinkEnable: SWITCH },
    network: { deviceName: { dims: [] }, wolwowlOnOff: { dims: [], choices: ["true", "false"] } },
    caption: { hardOfHearing: SWITCH }
  };
  // Values as the TV reports them, most ranges as text.
  var DEFAULTS = {
    picture: {
      pictureMode: "normal", energySaving: "off", backlight: "80", brightness: 50, contrast: "85", colorTemperature: "0",
      dynamicContrast: "low", gamma: "high1", localDimming: "low", motionEyeCare: "off", color: "55", tint: "0", colorGamut: "native",
      dynamicColor: "low", sharpness: "25", superResolution: "off", noiseReduction: "off", mpegNoiseReduction: "off",
      smoothGradation: "low", realCinema: "on", eyeComfortMode: "off", filmMakerMode: "on",
      pictureSettingModified: { normal: false, vivid: false, cinema: false, eco: false },
      truMotionMode: "natural", truMotionJudder: "0", applyToAllInput: "done", energySavingAutoMin: 5, erpUserConfirm: false
    },
    aiPicture: { ai_Brightness: "off" },
    aspectRatio: { arcPerApp: "16x9" },
    sound: {
      soundMode: "standard", soundOutput: "tv_external_speaker", supportATMOS: "on", audioBalance: "0", tvSetupConfiguration: "stand",
      autoVolume: "off", avSyncSpeaker: "0", avSyncSpdif: "0", avSyncBtSurround: "0", avSyncWisa: "0", avSyncBypassInput: "off",
      digitalAudioPriority: "auto", soundOutputDigital: "auto", lgSoundSync: "off", ac4DialogueEnhancer: "off", tvPowerSound: "off",
      audioDescription: "off", audioDescriptionVolume: "10", applyToAllInputSSM: "done", soundModeModified: "false",
      userEqualizerValues: [0, 0, 0, 0, 0]
    },
    time: {
      automaticStandBy: "4", autoOff15Min: "on", autoOff2HourOnTimer: "on", autoClock: "on",
      timeZone: { Country: "Sweden", Description: "Central European Time", City: "Stockholm", ZoneID: "Europe/Stockholm" }
    },
    option: {
      quickStartMode: "on", standByLight: "off", screenSaverTimer: "3", pointerSpeed: "slow", pointerSize: "small", livePlus: "off",
      menuLanguage: "eng", highContrast: "off", focusEmphasis: "off", adjustments: { blackAndWhite: "off", colorInversion: "off" },
      subtitleLanguageFirst: "swe", subtitleLanguageSecond: "eng", audioGuidance: "off", audioGuidanceSpeed: "fast",
      audioGuidanceVolume: "medium", audioGuidancePitch: "medium", remoteSlowInput: "off", longPressInterval: "basic",
      repeatInterval: "basic", screenMagnification: "off"
    },
    general: { screenSaverAd: "off", lmt: "off", lifeOnScreenMode: "none", homeAutoLaunch: "on", selectedInputApp: "off", checkHomeAutoLaunchValue: "default" },
    other: { simplinkEnable: "off" },
    network: { deviceName: "[LG] webOS TV QNED80T6A", wolwowlOnOff: "true" },
    caption: { hardOfHearing: "off" }
  };

  function setUp() {
    if (tv.ready) { return; }
    tv.ready = true;
    // Values written or set by the test, by category, key and dimension (storeKey).
    tv.values = {};
    tv.now = Object.assign({ input: "default", dynamicRange: "sdr", audioInput: "media", soundOutput: "tv_external_speaker", audioOutput: "default",
      twinMode: "off" }, options().now);
    tv.sleepSeconds = options().sleepSeconds || 0;
    tv.wifiOn = !options().wifiOff;
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

  function storeKey(category, key, dimension, appId) {
    if (appId) { return category + "." + key + "@app"; }
    return category + "." + key + "|" + Object.keys(dimension).sort().map(function (field) { return field + "=" + dimension[field]; }).join(",");
  }

  // A key's value in a dimension (or for an app): written, set by the test for that input or for all,
  // or the default.
  function valueOf(category, key, dimension, appId) {
    var stored = tv.values[storeKey(category, key, dimension, appId)];
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
      settings[key] = valueOf(payload.category, key, full, payload.app_id);
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
      tv.values[storeKey(payload.category, key, dimensionOf(payload.category, key, payload.dimension), payload.app_id)] = typeof value === "number" ? String(value) : value;
      tv.written.push([key, value]);
      var settings = {};
      settings[key] = value;
      var write = { category: payload.category, settings: settings, dimension: payload.dimension || null };
      if (payload.app_id) { write.app_id = payload.app_id; }
      tv.writes.push(write);
      completed.push(key);
    });
    return failed.length ? { returnValue: false, method: "setSystemSettings", completed: completed, errorKey: failed } : { returnValue: true, method: "setSystemSettings" };
  }

  // resetSystemSettings: a picture mode of an input (`dimension`) or some keys back to their defaults.
  function resetSettings(payload) {
    tv.resets.push(payload);
    Object.keys(tv.values).forEach(function (stored) {
      var inCategory = stored.indexOf(payload.category + ".") === 0;
      var dimension = payload.dimension && Object.keys(payload.dimension).every(function (field) {
        return stored.indexOf(field + "=" + payload.dimension[field]) >= 0;
      });
      var named = payload.keys && payload.keys.some(function (key) { return stored.indexOf(payload.category + "." + key + "|") === 0; });
      if (inCategory && (dimension || named) && stored.indexOf("pictureSettingModified") < 0) { delete tv.values[stored]; }
    });
    return { returnValue: true, method: "resetSystemSettings" };
  }

  var SETTINGS_METHODS = { getSystemSettings: readSettings, getSystemSettingDesc: describeSettings, setSystemSettings: writeSettings, resetSystemSettings: resetSettings };

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
    if (/connectionmanager\/getstatus$/.test(method)) {
      return { returnValue: true, wired: { state: "disconnected" }, wifi: tv.wifiOn ? { state: "connected", ssid: "Home", ipAddress: "192.168.1.5" } : { state: "disconnected" } };
    }
    if (/connectionmanager\/setstate$/.test(method)) {
      tv.wifiOn = payload.wifi === "enabled";
      tv.wifi.push(payload.wifi);
      return { returnValue: true };
    }
    if (/wifi\/getstatus$/.test(method)) { return { returnValue: true, status: tv.wifiOn ? "connectionStateChanged" : "serviceDisabled" }; }
    if (/timer\/sleep\/getRemainTime$/.test(method)) {
      // As the TV answers: minutes and the seconds left over, or only sleepTimeSecond 0 when off.
      return tv.sleepSeconds ? { returnValue: true, sleepTimeMinute: Math.floor(tv.sleepSeconds / 60), sleepTimeSecond: tv.sleepSeconds % 60 } :
        { returnValue: true, sleepTimeSecond: 0 };
    }
    if (/timer\/sleep\/add$/.test(method)) {
      tv.sleepSeconds = Number(payload.sleepTimeMinute) * 60;
      tv.sleep.push(Number(payload.sleepTimeMinute));
      return { returnValue: true };
    }
    if (/systemproperty\/getSystemInfo$/.test(method)) { return { returnValue: true, modelName: "65QNED80T6A.BEUFLJP", firmwareVersion: "33.31.75" }; }
    if (/audio\/getSoundOutput$/.test(method)) {
      var output = valueOf("sound", "soundOutput", { audioOutput: tv.now.audioOutput });
      return { returnValue: true, soundOutput: output, lastSoundOutput: "none", settingsSoundOutputs: [output] };
    }
    if (/osInfo\/query$/.test(method)) { return { returnValue: true, webos_name: "webOS TV Lite", webos_release: "10.3.2" }; }
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
