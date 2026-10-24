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

// A panel clips its rows to its rounded corners, so the first and last row shown must be rounded the
// same way, or their focus ring is cut off.
function checkPanelCorners(t, view) {
  t.$$("#" + view + "-view .panel").forEach((panel) => {
    const shown = Array.from(panel.children).filter((row) => row.classList.contains("setting") && !row.hidden);
    if (!shown.length) { return; }
    const radius = getComputedStyle(panel).borderTopLeftRadius;
    const first = getComputedStyle(shown[0]);
    const last = getComputedStyle(shown[shown.length - 1]);
    const name = shown[0].id || shown[0].getAttribute("data-setting");
    t.equal([first.borderTopLeftRadius, first.borderTopRightRadius], [radius, radius], view + " panel of " + name + ": top corners");
    t.equal([last.borderBottomLeftRadius, last.borderBottomRightRadius], [radius, radius], view + " panel of " + name + ": bottom corners");
    t.equal(last.borderBottomWidth, "0px", view + " panel of " + name + ": no line under the last row");
  });
}

BrowserTest.define("the first and last row of every panel follow its rounded corners", {
  storage: { "theme.custom": [{ id: "custom-1", name: "Custom 1", accent: "#ff8a7a", background: "ember" }] }
}, async (t) => {
  await t.homeReady();
  openSettings();
  checkPanelCorners(t, "settings");
  openAppearance();
  checkPanelCorners(t, "appearance");
  t.key("OK");
  for (let i = 0; i < 7; i += 1) { t.key("RIGHT"); }
  t.equal(t.text("#appearance-theme .value"), "Custom 1");
  checkPanelCorners(t, "appearance");
});

BrowserTest.define("sharing a theme also writes a splash in its colours", {}, async (t) => {
  await t.homeReady();
  openAppearance();
  t.key("OK");
  t.key("RIGHT");
  t.key("BACK");
  t.key("BACK");
  await t.wait(300);
  const png = t.tv().files["/home/root/.config/minimal-suite/splash.png"];
  t.ok(png, "the splash is written when the view closes, without waiting");
  const image = new Image();
  image.src = "data:image/png;base64," + png;
  await image.decode();
  t.equal([image.width, image.height], [192, 108]);
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 108;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const middle = Array.from(context.getImageData(96, 54, 1, 1).data.slice(0, 3));
  t.equal(middle, [0x15, 0x07, 0x16], "the middle has Aubergine's page colour");
});

// The test fills localStorage after <head> ran, so it reloads the page once: on the second load the
// theme comes from storage before any of Home's own code runs, as on the TV.
BrowserTest.define("the theme used last is on the page from the start", {
  storage: { "theme.current": { id: "ember", name: "Ember", accent: "#ffb072", background: "ember" } }
}, async (t) => {
  if (!sessionStorage.getItem("reloaded")) {
    sessionStorage.setItem("reloaded", "1");
    location.reload();
    await new Promise(() => {});
  }
  t.equal(accent(), "#ffb072");
  t.equal(getComputedStyle(document.body).backgroundColor, "rgb(20, 9, 6)", "Ember's page colour");
});

BrowserTest.define("moving away from Delete cancels it", {
  storage: { "theme.custom": [{ id: "custom-1", name: "Custom 1", accent: "#ff8a7a", background: "ember" }],
    "theme.current": { id: "custom-1", name: "Custom 1", accent: "#ff8a7a", background: "ember" } }
}, async (t) => {
  await t.homeReady();
  openAppearance();
  for (let i = 0; i < 3; i += 1) { t.key("DOWN"); }
  t.key("OK");
  t.match(t.text("#appearance-status"), /OK again/);
  t.key("UP");
  t.key("DOWN");
  t.key("OK");
  t.equal(JSON.parse(localStorage.getItem("theme.custom")).length, 1, "the next OK asks again rather than deleting");
});

BrowserTest.define("with many themes of your own the one in use stays in view, above the footer", {
  storage: (() => {
    const customs = Array.from({ length: 18 }, (_, i) => ({ id: "custom-" + (i + 1), name: "Custom " + (i + 1), accent: "#ff8a7a", background: "ember" }));
    return { "theme.custom": customs, "theme.current": customs[17] };
  })()
}, async (t) => {
  await t.homeReady();
  openAppearance();
  const box = t.$("#appearance-themes").getBoundingClientRect();
  const current = t.$("#appearance-themes .is-current").getBoundingClientRect();
  const footer = t.$("#appearance-view footer").getBoundingClientRect().top;
  t.ok(current.top >= box.top && current.bottom <= box.bottom, "the current card is shown");
  t.ok(t.$(".appearance-note").getBoundingClientRect().bottom <= footer, "the note ends above the footer");
});
