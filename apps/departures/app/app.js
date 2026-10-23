(function () {
  "use strict";

  // SL Transport API (Trafiklab "SL Transport"): no API key, CORS open to any origin.
  // Site ids come from https://transport.integration.sl.se/v1/sites.
  var API = "https://transport.integration.sl.se/v1/sites/";
  var STOPS = [
    { id: 2000, name: "Torsvikstorg", mode: "BUS", label: "Bus" },
    { id: 9252, name: "Torsvik", mode: "TRAM", label: "Tram · Lidingöbanan" },
    { id: 9220, name: "Ropsten", mode: "METRO", label: "Metro · Red line" }
  ];
  var FORECAST_MINUTES = 120;
  var MAX_ROWS = 8;
  var REFRESH_MS = 30000;
  var TICK_MS = 5000;
  var REQUEST_TIMEOUT_MS = 10000;
  var GONE_STATES = { DEPARTED: true, PASSED: true, MISSED: true, ASSUMEDDEPARTED: true };
  var STATE_LABELS = { CANCELLED: "Cancelled", INHIBITED: "No stop", REPLACED: "Replaced" };

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461 };
  var stops = STOPS.map(function (stop) {
    return { config: stop, departures: [], deviations: [], updated: 0, error: null };
  });
  var loading = null;
  var refreshTimer = null;
  var tickTimer = null;

  var stockholmFormat = null;
  try {
    stockholmFormat = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Stockholm", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  } catch (error) {
    console.warn("Europe/Stockholm time zone unavailable, using the TV's local time: " + error.message);
  }

  // SL timestamps are Stockholm wall-clock times without an offset. Both sides are
  // compared as wall-clock milliseconds so the TV's own time zone setting does not matter.
  function stockholmNow() {
    var now = new Date();
    if (stockholmFormat && stockholmFormat.formatToParts) {
      var parts = {};
      stockholmFormat.formatToParts(now).forEach(function (part) { parts[part.type] = part.value; });
      return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    }
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
  }

  function parseWallClock(text) {
    var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(text || "");
    return match ? Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]) : NaN;
  }

  function pad(number) { return number < 10 ? "0" + number : String(number); }

  function clockText(wallClock) {
    var date = new Date(wallClock);
    return pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes());
  }

  function getJson(url) {
    return new Promise(function (resolve, reject) {
      var request = new XMLHttpRequest();
      request.open("GET", url);
      request.timeout = REQUEST_TIMEOUT_MS;
      request.onload = function () {
        if (request.status !== 200) { reject(new Error("HTTP " + request.status)); return; }
        try { resolve(JSON.parse(request.responseText)); }
        catch (error) { reject(new Error("Invalid JSON: " + error.message)); }
      };
      request.onerror = function () { reject(new Error("Network error")); };
      request.ontimeout = function () { reject(new Error("Timed out")); };
      request.send();
    });
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function setStatus(message, type) {
    var box = document.getElementById("status");
    box.textContent = message;
    box.className = type || "";
  }

  // Stop deviations cover every mode at the site; keep the ones for this column's mode.
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

  function upcoming(stop, now) {
    return stop.departures.map(function (departure) {
      return {
        line: departure.line && departure.line.designation,
        destination: departure.destination,
        state: departure.state,
        at: parseWallClock(departure.expected || departure.scheduled)
      };
    }).filter(function (entry) {
      return !GONE_STATES[entry.state] && !isNaN(entry.at) && entry.at - now > -60000;
    }).sort(function (left, right) { return left.at - right.at; });
  }

  function timeCell(entry, now) {
    var cell = element("span", "time");
    var label = STATE_LABELS[entry.state];
    var minutes = Math.floor((entry.at - now) / 60000);
    if (label) {
      cell.textContent = label;
    } else if (minutes < 1) {
      cell.textContent = "Now";
      cell.classList.add("is-now");
    } else if (minutes < 60) {
      cell.textContent = String(minutes);
      cell.appendChild(element("small", "", "min"));
    } else {
      cell.textContent = clockText(entry.at);
    }
    return cell;
  }

  function renderStop(stop, now) {
    var card = document.querySelector('[data-stop="' + stop.config.id + '"]');
    var list = card.querySelector(".departures");
    var notice = card.querySelector(".notice");
    var entries = upcoming(stop, now).slice(0, MAX_ROWS);

    notice.textContent = stop.deviations.map(function (deviation) { return deviation.message; }).join("  ·  ");
    notice.classList.toggle("is-hidden", !stop.deviations.length);

    list.textContent = "";
    if (!entries.length) {
      var message = stop.error ? "Could not load departures" :
        stop.updated ? "No departures in the next " + FORECAST_MINUTES / 60 + " hours" : "Loading…";
      list.appendChild(element("li", "empty" + (stop.error ? " is-error" : ""), message));
      return;
    }
    entries.forEach(function (entry) {
      var row = element("li", "departure" + (STATE_LABELS[entry.state] ? " is-cancelled" : ""));
      row.appendChild(element("span", "line", entry.line || "–"));
      row.appendChild(element("span", "destination", entry.destination || ""));
      row.appendChild(timeCell(entry, now));
      list.appendChild(row);
    });
    // Drop rows that would be cut off when a notice takes up space.
    while (list.children.length > 1 && list.lastChild.offsetTop + list.lastChild.offsetHeight > list.clientHeight + 1) {
      list.removeChild(list.lastChild);
    }
  }

  function render() {
    var now = stockholmNow();
    document.getElementById("clock").textContent = clockText(now);
    stops.forEach(function (stop) { renderStop(stop, now); });
  }

  function reportStatus() {
    var failed = stops.filter(function (stop) { return stop.error; });
    var now = stockholmNow();
    if (!failed.length) {
      setStatus("Updated " + clockText(now), "ok");
      return;
    }
    var oldest = Math.min.apply(null, stops.map(function (stop) { return stop.updated; }));
    var suffix = oldest ? " · showing data from " + clockText(now - (Date.now() - oldest)) : "";
    setStatus("Could not reach SL (" + failed[0].error.message + ")" + suffix, "error");
  }

  function loadStop(stop) {
    var url = API + stop.config.id + "/departures?transport=" + stop.config.mode + "&forecast=" + FORECAST_MINUTES;
    return getJson(url).then(function (data) {
      stop.departures = data.departures || [];
      stop.deviations = relevantDeviations(data.stop_deviations || [], stop.config.mode);
      stop.updated = Date.now();
      stop.error = null;
    }).catch(function (error) {
      stop.error = error;
      console.error("Departures for " + stop.config.name + " failed: " + error.message);
    });
  }

  function load() {
    if (loading) { return loading; }
    setStatus("Updating…");
    loading = Promise.all(stops.map(loadStop)).then(function () {
      loading = null;
      render();
      reportStatus();
    });
    return loading;
  }

  function startPolling() {
    stopPolling();
    load();
    refreshTimer = window.setInterval(load, REFRESH_MS);
    tickTimer = window.setInterval(render, TICK_MS);
  }

  function stopPolling() {
    window.clearInterval(refreshTimer);
    window.clearInterval(tickTimer);
    refreshTimer = null;
    tickTimer = null;
  }

  function buildColumns() {
    var box = document.getElementById("stops");
    STOPS.forEach(function (config) {
      var card = element("section", "stop");
      card.setAttribute("data-stop", config.id);
      card.setAttribute("data-mode", config.mode);
      var head = element("div", "stop-head");
      head.appendChild(element("h2", "", config.name));
      head.appendChild(element("p", "mode", config.label));
      card.appendChild(head);
      card.appendChild(element("ol", "departures"));
      card.appendChild(element("p", "notice is-hidden"));
      box.appendChild(card);
    });
  }

  function initKeys() {
    document.addEventListener("keydown", function (event) {
      if (event.keyCode === KEY.BACK) {
        event.preventDefault();
        if (window.webOSSystem && window.webOSSystem.close) { window.webOSSystem.close(); }
      } else if (event.keyCode === KEY.ENTER) {
        event.preventDefault();
        load();
      } else if ([KEY.LEFT, KEY.UP, KEY.RIGHT, KEY.DOWN].indexOf(event.keyCode) !== -1) {
        event.preventDefault();
      }
    });
  }

  function init() {
    buildColumns();
    initKeys();
    render();
    document.addEventListener("webOSRelaunch", startPolling);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { stopPolling(); }
      else { startPolling(); }
    });
    startPolling();
  }

  document.addEventListener("DOMContentLoaded", init);
}());
