// The power menu on Home: the button next to Settings opens a popup to turn the TV off, as the
// remote's power button does (with Quick Start+ on that is standby), or restart it fully, as LG
// Settings restarts it. app.js routes keys and pointer movement here while the popup is open.
var PowerMenu = (function () {
  "use strict";

  var KEY = WebOS.KEY;
  var POWER = "luna://com.webos.service.tvpower/";
  // What each choice calls: powerOff with the reason the power button gives, and the reboot LG
  // Settings runs.
  var ACTIONS = {
    off: { uri: POWER + "power/powerOff", payload: { reason: "remoteKey" }, busy: "Turning off…", failed: "Could not turn off" },
    restart: { uri: POWER + "power2/reboot", payload: { reason: "micomReset" }, busy: "Restarting…", failed: "Could not restart" }
  };
  var menu = null;
  var selected = null;
  var onClose = null;

  function setStatus(message, type) {
    UI.setStatus("power-status", message, type);
  }

  function setFocus(node) {
    if (node) { selected = UI.moveFocus(selected, node); }
  }

  function isOpen() {
    return !!menu && !menu.hidden;
  }

  // Opens the popup with the focus on Cancel; `done` runs when it closes.
  function open(done) {
    onClose = done;
    menu.hidden = false;
    setStatus("");
    setFocus(menu.querySelector('[data-power="cancel"]'));
  }

  function close() {
    if (!isOpen()) { return; }
    menu.hidden = true;
    selected = UI.moveFocus(selected, null);
    if (onClose) { onClose(); }
  }

  function run(choice) {
    if (choice === "cancel") {
      close();
      return;
    }
    var action = ACTIONS[choice];
    setStatus(action.busy);
    WebOS.rootLuna(action.uri, action.payload).catch(function (error) {
      setStatus(action.failed + ": " + error.message, "error");
    });
  }

  function handleKey(event) {
    event.preventDefault();
    if (event.keyCode === KEY.BACK) {
      close();
    } else if (event.keyCode === KEY.ENTER) {
      if (!event.repeat && selected) { run(selected.getAttribute("data-power")); }
    } else if (event.keyCode === KEY.LEFT || event.keyCode === KEY.RIGHT) {
      var choices = Array.prototype.slice.call(menu.querySelectorAll(".focusable"));
      var at = choices.indexOf(selected) + (event.keyCode === KEY.RIGHT ? 1 : -1);
      setFocus(choices[Math.max(0, Math.min(choices.length - 1, at))]);
    }
  }

  // The pointer moves the same focus as the arrows.
  function handlePointer(event) {
    var node = event.target.closest && event.target.closest("#power-menu .focusable");
    if (node && node !== selected) { setFocus(node); }
  }

  function attach() {
    menu = document.getElementById("power-menu");
    Array.prototype.forEach.call(menu.querySelectorAll(".focusable"), function (node) {
      node.addEventListener("click", function () { run(node.getAttribute("data-power")); });
    });
  }

  return { attach: attach, open: open, close: close, isOpen: isOpen, handleKey: handleKey, handlePointer: handlePointer };
}());
