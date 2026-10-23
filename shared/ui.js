// Shared by every app: the status line and the focused element. The build copies it into each app as
// ui.js, which index.html loads before the app's own scripts.
var UI = (function () {
  "use strict";

  // Shows a message in the status element with that id; type "ok" or "error" colours it.
  function setStatus(id, message, type) {
    var box = document.getElementById(id);
    box.textContent = message;
    box.classList.toggle("ok", type === "ok");
    box.classList.toggle("error", type === "error");
  }

  // Moves the is-focused highlight from one element to another. Returns the newly focused element.
  function moveFocus(from, to) {
    if (from) { from.classList.remove("is-focused"); }
    if (to) { to.classList.add("is-focused"); }
    return to;
  }

  // Scrolls the element's parent just enough to show all of the element (offsets are relative to the
  // parent, which must be its scrolling container).
  function keepInView(element) {
    var list = element.parentNode;
    var bottom = element.offsetTop + element.offsetHeight;
    if (element.offsetTop < list.scrollTop) { list.scrollTop = element.offsetTop; }
    else if (bottom > list.scrollTop + list.clientHeight) { list.scrollTop = bottom - list.clientHeight; }
  }

  return { setStatus: setStatus, moveFocus: moveFocus, keepInView: keepInView };
}());
