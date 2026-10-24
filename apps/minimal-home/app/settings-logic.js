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

  // Puts what one load read into the settings' state, and returns { state, failed }. `replies` are the
  // load's replies in order: the picture, sound and option settings, then the values on offer for each
  // of `choiceKeys`; an Error stands for a read that failed and leaves its settings as they were.
  // Settings changed while the load ran (`touched`) keep their new value. Ranges are kept as numbers,
  // although the TV reports them as text.
  function applyReadings(specs, state, replies, touched, choiceKeys) {
    var next = {};
    Object.keys(state).forEach(function (key) { next[key] = Object.assign({}, state[key]); });
    function reply(index) { return replies[index] instanceof Error ? null : replies[index]; }
    [0, 1, 2].forEach(function (index) {
      var read = (reply(index) && reply(index).settings) || {};
      Object.keys(read).forEach(function (key) {
        if (touched[key]) { return; }
        var value = specs[key] && specs[key].kind === "range" ? Number(read[key]) : read[key];
        next[key] = Object.assign({}, next[key], { value: value });
      });
    });
    choiceKeys.forEach(function (key, index) {
      if (next[key]) { next[key].values = allowedValues(reply(3 + index), next[key].value, specs[key].order); }
    });
    var failed = replies.slice(0, 3 + choiceKeys.length).filter(function (result) { return result instanceof Error; })[0] || null;
    return { state: next, failed: failed };
  }

  return { allowedValues: allowedValues, nextValue: nextValue, applyReadings: applyReadings };
}());

if (typeof module !== "undefined") { module.exports = SettingsLogic; }
