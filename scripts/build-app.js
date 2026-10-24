// Builds an app into apps/<name>/build/ for packaging: a copy of app/ plus the shared files
// (base.css, webos.js, ui.js and splash.png for appinfo.json's splashBackground). index.html loads the
// shared files before the app's own. Usage: node scripts/build-app.js apps/<name>
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appDir = path.resolve(process.argv[2] || ".");
const build = path.join(appDir, "build");
const SHARED = ["base.css", "webos.js", "ui.js", "theme.js", "splash.png"];

for (const file of SHARED) {
  if (fs.existsSync(path.join(appDir, "app", file))) {
    throw new Error("app/" + file + " would be replaced by shared/" + file + "; rename it");
  }
}
fs.rmSync(build, { recursive: true, force: true });
fs.cpSync(path.join(appDir, "app"), build, { recursive: true });
for (const file of SHARED) {
  fs.copyFileSync(path.join(root, "shared", file), path.join(build, file));
}
console.log("Built " + path.relative(root, build));
