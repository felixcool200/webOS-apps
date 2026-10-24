// The Sources view. The fake TV's inputs are HDMI 1 to n, HDMI 1 used last.

function openSources() {
  document.dispatchEvent(new CustomEvent("webOSRelaunch", { detail: { view: "sources" } }));
}

BrowserTest.define("arrows in Sources follow the grid's lines and columns", { tv: { inputs: 10 } }, async (t) => {
  await t.homeReady();
  openSources();
  await t.until(() => t.$$("#sources .source").length === 11, 4000, "Live TV and ten inputs");
  t.equal(t.text(t.focused().querySelector(".app-name")), "HDMI 1", "opens on the input used last");
  t.key("DOWN");
  t.equal(t.text(t.focused().querySelector(".app-name")), "HDMI 9", "the same column on the next line");
  t.key("RIGHT");
  t.key("RIGHT");
  t.equal(t.text(t.focused().querySelector(".app-name")), "HDMI 8", "Right wraps within the line");
  t.key("UP");
  t.equal(t.text(t.focused().querySelector(".app-name")), "Live TV", "Up goes back to the same column");
});

BrowserTest.define("OK on an input switches to it", {}, async (t) => {
  await t.homeReady();
  openSources();
  await t.until(() => t.$$("#sources .source").length === 4, 4000, "the inputs");
  t.key("RIGHT");
  t.key("OK");
  await t.wait(300);
  t.equal(t.tv().launched, ["com.webos.app.hdmi2"]);
});
