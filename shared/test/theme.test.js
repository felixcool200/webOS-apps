"use strict";

const test = require("node:test");
const assert = require("node:assert");
const Theme = require("../theme.js");

test("a theme sets the accent, its rgb parts for tints, and its background's colours", () => {
  assert.deepStrictEqual(Theme.variables({ id: "x", name: "X", accent: "#72d6ff", background: "forest" }), {
    "--accent": "#72d6ff", "--accent-rgb": "114, 214, 255", "--bg": "#06120d",
    "--glow-a": "rgba(22, 110, 72, 0.4)", "--glow-b": "rgba(90, 120, 40, 0.22)"
  });
});

test("only well-formed themes are accepted, so a broken saved theme falls back to the first preset", () => {
  assert.strictEqual(Theme.isTheme(Theme.PRESETS[1]), true);
  assert.strictEqual(Theme.isTheme({ id: "x", name: "X", accent: "red", background: "night" }), false);
  assert.strictEqual(Theme.isTheme({ id: "x", name: "X", accent: "#ffffff", background: "space" }), false);
  assert.strictEqual(Theme.parse("{oops"), null);
});

test("every preset uses a known background and a palette accent", () => {
  Theme.PRESETS.forEach((preset) => {
    assert.ok(Theme.isTheme(preset), preset.id);
    assert.ok(Theme.ACCENTS.some((accent) => accent.color === preset.accent), preset.id + "'s accent is in the palette");
  });
});

// theme.js with fake browser parts: localStorage, the page's style, and WebOS.rootShell answering from
// `shell` (a function of the command). Retries happen at once.
function loadTheme(shell, stored) {
  const storage = new Map(Object.entries(stored || {}));
  const set = [];
  global.window = { localStorage: { getItem: (key) => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, value) } };
  global.document = { documentElement: { style: { setProperty: (name, value) => set.push([name, value]) } } };
  const commands = [];
  global.WebOS = {
    base64: (text) => Buffer.from(text).toString("base64"),
    retry: (task, delays) => task().catch((error) => (delays.length ? global.WebOS.retry(task, delays.slice(1)) : Promise.reject(error))),
    rootShell: (command) => { commands.push(command); return shell(command); }
  };
  delete require.cache[require.resolve("../theme.js")];
  const loaded = require("../theme.js");
  set.length = 0;
  return { Theme: loaded, storage, set, commands };
}

const FOREST = { id: "forest", name: "Forest", accent: "#7ee2a8", background: "forest" };
const reply = (text) => Promise.resolve({ stdoutString: text });

test("sync takes a theme another app chose, and keeps it for the next start", async () => {
  const { Theme, storage, set } = loadTheme(() => reply(JSON.stringify(FOREST)));
  await Theme.sync();
  assert.deepStrictEqual(JSON.parse(storage.get("theme.current")), FOREST);
  assert.ok(set.some(([name, value]) => name === "--accent" && value === "#7ee2a8"));
});

test("sync changes nothing when the file has the theme in use, or is broken or missing", async () => {
  for (const text of [JSON.stringify(FOREST), "{oops", "", JSON.stringify({ id: "x", name: "X", accent: "#ffffff", background: "space" })]) {
    const { Theme, set } = loadTheme(() => reply(text), { "theme.current": JSON.stringify(FOREST) });
    await Theme.sync();
    assert.deepStrictEqual(set, [], text);
  }
});

test("sync tries again when the root call fails", async () => {
  let calls = 0;
  const { Theme, storage } = loadTheme(() => (calls++ ? reply(JSON.stringify(FOREST)) : Promise.reject(new Error("busy"))));
  await Theme.sync();
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(JSON.parse(storage.get("theme.current")), FOREST);
});

test("themes chosen during a write are written one at a time, ending with the latest", async () => {
  const done = [];
  let running = 0;
  const { Theme, commands } = loadTheme(() => {
    running += 1;
    assert.strictEqual(running, 1, "never two writes at once");
    return new Promise((resolve) => setTimeout(() => { running -= 1; done.push(1); resolve({ stdoutString: "" }); }, 20));
  });
  const first = Theme.share(Theme.PRESETS[0]);
  Theme.share(Theme.PRESETS[1]);
  const last = Theme.share(Theme.PRESETS[2]);
  await Promise.all([first, last]);
  assert.strictEqual(commands.length, 2, "the theme replaced while waiting is never written");
  assert.match(commands[1], new RegExp(Buffer.from(JSON.stringify(Theme.PRESETS[2])).toString("base64").replace(/[+/=]/g, "\\$&")));
  assert.match(commands[1], /cp \S+\/org\.webosbrew\.minimalhome\/splashes\/forest\.png \S+\/splash\.png\.new && mv .* && for app in org\.webosbrew\.minimalhome org\.webosbrew\.departures; do/);
});

test("a write that fails after its retries is reported, and Home knows to write it again", async () => {
  let fail = true;
  const { Theme, storage } = loadTheme(() => (fail ? Promise.reject(new Error("busy")) : reply("")));
  storage.set("theme.current", JSON.stringify(FOREST));
  await assert.rejects(Theme.share(FOREST), /busy/);
  assert.strictEqual(Theme.isShared(), false);
  fail = false;
  await Theme.share(FOREST);
  assert.strictEqual(Theme.isShared(), true);
});
