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

  // The installed apps that are hidden, by title.
  function hiddenApps(installed, hidden) {
    return installed.filter(function (app) { return hidden.indexOf(app.id) >= 0; })
      .sort(function (left, right) { return String(left.title).localeCompare(String(right.title)); });
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

  return { sortInstalled: sortInstalled, arrange: arrange, hiddenApps: hiddenApps, parseList: parseList };
}());

if (typeof module !== "undefined") { module.exports = HomeLogic; }
