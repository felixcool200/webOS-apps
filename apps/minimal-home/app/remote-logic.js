// The Remote buttons page's rules without the page: the MR24 remote's buttons, which buttons a preset
// lists and what they can do, reading presses from the hook's log, and the presets. A preset is a set
// of bindings made from a template: LG MR24 (its drawing and buttons) or Blank (your own named
// buttons). remote.js uses them; test/remote-logic.test.js checks them in Node.
var RemoteLogic = (function () {
  "use strict";

  var POWER = "luna-send -n 1 luna://com.webos.service.tvpower/power/";
  // The hook runs it on the press and passes the release on, which does not wake the screen.
  var SCREEN_TOGGLE = "if luna-send -n 1 -f luna://com.webos.service.tvpower/power/getPowerState '{}' </dev/null | grep -q '\"Screen Off\"'; " +
    "then " + POWER + "turnOnScreen '{}' </dev/null >/dev/null; " +
    "else " + POWER + "turnOffScreen '{}' </dev/null >/dev/null; fi";
  // Buttons of the MR24 remote in reading order: the codes the hook logs (checked by pressing every
  // button), a short label for the drawing, and the button's centre and size on a 210 x 960 grid
  // traced from a photo (x from the remote's left edge, y from its top). Buttons marked `keep` are never
  // listed, so the remote stays usable: OK, arrows, Back and Home.
  var MR24 = [
    { name: "Power", label: "", codes: [], x: 71, y: 30, w: 34, h: 34, round: true, power: true },
    { name: "1", label: "1", codes: [2], x: 45, y: 80, w: 40, h: 40, round: true },
    { name: "2", label: "2", codes: [3], x: 105, y: 80, w: 40, h: 40, round: true },
    { name: "3", label: "3", codes: [4], x: 165, y: 80, w: 40, h: 40, round: true },
    { name: "4", label: "4", codes: [5], x: 45, y: 130, w: 40, h: 40, round: true },
    { name: "5", label: "5", codes: [6], x: 105, y: 130, w: 40, h: 40, round: true },
    { name: "6", label: "6", codes: [7], x: 165, y: 130, w: 40, h: 40, round: true },
    { name: "7", label: "7", codes: [8], x: 45, y: 181, w: 40, h: 40, round: true },
    { name: "8", label: "8", codes: [9], x: 105, y: 181, w: 40, h: 40, round: true },
    { name: "9", label: "9", codes: [10], x: 165, y: 181, w: 40, h: 40, round: true },
    { name: "Guide", label: "Guide", codes: [362], x: 45, y: 232, w: 40, h: 40, round: true },
    { name: "0", label: "0", codes: [11], x: 105, y: 232, w: 40, h: 40, round: true },
    { name: "…", label: "…", codes: [994], x: 165, y: 232, w: 40, h: 40, round: true },
    { name: "Volume +", label: "+", codes: [115], x: 45, y: 293, w: 40, h: 56 },
    { name: "Volume −", label: "−", codes: [114], x: 45, y: 352, w: 40, h: 56 },
    { name: "Mute", label: "Mute", codes: [113], x: 105, y: 320, w: 40, h: 40, round: true },
    { name: "Channel ∧", label: "∧", codes: [402], x: 165, y: 293, w: 40, h: 56 },
    { name: "Channel ∨", label: "∨", codes: [403], x: 165, y: 352, w: 40, h: 56 },
    { name: "Mic", label: "Mic", codes: [428], x: 105, y: 385, w: 40, h: 40, round: true },
    { name: "Home", label: "Home", codes: [773], x: 45, y: 410, w: 40, h: 40, round: true, keep: true },
    { name: "Input", label: "Input", codes: [241], x: 165, y: 410, w: 40, h: 40, round: true },
    { name: "Up", label: "▲", codes: [103], x: 105, y: 440, w: 60, h: 32, keep: true },
    { name: "Left", label: "◀", codes: [105], x: 48, y: 495, w: 32, h: 60, keep: true },
    { name: "OK", label: "OK", codes: [28, 272], x: 105, y: 495, w: 52, h: 52, round: true, keep: true },
    { name: "Right", label: "▶", codes: [106], x: 162, y: 495, w: 32, h: 60, keep: true },
    { name: "Down", label: "▼", codes: [108], x: 105, y: 550, w: 60, h: 32, keep: true },
    { name: "Back", label: "Back", codes: [412], x: 45, y: 590, w: 40, h: 40, round: true, keep: true },
    { name: "Settings", label: "Set", codes: [139], x: 165, y: 590, w: 40, h: 40, round: true },
    { name: "Red", label: "", codes: [398], x: 42, y: 630, w: 34, h: 16, colour: "#e5484d" },
    { name: "Green", label: "", codes: [399], x: 83, y: 630, w: 34, h: 16, colour: "#30a46c" },
    { name: "Yellow", label: "", codes: [400], x: 127, y: 630, w: 34, h: 16, colour: "#f5d90a" },
    { name: "Blue", label: "", codes: [401], x: 168, y: 630, w: 34, h: 16, colour: "#3e63dd" },
    { name: "Netflix", label: "Netflix", codes: [1037], x: 60, y: 667, w: 86, h: 32 },
    { name: "Prime Video", label: "Prime", codes: [1038], x: 150, y: 667, w: 86, h: 32 },
    { name: "Disney+", label: "Disney+", codes: [1042], x: 60, y: 707, w: 86, h: 32 },
    { name: "Rakuten TV", label: "Rakuten", codes: [1044], x: 150, y: 707, w: 86, h: 32 },
    { name: "Google Assistant", label: "Google", codes: [1043], x: 60, y: 743, w: 86, h: 32 },
    { name: "Alexa", label: "Alexa", codes: [1086], x: 150, y: 743, w: 86, h: 32 }
  ];
  // Home is never listed, but during a test or while waiting for a button to add it would leave the
  // page, so then it is disabled too.
  var HOME = "773";
  var NAME_LENGTH = 40;
  var TEMPLATES = [{ id: "mr24", name: "LG MR24" }, { id: "blank", name: "Blank" }];
  // Views of Minimal Home a button can open: Home is launched with {"view": …} (see app.js).
  var HOME_VIEWS = [{ label: "Open Sources", view: "sources" }, { label: "Open Home settings", view: "settings" }];
  // Buttons another remote's buttons can act as, so that remote can work the TV's menus and this page.
  var ACTS_AS = ["Back", "OK", "Up", "Down", "Left", "Right", "Home"];
  // A test stops when one button is pressed this many times within STOP_MS, on any remote.
  var STOP_PRESSES = 3;
  var STOP_MS = 2000;

  function buttonFor(code) {
    return MR24.filter(function (button) { return button.codes.indexOf(Number(code)) >= 0; })[0];
  }

  function isKept(code) {
    var button = buttonFor(code);
    return button ? !!button.keep : false;
  }

  // The name of a button: its own name on the Custom remote, else the MR24 name, else its code.
  function nameFor(code, custom) {
    var own = (custom || []).filter(function (button) { return button.code === String(code); })[0];
    if (own) { return own.name; }
    var button = buttonFor(code);
    return button ? button.name : "Button " + code;
  }

  // The name a preset shows for a code: your own names only with the Blank template, so renaming a
  // button there leaves MR24 presets as they are.
  function displayName(template, code, custom) {
    return nameFor(code, template === "blank" ? custom : []);
  }

  // The drawn MR24 button nearest to `from` in a direction ("up", "down", "left" or "right"), or null
  // at the edge. Only buttons within a cone in that direction count (at most twice as far across as
  // along it), and distance across counts double, so moves follow rows and columns.
  function nearestButton(from, direction) {
    var best = null;
    var bestScore = Infinity;
    MR24.forEach(function (button) {
      var dx = button.x - from.x;
      var dy = button.y - from.y;
      var forward = direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
      var cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      if (button === from || forward <= 4 || cross > forward * 2) { return; }
      var score = forward + cross * 2;
      if (score < bestScore) { bestScore = score; best = button; }
    });
    return best;
  }

  // The codes a preset lists (`template` is "mr24" or "blank"): its own buttons in order, then any
  // other bound code, so every binding can be seen and undone. Kept buttons are never listed.
  function listedCodes(template, binds, custom) {
    var codes = template === "blank" ? custom.map(function (button) { return button.code; }) :
      MR24.filter(function (button) { return !button.keep && button.codes.length; })
        .map(function (button) { return String(button.codes[0]); });
    Object.keys(binds || {}).forEach(function (code) {
      if (codes.indexOf(code) < 0 && !isKept(code)) { codes.push(code); }
    });
    return codes;
  }

  // The codes disabled during a test: the listed ones, every MR24 button that can be bound, and Home.
  function testCodes(listed) {
    return listedCodes("mr24", null, []).concat(listed, [HOME]).filter(function (code, index, all) {
      return all.indexOf(code) === index;
    });
  }

  function disabledBinds(codes) {
    var binds = {};
    codes.forEach(function (code) { binds[code] = { action: "ignore" }; });
    return binds;
  }

  function sameBind(left, right) {
    return JSON.stringify(left || null) === JSON.stringify(right || null);
  }

  function indexOf(list, bind) {
    for (var i = 0; i < list.length; i += 1) {
      if (sameBind(list[i].bind, bind)) { return i; }
    }
    return -1;
  }

  // What a button can do, in the order Left/Right step through it. A binding made some other way
  // (`current`, or `original` as first read) is offered as Custom, so stepping past it can come back.
  function choices(apps, current, original) {
    var list = [
      { label: "Normal", bind: null },
      { label: "Disabled", bind: { action: "ignore" } },
      { label: "Screen on/off", bind: { action: "exec", command: SCREEN_TOGGLE } }
    ];
    HOME_VIEWS.forEach(function (entry) {
      list.push({ label: entry.label, bind: { action: "exec", command: "luna-send -n 1 luna://com.webos.service.applicationManager/launch " +
        "'{\"id\":\"org.webosbrew.minimalhome\",\"params\":{\"view\":\"" + entry.view + "\"}}' </dev/null >/dev/null" } });
    });
    ACTS_AS.forEach(function (name) {
      var button = MR24.filter(function (entry) { return entry.name === name; })[0];
      list.push({ label: "Acts as " + name, bind: { action: "replace", keycode: button.codes[0] } });
    });
    apps.forEach(function (app) {
      list.push({ label: "Open " + (app.title || app.id), bind: { action: "launch", id: app.id } });
    });
    var custom = current && indexOf(list, current) < 0 ? current : original;
    if (custom && indexOf(list, custom) < 0) { list.splice(1, 0, { label: "Custom", bind: custom }); }
    return list;
  }

  // The bindings a new TV starts with (remote-hook/load-remote-hook.sh writes the same): Input opens
  // Sources and Settings opens Home's settings.
  function defaultBinds() {
    var list = choices([], null, null);
    function bindFor(label) { return list.filter(function (choice) { return choice.label === label; })[0].bind; }
    return { "139": bindFor("Open Home settings"), "241": bindFor("Open Sources") };
  }

  // The bindings that choices() would show as Custom, to remember them when the file is read.
  function customBinds(binds, apps) {
    var standard = choices(apps, null, null);
    var found = {};
    Object.keys(binds || {}).forEach(function (code) {
      if (indexOf(standard, binds[code]) < 0) { found[code] = binds[code]; }
    });
    return found;
  }

  // Follows the presses during a test: `streak` is the last button and when it was pressed in a row
  // (null at first). Returns the new streak and whether it asks to stop the test.
  function stopStreak(streak, code, now) {
    var times = streak && streak.code === code ? streak.times.filter(function (time) { return now - time < STOP_MS; }) : [];
    times = times.concat([now]);
    return { streak: { code: code, times: times }, stop: times.length >= STOP_PRESSES };
  }

  // Reads the poll's output: the codes of presses after `position` (lines), then "#" and the log's
  // line count. Returns the codes and the position for the next poll; the first poll (position null)
  // only finds where the log ends. The log starts over at every boot.
  function readPresses(output, position) {
    var lines = String(output || "").trim().split("\n");
    var total = parseInt((lines.pop() || "").replace("#", ""), 10);
    if (isNaN(total)) { return { codes: [], position: position, missing: true }; }
    var codes = lines.filter(function (line) { return /^\d+$/.test(line); });
    return { codes: codes, position: position !== null && total < position ? 0 : total, missing: false };
  }

  // The Custom remote's buttons as saved (JSON text): a list of { code, name }, without broken entries.
  function parseCustom(text) {
    var list;
    try { list = JSON.parse(text); } catch (error) { return []; }
    if (!Array.isArray(list)) { return []; }
    return list.filter(function (button, index) {
      return button && /^\d+$/.test(String(button.code)) && typeof button.name === "string" &&
        list.findIndex(function (other) { return other && String(other.code) === String(button.code); }) === index;
    }).map(function (button) { return { code: String(button.code), name: cleanName(button.name, button.code) }; });
  }

  function cleanName(name, code) {
    var clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, NAME_LENGTH);
    return clean || nameFor(code, null);
  }

  // The Custom remote with a button added (named after the MR24 button with that code, if any), or
  // renamed when it is already there.
  function withButton(custom, code, name) {
    code = String(code);
    var clean = cleanName(name, code);
    var found = custom.some(function (button) { return button.code === code; });
    return found ? custom.map(function (button) { return button.code === code ? { code: code, name: clean } : button; }) :
      custom.concat([{ code: code, name: clean }]);
  }

  function withoutButton(custom, code) {
    return custom.filter(function (button) { return button.code !== String(code); });
  }

  function copy(value) {
    return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function templateName(id) {
    return TEMPLATES.filter(function (template) { return template.id === id; })[0].name;
  }

  function isPreset(preset) {
    return preset && typeof preset.id === "string" && typeof preset.name === "string" &&
      TEMPLATES.some(function (template) { return template.id === preset.template; });
  }

  // The presets as saved (JSON text): { active, list: [{ id, name, template, buttons, binds }] }. A
  // preset's binds is null until the bindings file is read; the file then gives them. Without saved
  // presets they are made from what was saved before presets existed (`legacyRemote` "mr24" or
  // "custom", and the Custom buttons): an LG MR24 preset, and a Blank one named Custom with those
  // buttons, both starting from the file's bindings.
  function parsePresets(text, legacyRemote, legacyCustomText) {
    var saved = null;
    try { saved = JSON.parse(text); } catch (error) { saved = null; }
    var list = saved && Array.isArray(saved.list) ? saved.list.filter(isPreset).map(function (preset) {
      return {
        id: preset.id, name: cleanName(preset.name, preset.id), template: preset.template,
        buttons: parseCustom(JSON.stringify(preset.buttons || [])),
        binds: preset.binds && typeof preset.binds === "object" && !Array.isArray(preset.binds) ? preset.binds : null
      };
    }) : [];
    if (list.length) {
      var active = list.some(function (preset) { return preset.id === saved.active; }) ? saved.active : list[0].id;
      return { active: active, list: list };
    }
    list = [{ id: "p1", name: templateName("mr24"), template: "mr24", buttons: [], binds: null }];
    var legacyCustom = parseCustom(legacyCustomText);
    if (legacyCustom.length || legacyRemote === "custom") {
      list.push({ id: "p2", name: "Custom", template: "blank", buttons: legacyCustom, binds: null });
    }
    return { active: legacyRemote === "custom" ? "p2" : "p1", list: list };
  }

  function activePreset(presets) {
    return presets.list.filter(function (preset) { return preset.id === presets.active; })[0];
  }

  // The presets with a new one made from a template, which becomes the active one. An LG MR24
  // preset starts with the default bindings, a Blank one with none.
  function withNewPreset(presets, template, name) {
    var number = presets.list.reduce(function (highest, preset) {
      return Math.max(highest, parseInt(preset.id.slice(1), 10) || 0);
    }, 0) + 1;
    var preset = {
      id: "p" + number, name: String(name || "").replace(/\s+/g, " ").trim().slice(0, NAME_LENGTH) || templateName(template),
      template: template, buttons: [], binds: template === "mr24" ? defaultBinds() : {}
    };
    return { active: preset.id, list: copy(presets.list).concat([preset]) };
  }

  function withPresetRenamed(presets, id, name) {
    var clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, NAME_LENGTH);
    if (!clean) { return presets; }
    return { active: presets.active, list: copy(presets.list).map(function (preset) {
      if (preset.id === id) { preset.name = clean; }
      return preset;
    }) };
  }

  // The presets without one. The last preset can't be deleted; deleting the active one activates
  // the preset before it (or after it, for the first).
  function withoutPreset(presets, id) {
    if (presets.list.length < 2) { return presets; }
    var index = presets.list.map(function (preset) { return preset.id; }).indexOf(id);
    var list = copy(presets.list).filter(function (preset) { return preset.id !== id; });
    var active = presets.active === id ? list[Math.max(0, index - 1)].id : presets.active;
    return { active: active, list: list };
  }

  // What Left/Right step through on the preset row: the presets.
  function presetChoices(presets) {
    return presets.list.map(function (preset) { return { kind: "preset", id: preset.id, label: preset.name }; });
  }

  // The preset menu (the ⋯ button): making a new preset, and renaming or deleting the active one
  // (deleting only when there is another).
  function presetActions(presets) {
    var name = activePreset(presets).name;
    var list = [{ kind: "new", label: "New preset…" }, { kind: "rename", label: "Rename “" + name + "”…" }];
    if (presets.list.length > 1) { list.push({ kind: "delete", label: "Delete “" + name + "”…" }); }
    return list;
  }

  // A pressed code that can be added to the Custom remote: not one of the kept buttons.
  function canAdd(code) {
    return !isKept(code);
  }

  return {
    MR24: MR24, HOME: HOME, SCREEN_TOGGLE: SCREEN_TOGGLE, buttonFor: buttonFor, isKept: isKept, nameFor: nameFor,
    displayName: displayName, nearestButton: nearestButton, stopStreak: stopStreak, STOP_PRESSES: STOP_PRESSES,
    listedCodes: listedCodes, testCodes: testCodes, disabledBinds: disabledBinds, sameBind: sameBind, indexOf: indexOf,
    choices: choices, defaultBinds: defaultBinds, customBinds: customBinds, TEMPLATES: TEMPLATES, templateName: templateName,
    parsePresets: parsePresets, activePreset: activePreset, withNewPreset: withNewPreset, withPresetRenamed: withPresetRenamed,
    withoutPreset: withoutPreset, presetChoices: presetChoices, presetActions: presetActions, readPresses: readPresses, parseCustom: parseCustom,
    withButton: withButton, withoutButton: withoutButton, canAdd: canAdd
  };
}());

if (typeof module !== "undefined") { module.exports = RemoteLogic; }
