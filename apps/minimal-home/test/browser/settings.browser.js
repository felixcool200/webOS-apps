// The Settings view, with the fake TV's settings (backlight 80 unless a test sets it).

function settingValue(t, key) {
  return t.text('[data-setting="' + key + '"] .value');
}

BrowserTest.define("one failed read leaves the rest of Settings working", { tv: { fail: ["getSystemSettingValues:energySaving"] } }, async (t) => {
  await t.homeReady();
  t.$("#settings").click();
  await t.until(() => /Could not read some settings/.test(t.text("#settings-status")), 4000, "the error");
  t.equal(settingValue(t, "pictureMode"), "Standard");
  t.equal(settingValue(t, "backlight"), "80");
  t.equal(settingValue(t, "energySaving"), "Auto", "the current value is still shown");
});

BrowserTest.define("at the maximum, Right on a range shows no arrow and writes nothing", { tv: { settings: { picture: { backlight: "100" } } } }, async (t) => {
  await t.homeReady();
  t.$("#settings").click();
  await t.until(() => settingValue(t, "backlight") === "100", 4000, "the values");
  t.key("DOWN");
  t.key("OK");
  t.ok(t.$('[data-setting="backlight"].is-editing'), "editing Panel brightness");
  t.ok(!t.$('[data-setting="backlight"] .value.can-increase'), "no › at the maximum");
  t.ok(t.$('[data-setting="backlight"] .value.can-decrease'), "‹ is there");
  t.key("RIGHT");
  await t.wait(600);
  t.equal(t.tv().written, [], "nothing was written");
});

BrowserTest.define("a change made while Settings is still reading keeps its value", { tv: { delays: { settings: [20, 2500] } } }, async (t) => {
  await t.homeReady();
  await t.until(() => t.tv().counts.settings >= 1, 4000, "the background read");
  await t.wait(300);
  t.$("#settings").click();
  t.key("DOWN");
  t.key("OK");
  t.key("LEFT");
  await t.until(() => t.tv().written.length === 1, 2000, "the write");
  t.equal(t.tv().written, [["backlight", 75]]);
  await t.wait(3000);
  t.equal(t.tv().counts.settings, 2, "the slow read answered meanwhile");
  t.equal(settingValue(t, "backlight"), "75", "not set back to the value read before the change");
});

BrowserTest.define("Settings reads everything in one root call when it opens", {}, async (t) => {
  await t.homeReady();
  await t.until(() => t.tv().counts.settings >= 1, 4000, "the background read");
  const before = t.tv().calls.length;
  t.$("#settings").click();
  await t.wait(500);
  const made = t.tv().calls.slice(before).map((call) => call[0]);
  t.equal(made, ["settings"]);
});

BrowserTest.define("reopening Settings during a write doesn't let the older reading undo it", {
  tv: { delays: { luna: [600, 20], settings: [20, 20, 1500] } }
}, async (t) => {
  await t.homeReady();
  await t.until(() => t.tv().counts.settings >= 1, 4000, "the reading at start");
  await t.wait(200);
  document.dispatchEvent(new CustomEvent("webOSRelaunch", { detail: { view: "settings" } }));
  await t.until(() => t.tv().counts.settings >= 2, 2000, "the reading on open");
  await t.wait(200);
  t.key("DOWN");
  t.key("OK");
  t.key("RIGHT");
  t.key("BACK");
  t.key("BACK");
  t.equal(t.view(), "home");
  document.dispatchEvent(new CustomEvent("webOSRelaunch", { detail: { view: "settings" } }));
  await t.until(() => t.tv().counts.settings >= 3, 2000, "the reading on reopening");
  await t.wait(2200);
  t.equal(t.tv().written, [["backlight", 85]]);
  t.equal(t.text('[data-setting="backlight"] .value'), "85", "the new value stays");
});
