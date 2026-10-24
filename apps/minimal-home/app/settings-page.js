// A Settings page inside Minimal Home, such as Picture: a scrolling list of the page's rows from
// SettingsSpecs, and a card beside it about the focused row. SettingsPage.create(id) makes the module
// that app.js runs as the view `id` (<main id="ID-view">, which it adds to the page). A page reads
// its rows in one root call each time it opens, never at Home's start, and writes a change at once;
// while one is written, the last value asked for waits, so holding Left or Right keeps changing it.
// A picture page also chooses the input it applies to ("Applies to"), since the TV keeps picture
// settings per input. It starts on the one that played last, which LG Settings changes too.
var SettingsPage = (function () {
  "use strict";

  var KEY = WebOS.KEY;
  var SETTINGS = "luna://com.webos.settingsservice/";
  var LAUNCH = "luna://com.webos.service.applicationManager/launch";
  var APPLIES_TO = "appliesTo";
  var APPLIES_TO_HELP = "The TV keeps picture settings for each input: the apps, live TV and each HDMI input. " +
    "The page starts on the one that played last.";
  // A source row written by another service is read again this long after a write, as Wi-Fi takes a
  // moment to turn on or off.
  var SOURCE_REREAD_MS = 1200;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function create(id) {
    var page = SettingsSpecs.PAGES[id];
    var rows = SettingsLogic.pageRows(page);
    var modeLabels = (rows.filter(function (row) { return row.key === "pictureMode"; })[0] || {}).labels;
    var view = null;
    var list = null;
    var card = null;
    var lgButton = null;
    var selected = null;
    var editing = null;
    // The row Left goes back to from the card's button.
    var cardReturn = null;
    var state = SettingsLogic.emptyPageState();
    // The context the TV was in when the page opened, and the inputs "Applies to" offers.
    var current = {};
    var inputs = null;
    // Each read gets a number, so an older one that answers late is ignored.
    var loadRun = 0;
    var loaded = false;
    // Set while another input's settings are read: they can't be changed until they are known.
    var switching = false;
    // Keys changed while the page reads, which keep their new value whatever the read says.
    var touched = {};
    // Values asked for and not written yet, by key, and the key being written.
    var pending = {};
    var writing = null;
    // A value that asks first (row.confirm), shown until OK writes it or anything else drops it.
    var proposed = null;

    function setStatus(message, type) {
      UI.setStatus(id + "-status", message, type);
    }

    function rowFor(key) {
      return rows.filter(function (row) { return row.key === key; })[0];
    }

    function elementFor(key) {
      return list.querySelector('[data-key="' + key + '"]');
    }

    // The state as shown: with the values waiting to be written, and one waiting for OK.
    function shown() {
      var values = Object.assign({}, state.values, pending);
      if (proposed) { values[proposed.key] = proposed.value; }
      return { values: values, descs: state.descs, notes: state.notes, context: state.context };
    }

    function inputName(input) {
      return (inputs && inputs.labels[input]) || input;
    }

    function makeRow(key, label, kind) {
      var button = element("button", "setting focusable" + (kind === "range" ? "" : " choice-setting") + (kind === "link" ? " link-setting" : ""));
      button.type = "button";
      button.setAttribute("data-key", key);
      var copy = element("span", "copy");
      copy.appendChild(element("strong", "", label));
      copy.appendChild(element("small", ""));
      button.appendChild(copy);
      if (kind === "range") {
        var bar = element("span", "range");
        bar.appendChild(element("i"));
        button.appendChild(bar);
      }
      button.appendChild(element("span", "value", "—"));
      button.addEventListener("click", function () {
        if (editing === button) { confirmOrStop(); } else { activate(button); }
      });
      return button;
    }

    // The rows are made on the first open, so Home's start does no work for a page.
    function build() {
      if (list) { return; }
      var body = view.querySelector(".page-body");
      list = element("div", "page-list");
      if (page.context) { list.appendChild(makeRow(APPLIES_TO, "Applies to", "choice")); }
      page.sections.forEach(function (section, index) {
        var heading = element("h3", "page-section", section.title);
        heading.setAttribute("data-section", String(index));
        list.appendChild(heading);
        section.rows.forEach(function (row) {
          var node = makeRow(row.key, row.label, row.kind);
          node.setAttribute("data-section", String(index));
          node.hidden = row.kind !== "link";
          list.appendChild(node);
        });
      });
      card = element("aside", "page-card");
      ["card-title", "card-help", "card-scope", "card-reason"].forEach(function (name) {
        card.appendChild(element(name === "card-title" ? "strong" : "p", name));
      });
      lgButton = element("button", "action focusable", "Open in LG Settings");
      lgButton.type = "button";
      lgButton.addEventListener("click", openLg);
      card.appendChild(lgButton);
      body.appendChild(list);
      body.appendChild(card);
      // The first row, although hidden until the values are read; renderAll then moves the focus to
      // the first row shown.
      setFocus(list.querySelector(".setting"));
    }

    function renderDirections(node, row, info) {
      var value = node.querySelector(".value");
      value.classList.remove("can-decrease", "can-increase");
      if (editing !== node || !info) { return; }
      if (row) {
        if (SettingsLogic.nextRowValue(row, info, -1) !== info.value) { value.classList.add("can-decrease"); }
        if (SettingsLogic.nextRowValue(row, info, 1) !== info.value) { value.classList.add("can-increase"); }
      } else if (inputs) {
        var at = inputs.values.indexOf(state.context.input);
        if (at > 0) { value.classList.add("can-decrease"); }
        if (at < inputs.values.length - 1) { value.classList.add("can-increase"); }
      }
    }

    function renderRow(row) {
      var node = elementFor(row.key);
      var info = SettingsLogic.rowView(row, shown());
      node.hidden = info.hidden;
      if (info.hidden) { return; }
      node.classList.toggle("is-greyed", info.greyed);
      node.classList.toggle("is-busy", writing === row.key);
      node.classList.toggle("is-proposed", !!proposed && proposed.key === row.key);
      node.querySelector(".value").textContent = info.text;
      node.querySelector("small").textContent = info.note || (page.context && !info.perInput && row.kind !== "link" ? "Every input" : "");
      if (row.kind === "range") { node.querySelector(".range").style.setProperty("--fill", info.fill + "%"); }
      renderDirections(node, row, info);
    }

    function renderAppliesTo() {
      var node = elementFor(APPLIES_TO);
      if (!node) { return; }
      node.hidden = state.context.input === undefined;
      node.querySelector(".value").textContent = inputName(state.context.input);
      renderDirections(node, null, {});
    }

    // Section titles show while one of their rows does, and the first and last row shown of each
    // section are rounded.
    function renderSections() {
      page.sections.forEach(function (section, index) {
        var members = list.querySelectorAll('.setting[data-section="' + index + '"]');
        var visible = Array.prototype.filter.call(members, function (node) { return !node.hidden; });
        list.querySelector('.page-section[data-section="' + index + '"]').hidden = !visible.length;
        Array.prototype.forEach.call(members, function (node) {
          node.classList.toggle("is-first", node === visible[0]);
          node.classList.toggle("is-last", node === visible[visible.length - 1]);
        });
      });
    }

    function renderCard() {
      var node = selected === lgButton ? cardReturn : selected;
      var key = node && node.getAttribute("data-key");
      var row = rowFor(key);
      var text = { title: "", help: "", scope: "", reason: "" };
      if (key === APPLIES_TO) {
        text.title = "Applies to";
        text.help = APPLIES_TO_HELP;
      } else if (row) {
        var info = SettingsLogic.rowView(row, shown());
        var scope = SettingsLogic.scopeText(row, info, state, page, inputs, modeLabels);
        text.title = row.label;
        text.help = row.help || "";
        text.scope = scope ? scope + "." : "";
        text.reason = info.greyed ? info.reason + "." : "";
      }
      Object.keys(text).forEach(function (name) { card.querySelector(".card-" + name).textContent = text[name]; });
    }

    function renderAll() {
      renderAppliesTo();
      rows.forEach(renderRow);
      renderSections();
      list.classList.toggle("is-switching", switching);
      if (selected && selected.hidden) { setFocus(visibleRows()[0]); }
      renderCard();
    }

    function visibleRows() {
      return Array.prototype.filter.call(list.querySelectorAll(".setting"), function (node) { return !node.hidden; });
    }

    // scroll: false when the pointer moved the focus, so the list doesn't move under it.
    function setFocus(node, scroll) {
      if (!node) { return; }
      selected = UI.moveFocus(selected, node);
      if (node !== lgButton && scroll !== false) {
        var margin = Math.ceil(window.innerHeight * 0.006);
        UI.keepInView(node, margin);
        var heading = node.previousElementSibling;
        if (heading && heading.classList.contains("page-section") && !heading.hidden) { UI.keepInView(heading, margin); }
      }
      renderCard();
    }

    function move(direction) {
      var visible = visibleRows();
      var from = visible.indexOf(selected === lgButton ? cardReturn : selected);
      setFocus(visible[Math.max(0, Math.min(visible.length - 1, from + direction))]);
    }

    function updateHints(isEditing) {
      view.querySelector(".move-hint").innerHTML = isEditing ? "<b>Left/Right</b> Change" : "<b>Arrows</b> Move";
      view.querySelector(".select-hint").innerHTML = isEditing ? "<b>OK</b> Done" : "<b>OK</b> Select";
      view.querySelector(".back-hint").innerHTML = isEditing ? "<b>Back</b> Done" : "<b>Back</b> Settings";
    }

    function editingStatus(prefix) {
      if (!editing) { return; }
      setStatus((prefix ? prefix + " · " : "") + "Editing " + editing.querySelector("strong").textContent + " — Left/Right changes", prefix ? "ok" : "");
    }

    function launch(target, what) {
      WebOS.rootLuna(LAUNCH, target).catch(function (error) { setStatus("Could not open " + what + ": " + error.message, "error"); });
    }

    // OK on a row: a link opens, an info row says where it can be changed, and the others start
    // changing (unless greyed out, or another input's settings are still being read).
    function activate(node) {
      if (!node || node === lgButton) { return; }
      setFocus(node);
      var key = node.getAttribute("data-key");
      var row = rowFor(key);
      if (key === APPLIES_TO) {
        if (!inputs) { return; }
      } else if (row.kind === "link") {
        launch(row.launch, row.label);
        return;
      } else if (row.kind === "info") {
        setStatus(row.label + " is shown here; change it in LG Settings");
        return;
      } else {
        if (switching) {
          setStatus("Reading " + inputName(state.context.input) + "…");
          return;
        }
        var info = SettingsLogic.rowView(row, shown());
        if (info.greyed) {
          setStatus(info.reason, "error");
          return;
        }
      }
      if (editing && editing !== node) { editing.classList.remove("is-editing"); }
      editing = node;
      node.classList.add("is-editing");
      updateHints(true);
      editingStatus();
      renderAll();
    }

    function stopEditing(showReady) {
      if (!editing) { return; }
      proposed = null;
      editing.classList.remove("is-editing");
      editing = null;
      updateHints(false);
      renderAll();
      if (showReady !== false) { setStatus("Ready", "ok"); }
    }

    // OK while changing a value: writes a value that asked first, else stops changing.
    function confirmOrStop() {
      if (proposed) {
        pending[proposed.key] = proposed.value;
        touched[proposed.key] = true;
        proposed = null;
        stopEditing(false);
        flush();
        return;
      }
      stopEditing();
    }

    function change(direction) {
      var key = editing.getAttribute("data-key");
      if (key === APPLIES_TO) {
        var at = inputs.values.indexOf(state.context.input);
        var input = inputs.values[Math.max(0, Math.min(inputs.values.length - 1, at + direction))];
        if (input !== state.context.input) { switchInput(input); }
        return;
      }
      if (switching) { return; }
      var row = rowFor(key);
      var info = SettingsLogic.rowView(row, shown());
      if (info.greyed) { return; }
      var value = SettingsLogic.nextRowValue(row, info, direction);
      if (value === undefined || value === info.value) { return; }
      if (SettingsLogic.needsConfirm(row, value)) {
        proposed = { key: key, value: value };
        renderAll();
        setStatus(row.confirm.prompt, "error");
        return;
      }
      proposed = null;
      if (value === state.values[key] && !writing) { delete pending[key]; } else { pending[key] = value; }
      touched[key] = true;
      renderAll();
      editingStatus();
      flush();
    }

    // Writes the values waiting, one at a time, each with its newest value.
    function flush() {
      if (writing) { return; }
      var key = Object.keys(pending)[0];
      if (key === undefined) { return; }
      var row = rowFor(key);
      var value = pending[key];
      var call;
      var operations = null;
      if (row.source) {
        call = SettingsLogic.sourceWrite(row, value);
      } else {
        operations = SettingsLogic.writeOperations(row, value, state, page);
        call = operations && [SETTINGS + "batch", { operations: operations }];
      }
      if (!call) {
        delete pending[key];
        setStatus("Could not change " + row.label + ": its input isn't known yet", "error");
        renderAll();
        return;
      }
      writing = key;
      renderAll();
      setStatus("Changing " + row.label + "…");
      WebOS.rootLuna(call[0], call[1]).then(function (reply) {
        if (operations) {
          state = SettingsLogic.applyWrite(state, row, value, operations, reply.results);
        } else {
          state.values[key] = value;
        }
        if (pending[key] === value) { delete pending[key]; }
        if (editing) { editingStatus("Saved"); } else { setStatus("Saved", "ok"); }
        // A new picture mode, energy saving step or sound mode changes what the other rows show, and
        // a source (the sleep timer's time left, Wi-Fi's connection) says what became of the change.
        if (row.reread) { refresh(); }
        if (row.source) { window.setTimeout(refresh, SOURCE_REREAD_MS); }
      }).catch(function (error) {
        delete pending[key];
        setStatus("Could not change " + row.label + ": " + error.message, "error");
      }).then(function () {
        writing = null;
        renderAll();
        flush();
      });
    }

    // Reads the page's settingsservice values in its context; null when another read took over.
    function readOnce(run, needing) {
      var operations = SettingsLogic.contextReads(rows, page, state, needing);
      if (!operations.length) { return Promise.resolve({ read: [], failed: null }); }
      return WebOS.rootLuna(SETTINGS + "batch", { operations: operations }).then(function (reply) {
        if (run !== loadRun) { return null; }
        var applied = SettingsLogic.applyReads(state, rows, operations, reply.results || [], touched);
        state = applied.state;
        return applied;
      });
    }

    // Reads the page in one root call: its settingsservice values (in the context the TV is in, with
    // the descriptions when `withDescs`) and its rows from other services. Returns the failure, if any.
    function readAll(run, withDescs) {
      var operations = SettingsLogic.currentReads(rows, page, withDescs);
      var sources = SettingsLogic.sourceCalls(rows);
      var calls = operations.length ? [[SETTINGS + "batch", { operations: operations }]] : [];
      calls = calls.concat(sources);
      if (page.context && withDescs) { calls.push(["luna://com.webos.service.eim/getAllInputStatus", {}]); }
      return WebOS.rootLunaBatch(calls).then(function (results) {
        if (run !== loadRun) { return null; }
        var failed = null;
        if (operations.length) {
          if (results[0] instanceof Error) { throw results[0]; }
          var applied = SettingsLogic.applyReads(state, rows, operations, results[0].results || [], touched);
          state = applied.state;
          failed = applied.failed;
          if (withDescs) {
            current = applied.dimension;
            state.context = Object.assign({}, current);
          }
        }
        var fromSources = SettingsLogic.applySources(state, rows, results.slice(operations.length ? 1 : 0), touched);
        state = fromSources.state;
        failed = failed || fromSources.failed;
        if (page.context && withDescs) {
          var inputStatus = results[results.length - 1];
          inputs = SettingsLogic.inputChoices(inputStatus instanceof Error ? null : inputStatus, current.input, SettingsSpecs.INPUTS);
        }
        return { failed: failed };
      });
    }

    function showRead(result) {
      if (!result) { return; }
      renderAll();
      if (result.failed) { setStatus("Could not read some settings: " + result.failed.message, "error"); }
      else if (editing) { editingStatus(); }
      else { setStatus("Ready", "ok"); }
    }

    // Reads the values again, as after a new picture mode: on a page with "Applies to" in its
    // context, elsewhere as the TV is now.
    function refresh() {
      var run = loadRun += 1;
      touched = {};
      if (writing) { touched[writing] = true; }
      var read = page.context ? readOnce(run, null) : readAll(run, false);
      read.then(function (result) {
        if (!result) { return; }
        renderAll();
        if (result.failed) { setStatus("Could not read some settings: " + result.failed.message, "error"); }
      }).catch(function (error) { setStatus("Could not read settings: " + error.message, "error"); });
    }

    // Shows another input's settings: reads its picture mode (and the settings that apply to every
    // input), then that mode's settings. If either read fails, the page stays on the input it was on.
    function switchInput(input) {
      if (writing || Object.keys(pending).length) {
        setStatus("Still saving, try again in a moment");
        return;
      }
      var run = loadRun += 1;
      var before = state;
      var known = Object.keys(SettingsLogic.contextFor(input, current));
      switching = true;
      touched = {};
      state = Object.assign({}, state, { context: SettingsLogic.contextFor(input, current) });
      renderAll();
      setStatus("Reading " + inputName(input) + "…");
      readOnce(run, null).then(function (first) {
        if (!first) { return null; }
        if (first.failed) { throw first.failed; }
        state = SettingsLogic.fillContext(state, first.read);
        var filled = Object.keys(state.context).filter(function (field) { return known.indexOf(field) < 0; });
        return filled.length ? readOnce(run, filled[0]) : first;
      }).then(function (second) {
        if (!second) { return; }
        if (second.failed) { throw second.failed; }
        switching = false;
        renderAll();
        if (editing) { editingStatus(); } else { setStatus("Ready", "ok"); }
      }).catch(function (error) {
        if (run !== loadRun) { return; }
        switching = false;
        state = before;
        renderAll();
        setStatus("Could not read " + inputName(input) + ": " + error.message, "error");
      });
    }

    // Reads the page as the TV is now, and the inputs "Applies to" offers.
    function load() {
      var run = loadRun += 1;
      switching = false;
      touched = {};
      if (writing) { touched[writing] = true; }
      if (!loaded) { setStatus("Reading current settings…"); }
      return readAll(run, true).then(function (result) {
        if (!result) { return; }
        loaded = true;
        showRead(result);
      }).catch(function (error) {
        setStatus("Could not read settings: " + error.message, "error");
      });
    }

    function openLg() {
      launch(typeof page.lg === "string" ? { id: "com.palm.app.settings", params: { target: page.lg } } : page.lg, "LG Settings");
    }

    // Returns "leave" when Back should take the user back to Settings.
    function handleKey(event) {
      var code = event.keyCode;
      if (code === KEY.BACK) {
        event.preventDefault();
        if (editing) { stopEditing(); return null; }
        return "leave";
      }
      if (editing && (code === KEY.LEFT || code === KEY.RIGHT)) {
        event.preventDefault();
        change(code === KEY.RIGHT ? 1 : -1);
      } else if (code === KEY.UP || code === KEY.DOWN) {
        event.preventDefault();
        if (editing) { stopEditing(false); }
        move(code === KEY.DOWN ? 1 : -1);
        cardReturn = null;
      } else if (code === KEY.RIGHT && selected !== lgButton) {
        event.preventDefault();
        cardReturn = selected;
        setFocus(lgButton);
      } else if (code === KEY.LEFT && selected === lgButton) {
        event.preventDefault();
        setFocus(cardReturn || visibleRows()[0]);
        cardReturn = null;
      } else if (code === KEY.ENTER) {
        event.preventDefault();
        if (event.repeat) { return null; }
        if (editing) { confirmOrStop(); }
        else if (selected === lgButton) { openLg(); }
        else { activate(selected); }
      }
      return null;
    }

    // The pointer moves the same focus as the arrows; the wheel scrolls the list.
    function handlePointer(event) {
      var node = event.target.closest && event.target.closest("#" + id + "-view .focusable");
      if (!node || node === selected) { return; }
      if (editing && editing !== node) { stopEditing(false); }
      cardReturn = node === lgButton ? selected : null;
      setFocus(node, false);
    }

    // Adds the view's <main> at Home's start, hidden, with a header and footer like the views in
    // index.html (the clock in it is kept by Home); its list and card are made on the first open.
    function attach() {
      view = element("main", "panel-view settings-page");
      view.id = id + "-view";
      view.hidden = true;
      view.innerHTML = '<header><div class="time"><span class="clock"></span><span class="date"></span></div><p class="view-name"></p></header>' +
        '<div class="page-body"></div><footer><span class="move-hint"></span><span class="select-hint"></span>' +
        '<span class="back-hint"></span><span class="status" id="' + id + '-status"></span></footer>';
      view.querySelector(".view-name").textContent = page.title;
      document.body.insertBefore(view, document.body.querySelector("script"));
      updateHints(false);
    }

    function open() {
      build();
      updateHints(false);
      load();
    }

    function close() {
      stopEditing(false);
    }

    return { attach: attach, open: open, close: close, handleKey: handleKey, handlePointer: handlePointer };
  }

  return { create: create };
}());
