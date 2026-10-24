// The Appearance view's rules without the page: the themes on offer and what changing a theme's
// accent or background does. appearance.js uses them; test/appearance-logic.test.js checks them.
var AppearanceLogic = (function () {
  "use strict";

  // The value `direction` (1 or -1) places from `value` in a list, wrapping at the ends.
  function step(list, value, direction) {
    var index = Math.max(0, list.indexOf(value));
    return list[(index + direction + list.length) % list.length];
  }

  // A theme with one field (accent or background) changed. Your own themes change in place; any other
  // theme (a preset) stays as it is, and the change makes a theme of your own from it ("Custom 1",
  // "Custom 2", ...). Returns { customs, theme } with the themes of your own and the changed theme.
  function withChange(customs, theme, field, value) {
    var changed = Object.assign({}, theme);
    changed[field] = value;
    var isOwn = customs.some(function (own) { return own.id === theme.id; });
    if (isOwn) {
      return { customs: customs.map(function (own) { return own.id === theme.id ? changed : own; }), theme: changed };
    }
    var number = customs.reduce(function (highest, own) {
      return Math.max(highest, parseInt(own.id.replace("custom-", ""), 10) || 0);
    }, 0) + 1;
    changed.id = "custom-" + number;
    changed.name = "Custom " + number;
    return { customs: customs.concat([changed]), theme: changed };
  }

  function withoutTheme(customs, id) {
    return customs.filter(function (own) { return own.id !== id; });
  }

  // Your own themes as saved (JSON text), without broken entries.
  function parseCustoms(text, isTheme) {
    var list;
    try { list = JSON.parse(text); } catch (error) { return []; }
    return Array.isArray(list) ? list.filter(isTheme) : [];
  }

  return { step: step, withChange: withChange, withoutTheme: withoutTheme, parseCustoms: parseCustoms };
}());

if (typeof module !== "undefined") { module.exports = AppearanceLogic; }
