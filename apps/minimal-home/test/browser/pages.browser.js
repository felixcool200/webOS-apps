// The Settings pages besides Picture (Sound, Network, Power and energy, General, Accessibility, About
// this TV) and the hub's links to them, against the fake TV.

function openView(view) {
  document.dispatchEvent(new CustomEvent("webOSRelaunch", { detail: { view } }));
}

function pageRow(t, view, key) {
  return t.$("#" + view + '-view [data-key="' + key + '"]');
}

function pageValue(t, view, key) {
  return t.text("#" + view + '-view [data-key="' + key + '"] .value');
}

function viewReady(t, view) {
  return t.until(() => /Ready/.test(t.text("#" + view + "-status")), 4000, view + "'s values");
}

// Moves the focus down a page's list to a row.
function focusPageRow(t, view, key) {
  for (let i = 0; i < 40 && t.focused() !== pageRow(t, view, key); i += 1) { t.key("DOWN"); }
  t.equal(t.focused(), pageRow(t, view, key), "the focus reached " + key);
}

BrowserTest.define("every page opens from its row in Settings and reads without an error", {}, async (t) => {
  await t.homeReady();
  for (const view of ["picture", "sound", "network", "power", "general", "accessibility", "about"]) {
    openView("settings");
    t.$("#" + view + "Link").click();
    t.equal(t.view(), view);
    await viewReady(t, view);
    const first = t.$$("#" + view + "-view .setting").filter((row) => !row.hidden)[0];
    t.ok(first, view + " shows rows");
    t.ok(Math.abs(t.$("#" + view + "-view .page-card").getBoundingClientRect().top - first.getBoundingClientRect().top) <= 1,
      view + "'s card is level with its first row");
    t.key("BACK");
    t.equal(t.view(), "settings");
  }
});

BrowserTest.define("Sound shows the delay of the output in use, which Bypass greys, and writes it as LG does", {}, async (t) => {
  await t.homeReady();
  openView("sound");
  await viewReady(t, "sound");
  t.equal(pageValue(t, "sound", "soundOutput"), "Optical Out Device + TV Speaker");
  t.ok(!pageRow(t, "sound", "avSyncSpeaker").hidden, "the TV speaker's delay");
  t.ok(pageRow(t, "sound", "avSyncSpdif").hidden, "not the optical device's alone");
  focusPageRow(t, "sound", "avSyncSpeaker");
  t.key("OK");
  t.key("RIGHT");
  await t.until(() => t.tv().writes.length === 1, 3000, "the write");
  t.equal(t.tv().writes[0], { category: "sound", settings: { avSyncSpeaker: 1 }, dimension: null });
  t.key("OK");
  t.key("DOWN");
  t.equal(t.focused(), pageRow(t, "sound", "avSyncBypassInput"));
  t.key("OK");
  t.key("RIGHT");
  t.equal(pageValue(t, "sound", "avSyncBypassInput"), "On");
  t.ok(pageRow(t, "sound", "avSyncSpeaker").classList.contains("is-greyed"), "Bypass greys the delay");
});

BrowserTest.define("Sound out over HDMI (ARC) shows that output's delay instead", { tv: { settings: { sound: { soundOutput: "external_arc" } } } }, async (t) => {
  await t.homeReady();
  openView("sound");
  await viewReady(t, "sound");
  t.ok(pageRow(t, "sound", "avSyncSpeaker").hidden);
  t.ok(!pageRow(t, "sound", "avSyncSpdif").hidden);
});

BrowserTest.define("turning Wi-Fi off asks first: Back keeps it on, and OK again turns it off", {}, async (t) => {
  await t.homeReady();
  openView("network");
  await viewReady(t, "network");
  t.equal(pageValue(t, "network", "wifiEnabled"), "On");
  t.equal(pageValue(t, "network", "wifiStatus"), "Home · 192.168.1.5");
  t.equal(pageValue(t, "network", "ethernet"), "Unplugged");
  t.key("OK");
  t.key("LEFT");
  t.equal(pageValue(t, "network", "wifiEnabled"), "Off", "shown");
  t.match(t.text("#network-status"), /OK again turns Wi-Fi off/);
  t.key("BACK");
  t.equal(pageValue(t, "network", "wifiEnabled"), "On", "Back drops it");
  await t.wait(300);
  t.equal(t.tv().wifi, [], "nothing was written");
  t.key("OK");
  t.key("LEFT");
  t.key("OK");
  await t.until(() => t.tv().wifi.length === 1, 3000, "the write");
  t.equal(t.tv().wifi, ["disabled"]);
  await t.until(() => pageValue(t, "network", "wifiStatus") === "Wireless radio is off", 3000, "the re-read");
});

