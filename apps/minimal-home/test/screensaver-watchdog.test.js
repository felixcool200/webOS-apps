"use strict";

// Runs the screensaver watchdog with a fake luna-send: `-i` replays the power states in states.txt,
// one per line ("sleep N" pauses), then stays subscribed; `-n 1 .../getPowerState` prints now.txt;
// closeByAppId is recorded in calls.txt.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const script = path.join(__dirname, "../app/boot/screensaver-watchdog.sh");
const READY = '{ "state": "Active", "processing": "Screen Saver Ready", "returnValue": true }';
const SAVER = '{ "state": "Screen Saver", "returnValue": true }';
const FAKE = `#!/bin/sh
dir=$(dirname "$0")
case "$*" in
  *-i*getPowerState*) while read -r line; do case "$line" in "sleep "*) sleep \${line#sleep } ;; *) echo "$line" ;; esac; done < "$dir/states.txt"; exec sleep 600 ;;
  *getPowerState*) cat "$dir/now.txt" ;;
  *closeByAppId*) echo closed >> "$dir/calls.txt"; echo '{"returnValue":true}' ;;
esac
`;

function setUp(states, now) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "watchdog-"));
  fs.writeFileSync(path.join(dir, "luna-send"), FAKE, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "states.txt"), states.join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "now.txt"), now);
  return dir;
}

function start(dir) {
  return spawn("sh", [script], {
    detached: true,
    stdio: "ignore",
    env: Object.assign({}, process.env, {
      PATH: dir + ":" + process.env.PATH, STUCK_SECONDS: "0.4", PIDFILE: path.join(dir, "pid"), LOG: path.join(dir, "log")
    })
  });
}

function stop(child) {
  try { process.kill(-child.pid, "SIGTERM"); } catch (error) { /* already gone */ }
}

function calls(dir) {
  try { return fs.readFileSync(path.join(dir, "calls.txt"), "utf8").trim().split("\n"); } catch (error) { return []; }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("a screensaver that tvpowerd stays waiting for is closed once, and the state is logged", async () => {
  const dir = setUp([READY], READY);
  const child = start(dir);
  try {
    await wait(1500);
    assert.deepStrictEqual(calls(dir), ["closed"]);
    assert.match(fs.readFileSync(path.join(dir, "log"), "utf8"), /stuck: .*Screen Saver Ready/);
  } finally { stop(child); }
});

test("after closing a stuck screensaver, the next stuck one is closed too", async () => {
  const dir = setUp([READY, "sleep 1.2", READY], READY);
  const child = start(dir);
  try {
    await wait(2500);
    assert.deepStrictEqual(calls(dir), ["closed", "closed"]);
  } finally { stop(child); }
});

test("a screensaver that starts normally is left alone", async () => {
  const dir = setUp([READY, "sleep 0.1", SAVER], SAVER);
  const child = start(dir);
  try {
    await wait(1200);
    assert.deepStrictEqual(calls(dir), []);
  } finally { stop(child); }
});

test("a new copy stops the one already running", async () => {
  const dir = setUp([SAVER], SAVER);
  const first = start(dir);
  const firstGone = new Promise((resolve) => first.on("exit", resolve));
  await wait(300);
  const second = start(dir);
  try {
    await Promise.race([firstGone, wait(2000).then(() => { throw new Error("the first copy is still running"); })]);
    assert.strictEqual(fs.readFileSync(path.join(dir, "pid"), "utf8").trim(), String(second.pid));
  } finally { stop(first); stop(second); }
});
