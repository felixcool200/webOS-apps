// The Settings view inside Minimal Home. Home shows #settings-view and routes keys and pointer
// movement here while it is open; this module never listens on the document itself. Rows with a
// data-view attribute lead to another view of the page.
var MinimalSettings = (function () {
  "use strict";

  var KEY = WebOS.KEY;
  var rootLuna = WebOS.rootLuna;
  var host = null;
  var selected = null;
  var editing = null;
  var horizontalReturn = null;
  var state = {};
  // Each load gets a number, so an older one that answers late is ignored, and the settings changed
  // while it ran are left as changed.
  var loadRun = 0;
  var touched = {};
  var busy = false;
  var ready = false;
  var loaded = false;

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
    quickStartMode: { category: "option", kind: "choice", order: ["off", "on"], labels: { on: "On", off: "Off" } },
    wifiEnabled: { category: "network", kind: "choice", labels: { enabled: "On", disabled: "Off" } }
  };

  function setStatus(message, type) {
    UI.setStatus("settings-status", message, type);
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
    renderEditDirections(key);
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

  var CHOICE_KEYS = ["pictureMode", "energySaving", "soundMode", "quickStartMode"];

  // Reads every value and the choices on offer in one root call. A read that fails only leaves its
  // own settings as they were.
  function load() {
    if (!loaded) { setStatus("Reading current settings…"); }
    var run = loadRun += 1;
    touched = {};
    var settings = "luna://com.webos.settingsservice/";
    return WebOS.rootLunaBatch([
      [settings + "getSystemSettings", { category: "picture", keys: ["pictureMode", "backlight", "brightness", "contrast", "colorTemperature", "energySaving"] }],
      [settings + "getSystemSettings", { category: "sound", keys: ["soundMode"] }],
      [settings + "getSystemSettings", { category: "option", keys: ["quickStartMode"] }]
    ].concat(CHOICE_KEYS.map(function (key) {
      return [settings + "getSystemSettingValues", { category: SPECS[key].category, key: key }];
    }), [
      ["luna://com.webos.service.connectionmanager/getstatus", {}],
      ["luna://com.webos.service.wifi/getstatus", {}]
    ])).then(function (results) {
      if (run !== loadRun) { return; }
      var applied = SettingsLogic.applyReadings(SPECS, state, results, touched, CHOICE_KEYS);
      state = applied.state;
      loaded = true;
      renderNetwork(results[7] instanceof Error ? null : results[7], results[8] instanceof Error ? null : results[8]);
      Object.keys(SPECS).forEach(renderSetting);
      var failed = applied.failed;
      if (failed) { setStatus("Could not read some settings: " + failed.message, "error"); }
      else if (editing) { editingStatus(); }
      else { setStatus("Ready", "ok"); }
    }).catch(function (error) {
      setStatus("Could not read settings: " + error.message, "error");
    });
  }

  function nextValue(key, direction) {
    return SettingsLogic.nextValue(SPECS[key], state[key], direction);
  }

  function renderEditDirections(key) {
    var element = elementFor(key);
    var item = state[key];
    if (!element || !item) { return; }
    var value = element.querySelector(".value");
    value.classList.remove("can-decrease", "can-increase");
    if (editing !== element) { return; }
    if (nextValue(key, -1) !== item.value) { value.classList.add("can-decrease"); }
    if (nextValue(key, 1) !== item.value) { value.classList.add("can-increase"); }
  }

  function writeSetting(key, value) {
    if (busy || value === undefined || value === state[key].value) { return; }
    busy = true;
    touched[key] = true;
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
    return Array.prototype.slice.call(document.querySelectorAll("#settings-view .focusable"));
  }

  function setFocus(element) {
    if (element) { selected = UI.moveFocus(selected, element); }
  }

  function settingName(element) {
    var label = element && element.querySelector("strong");
    return label ? label.textContent : "setting";
  }

  function updateHints(isEditing) {
    document.getElementById("move-hint").innerHTML = isEditing ? "<b>Left/Right</b> Change" : "<b>Arrows</b> Move";
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
    renderEditDirections(editing.getAttribute("data-setting"));
    updateHints(true);
    editingStatus();
  }

  function stopEditing(showReady) {
    if (!editing) { return; }
    var key = editing.getAttribute("data-setting");
    editing.classList.remove("is-editing");
    editing = null;
    renderEditDirections(key);
    updateHints(false);
    if (showReady !== false) { setStatus("Ready", "ok"); }
  }

  function containingSection(element) {
    while (element && element !== document.body) {
      if (element.tagName === "SECTION") { return element; }
      element = element.parentElement;
    }
    return null;
  }

  function navigationCenter(element) {
    var card = element.classList.contains("action") && element.parentElement.classList.contains("info-card") ? element.parentElement : element;
    var rect = card.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function verticalNeighbor(direction) {
    var items = focusables();
    if (!selected) { return items[0]; }
    var section = containingSection(selected);
    var from = navigationCenter(selected);
    var best = null;
    var score = Infinity;
    items.forEach(function (item) {
      if (item === selected || containingSection(item) !== section) { return; }
      var point = navigationCenter(item);
      var dx = point.x - from.x;
      var dy = point.y - from.y;
      var forward = direction === KEY.DOWN ? dy : -dy;
      if (forward <= 2) { return; }
      var candidate = forward + Math.abs(dx) * 0.35;
      if (candidate < score) { score = candidate; best = item; }
    });
    return best;
  }

  function navElement(name) {
    return document.querySelector('[data-setting="' + name + '"]') || document.getElementById(name);
  }

  function horizontalNeighbor(direction) {
    if (!selected) { return focusables()[0]; }
    var opposite = direction === KEY.LEFT ? KEY.RIGHT : KEY.LEFT;
    if (horizontalReturn && horizontalReturn.to === selected && horizontalReturn.direction === opposite) {
      var previous = horizontalReturn.from;
      horizontalReturn = null;
      return previous;
    }

    var attribute = direction === KEY.LEFT ? "data-nav-left" : "data-nav-right";
    var explicit = selected.getAttribute(attribute);
    var best = explicit ? navElement(explicit) : null;
    if (!best) {
      var section = containingSection(selected);
      var from = navigationCenter(selected);
      var score = Infinity;
      focusables().forEach(function (item) {
        if (item === selected || containingSection(item) === section) { return; }
        var point = navigationCenter(item);
        var forward = direction === KEY.RIGHT ? point.x - from.x : from.x - point.x;
        if (forward <= 2) { return; }
        var candidate = Math.abs(point.y - from.y) + forward * 0.05;
        if (candidate < score) { score = candidate; best = item; }
      });
    }
    if (best) { horizontalReturn = { from: selected, to: best, direction: direction }; }
    return best;
  }

  function openAdvanced() {
    rootLuna("luna://com.webos.service.applicationManager/launch", { id: "com.palm.app.settings" })
      .catch(function (error) { setStatus("Could not open LG Settings: " + error.message, "error"); });
  }

  // The pointer moves the same focus as the arrows. There is no CSS :hover highlight, because the
  // browser keeps :hover on the last pointed-at row after an arrow press hides the pointer.
  function handlePointer(event) {
    var element = event.target.closest && event.target.closest("#settings-view .focusable");
    if (!element || element === selected) { return; }
    if (editing && editing !== element) { stopEditing(false); }
    horizontalReturn = null;
    setFocus(element);
  }

  // Returns "leave" when Back should take the user back to the Home view.
  function handleKey(event) {
    if (event.keyCode === KEY.BACK) {
      event.preventDefault();
      if (editing) { stopEditing(); return null; }
      return "leave";
    }
    if (editing && (event.keyCode === KEY.LEFT || event.keyCode === KEY.RIGHT)) {
      event.preventDefault();
      adjustSelected(event.keyCode === KEY.RIGHT ? 1 : -1);
    } else if (event.keyCode === KEY.UP || event.keyCode === KEY.DOWN ||
               event.keyCode === KEY.LEFT || event.keyCode === KEY.RIGHT) {
      event.preventDefault();
      if (editing) { stopEditing(false); }
      if (event.keyCode === KEY.UP || event.keyCode === KEY.DOWN) {
        horizontalReturn = null;
        setFocus(verticalNeighbor(event.keyCode));
      } else {
        setFocus(horizontalNeighbor(event.keyCode));
      }
      setStatus("Ready", "ok");
    } else if (event.keyCode === KEY.ENTER) {
      event.preventDefault();
      if (event.repeat) { return null; }
      if (editing) { stopEditing(); }
      else if (selected && selected.getAttribute("data-setting")) { startEditing(selected); }
      else if (selected) { selected.click(); }
    }
    return null;
  }

  function setup() {
    if (ready) { return; }
    ready = true;
    document.querySelectorAll("[data-setting]").forEach(function (element) {
      element.addEventListener("click", function () {
        if (editing === element) { stopEditing(); }
        else { startEditing(element); }
      });
    });
    document.querySelectorAll("#settings-view [data-view]").forEach(function (element) {
      element.addEventListener("click", function () { host.navigate(element.getAttribute("data-view")); });
    });
    document.getElementById("advanced").addEventListener("click", openAdvanced);
    setFocus(document.querySelector("[data-setting]"));
  }

  // host: Home's navigate(view), used by the rows that lead to another view.
  function attach(pageHost) {
    host = pageHost;
  }

  // Shows a short summary, such as "2 changed", on the row that leads to that view.
  function setLinkValue(view, text) {
    var value = document.querySelector('#settings-view [data-view="' + view + '"] .value');
    if (value) { value.textContent = text; }
  }

  // Reads the values in the background so they are already shown when the view opens.
  function preload() {
    setup();
    if (!loaded) { load(); }
  }

  // Called when the view is shown. Values from preload stay visible while fresh ones are read.
  function open() {
    setup();
    updateHints(false);
    load();
  }

  function close() {
    stopEditing(false);
  }

  return {
    attach: attach, preload: preload, open: open, close: close, handleKey: handleKey, handlePointer: handlePointer,
    setLinkValue: setLinkValue
  };
}());
