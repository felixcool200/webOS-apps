// Minimal Home's rules for which apps show where, without the page: the default order, the saved
// order, hidden apps and the Tools row. app.js uses them; test/home-logic.test.js checks them in Node.
var HomeLogic = (function () {
  "use strict";

  // The launchable apps: visible ones except Home itself (ours and LG's), in the preferred order
  // first and then in the order the TV lists them.
  function sortInstalled(apps, preferredOrder, ownIds) {
    var rank = {};
    preferredOrder.forEach(function (id, index) { rank[id] = index; });
    function rankOf(app) { return Object.prototype.hasOwnProperty.call(rank, app.id) ? rank[app.id] : preferredOrder.length; }
    return apps.filter(function (app) {
      return app && app.visible !== false && ownIds.indexOf(app.id) < 0;
    }).map(function (app, index) {
      return { app: app, index: index };
    }).sort(function (left, right) {
      return rankOf(left.app) - rankOf(right.app) || left.index - right.index;
    }).map(function (entry) { return entry.app; });
  }

  // Splits the installed apps into the two rows, without hidden apps and in the saved order. Apps
  // missing from the saved order (installed later) follow it in their default order.
  function arrange(installed, hidden, toolIds, savedOrder) {
    var shown = installed.filter(function (app) { return hidden.indexOf(app.id) < 0; }).map(function (app, index) {
      var position = savedOrder.indexOf(app.id);
      return { app: app, rank: position < 0 ? savedOrder.length + index : position };
    }).sort(function (left, right) { return left.rank - right.rank; }).map(function (entry) { return entry.app; });
    return {
      apps: shown.filter(function (app) { return toolIds.indexOf(app.id) < 0; }),
      tools: shown.filter(function (app) { return toolIds.indexOf(app.id) >= 0; }),
      hiddenCount: installed.length - shown.length
    };
  }

  // The installed apps that are hidden, in the order of the hidden list (arranging sets it).
  function hiddenApps(installed, hidden) {
    return installed.filter(function (app) { return hidden.indexOf(app.id) >= 0; })
      .sort(function (left, right) { return hidden.indexOf(left.id) - hidden.indexOf(right.id); });
  }

  // The rows while arranging, top to bottom; Hidden only shows then.
  var ROWS = ["apps", "tools", "hidden"];

  // Moves app `id` one step in a layout ({ apps, tools, hidden }: the ids as shown). Left and right
  // swap it with its neighbour; up and down move it to the row above or below, at the same place or at
  // the end. Returns a new layout, or the same one when the app can't move that way.
  function moveInLayout(layout, id, direction) {
    var row = ROWS.filter(function (name) { return layout[name].indexOf(id) >= 0; })[0];
    if (!row) { return layout; }
    var next = { apps: layout.apps.slice(), tools: layout.tools.slice(), hidden: layout.hidden.slice() };
    var list = next[row];
    var index = list.indexOf(id);
    if (direction === "left" || direction === "right") {
      var target = index + (direction === "right" ? 1 : -1);
      if (target < 0 || target >= list.length) { return layout; }
      list.splice(index, 1);
      list.splice(target, 0, id);
      return next;
    }
    var rowIndex = ROWS.indexOf(row) + (direction === "down" ? 1 : -1);
    if (rowIndex < 0 || rowIndex >= ROWS.length) { return layout; }
    list.splice(index, 1);
    var into = next[ROWS[rowIndex]];
    into.splice(Math.min(index, into.length), 0, id);
    return next;
  }

  // The lists to save for a layout. Tools and hidden apps that aren't installed now stay in their
  // lists, so they are back in place if reinstalled.
  function savedLists(layout, previousTools, previousHidden, installedIds) {
    function absent(id) { return installedIds.indexOf(id) < 0; }
    return {
      order: layout.apps.concat(layout.tools),
      tools: layout.tools.concat(previousTools.filter(absent)),
      hidden: layout.hidden.concat(previousHidden.filter(absent))
    };
  }

  // A saved list (JSON text), or a copy of the fallback when nothing valid was saved.
  function parseList(text, fallback) {
    try {
      var list = JSON.parse(text);
      return Array.isArray(list) ? list : fallback.slice();
    } catch (error) {
      return fallback.slice();
    }
  }

  return {
    sortInstalled: sortInstalled, arrange: arrange, hiddenApps: hiddenApps, moveInLayout: moveInLayout,
    savedLists: savedLists, parseList: parseList
  };
}());

if (typeof module !== "undefined") { module.exports = HomeLogic; }
