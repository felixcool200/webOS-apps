// Builds an app into apps/<name>/build/ for packaging. The shared files are merged with the app's
// style.css and app.js, and both are inlined into index.html, so the TV reads one file at startup
// instead of three. Usage: node scripts/build-app.js apps/<name>
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appDir = path.resolve(process.argv[2] || ".");
const source = path.join(appDir, "app");
const build = path.join(appDir, "build");

function read(file) { return fs.readFileSync(file, "utf8"); }

function inline(html, tag, open, content, close) {
  if (!html.includes(tag)) { throw new Error(path.join(source, "index.html") + " has no " + tag); }
  if (content.includes(close)) { throw new Error("Cannot inline content that contains " + close); }
  return html.replace(tag, () => open + "\n" + content + close);
}

const css = read(path.join(root, "shared", "base.css")) + "\n" + read(path.join(source, "style.css"));
const js = read(path.join(root, "shared", "webos.js")) + "\n" + read(path.join(source, "app.js"));
let html = read(path.join(source, "index.html"));
html = inline(html, '<link rel="stylesheet" href="style.css">', "<style>", css, "</style>");
html = inline(html, '<script src="app.js"></script>', "<script>", js, "</script>");

fs.rmSync(build, { recursive: true, force: true });
fs.cpSync(source, build, { recursive: true });
fs.rmSync(path.join(build, "style.css"));
fs.rmSync(path.join(build, "app.js"));
fs.writeFileSync(path.join(build, "index.html"), html);
console.log("Built " + path.relative(root, build));
