// Switches between two apps (Departures and Minimal Home unless given) on the TV in .env, the way Home
// opens an app (a Luna launch as root), and reports per switch what the window manager did: whether the
// app left was restarted in the background (mode autoReload), how long a splash was shown, whether one
// was still on screen WAIT seconds later although the app had shown its window (stuck; "slow" when the
// app hadn't shown it yet), and how long the app took to show. With --cold the
// second app is closed before each switch to it, so it starts cold while the window manager closes and
// restarts the first: with Departures and Minimal Home that leaves a splash on screen most times.
// Usage: node scripts/switch-test.js [--cold] [switches each way, default 5] [wait in seconds, default 4]
//        [app id] [app id]
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const cold = process.argv.includes("--cold");
const args = process.argv.slice(2).filter((arg) => arg !== "--cold");
const cycles = Number(args[0] || 5);
const wait = Number(args[1] || 4);
const APPS = { first: args[2] || "org.webosbrew.departures", second: args[3] || "org.webosbrew.minimalhome" };
const SPLASH = "com.webos.app.splash";

function readEnv() {
  const env = {};
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) { throw new Error("Missing .env; copy .env.example and fill it in"); }
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) { env[match[1]] = match[2].replace(/\s+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2"); }
  }
  return env;
}

// Runs a script on the TV: uploaded to a file, then run with /dev/null as stdin, which luna-send needs
// (see SKILL.md).
function onTv(env, script) {
  const key = env.TV_SSH_KEY.includes("/") ? env.TV_SSH_KEY : path.join(os.homedir(), ".ssh", env.TV_SSH_KEY);
  const remote = "cat > /tmp/switch-test.sh && sh /tmp/switch-test.sh </dev/null; rm -f /tmp/switch-test.sh";
  const result = spawnSync("ssh", ["-i", key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "root@" + env.TV_HOST, remote],
    { input: script, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) { throw new Error("ssh failed: " + (result.stderr || result.status)); }
  return result.stdout;
}

const script = `L=luna://com.webos.service.applicationmanager
echo "state $(luna-send -n 1 luna://com.webos.memorymanager/getCurrentMemState '{}')"
echo "keep $(luna-send -n 1 luna://com.webos.memorymanager/getConfigs '{}' | grep -o '"KeepOnLaunchEx":\\[[^]]*\\]')"
for a in ${APPS.first} ${APPS.second}; do echo "version $a $(luna-send -n 1 $L/getAppInfo "{\\"id\\":\\"$a\\"}" | grep -o '"version":"[^"]*"')"; done
echo "running $(luna-send -n 1 $L/running '{}' | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | tr '\\n' ' ')"
start=$(date -u +%Y-%m-%dT%H:%M:%S)
i=0
while [ $i -lt ${cycles} ]; do
  i=$((i + 1))
  for app in ${APPS.first} ${APPS.second}; do
    if [ ${cold ? 1 : 0} = 1 ] && [ $app = ${APPS.second} ]; then
      luna-send -n 1 $L/closeByAppId "{\\"id\\":\\"$app\\"}" >/dev/null
      sleep 2
    fi
    luna-send -n 1 $L/launch "{\\"id\\":\\"$app\\"}" >/dev/null
    sleep ${wait}
    echo "windows $i $app $(luna-send -n 1 luna://com.webos.surfacemanager/getForegroundWindowInfo '{}' | grep -o '"appId": "[^"]*"' | cut -d'"' -f4 | tr '\\n' ' ')"
  done
done
echo "log"
awk -v s="$start" '$1 >= s' /var/log/messages | grep -E 'NL_APP_LAUNCH_BEGIN|NL_VSC'
`;

function parseEvents(lines) {
  return lines.map((line) => {
    const match = /^(\S+)Z .*?(NL_\w+) (\{.*\})/.exec(line);
    if (!match) { return null; }
    return { at: Date.parse(match[1] + "Z"), kind: match[2], data: JSON.parse(match[3]) };
  }).filter(Boolean);
}

function main() {
  const env = readEnv();
  console.log(`Switching ${cycles} times each way, ${wait} s apart${cold ? ", closing " + APPS.second + " before each switch to it" : ""}…`);
  const output = onTv(env, script).split("\n");
  const logAt = output.indexOf("log");
  const head = output.slice(0, logAt);
  head.filter((line) => /^(state|keep|version|running) /.test(line)).forEach((line) => console.log("  " + line));
  const windows = head.filter((line) => line.startsWith("windows ")).map((line) => {
    const [, cycle, app, ...shown] = line.split(" ");
    return { cycle: Number(cycle), app, shown: shown.filter(Boolean) };
  });
  const events = parseEvents(output.slice(logAt + 1));
  const launches = events.filter((event) => event.kind === "NL_APP_LAUNCH_BEGIN" && /^com\.webos\.lunasend/.test(event.data.caller_id) &&
    Object.values(APPS).includes(event.data.app_id));

  const rows = windows.map((check, index) => {
    const launch = launches[index];
    if (!launch || launch.data.app_id !== check.app) { return { check, error: "launch not found in the log" }; }
    const end = launches[index + 1] ? launches[index + 1].at : Infinity;
    const during = events.filter((event) => event.at >= launch.at && event.at < end);
    const restarted = [...new Set(during.filter((event) => event.data.mode === "autoReload").map((event) => event.data.app_id))];
    const splashOn = during.find((event) => event.kind === "NL_VSC" && event.data.app_id === SPLASH && event.data.visible);
    const splashOff = splashOn && during.find((event) => event.at >= splashOn.at && event.kind === "NL_VSC" && event.data.app_id === SPLASH && !event.data.visible);
    const shown = during.find((event) => event.kind === "NL_VSC" && event.data.app_id === check.app && event.data.visible);
    // The window list is read WAIT seconds after the launch; a splash then is only stuck if the app had
    // shown its window by then.
    const shownInTime = shown && shown.at < launch.at + wait * 1000;
    const splashUp = check.shown.includes(SPLASH);
    return {
      check,
      restarted,
      splash: splashOn ? (splashOff ? (splashOff.at - splashOn.at) + " ms" : "never hidden") : "none",
      // Until the splash covers the screen, it is black (or the previous app).
      splashAt: splashOn ? splashOn.at - launch.at : null,
      stuck: splashUp && shownInTime,
      slow: !shownInTime,
      shownAfter: shown ? (shown.at - launch.at) + " ms" : "not shown"
    };
  });

  console.log("\n  #  to                        restarted in background        splash at  splash          shown after   stuck");
  for (const row of rows) {
    const to = row.check.app.replace(/^org\.webosbrew\./, "").padEnd(25);
    if (row.error) { console.log(`  ${row.check.cycle}  ${to} ${row.error}`); continue; }
    console.log(`  ${row.check.cycle}  ${to} ${(row.restarted.join(", ") || "-").padEnd(30)} ${(row.splashAt === null ? "-" : row.splashAt + " ms").padEnd(10)} ${row.splash.padEnd(15)} ${row.shownAfter.padEnd(13)} ${row.stuck ? "STUCK" : row.slow ? "slow" : "-"}`);
  }
  const counted = rows.filter((row) => !row.error);
  const stuck = counted.filter((row) => row.stuck);
  const withRestart = counted.filter((row) => row.restarted.some((id) => Object.values(APPS).includes(id)));
  const slow = counted.filter((row) => row.slow);
  // Only splashes that worked: a stuck one first flashes at once.
  const clean = counted.filter((row) => row.splashAt !== null && !row.stuck).map((row) => row.splashAt).sort((a, b) => a - b);
  if (clean.length) {
    console.log(`\n  splash appeared after ${clean[Math.floor(clean.length / 2)]} ms (median of ${clean.length} switches that weren't stuck)`);
  }
  console.log(`\n  ${stuck.length} of ${counted.length} switches left a splash on screen after the app showed (${slow.length} apps too slow to tell); ` +
    `${withRestart.length} had one of our apps restarted in the background, ` +
    `${stuck.filter((row) => withRestart.includes(row)).length} of the stuck ones among them.`);
}

main();
