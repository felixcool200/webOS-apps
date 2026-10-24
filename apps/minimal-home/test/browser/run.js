// Runs Minimal Home's browser tests (the *.browser.js files here) in headless Chrome: each test in a
// fresh page of the built app, with the fake TV (fake-tv.js) instead of the real one, and Chrome's
// virtual time so waits take no real time. Reports like node --test and exits with 1 on a failure.
// Usage: node apps/minimal-home/test/browser/run.js [part of a test name]   (CHROME=path to override)
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const here = __dirname;
const app = path.join(here, "..", "..");
const root = path.join(app, "..", "..");
const CONCURRENCY = 4;
const DEFAULT_BUDGET_MS = 15000;

function findChrome() {
  if (process.env.CHROME) { return process.env.CHROME; }
  return ["google-chrome", "chromium", "chromium-browser"].find((name) => {
    try { execFileSync("which", [name], { stdio: "ignore" }); return true; } catch (error) { return false; }
  });
}

// The tests in a file: their names and virtual time budgets, from BrowserTest.define calls written as
// BrowserTest.define("name", { ...options... }, async (t) => { ... }).
function testsIn(file) {
  const source = fs.readFileSync(path.join(here, file), "utf8");
  const found = [];
  const pattern = /BrowserTest\.define\(\s*"([^"]+)",\s*([\s\S]*?),\s*async \(t\) =>/g;
  let match;
  while ((match = pattern.exec(source))) {
    const budget = /budget:\s*(\d+)/.exec(match[2]);
    found.push({ name: match[1], budget: budget ? Number(budget[1]) : DEFAULT_BUDGET_MS });
  }
  return found;
}

function preparePage(testFiles) {
  execFileSync("node", [path.join(root, "scripts", "build-app.js"), app], { stdio: "ignore" });
  const page = fs.mkdtempSync(path.join(os.tmpdir(), "minimal-home-browser-"));
  fs.cpSync(path.join(app, "build"), page, { recursive: true });
  for (const file of ["fake-tv.js", "browser-test.js", ...testFiles]) {
    fs.copyFileSync(path.join(here, file), path.join(page, file));
  }
  let html = fs.readFileSync(path.join(page, "index.html"), "utf8");
  html = html.replace('<script src="webos.js"></script>', '<script src="fake-tv.js"></script>\n  <script src="webos.js"></script>');
  html = html.replace('<script src="app.js"></script>', '<script src="app.js"></script>\n  <script src="browser-test.js"></script>\n' +
    testFiles.map((file) => '  <script src="' + file + '"></script>').join("\n"));
  fs.writeFileSync(path.join(page, "index.html"), html);
  return page;
}

function unescapeHtml(text) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function runTest(chrome, page, test, index) {
  return new Promise((resolve) => {
    const profile = path.join(page, ".profile-" + index);
    // Headless Chrome keeps 143 px of the window for its frame, so this gives the TV's 1920x1080 page.
    const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + profile, "--window-size=1920,1223",
      "--hide-scrollbars", "--virtual-time-budget=" + test.budget, "--dump-dom",
      "file://" + path.join(page, "index.html") + "#" + encodeURIComponent(test.name)];
    const child = spawn(chrome, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const killer = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.on("close", () => {
      clearTimeout(killer);
      const match = /<pre id="result">([\s\S]*?)<\/pre>/.exec(out);
      if (!match) { resolve({ ok: false, message: "The test didn't finish within " + test.budget + " ms of virtual time", log: [] }); return; }
      resolve(JSON.parse(unescapeHtml(match[1])));
    });
  });
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.log("# skipped: no Chrome found (set CHROME to its path)");
    return;
  }
  const filter = process.argv[2] || "";
  const files = fs.readdirSync(here).filter((file) => file.endsWith(".browser.js")).sort();
  const tests = files.flatMap(testsIn).filter((test) => test.name.includes(filter));
  const page = preparePage(files);
  const results = new Array(tests.length);
  let next = 0;
  async function worker() {
    while (next < tests.length) {
      const index = next++;
      results[index] = await runTest(chrome, page, tests[index], index);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  let failed = 0;
  tests.forEach((test, index) => {
    const result = results[index];
    console.log((result.ok ? "ok " : "not ok ") + (index + 1) + " - " + test.name);
    if (!result.ok) {
      failed += 1;
      console.log("  # " + result.message);
      (result.log || []).forEach((line) => console.log("  # log: " + line));
    }
  });
  console.log("# pass " + (tests.length - failed));
  console.log("# fail " + failed);
  fs.rmSync(page, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
}

main();
