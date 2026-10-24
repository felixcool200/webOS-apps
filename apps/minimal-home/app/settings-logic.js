// The Settings view's rules for reading and stepping through values, without the page. settings.js
// uses them; test/settings-logic.test.js checks them in Node.
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

  return { READ_CATEGORIES: READ_CATEGORIES, keysIn: keysIn, allowedValues: allowedValues, nextValue: nextValue, applyReadings: applyReadings };
}());

if (typeof module !== "undefined") { module.exports = SettingsLogic; }
