// Builds an app into apps/<name>/build/ for packaging: a copy of app/ with shared/base.css put in
// front of style.css, shared/webos.js in front of app.js, and shared/splash.png for appinfo.json's
// splashBackground. Usage: node scripts/build-app.js apps/<name>
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appDir = path.resolve(process.argv[2] || ".");
const build = path.join(appDir, "build");

fs.rmSync(build, { recursive: true, force: true });
fs.cpSync(path.join(appDir, "app"), build, { recursive: true });
for (const [file, shared] of [["style.css", "base.css"], ["app.js", "webos.js"]]) {
  const target = path.join(build, file);
  const merged = fs.readFileSync(path.join(root, "shared", shared), "utf8") + "\n" + fs.readFileSync(target, "utf8");
  fs.writeFileSync(target, merged);
}
fs.copyFileSync(path.join(root, "shared", "splash.png"), path.join(build, "splash.png"));
console.log("Built " + path.relative(root, build));
