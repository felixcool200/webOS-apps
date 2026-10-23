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

  // Where the last line of a section of `length` apps starts, with `width` apps to a line.
  function lastLineStart(length, width) {
    return length && isFinite(width) ? Math.floor((length - 1) / width) * width : 0;
  }

  // The column in a section `to` apps wide below or above a column in one `from` apps wide. Every
  // section spans the screen, so the column keeps its place across it.
  function mapColumn(column, from, to) {
    if (!isFinite(from) || !isFinite(to)) { return column; }
    return Math.min(to - 1, Math.floor((column + 0.5) * to / from));
  }

  // The tile an arrow leads to in Home's grid: `sections` are the sections shown, top to bottom, as
  // { count, columns } (columns: tiles per line on screen), and `from` is { section, index }. Left and
  // right wrap within the line. Up and down go a line at a time, and from a section's first or last
  // line into the nearest non-empty section above or below, at the same place across the screen.
  // Returns { section, index }, or null past the top or bottom.
  function gridNeighbor(sections, from, direction) {
    var section = sections[from.section];
    var width = section.columns;
    var column = from.index % width;
    var lineStart = from.index - column;
    if (direction === "left" || direction === "right") {
      var lineLength = Math.min(width, section.count - lineStart);
      return { section: from.section, index: lineStart + (column + (direction === "right" ? 1 : -1) + lineLength) % lineLength };
    }
    if (direction === "down" && lineStart + width < section.count) {
      return { section: from.section, index: Math.min(from.index + width, section.count - 1) };
    }
    if (direction === "up" && lineStart > 0) {
      return { section: from.section, index: from.index - width };
    }
    var step = direction === "down" ? 1 : -1;
    for (var next = from.section + step; next >= 0 && next < sections.length; next += step) {
      if (!sections[next].count) { continue; }
      var into = sections[next];
      var start = direction === "down" ? 0 : lastLineStart(into.count, into.columns);
      return { section: next, index: Math.min(start + mapColumn(column, width, into.columns), into.count - 1) };
    }
    return null;
  }

  // Moves app `id` one step in a layout ({ apps, tools, hidden }: the ids as shown). `columns` gives
  // each section's apps per line on screen (one line if left out). Left and right swap it with its
  // neighbour. Up and down move it a line within its section, and from the section's first or last
  // line into the section above or below, at the same column (its last line going up, its first going
  // down). Returns a new layout, or the same one when the app can't move that way.
  function moveInLayout(layout, id, direction, columns) {
    function width(name) { return (columns && columns[name]) || Infinity; }
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
    var column = index % width(row);
    var lineStart = index - column;
    if (direction === "down" && lineStart + width(row) < list.length) {
      var below = Math.min(index + width(row), list.length - 1);
      list.splice(index, 1);
      list.splice(below, 0, id);
      return next;
    }
    if (direction === "up" && lineStart > 0) {
      list.splice(index, 1);
      list.splice(index - width(row), 0, id);
      return next;
    }
    var rowIndex = ROWS.indexOf(row) + (direction === "down" ? 1 : -1);
    if (rowIndex < 0 || rowIndex >= ROWS.length) { return layout; }
    list.splice(index, 1);
    var name = ROWS[rowIndex];
    var into = next[name];
    var start = direction === "down" ? 0 : lastLineStart(into.length, width(name));
    into.splice(Math.min(start + mapColumn(column, width(row), width(name)), into.length), 0, id);
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
    sortInstalled: sortInstalled, arrange: arrange, hiddenApps: hiddenApps, gridNeighbor: gridNeighbor, moveInLayout: moveInLayout,
    savedLists: savedLists, parseList: parseList
  };
}());

if (typeof module !== "undefined") { module.exports = HomeLogic; }
