// The Appearance view and its row in Settings. Theme.share writes the theme for the other apps.

const THEME_FILE = "/home/root/.config/minimal-suite/theme.json";

function openAppearance() {
  document.dispatchEvent(new CustomEvent("webOSRelaunch", { detail: { view: "appearance" } }));
}

function openSettings() {
  document.dispatchEvent(new CustomEvent("webOSRelaunch", { detail: { view: "settings" } }));
}

function accent() {
  return document.documentElement.style.getPropertyValue("--accent");
}

BrowserTest.define("the next theme shows at once and reaches the other apps once the changes stop", {}, async (t) => {
  await t.homeReady();
  openSettings();
  for (let i = 0; i < 6; i += 1) { t.key("DOWN"); }
  t.key("OK");
  t.equal(t.view(), "appearance");
  t.equal(t.focused().id, "appearance-theme");
  t.key("OK");
  t.key("RIGHT");
  t.key("RIGHT");
  t.equal(t.text("#appearance-theme .value"), "Forest");
  t.equal(accent(), "#7ee2a8", "the page uses Forest's accent");
  t.equal(JSON.parse(localStorage.getItem("theme.current")).id, "forest", "and keeps it");
  t.equal(t.tv().counts.write, undefined, "nothing is written while the changes go on");
  await t.wait(800);
  t.equal(t.tv().counts.write, 1, "one write after the last change");
  t.equal(JSON.parse(t.tv().files[THEME_FILE]).id, "forest");
  t.key("BACK");
  t.key("BACK");
  t.equal(t.view(), "settings");
  t.equal(t.text('#settings-view [data-view="appearance"] .value'), "Forest", "Settings shows the theme's name");
  t.equal(t.focused().id, "appearanceLink", "and Back returns to its row");
});

BrowserTest.define("changing a preset's accent makes a theme of your own, and deleting it needs OK twice", {}, async (t) => {
  await t.homeReady();
  openAppearance();
  t.key("DOWN");
  t.key("OK");
  t.key("RIGHT");
  t.equal(t.text("#appearance-theme .value"), "Custom 1");
  t.equal(t.text("#appearance-accent .value"), "Teal");
  t.equal(JSON.parse(localStorage.getItem("theme.custom")).map((own) => own.name), ["Custom 1"]);
  t.equal(t.$$("#appearance-themes .theme-card").length, 8, "seven presets and your own");
  t.key("RIGHT");
  t.equal(JSON.parse(localStorage.getItem("theme.custom")).length, 1, "a second change changes it in place");
  t.key("BACK");
  t.key("DOWN");
  t.key("DOWN");
  t.equal(t.focused().id, "appearance-delete");
  t.key("OK");
  t.equal(t.text("#appearance-theme .value"), "Custom 1", "the first OK only asks");
  t.key("OK");
  t.equal(t.text("#appearance-theme .value"), "Graphite", "the theme before it takes its place");
  t.equal(JSON.parse(localStorage.getItem("theme.custom")), []);
  t.ok(t.$("#appearance-delete").hidden, "presets can't be deleted");
  t.equal(t.focused().id, "appearance-theme");
});

BrowserTest.define("Back while deleting keeps the theme", {
  storage: { "theme.custom": [{ id: "custom-1", name: "Custom 1", accent: "#ff8a7a", background: "ember" }],
    "theme.current": { id: "custom-1", name: "Custom 1", accent: "#ff8a7a", background: "ember" } }
}, async (t) => {
  await t.homeReady();
  openAppearance();
  t.equal(t.text("#appearance-theme .value"), "Custom 1");
  t.key("DOWN");
  t.key("DOWN");
  t.key("DOWN");
  t.key("OK");
  t.key("BACK");
  t.equal(t.view(), "appearance", "Back first cancels");
  t.equal(JSON.parse(localStorage.getItem("theme.custom")).length, 1);
  t.equal(t.focused().id, "appearance-theme");
});

BrowserTest.define("every Settings row fits above the footer and the Appearance row is reachable", {}, async (t) => {
  await t.homeReady();
  openSettings();
  const footer = t.$("#settings-view footer").getBoundingClientRect().top;
  t.$$("#settings-view .setting, #settings-view .info-card").forEach((row) => {
    t.ok(row.getBoundingClientRect().bottom <= footer, (row.id || row.getAttribute("data-setting") || "the card") + " ends above the footer");
  });
  for (let i = 0; i < 6; i += 1) { t.key("DOWN"); }
  t.equal(t.focused().id, "appearanceLink", "Down from Energy saving");
  t.key("RIGHT");
  t.equal(t.focused().id, "advanced");
  t.key("LEFT");
  t.equal(t.focused().id, "appearanceLink");
  t.key("OK");
  t.equal(t.view(), "appearance");
});
