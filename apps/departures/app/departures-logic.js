// The Departures app's rules that need no page or network: reading both APIs' departures, choosing a
// source, and the countdown text. app.js uses them; test/departures-logic.test.js checks them in Node.
var DeparturesLogic = (function () {
  "use strict";

  var GONE_STATES = { DEPARTED: true, PASSED: true, MISSED: true, ASSUMEDDEPARTED: true };
  var STATE_LABELS = { CANCELLED: "Cancelled", INHIBITED: "No stop", REPLACED: "Replaced" };

  // SL timestamps are Stockholm wall-clock times without an offset, read as UTC milliseconds so the
  // TV's own time zone setting does not matter.
  function parseWallClock(text) {
    var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(text || "");
    return match ? Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]) : NaN;
  }

  function pad(number) { return number < 10 ? "0" + number : String(number); }

  function clockText(wallClock) {
    var date = new Date(wallClock);
    return pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes());
  }

  // Stop deviations cover every mode at the site; keep the ones for this column's mode, once each.
  function relevantDeviations(list, mode) {
    var seen = {};
    return list.filter(function (deviation) {
      var lines = deviation.scope && deviation.scope.lines;
      var matches = !lines || !lines.length || lines.some(function (line) { return line.transport_mode === mode; });
      if (!matches || !deviation.message || seen[deviation.message]) { return false; }
      seen[deviation.message] = true;
      return true;
    });
  }

  // Both APIs are converted to the same entry shape. `label` replaces the countdown.
  function fromSl(departure) {
    // A cancelled trip is sometimes flagged only on the journey, with the departure still EXPECTED.
    var cancelled = departure.journey && departure.journey.state === "CANCELLED";
    return {
      line: departure.line && departure.line.designation,
      destination: departure.destination,
      direction: departure.direction || departure.destination || "",
      platform: "sl:" + (departure.stop_point && departure.stop_point.id),
      label: STATE_LABELS[cancelled ? "CANCELLED" : departure.state] || "",
      gone: !!GONE_STATES[departure.state],
      at: parseWallClock(departure.expected || departure.scheduled)
    };
  }

  function fromTrafiklab(departure) {
    var route = departure.route || {};
    var platform = departure.realtime_platform || departure.scheduled_platform || {};
    return {
      line: route.designation,
      destination: (route.destination && route.destination.name) || route.direction,
      direction: route.direction || "",
      platform: "trafiklab:" + platform.designation,
      label: departure.canceled ? STATE_LABELS.CANCELLED : "",
      gone: false,
      at: parseWallClock(departure.realtime || departure.scheduled)
    };
  }

  // Whether the departure belongs in the top half of a split stop.
  function isTop(config, entry) {
    if (config.topPlatforms) { return !!config.topPlatforms[entry.platform]; }
    return config.topDirection.test(entry.direction);
  }

  // Trafiklab when it has departures younger than maxAgeMs and its last request worked (or SL's
  // failed too), SL otherwise.
  function pick(stop, nowMs, maxAgeMs) {
    var trafiklab = stop.trafiklab;
    var recent = trafiklab.departures.length && nowMs - trafiklab.updated < maxAgeMs;
    return recent && (!trafiklab.error || stop.sl.error) ? trafiklab : stop.sl;
  }

  // SL now and then answers a stop that has traffic with `{"departures": [], "stop_deviations": []}`.
  // Up to `limit` empty answers in a row leave the last full answer in place. Returns whether
  // `departures` replaced the source's.
  function accept(source, departures, limit, nowMs) {
    source.error = null;
    if (!departures.length && source.departures.length && source.emptyAnswers < limit) {
      source.emptyAnswers += 1;
      return false;
    }
    source.departures = departures;
    source.emptyAnswers = 0;
    source.updated = nowMs;
    return true;
  }

  // Departures not yet gone, soonest first; one that left less than a minute ago still shows "Now".
  function upcoming(source, now) {
    return source.departures.filter(function (entry) {
      return !entry.gone && !isNaN(entry.at) && entry.at - now > -60000;
    }).sort(function (left, right) { return left.at - right.at; });
  }

  // The countdown for a departure at `at`: seconds show only for the next ten minutes, as small text
  // after the minutes, and the clock time from an hour away.
  function countdown(at, now) {
    var seconds = Math.floor((at - now) / 1000);
    if (seconds <= 0) { return { text: "Now", textClass: "", small: "", smallClass: "", soon: true }; }
    if (seconds < 60) { return { text: String(seconds), textClass: "count", small: "s", smallClass: "", soon: true }; }
    if (seconds < 600) {
      return { text: String(Math.floor(seconds / 60)), textClass: "", small: ":" + pad(seconds % 60), smallClass: "seconds", soon: false };
    }
    if (seconds < 3600) { return { text: String(Math.floor(seconds / 60)), textClass: "", small: "min", smallClass: "", soon: false }; }
    return { text: clockText(at), textClass: "", small: "", smallClass: "", soon: false };
  }

  return {
    STATE_LABELS: STATE_LABELS, parseWallClock: parseWallClock, pad: pad, clockText: clockText,
    relevantDeviations: relevantDeviations, fromSl: fromSl, fromTrafiklab: fromTrafiklab, isTop: isTop,
    pick: pick, accept: accept, upcoming: upcoming, countdown: countdown
  };
}());

if (typeof module !== "undefined") { module.exports = DeparturesLogic; }
