// Shared by every app: colour themes. A theme is an accent colour on a background (the page colour and
// the two glows in its corners), set as CSS variables on the page. Loaded in <head>, this file applies
// the theme this app last used at once, from its own localStorage, so the first frame already has it.
// Minimal Home's Appearance view chooses the theme and also writes it to FILE; other apps call sync()
// once they have started, to take a theme changed since they last ran.
var Theme = (function () {
  "use strict";

  var STORE_KEY = "theme.current";
  var FILE = "/home/root/.config/minimal-suite/theme.json";
  var ACCENTS = [
    { name: "Sky", color: "#72d6ff" }, { name: "Teal", color: "#5ce1e6" }, { name: "Mint", color: "#7ee2a8" },
    { name: "Lime", color: "#c5e86c" }, { name: "Sun", color: "#ecb22e" }, { name: "Amber", color: "#ffb072" },
    { name: "Coral", color: "#ff8a7a" }, { name: "Rose", color: "#ff8fb1" }, { name: "Orchid", color: "#e0a6ff" },
    { name: "Lilac", color: "#a9b4ff" }, { name: "Silver", color: "#d7dce3" }, { name: "White", color: "#f7f9fc" }
  ];
  var BACKGROUNDS = [
    { id: "night", name: "Night", bg: "#081017", glowA: "rgba(30, 104, 145, 0.38)", glowB: "rgba(67, 55, 130, 0.28)" },
    { id: "aubergine", name: "Aubergine", bg: "#150716", glowA: "rgba(93, 32, 96, 0.5)", glowB: "rgba(17, 100, 163, 0.25)" },
    { id: "forest", name: "Forest", bg: "#06120d", glowA: "rgba(22, 110, 72, 0.4)", glowB: "rgba(90, 120, 40, 0.22)" },
    { id: "ocean", name: "Ocean", bg: "#04121a", glowA: "rgba(0, 110, 150, 0.42)", glowB: "rgba(20, 60, 140, 0.3)" },
    { id: "ember", name: "Ember", bg: "#140906", glowA: "rgba(150, 60, 30, 0.42)", glowB: "rgba(120, 40, 80, 0.25)" },
    { id: "rose", name: "Rose", bg: "#12070c", glowA: "rgba(140, 40, 80, 0.4)", glowB: "rgba(70, 40, 130, 0.25)" },
    { id: "graphite", name: "Graphite", bg: "#0b0c0e", glowA: "rgba(80, 86, 96, 0.3)", glowB: "rgba(50, 54, 62, 0.25)" }
  ];
  var PRESETS = [
    { id: "night", name: "Night", accent: "#72d6ff", background: "night" },
    { id: "aubergine", name: "Aubergine", accent: "#ecb22e", background: "aubergine" },
    { id: "forest", name: "Forest", accent: "#7ee2a8", background: "forest" },
    { id: "ocean", name: "Ocean", accent: "#5ce1e6", background: "ocean" },
    { id: "ember", name: "Ember", accent: "#ffb072", background: "ember" },
    { id: "rose", name: "Rose", accent: "#ff8fb1", background: "rose" },
    { id: "graphite", name: "Graphite", accent: "#d7dce3", background: "graphite" }
  ];

  function backgroundOf(id) {
    return BACKGROUNDS.filter(function (background) { return background.id === id; })[0] || BACKGROUNDS[0];
  }

  // A theme as saved: an id, a name, an accent colour (#rrggbb) and a background id.
  function isTheme(theme) {
    return !!theme && typeof theme.id === "string" && typeof theme.name === "string" &&
      /^#[0-9a-f]{6}$/i.test(theme.accent) && BACKGROUNDS.some(function (background) { return background.id === theme.background; });
  }

  // The CSS variables a theme sets. --accent-rgb is the accent as "r, g, b" for rgba() tints.
  function variables(theme) {
    var hex = theme.accent.slice(1);
    var background = backgroundOf(theme.background);
    return {
      "--accent": theme.accent,
      "--accent-rgb": [0, 2, 4].map(function (start) { return parseInt(hex.slice(start, start + 2), 16); }).join(", "),
      "--bg": background.bg,
      "--glow-a": background.glowA,
      "--glow-b": background.glowB
    };
  }

  function apply(theme) {
    var style = document.documentElement.style;
    var values = variables(theme);
    Object.keys(values).forEach(function (name) { style.setProperty(name, values[name]); });
  }

  function parse(text) {
    try {
      var theme = JSON.parse(text);
      return isTheme(theme) ? theme : null;
    } catch (error) { return null; }
  }

  // The theme this app last used, or the first preset.
  function current() {
    var text = null;
    try { text = window.localStorage.getItem(STORE_KEY); } catch (error) { text = null; }
    return parse(text) || PRESETS[0];
  }

  function remember(theme) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(theme)); }
    catch (error) { console.warn("Could not keep the theme: " + error.message); }
  }

  // Uses a theme in this app from now on.
  function use(theme) {
    remember(theme);
    apply(theme);
  }

  // Writes a theme (as root) where the other apps read it.
  function share(theme) {
    return WebOS.rootShell("mkdir -p " + FILE.replace(/\/[^/]*$/, "") + " && echo " + WebOS.base64(JSON.stringify(theme)) +
      " | base64 -d > " + FILE + ".new && mv " + FILE + ".new " + FILE);
  }

  // Takes the theme from FILE when it differs from the one in use (another app changed it).
  function sync() {
    return WebOS.rootShell("cat " + FILE + " 2>/dev/null || true").then(function (result) {
      var shared = parse(result.stdoutString);
      if (shared && JSON.stringify(shared) !== JSON.stringify(current())) {
        remember(shared);
        apply(shared);
      }
    }).catch(function (error) { console.warn("Could not read the shared theme: " + error.message); });
  }

  if (typeof document !== "undefined") { apply(current()); }

  return {
    ACCENTS: ACCENTS, BACKGROUNDS: BACKGROUNDS, PRESETS: PRESETS, backgroundOf: backgroundOf, isTheme: isTheme,
    variables: variables, apply: apply, parse: parse, current: current, use: use, share: share, sync: sync
  };
}());

if (typeof module !== "undefined") { module.exports = Theme; }
