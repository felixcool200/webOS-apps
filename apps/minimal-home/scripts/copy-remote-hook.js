// Adds LG Input Hook's prebuilt injector and library (vendor/lginputhook) to the build, next to the
// boot script that loads them, with the notices and licences in third_party/remote-hook.
"use strict";

const fs = require("fs");
const path = require("path");

const vendor = path.join(__dirname, "..", "..", "..", "vendor", "lginputhook");
const target = path.join(__dirname, "..", "build", "remote-hook");
const licences = path.join(__dirname, "..", "..", "..", "third_party", "remote-hook");

if (!fs.existsSync(path.join(vendor, "service", "inputhook", "libinputhookpp.so"))) {
  throw new Error("vendor/lginputhook is missing; run: git submodule update --init");
}
for (const file of ["ezinject", "libinputhookpp.so"]) {
  fs.copyFileSync(path.join(vendor, "service", "inputhook", file), path.join(target, file));
}
fs.chmodSync(path.join(target, "ezinject"), 0o755);
fs.mkdirSync(path.join(target, "licenses"), { recursive: true });
for (const file of fs.readdirSync(licences)) {
  fs.copyFileSync(path.join(licences, file), path.join(target, "licenses", file));
}
console.log("Added LG Input Hook's injector and library");
