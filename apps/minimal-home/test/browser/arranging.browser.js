// Home's grid: arranging apps and starting up. The fake TV lists YouTube, Netflix and Departures as
// apps, Homebrew Channel as a tool, and Alexa and Camera as hidden (Home's defaults).

BrowserTest.define("OK on the Settings button while arranging opens Settings, not an app", {}, async (t) => {
  await t.homeReady();
  await t.holdOk();
  t.ok(t.$("#home-view.is-arranging"), "holding OK started arranging");
  t.key("OK");
  t.key("UP");
  t.key("RIGHT");
  t.equal(t.focused() && t.focused().id, "settings", "the focus is on the cog");
  t.key("OK");
  await t.wait(1000);
  t.equal(t.view(), "settings");
  t.equal(t.tv().launched, [], "no app was launched");
  t.ok(!t.$("#home-view.is-arranging"), "arranging ended");
});

BrowserTest.define("Back finishes arranging in one press, leaving the picked-up app where it is", {}, async (t) => {
  await t.homeReady();
  t.key("RIGHT");
  await t.holdOk();
  t.key("RIGHT");
  t.key("BACK");
  t.ok(!t.$("#home-view.is-arranging"), "arranging ended");
  t.ok(!t.$(".app.is-editing"), "nothing is picked up");
  t.equal(t.$$("#apps .app").map((tile) => tile.getAttribute("data-app-id")), ["youtube.leanback.v4", "x.departures", "netflix"]);
  t.equal(t.focused().getAttribute("data-app-id"), "netflix", "the moved app keeps the focus");
});

BrowserTest.define("an app moves down into Tools and Hidden and back up, and Home keeps it", {}, async (t) => {
  await t.homeReady();
  await t.holdOk();
  t.key("DOWN");
  t.ok(t.$('#tools [data-app-id="youtube.leanback.v4"]'), "in Tools");
  t.key("DOWN");
  t.ok(t.$('#hidden-row [data-app-id="youtube.leanback.v4"]'), "in Hidden");
  t.ok(JSON.parse(localStorage.getItem("home.hiddenApps")).includes("youtube.leanback.v4"), "saved as hidden");
  t.key("UP");
  t.key("BACK");
  t.ok(t.$('#tools [data-app-id="youtube.leanback.v4"]'), "back in Tools after arranging");
  t.ok(!JSON.parse(localStorage.getItem("home.hiddenApps")).includes("youtube.leanback.v4"), "no longer hidden");
  t.ok(JSON.parse(localStorage.getItem("home.toolApps")).includes("org.webosbrew.inputhook"), "a tool that isn't installed keeps its place");
});

BrowserTest.define("arranging ends by itself after 20 seconds with nothing picked up", { budget: 30000 }, async (t) => {
  await t.homeReady();
  await t.holdOk();
  t.key("OK");
  t.ok(t.$("#home-view.is-arranging"), "still arranging after putting the app down");
  await t.wait(19000);
  t.ok(t.$("#home-view.is-arranging"), "still arranging after 19 s");
  await t.wait(2000);
  t.ok(!t.$("#home-view.is-arranging"), "ended after 20 s");
});

BrowserTest.define("moving an app moves only that tile, so the others keep wiggling undisturbed", {}, async (t) => {
  await t.homeReady();
  await t.holdOk();
  const picked = t.$(".app.is-editing");
  const moved = [];
  const observer = new MutationObserver((records) => records.forEach((record) => {
    Array.prototype.forEach.call(record.addedNodes, (node) => { if (node !== picked) { moved.push(node.getAttribute("data-app-id")); } });
  }));
  ["apps", "tools", "hidden-row"].forEach((id) => observer.observe(t.$("#" + id), { childList: true }));
  t.key("RIGHT");
  t.key("DOWN");
  t.key("DOWN");
  t.key("UP");
  await t.wait(50);
  observer.disconnect();
  t.equal(moved, [], "no other tile was taken out and put back");
});

BrowserTest.define("the app list from the last start shows before the TV answers", {
  tv: { delays: { listApps: 3000 } },
  storage: { "home.appList": [{ id: "youtube.leanback.v4", title: "YouTube" }, { id: "netflix", title: "Netflix" }] }
}, async (t) => {
  await t.until(() => t.$("#apps .app"), 300, "the remembered tiles");
  t.equal(t.$$("#apps .app").length, 2, "the two remembered apps");
  await t.until(() => t.$$("#apps .app").length === 3, 5000, "the TV's list");
  t.equal(JSON.parse(localStorage.getItem("home.appList")).length, 6, "the new list is kept for the next start");
});

BrowserTest.define("a lost app list reply is retried after a few seconds, not after 15", { tv: { lose: { listApps: [1] } }, budget: 20000 }, async (t) => {
  await t.until(() => t.$("#apps .app"), 6000, "the tiles after a retry");
  t.equal(t.tv().counts.listApps, 2);
  t.ok(!/Could not/.test(t.text("#status")), "no error shown");
});

BrowserTest.define("Up from the top line reaches the Sources button, and Down comes back to the same tile", {}, async (t) => {
  await t.homeReady();
  t.key("RIGHT");
  t.key("UP");
  t.equal(t.focused().id, "sources-button");
  t.key("RIGHT");
  t.equal(t.focused().id, "settings");
  t.key("LEFT");
  t.key("DOWN");
  t.ok(t.focused().getAttribute("data-app-id"), "back on a tile");
});
