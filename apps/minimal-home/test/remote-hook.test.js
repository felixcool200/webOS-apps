"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const script = fs.readFileSync(path.join(__dirname, "../app/remote-hook/load-remote-hook.sh"), "utf8");

test("the boot script writes LG Input Hook's marker before it waits, so that app can't load the hook too", () => {
  const marker = script.indexOf(": > /tmp/inputhook");
  const wait = script.indexOf('while [ -z "$(pidof lginput2)" ]');
  assert.ok(marker > 0 && wait > 0, "both are in the script");
  assert.ok(marker < wait);
});

test("the boot script puts the bindings set aside by a test back, with a new modification time", () => {
  assert.match(script, /mv "\$CONFIG\.before-test" "\$CONFIG" && touch "\$CONFIG"/);
});

test("the boot script waits for the input program in the background", () => {
  assert.match(script, /\) <\/dev\/null >\/dev\/null 2>&1 &\s*$/);
});
