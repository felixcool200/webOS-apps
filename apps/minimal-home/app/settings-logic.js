// The Settings view's rules for stepping through values, without the page. settings.js uses them;
// test/settings-logic.test.js checks them in Node.
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

  return { allowedValues: allowedValues, nextValue: nextValue };
}());

if (typeof module !== "undefined") { module.exports = SettingsLogic; }
