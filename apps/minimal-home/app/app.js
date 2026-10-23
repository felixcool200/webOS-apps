(function () {
  "use strict";

  var APP_ID = "org.webosbrew.minimalhome";
  var APP_DIR = "/media/developer/apps/usr/palm/applications/" + APP_ID;
  // Starting contents of the hidden list and the Tools row. Edit mode changes them, and the result is
  // saved on the TV, so these only apply until the first change.
  var DEFAULT_HIDDEN = [
    "amazon.alexa.view",
    "com.webos.app.camera",
    "com.webos.app.homeconnect",
    "com.webos.app.lgchannels",
    "com.webos.app.lifeonscreen",
    "com.webos.app.mediadiscovery",
    "com.webos.app.sportsteamsettings"
  ];
  var DEFAULT_TOOLS = [
    "com.webos.app.discovery",
    "org.webosbrew.hbchannel",
    "org.webosbrew.inputhook",
    "ooo.lew.lifesgoodwithoutspying"
  ];
  var PREFERRED_APP_ORDER = [
    "youtube.leanback.v4",
    "netflix",
    "com.disney.disneyplus-prod",
    "com.sverigesradio.app",
    "viaplay-lg",
    "spotify-beehive"
  ];
  var KEY = WebOS.KEY;
  var lunaCall = WebOS.lunaCall;
  var rootExec = WebOS.rootExec;
  var rootLuna = WebOS.rootLuna;
  // webOS reloads Home twice in quick succession when it comes into view, and the app list call
  // sometimes gets no answer then. Retry after these delays before showing an error.
  var APP_LIST_RETRY_MS = [500, 1000, 2000];
  // Settings values are read this long after Home is on screen, so they are ready when the Settings
  // view opens without competing with the app list.
  var SETTINGS_PRELOAD_DELAY_MS = 1000;
  // Holding OK (or the pointer button) on a tile this long picks it up for edit mode.
  var HOLD_MS = 600;
  var ORDER_KEY = "home.appOrder";
  var HIDDEN_KEY = "home.hiddenApps";
  var TOOLS_KEY = "home.toolApps";
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var view = "home";
  var installed = [];
  var editing = null;
  var holdTimer = null;
  var suppressClick = false;
  // Set while the OK press that picked a tile up is still held, so its repeats don't put it down.
  var awaitingRelease = false;
  var selected = null;
  var pointerX = 0;
  var pointerY = 0;

  function notify(message) {
    lunaCall("luna://com.webos.notification/createToast", { message: message }).catch(function () {});
  }

  function launch(id) {
    rootLuna("luna://com.webos.service.applicationManager/launch", { id: id }).catch(function () {
      notify("Could not open " + id);
    });
  }

  // Returns the saved list, or the fallback if nothing has been saved yet.
  function readList(key, fallback) {
    try {
      var list = JSON.parse(window.localStorage.getItem(key));
      return Array.isArray(list) ? list : fallback.slice();
    } catch (error) {
      console.warn("Could not read " + key + ": " + error.message);
      return fallback.slice();
    }
  }

  function writeList(key, list) {
    try {
      window.localStorage.setItem(key, JSON.stringify(list));
    } catch (error) {
      console.warn("Could not save " + key + ": " + error.message);
    }
  }

  function pad(number) { return number < 10 ? "0" + number : String(number); }

  function tickClock() {
    var now = new Date();
    var time = pad(now.getHours()) + ":" + pad(now.getMinutes());
    var date = DAYS[now.getDay()] + " " + now.getDate() + " " + MONTHS[now.getMonth()];
    Array.prototype.forEach.call(document.querySelectorAll(".clock"), function (clock) {
      if (clock.textContent !== time) { clock.textContent = time; }
    });
    Array.prototype.forEach.call(document.querySelectorAll(".date"), function (label) {
      if (label.textContent !== date) { label.textContent = date; }
    });
  }

  function initials(title) {
    var words = String(title || "App").trim().split(/\s+/);
    if (words.length === 1) { return words[0].slice(0, 2).toUpperCase(); }
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }

  function iconSource(app) {
    var folder = app.activeFolderPath || app.folderPath;
    if (!folder || !app.icon) { return ""; }
    return "hack" + folder + "/" + app.icon;
  }

  function makeTile(app, onActivate) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "app focusable";
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-label", app.title || app.id);
    button.setAttribute("data-app-id", app.id);

    var picture = document.createElement("div");
    picture.className = "app-icon fallback";
    picture.textContent = initials(app.title);

    var source = iconSource(app);
    if (source) {
      var image = document.createElement("img");
      image.className = "app-icon";
      image.alt = "";
      image.src = source;
      image.onload = function () { if (picture.parentNode) { picture.parentNode.replaceChild(image, picture); } };
    }

    var name = document.createElement("span");
    name.className = "app-name";
    name.textContent = app.title || app.id;
    button.appendChild(picture);
    button.appendChild(name);
    button.addEventListener("click", function () { onActivate(app, button); });
    return button;
  }

  function makeHomeTile(app) {
    var tile = makeTile(app, function () {
      if (suppressClick) { suppressClick = false; return; }
      if (editing) { stopEditing(); return; }
      launch(app.id);
    });
    tile.addEventListener("mousedown", function () {
      if (!editing) { startHold(tile, true); }
    });
    return tile;
  }

  // Ends the Tools row while any apps are hidden, and opens the Hidden apps view.
  function makeHiddenTile(count) {
    var button = document.createElement("button");
    button.type = "button";
    button.id = "hidden-tile";
    button.className = "app focusable";
    var picture = document.createElement("div");
    picture.className = "app-icon fallback";
    picture.textContent = count;
    var name = document.createElement("span");
    name.className = "app-name";
    name.textContent = "Hidden apps";
    button.appendChild(picture);
    button.appendChild(name);
    button.addEventListener("click", function () { showView("hidden"); });
    return button;
  }

  function showApps(apps) {
    var visible = apps.filter(function (app) {
      return app && app.visible !== false && app.id !== APP_ID && app.id !== "com.webos.app.home";
    });

    var rank = {};
    PREFERRED_APP_ORDER.forEach(function (id, index) { rank[id] = index; });
    installed = visible.map(function (app, index) {
      return { app: app, originalIndex: index };
    }).sort(function (left, right) {
      var leftRank = Object.prototype.hasOwnProperty.call(rank, left.app.id) ? rank[left.app.id] : PREFERRED_APP_ORDER.length;
      var rightRank = Object.prototype.hasOwnProperty.call(rank, right.app.id) ? rank[right.app.id] : PREFERRED_APP_ORDER.length;
      return leftRank === rightRank ? left.originalIndex - right.originalIndex : leftRank - rightRank;
    }).map(function (entry) { return entry.app; });
    renderApps(null);
  }

  // Draws both rows in the saved order without the hidden apps. Apps that are not in the saved order
  // (installed later) follow it in the default order.
  function renderApps(focusId) {
    var apps = document.getElementById("apps");
    var tools = document.getElementById("tools");
    var status = document.getElementById("status");
    var hidden = readList(HIDDEN_KEY, DEFAULT_HIDDEN);
    var toolIds = readList(TOOLS_KEY, DEFAULT_TOOLS);
    var saved = readList(ORDER_KEY, []);
    var shown = installed.filter(function (app) { return hidden.indexOf(app.id) < 0; });
    shown = shown.map(function (app, index) {
      var position = saved.indexOf(app.id);
      return { app: app, rank: position < 0 ? saved.length + index : position };
    }).sort(function (left, right) { return left.rank - right.rank; }).map(function (entry) { return entry.app; });

    apps.textContent = "";
    tools.textContent = "";
    shown.forEach(function (app) {
      (toolIds.indexOf(app.id) < 0 ? apps : tools).appendChild(makeHomeTile(app));
    });
    var hiddenCount = installed.length - shown.length;
    if (hiddenCount) { tools.appendChild(makeHiddenTile(hiddenCount)); }
    document.getElementById("tools-section").hidden = !tools.children.length;
    status.classList.toggle("visible", installed.length === 0);
    status.textContent = installed.length ? "" : "No apps found";
    if (view !== "home") { return; }
    var focus = focusId && document.querySelector('#home-view [data-app-id="' + focusId + '"]');
    setFocus(focus || document.querySelector("#apps .focusable") || document.querySelector("#home-view .focusable"));
  }

  function renderHidden() {
    var box = document.getElementById("hidden-apps");
    var hidden = readList(HIDDEN_KEY, DEFAULT_HIDDEN);
    var apps = installed.filter(function (app) { return hidden.indexOf(app.id) >= 0; })
      .sort(function (left, right) { return String(left.title).localeCompare(String(right.title)); });
    box.textContent = "";
    apps.forEach(function (app) { box.appendChild(makeTile(app, unhide)); });
    return apps.length;
  }

  function unhide(app, tile) {
    var next = tile.nextElementSibling || tile.previousElementSibling;
    writeList(HIDDEN_KEY, readList(HIDDEN_KEY, DEFAULT_HIDDEN).filter(function (id) { return id !== app.id; }));
    renderApps(null);
    if (!renderHidden()) { showView("home"); return; }
    setFocus(next && document.querySelector('#hidden-apps [data-app-id="' + next.getAttribute("data-app-id") + '"]') ||
      document.querySelector("#hidden-apps .focusable"));
  }

  function saveOrder() {
    writeList(ORDER_KEY, Array.prototype.map.call(document.querySelectorAll("#home-view [data-app-id]"), function (tile) {
      return tile.getAttribute("data-app-id");
    }));
  }

  function startHold(tile, fromPointer) {
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(function () {
      holdTimer = null;
      suppressClick = fromPointer;
      awaitingRelease = !fromPointer;
      startEditing(tile);
    }, HOLD_MS);
  }

  function startEditing(tile) {
    editing = tile;
    tile.classList.add("is-editing");
    setFocus(tile);
    document.getElementById("edit-hint").hidden = false;
  }

  function stopEditing() {
    if (!editing) { return; }
    editing.classList.remove("is-editing");
    editing = null;
    document.getElementById("edit-hint").hidden = true;
  }

  function moveEditing(step) {
    var target = step > 0 ? editing.nextElementSibling : editing.previousElementSibling;
    if (!target || !target.getAttribute("data-app-id")) { return; }
    editing.parentNode.insertBefore(editing, step > 0 ? target.nextElementSibling : target);
    saveOrder();
    setFocus(editing);
  }

  // Moves the picked-up tile between the daily apps and the Tools row.
  function switchRow() {
    var tile = editing;
    var id = tile.getAttribute("data-app-id");
    var toolIds = readList(TOOLS_KEY, DEFAULT_TOOLS).filter(function (toolId) { return toolId !== id; });
    var toTools = tile.parentNode.id === "apps";
    if (toTools) {
      toolIds.push(id);
      document.getElementById("tools").insertBefore(tile, document.getElementById("hidden-tile"));
    } else {
      document.getElementById("apps").appendChild(tile);
    }
    writeList(TOOLS_KEY, toolIds);
    document.getElementById("tools-section").hidden = !document.getElementById("tools").children.length;
    saveOrder();
    setFocus(tile);
  }

  function hideEditing() {
    var tile = editing;
    var next = tile.nextElementSibling && tile.nextElementSibling.getAttribute("data-app-id") ? tile.nextElementSibling : tile.previousElementSibling;
    stopEditing();
    writeList(HIDDEN_KEY, readList(HIDDEN_KEY, DEFAULT_HIDDEN).concat([tile.getAttribute("data-app-id")]));
    tile.parentNode.removeChild(tile);
    saveOrder();
    renderApps(next ? next.getAttribute("data-app-id") : null);
  }

  function editKey(event) {
    event.preventDefault();
    if (event.keyCode === KEY.LEFT || event.keyCode === KEY.RIGHT) { moveEditing(event.keyCode === KEY.RIGHT ? 1 : -1); }
    else if (event.keyCode === KEY.UP) { hideEditing(); }
    else if (event.keyCode === KEY.DOWN) { switchRow(); }
    else if (event.keyCode === KEY.ENTER && !awaitingRelease) { stopEditing(); }
    else if (event.keyCode === KEY.BACK) { stopEditing(); }
  }

  function setFocus(element) {
    if (selected) { selected.classList.remove("is-focused"); }
    selected = element;
    if (selected) {
      selected.classList.add("is-focused");
      if (selected.scrollIntoView) { selected.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    }
  }

  function focusables() {
    return Array.prototype.slice.call(document.querySelectorAll("#" + view + "-view .focusable"));
  }

  // The tile in a grid row (offsetTop, which ignores the scale on focused tiles) closest to the
  // selected tile horizontally. Screen centres are used because the rows may be in different grids.
  function closestInRow(grid, top) {
    var from = selected.getBoundingClientRect();
    var centre = from.left + from.width / 2;
    var closest = null;
    var closestDistance = Infinity;
    Array.prototype.forEach.call(grid.querySelectorAll(".focusable"), function (tile) {
      if (tile.offsetTop !== top) { return; }
      var rect = tile.getBoundingClientRect();
      var distance = Math.abs(rect.left + rect.width / 2 - centre);
      if (distance < closestDistance) { closestDistance = distance; closest = tile; }
    });
    return closest;
  }

  // Left/Right on an app tile move within its row, wrapping from the end of the row to its start and
  // back. Up/Down move to the closest tile in the next row: in the same group, or else in the nearest
  // row of the next group (Tools below the apps). Otherwise the nearest element in that direction on
  // screen is picked, which is how Up from the top row reaches the cog.
  function neighbor(direction) {
    var items = focusables();
    if (!items.length) { return null; }
    if (!selected || items.indexOf(selected) < 0) { return items[0]; }

    var grid = selected.parentNode;
    if ((direction === KEY.LEFT || direction === KEY.RIGHT) && grid.classList.contains("grid")) {
      // offsetTop ignores the scale on focused and picked-up tiles.
      var tiles = Array.prototype.filter.call(grid.querySelectorAll(".focusable"), function (tile) {
        return tile.offsetTop === selected.offsetTop;
      });
      var index = tiles.indexOf(selected) + (direction === KEY.RIGHT ? 1 : -1);
      return tiles[(index + tiles.length) % tiles.length];
    }
    if ((direction === KEY.UP || direction === KEY.DOWN) && grid.classList.contains("grid")) {
      var below = direction === KEY.DOWN;
      // The next row in the same group, or else the nearest row of the next group in that direction.
      var rowTops = Array.prototype.map.call(grid.querySelectorAll(".focusable"), function (tile) { return tile.offsetTop; })
        .filter(function (top) { return below ? top > selected.offsetTop : top < selected.offsetTop; });
      var target = rowTops.length ? closestInRow(grid, below ? Math.min.apply(null, rowTops) : Math.max.apply(null, rowTops)) : null;
      if (!target) {
        var grids = Array.prototype.filter.call(document.querySelectorAll("#" + view + "-view .grid"), function (other) {
          return other.querySelector(".focusable");
        });
        var next = grids[grids.indexOf(grid) + (below ? 1 : -1)];
        if (next) {
          var tops = Array.prototype.map.call(next.querySelectorAll(".focusable"), function (tile) { return tile.offsetTop; });
          target = closestInRow(next, below ? Math.min.apply(null, tops) : Math.max.apply(null, tops));
        }
      }
      if (target) { return target; }
    }

    var from = selected.getBoundingClientRect();
    var fx = from.left + from.width / 2;
    var fy = from.top + from.height / 2;
    var best = null;
    var bestScore = Infinity;

    items.forEach(function (item) {
      if (item === selected) { return; }
      var rect = item.getBoundingClientRect();
      var dx = rect.left + rect.width / 2 - fx;
      var dy = rect.top + rect.height / 2 - fy;
      var forward = direction === KEY.RIGHT ? dx : direction === KEY.LEFT ? -dx : direction === KEY.DOWN ? dy : -dy;
      var cross = direction === KEY.RIGHT || direction === KEY.LEFT ? Math.abs(dy) : Math.abs(dx);
      if (forward <= 2) { return; }
      var score = forward + cross * 2.7;
      if (score < bestScore) { bestScore = score; best = item; }
    });
    return best;
  }

  // Home, Hidden apps and Settings are views of this page, so switching needs no app launch.
  function showView(name) {
    if (name === view) { return; }
    var previous = view;
    view = name;
    ["home", "hidden", "settings", "remote"].forEach(function (id) {
      document.getElementById(id + "-view").hidden = id !== name;
    });
    if (previous === "settings" && name !== "remote") { MinimalSettings.close(); }
    if (previous === "remote") { RemoteButtons.close(); }
    if (name === "settings") { MinimalSettings.open(); }
    else if (name === "remote") { RemoteButtons.open(installed); }
    else if (name === "hidden") {
      renderHidden();
      setFocus(document.querySelector("#hidden-apps .focusable"));
    } else {
      var back = previous === "hidden" ? document.getElementById("hidden-tile") : document.getElementById("settings");
      setFocus(back || document.querySelector("#apps .focusable"));
    }
  }

  function preloadSettings() {
    if (!document.hidden) {
      window.setTimeout(function () { MinimalSettings.preload(); RemoteButtons.load(); }, SETTINGS_PRELOAD_DELAY_MS);
      return;
    }
    // webOS reloads Home in the background; read the settings only once Home is actually shown.
    document.addEventListener("visibilitychange", function onVisible() {
      if (document.hidden) { return; }
      document.removeEventListener("visibilitychange", onVisible);
      window.setTimeout(function () { MinimalSettings.preload(); RemoteButtons.load(); }, SETTINGS_PRELOAD_DELAY_MS);
    });
  }

  function initNavigation() {
    document.addEventListener("keydown", function (event) {
      if (view === "settings") {
        if (MinimalSettings.handleKey(event) === "leave") { showView("home"); }
        return;
      }
      if (view === "remote") {
        if (RemoteButtons.handleKey(event) === "leave") { showView("settings"); }
        return;
      }
      if (editing) { editKey(event); return; }
      if (event.keyCode === KEY.ENTER) {
        // On Home a short press opens the tile when OK is released; holding it picks the tile up instead.
        event.preventDefault();
        if (event.repeat || holdTimer) { return; }
        if (view === "home" && selected && selected.getAttribute("data-app-id")) { startHold(selected, false); }
        else if (selected) { selected.click(); }
        return;
      }
      if (event.keyCode === KEY.BACK) {
        // Home is where Back leads; closing it only made webOS start it again.
        event.preventDefault();
        if (view === "hidden") { showView("home"); }
        return;
      }
      if ([KEY.LEFT, KEY.UP, KEY.RIGHT, KEY.DOWN].indexOf(event.keyCode) !== -1) {
        event.preventDefault();
        var next = neighbor(event.keyCode);
        if (next) { setFocus(next); }
      }
    });

    document.addEventListener("keyup", function (event) {
      if (event.keyCode === KEY.ENTER) { awaitingRelease = false; }
      if (view !== "home" || event.keyCode !== KEY.ENTER || !holdTimer) { return; }
      event.preventDefault();
      window.clearTimeout(holdTimer);
      holdTimer = null;
      if (selected) { selected.click(); }
    });
    document.addEventListener("mouseup", function () {
      if (view === "home" && holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
    });

    // The pointer moves the same focus as the arrows. There is no CSS :hover highlight, because the
    // browser keeps :hover on the last pointed-at tile after an arrow press hides the pointer.
    document.addEventListener("mousemove", function (event) {
      if (view === "settings") {
        MinimalSettings.handlePointer(event);
        return;
      }
      if (view === "remote") {
        RemoteButtons.handlePointer(event);
        return;
      }
      if (editing) { return; }
      if (Math.abs(event.clientX - pointerX) + Math.abs(event.clientY - pointerY) > 8) {
        pointerX = event.clientX;
        pointerY = event.clientY;
        var target = event.target.closest && event.target.closest(".focusable");
        if (target && target !== selected) { setFocus(target); }
      }
    });
  }

  function loadApps(attempt) {
    return rootLuna("luna://com.webos.applicationManager/listApps", {}).then(function (result) {
      if (!result.apps) { throw new Error("App list unavailable"); }
      showApps(result.apps);
    }).catch(function (error) {
      if (attempt >= APP_LIST_RETRY_MS.length) { throw error; }
      return new Promise(function (resolve) { window.setTimeout(resolve, APP_LIST_RETRY_MS[attempt]); })
        .then(function () { return loadApps(attempt + 1); });
    });
  }

  function init() {
    initNavigation();
    document.getElementById("settings").addEventListener("click", function () { showView("settings"); });
    document.getElementById("remoteButtons").addEventListener("click", function () { showView("remote"); });
    // The Home key activates Home again; it should always lead to the app grid.
    document.addEventListener("webOSRelaunch", function () { stopEditing(); showView("home"); });
    tickClock();
    window.setInterval(tickClock, 1000);
    // Remote buttons interrupted by a reload or restart leaves the real bindings aside; put them back.
    RemoteButtons.restore();

    rootExec("test -e '" + APP_DIR + "/hack' || ln -s / '" + APP_DIR + "/hack'")
      .catch(function () {})
      .then(function () { return loadApps(0); })
      .then(preloadSettings)
      .catch(function () {
        var status = document.getElementById("status");
        status.textContent = "Could not load installed apps";
        status.classList.add("visible");
        notify("Minimal Home could not read the app list");
      });
  }

  document.addEventListener("DOMContentLoaded", init);
}());
