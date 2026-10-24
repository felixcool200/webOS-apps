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

test("rootLunaBatch runs the calls in one root shell and returns each reply, or an Error, in order", async () => {
  let commands = 0;
  global.window = {
    PalmServiceBridge: function () {
      const bridge = this;
      this.call = function (uri, payload) {
        commands += 1;
        const command = JSON.parse(payload).command;
        const replies = ['{"returnValue":true,"settings":{"backlight":"80"}}', '{"returnValue":false,"errorText":"Unknown key"}', ""];
        const out = replies.map((reply, index) => "--- reply " + index + "\n" + reply + "\n").join("");
        setTimeout(() => bridge.onservicecallback(JSON.stringify({ returnValue: true, stdoutString: command.indexOf("& wait;") > 0 ? out : "" })), 0);
      };
    }
  };
  const replies = await WebOS.rootLunaBatch([["luna://a/b", {}], ["luna://c/d", { key: "x" }], ["luna://e/f", {}]]);
  assert.strictEqual(commands, 1);
  assert.deepStrictEqual(replies[0].settings, { backlight: "80" });
  assert.match(replies[1].message, /Unknown key/);
  assert.match(replies[2].message, /No response/);
  delete global.window;
});

test("a call with its own timeout gives up after it, so a retry comes soon", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  global.window = { PalmServiceBridge: function () { this.call = function () {}; this.cancel = function () {}; } };
  const call = WebOS.rootLuna("luna://com.webos.applicationManager/listApps", {}, 4000);
  let settled = false;
  call.catch(() => { settled = true; });
  t.mock.timers.tick(3999);
  await Promise.resolve();
  assert.strictEqual(settled, false);
  t.mock.timers.tick(1);
  await assert.rejects(call, /No reply/);
  delete global.window;
});
