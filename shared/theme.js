// Shared by every app: colour themes. A theme is an accent colour on a background (the page colour and
// the two glows in its corners), set as CSS variables on the page. Loaded in <head>, this file applies
// the theme this app last used at once, from its own localStorage, so the first frame already has it.
// Minimal Home's Appearance view chooses the theme and also writes it to FILE (share); other apps call
// sync() once they have started, to take a theme changed since they last ran. share() also copies the
// splash of the theme's background (from Home's splashes/, made by scripts/render-splashes.js) to SPLASH
// and over the splash.png of each app in SPLASH_APPS, which webOS shows while that app starts
// (scripts/deploy.sh copies it in again after an install).
var Theme = (function () {
  "use strict";

  var STORE_KEY = "theme.current";
  // The theme last written to FILE, so Home can write it again if that failed (isShared). Renamed when
  // the splashes change, so Home writes the new one after an update.
  var SHARED_KEY = "theme.shared.720p";
  var FILE = "/home/root/.config/minimal-suite/theme.json";
  var SPLASH = "/home/root/.config/minimal-suite/splash.png";
  var APP_DIR = "/media/developer/apps/usr/palm/applications/";
  var SPLASHES = APP_DIR + "org.webosbrew.minimalhome/splashes/";
  var SPLASH_APPS = ["org.webosbrew.minimalhome", "org.webosbrew.departures"];
  var RETRY_MS = [1000, 3000];
  var ACCENTS = [
    { name: "Sky", color: "#72d6ff" }, { name: "Teal", color: "#5ce1e6" }, { name: "Mint", color: "#7ee2a8" },
    { name: "Lime", color: "#c5e86c" }, { name: "Sun", color: "#ecb22e" }, { name: "Amber", color: "#ffb072" },
    { name: "Coral", color: "#ff8a7a" }, { name: "Rose", color: "#ff8fb1" }, { name: "Orchid", color: "#e0a6ff" },
    { name: "Lilac", color: "#a9b4ff" }, { name: "Silver", color: "#d7dce3" }
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

  function read(key) {
    try { return parse(window.localStorage.getItem(key)); } catch (error) { return null; }
  }

  function keep(key, theme) {
    try { window.localStorage.setItem(key, JSON.stringify(theme)); }
    catch (error) { console.warn("Could not keep the theme: " + error.message); }
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // The theme this app last used, or the first preset.
  function current() {
    return read(STORE_KEY) || PRESETS[0];
  }

  // Uses a theme in this app from now on.
  function use(theme) {
    keep(STORE_KEY, theme);
    apply(theme);
  }

  // A shell command that writes base64 data to a file, through a temporary file so readers never
  // see half of it.
  function writeCommand(path, data) {
    return "echo " + data + " | base64 -d > " + path + ".new && mv " + path + ".new " + path;
  }

  // The theme waiting to be written, and the writing going on: one write at a time, and while one runs
  // only the latest theme waits, so FILE always ends up with the theme chosen last.
  var waiting = null;
  var writing = null;

  function writeWaiting() {
    var theme = waiting;
    waiting = null;
    var command = "mkdir -p " + FILE.replace(/\/[^/]*$/, "") + " && " + writeCommand(FILE, WebOS.base64(JSON.stringify(theme))) +
      " && cp " + SPLASHES + backgroundOf(theme.background).id + ".png " + SPLASH + ".new && mv " + SPLASH + ".new " + SPLASH +
      " && for app in " + SPLASH_APPS.join(" ") + "; do " +
      "if [ -f " + APP_DIR + "$app/splash.png ]; then cp " + SPLASH + " " + APP_DIR + "$app/splash.png || exit 1; fi; done";
    return WebOS.retry(function () { return WebOS.rootShell(command); }, RETRY_MS).then(function () {
      keep(SHARED_KEY, theme);
      if (waiting) { return writeWaiting(); }
      writing = null;
    }, function (error) {
      writing = null;
      throw error;
    });
  }

  // Writes a theme (as root) where the other apps read it. The promise settles once it is written.
  function share(theme) {
    waiting = theme;
    if (!writing) { writing = writeWaiting(); }
    return writing;
  }

  // Whether FILE has the theme in use, as far as this app knows (false after a failed share).
  function isShared() {
    return same(read(SHARED_KEY), current());
  }

  // Takes the theme from FILE when it differs from the one in use (another app changed it).
  function sync() {
    return WebOS.retry(function () { return WebOS.rootShell("cat " + FILE + " 2>/dev/null || true"); }, RETRY_MS).then(function (result) {
      var shared = parse(result.stdoutString);
      if (shared && !same(shared, current())) { use(shared); }
    }).catch(function (error) { console.warn("Could not read the shared theme: " + error.message); });
  }

  if (typeof document !== "undefined") { apply(current()); }

  return {
    ACCENTS: ACCENTS, BACKGROUNDS: BACKGROUNDS, PRESETS: PRESETS, backgroundOf: backgroundOf, isTheme: isTheme,
    variables: variables, apply: apply, parse: parse, current: current, use: use, share: share, isShared: isShared, sync: sync
  };
}());

if (typeof module !== "undefined") { module.exports = Theme; }
