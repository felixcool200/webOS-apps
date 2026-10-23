// The Remote buttons view inside Minimal Home: what each remote button does. The list shows the buttons
// of the chosen remote: the LG MR24 Magic Remote, drawn next to the list (the selected row's button is
// outlined, and choosing a drawn button with the arrows or the pointer opens its row), or Custom, your
// own named buttons for anything the MR24 list doesn't cover. Each remote shows its own names, while
// the bindings are shared: the TV sees the same code from either. The rules live in remote-logic.js.
//
// The bindings live in LG Input Hook's keybinds.json, which the hook loaded by
// remote-hook/load-remote-hook.sh reapplies by itself at the next key press after the file changes (see
// NEXT_SECOND), so a change takes effect right away. Home shows #remote-view and routes keys and pointer
// movement here.
//
// Test remote lights buttons up as the TV receives them, and Add a button waits for the button to add.
// Meanwhile every bindable button and Home are disabled so that pressing one does nothing else, and
// the page ignores other keys. Pressing any button three times quickly ends a test (Back ends adding
// a button), on any remote since the presses are read from the hook's log; so does Home going out of
// sight. The
// real bindings wait in BACKUP and become active again when it ends, or the next time the bindings are
// read (load) if Home was reloaded or the TV restarted meanwhile.
var RemoteButtons = (function () {
  "use strict";

  var KEY = WebOS.KEY;
  var Logic = RemoteLogic;
  // Also written in remote-hook/load-remote-hook.sh, which restores BACKUP at boot.
  var CONFIG = "/home/root/.config/lginputhook/keybinds.json";
  var BACKUP = CONFIG + ".before-test";
  var HOOK_LOG = "/tmp/lginput-hook-lginput2.log";
  // At each key press the hook rereads CONFIG if its modification time, in whole seconds, has moved on.
  // So a change waits for the next second when CONFIG already changed in this one, and a restored file
  // gets the current time (mv keeps BACKUP's older one).
  var NEXT_SECOND = "[ \"$(date +%s)\" -gt \"$(stat -c %Y " + CONFIG + " 2>/dev/null || echo 0)\" ] || sleep 1; ";
  var RESTORE = "[ ! -f " + BACKUP + " ] || { " + NEXT_SECOND + "mv " + BACKUP + " " + CONFIG + " && touch " + CONFIG + "; }";
  var SAVE_DELAY_MS = 500;
  // Right after the app manager restarts, Homebrew Channel's root service may not answer yet.
  var RETRY_MS = [1000, 3000, 10000];
  var POLL_MS = 300;
  var LIT_MS = 900;
  var CAPTURE_MS = 15000;
  var BACK_CODE = "412";
  var REMOTE_KEY = "remote.model";
  var CUSTOM_KEY = "remote.customButtons";
  var REMOTES = [{ id: "mr24", name: "LG MR24" }, { id: "custom", name: "Custom" }];
  var WIDTH = 210;
  var HEIGHT = 960;
  var HINTS = {
    mr24: "The outlined button is the one selected in the list. Right moves into the drawing, where the arrows " +
      "or the pointer pick a button and OK changes it. Changes take effect right away. Test remote finds a " +
      "button by pressing it.",
    custom: "Your own buttons, for another remote or buttons the MR24 list lacks. Add one at the end of the " +
      "list, then name or remove it here. Changes take effect right away.",
    test: "Every button now only lights up, and pressing a listed button selects its row. Press any button " +
      "three times quickly to stop the test.",
    capture: "Press the button to add within 15 seconds. Back cancels."
  };
  var NO_HOOK = "The button hook isn't loaded, so changes have no effect (see Remote button hook in the README)";

  var host = null;
  var apps = [];
  // The bindings as last read, null until read once. Changes wait until they were read since the
  // view opened (fresh), so a change can never be made to an outdated copy and overwrite the file.
  var binds = null;
  var fresh = false;
  var readError = null;
  var hooked = null;
  // Bindings made some other way, remembered so they stay on offer as Custom (see Logic.choices).
  var originals = {};
  var remote = "mr24";
  var custom = [];
  var selected = null;
  // The row or the remote choice whose value Left/Right change, entered with OK as in Settings.
  var editing = null;
  // The code of the row selected last, or "add" for Add a button; the drawing and the card show it.
  var lastCode = null;
  // "test", "capture" (waiting for a button to add) or null.
  var listening = null;
  // The button pressed last during a test and when, to stop on three quick presses (Logic.stopStreak).
  var streak = null;
  // The drawn button the arrows or the pointer are on, while the drawing has the focus, and the last
  // one, where the drawing is entered again from above or below.
  var pointed = null;
  var lastPointed = null;
  var captureTimer = null;
  // The code being renamed, while the name field is open.
  var renaming = null;
  // Where changes are saved: CONFIG, or BACKUP while the buttons are disabled (or could not be restored).
  var target = CONFIG;
  var saveTimer = null;
  var pollTimer = null;
  var pollRun = 0;
  var position = null;
  var drawn = [];
  var isBuilt = false;
  // File changes run one after another, so the buttons can never be restored before they are disabled.
  var work = Promise.resolve();

  function $(id) { return document.getElementById(id); }

  function setStatus(message, type) {
    UI.setStatus("remote-status", message, type);
  }

  function queue(task) {
    work = work.then(task).catch(function (error) { setStatus(error.message, "error"); });
    return work;
  }

  function readStored(key) {
    try { return window.localStorage.getItem(key); }
    catch (error) {
      console.warn("Could not read " + key + ": " + error.message);
      return null;
    }
  }

  function store(key, value) {
    try { window.localStorage.setItem(key, value); }
    catch (error) { setStatus("Could not save: " + error.message, "error"); }
  }

  function listed() {
    return Logic.listedCodes(remote, binds, custom);
  }

  function isCustom(code) {
    return custom.some(function (button) { return button.code === code; });
  }

  function updateSummary() {
    var count = Object.keys(binds || {}).length;
    host.setLinkValue("remote", binds === null ? "—" : count ? count + " changed" : "None changed");
  }

  // Reads the bindings, first making the real ones active again if a test was cut short. Skipped
  // while listening, when binds already holds the real bindings.
  function load() {
    return queue(function () {
      if (listening) { return null; }
      return WebOS.retry(function () {
        return WebOS.rootShell(RESTORE + "; if [ -f " + HOOK_LOG + " ]; then echo hooked; else echo unhooked; fi; " +
          "cat " + CONFIG + " 2>/dev/null || echo '{}'");
      }, RETRY_MS).then(function (result) {
        var output = result.stdoutString || "";
        var lineEnd = output.indexOf("\n");
        var read = JSON.parse(output.slice(lineEnd + 1) || "{}");
        hooked = output.slice(0, lineEnd) === "hooked";
        binds = read && typeof read === "object" && !Array.isArray(read) ? read : {};
        originals = Object.assign({}, originals, Logic.customBinds(binds, apps));
        target = CONFIG;
        fresh = true;
        readError = null;
      }).catch(function (error) {
        readError = error.message;
        console.warn("Could not read the remote button bindings: " + error.message);
      }).then(updateSummary);
    });
  }

  function writeFile(path, data) {
    return WebOS.rootShell((path === CONFIG ? NEXT_SECOND : "") + "echo " + WebOS.base64(JSON.stringify(data)) +
      " | base64 -d > " + path + ".new && mv " + path + ".new " + path);
  }

  // Sets the real bindings aside and disables every bindable button and Home.
  function setAside() {
    var disabled = Logic.disabledBinds(Logic.testCodes(listed()));
    return WebOS.rootShell("[ -f " + BACKUP + " ] || cp " + CONFIG + " " + BACKUP + " 2>/dev/null || echo '{}' > " + BACKUP)
      .then(function () {
        target = BACKUP;
        return writeFile(CONFIG, disabled);
      });
  }

  // Makes the real bindings active again; until that works, changes keep going to BACKUP.
  function restore() {
    return WebOS.retry(function () { return WebOS.rootShell(RESTORE); }, RETRY_MS).then(function () {
      target = CONFIG;
    }).catch(function (error) {
      setStatus("Could not turn the buttons back on (" + error.message + ") · reopen this page to retry", "error");
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

  function choicesFor(code) {
    return Logic.choices(apps, binds[code], originals[code]);
  }

  function rowFor(code) {
    if (code === null) { return null; }
    return code === "add" ? $("remote-add") : document.querySelector('#remote-list [data-code="' + code + '"]');
  }

  function firstRow() {
    return document.querySelector("#remote-list .focusable");
  }

  function makeRow(code) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "setting focusable";
    row.setAttribute("data-code", code);
    var name = document.createElement("span");
    name.className = "copy";
    var label = document.createElement("strong");
    label.textContent = Logic.displayName(remote, code, custom);
    var number = document.createElement("small");
    number.textContent = code;
    name.appendChild(label);
    name.appendChild(number);
    var value = document.createElement("span");
    value.className = "value";
    row.appendChild(name);
    row.appendChild(value);
    renderValue(row);
    // OK, or a click with the pointer, starts or ends changing the action.
    row.addEventListener("click", function () {
      if (listening) { return; }
      if (editing === row) { stopEditing(); }
      else { startEditing(row); }
    });
    return row;
  }

  function makeAddRow() {
    var row = document.createElement("button");
    row.type = "button";
    row.id = "remote-add";
    row.className = "setting focusable";
    row.innerHTML = '<span class="copy"><strong>Add a button</strong><small>OK, then press the button</small></span><span class="value"></span>';
    row.addEventListener("click", function () {
      if (!listening) { listen("capture"); }
    });
    return row;
  }

  function renderValue(row) {
    var code = row.getAttribute("data-code");
    var list = binds ? choicesFor(code) : null;
    row.querySelector(".value").textContent = list ? list[Math.max(0, Logic.indexOf(list, binds[code]))].label : "—";
  }

  function render() {
    stopEditing();
    var box = $("remote-list");
    box.textContent = "";
    listed().forEach(function (code) { box.appendChild(makeRow(code)); });
    if (remote === "custom") { box.appendChild(makeAddRow()); }
    if (!isSide(selected)) { setFocus(rowFor(lastCode) || firstRow()); }
    showRemote();
  }

  // Draws the remote and wires up the buttons beside the list, the first time the view opens.
  function build() {
    if (isBuilt) { return; }
    isBuilt = true;
    $("remote-test").addEventListener("click", function () {
      setFocus($("remote-test"));
      if (listening === "test") { stopListening(""); }
      else if (!listening) { listen("test"); }
    });
    $("remote-model").addEventListener("click", function () {
      if (listening) { return; }
      if (editing === $("remote-model")) { stopEditing(); }
      else { startEditing($("remote-model")); }
    });
    $("remote-rename").addEventListener("click", function () {
      if (!listening && lastCode && lastCode !== "add") { startRename(lastCode); }
    });
    $("remote-remove").addEventListener("click", function () {
      if (!listening && isCustom(lastCode)) { removeButton(lastCode); }
    });
    $("remote-name").addEventListener("blur", function () { finishRename(true); });
    // Another app or the screensaver taking over must not leave the buttons disabled.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && listening) { stopListening(""); }
    });
    var drawing = $("remote-drawing");
    var ring = document.createElement("div");
    ring.className = "wheel-ring";
    drawing.appendChild(ring);
    Logic.MR24.forEach(function (button) {
      var element = document.createElement("div");
      element.className = "remote-button" + (button.round ? " round" : "") + (button.power ? " power" : "");
      element.style.left = (button.x - button.w / 2) / WIDTH * 100 + "%";
      element.style.top = (button.y - button.h / 2) / HEIGHT * 100 + "%";
      element.style.width = button.w / WIDTH * 100 + "%";
      element.style.height = button.h / HEIGHT * 100 + "%";
      if (button.colour) { element.style.background = button.colour; }
      element.textContent = button.label;
      element.addEventListener("click", function () { pickFromDrawing(button); });
      element.setAttribute("data-button", button.name);
      drawn.push({ button: button, element: element });
      drawing.appendChild(element);
    });
  }

  function drawnFor(code) {
    var button = Logic.buttonFor(code);
    return drawn.filter(function (entry) { return entry.button === button; })[0];
  }

  function entryFor(button) {
    return drawn.filter(function (entry) { return entry.button === button; })[0];
  }

  // Moves the drawing's highlight to a drawn button and says what it does. A button with a row becomes
  // the selected one, so the list follows and Left leads to its row.
  function point(entry) {
    if (pointed) { pointed.element.classList.remove("is-pointed"); }
    pointed = entry;
    if (!entry) { return; }
    lastPointed = entry;
    entry.element.classList.add("is-pointed");
    var button = entry.button;
    var code = String(button.codes[0]);
    if (!button.power && !button.keep) {
      lastCode = code;
      UI.keepInView(rowFor(code));
      showSelection();
    }
    setStatus(button.power ? "Power never reaches the TV's software, so it can't be changed" :
      button.keep ? button.name + " stays as it is so the remote remains usable" :
      button.name + " · " + rowFor(code).querySelector(".value").textContent + " · OK changes it");
  }

  // OK on a drawn button (or a click on it) opens its row to change what it does.
  function pickFromDrawing(button) {
    if (listening || renaming !== null || button.power || button.keep) { return; }
    var row = rowFor(String(button.codes[0]));
    setFocus(row);
    startEditing(row);
  }

  function light(element) {
    element.classList.remove("lit");
    // Restart the highlight even if the same button is pressed again.
    void element.offsetWidth;
    element.classList.add("lit");
    window.clearTimeout(element.litTimer);
    element.litTimer = window.setTimeout(function () {
      element.classList.remove("lit");
      if (element === $("remote-card")) { showSelection(); }
    }, LIT_MS);
  }

  // Shows the remote beside the list: the drawing or the card, the remote choice, and the selection.
  function showRemote() {
    var isCustomRemote = remote === "custom";
    $("remote-drawing").hidden = isCustomRemote;
    $("remote-card").hidden = !isCustomRemote;
    $("remote-model").querySelector(".value").textContent = REMOTES.filter(function (entry) { return entry.id === remote; })[0].name;
    $("remote-hint").textContent = listening ? HINTS[listening] : HINTS[remote];
    showSelection();
  }

  // Outlines the selected row's drawn button while the list has the focus (not during a test, when
  // only presses light up), or shows it on the card with what can be done to it.
  function showSelection() {
    var code = lastCode === "add" ? null : lastCode;
    var match = code && !listening && selected && !isSide(selected) ? drawnFor(code) : null;
    drawn.forEach(function (entry) { entry.element.classList.toggle("is-selected", entry === match); });
    // Rename and Remove belong to the Custom remote, and need a button to act on.
    $("remote-rename").hidden = remote !== "custom" || !code || !!listening;
    $("remote-remove").hidden = remote !== "custom" || !isCustom(code) || !!listening;
    if (remote === "custom") { showCard(code); }
  }

  function showCard(code) {
    if (renaming !== null) { return; }
    $("remote-card-title").textContent = code ? Logic.nameFor(code, custom) : lastCode === "add" ? "New button" : "No button selected";
    $("remote-card-code").textContent = code ? "Code " + code : lastCode === "add" ? "OK, then press it on the remote" : "";
  }

  // A press seen in the button log while listening.
  function pressed(code) {
    if (!listening) { return; }
    if (listening === "capture") {
      if (Logic.canAdd(code)) { captured(code); }
      return;
    }
    var result = Logic.stopStreak(streak, code, Date.now());
    streak = result.streak;
    if (remote === "custom") {
      showCard(code);
      light($("remote-card"));
    } else if (drawnFor(code)) {
      light(drawnFor(code).element);
    }
    var row = rowFor(code);
    if (result.stop) {
      stopListening("Test stopped");
      if (row) { setFocus(row); }
    } else if (row) {
      setFocus(row);
      setStatus("");
    } else if (!Logic.isKept(code) && (remote === "custom" || !drawnFor(code))) {
      setStatus(Logic.displayName(remote, code, custom) + " (code " + code + ") is not in the list" +
        (remote === "custom" ? " · add it with Add a button" : ""));
    }
  }

  // Reads the codes of button presses logged after `position`, in one pass so no line is missed. A
  // read that is still running when listening stops (pollRun changes) is dropped.
  function poll(run) {
    var start = position === null ? -1 : position;
    WebOS.rootShell("[ -f " + HOOK_LOG + " ] || { echo '#missing'; exit 0; }; awk -v s=" + start +
      " 'NR>s && s>=0 && /state=1 uinput_code=/ { match($0, /uinput_code=[0-9]+/); " +
      "print substr($0, RSTART + 12, RLENGTH - 12) } END { print \"#\" NR }' " + HOOK_LOG).then(function (result) {
      if (run !== pollRun) { return; }
      var found = Logic.readPresses(result.stdoutString, position);
      if (found.missing) {
        setStatus(NO_HOOK, "error");
        return;
      }
      position = found.position;
      found.codes.forEach(pressed);
    }).catch(function (error) {
      if (run === pollRun) { setStatus("Could not read the button log: " + error.message, "error"); }
    }).then(function () {
      if (run === pollRun && listening) { pollTimer = window.setTimeout(function () { poll(run); }, POLL_MS); }
    });
  }

  function listen(kind) {
    stopEditing();
    listening = kind;
    streak = null;
    showMode();
    setStatus(kind === "test" ? "Press any button on the remote" : "Press the button to add");
    if (kind === "capture") {
      captureTimer = window.setTimeout(function () { stopListening("No button pressed"); }, CAPTURE_MS);
    }
    pollRun += 1;
    position = null;
    poll(pollRun);
    queue(function () {
      return Promise.resolve(flush()).then(setAside).catch(function (error) {
        setStatus("Buttons may open things meanwhile: " + error.message, "error");
      });
    });
  }

  // Stops listening and makes the real bindings active again. Returns when that is done.
  function stopListening(message) {
    listening = null;
    pollRun += 1;
    window.clearTimeout(pollTimer);
    window.clearTimeout(captureTimer);
    showMode();
    setStatus(message);
    return queue(function () {
      return Promise.resolve(flush()).then(restore);
    });
  }

  // The button to add was pressed: add it to the Custom remote and ask for its name.
  function captured(code) {
    stopListening("");
    if (isCustom(code)) {
      setFocus(rowFor(code));
      setStatus(Logic.nameFor(code, custom) + " is already on your remote");
      return;
    }
    custom = Logic.withButton(custom, code, "");
    store(CUSTOM_KEY, JSON.stringify(custom));
    lastCode = code;
    render();
    startRename(code);
  }

  function startRename(code) {
    stopEditing();
    renaming = code;
    var field = $("remote-name");
    field.value = Logic.nameFor(code, custom);
    $("remote-card-title").hidden = true;
    field.hidden = false;
    // Focusing the field brings up the TV's keyboard.
    field.focus();
    field.select();
    showMode();
    setStatus("Type a name, then OK");
  }

  function finishRename(keep) {
    if (renaming === null) { return; }
    var code = renaming;
    var field = $("remote-name");
    renaming = null;
    field.hidden = true;
    $("remote-card-title").hidden = false;
    field.blur();
    if (keep) {
      custom = Logic.withButton(custom, code, field.value);
      store(CUSTOM_KEY, JSON.stringify(custom));
      lastCode = code;
      render();
      setStatus("Saved", "ok");
    } else {
      setStatus("");
    }
    showMode();
  }

  // Takes a button off the Custom remote; whatever it was set to do is undone too.
  function removeButton(code) {
    var name = Logic.nameFor(code, custom);
    var row = rowFor(code);
    var next = row && (row.nextElementSibling || row.previousElementSibling);
    custom = Logic.withoutButton(custom, code);
    store(CUSTOM_KEY, JSON.stringify(custom));
    if (binds && binds[code]) {
      delete binds[code];
      scheduleSave();
    }
    lastCode = next ? next.getAttribute("data-code") || "add" : null;
    render();
    setFocus(rowFor(lastCode) || firstRow());
    setStatus("Removed " + name);
  }

  function switchRemote(step) {
    var index = REMOTES.map(function (entry) { return entry.id; }).indexOf(remote);
    remote = REMOTES[(index + step + REMOTES.length) % REMOTES.length].id;
    store(REMOTE_KEY, remote);
    lastCode = listed()[0] || (remote === "custom" ? "add" : null);
    render();
    // render() ends editing; keep changing the remote.
    startEditing($("remote-model"));
  }

  function isSide(element) {
    return !!element && !!element.closest && !!element.closest(".remote-stage");
  }

  // The buttons beside the list, top to bottom.
  function sideItems() {
    return Array.prototype.filter.call(document.querySelectorAll(".remote-stage .focusable"), function (element) {
      return !element.hidden && !element.closest("[hidden]");
    });
  }

  function showMode() {
    var test = $("remote-test");
    test.textContent = listening === "test" ? "Stop test" : "Test remote";
    test.classList.toggle("is-active", listening === "test");
    $("remote-hint").textContent = listening ? HINTS[listening] : HINTS[remote];
    showSelection();
    updateHints();
  }

  function updateHints() {
    var hints = listening === "test" ? ["", "", "<b>Any button 3×</b> Stop test"] :
      listening === "capture" ? ["", "", "<b>Back</b> Cancel"] :
      renaming !== null ? ["", "<b>OK</b> Save", "<b>Back</b> Cancel"] :
      editing ? ["<b>Left/Right</b> Change", "<b>OK</b> Done", "<b>Back</b> Done"] :
      ["<b>Arrows</b> Move", "<b>OK</b> Select", "<b>Back</b> Settings"];
    ["move", "select", "back"].forEach(function (name, index) {
      var hint = $("remote-" + name + "-hint");
      hint.innerHTML = hints[index];
      hint.hidden = !hints[index];
    });
  }

  function startEditing(element) {
    if (element !== $("remote-model") && !fresh) {
      setStatus(readError ? "Could not read the bindings (" + readError + ") · reopen this page to retry" : "Reading the bindings…",
        readError ? "error" : "");
      return;
    }
    setFocus(element);
    editing = element;
    element.classList.add("is-editing");
    updateHints();
    setStatus(element === $("remote-model") ? "Choosing the remote · Left/Right changes" :
      "Editing " + element.querySelector("strong").textContent + " · Left/Right changes");
  }

  function stopEditing() {
    if (!editing) { return; }
    editing.classList.remove("is-editing");
    editing = null;
    updateHints();
    setStatus("");
  }

  function setFocus(element) {
    if (!element) { return; }
    if (editing && element !== editing) { stopEditing(); }
    var fromList = !!selected && !isSide(selected);
    selected = UI.moveFocus(selected, element);
    if (element === $("remote-drawing")) {
      // From the list, enter at the selected row's button; from above or below, where it was left.
      if (!pointed) { point(fromList || !lastPointed ? drawnFor(lastCode) || drawn[1] : lastPointed); }
    } else {
      if (pointed) {
        point(null);
        setStatus("");
      }
      if (!isSide(element)) {
        lastCode = element.getAttribute("data-code") || "add";
        UI.keepInView(element);
      }
    }
    showSelection();
  }

  function change(step) {
    var code = editing.getAttribute("data-code");
    var list = choicesFor(code);
    var index = (Math.max(0, Logic.indexOf(list, binds[code])) + step + list.length) % list.length;
    if (list[index].bind) { binds[code] = list[index].bind; }
    else { delete binds[code]; }
    renderValue(editing);
    setStatus("");
    scheduleSave();
  }

  // Returns "leave" when Back should take the user back to Settings. While the name field is open,
  // keys other than OK and Back are left to it.
  function handleKey(event) {
    var key = event.keyCode;
    if (renaming !== null) {
      if (key === KEY.ENTER || key === KEY.BACK) {
        event.preventDefault();
        finishRename(key === KEY.ENTER);
      }
      return null;
    }
    event.preventDefault();
    if (listening) {
      if (key !== KEY.BACK || event.repeat) { return null; }
      if (listening === "capture") { stopListening("Cancelled"); }
      // Presses come from the button log; without the hook, count LG's Back from here instead.
      else if (!hooked) { pressed(BACK_CODE); }
      return null;
    }
    if (key === KEY.BACK) {
      if (!editing) { return "leave"; }
      stopEditing();
      return null;
    }
    if (!selected || (key === KEY.ENTER && event.repeat)) { return null; }
    if (editing && (key === KEY.LEFT || key === KEY.RIGHT)) {
      if (editing === $("remote-model")) { switchRemote(key === KEY.RIGHT ? 1 : -1); }
      else { change(key === KEY.RIGHT ? 1 : -1); }
    } else if (key === KEY.ENTER) {
      if (selected === $("remote-drawing")) { pickFromDrawing(pointed.button); }
      else { selected.click(); }
    } else if (selected === $("remote-drawing")) {
      moveInDrawing(key);
    } else if (isSide(selected)) {
      var items = sideItems();
      var index = items.indexOf(selected);
      if (key === KEY.UP) { setFocus(items[index - 1]); }
      else if (key === KEY.DOWN) { setFocus(items[index + 1]); }
      else if (key === KEY.LEFT) { setFocus(rowFor(lastCode) || firstRow()); }
    } else if (key === KEY.RIGHT) {
      setFocus(remote === "mr24" ? $("remote-drawing") : sideItems()[0]);
    } else if (key === KEY.UP) {
      setFocus(selected.previousElementSibling || sideItems()[0]);
    } else if (key === KEY.DOWN) {
      setFocus(selected.nextElementSibling);
    }
    return null;
  }

  // The arrows move between drawn buttons; past the edge they leave the drawing for the button above
  // or below it, or the list.
  function moveInDrawing(key) {
    var direction = key === KEY.UP ? "up" : key === KEY.DOWN ? "down" : key === KEY.LEFT ? "left" : "right";
    var next = Logic.nearestButton(pointed.button, direction);
    if (next) {
      point(entryFor(next));
      return;
    }
    var items = sideItems();
    var index = items.indexOf(selected);
    if (direction === "up") { setFocus(items[index - 1]); }
    else if (direction === "down") { setFocus(items[index + 1]); }
    else if (direction === "left") { setFocus(rowFor(lastCode) || firstRow()); }
  }

  function handlePointer(event) {
    if (renaming !== null) { return; }
    var element = event.target.closest && event.target.closest("#remote-view .focusable");
    // While listening the list follows the buttons pressed, not the pointer.
    if (listening && element !== $("remote-test")) { return; }
    if (element && element !== selected) { setFocus(element); }
    var drawnButton = event.target.closest && event.target.closest("#remote-drawing .remote-button");
    if (drawnButton) {
      var entry = drawn.filter(function (each) { return each.element === drawnButton; })[0];
      if (entry !== pointed) { point(entry); }
    }
  }

  // host: Home's apps() (offered as "Open …" actions) and setLinkValue() for the Settings summary.
  function attach(pageHost) {
    host = pageHost;
  }

  function open() {
    apps = host.apps().slice().sort(function (left, right) { return String(left.title).localeCompare(String(right.title)); });
    build();
    remote = readStored(REMOTE_KEY) === "custom" ? "custom" : "mr24";
    custom = Logic.parseCustom(readStored(CUSTOM_KEY));
    listening = null;
    renaming = null;
    fresh = false;
    point(null);
    lastPointed = null;
    showMode();
    setStatus("");
    UI.moveFocus(selected, null);
    selected = null;
    // Show the bindings read at Home's start straight away (they can't be changed until read again).
    render();
    load().then(function () {
      render();
      if (readError) { setStatus("Could not read the bindings (" + readError + ") · reopen this page to retry", "error"); }
      else if (!hooked) { setStatus(NO_HOOK, "error"); }
      else if (!editing) { setStatus(""); }
    });
  }

  // Ends a test and saves pending changes. Returns when the bindings are in place.
  function close() {
    finishRename(true);
    return listening ? stopListening("") : queue(flush);
  }

  return { attach: attach, load: load, open: open, close: close, handleKey: handleKey, handlePointer: handlePointer };
}());
