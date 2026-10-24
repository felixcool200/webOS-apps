(function () {
  "use strict";

  // Trafiklab Realtime API: every departure in the next 60 minutes, with a `canceled` flag. It needs
  // a key, which the build puts in front of app.js from .env (scripts/write-config.js). Area ids come
  // from /v1/stops/name/{name}.
  var TRAFIKLAB_API = "https://realtime-api.trafiklab.se/v1/departures/";
  var TRAFIKLAB_KEY = (window.DEPARTURES_CONFIG && window.DEPARTURES_CONFIG.trafiklabKey) || "";
  // SL Transport API: no key, but at most three departures per line and direction. It is the
  // fallback when Trafiklab fails or has no key, and the only source of stop notices.
  // Site ids come from https://transport.integration.sl.se/v1/sites.
  var SL_API = "https://transport.integration.sl.se/v1/sites/";
  // Stops with `split` show departures on a `topPlatforms` platform, or with a direction matching
  // `topDirection`, in the top half and the rest below.
  var STOPS = [
    { id: 2000, area: "740045933", name: "Torsvikstorg", mode: "BUS", label: "Bus", split: ["From Lidingö", "To Lidingö"],
      // The Ropsten side of the road: every bus to Ropsten (SL stop point 20022, Trafiklab
      // platform 2) and 238 to Högsätra (20024, platform 3). 238 to Näset leaves from the other side.
      topPlatforms: { "sl:20022": true, "sl:20024": true, "trafiklab:2": true, "trafiklab:3": true } },
    { id: 9252, area: "740024788", name: "Torsvik", mode: "TRAM", label: "Tram · Lidingöbanan", split: ["From Lidingö", "To Lidingö"],
      // Tram platforms at Torsvik can serve both directions, so the tram splits by direction instead.
      topDirection: /^Ropsten\b/ },
    { id: 9220, area: "740020757", name: "Ropsten", mode: "METRO", label: "Metro · Red line" }
  ];
  var FORECAST_MINUTES = 120;
  var MAX_ROWS = 8;
  var REFRESH_MS = 30000;
  // Up/Down change how often Trafiklab is asked. Three stops every 90 s is 86,400 requests in 30 days
  // of nonstop use, under the 100,000 a month of a Bronze key. Below 60 s gives nothing new because
  // Trafiklab caches answers for 60 s.
  var TRAFIKLAB_SECONDS = { initial: 90, min: 60, max: 600, step: 15 };
  var TRAFIKLAB_SECONDS_KEY = "departures.trafiklabSeconds";
  // SL now and then answers with an empty list for a stop that has traffic. An empty answer
  // only replaces departures that are older than this.
  var EMPTY_GRACE_MS = 2 * 60000;
  var RENDER_MS = 5000;
  // Short enough that the seconds never visibly skip; tick() only touches cells whose text changes.
  var TICK_MS = 250;
  var REQUEST_TIMEOUT_MS = 10000;

  var KEY = WebOS.KEY;
  var Logic = DeparturesLogic;
  var clockText = Logic.clockText;
  function emptySource(name) {
    return { name: name, departures: [], updated: 0, error: null };
  }
  var stops = STOPS.map(function (stop) {
    return { config: stop, sl: emptySource("SL"), trafiklab: emptySource("Trafiklab"), deviations: [] };
  });
  var loading = {};
  var trafiklabSeconds = savedTrafiklabSeconds();
  var refreshTimer = null;
  var trafiklabTimer = null;
  var renderTimer = null;
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
    UI.setStatus("status", message, type);
  }

  // Trafiklab's departures count as recent for two of its refreshes plus one of SL's, so one missed
  // Trafiklab refresh doesn't switch to SL.
  function pick(stop) {
    return Logic.pick(stop, Date.now(), trafiklabSeconds * 2000 + REFRESH_MS);
  }

  function fillTime(cell, at, now) {
    var parts = Logic.countdown(at, now);
    if (cell.shown === parts.text + parts.small) { return; }
    cell.shown = parts.text + parts.small;
    cell.textContent = "";
    cell.appendChild(element("span", parts.textClass, parts.text));
    if (parts.small) { cell.appendChild(element("small", parts.smallClass, parts.small)); }
    cell.classList.toggle("is-now", parts.soon);
  }

  function timeCell(entry, now) {
    var cell = element("span", "time");
    if (entry.label) {
      cell.textContent = entry.label;
    } else {
      cell.setAttribute("data-at", entry.at);
      fillTime(cell, entry.at, now);
    }
    return cell;
  }

  function tick() {
    var now = stockholmNow();
    var cells = document.querySelectorAll(".time[data-at]");
    var clock = document.getElementById("clock");
    var text = clockText(now);
    if (clock.textContent !== text) { clock.textContent = text; }
    for (var i = 0; i < cells.length; i += 1) {
      fillTime(cells[i], +cells[i].getAttribute("data-at"), now);
    }
  }

  function renderList(list, entries, source, now) {
    list.textContent = "";
    if (!entries.length) {
      var message = source.error ? "Could not load departures" :
        source.updated ? "No departures in the next " + FORECAST_MINUTES / 60 + " hours" : "Loading…";
      list.appendChild(element("li", "empty" + (source.error ? " is-error" : ""), message));
      return;
    }
    entries.slice(0, MAX_ROWS).forEach(function (entry) {
      var row = element("li", "departure" + (entry.label ? " is-cancelled" : ""));
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

  function renderStop(stop, now) {
    var card = document.querySelector('[data-stop="' + stop.config.id + '"]');
    var lists = card.querySelectorAll(".departures");
    var notice = card.querySelector(".notice");
    var source = pick(stop);
    var entries = Logic.upcoming(source, now);

    notice.textContent = stop.deviations.map(function (deviation) { return deviation.message; }).join("  ·  ");
    notice.classList.toggle("is-hidden", !stop.deviations.length);

    if (stop.config.split) {
      renderList(lists[0], entries.filter(function (entry) { return Logic.isTop(stop.config, entry); }), source, now);
      renderList(lists[1], entries.filter(function (entry) { return !Logic.isTop(stop.config, entry); }), source, now);
    } else {
      renderList(lists[0], entries, source, now);
    }
  }

  function render() {
    var now = stockholmNow();
    document.getElementById("clock").textContent = clockText(now);
    stops.forEach(function (stop) { renderStop(stop, now); });
  }

  // There is no console on the TV, so the status line names the data source when it is not the
  // expected one, and why.
  function reportStatus() {
    var now = stockholmNow();
    var failed = stops.filter(function (stop) { return pick(stop).error; });
    if (failed.length) {
      var stale = pick(failed[0]);
      var suffix = stale.updated ? " · showing data from " + clockText(now - (Date.now() - stale.updated)) : "";
      setStatus("Could not update " + failed[0].config.name + " (" + stale.error.message + ")" + suffix, "error");
      return;
    }
    var fallback = TRAFIKLAB_KEY ? stops.filter(function (stop) { return pick(stop) === stop.sl; }) : [];
    var note = "";
    if (fallback.length) {
      var reason = fallback[0].trafiklab.error;
      note = " · SL data for " + fallback.map(function (stop) { return stop.config.name; }).join(", ") +
        (reason ? " (Trafiklab: " + reason.message + ")" : "");
    }
    setStatus("Updated " + clockText(now) + note, "ok");
  }

  function accept(source, departures) {
    source.error = null;
    if (!departures.length && source.departures.length && Date.now() - source.updated < EMPTY_GRACE_MS) { return; }
    source.departures = departures;
    source.updated = Date.now();
  }

  function fail(stop, source, error) {
    source.error = error;
    console.error(source.name + " departures for " + stop.config.name + " failed: " + error.message);
  }

  function loadSl(stop) {
    var url = SL_API + stop.config.id + "/departures?transport=" + stop.config.mode + "&forecast=" + FORECAST_MINUTES;
    return getJson(url).then(function (data) {
      stop.deviations = Logic.relevantDeviations(data.stop_deviations || [], stop.config.mode);
      accept(stop.sl, (data.departures || []).map(Logic.fromSl));
    }).catch(function (error) { fail(stop, stop.sl, error); });
  }

  function loadTrafiklab(stop) {
    var url = TRAFIKLAB_API + stop.config.area + "?key=" + encodeURIComponent(TRAFIKLAB_KEY);
    return getJson(url).then(function (data) {
      accept(stop.trafiklab, (data.departures || []).filter(function (departure) {
        return departure.route && departure.route.transport_mode === stop.config.mode;
      }).map(Logic.fromTrafiklab));
    }).catch(function (error) { fail(stop, stop.trafiklab, error); });
  }

  function loadAll(name, loader) {
    if (loading[name]) { return loading[name]; }
    setStatus("Updating…");
    loading[name] = Promise.all(stops.map(loader)).then(function () {
      loading[name] = null;
      render();
      reportStatus();
    });
    return loading[name];
  }

  function loadFromSl() { return loadAll("sl", loadSl); }
  function loadFromTrafiklab() { return TRAFIKLAB_KEY ? loadAll("trafiklab", loadTrafiklab) : Promise.resolve(); }

  // Startup and OK ask both APIs at once, whenever Trafiklab was last asked.
  function load() {
    return Promise.all([loadFromSl(), loadFromTrafiklab()]);
  }

  function savedTrafiklabSeconds() {
    try {
      var saved = parseInt(window.localStorage.getItem(TRAFIKLAB_SECONDS_KEY), 10);
      if (saved >= TRAFIKLAB_SECONDS.min && saved <= TRAFIKLAB_SECONDS.max) { return saved; }
    } catch (error) {
      console.warn("Could not read the saved Trafiklab interval: " + error.message);
    }
    return TRAFIKLAB_SECONDS.initial;
  }

  function showTrafiklabSeconds() {
    var hint = document.getElementById("interval-hint");
    hint.classList.toggle("is-hidden", !TRAFIKLAB_KEY);
    document.getElementById("interval").textContent = "Trafiklab every " + trafiklabSeconds + " s";
  }

  function changeTrafiklabSeconds(step) {
    if (!TRAFIKLAB_KEY) { return; }
    trafiklabSeconds = Math.min(TRAFIKLAB_SECONDS.max, Math.max(TRAFIKLAB_SECONDS.min, trafiklabSeconds + step));
    try {
      window.localStorage.setItem(TRAFIKLAB_SECONDS_KEY, String(trafiklabSeconds));
    } catch (error) {
      console.warn("Could not save the Trafiklab interval: " + error.message);
    }
    showTrafiklabSeconds();
    if (trafiklabTimer) {
      window.clearInterval(trafiklabTimer);
      trafiklabTimer = window.setInterval(loadFromTrafiklab, trafiklabSeconds * 1000);
    }
    var monthly = String(Math.round(STOPS.length * 30 * 24 * 3600 / trafiklabSeconds)).replace(/\B(?=(\d{3})+$)/g, ",");
    setStatus("Trafiklab every " + trafiklabSeconds + " s · " + monthly + " requests in 30 days nonstop");
  }

  function startPolling() {
    stopPolling();
    load();
    refreshTimer = window.setInterval(loadFromSl, REFRESH_MS);
    if (TRAFIKLAB_KEY) { trafiklabTimer = window.setInterval(loadFromTrafiklab, trafiklabSeconds * 1000); }
    renderTimer = window.setInterval(render, RENDER_MS);
    tickTimer = window.setInterval(tick, TICK_MS);
  }

  function stopPolling() {
    window.clearInterval(refreshTimer);
    window.clearInterval(trafiklabTimer);
    window.clearInterval(renderTimer);
    window.clearInterval(tickTimer);
    refreshTimer = null;
    trafiklabTimer = null;
    renderTimer = null;
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
      if (config.split) {
        config.split.forEach(function (label) {
          var half = element("div", "half");
          half.appendChild(element("h3", "direction", label));
          half.appendChild(element("ol", "departures"));
          card.appendChild(half);
        });
      } else {
        card.appendChild(element("ol", "departures"));
      }
      card.appendChild(element("p", "notice is-hidden"));
      box.appendChild(card);
    });
  }

  function initKeys() {
    document.addEventListener("keydown", function (event) {
      if (event.keyCode === KEY.BACK) {
        event.preventDefault();
        WebOS.backToHome();
      } else if (event.keyCode === KEY.ENTER) {
        event.preventDefault();
        load();
      } else if (event.keyCode === KEY.UP || event.keyCode === KEY.DOWN) {
        event.preventDefault();
        changeTrafiklabSeconds(event.keyCode === KEY.UP ? TRAFIKLAB_SECONDS.step : -TRAFIKLAB_SECONDS.step);
      } else if (event.keyCode === KEY.LEFT || event.keyCode === KEY.RIGHT) {
        event.preventDefault();
      }
    });
  }

  function init() {
    buildColumns();
    initKeys();
    showTrafiklabSeconds();
    render();
    document.addEventListener("webOSRelaunch", startPolling);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { stopPolling(); }
      else {
        startPolling();
        Theme.sync();
      }
    });
    startPolling();
    // The theme this app used last is already applied; this takes one chosen in Home since then.
    Theme.sync();
  }

  document.addEventListener("DOMContentLoaded", init);
}());
