// Writes app/config.js from the repository's .env so the Trafiklab key is packaged with the
// app but never committed. Without TRAFIKLAB_KEY the app uses the SL Transport API only.
"use strict";

const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, "..", "..", "..", ".env");
const configFile = path.join(__dirname, "..", "app", "config.js");

let key = "";
if (fs.existsSync(envFile)) {
  const match = /^TRAFIKLAB_KEY=(.*)$/m.exec(fs.readFileSync(envFile, "utf8"));
  if (match) { key = match[1].replace(/\s+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2"); }
}

fs.writeFileSync(configFile, "window.DEPARTURES_CONFIG = " + JSON.stringify({ trafiklabKey: key }) + ";\n");
console.log(key ? "config.js: Trafiklab key included" : "config.js: no TRAFIKLAB_KEY in .env, SL only");
