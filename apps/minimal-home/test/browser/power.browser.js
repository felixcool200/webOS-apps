// The power button next to Settings on Home, and its popup.

function openPowerMenu(t) {
  t.$("#power-button").click();
  t.ok(!t.$("#power-menu").hidden, "the popup is open");
}

BrowserTest.define("the power popup opens on Cancel; Back and Cancel close it and give the focus back", {}, async (t) => {
  await t.homeReady();
  openPowerMenu(t);
  t.equal(t.focused().getAttribute("data-power"), "cancel");
  t.equal(t.$$("#home-view .is-focused").length, 1, "only the popup's choice is focused");
  t.key("RIGHT");
  t.equal(t.focused().getAttribute("data-power"), "cancel", "Cancel is last");
  t.key("BACK");
  t.ok(t.$("#power-menu").hidden);
  t.equal(t.focused().id, "power-button");
  openPowerMenu(t);
  t.key("OK");
  t.ok(t.$("#power-menu").hidden);
  await t.wait(300);
  t.equal(t.tv().power, [], "nothing was asked of the TV");
});

BrowserTest.define("Restart in the power popup restarts the TV as LG Settings does", {}, async (t) => {
  await t.homeReady();
  openPowerMenu(t);
  t.key("LEFT");
  t.equal(t.focused().getAttribute("data-power"), "restart");
  t.key("OK");
  t.equal(t.text("#power-status"), "Restarting…");
  await t.until(() => t.tv().power.length === 1, 3000, "the restart");
  t.equal(t.tv().power, [["power2/reboot", "micomReset"]]);
});

BrowserTest.define("Turn off in the power popup turns the TV off as the remote's power button does", {}, async (t) => {
  await t.homeReady();
  openPowerMenu(t);
  t.key("LEFT");
  t.key("LEFT");
  t.equal(t.focused().getAttribute("data-power"), "off");
  t.key("OK");
  await t.until(() => t.tv().power.length === 1, 3000, "the power off");
  t.equal(t.tv().power, [["power/powerOff", "remoteKey"]]);
});

BrowserTest.define("Up from the app grid reaches the power button next to Settings", {}, async (t) => {
  await t.homeReady();
  t.key("UP");
  for (let i = 0; i < 4; i += 1) { t.key("RIGHT"); }
  t.equal(t.focused().id, "power-button", "the rightmost button in the top bar");
  t.key("LEFT");
  t.equal(t.focused().id, "settings");
});
