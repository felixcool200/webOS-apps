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

  // Scrolls the element's parent just enough to show all of the element, and `margin` pixels around
  // it, such as room for a focus ring (offsets are relative to the parent, which must be its
  // scrolling container).
  function keepInView(element, margin) {
    var list = element.parentNode;
    var top = element.offsetTop - (margin || 0);
    var bottom = element.offsetTop + element.offsetHeight + (margin || 0);
    if (top < list.scrollTop) { list.scrollTop = top; }
    else if (bottom > list.scrollTop + list.clientHeight) { list.scrollTop = bottom - list.clientHeight; }
  }

  // How many tiles a CSS grid shows per line (Infinity when it has no columns, such as while hidden).
  function columnsOf(grid) {
    var tracks = window.getComputedStyle(grid).gridTemplateColumns;
    return tracks && tracks !== "none" ? tracks.split(" ").length : Infinity;
  }

  return { setStatus: setStatus, moveFocus: moveFocus, keepInView: keepInView, columnsOf: columnsOf };
}());
