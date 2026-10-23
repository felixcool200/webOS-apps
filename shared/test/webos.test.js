"use strict";

const test = require("node:test");
const assert = require("node:assert");
const WebOS = require("../webos.js");

test("base64 passes UTF-8 text through unchanged", () => {
  const text = JSON.stringify({ "1044": { action: "exec", command: "echo 'Skärm av – ✓'" } });
  assert.strictEqual(Buffer.from(WebOS.base64(text), "base64").toString("utf8"), text);
});

test("retry tries again after each delay until the task succeeds", async () => {
  let tries = 0;
  const result = await WebOS.retry(() => {
    tries += 1;
    return tries < 3 ? Promise.reject(new Error("busy")) : Promise.resolve("done");
  }, [1, 1, 1]);
  assert.strictEqual(result, "done");
  assert.strictEqual(tries, 3);
});

test("retry rejects with the last error once the delays run out", async () => {
  let tries = 0;
  await assert.rejects(WebOS.retry(() => {
    tries += 1;
    return Promise.reject(new Error("try " + tries));
  }, [1, 1]), /try 3/);
});

test("lunaCall fails instead of waiting forever when no reply comes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  global.window = {
    PalmServiceBridge: function () {
      this.call = function () {};
      this.cancel = function () { cancelled = true; };
    }
  };
  const call = WebOS.lunaCall("luna://example/never", {});
  t.mock.timers.tick(15000);
  await assert.rejects(call, /No reply from luna:\/\/example\/never/);
  assert.ok(cancelled);
  delete global.window;
});

test("rootShell rejects when the command fails", async () => {
  global.window = {
    PalmServiceBridge: function () {
      const bridge = this;
      this.call = function () {
        setTimeout(() => bridge.onservicecallback(JSON.stringify({ returnValue: false, errorText: "Command failed: false\n" })), 0);
      };
    }
  };
  await assert.rejects(WebOS.rootShell("false"), /^Error: Command failed: false$/);
  delete global.window;
});