BrowserTest.define("the sleep timer starts from the Power page, and the row shows the time left", { budget: 20000 }, async (t) => {
  await t.homeReady();
  openView("power");
  await viewReady(t, "power");
  t.equal(pageValue(t, "power", "sleepTimer"), "Off");
  t.key("OK");
  t.key("RIGHT");
  await t.until(() => t.tv().sleep.length === 1, 3000, "the timer");
  t.equal(t.tv().sleep, [10]);
  await t.until(() => t.text('#power-view [data-key="sleepTimer"] small') === "10 min left", 4000, "the time left");
  t.equal(pageValue(t, "power", "sleepTimer"), "10 minutes");
  t.equal(pageValue(t, "power", "automaticStandBy"), "4 hours");
});

BrowserTest.define("General's read-only rows show the time zone and language and write nothing", {}, async (t) => {
  await t.homeReady();
  openView("general");
  await viewReady(t, "general");
  t.equal(pageValue(t, "general", "timeZone"), "Stockholm · Central European Time");
  t.equal(pageValue(t, "general", "menuLanguage"), "English");
  focusPageRow(t, "general", "timeZone");
  t.key("OK");
  t.ok(!pageRow(t, "general", "timeZone").classList.contains("is-editing"));
  t.match(t.text("#general-status"), /change it in LG Settings/);
  t.key("RIGHT");
  t.equal(t.text(t.focused()), "Open in LG Settings", "Right goes to the card's button, not a change");
  t.equal(t.tv().writes, []);
});

BrowserTest.define("text with high contrast also turns grayscale and invert colours off, as LG does", {}, async (t) => {
  await t.homeReady();
  openView("accessibility");
  await viewReady(t, "accessibility");
  t.equal(pageValue(t, "accessibility", "subtitleLanguageFirst"), "Swedish");
  t.ok(pageRow(t, "accessibility", "audioDescriptionVolume").hidden, "the volume shows with audio description on");
  t.key("OK");
  t.key("RIGHT");
  await t.until(() => t.tv().written.length === 2, 3000, "the write");
  t.equal(t.tv().written, [["highContrast", "on"], ["adjustments", { blackAndWhite: "off", colorInversion: "off" }]]);
  t.equal(t.tv().counts.luna, 1, "in one call");
});

BrowserTest.define("high contrast is greyed while grayscale is on", {
  tv: { settings: { option: { adjustments: { blackAndWhite: "on", colorInversion: "off" } } } }
}, async (t) => {
  await t.homeReady();
  openView("accessibility");
  await viewReady(t, "accessibility");
  t.ok(pageRow(t, "accessibility", "highContrast").classList.contains("is-greyed"));
  t.match(t.text("#accessibility-view .card-reason"), /Grayscale is on/);
});

BrowserTest.define("About this TV shows the model and software, and opens LG's software update", {}, async (t) => {
  await t.homeReady();
  openView("about");
  await viewReady(t, "about");
  t.equal(pageValue(t, "about", "model"), "65QNED80T6A.BEUFLJP");
  t.equal(pageValue(t, "about", "software"), "33.31.75");
  t.equal(pageValue(t, "about", "webos"), "webOS TV Lite 10.3.2");
  t.equal(pageValue(t, "about", "deviceName"), "[LG] webOS TV QNED80T6A");
  focusPageRow(t, "about", "softwareUpdate");
  t.key("OK");
  await t.until(() => t.tv().launches.length === 1, 2000, "the launch");
  t.equal(t.tv().launches[0], { id: "com.palm.app.settings", params: { target: "SoftwareUpdate" } });
});

BrowserTest.define("Network's Open in LG Settings opens LG's network screens", {}, async (t) => {
  await t.homeReady();
  openView("network");
  await viewReady(t, "network");
  t.key("RIGHT");
  t.key("OK");
  await t.until(() => t.tv().launches.length === 1, 2000, "the launch");
  t.equal(t.tv().launches[0], { id: "com.webos.app.firstuse-overlay", params: { target: "network" } });
});

BrowserTest.define("the hub's sleep timer row sets the timer, and the links show summaries", { tv: { sleepSeconds: 1500 } }, async (t) => {
  await t.homeReady();
  openView("settings");
  await t.until(() => t.text('[data-setting="sleepTimer"] .value') === "30 minutes", 4000, "the timer");
  t.equal(t.text('[data-setting="sleepTimer"] small'), "25 min left");
  t.equal(t.text("#soundLink .value"), "Standard");
  t.equal(t.text("#networkLink .value"), "Wi-Fi · Home");
  for (let i = 0; i < 4; i += 1) { t.key("DOWN"); }
  t.key("OK");
  t.key("LEFT");
  await t.until(() => t.tv().sleep.length === 1, 3000, "the write");
  t.equal(t.tv().sleep, [20]);
});

