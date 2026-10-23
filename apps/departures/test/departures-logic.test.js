"use strict";

const test = require("node:test");
const assert = require("node:assert");
const Logic = require("../app/departures-logic.js");

const NOON = Date.UTC(2026, 9, 24, 12, 0, 0);

test("SL departures are read as Stockholm wall-clock times", () => {
  const entry = Logic.fromSl({
    line: { designation: "206" }, destination: "Ropsten", direction: "Ropsten",
    stop_point: { id: 20022 }, state: "EXPECTED", scheduled: "2026-10-24T12:04:00", expected: "2026-10-24T12:05:30"
  });
  assert.deepStrictEqual(entry, {
    line: "206", destination: "Ropsten", direction: "Ropsten", platform: "sl:20022",
    label: "", gone: false, at: NOON + 5.5 * 60000
  });
});

test("an SL trip cancelled only on its journey still shows as cancelled", () => {
  const entry = Logic.fromSl({ state: "EXPECTED", journey: { state: "CANCELLED" }, scheduled: "2026-10-24T12:04:00" });
  assert.strictEqual(entry.label, "Cancelled");
});

test("departed SL trips are marked gone and dropped from upcoming", () => {
  const gone = Logic.fromSl({ state: "DEPARTED", scheduled: "2026-10-24T12:01:00" });
  const next = Logic.fromSl({ state: "EXPECTED", scheduled: "2026-10-24T12:03:00" });
  const later = Logic.fromSl({ state: "EXPECTED", scheduled: "2026-10-24T12:09:00" });
  assert.deepStrictEqual(Logic.upcoming({ departures: [later, gone, next] }, NOON), [next, later]);
});

test("a departure that left under a minute ago is still upcoming", () => {
  const justLeft = { gone: false, at: NOON - 30000 };
  const longGone = { gone: false, at: NOON - 90000 };
  assert.deepStrictEqual(Logic.upcoming({ departures: [justLeft, longGone] }, NOON), [justLeft]);
});

test("Trafiklab departures use the realtime platform and the canceled flag", () => {
  const entry = Logic.fromTrafiklab({
    route: { designation: "21", direction: "Ropsten", destination: { name: "Ropsten" } },
    scheduled_platform: { designation: "1" }, realtime_platform: { designation: "2" },
    scheduled: "2026-10-24T12:00:00", realtime: "2026-10-24T12:01:00", canceled: true
  });
  assert.strictEqual(entry.platform, "trafiklab:2");
  assert.strictEqual(entry.label, "Cancelled");
  assert.strictEqual(entry.at, NOON + 60000);
});

test("split stops sort by platform or by direction", () => {
  assert.strictEqual(Logic.isTop({ topPlatforms: { "sl:20022": true } }, { platform: "sl:20022" }), true);
  assert.strictEqual(Logic.isTop({ topPlatforms: { "sl:20022": true } }, { platform: "sl:20023" }), false);
  assert.strictEqual(Logic.isTop({ topDirection: /^Ropsten\b/ }, { direction: "Ropsten" }), true);
  assert.strictEqual(Logic.isTop({ topDirection: /^Ropsten\b/ }, { direction: "Gåshaga brygga" }), false);
});

test("Trafiklab is used while it is recent and working, SL otherwise", () => {
  const sl = { departures: [{}], error: null };
  const fresh = { departures: [{}], updated: 1000, error: null };
  assert.strictEqual(Logic.pick({ sl, trafiklab: fresh }, 1500, 1000), fresh);
  assert.strictEqual(Logic.pick({ sl, trafiklab: fresh }, 2500, 1000), sl, "too old");
  const failing = { departures: [{}], updated: 1000, error: new Error("HTTP 500") };
  assert.strictEqual(Logic.pick({ sl, trafiklab: failing }, 1500, 1000), sl);
  const slFailing = { departures: [], error: new Error("Network error") };
  assert.strictEqual(Logic.pick({ sl: slFailing, trafiklab: failing }, 1500, 1000), failing, "both failing keeps Trafiklab's data");
  assert.strictEqual(Logic.pick({ sl, trafiklab: { departures: [], updated: 1000, error: null } }, 1500, 1000), sl, "empty");
});

test("stop notices keep the ones for the column's mode, once each", () => {
  const bus = { message: "Bus stop moved", scope: { lines: [{ transport_mode: "BUS" }] } };
  const tram = { message: "No trams", scope: { lines: [{ transport_mode: "TRAM" }] } };
  const everyone = { message: "Lift out of order" };
  const kept = Logic.relevantDeviations([bus, tram, everyone, Object.assign({}, bus)], "BUS");
  assert.deepStrictEqual(kept.map((deviation) => deviation.message), ["Bus stop moved", "Lift out of order"]);
});

test("the countdown shows seconds near departure, minutes later and the clock after an hour", () => {
  const shown = (seconds) => {
    const parts = Logic.countdown(NOON + seconds * 1000, NOON);
    return parts.text + parts.small;
  };
  assert.strictEqual(shown(0), "Now");
  assert.strictEqual(shown(-20), "Now");
  assert.strictEqual(shown(42), "42s");
  assert.strictEqual(shown(125), "2:05");
  assert.strictEqual(shown(600), "10min");
  assert.strictEqual(shown(3600), "13:00");
  assert.strictEqual(Logic.countdown(NOON + 42000, NOON).soon, true);
  assert.strictEqual(Logic.countdown(NOON + 60000, NOON).soon, false);
});
