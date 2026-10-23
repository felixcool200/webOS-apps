// The Remote buttons view inside Minimal Home: what each remote button does, next to a drawing of the
// LG MR24 Magic Remote that outlines the button selected in the list. The bindings live in LG Input
// Hook's keybinds.json, which the hook loaded by remote-hook/load-remote-hook.sh reapplies by itself
// at the next key press after the file changes (see NEXT_SECOND), so a change takes effect right away. Home shows #remote-view and routes
// keys and pointer movement here.
//
// Test remote lights the drawn buttons up as the TV receives them. During the test every listed button
// is disabled so that pressing it only lights it up and selects its row, Home is disabled and the page
// ignores the other keys too, and Back pressed twice stops the test (as does Home going out of sight). The real bindings wait in BACKUP and become active
// again when the test stops, or at Home's next start if it was reloaded or the TV restarted meanwhile.
var RemoteButtons = (function () {
  "use strict";

  var KEY = WebOS.KEY;
  var rootExec = WebOS.rootExec;
  var CONFIG = "/home/root/.config/lginputhook/keybinds.json";
  var BACKUP = CONFIG + ".before-test";
  // At each key press the hook rereads CONFIG if its modification time, in whole seconds, has moved on.
  // So a change waits for the next second when CONFIG already changed in this one, and a restored file
  // gets the current time (mv keeps BACKUP's older one).
  var NEXT_SECOND = "[ \"$(date +%s)\" -gt \"$(stat -c %Y " + CONFIG + " 2>/dev/null || echo 0)\" ] || sleep 1; ";
  var RESTORE = "[ ! -f " + BACKUP + " ] || { " + NEXT_SECOND + "mv " + BACKUP + " " + CONFIG + " && touch " + CONFIG + "; }";
  var HOOK_LOG = "/tmp/lginput-hook-lginput2.log";
  var POWER = "luna-send -n 1 luna://com.webos.service.tvpower/power/";
  // The hook runs it on the press and passes the release on, which does not wake the screen.
  var SCREEN_TOGGLE = "if luna-send -n 1 -f luna://com.webos.service.tvpower/power/getPowerState '{}' </dev/null | grep -q '\"Screen Off\"'; " +
    "then " + POWER + "turnOnScreen '{}' </dev/null >/dev/null; " +
    "else " + POWER + "turnOffScreen '{}' </dev/null >/dev/null; fi";
  var SAVE_DELAY_MS = 500;
  // Right after the app manager restarts, Homebrew Channel's root service may not answer yet.
  var RESTORE_RETRY_MS = [1000, 3000, 10000];
  var POLL_MS = 300;
  var LIT_MS = 900;
  var BACK_TWICE_MS = 2000;
  // Home stays usable outside a test, but during one it would leave the page, so it only lights up too.
  var HOME_CODE = "773";
  var HINTS = {
    browse: "The outlined button is the one selected in the list. Changes take effect right away. " +
      "To find a button by pressing it, choose Test remote (Right from the list).",
    test: "Every button now only lights up, and pressing a listed button selects its row. " +
      "Press Back twice to stop the test."
  };
  // Buttons of the MR24 remote in reading order: the codes the hook logs (checked by pressing every
  // button), a short label for the drawing, and the button's centre and size on a 210 x 960 grid
  // traced from a photo (x from the remote's left edge, y from its top). Buttons marked `keep` are never
  // bound or disabled, so the remote stays usable: OK, arrows, Back and Home.
  var BUTTONS = [
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
  var WIDTH = 210;
  var HEIGHT = 960;

  var binds = null;
  var apps = [];
  var selected = null;
  // The row whose action Left/Right change, entered with OK as in the Settings view.
  var editing = null;
  // The code of the row selected last, to return to from the Test remote button.
  var lastCode = null;
  var testing = false;
  var backPressedAt = 0;
  // Where changes are saved: CONFIG, or BACKUP while the test has the buttons disabled.
  var target = CONFIG;
  var saveTimer = null;
  var pollTimer = null;
  var pollRun = 0;
  var position = null;
  var isSetUp = false;
  // File changes run one after another, so the buttons can never be restored before they are disabled.
  var work = Promise.resolve();

  function setStatus(message, type) {
    var box = document.getElementById("remote-status");
    box.textContent = message;
    box.className = type || "";
  }

  function queue(task) {
    work = work.then(task).catch(function (error) { setStatus(error.message, "error"); });
    return work;
  }

  // Runs a shell command as root; rejects when it fails or Homebrew Channel does not answer.
  function shell(command) {
    return rootExec(command).then(function (result) {
      if (!result || result.returnValue === false) { throw new Error((result && result.errorText) || "No response"); }
      return result;
    });
  }

  function testButton() {
    return document.getElementById("remote-test");
  }

  function buttonFor(code) {
    return BUTTONS.filter(function (button) { return button.codes.indexOf(code) >= 0; })[0];
  }

  function isKept(code) {
    var button = buttonFor(code);
    return button ? !!button.keep : false;
  }

  // The listed buttons' codes: every button that can be bound, plus codes bound some other way.
  function listedCodes() {
    var codes = [];
    BUTTONS.forEach(function (button) {
      if (!button.keep && button.codes.length) { codes.push(String(button.codes[0])); }
    });
    Object.keys(binds || {}).forEach(function (code) {
      if (codes.indexOf(code) < 0 && !isKept(Number(code))) { codes.push(code); }
    });
    return codes;
  }

  function updateSummary() {
    var count = Object.keys(binds || {}).length;
    var summary = document.getElementById("remote-summary");
    if (summary) { summary.textContent = count ? count + " changed" : "None changed"; }
  }

  // Reads the bindings for the list and the Settings summary, first making the real ones active again
  // if Home was closed during a test. During a test, binds already holds the real bindings.
  function load() {
    return queue(function () {
      if (target === BACKUP) { return null; }
      return shell(RESTORE + "; cat " + CONFIG + " 2>/dev/null || echo '{}'").then(function (result) {
        binds = JSON.parse(result.stdoutString || "{}");
      }).catch(function (error) {
        console.warn("Could not read the remote button bindings: " + error.message);
        binds = binds || {};
      }).then(updateSummary);
    });
  }

  function writeFile(path, data) {
    return shell((path === CONFIG ? NEXT_SECOND : "") + "echo " + window.btoa(JSON.stringify(data)) + " | base64 -d > " + path + ".new && mv " + path + ".new " + path);
  }

  // Sets the real bindings aside and disables every listed button until the test stops.
  function setAside() {
    var disabled = {};
    listedCodes().concat(HOME_CODE).forEach(function (code) { disabled[code] = { action: "ignore" }; });
    return shell("[ -f " + BACKUP + " ] || cp " + CONFIG + " " + BACKUP + " 2>/dev/null || echo '{}' > " + BACKUP)
      .then(function () {
        target = BACKUP;
        return writeFile(CONFIG, disabled);
      });
  }

  // Makes the real bindings active again. Safe to call when nothing was set aside. Resolves to whether
  // it worked.
  function restore(attempt) {
    return shell(RESTORE).then(function () { return true; }).catch(function (error) {
      if (attempt >= RESTORE_RETRY_MS.length) {
        console.warn("Could not restore the remote button bindings: " + error.message);
        return false;
      }
      return new Promise(function (resolve) { window.setTimeout(resolve, RESTORE_RETRY_MS[attempt]); })
        .then(function () { return restore(attempt + 1); });
    });
  }

  function save() {
    saveTimer = null;
    return writeFile(target, binds)
      .then(function () { setStatus("Saved", "ok"); })
      .catch(function (error) { setStatus("Could not save: " + error.message, "error"); });
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () { queue(save); }, SAVE_DELAY_MS);
    updateSummary();
  }

  // Saves a change that is still waiting for SAVE_DELAY_MS. Only called from a queued task.
  function flush() {
    if (saveTimer === null) { return null; }
    window.clearTimeout(saveTimer);
    return save();
  }

  // The actions a button can cycle through; a binding made elsewhere shows as Custom until changed.
  function choices(code) {
    var list = [
      { label: "Normal", bind: null },
      { label: "Disabled", bind: { action: "ignore" } },
      { label: "Screen on/off", bind: { action: "exec", command: SCREEN_TOGGLE } }
    ];
    apps.forEach(function (app) {
      list.push({ label: "Open " + (app.title || app.id), bind: { action: "launch", id: app.id } });
    });
    var current = binds[code];
    if (current && indexOf(list, current) < 0) { list.splice(1, 0, { label: "Custom", bind: current }); }
    return list;
  }

  function indexOf(list, bind) {
    for (var i = 0; i < list.length; i += 1) {
      if (JSON.stringify(list[i].bind) === JSON.stringify(bind || null)) { return i; }
    }
    return -1;
  }

  function makeRow(code) {
    var button = buttonFor(Number(code));
    var row = document.createElement("button");
    row.type = "button";
    row.className = "setting focusable";
    row.setAttribute("data-code", code);
    var name = document.createElement("strong");
    name.textContent = button ? button.name : "Button " + code;
    var value = document.createElement("span");
    value.className = "value";
    row.appendChild(name);
    row.appendChild(value);
    renderValue(row);
    // OK, or a click with the pointer, starts or ends changing the action, except during a test.
    row.addEventListener("click", function () {
      if (testing) { return; }
      if (editing === row) { stopEditing(); }
      else { startEditing(row); }
    });
    return row;
  }

  function renderValue(row) {
    var code = row.getAttribute("data-code");
    var list = choices(code);
    row.querySelector(".value").textContent = list[Math.max(0, indexOf(list, binds[code]))].label;
  }

  function rowFor(code) {
    return code === null ? null : document.querySelector('#remote-list [data-code="' + code + '"]');
  }

  function render() {
    stopEditing();
    var box = document.getElementById("remote-list");
    box.textContent = "";
    listedCodes().forEach(function (code) { box.appendChild(makeRow(code)); });
    if (selected !== testButton()) { setFocus(rowFor(lastCode) || box.querySelector(".focusable")); }
  }

  // Draws the remote and wires up the Test remote button, the first time the view opens.
  function setUp() {
    if (isSetUp) { return; }
    isSetUp = true;
    testButton().addEventListener("click", function () {
      setFocus(testButton());
      if (testing) { stopTest(); } else { startTest(); }
    });
    // Another app or the screensaver taking over must not leave the buttons disabled.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && testing) { stopTest(); }
    });
    var remote = document.getElementById("remote-drawing");
    var ring = document.createElement("div");
    ring.className = "wheel-ring";
    remote.appendChild(ring);
    BUTTONS.forEach(function (button) {
      var element = document.createElement("div");
      element.className = "remote-button" + (button.round ? " round" : "") + (button.power ? " power" : "");
      element.style.left = (button.x - button.w / 2) / WIDTH * 100 + "%";
      element.style.top = (button.y - button.h / 2) / HEIGHT * 100 + "%";
      element.style.width = button.w / WIDTH * 100 + "%";
      element.style.height = button.h / HEIGHT * 100 + "%";
      if (button.colour) { element.style.background = button.colour; }
      element.textContent = button.label;
      button.element = element;
      remote.appendChild(element);
    });
  }

  function light(element) {
    element.classList.remove("lit");
    // Restart the highlight even if the same button is pressed again.
    void element.offsetWidth;
    element.classList.add("lit");
    window.clearTimeout(element.litTimer);
    element.litTimer = window.setTimeout(function () { element.classList.remove("lit"); }, LIT_MS);
  }

  // Outlines the drawn button of the selected row, or none when the row has no drawn button.
  function outline(code) {
    var match = code ? buttonFor(Number(code)) : null;
    BUTTONS.forEach(function (button) { button.element.classList.toggle("is-selected", button === match); });
  }

  // A press on the remote lights the button up and, for listed buttons, selects its row.
  function pressed(code) {
    var button = buttonFor(code);
    if (button) { light(button.element); }
    var row = rowFor(String(code));
    if (row) {
      setFocus(row);
      setStatus("");
    } else if (!button) {
      setStatus("Unknown button · code " + code);
    }
  }

  // Reads the codes of button presses logged after `position`, in one pass so no line is missed. A
  // read that is still running when the test stops (pollRun changes) is dropped.
  function poll(run) {
    var start = position === null ? -1 : position;
    rootExec("awk -v s=" + start + " 'NR>s && s>=0 && /state=1 uinput_code=/ { match($0, /uinput_code=[0-9]+/); " +
      "print substr($0, RSTART + 12, RLENGTH - 12) } END { print \"#\" NR }' " + HOOK_LOG).then(function (result) {
      if (run !== pollRun) { return; }
      var lines = ((result && result.stdoutString) || "").trim().split("\n");
      var total = parseInt(lines.pop().replace("#", ""), 10);
      // The log starts over at every boot.
      position = position !== null && total < position ? 0 : total;
      lines.forEach(function (line) { if (line) { pressed(parseInt(line, 10)); } });
    }).catch(function (error) {
      if (run === pollRun) { setStatus("Could not read the button log: " + error.message, "error"); }
    }).then(function () {
      if (run === pollRun) { pollTimer = window.setTimeout(function () { poll(run); }, POLL_MS); }
    });
  }

  function showMode() {
    var button = testButton();
    button.textContent = testing ? "Stop test" : "Test remote";
    button.classList.toggle("is-active", testing);
    document.getElementById("remote-hint").textContent = testing ? HINTS.test : HINTS.browse;
    updateHints();
  }

  function updateHints() {
    var hints = testing ? ["", "", "<b>Back twice</b> Stop test"] :
      editing ? ["<b>← →</b> Change", "<b>OK</b> Done", "<b>Back</b> Done"] :
      ["<b>Arrows</b> Move", "<b>OK</b> Select", "<b>Back</b> Settings"];
    ["move", "select", "back"].forEach(function (name, index) {
      var hint = document.getElementById("remote-" + name + "-hint");
      hint.innerHTML = hints[index];
      hint.hidden = !hints[index];
    });
  }

  function startEditing(row) {
    setFocus(row);
    editing = row;
    row.classList.add("is-editing");
    updateHints();
    setStatus("Editing " + row.querySelector("strong").textContent + " · Left/Right changes");
  }

  function stopEditing() {
    if (!editing) { return; }
    editing.classList.remove("is-editing");
    editing = null;
    updateHints();
    setStatus("");
  }

  function startTest() {
    testing = true;
    backPressedAt = 0;
    showMode();
    setStatus("Press any button on the remote");
    pollRun += 1;
    position = null;
    poll(pollRun);
    queue(function () {
      return Promise.resolve(flush()).then(setAside).catch(function (error) {
        setStatus("Buttons may open things during the test: " + error.message, "error");
      });
    });
  }

  // Stops lighting buttons up and makes the real bindings active again. Returns when that is done.
  function stopTest() {
    testing = false;
    pollRun += 1;
    window.clearTimeout(pollTimer);
    showMode();
    setStatus("");
    return queue(function () {
      return Promise.resolve(flush()).then(function () { return restore(0); }).then(function (restored) {
        target = CONFIG;
        if (!restored) { setStatus("Could not turn the buttons back on · Home retries at its next start", "error"); }
      });
    });
  }

  function setFocus(element) {
    if (!element) { return; }
    if (editing && element !== editing) { stopEditing(); }
    if (selected) { selected.classList.remove("is-focused"); }
    selected = element;
    selected.classList.add("is-focused");
    var code = selected.getAttribute("data-code");
    outline(code);
    if (!code) { return; }
    lastCode = code;
    // Scroll the list just enough to show the whole row (offsets are relative to the list).
    var list = selected.parentNode;
    var bottom = selected.offsetTop + selected.offsetHeight;
    if (selected.offsetTop < list.scrollTop) { list.scrollTop = selected.offsetTop; }
    else if (bottom > list.scrollTop + list.clientHeight) { list.scrollTop = bottom - list.clientHeight; }
  }

  function change(step) {
    var code = selected && selected.getAttribute("data-code");
    if (!code) { return; }
    var list = choices(code);
    var index = (Math.max(0, indexOf(list, binds[code])) + step + list.length) % list.length;
    if (list[index].bind) { binds[code] = list[index].bind; }
    else { delete binds[code]; }
    renderValue(selected);
    setStatus("");
    scheduleSave();
  }

  // Returns "leave" when Back should take the user back to Settings. During a test, keys only light up
  // and Back pressed twice stops it.
  function handleKey(event) {
    event.preventDefault();
    var key = event.keyCode;
    if (testing) {
      if (key !== KEY.BACK || event.repeat) { return null; }
      if (Date.now() - backPressedAt < BACK_TWICE_MS) { stopTest(); }
      else {
        backPressedAt = Date.now();
        setStatus("Press Back again to stop the test");
      }
    } else if (key === KEY.BACK) {
      if (!editing) { return "leave"; }
      stopEditing();
    } else if (!selected || (key === KEY.ENTER && event.repeat)) {
      return null;
    } else if (editing && (key === KEY.LEFT || key === KEY.RIGHT)) {
      change(key === KEY.RIGHT ? 1 : -1);
    } else if (key === KEY.ENTER) {
      selected.click();
    } else if (selected === testButton()) {
      // The list is below and to the left of the button.
      if (key === KEY.DOWN || key === KEY.LEFT) { setFocus(rowFor(lastCode) || document.querySelector("#remote-list .focusable")); }
    } else if (key === KEY.RIGHT) {
      setFocus(testButton());
    } else if (key === KEY.UP) {
      setFocus(selected.previousElementSibling || testButton());
    } else if (key === KEY.DOWN) {
      setFocus(selected.nextElementSibling);
    }
    return null;
  }

  function handlePointer(event) {
    var element = event.target.closest && event.target.closest("#remote-view .focusable");
    // During a test the list follows the buttons pressed, not the pointer.
    if (testing && element !== testButton()) { return; }
    if (element && element !== selected) { setFocus(element); }
  }

  // installedApps: the apps Home knows about, offered as "Open …" actions.
  function open(installedApps) {
    apps = installedApps.slice().sort(function (left, right) { return String(left.title).localeCompare(String(right.title)); });
    setUp();
    testing = false;
    showMode();
    setStatus("");
    if (selected) { selected.classList.remove("is-focused"); }
    selected = null;
    // Show the bindings read at Home's start straight away, then the ones on the TV now.
    if (binds) { render(); }
    load().then(render);
  }

  // Ends a test and saves pending changes. Returns when the bindings are in place.
  function close() {
    return testing ? stopTest() : queue(flush);
  }

  return { load: load, open: open, close: close, restore: function () { return restore(0); }, handleKey: handleKey, handlePointer: handlePointer };
}());