BrowserTest.define("Sound out switches among the TV speaker and the outputs the TV lists", {}, async (t) => {
  await t.homeReady();
  openView("sound");
  await viewReady(t, "sound");
  focusPageRow(t, "sound", "soundOutput");
  t.key("OK");
  t.key("LEFT");
  await t.until(() => t.tv().writes.length === 1, 3000, "the write");
  t.equal(t.tv().writes[0], { category: "sound", settings: { soundOutput: "tv_speaker" }, dimension: null });
  t.equal(pageValue(t, "sound", "soundOutput"), "TV Speaker");
  await t.until(() => pageRow(t, "sound", "avSyncSpeaker") && !pageRow(t, "sound", "avSyncSpeaker").hidden, 3000, "the delay of the TV speaker");
  await t.wait(1500);
  t.key("RIGHT");
  await t.until(() => t.tv().writes.length === 2, 3000, "back, after the TV's list shrank to the TV speaker");
  t.equal(t.tv().writes[1].settings, { soundOutput: "tv_external_speaker" });
});

BrowserTest.define("only the Standard sound mode can be reset, as in LG Settings", { tv: { settings: { sound: { soundMode: "movie" } } } }, async (t) => {
  await t.homeReady();
  openView("sound");
  await viewReady(t, "sound");
  focusPageRow(t, "sound", "soundReset");
  t.ok(pageRow(t, "sound", "soundReset").classList.contains("is-greyed"));
  t.key("OK");
  t.key("OK");
  await t.wait(300);
  t.equal(t.tv().resets, []);
  for (let i = 0; i < 40 && t.focused() !== pageRow(t, "sound", "soundMode"); i += 1) { t.key("UP"); }
  t.key("OK");
  t.key("LEFT");
  await t.until(() => t.tv().written.length === 1 && /Saved/.test(t.text("#sound-status")), 3000, "Standard");
  t.key("OK");
  focusPageRow(t, "sound", "soundReset");
  await t.until(() => !pageRow(t, "sound", "soundReset").classList.contains("is-greyed"), 3000, "the reset free");
  t.key("OK");
  t.key("OK");
  await t.until(() => t.tv().resets.length === 1, 3000, "the reset");
  t.equal(t.tv().resets[0], { category: "sound", keys: ["audioBalance", "userEqualizerValues", "soundModeModified"] });
});

BrowserTest.define("minimum brightness asks before its first change, then follows the keys", { tv: { settings: { picture: { energySaving: "auto" } } } }, async (t) => {
  await t.homeReady();
  openView("power");
  await viewReady(t, "power");
  focusPageRow(t, "power", "energySavingAutoMin");
  t.key("OK");
  t.key("LEFT");
  t.match(t.text("#power-status"), /Energy use may rise/);
  await t.wait(300);
  t.equal(t.tv().writes, [], "nothing yet");
  t.key("OK");
  await t.until(() => t.tv().writes.length === 1, 3000, "the first change");
  t.ok(pageRow(t, "power", "energySavingAutoMin").classList.contains("is-editing"), "still changing it");
  t.key("LEFT");
  await t.until(() => t.tv().writes.length === 2, 3000, "the second, without asking");
  t.equal(t.tv().written, [["energySavingAutoMin", 4], ["energySavingAutoMin", 3]]);
});

BrowserTest.define("Always Ready asks before turning on and records the agreement LG asks for; Power on screen sets LG's keys", {}, async (t) => {
  await t.homeReady();
  openView("power");
  await viewReady(t, "power");
  focusPageRow(t, "power", "powerOnScreen");
  t.equal(pageValue(t, "power", "powerOnScreen"), "Home");
  t.key("OK");
  t.key("RIGHT");
  await t.until(() => t.tv().written.length === 3, 3000, "the write");
  t.equal(t.tv().written, [["homeAutoLaunch", "off"], ["selectedInputApp", "off"], ["checkHomeAutoLaunchValue", "user"]]);
  t.key("OK");
  t.key("DOWN");
  t.equal(t.focused(), pageRow(t, "power", "alwaysReady"));
  t.key("OK");
  t.key("RIGHT");
  t.match(t.text("#power-status"), /OK again turns it on/);
  t.key("OK");
  await t.until(() => t.tv().written.length === 5, 3000, "the write");
  t.equal(t.tv().written.slice(3), [["lifeOnScreenMode", "allEnabled"], ["erpUserConfirm", true]]);
});

BrowserTest.define("grayscale turns screen zoom off, then writes the colour filters with high contrast off", {}, async (t) => {
  await t.homeReady();
  openView("accessibility");
  await viewReady(t, "accessibility");
  focusPageRow(t, "accessibility", "grayscale");
  t.key("OK");
  t.key("RIGHT");
  await t.until(() => t.tv().written.length === 4, 3000, "the writes");
  t.equal(t.tv().written, [["screenMagnification", "off"], ["adjustments", { blackAndWhite: "on", colorInversion: "off" }],
    ["highContrast", "off"], ["focusEmphasis", "off"]]);
  await t.until(() => pageRow(t, "accessibility", "highContrast").classList.contains("is-greyed"), 4000, "high contrast greyed after the re-read");
});
