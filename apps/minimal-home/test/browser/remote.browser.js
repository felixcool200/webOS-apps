// The Remote buttons view. The fake TV's bindings file starts with Prime Video disabled.

function openRemote() {
  document.dispatchEvent(new CustomEvent("webOSRelaunch", { detail: { view: "remote" } }));
}

const LIVING_ROOM = {
  active: "p2",
  list: [
    { id: "p1", name: "LG MR24", template: "mr24", buttons: [], binds: { "1038": { action: "ignore" } } },
    { id: "p2", name: "Living room", template: "blank", buttons: [{ code: "4242", name: "Ambilight" }], binds: { "4242": { action: "ignore" } } }
  ]
};
const CONFIG = "/home/root/.config/lginputhook/keybinds.json";

BrowserTest.define("Remove waits until the bindings were read", {
  tv: { bindings: { "4242": { action: "ignore" } }, delays: { bindings: [20, 3000] } },
  storage: { "remote.presets": LIVING_ROOM }
}, async (t) => {
  await t.homeReady();
  await t.until(() => t.tv().counts.bindings >= 1, 4000, "the background read");
  await t.wait(200);
  openRemote();
  t.key("RIGHT");
  t.key("DOWN");
  t.key("DOWN");
  t.equal(t.focused().id, "remote-remove");
  t.key("OK");
  t.match(t.text("#remote-status"), /Reading the bindings/);
  await t.wait(3500);
  t.ok(t.$('#remote-list [data-code="4242"]'), "the button is still there");
  t.equal(JSON.parse(t.tv().files[CONFIG]), { "4242": { action: "ignore" } }, "its binding is still there");
});

BrowserTest.define("a change made while the bindings are read again is kept", {
  tv: { delays: { bindings: [2000, 2000] } }
}, async (t) => {
  await t.homeReady();
  await t.wait(400);
  openRemote();
  await t.until(() => t.tv().counts.bindings >= 2, 6000, "the second read starting");
  await t.wait(50);
  t.key("OK");
  t.key("RIGHT");
  t.equal(t.text('#remote-list [data-code="2"] .value'), "Disabled", "changed");
  await t.wait(3500);
  t.equal(JSON.parse(t.tv().files[CONFIG])["2"], { action: "ignore" }, "the change reached the file");
  t.equal(t.text('#remote-list [data-code="2"] .value'), "Disabled", "and is still shown");
});

BrowserTest.define("the page warns when the hook's library isn't loaded, even if its log exists", { tv: { hooked: false } }, async (t) => {
  await t.homeReady();
  openRemote();
  await t.until(() => /hook isn't loaded/.test(t.text("#remote-status")), 4000, "the warning");
});

BrowserTest.define("switching presets writes that preset's bindings to the file", {
  tv: { bindings: { "1038": { action: "ignore" } } },
  storage: { "remote.presets": Object.assign({}, LIVING_ROOM, { active: "p1" }) }
}, async (t) => {
  await t.homeReady();
  openRemote();
  await t.wait(800);
  t.$("#remote-model").click();
  t.key("RIGHT");
  await t.wait(1500);
  t.equal(JSON.parse(t.tv().files[CONFIG]), { "4242": { action: "ignore" } });
  t.equal(t.text("#remote-model .value"), "Living room");
  t.ok(!t.$("#remote-card").hidden, "the Blank preset shows its card");
});

BrowserTest.define("a test disables every button and stops after three quick presses of one", {}, async (t) => {
  await t.homeReady();
  openRemote();
  await t.wait(800);
  t.$("#remote-test").click();
  await t.wait(500);
  const disabled = JSON.parse(t.tv().files[CONFIG]);
  t.equal(disabled["773"], { action: "ignore" }, "Home is disabled during the test");
  t.equal(disabled["1044"], { action: "ignore" }, "so are the app buttons");
  t.tv().hookLog.push("state=1 uinput_code=1037", "state=1 uinput_code=1037");
  await t.wait(400);
  t.equal(t.text("#remote-test"), "Stop test", "still testing after two presses");
  t.tv().hookLog.push("state=1 uinput_code=1037");
  await t.wait(1000);
  t.equal(t.text("#remote-test"), "Test remote", "stopped after the third");
  t.equal(JSON.parse(t.tv().files[CONFIG]), { "1038": { action: "ignore" } }, "the real bindings are back");
});
