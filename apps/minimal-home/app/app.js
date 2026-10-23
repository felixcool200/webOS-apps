// Minimal Home: the app grid with its arranging mode, and the page's views. It runs Home itself and
// hands the other views to their modules (see VIEWS). It is the last script, so the other modules are
// there when it starts.
(function () {
  "use strict";

  var APP_ID = WebOS.HOME_ID;
  var APP_DIR = "/media/developer/apps/usr/palm/applications/" + APP_ID;
  // Starting contents of the hidden list and the Tools row. Arranging changes them, and the result is
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
  // The views of this page (<main id="NAME-view">), where Back leads from each, the element on Home
  // that gets the focus on the way back, and the module that runs it. A module has open(), close(),
  // handleKey(event) (returning "leave" for Back) and handlePointer(event), and gets the host below
  // once at start.
  var VIEWS = {
    home: { back: null },
    sources: { back: "home", from: "sources-button", module: Sources },
    settings: { back: "home", from: "settings", module: MinimalSettings },
    remote: { back: "settings", from: "settings", module: RemoteButtons }
  };
  var view = "home";
  var installed = [];
  // Arranging: the Hidden row shows, OK picks an app up and puts it down, and Back finishes. The app
  // picked up (its id) moves with the arrows.
  var arranging = false;
  var pickedId = null;
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
      return HomeLogic.parseList(window.localStorage.getItem(key), fallback);
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
      if (arranging) {
        if (pickedId === app.id) { putDown(); } else { pickUp(app.id); }
        return;
      }
      launch(app.id);
    });
    tile.addEventListener("mousedown", function () {
      if (!arranging) { startHold(tile, true); }
    });
    return tile;
  }

  // Ends the Tools row while any apps are hidden, and starts arranging in the Hidden row.
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
    button.addEventListener("click", function () {
      startArranging();
      setFocus(document.querySelector("#hidden-row .focusable"));
    });
    return button;
  }

  function showApps(apps) {
    installed = HomeLogic.sortInstalled(apps, PREFERRED_APP_ORDER, [APP_ID, "com.webos.app.home"]);
    renderApps(null);
  }

  // Draws the rows in the saved order: the apps, Tools, and while arranging the Hidden row (otherwise a
  // Hidden apps tile ends Tools). The app picked up stays picked up.
  function renderApps(focusId) {
    var apps = document.getElementById("apps");
    var tools = document.getElementById("tools");
    var hiddenRow = document.getElementById("hidden-row");
    var status = document.getElementById("status");
    var hidden = readList(HIDDEN_KEY, DEFAULT_HIDDEN);
    var rows = HomeLogic.arrange(installed, hidden, readList(TOOLS_KEY, DEFAULT_TOOLS), readList(ORDER_KEY, []));

    apps.textContent = "";
    tools.textContent = "";
    hiddenRow.textContent = "";
    rows.apps.forEach(function (app) { apps.appendChild(makeHomeTile(app)); });
    rows.tools.forEach(function (app) { tools.appendChild(makeHomeTile(app)); });
    if (arranging) { HomeLogic.hiddenApps(installed, hidden).forEach(function (app) { hiddenRow.appendChild(makeHomeTile(app)); }); }
    else if (rows.hiddenCount) { tools.appendChild(makeHiddenTile(rows.hiddenCount)); }
    document.getElementById("tools-section").hidden = !tools.children.length && !arranging;
    document.getElementById("hidden-section").hidden = !arranging;
    document.getElementById("hidden-empty").hidden = !!hiddenRow.children.length;
    var picked = pickedId && document.querySelector('#home-view [data-app-id="' + pickedId + '"]');
    if (picked) { picked.classList.add("is-editing"); }
    status.classList.toggle("visible", installed.length === 0);
    status.textContent = installed.length ? "" : "No apps found";
    if (view !== "home") { return; }
    var focus = (focusId || pickedId) && document.querySelector('#home-view [data-app-id="' + (focusId || pickedId) + '"]');
    setFocus(focus || document.querySelector("#apps .focusable") || document.querySelector("#home-view .focusable"));
  }

  // The rows as shown, as lists of app ids.
  function currentLayout() {
    function ids(rowId) {
      return Array.prototype.map.call(document.querySelectorAll("#" + rowId + " [data-app-id]"), function (tile) {
        return tile.getAttribute("data-app-id");
      });
    }
    return { apps: ids("apps"), tools: ids("tools"), hidden: ids("hidden-row") };
  }

  function startHold(tile, fromPointer) {
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(function () {
      holdTimer = null;
      suppressClick = fromPointer;
      awaitingRelease = !fromPointer;
      startArranging();
      pickUp(tile.getAttribute("data-app-id"));
    }, HOLD_MS);
  }

  function showEditHint() {
    var hint = document.getElementById("edit-hint");
    hint.hidden = !arranging;
    hint.textContent = pickedId ? "Arrows move it · Down to Hidden hides it · OK puts it down" :
      "OK picks an app up · Back finishes";
  }

  function startArranging() {
    if (arranging) { return; }
    arranging = true;
    renderApps(selected && selected.getAttribute("data-app-id"));
    showEditHint();
  }

  function stopArranging() {
    if (!arranging) { return; }
    arranging = false;
    var focusId = pickedId || (selected && selected.getAttribute("data-app-id"));
    pickedId = null;
    renderApps(focusId);
    showEditHint();
  }

  function pickUp(id) {
    pickedId = id;
    renderApps(id);
    showEditHint();
  }

  function putDown() {
    var id = pickedId;
    pickedId = null;
    renderApps(id);
    showEditHint();
  }

  // Moves the app picked up one step and saves where every app now is.
  function movePicked(direction) {
    var layout = currentLayout();
    var next = HomeLogic.moveInLayout(layout, pickedId, direction);
    if (next === layout) { return; }
    var lists = HomeLogic.savedLists(next, readList(TOOLS_KEY, DEFAULT_TOOLS), readList(HIDDEN_KEY, DEFAULT_HIDDEN),
      installed.map(function (app) { return app.id; }));
    writeList(ORDER_KEY, lists.order);
    writeList(TOOLS_KEY, lists.tools);
    writeList(HIDDEN_KEY, lists.hidden);
    renderApps(pickedId);
  }

  // Keys while arranging. Returns true when the key was used.
  function arrangeKey(event) {
    var key = event.keyCode;
    var directions = {};
    directions[KEY.LEFT] = "left";
    directions[KEY.RIGHT] = "right";
    directions[KEY.UP] = "up";
    directions[KEY.DOWN] = "down";
    if (pickedId) {
      event.preventDefault();
      if (directions[key]) { movePicked(directions[key]); }
      else if ((key === KEY.ENTER && !awaitingRelease && !event.repeat) || key === KEY.BACK) { putDown(); }
      return true;
    }
    if (key === KEY.BACK) {
      event.preventDefault();
      stopArranging();
      return true;
    }
    if (key === KEY.ENTER && selected && selected.getAttribute("data-app-id")) {
      event.preventDefault();
      if (!event.repeat) { pickUp(selected.getAttribute("data-app-id")); }
      return true;
    }
    if (key === KEY.ENTER) { stopArranging(); }
    return false;
  }

  function setFocus(element) {
    selected = UI.moveFocus(selected, element);
    if (selected && selected.scrollIntoView) { selected.scrollIntoView({ block: "nearest", inline: "nearest" }); }
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

  // The views are parts of this page, so switching needs no app launch.
  function showView(name) {
    if (name === view || !VIEWS[name]) { return; }
    var previous = view;
    view = name;
    Object.keys(VIEWS).forEach(function (id) {
      document.getElementById(id + "-view").hidden = id !== name;
    });
    if (VIEWS[previous].module) { VIEWS[previous].module.close(); }
    if (VIEWS[name].module) { VIEWS[name].module.open(); }
    else {
      setFocus(document.getElementById(VIEWS[previous].from) || document.querySelector("#apps .focusable"));
    }
  }

  // The view Home was launched or relaunched for, such as {"view": "sources"} from a remote button.
  function viewFromParams(params) {
    if (typeof params === "string") {
      try { params = JSON.parse(params); } catch (error) { params = null; }
    }
    var name = params && params.view;
    return name && VIEWS[name] ? name : "home";
  }

  // Reads what the Settings and Remote buttons views show. Reading the button bindings also puts them
  // back if a remote test was cut short by a reload.
  function preloadViews() {
    function preload() {
      window.setTimeout(function () { MinimalSettings.preload(); RemoteButtons.load(); Sources.preload(); }, SETTINGS_PRELOAD_DELAY_MS);
    }
    if (!document.hidden) {
      preload();
      return;
    }
    // webOS reloads Home in the background; read the settings only once Home is actually shown.
    document.addEventListener("visibilitychange", function onVisible() {
      if (document.hidden) { return; }
      document.removeEventListener("visibilitychange", onVisible);
      preload();
    });
  }

  function initNavigation() {
    document.addEventListener("keydown", function (event) {
      var module = VIEWS[view].module;
      if (module) {
        if (module.handleKey(event) === "leave") { showView(VIEWS[view].back); }
        return;
      }
      if (arranging && arrangeKey(event)) { return; }
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
        if (VIEWS[view].back) { showView(VIEWS[view].back); }
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
      // The click that would clear it comes right after mouseup, and only on the same tile.
      if (suppressClick) { window.setTimeout(function () { suppressClick = false; }, 0); }
    });

    // The pointer moves the same focus as the arrows. There is no CSS :hover highlight, because the
    // browser keeps :hover on the last pointed-at tile after an arrow press hides the pointer.
    document.addEventListener("mousemove", function (event) {
      if (VIEWS[view].module) {
        VIEWS[view].module.handlePointer(event);
        return;
      }
      if (pickedId) { return; }
      if (Math.abs(event.clientX - pointerX) + Math.abs(event.clientY - pointerY) > 8) {
        pointerX = event.clientX;
        pointerY = event.clientY;
        var target = event.target.closest && event.target.closest(".focusable");
        if (target && target !== selected) { setFocus(target); }
      }
    });
  }

  function loadApps() {
    return WebOS.retry(function () {
      return rootLuna("luna://com.webos.applicationManager/listApps", {}).then(function (result) {
        if (!result.apps) { throw new Error("App list unavailable"); }
        showApps(result.apps);
      });
    }, APP_LIST_RETRY_MS);
  }

  function init() {
    initNavigation();
    document.getElementById("settings").addEventListener("click", function () { showView("settings"); });
    document.getElementById("sources-button").addEventListener("click", function () { showView("sources"); });
    var host = { navigate: showView, apps: function () { return installed; }, setLinkValue: MinimalSettings.setLinkValue };
    Object.keys(VIEWS).forEach(function (name) {
      if (VIEWS[name].module) { VIEWS[name].module.attach(host); }
    });
    // The Home key activates Home again and leads to the app grid; a remote button bound to a view
    // (Open Sources) relaunches it with that view.
    document.addEventListener("webOSRelaunch", function (event) { stopArranging(); showView(viewFromParams(event.detail)); });
    var system = window.webOSSystem || window.PalmSystem;
    showView(viewFromParams(system && system.launchParams));
    tickClock();
    window.setInterval(tickClock, 1000);

    // App icons are read through a link to / inside the app's folder.
    WebOS.rootShell("test -e '" + APP_DIR + "/hack' || ln -s / '" + APP_DIR + "/hack'")
      .catch(function (error) { console.warn("Could not link the app icons: " + error.message); })
      .then(loadApps)
      .catch(function () {
        var status = document.getElementById("status");
        status.textContent = "Could not load installed apps";
        status.classList.add("visible");
        notify("Minimal Home could not read the app list");
      })
      .then(preloadViews);
  }

  document.addEventListener("DOMContentLoaded", init);
}());
