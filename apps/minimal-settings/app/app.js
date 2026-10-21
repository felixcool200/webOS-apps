(function () {
  "use strict";

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461 };
  var selected = null;
  var editing = null;
  var state = {};
  var busy = false;

  var SPECS = {
    pictureMode: { category: "picture", kind: "choice", labels: {
      vivid: "Vivid", normal: "Standard", eco: "Eco", cinema: "Cinema",
      sports: "Sports", game: "Game Optimizer", filmMaker: "Filmmaker Mode",
      expert1: "Expert Bright", expert2: "Expert Dark",
      hdrVivid: "HDR Vivid", hdrStandard: "HDR Standard", hdrEco: "HDR Eco",
      hdrCinemaBright: "HDR Cinema Home", hdrCinema: "HDR Cinema",
      hdrGame: "HDR Game", hdrFilmMaker: "HDR Filmmaker",
      dolbyHdrVivid: "Dolby Vision Vivid", dolbyHdrStandard: "Dolby Vision Standard",
      dolbyHdrCinemaBright: "Dolby Vision Cinema Home", dolbyHdrCinema: "Dolby Vision Cinema",
      dolbyHdrGame: "Dolby Vision Game"
    }},
    backlight: { category: "picture", kind: "range", min: 0, max: 100, step: 5 },
    brightness: { category: "picture", kind: "range", min: 0, max: 100, step: 5 },
    contrast: { category: "picture", kind: "range", min: 0, max: 100, step: 5 },
    colorTemperature: { category: "picture", kind: "range", min: -50, max: 50, step: 5 },
    energySaving: { category: "picture", kind: "choice", labels: {
      off: "Off", auto: "Auto", min: "Minimum", med: "Medium", max: "Maximum"
    }},
    soundMode: { category: "sound", kind: "choice", labels: {
      aiSoundPlus: "AI Sound Pro", standard: "Standard", movie: "Cinema",
      news: "Clear Voice", sports: "Sports", music: "Music", game: "Game"
    }},
    quickStartMode: { category: "option", kind: "choice", labels: { on: "On", off: "Off" } },
    wifiEnabled: { category: "network", kind: "choice", labels: { enabled: "On", disabled: "Off" } }
  };

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

  function rootExec(command) {
    return lunaCall("luna://org.webosbrew.hbchannel.service/exec", { command: command });
  }

  function rootLuna(uri, payload) {
    var encoded = JSON.stringify(payload || {}).replace(/'/g, "'\\''");
    return rootExec("luna-send -n 1 -f '" + uri + "' '" + encoded + "'").then(function (outer) {
      if (!outer || !outer.stdoutString) { throw new Error((outer && outer.errorText) || "No response"); }
      var response = JSON.parse(outer.stdoutString);
      if (response.returnValue === false) { throw new Error(response.errorText || response.error || "Request failed"); }
      return response;
    });
  }

  function setStatus(message, type) {
    var box = document.getElementById("status");
    box.textContent = message;
    box.className = type || "";
  }

  function labelFor(key, value) {
    var labels = SPECS[key].labels || {};
    return labels[value] || String(value);
  }

  function elementFor(key) {
    return document.querySelector('[data-setting="' + key + '"]');
  }

  function renderSetting(key) {
    var spec = SPECS[key];
    var item = state[key];
    var element = elementFor(key);
    if (!item || !element) { return; }
    element.querySelector(".value").textContent = spec.kind === "choice" ? labelFor(key, item.value) : String(item.value);
    if (spec.kind === "range") {
      var percent = (Number(item.value) - spec.min) / (spec.max - spec.min) * 100;
      element.querySelector(".range").style.setProperty("--fill", Math.max(0, Math.min(100, percent)) + "%");
    }
  }

  function allowedValues(key, response, current) {
    var list = response && response.values && response.values.arrayExt ? response.values.arrayExt : [];
    var values = list.filter(function (entry) { return entry.active !== false && entry.visible !== false; })
      .map(function (entry) { return entry.value; });
    if (values.indexOf(current) === -1) { values.unshift(current); }
    return values;
  }

  function networkDetail(connection) {
    var parts = [];
    if (connection.ssid) { parts.push(connection.ssid); }
    if (connection.ipAddress) { parts.push(connection.ipAddress); }
    if (connection.dns1) { parts.push("DNS " + connection.dns1); }
    if (connection.onInternet === "no") { parts.push("No internet"); }
    return parts.join(" · ");
  }

  function renderNetwork(connectionStatus, wifiStatus) {
    var wifi = connectionStatus && connectionStatus.wifi ? connectionStatus.wifi : {};
    var wired = connectionStatus && connectionStatus.wired ? connectionStatus.wired : {};
    var serviceStatus = wifiStatus && wifiStatus.status;
    var enabled = serviceStatus !== "serviceDisabled";
    if (!serviceStatus && wifi.state !== "connected") { enabled = false; }

    state.wifiEnabled = { value: enabled ? "enabled" : "disabled", values: ["disabled", "enabled"] };
    renderSetting("wifiEnabled");

    var wifiDetail = document.getElementById("wifi-detail");
    if (!enabled) { wifiDetail.textContent = "Wireless radio is off"; }
    else if (wifi.state === "connected") { wifiDetail.textContent = networkDetail(wifi) || "Connected"; }
    else { wifiDetail.textContent = "On · Not connected"; }

    var ethernetValue = document.getElementById("ethernet-value");
    var ethernetDetail = document.getElementById("ethernet-detail");
    if (wired.state === "connected") {
      ethernetValue.textContent = "Connected";
      ethernetDetail.textContent = networkDetail(wired) || "Cable connected";
    } else if (wired.plugged) {
      ethernetValue.textContent = "No network";
      ethernetDetail.textContent = "Cable connected · No address";
    } else {
      ethernetValue.textContent = "Unplugged";
      ethernetDetail.textContent = "No cable connected";
    }
  }

  function readCurrent(category, keys) {
    return rootLuna("luna://com.webos.settingsservice/getSystemSettings", { category: category, keys: keys });
  }

  function readChoices(key) {
    var spec = SPECS[key];
    return rootLuna("luna://com.webos.settingsservice/getSystemSettingValues", { category: spec.category, key: key });
  }

  function load() {
    setStatus("Reading current settings…");
    return Promise.all([
      readCurrent("picture", ["pictureMode", "backlight", "brightness", "contrast", "colorTemperature", "energySaving"]),
      readCurrent("sound", ["soundMode"]),
      readCurrent("option", ["quickStartMode"]),
      readChoices("pictureMode"),
      readChoices("energySaving"),
      readChoices("soundMode"),
      readChoices("quickStartMode"),
      rootLuna("luna://com.webos.service.connectionmanager/getstatus", {}).catch(function () { return null; }),
      rootLuna("luna://com.webos.service.wifi/getstatus", {}).catch(function () { return null; })
    ]).then(function (results) {
      var picture = results[0].settings || {};
      var sound = results[1].settings || {};
      var option = results[2].settings || {};
      Object.keys(picture).forEach(function (key) { state[key] = { value: picture[key] }; });
      Object.keys(sound).forEach(function (key) { state[key] = { value: sound[key] }; });
      Object.keys(option).forEach(function (key) { state[key] = { value: option[key] }; });
      state.pictureMode.values = allowedValues("pictureMode", results[3], state.pictureMode.value);
      state.energySaving.values = allowedValues("energySaving", results[4], state.energySaving.value);
      state.soundMode.values = allowedValues("soundMode", results[5], state.soundMode.value);
      state.quickStartMode.values = allowedValues("quickStartMode", results[6], state.quickStartMode.value);
      renderNetwork(results[7], results[8]);
      Object.keys(SPECS).forEach(renderSetting);
      if (editing) { editingStatus(); }
      else { setStatus("Ready", "ok"); }
    }).catch(function (error) {
      setStatus("Could not read settings: " + error.message, "error");
    });
  }

  function nextValue(key, direction) {
    var spec = SPECS[key];
    var item = state[key];
    if (!item) { return undefined; }
    if (spec.kind === "range") {
      var next = Number(item.value) + spec.step * direction;
      return Math.max(spec.min, Math.min(spec.max, next));
    }
    var values = item.values || [];
    if (!values.length) { return undefined; }
    var index = values.indexOf(item.value);
    if (index < 0) { index = 0; }
    return values[Math.max(0, Math.min(values.length - 1, index + direction))];
  }

  function writeSetting(key, value) {
    if (busy || value === undefined || value === state[key].value) { return; }
    busy = true;
    var spec = SPECS[key];
    var element = elementFor(key);
    element.classList.add("is-busy");
    setStatus("Changing " + element.querySelector("strong").textContent + "…");

    var request;
    if (key === "wifiEnabled") {
      request = rootLuna("luna://com.webos.service.connectionmanager/setstate", { wifi: value });
    } else {
      var context = key === "pictureMode" || spec.category === "option" ? Promise.resolve({}) :
        readCurrent(spec.category, [key]).then(function (result) { return result.dimension || {}; });
      request = context.then(function (dimension) {
        var payload = { category: spec.category, settings: {} };
        payload.settings[key] = value;
        if (Object.keys(dimension).length) { payload.dimension = dimension; }
        return rootLuna("luna://com.webos.settingsservice/setSystemSettings", payload);
      });
    }

    request.then(function () {
      state[key].value = value;
      renderSetting(key);
      if (editing) { editingStatus("Saved"); }
      else { setStatus("Saved", "ok"); }
      if (key === "pictureMode") { return load(); }
      if (key === "wifiEnabled") { window.setTimeout(load, 1200); }
    }).catch(function (error) {
      setStatus("Could not change setting: " + error.message, "error");
    }).then(function () {
      busy = false;
      element.classList.remove("is-busy");
    });
  }

  function adjustSelected(direction) {
    if (!editing) { return; }
    var key = editing.getAttribute("data-setting");
    if (key) { writeSetting(key, nextValue(key, direction)); }
  }

  function focusables() {
    return Array.prototype.slice.call(document.querySelectorAll(".focusable"));
  }

  function setFocus(element) {
    if (selected) { selected.classList.remove("is-focused"); }
    selected = element;
    if (selected) { selected.classList.add("is-focused"); }
  }

  function settingName(element) {
    var label = element && element.querySelector("strong");
    return label ? label.textContent : "setting";
  }

  function updateHints(isEditing) {
    document.getElementById("move-hint").innerHTML = isEditing ? "<b>← →</b> Change" : "<b>Arrows</b> Move";
    document.getElementById("select-hint").innerHTML = isEditing ? "<b>OK</b> Done" : "<b>OK</b> Select";
    document.getElementById("back-hint").innerHTML = isEditing ? "<b>Back</b> Done" : "<b>Back</b> Home";
  }

  function editingStatus(prefix) {
    if (!editing) { return; }
    setStatus((prefix ? prefix + " · " : "") + "Editing " + settingName(editing) + " — Left/Right changes", prefix ? "ok" : "");
  }

  function startEditing(element) {
    if (!element || !element.getAttribute("data-setting")) { return; }
    if (editing && editing !== element) { editing.classList.remove("is-editing"); }
    setFocus(element);
    editing = element;
    editing.classList.add("is-editing");
    updateHints(true);
    editingStatus();
  }

  function stopEditing(showReady) {
    if (!editing) { return; }
    editing.classList.remove("is-editing");
    editing = null;
    updateHints(false);
    if (showReady !== false) { setStatus("Ready", "ok"); }
  }

  function spatialNeighbor(direction) {
    var items = focusables();
    if (!selected) { return items[0]; }
    var from = selected.getBoundingClientRect();
    var fx = from.left + from.width / 2;
    var fy = from.top + from.height / 2;
    var best = null;
    var score = Infinity;
    items.forEach(function (item) {
      if (item === selected) { return; }
      var rect = item.getBoundingClientRect();
      var dx = rect.left + rect.width / 2 - fx;
      var dy = rect.top + rect.height / 2 - fy;
      var vertical = direction === KEY.UP || direction === KEY.DOWN;
      var forward = vertical ? (direction === KEY.DOWN ? dy : -dy) : (direction === KEY.RIGHT ? dx : -dx);
      if (forward <= 2) { return; }
      var cross = vertical ? Math.abs(dx) : Math.abs(dy);
      var candidate = forward + cross * 1.8;
      if (candidate < score) { score = candidate; best = item; }
    });
    return best;
  }

  function openAdvanced() {
    rootLuna("luna://com.webos.service.applicationManager/launch", { id: "com.palm.app.settings" })
      .catch(function (error) { setStatus("Could not open LG Settings: " + error.message, "error"); });
  }

  function initNavigation() {
    focusables().forEach(function (element) {
      element.addEventListener("mouseenter", function () {
        if (editing && editing !== element) { stopEditing(false); }
        setFocus(element);
      });
    });
    document.addEventListener("keydown", function (event) {
      if (event.keyCode === KEY.BACK) {
        event.preventDefault();
        if (editing) { stopEditing(); }
        else if (window.webOSSystem && window.webOSSystem.close) { window.webOSSystem.close(); }
      } else if (editing && (event.keyCode === KEY.LEFT || event.keyCode === KEY.RIGHT)) {
        event.preventDefault();
        adjustSelected(event.keyCode === KEY.RIGHT ? 1 : -1);
      } else if (event.keyCode === KEY.UP || event.keyCode === KEY.DOWN ||
                 event.keyCode === KEY.LEFT || event.keyCode === KEY.RIGHT) {
        event.preventDefault();
        if (editing) { stopEditing(false); }
        setFocus(spatialNeighbor(event.keyCode));
        setStatus("Ready", "ok");
      } else if (event.keyCode === KEY.ENTER) {
        event.preventDefault();
        if (editing) { stopEditing(); }
        else if (selected && selected.getAttribute("data-setting")) { startEditing(selected); }
        else if (selected) { selected.click(); }
      }
    });
  }

  function init() {
    initNavigation();
    document.querySelectorAll("[data-setting]").forEach(function (element) {
      element.addEventListener("click", function () {
        if (editing === element) { stopEditing(); }
        else { startEditing(element); }
      });
    });
    document.getElementById("advanced").addEventListener("click", openAdvanced);
    document.addEventListener("webOSRelaunch", load);
    setFocus(document.querySelector("[data-setting]"));
    load();
  }

  document.addEventListener("DOMContentLoaded", init);
}());
