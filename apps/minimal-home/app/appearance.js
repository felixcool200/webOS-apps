// The Appearance view inside Minimal Home: the colour theme of every app in this repo (shared/theme.js).
// Theme steps through the presets and your own themes, shown as cards beside the rows. Accent and
// Background change the theme; for a preset that makes a theme of your own from it
// (AppearanceLogic.withChange). Every change shows at once and is shared with the other apps
// SHARE_DELAY_MS after the last one. Home shows #appearance-view and routes keys and pointer movement here.
var Appearance = (function () {
  "use strict";

  var KEY = WebOS.KEY;
  var CUSTOM_KEY = "theme.custom";
  var SHARE_DELAY_MS = 500;
  var host = null;
  // Your own themes, after the presets in the Theme row.
  var customs = [];
  var theme = null;
  var selected = null;
  // The row whose value Left/Right change, entered with OK as in Settings.
  var editing = null;
  var confirmingDelete = false;
  var shareTimer = null;

  function $(id) { return document.getElementById(id); }

  function setStatus(message, type) {
    UI.setStatus("appearance-status", message, type);
  }

  function choices() {
    return Theme.PRESETS.concat(customs);
  }

  function isOwn(candidate) {
    return customs.some(function (own) { return own.id === candidate.id; });
  }

  function rows() {
    return Array.prototype.filter.call(document.querySelectorAll("#appearance-list .setting"), function (row) { return !row.hidden; });
  }

  function accentName(color) {
    var accent = Theme.ACCENTS.filter(function (entry) { return entry.color === color; })[0];
    return accent ? accent.name : color;
  }

  // A small picture of a theme: its background with both glows, and its accent as a focus ring.
  function themeCard(choice) {
    var background = Theme.backgroundOf(choice.background);
    var card = document.createElement("div");
    card.className = "theme-card" + (choice.id === theme.id ? " is-current" : "");
    card.style.background = "radial-gradient(90% 90% at 0% 0%, " + background.glowA + ", transparent 70%), " +
      "radial-gradient(80% 90% at 100% 100%, " + background.glowB + ", transparent 72%), " + background.bg;
    card.style.setProperty("--card-accent", choice.accent);
    var sample = document.createElement("span");
    sample.className = "theme-sample";
    var name = document.createElement("span");
    name.className = "theme-name";
    name.textContent = choice.name;
    card.appendChild(sample);
    card.appendChild(name);
    return card;
  }

  function show() {
    $("appearance-theme").querySelector(".value").textContent = theme.name;
    $("appearance-accent").querySelector(".value").textContent = accentName(theme.accent);
    $("appearance-background").querySelector(".value").textContent = Theme.backgroundOf(theme.background).name;
    $("appearance-delete").hidden = !isOwn(theme);
    $("appearance-delete").querySelector(".value").textContent = confirmingDelete ? "OK again deletes it" : "";
    var cards = $("appearance-themes");
    cards.textContent = "";
    choices().forEach(function (choice) { cards.appendChild(themeCard(choice)); });
    host.setLinkValue("appearance", theme.name);
  }

  // Shows a theme at once and keeps it; the other apps get it once the changes stop.
  function useTheme(next) {
    theme = next;
    Theme.use(theme);
    show();
    window.clearTimeout(shareTimer);
    shareTimer = window.setTimeout(function () {
      Theme.share(theme).catch(function (error) { setStatus("Could not share the theme: " + error.message, "error"); });
    }, SHARE_DELAY_MS);
  }

  function saveCustoms() {
    try { window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(customs)); }
    catch (error) { setStatus("Could not save: " + error.message, "error"); }
  }

  // Left/Right on a row: the next theme, accent or background.
  function change(row, direction) {
    var field = row.getAttribute("data-row");
    if (field === "theme") {
      var list = choices();
      var ids = list.map(function (choice) { return choice.id; });
      useTheme(list[ids.indexOf(AppearanceLogic.step(ids, theme.id, direction))]);
      return;
    }
    var values = field === "accent" ?
      Theme.ACCENTS.map(function (accent) { return accent.color; }) :
      Theme.BACKGROUNDS.map(function (background) { return background.id; });
    var madeOwn = !isOwn(theme);
    var result = AppearanceLogic.withChange(customs, theme, field, AppearanceLogic.step(values, theme[field], direction));
    customs = result.customs;
    saveCustoms();
    useTheme(result.theme);
    if (madeOwn) { setStatus("Made " + theme.name + ", a theme of your own", "ok"); }
  }

  // OK once asks, OK again deletes, and the theme before it in the Theme row takes its place.
  function deleteTheme() {
    if (!confirmingDelete) {
      confirmingDelete = true;
      show();
      setStatus("OK again deletes " + theme.name + " · Back keeps it");
      return;
    }
    var name = theme.name;
    var ids = choices().map(function (choice) { return choice.id; });
    var previous = AppearanceLogic.step(ids, theme.id, -1);
    confirmingDelete = false;
    customs = AppearanceLogic.withoutTheme(customs, theme.id);
    saveCustoms();
    useTheme(choices().filter(function (choice) { return choice.id === previous; })[0] || Theme.PRESETS[0]);
    setFocus($("appearance-theme"));
    setStatus("Deleted " + name, "ok");
  }

  function setFocus(element) {
    if (!element) { return; }
    if (editing && element !== editing) { stopEditing(); }
    if (confirmingDelete && element !== $("appearance-delete")) {
      confirmingDelete = false;
      show();
      setStatus("");
    }
    selected = UI.moveFocus(selected, element);
  }

  function updateHints() {
    $("appearance-move-hint").innerHTML = editing ? "<b>Left/Right</b> Change" : "<b>Arrows</b> Move";
    $("appearance-select-hint").innerHTML = editing ? "<b>OK</b> Done" : "<b>OK</b> Select";
    $("appearance-back-hint").innerHTML = editing ? "<b>Back</b> Done" : "<b>Back</b> Settings";
  }

  function startEditing(row) {
    setFocus(row);
    editing = row;
    row.classList.add("is-editing");
    updateHints();
    setStatus("Left/Right changes the " + row.querySelector("strong").textContent.toLowerCase());
  }

  function stopEditing() {
    if (!editing) { return; }
    editing.classList.remove("is-editing");
    editing = null;
    updateHints();
    setStatus("");
  }

  // Returns "leave" when Back should take the user back to Settings.
  function handleKey(event) {
    event.preventDefault();
    var key = event.keyCode;
    if (key === KEY.BACK) {
      if (confirmingDelete) { setFocus($("appearance-theme")); return null; }
      if (!editing) { return "leave"; }
      stopEditing();
      return null;
    }
    if (!selected || (key === KEY.ENTER && event.repeat)) { return null; }
    if (editing && (key === KEY.LEFT || key === KEY.RIGHT)) {
      change(editing, key === KEY.RIGHT ? 1 : -1);
    } else if (key === KEY.ENTER) {
      selected.click();
    } else if (key === KEY.UP || key === KEY.DOWN) {
      var list = rows();
      setFocus(list[list.indexOf(selected) + (key === KEY.DOWN ? 1 : -1)]);
    }
    return null;
  }

  function handlePointer(event) {
    var element = event.target.closest && event.target.closest("#appearance-list .focusable");
    if (element && element !== selected) { setFocus(element); }
  }

  // host: Home's setLinkValue(), to show the theme's name on the Settings row.
  function attach(pageHost) {
    host = pageHost;
    try { customs = AppearanceLogic.parseCustoms(window.localStorage.getItem(CUSTOM_KEY), Theme.isTheme); }
    catch (error) { customs = []; }
    theme = Theme.current();
    document.querySelectorAll("#appearance-list .setting").forEach(function (row) {
      row.addEventListener("click", function () {
        if (row.id === "appearance-delete") { deleteTheme(); }
        else if (editing === row) { stopEditing(); }
        else { startEditing(row); }
      });
    });
    host.setLinkValue("appearance", theme.name);
  }

  function open() {
    theme = Theme.current();
    confirmingDelete = false;
    show();
    updateHints();
    setStatus("");
    setFocus($("appearance-theme"));
  }

  function close() {
    stopEditing();
    confirmingDelete = false;
  }

  return { attach: attach, open: open, close: close, handleKey: handleKey, handlePointer: handlePointer };
}());
