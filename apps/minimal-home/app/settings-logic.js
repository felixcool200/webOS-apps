// The rules of the Settings view and its pages for reading, showing, stepping through and writing
// values, without the page. settings.js and settings-page.js use them; test/settings-logic.test.js
// checks them in Node.
var SettingsLogic = (function () {
  "use strict";

  // The values a choice setting offers: the ones the TV lists as active and visible, always including
  // the current one, in `order` when given (values missing from it go last).
  function allowedValues(response, current, order) {
    var list = response && response.values && response.values.arrayExt ? response.values.arrayExt : [];
    var values = list.filter(function (entry) { return entry.active !== false && entry.visible !== false; })
      .map(function (entry) { return entry.value; });
    if (values.indexOf(current) === -1) { values.unshift(current); }
    if (order) {
      var rank = function (value) { var index = order.indexOf(value); return index < 0 ? order.length : index; };
      values.sort(function (left, right) { return rank(left) - rank(right); });
    }
    return values;
  }

  // The value one step (direction -1 or 1) from the current one: ranges move by their step within
  // min and max, choices move along `values` and stop at either end. Undefined when nothing is known.
  function nextValue(spec, item, direction) {
    if (!item) { return undefined; }
    if (spec.kind === "range") {
      return Math.max(spec.min, Math.min(spec.max, Number(item.value) + spec.step * direction));
    }
    var values = item.values || [];
    if (!values.length) { return undefined; }
    var index = Math.max(0, values.indexOf(item.value));
    return values[Math.max(0, Math.min(values.length - 1, index + direction))];
  }

  // The settings a load reads per category, in the order of READ_CATEGORIES.
  var READ_CATEGORIES = ["picture", "sound", "option"];

  function keysIn(specs, category) {
    return Object.keys(specs).filter(function (key) { return specs[key].category === category; });
  }

  // Puts what one load read into the settings' state, and returns { state, network, failed }.
  // `replies` are the load's replies in order: one per READ_CATEGORIES, then the values on offer for
  // each of `choiceKeys`, then connectionmanager's and wifi's status. An Error stands for a read that
  // failed: it leaves its settings, and the choices known before, as they were, and `network` is null
  // unless both network reads worked. Settings changed while the load ran (`touched`) keep their new
  // value. Ranges are kept as numbers, although the TV reports them as text.
  function applyReadings(specs, state, replies, touched, choiceKeys) {
    var next = {};
    Object.keys(state).forEach(function (key) { next[key] = Object.assign({}, state[key]); });
    function reply(index) { return replies[index] instanceof Error ? null : replies[index]; }
    READ_CATEGORIES.forEach(function (category, index) {
      var read = (reply(index) && reply(index).settings) || {};
      Object.keys(read).forEach(function (key) {
        if (touched[key]) { return; }
        var value = specs[key] && specs[key].kind === "range" ? Number(read[key]) : read[key];
        next[key] = Object.assign({}, next[key], { value: value });
      });
    });
    var valuesAt = READ_CATEGORIES.length;
    choiceKeys.forEach(function (key, index) {
      if (!next[key]) { return; }
      var known = next[key].values;
      next[key].values = reply(valuesAt + index) || !known ? allowedValues(reply(valuesAt + index), next[key].value, specs[key].order) :
        (known.indexOf(next[key].value) >= 0 ? known : [next[key].value].concat(known));
    });
    var networkAt = valuesAt + choiceKeys.length;
    var connection = reply(networkAt);
    var wifi = reply(networkAt + 1);
    var failed = replies.filter(function (result) { return result instanceof Error; })[0] || null;
    return { state: next, network: connection && wifi ? { connection: connection, wifi: wifi } : null, failed: failed };
  }

  // Settings pages (settings-page.js). A page's state: `values` by key as last read or written,
  // `descs` by key (the TV's description: dims, visible, active, choices or range), and `context`:
  // the dimension fields the page reads and writes for, such as { input, dynamicRange, pictureMode }.

  // Keys a page reads besides its rows, by the page's context: LG's flags that mark a picture mode
  // "(User Settings)" once one of its settings is changed.
  var EXTRA_KEYS = { picture: [{ key: "pictureSettingModified", category: "picture" }] };

  function emptyPageState() {
    return { values: {}, descs: {}, context: {} };
  }

  // The rows of a page in order, each with the index of its section.
  function pageRows(page) {
    var rows = [];
    page.sections.forEach(function (section, index) {
      section.rows.forEach(function (row) { rows.push(Object.assign({ section: index }, row)); });
    });
    return rows;
  }

  function readKeys(rows, page) {
    return rows.concat((page && EXTRA_KEYS[page.context]) || []);
  }

  function categoriesOf(keys) {
    var categories = [];
    keys.forEach(function (item) { if (categories.indexOf(item.category) < 0) { categories.push(item.category); } });
    return categories;
  }

  // The settingsservice operations that read a page in the context the TV is in now: per category,
  // the values and the descriptions. The values' replies name that context in `dimension`.
  function currentReads(rows, page) {
    var keys = readKeys(rows, page);
    var operations = [];
    categoriesOf(keys).forEach(function (category) {
      var names = keys.filter(function (item) { return item.category === category; }).map(function (item) { return item.key; });
      operations.push({ method: "getSystemSettings", params: { category: category, keys: names } });
      operations.push({ method: "getSystemSettingDesc", params: { category: category, keys: names } });
    });
    return operations;
  }

  // The dimension that targets a key with these dimension fields in the context, null for a key
  // without any, and undefined when the context lacks one of them.
  function dimensionFor(dims, context) {
    if (!dims || !dims.length) { return null; }
    var dimension = {};
    for (var i = 0; i < dims.length; i += 1) {
      if (context[dims[i]] === undefined) { return undefined; }
      dimension[dims[i]] = context[dims[i]];
    }
    return dimension;
  }

  // The operations that read a page's values in its context (descriptions are known by then): one per
  // category and dimension list, since the TV refuses a dimension that doesn't fit a key. Keys whose
  // dimension the context can't fill yet are left out; with `needing`, only keys whose dimension
  // includes that field are read.
  function contextReads(rows, page, state, needing) {
    var groups = {};
    var operations = [];
    readKeys(rows, page).forEach(function (item) {
      var desc = state.descs[item.key];
      if (!desc) { return; }
      if (needing && desc.dims.indexOf(needing) < 0) { return; }
      var dimension = dimensionFor(desc.dims, state.context);
      if (dimension === undefined) { return; }
      var group = item.category + " " + desc.dims.join(",");
      if (!groups[group]) {
        groups[group] = { method: "getSystemSettings", params: { category: item.category, keys: [] } };
        if (dimension) { groups[group].params.dimension = dimension; }
        operations.push(groups[group]);
      }
      groups[group].params.keys.push(item.key);
    });
    return operations;
  }

  function parseDesc(result) {
    var ui = result.ui || {};
    var values = result.values || {};
    return {
      dims: result.dimension || [],
      visible: ui.visible !== false,
      active: ui.active !== false,
      choices: values.arrayExt || null,
      range: values.range || null
    };
  }

  // Puts the replies to `operations` into a page's state, and returns { state, read, dimension,
  // failed }: `read` lists the keys whose values came back, `dimension` merges the dimensions the
  // value replies named (the context of a read without one), and `failed` is the first failure. A
  // reply that says returnValue false still carries the values and descriptions the TV has (it
  // lacks a key); a key it lacks keeps what was known. Keys changed meanwhile (`touched`) keep their
  // new value. Ranges are kept as numbers, although the TV reports most of them as text.
  function applyReads(state, rows, operations, replies, touched) {
    var next = { values: Object.assign({}, state.values), descs: Object.assign({}, state.descs), context: Object.assign({}, state.context) };
    var read = [];
    var dimension = {};
    var failed = null;
    var kinds = {};
    rows.forEach(function (row) { kinds[row.key] = row.kind; });
    operations.forEach(function (operation, index) {
      var reply = replies[index];
      if (!reply || reply instanceof Error) {
        failed = failed || (reply instanceof Error ? reply : new Error("No reply"));
        return;
      }
      if (operation.method === "getSystemSettingDesc") {
        (reply.results || []).forEach(function (result) { next.descs[result.key] = parseDesc(result); });
      } else {
        var settings = reply.settings || {};
        Object.keys(settings).forEach(function (key) {
          read.push(key);
          if (touched && touched[key]) { return; }
          next.values[key] = kinds[key] === "range" ? Number(settings[key]) : settings[key];
        });
        Object.assign(dimension, reply.dimension || {});
      }
      if (reply.returnValue === false && !failed && !reply.settings && !reply.results) {
        failed = new Error(reply.errorText || "Request failed");
      }
    });
    return { state: next, read: read, dimension: dimension, failed: failed };
  }

  // The context for reading and writing an input's settings, from the one the TV is in (`current`):
  // the signal's dynamic range is the one on screen for the current input, else SDR. The picture mode
  // is read for the input next (fillContext).
  function contextFor(input, current) {
    var context = { input: input };
    if (current.dynamicRange !== undefined) { context.dynamicRange = input === current.input ? current.dynamicRange : "sdr"; }
    return context;
  }

  // Fills the context fields that a key of the same name was just read for (`read`): the picture mode
  // read for an input is the mode whose settings the page then reads and writes.
  function fillContext(state, read) {
    var context = Object.assign({}, state.context);
    var fields = [];
    Object.keys(state.descs).forEach(function (key) { fields = fields.concat(state.descs[key].dims); });
    read.forEach(function (key) {
      if (context[key] === undefined && fields.indexOf(key) >= 0) { context[key] = state.values[key]; }
    });
    return { values: state.values, descs: state.descs, context: context };
  }

  function labelFor(row, value) {
    return (row.labels && row.labels[value]) || String(value);
  }

  // How a row shows: hidden when the TV doesn't offer it; greyed, with the reason, when the TV says
  // it isn't available now or its greyedWhen rule applies; its value and text; the choices Left/Right
  // step through, or a range's min, max and step (5 on ranges of 100 or more, else 1).
  function rowView(row, state) {
    var desc = state.descs[row.key];
    var value = state.values[row.key];
    var view = { hidden: !desc || !desc.visible || value === undefined, greyed: false, reason: "", value: value };
    if (view.hidden) { return view; }
    var rule = row.greyedWhen;
    if (rule && rule.values.indexOf(state.values[rule.key]) >= 0) {
      view.greyed = true;
      view.reason = rule.reason;
    } else if (!desc.active) {
      view.greyed = true;
      view.reason = "Not available with this picture mode or signal";
    }
    view.perInput = desc.dims.indexOf("input") >= 0;
    if (row.kind === "range") {
      var range = desc.range || { min: 0, max: 100 };
      view.min = Number(range.min);
      view.max = Number(range.max);
      view.step = row.step || (view.max - view.min >= 100 ? 5 : 1);
      view.fill = view.max > view.min ? Math.max(0, Math.min(100, (value - view.min) / (view.max - view.min) * 100)) : 0;
      view.text = String(value);
    } else {
      view.values = allowedValues({ values: { arrayExt: desc.choices || [] } }, value, row.order);
      view.text = labelFor(row, value);
    }
    return view;
  }

  // The value one step from a row's current one, as rowView offers it.
  function nextRowValue(row, view, direction) {
    return nextValue(row.kind === "range" ? { kind: "range", min: view.min, max: view.max, step: view.step } : { kind: "choice" },
      { value: view.value, values: view.values }, direction);
  }

  // The settingsservice operations that write a row's new value in the page's context: with the
  // dimension its description lists, filled from the context. The first change of a picture mode's
  // settings also sets LG's flag that marks the mode "(User Settings)", as LG Settings does; the TV
  // keeps the flags per input, so they take an operation of their own. Null when the context can't
  // target the row yet.
  function writeOperations(row, value, state) {
    var desc = state.descs[row.key];
    var dimension = desc ? dimensionFor(desc.dims, state.context) : undefined;
    if (dimension === undefined) { return null; }
    var settings = {};
    settings[row.key] = value;
    var write = { category: row.category, settings: settings };
    if (dimension) { write.dimension = dimension; }
    var operations = [{ method: "setSystemSettings", params: write }];
    var flags = state.values.pictureSettingModified;
    var mode = state.context.pictureMode;
    if (row.category === "picture" && desc.dims.indexOf("pictureMode") >= 0 && flags && typeof flags === "object" &&
        flags[mode] === false && state.context.input !== undefined) {
      var marked = Object.assign({}, flags);
      marked[mode] = true;
      operations.push({ method: "setSystemSettings", params: { category: "picture", settings: { pictureSettingModified: marked }, dimension: { input: state.context.input } } });
    }
    return operations;
  }

  // The state after the TV answered a write's operations (results in order): the row's new value,
  // the mode's flag if that worked, and the context's field of the same name (a new picture mode is
  // the one whose settings the page then reads). Throws when the value wasn't written.
  function applyWrite(state, row, value, operations, results) {
    var first = results && results[0];
    if (!first || first.returnValue === false) { throw new Error((first && first.errorText) || "Not changed"); }
    var next = { values: Object.assign({}, state.values), descs: state.descs, context: Object.assign({}, state.context) };
    next.values[row.key] = value;
    if (operations[1] && results[1] && results[1].returnValue !== false) {
      next.values.pictureSettingModified = operations[1].params.settings.pictureSettingModified;
    }
    if (next.context[row.key] !== undefined) { next.context[row.key] = value; }
    return next;
  }

  // The inputs a picture page can apply to: apps, live TV, each HDMI input (from eim's
  // getAllInputStatus) and the current one, with their names (`names` for those that aren't HDMI).
  function inputChoices(inputStatus, current, names) {
    var values = ["default", "dtv"];
    var labels = Object.assign({}, names);
    var devices = (inputStatus && inputStatus.devices) || [];
    devices.forEach(function (device) {
      if (!/^HDMI_\d+$/.test(device.id)) { return; }
      var name = "hdmi" + device.id.slice(5);
      values.push(name);
      labels[name] = device.label || "HDMI " + device.id.slice(5);
    });
    if (current && values.indexOf(current) < 0) { values.push(current); }
    values.forEach(function (name) { if (!labels[name]) { labels[name] = name.replace(/^hdmi(\d+)$/, "HDMI $1"); } });
    return { values: values, labels: labels };
  }

  // What a row applies to, for the page's card: every input, or the input (and picture mode) chosen.
  function scopeText(row, view, state, inputs, modeLabels) {
    if (!view || view.hidden || !view.perInput) { return "Applies to every input"; }
    var input = state.context.input;
    var text = "Applies to " + ((inputs && inputs.labels[input]) || input);
    var desc = state.descs[row.key];
    if (desc.dims.indexOf("pictureMode") >= 0 && state.context.pictureMode !== undefined) {
      text += " in " + ((modeLabels && modeLabels[state.context.pictureMode]) || state.context.pictureMode);
    } else if (desc.dims.indexOf("dynamicRange") >= 0 && state.context.dynamicRange) {
      text += " with " + String(state.context.dynamicRange).toUpperCase() + " signals";
    }
    return text;
  }

  return {
    READ_CATEGORIES: READ_CATEGORIES, keysIn: keysIn, allowedValues: allowedValues, nextValue: nextValue, applyReadings: applyReadings,
    emptyPageState: emptyPageState, pageRows: pageRows, currentReads: currentReads, dimensionFor: dimensionFor,
    contextReads: contextReads, applyReads: applyReads, contextFor: contextFor, fillContext: fillContext, labelFor: labelFor,
    rowView: rowView, nextRowValue: nextRowValue, writeOperations: writeOperations, applyWrite: applyWrite, inputChoices: inputChoices,
    scopeText: scopeText
  };
}());

if (typeof module !== "undefined") { module.exports = SettingsLogic; }
