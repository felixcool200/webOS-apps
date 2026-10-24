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

  // The categories of the Settings hub's quick rows, which a load reads in this order.
  var READ_CATEGORIES = ["picture", "sound"];

  function keysIn(specs, category) {
    return Object.keys(specs).filter(function (key) { return specs[key].category === category; });
  }

  // Puts what one load of the Settings hub read into its state, and returns { state, network, failed }.
  // `replies` are the load's replies in order: one per READ_CATEGORIES, then the values on offer for
  // each of `choiceKeys`, then connectionmanager's and wifi's status, then the sleep timer's time left.
  // An Error stands for a read that failed: it leaves its settings, and the choices known before, as
  // they were, and `network` is null unless both network reads worked. Settings changed while the load
  // ran (`touched`) keep their new value. Ranges are kept as numbers, although the TV reports them as
  // text.
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
    var sleep = reply(networkAt + 2);
    if (specs.sleepTimer && sleep && !touched.sleepTimer) {
      var timer = sleepTimerFrom(sleep);
      next.sleepTimer = { value: timer.value, values: SLEEP_MINUTES, note: timer.note };
    }
    var failed = replies.filter(function (result) { return result instanceof Error; })[0] || null;
    return { state: next, network: connection && wifi ? { connection: connection, wifi: wifi } : null, failed: failed };
  }

  // Settings pages (settings-page.js). A page's state: `values` by key as last read or written,
  // `descs` by key (the TV's description: dims, visible, active, choices or range; made up for rows
  // from other services), `notes` by key (a line under the row, such as the time a sleep timer has
  // left), `context`: the dimension the page reads and writes in, such as { input, dynamicRange,
  // pictureMode }, and `now`: the one the TV was in when the page opened. A page with "Applies to"
  // chooses its context; on other pages it is the one the TV named, and writes name none, as LG
  // Settings' don't.

  function emptyPageState() {
    return { values: {}, descs: {}, notes: {}, context: {}, now: {} };
  }

  function copyState(state) {
    return {
      values: Object.assign({}, state.values), descs: Object.assign({}, state.descs),
      notes: Object.assign({}, state.notes), context: Object.assign({}, state.context), now: Object.assign({}, state.now)
    };
  }

  // The rows of a page in order, each with the index of its section.
  function pageRows(page) {
    var rows = [];
    page.sections.forEach(function (section, index) {
      section.rows.forEach(function (row) { rows.push(Object.assign({ section: index }, row)); });
    });
    return rows;
  }

  // The settingsservice keys a page reads: its rows' and its `extra` keys (read for a rule or a write,
  // not shown), but not rows from other services, links or actions without a key of their own.
  function readKeys(rows, page) {
    return rows.filter(function (row) { return row.key && row.category && !row.source; }).concat((page && page.extra) || []);
  }


  function categoriesOf(keys) {
    var categories = [];
    keys.forEach(function (item) { if (categories.indexOf(item.category) < 0) { categories.push(item.category); } });
    return categories;
  }

  // The settingsservice operations that read a page in the context the TV is in now: per category,
  // the values and (unless `withDescs` is false) the descriptions. The values' replies name that
  // context in `dimension`. A key LG reads and writes for an app (a row's `appId`) has a read of its
  // own: on this TV TruMotion answers for whatever plays now whichever app is named, and the aspect
  // ratio is one value for every input app (and one per web app), so pages read and write them only
  // for the input that played last.
  function currentReads(rows, page, withDescs) {
    var keys = readKeys(rows, page);
    var operations = [];
    categoriesOf(keys).forEach(function (category) {
      var inCategory = keys.filter(function (item) { return item.category === category; });
      var plain = inCategory.filter(function (item) { return !item.appId; }).map(function (item) { return item.key; });
      if (plain.length) { operations.push({ method: "getSystemSettings", params: { category: category, keys: plain } }); }
      inCategory.filter(function (item) { return item.appId; }).forEach(function (item) {
        operations.push({ method: "getSystemSettings", params: { category: category, keys: [item.key], app_id: item.appId } });
      });
      if (withDescs !== false) {
        operations.push({ method: "getSystemSettingDesc", params: { category: category, keys: inCategory.map(function (item) { return item.key; }) } });
      }
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
      if (item.appId) {
        if (needing || state.context.input !== state.now.input) { return; }
        operations.push({ method: "getSystemSettings", params: { category: item.category, keys: [item.key], app_id: item.appId } });
        return;
      }
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

  function kindsOf(rows) {
    var kinds = {};
    rows.forEach(function (row) { kinds[row.key] = row.kind; });
    return kinds;
  }

  // Puts the replies to `operations` into a page's state, and returns { state, read, dimension,
  // failed }: `read` lists the keys whose values came back, `dimension` merges the dimensions the
  // value replies named (the context of a read without one), and `failed` is the first failure. A
  // reply that says returnValue false still carries the values and descriptions the TV has (it
  // lacks a key); a key it lacks keeps what was known. Keys changed meanwhile (`touched`) keep their
  // new value. Ranges are kept as numbers, although the TV reports most of them as text.
  function applyReads(state, rows, operations, replies, touched) {
    var next = copyState(state);
    var read = [];
    var dimension = {};
    var failed = null;
    var kinds = kindsOf(rows);
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
    var next = copyState(state);
    var fields = [];
    Object.keys(state.descs).forEach(function (key) { fields = fields.concat(state.descs[key].dims); });
    read.forEach(function (key) {
      if (next.context[key] === undefined && fields.indexOf(key) >= 0) { next.context[key] = state.values[key]; }
    });
    return next;
  }

  // Rows whose values come from other services than settingsservice (a row's `source`): the calls
  // that read them, what the replies mean for each of the source's rows (values, the choices on
  // offer and notes), and the call that writes a row's new value (none for read-only rows).
  var SLEEP_MINUTES = ["off", "10", "20", "30", "60", "90", "120", "180", "240"];

  // The sleep timer as tvReservationAgent reports it (the time left as sleepTimeMinute and
  // sleepTimeSecond, 9 and 58 for 9:58; only sleepTimeSecond 0 when off): the shortest choice that
  // covers the time left, and how much is left.
  function sleepTimerFrom(reply) {
    var seconds = ((Number(reply && reply.sleepTimeMinute) || 0) * 60) + (Number(reply && reply.sleepTimeSecond) || 0);
    if (seconds <= 0) { return { value: "off", note: "" }; }
    var minutes = Math.ceil(seconds / 60);
    var covering = SLEEP_MINUTES.filter(function (choice) { return choice !== "off" && Number(choice) >= minutes; });
    return { value: covering[0] || SLEEP_MINUTES[SLEEP_MINUTES.length - 1], note: minutes + " min left" };
  }

  function networkDetail(connection) {
    var parts = [];
    if (connection.ssid) { parts.push(connection.ssid); }
    if (connection.ipAddress) { parts.push(connection.ipAddress); }
    if (connection.dns1) { parts.push("DNS " + connection.dns1); }
    if (connection.onInternet === "no") { parts.push("No internet"); }
    return parts.join(" · ");
  }

  // Wi-Fi and Ethernet as connectionmanager's and wifi's status report them: whether the Wi-Fi radio
  // is on (as "enabled" or "disabled"), and a line about each connection.
  function networkStatus(connectionStatus, wifiStatus) {
    var wifi = (connectionStatus && connectionStatus.wifi) || {};
    var wired = (connectionStatus && connectionStatus.wired) || {};
    var serviceStatus = wifiStatus && wifiStatus.status;
    var enabled = serviceStatus !== "serviceDisabled";
    if (!serviceStatus && wifi.state !== "connected") { enabled = false; }
    var status = {
      wifiEnabled: enabled ? "enabled" : "disabled",
      wifiDetail: !enabled ? "Wireless radio is off" : wifi.state === "connected" ? networkDetail(wifi) || "Connected" : "On · Not connected"
    };
    if (wired.state === "connected") {
      status.ethernet = "Connected";
      status.ethernetDetail = networkDetail(wired) || "Cable connected";
    } else if (wired.plugged) {
      status.ethernet = "No network";
      status.ethernetDetail = "Cable connected · No address";
    } else {
      status.ethernet = "Unplugged";
      status.ethernetDetail = "No cable connected";
    }
    return status;
  }

  var SETTINGS_URI = "luna://com.webos.settingsservice/";

  var SOURCES = {
    sleepTimer: {
      reads: [["luna://com.webos.service.tvReservationAgent/timer/sleep/getRemainTime", {}]],
      parse: function (replies) {
        var timer = sleepTimerFrom(replies[0]);
        return { values: { sleepTimer: timer.value }, notes: { sleepTimer: timer.note }, choices: { sleepTimer: SLEEP_MINUTES } };
      },
      write: function (key, value) {
        return ["luna://com.webos.service.tvReservationAgent/timer/sleep/add", { sleepTimeMinute: value === "off" ? "0" : String(value) }];
      }
    },
    network: {
      reads: [["luna://com.webos.service.connectionmanager/getstatus", {}], ["luna://com.webos.service.wifi/getstatus", {}]],
      parse: function (replies) {
        var status = networkStatus(replies[0], replies[1]);
        return {
          values: { wifiEnabled: status.wifiEnabled, wifiStatus: status.wifiDetail, ethernet: status.ethernet },
          notes: { ethernet: status.ethernetDetail }, choices: { wifiEnabled: ["disabled", "enabled"] }
        };
      },
      write: function (key, value) {
        return key === "wifiEnabled" ? ["luna://com.webos.service.connectionmanager/setstate", { wifi: value }] : null;
      }
    },
    // Where the sound plays: the TV speaker and the optical output with or without it, which LG offers
    // always (an optical device can't be detected), and the outputs the audio service names: the one in
    // use, the one before it, and its list (which on this TV holds only the one in use).
    soundOut: {
      reads: [["luna://com.webos.service.audio/getSoundOutput", {}]],
      parse: function (replies) {
        var reply = replies[0];
        var choices = ["tv_speaker", "tv_external_speaker", "external_optical"];
        (reply.settingsSoundOutputs || []).concat([reply.soundOutput, reply.lastSoundOutput]).forEach(function (output) {
          if (output && output !== "none" && choices.indexOf(output) < 0) { choices.push(output); }
        });
        return { values: { soundOutput: reply.soundOutput }, choices: { soundOutput: choices } };
      },
      write: function (key, value) {
        return [SETTINGS_URI + "setSystemSettings", { category: "sound", settings: { soundOutput: value } }];
      }
    },
    // Always Ready, on while LG's lifeOnScreenMode is allEnabled or alwaysReady. LG turns it on as
    // allEnabled and, in Europe, records that the user agreed to the energy it uses (erpUserConfirm).
    alwaysReady: {
      reads: [[SETTINGS_URI + "getSystemSettings", { category: "general", keys: ["lifeOnScreenMode"] }]],
      parse: function (replies) {
        var mode = (replies[0].settings || {}).lifeOnScreenMode;
        return { values: { alwaysReady: mode === undefined ? undefined : mode === "allEnabled" || mode === "alwaysReady" ? "on" : "off" },
          choices: { alwaysReady: ["off", "on"] } };
      },
      write: function (key, value) {
        var operations = [{ method: "setSystemSettings", params: { category: "general", settings: { lifeOnScreenMode: value === "on" ? "allEnabled" : "off" } } }];
        if (value === "on") { operations.push({ method: "setSystemSettings", params: { category: "picture", settings: { erpUserConfirm: true } } }); }
        return [SETTINGS_URI + "batch", { operations: operations }];
      }
    },
    // Power On Screen: Home, or the input used last ("recent"), from homeAutoLaunch and
    // selectedInputApp. LG offers single inputs only in China; one set there shows as it is.
    powerOnScreen: {
      reads: [[SETTINGS_URI + "getSystemSettings", { category: "general", keys: ["homeAutoLaunch", "selectedInputApp"] }]],
      parse: function (replies) {
        var settings = replies[0].settings || {};
        var value = settings.homeAutoLaunch === undefined ? undefined : settings.homeAutoLaunch === "on" ? "home" :
          settings.selectedInputApp && settings.selectedInputApp !== "off" ? settings.selectedInputApp : "recent";
        var choices = ["home", "recent"];
        if (value && choices.indexOf(value) < 0) { choices.push(value); }
        return { values: { powerOnScreen: value }, choices: { powerOnScreen: choices } };
      },
      write: function (key, value) {
        return [SETTINGS_URI + "setSystemSettings", { category: "general", settings: {
          homeAutoLaunch: value === "home" ? "on" : "off", selectedInputApp: value === "home" || value === "recent" ? "off" : value,
          checkHomeAutoLaunchValue: "user"
        } }];
      }
    },
    // Grayscale and Invert colours, the fields of LG's adjustments. LG turns Screen Zoom off first, then
    // writes both fields (the other one off) with the high-contrast options off.
    colourFilters: {
      reads: [[SETTINGS_URI + "getSystemSettings", { category: "option", keys: ["adjustments"] }]],
      parse: function (replies) {
        var adjustments = (replies[0].settings || {}).adjustments;
        if (!adjustments || typeof adjustments !== "object") { return { values: {} }; }
        return { values: { grayscale: adjustments.blackAndWhite, invertColours: adjustments.colorInversion },
          choices: { grayscale: ["off", "on"], invertColours: ["off", "on"] } };
      },
      write: function (key, value) {
        return [SETTINGS_URI + "batch", { operations: [
          { method: "setSystemSettings", params: { category: "option", settings: { screenMagnification: "off" } } },
          { method: "setSystemSettings", params: { category: "option", settings: {
            adjustments: { blackAndWhite: key === "grayscale" ? value : "off", colorInversion: key === "invertColours" ? value : "off" },
            highContrast: "off", focusEmphasis: "off"
          } } }
        ] }];
      }
    },
    tvInfo: {
      reads: [["luna://com.webos.service.tv.systemproperty/getSystemInfo", { keys: ["modelName", "firmwareVersion"] }],
        ["luna://com.palm.systemservice/osInfo/query", { parameters: ["webos_name", "webos_release"] }]],
      parse: function (replies) {
        return { values: {
          model: replies[0].modelName, software: replies[0].firmwareVersion,
          webos: [replies[1].webos_name, replies[1].webos_release].filter(Boolean).join(" ")
        } };
      }
    }
  };

  function sourcesOf(rows) {
    var names = [];
    rows.forEach(function (row) { if (row.source && names.indexOf(row.source) < 0) { names.push(row.source); } });
    return names;
  }

  // The calls that read a page's rows from other services, in order, as [uri, payload] pairs.
  function sourceCalls(rows) {
    return sourcesOf(rows).reduce(function (calls, name) { return calls.concat(SOURCES[name].reads); }, []);
  }

  // Puts the replies to sourceCalls into the state; returns { state, failed }. A source whose reads
  // didn't all answer leaves its rows as they were. Keys changed meanwhile (`touched`) keep theirs.
  function applySources(state, rows, replies, touched) {
    var next = copyState(state);
    var failed = null;
    var at = 0;
    sourcesOf(rows).forEach(function (name) {
      var source = SOURCES[name];
      var own = replies.slice(at, at + source.reads.length);
      at += source.reads.length;
      var broken = own.filter(function (reply) { return !reply || reply instanceof Error; })[0];
      if (broken !== undefined || own.length < source.reads.length) {
        failed = failed || (broken instanceof Error ? broken : new Error("No reply"));
        return;
      }
      var parsed = source.parse(own);
      Object.keys(parsed.values).forEach(function (key) {
        if (parsed.values[key] === undefined) { return; }
        var choices = (parsed.choices || {})[key];
        next.descs[key] = { dims: [], visible: true, active: true, range: null,
          choices: choices ? choices.map(function (value) { return { value: value }; }) : null };
        next.notes[key] = (parsed.notes || {})[key] || "";
        if (!(touched && touched[key])) { next.values[key] = parsed.values[key]; }
      });
    });
    return { state: next, failed: failed };
  }

  // The [uri, payload] call that writes a row from another service, or null when it can't be written.
  function sourceWrite(row, value) {
    var source = SOURCES[row.source];
    return source && source.write ? source.write(row.key, value) : null;
  }

  function labelFor(row, value) {
    return (row.labels && row.labels[value]) || String(value);
  }

  // How read-only rows show values that aren't plain text.
  var FORMATS = {
    // A time zone, such as { City: "Stockholm", Description: "Central European Time", ... }.
    timeZone: function (zone) {
      return zone && typeof zone === "object" ? [zone.City, zone.Description].filter(Boolean).join(" · ") : String(zone);
    }
  };

  // A rule on another key's value, such as { key: "energySaving", values: ["auto", "max"] }, on a
  // field of an object value ({ key: "adjustments", field: "blackAndWhite", values: ["on"] }), or on
  // a field of the page's context ({ context: "input", values: ["default"] }). With `except` instead
  // of `values`, it holds for any other value.
  function holds(rule, state) {
    var value = rule.context ? state.context[rule.context] : state.values[rule.key];
    if (rule.field) { value = value && typeof value === "object" ? value[rule.field] : undefined; }
    return rule.values ? rule.values.indexOf(value) >= 0 : rule.except.indexOf(value) < 0;
  }

  // How a row shows. Hidden when the TV doesn't offer it, or its showWhen rule fails or its hideWhen
  // rule holds. Greyed, with the reason, while a greyedWhen rule (one or a list) holds or the TV says
  // it isn't available now. Its value, text and note; the choices Left/Right step through, or a
  // range's min, max and step (5 on ranges of 100 or more, else 1). Info rows are read-only, and links
  // always show.
  function rowView(row, state) {
    if (row.kind === "link") { return { hidden: false, greyed: false, reason: "", text: "›", note: "", perInput: false }; }
    var desc = state.descs[row.key];
    var value = state.values[row.key];
    var action = row.kind === "action";
    var hidden = (action ? row.category && (!desc || !desc.visible) : !desc || !desc.visible || value === undefined) ||
      ((row.appId || row.playing) && state.now && state.context.input !== state.now.input) ||
      (row.showWhen && !holds(row.showWhen, state)) || (row.hideWhen && holds(row.hideWhen, state));
    var view = { hidden: !!hidden, greyed: false, reason: "", value: value, note: (state.notes && state.notes[row.key]) || "" };
    if (view.hidden) { return view; }
    var rules = Array.isArray(row.greyedWhen) ? row.greyedWhen : row.greyedWhen ? [row.greyedWhen] : [];
    var rule = rules.filter(function (each) { return holds(each, state); })[0];
    if (rule) {
      view.greyed = true;
      view.reason = rule.reason;
    } else if (desc && !desc.active) {
      view.greyed = true;
      view.reason = "Not available now";
    }
    view.perInput = !!desc && desc.dims.indexOf("input") >= 0;
    if (action) {
      view.text = "";
    } else if (row.kind === "info") {
      view.text = row.format ? FORMATS[row.format](value) : labelFor(row, value);
    } else if (row.kind === "range") {
      var range = desc.range || { min: 0, max: 100 };
      view.min = Number(range.min);
      view.max = Number(range.max);
      view.step = row.step || (view.max - view.min >= 100 ? 5 : 1);
      view.fill = view.max > view.min ? Math.max(0, Math.min(100, (value - view.min) / (view.max - view.min) * 100)) : 0;
      view.text = String(value);
    } else {
      view.values = allowedValues({ values: { arrayExt: desc.choices || [] } }, value, row.order || switchOrder(desc.choices));
      view.text = labelFor(row, value);
    }
    return view;
  }

  // On/off choices go off first, so Left turns a switch off and Right on, whatever order the TV lists
  // them in (on, off for most keys; true, false for some).
  var SWITCH_VALUES = ["off", "false", "disabled", "on", "true", "enabled"];

  function switchOrder(choices) {
    var values = (choices || []).map(function (entry) { return entry.value; });
    var isSwitch = values.length === 2 && values.every(function (value) { return SWITCH_VALUES.indexOf(value) >= 0; });
    return isSwitch ? SWITCH_VALUES : null;
  }

  // The value one step from a row's current one, as rowView offers it.
  function nextRowValue(row, view, direction) {
    return nextValue(row.kind === "range" ? { kind: "range", min: view.min, max: view.max, step: view.step } : { kind: "choice" },
      { value: view.value, values: view.values }, direction);
  }

  // Whether changing a row to this value asks first (OK again writes it), as turning Wi-Fi off does.
  // A row with confirm.any asks before its first change each time it is being changed (`confirmed`
  // once it was), as LG asks before Minimum Brightness.
  function needsConfirm(row, value, confirmed) {
    if (!row.confirm) { return false; }
    return row.confirm.any ? !confirmed : row.confirm.values.indexOf(value) >= 0;
  }

  // The settingsservice operations that write a row's new value, with the settings LG writes with it
  // (`with`). On a page with "Applies to" the write names the dimension its description lists, filled
  // from the context, and the first change of a picture mode's settings also sets LG's flag that marks
  // the mode "(User Settings)", as LG Settings does; the TV keeps the flags per input, so they take an
  // operation of their own. Null when the context can't target the row yet.
  function modeFlagOperation(state, value) {
    var flags = state.values.pictureSettingModified;
    var mode = state.context.pictureMode;
    if (!flags || typeof flags !== "object" || mode === undefined || state.context.input === undefined || flags[mode] === value) { return null; }
    var marked = Object.assign({}, flags);
    marked[mode] = value;
    return { method: "setSystemSettings", params: { category: "picture", settings: { pictureSettingModified: marked }, dimension: { input: state.context.input } } };
  }

  function writeOperations(row, value, state, page) {
    var desc = state.descs[row.key];
    if (!desc || row.source) { return null; }
    var targeted = !!(page && page.context);
    var dimension = targeted && !row.appId ? dimensionFor(desc.dims, state.context) : null;
    if (dimension === undefined) { return null; }
    var settings = {};
    settings[row.key] = value;
    Object.assign(settings, row["with"] || {});
    var write = { category: row.category, settings: settings };
    if (dimension) { write.dimension = dimension; }
    if (row.appId) { write.app_id = row.appId; }
    var operations = [{ method: "setSystemSettings", params: write }];
    var flag = targeted && row.category === "picture" && desc.dims.indexOf("pictureMode") >= 0 ? modeFlagOperation(state, true) : null;
    if (flag) { operations.push(flag); }
    return operations;
  }

  // The settings LG's sound reset restores, by sound mode.
  function soundResetKeys(mode) {
    if (mode === "standard") { return ["audioBalance", "userEqualizerValues", "soundModeModified"]; }
    if (mode === "game") { return ["audioBalance", "gameTVEqualizer", "gameTVEqualizer10band", "soundModeModified"]; }
    return ["audioBalance", "soundModeModified"];
  }

  // The settingsservice operations of an action row, as LG Settings runs them: `write` sets settings
  // without a dimension (Apply to All Inputs copies what plays: named with HDMI 3's dimension while
  // live TV played, it copied nothing, so that row shows only for the input that played last); reset
  // "picture" restores the context's picture mode on its input and clears the mode's "(User
  // Settings)" flag; reset "sound" restores the current sound mode's settings. Null when the context
  // can't target it yet.
  function actionOperations(row, state) {
    var action = row.action;
    if (action.write) { return [{ method: "setSystemSettings", params: { category: row.category, settings: action.write } }]; }
    if (action.reset === "picture") {
      if (state.context.input === undefined || state.context.pictureMode === undefined) { return null; }
      var operations = [{ method: "resetSystemSettings", params: { category: "picture", dimension: { input: state.context.input, pictureMode: state.context.pictureMode } } }];
      var flag = modeFlagOperation(state, false);
      if (flag) { operations.push(flag); }
      return operations;
    }
    return [{ method: "resetSystemSettings", params: { category: "sound", keys: soundResetKeys(state.values.soundMode) } }];
  }

  // Throws the first failure in the replies of a settingsservice batch.
  function checkResults(results) {
    (results || []).forEach(function (result) {
      if (result && result.returnValue === false) { throw new Error(result.errorText || "Not changed"); }
    });
  }

  // The state after the TV answered a write's operations (results in order): the row's new value and
  // the settings written with it, the mode's flag if that worked, and the context's field of the same
  // name (a new picture mode is the one whose settings the page then reads). Throws when the value
  // wasn't written.
  function applyWrite(state, row, value, operations, results) {
    var first = results && results[0];
    if (!first || first.returnValue === false) { throw new Error((first && first.errorText) || "Not changed"); }
    var next = copyState(state);
    next.values[row.key] = value;
    Object.keys(row["with"] || {}).forEach(function (key) { next.values[key] = row["with"][key]; });
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

  // What a row applies to, for the card: on a page with "Applies to", every input or the input (and
  // picture mode) chosen; elsewhere, keys the TV keeps per input or output change what plays now.
  function scopeText(row, view, state, page, inputs, modeLabels) {
    if (!view || view.hidden || row.kind === "link" || row.source || !state.descs[row.key]) { return ""; }
    var desc = state.descs[row.key];
    if (!page.context) { return desc && desc.dims.length ? "Applies to what is playing now" : ""; }
    if (!view.perInput) { return "Applies to every input"; }
    var input = state.context.input;
    var text = "Applies to " + ((inputs && inputs.labels[input]) || input);
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
    sleepTimerFrom: sleepTimerFrom, networkStatus: networkStatus, sourceCalls: sourceCalls, applySources: applySources,
    SOURCES: SOURCES, sourceWrite: sourceWrite, rowView: rowView, nextRowValue: nextRowValue, needsConfirm: needsConfirm,
    writeOperations: writeOperations, soundResetKeys: soundResetKeys, actionOperations: actionOperations, checkResults: checkResults,
    applyWrite: applyWrite, inputChoices: inputChoices, scopeText: scopeText
  };
}());

if (typeof module !== "undefined") { module.exports = SettingsLogic; }
