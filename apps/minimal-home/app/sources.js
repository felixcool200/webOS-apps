// The Sources view inside Minimal Home: Live TV and the TV's inputs as tiles, and OK switches to one
// the way LG's input picker does, by launching the input's app. Home shows #sources-view and routes
// keys and pointer movement here. The rules live in sources-logic.js.
var Sources = (function () {
  "use strict";

  var KEY = WebOS.KEY;
  var HINT = "OK switches to the input · Back returns Home";
  // Tiles per row, as in the app grid (.grid in style.css).
  var COLUMNS = 8;
  var sources = [];
  var selected = null;
  // The input selected last, so the focus stays on it when the list is read again.
  var lastId = null;

  function setHint(message, type) {
    var hint = document.getElementById("sources-hint");
    hint.textContent = message || HINT;
    hint.classList.toggle("error", type === "error");
  }

  function tiles() {
    return Array.prototype.slice.call(document.querySelectorAll("#sources .focusable"));
  }

  function setFocus(element) {
    if (!element) { return; }
    selected = UI.moveFocus(selected, element);
    lastId = element.getAttribute("data-source");
  }

  // Launches the input's app, as LG's input picker does.
  function switchTo(source) {
    setHint("Switching to " + source.label + "…");
    WebOS.rootLuna("luna://com.webos.service.applicationManager/launch", { id: source.appId, params: {} })
      .then(function () { setHint(""); })
      .catch(function (error) { setHint("Could not switch to " + source.label + ": " + error.message, "error"); });
  }

  function makeTile(source) {
    var tile = document.createElement("button");
    tile.type = "button";
    tile.className = "app source focusable" + (source.state === "empty" ? " is-empty" : "") + (source.last ? " is-last" : "");
    tile.setAttribute("data-source", source.id);
    var icon = document.createElement("img");
    icon.className = "app-icon source-icon";
    icon.alt = "";
    // LG's icons are read through the link to / that Home also uses for app icons.
    icon.src = "hack" + source.icon;
    icon.onerror = function () { icon.style.visibility = "hidden"; };
    var name = document.createElement("span");
    name.className = "app-name";
    name.textContent = source.label;
    var state = document.createElement("span");
    state.className = "source-state";
    state.textContent = source.stateText;
    tile.appendChild(icon);
    tile.appendChild(name);
    tile.appendChild(state);
    tile.addEventListener("click", function () {
      setFocus(tile);
      switchTo(source);
    });
    return tile;
  }

  function render() {
    var box = document.getElementById("sources");
    box.textContent = "";
    sources.forEach(function (source) { box.appendChild(makeTile(source)); });
    var last = sources.filter(function (source) { return source.last; })[0];
    var focusId = lastId || (last && last.id);
    selected = null;
    setFocus(box.querySelector('[data-source="' + focusId + '"]') || box.querySelector(".focusable"));
  }

  // Reads the inputs and shows them. The ones shown stay if reading fails.
  function load() {
    return Promise.all([
      WebOS.rootLuna("luna://com.webos.service.eim/getAllInputStatus", {}),
      WebOS.rootLuna("luna://com.webos.service.eim/getLastInput", {}).catch(function () { return {}; })
    ]).then(function (results) {
      sources = SourcesLogic.list(results[0], results[1].lastSourceAppId);
      render();
    }).catch(function (error) {
      setHint("Could not read the inputs: " + error.message, "error");
    });
  }

  // Returns "leave" when Back should take the user back Home.
  function handleKey(event) {
    event.preventDefault();
    var key = event.keyCode;
    if (key === KEY.BACK) { return "leave"; }
    var list = tiles();
    var index = list.indexOf(selected);
    if (key === KEY.ENTER) {
      if (selected && !event.repeat) { selected.click(); }
    } else if (key === KEY.LEFT || key === KEY.RIGHT) {
      setFocus(list[(index + (key === KEY.RIGHT ? 1 : -1) + list.length) % list.length]);
    } else if (key === KEY.UP || key === KEY.DOWN) {
      setFocus(list[index + (key === KEY.DOWN ? COLUMNS : -COLUMNS)]);
    }
    return null;
  }

  function handlePointer(event) {
    var element = event.target.closest && event.target.closest("#sources .focusable");
    if (element && element !== selected) { setFocus(element); }
  }

  function attach() {}

  // Reads the inputs in the background so they are already shown when the view opens.
  function preload() {
    return load();
  }

  // Shows the inputs read before straight away, then the ones on the TV now.
  function open() {
    setHint("");
    lastId = null;
    render();
    load();
  }

  function close() {}

  return { attach: attach, preload: preload, open: open, close: close, handleKey: handleKey, handlePointer: handlePointer };
}());
