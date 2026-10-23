// Adds the Trafiklab key from the repository's .env to the front of the built app.js, so the key is
// packaged with the app but never committed. Runs after scripts/build-app.js. Without TRAFIKLAB_KEY
// the app uses the SL Transport API only.
"use strict";

const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, "..", "..", "..", ".env");
const script = path.join(__dirname, "..", "build", "app.js");

let key = "";
if (fs.existsSync(envFile)) {
  const match = /^TRAFIKLAB_KEY=(.*)$/m.exec(fs.readFileSync(envFile, "utf8"));
  if (match) { key = match[1].replace(/\s+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2"); }
}

const config = "window.DEPARTURES_CONFIG = " + JSON.stringify({ trafiklabKey: key }) + ";\n";
fs.writeFileSync(script, config + fs.readFileSync(script, "utf8"));
console.log(key ? "Trafiklab key included" : "No TRAFIKLAB_KEY in .env, SL only");
