(function () {
  "use strict";

  var APP_ID = "org.webosbrew.minimalhome";
  var APP_DIR = "/media/developer/apps/usr/palm/applications/" + APP_ID;
  var HIDDEN_APP_IDS = {
    "amazon.alexa.view": true,
    "com.webos.app.camera": true,
    "com.webos.app.homeconnect": true,
    "com.webos.app.lgchannels": true,
    "com.webos.app.lifeonscreen": true,
    "com.webos.app.mediadiscovery": true,
    "com.webos.app.sportsteamsettings": true
  };
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
  var view = "home";
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

  function makeTile(app) {
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
    button.addEventListener("click", function () { launch(app.id); });
    return button;
  }

  function showApps(apps) {
    var box = document.getElementById("apps");
    var status = document.getElementById("status");
    var visible = apps.filter(function (app) {
      return app && app.visible !== false && app.id !== APP_ID &&
        app.id !== "com.webos.app.home" && !HIDDEN_APP_IDS[app.id];
    });

    var rank = {};
    PREFERRED_APP_ORDER.forEach(function (id, index) { rank[id] = index; });
    visible = visible.map(function (app, index) {
      return { app: app, originalIndex: index };
    }).sort(function (left, right) {
      var leftRank = Object.prototype.hasOwnProperty.call(rank, left.app.id) ? rank[left.app.id] : PREFERRED_APP_ORDER.length;
      var rightRank = Object.prototype.hasOwnProperty.call(rank, right.app.id) ? rank[right.app.id] : PREFERRED_APP_ORDER.length;
      return leftRank === rightRank ? left.originalIndex - right.originalIndex : leftRank - rightRank;
    }).map(function (entry) { return entry.app; });

    visible.forEach(function (app) { box.appendChild(makeTile(app)); });
    status.classList.toggle("visible", visible.length === 0);
    status.textContent = visible.length ? "" : "No apps found";
    if (visible.length) { setFocus(box.querySelector(".focusable")); }
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
    return Array.prototype.slice.call(document.querySelectorAll("#home-view .focusable"));
  }

  function neighbor(direction) {
    var items = focusables();
    if (!items.length) { return null; }
    if (!selected || items.indexOf(selected) < 0) { return items[0]; }

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

  // Home and Settings are two views of this page, so opening Settings needs no app launch.
  function showView(name) {
    if (name === view) { return; }
    view = name;
    document.getElementById("home-view").hidden = name !== "home";
    document.getElementById("settings-view").hidden = name !== "settings";
    if (name === "settings") { MinimalSettings.open(); }
    else {
      MinimalSettings.close();
      setFocus(document.getElementById("settings"));
    }
  }

  function preloadSettings() {
    if (!document.hidden) {
      window.setTimeout(MinimalSettings.preload, SETTINGS_PRELOAD_DELAY_MS);
      return;
    }
    // webOS reloads Home in the background; read the settings only once Home is actually shown.
    document.addEventListener("visibilitychange", function onVisible() {
      if (document.hidden) { return; }
      document.removeEventListener("visibilitychange", onVisible);
      window.setTimeout(MinimalSettings.preload, SETTINGS_PRELOAD_DELAY_MS);
    });
  }

  function initNavigation() {
    document.addEventListener("keydown", function (event) {
      if (view === "settings") {
        if (MinimalSettings.handleKey(event) === "leave") { showView("home"); }
        return;
      }
      if (event.keyCode === KEY.ENTER) {
        event.preventDefault();
        if (selected) { selected.click(); }
        return;
      }
      if (event.keyCode === KEY.BACK) {
        // Home is where Back leads; closing it only made webOS start it again.
        event.preventDefault();
        return;
      }
      if ([KEY.LEFT, KEY.UP, KEY.RIGHT, KEY.DOWN].indexOf(event.keyCode) !== -1) {
        event.preventDefault();
        setFocus(neighbor(event.keyCode));
      }
    });

    // The pointer moves the same focus as the arrows. There is no CSS :hover highlight, because the
    // browser keeps :hover on the last pointed-at tile after an arrow press hides the pointer.
    document.addEventListener("mousemove", function (event) {
      if (view === "settings") {
        MinimalSettings.handlePointer(event);
        return;
      }
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
    // The Home key activates Home again; it should always lead to the app grid.
    document.addEventListener("webOSRelaunch", function () { showView("home"); });

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
