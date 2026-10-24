// The Picture page, a Settings page from settings-specs.js, against the fake TV (apps in front, picture
// mode Standard, backlight 80 and sharpness 25 unless a test sets them).

function openPicture() {
  document.dispatchEvent(new CustomEvent("webOSRelaunch", { detail: { view: "picture" } }));
}

function row(t, key) {
  return t.$('#picture-view [data-key="' + key + '"]');
}

function rowValue(t, key) {
  return t.text('#picture-view [data-key="' + key + '"] .value');
}

// Moves the focus down the list to a row.
function focusRow(t, key) {
  for (let i = 0; i < 40 && t.focused() !== row(t, key); i += 1) { t.key("DOWN"); }
  t.equal(t.focused(), row(t, key), "the focus reached " + key);
}

function pageReady(t) {
  return t.until(() => /Ready/.test(t.text("#picture-status")), 4000, "the page's values");
}

BrowserTest.define("Picture opens from Settings and reads everything in one root call; Back returns to its row", {}, async (t) => {
  await t.homeReady();
  await t.until(() => t.tv().counts.settings >= 1, 4000, "Settings' background read");
  await t.wait(300);
  const before = t.tv().calls.length;
  t.equal(t.$("#picture-view .page-list"), null, "Home's start doesn't make the page");
  document.dispatchEvent(new CustomEvent("webOSRelaunch", { detail: { view: "settings" } }));
  t.key("RIGHT");
  t.equal(t.focused().id, "pictureLink", "Right from Picture mode");
  t.key("OK");
  t.equal(t.view(), "picture");
  await pageReady(t);
  t.equal(t.tv().calls.slice(before).map((call) => call[0]), ["settings", "settings"], "Settings' own read when it opened, then the page's");
  t.equal(rowValue(t, "appliesTo"), "Apps");
  t.equal(rowValue(t, "pictureMode"), "Standard");
  t.equal(rowValue(t, "sharpness"), "25");
  t.equal(rowValue(t, "gamma"), "2.4");
  t.equal(t.text('#picture-view [data-key="energySaving"] small'), "Every input");
  t.key("BACK");
  t.equal(t.view(), "settings");
  t.equal(t.focused().id, "pictureLink");
});

BrowserTest.define("a change writes to the input and mode shown, and marks the mode changed for LG", {}, async (t) => {
  await t.homeReady();
  openPicture();
  await pageReady(t);
  focusRow(t, "sharpness");
  t.key("OK");
  t.key("RIGHT");
  t.key("RIGHT");
  t.equal(rowValue(t, "sharpness"), "27", "both presses show at once");
  await t.until(() => t.tv().writes.filter((write) => write.settings.sharpness !== undefined).length === 2, 3000, "the writes");
  const writes = t.tv().writes;
  t.equal(writes[0], { category: "picture", settings: { sharpness: 26 }, dimension: { input: "default", pictureMode: "normal" } });
  t.equal(writes[1].settings.pictureSettingModified.normal, true, "LG's flag for Standard, on the first change");
  t.equal(writes[1].dimension, { input: "default" });
  t.equal(writes[2], { category: "picture", settings: { sharpness: 27 }, dimension: { input: "default", pictureMode: "normal" } }, "the second press after the first");
  t.equal(writes.length, 3, "the flag only once");
});

BrowserTest.define("Applies to reads another input's own mode and settings, and changes go there", {
  tv: { inputSettings: { hdmi2: { picture: { pictureMode: "eco", sharpness: "10" } } } }
}, async (t) => {
  await t.homeReady();
  openPicture();
  await pageReady(t);
  t.equal(t.focused(), row(t, "appliesTo"));
  t.key("OK");
  t.key("RIGHT");
  t.key("RIGHT");
  t.key("RIGHT");
  t.equal(rowValue(t, "appliesTo"), "HDMI 2");
  await t.until(() => rowValue(t, "sharpness") === "10" && /Editing/.test(t.text("#picture-status")), 4000, "HDMI 2's settings");
  t.equal(rowValue(t, "pictureMode"), "Auto Power Save");
  t.key("OK");
  focusRow(t, "sharpness");
  t.key("OK");
  t.key("LEFT");
  await t.until(() => t.tv().writes.length >= 1, 3000, "the write");
  t.equal(t.tv().writes[0].dimension, { input: "hdmi2", pictureMode: "eco" });
  t.match(t.text("#picture-view .card-scope"), /Applies to HDMI 2 in Auto Power Save/);
});

BrowserTest.define("panel brightness is greyed while energy saving is Auto, as in LG Settings, and writes nothing", {
  tv: { settings: { picture: { energySaving: "auto" } } }
}, async (t) => {
  await t.homeReady();
  openPicture();
  await pageReady(t);
  focusRow(t, "backlight");
  t.ok(row(t, "backlight").classList.contains("is-greyed"));
  t.match(t.text("#picture-view .card-reason"), /Energy saving is Auto or Maximum/);
  t.key("OK");
  t.ok(!row(t, "backlight").classList.contains("is-editing"), "OK doesn't start changing it");
  t.match(t.text("#picture-status"), /Energy saving is Auto/);
  t.key("UP");
  t.equal(t.focused(), row(t, "energySaving"));
  t.key("OK");
  t.key("RIGHT");
  t.equal(rowValue(t, "energySaving"), "Off");
  t.ok(!row(t, "backlight").classList.contains("is-greyed"), "Off frees it at once");
  await t.until(() => t.tv().writes.length === 1, 3000, "the write");
  t.equal(t.tv().writes[0], { category: "picture", settings: { energySaving: "off" }, dimension: null });
});

BrowserTest.define("a row the TV doesn't show is left out, and its section too when it was the only one", {
  tv: { desc: { "picture.localDimming": { visible: false }, "aiPicture.ai_Brightness": { visible: false },
    "picture.eyeComfortMode": { visible: false }, "picture.filmMakerMode": { visible: false } } }
}, async (t) => {
  await t.homeReady();
  openPicture();
  await pageReady(t);
  t.ok(row(t, "localDimming").hidden);
  t.ok(!row(t, "gamma").hidden);
  t.ok(t.$('#picture-view .page-section[data-section="4"]').hidden, "Options has nothing left");
  t.ok(!t.$('#picture-view .page-section[data-section="3"]').hidden);
});

BrowserTest.define("Down to the last row scrolls it into view, and Right reaches Open in LG Settings", {}, async (t) => {
  await t.homeReady();
  openPicture();
  await pageReady(t);
  focusRow(t, "ai_Brightness");
  const list = t.$("#picture-view .page-list").getBoundingClientRect();
  const last = row(t, "ai_Brightness").getBoundingClientRect();
  t.ok(last.bottom <= list.bottom + 1 && last.top >= list.top - 1, "the row is inside the list");
  t.key("RIGHT");
  t.equal(t.text(t.focused()), "Open in LG Settings");
  t.equal(t.text("#picture-view .card-title"), "AI brightness", "the card stays on the row");
  t.key("OK");
  await t.until(() => t.tv().launches.length, 2000, "the launch");
  t.equal(t.tv().launches[0], { id: "com.palm.app.settings", params: { target: "picture" } });
  t.key("LEFT");
  t.equal(t.focused(), row(t, "ai_Brightness"));
});
