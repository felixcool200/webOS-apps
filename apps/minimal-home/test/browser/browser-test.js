// Runs one browser test inside Minimal Home's page: the test named in the URL's hash, defined with
// BrowserTest.define in the *.browser.js files loaded after this. test/browser/run.js reads the result
// from a <pre id="result"> that this adds when the test ends.
var BrowserTest = (function () {
  "use strict";

  var KEYS = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461 };
  var name = decodeURIComponent(location.hash.slice(1));
  var tests = {};
  var log = [];

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function key(which, extra) {
    document.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ keyCode: KEYS[which], bubbles: true }, extra)));
  }

  function keyUp(which) {
    document.dispatchEvent(new KeyboardEvent("keyup", { keyCode: KEYS[which], bubbles: true }));
  }

  var helpers = {
    tv: function () { return window.FAKE_TV; },
    wait: wait,
    key: key,
    keyUp: keyUp,
    // Holds OK long enough to pick an app up (Home's HOLD_MS is 600).
    holdOk: function () {
      key("OK");
      return wait(700).then(function () { keyUp("OK"); });
    },
    $: function (selector) { return document.querySelector(selector); },
    $$: function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); },
    text: function (selector) {
      var element = typeof selector === "string" ? document.querySelector(selector) : selector;
      return element ? element.textContent.replace(/\s+/g, " ").trim() : null;
    },
    // The <main> view shown.
    view: function () {
      var shown = Array.prototype.filter.call(document.querySelectorAll("main"), function (main) { return !main.hidden; })[0];
      return shown ? shown.id.replace("-view", "") : null;
    },
    focused: function () {
      var view = document.querySelector("main:not([hidden])");
      return view ? view.querySelector(".is-focused") : null;
    },
    // Waits until check() is true, checking every 50 ms; fails after timeoutMs.
    until: function (check, timeoutMs, what) {
      var started = performance.now();
      return new Promise(function (resolve, reject) {
        (function poll() {
          var result;
          try { result = check(); } catch (error) { result = false; }
          if (result) { resolve(result); }
          else if (performance.now() - started > (timeoutMs || 5000)) { reject(new Error("Timed out waiting for " + (what || "a condition"))); }
          else { setTimeout(poll, 50); }
        }());
      });
    },
    // Home's tiles are there.
    homeReady: function () {
      return helpers.until(function () { return document.querySelector("#apps .app"); }, 8000, "the app tiles");
    },
    log: function (message) { log.push(String(message)); },
    ok: function (value, message) {
      if (!value) { throw new Error(message || "expected a true value"); }
    },
    equal: function (actual, expected, message) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error((message ? message + ": " : "") + "expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
      }
    },
    match: function (actual, pattern, message) {
      if (!pattern.test(String(actual))) {
        throw new Error((message ? message + ": " : "") + JSON.stringify(actual) + " doesn't match " + pattern);
      }
    }
  };

  // options: { tv: fake TV options (see fake-tv.js), storage: localStorage contents before Home starts,
  // budget: virtual milliseconds the test may take (run.js reads it) }.
  function define(testName, options, body) {
    tests[testName] = { options: options || {}, body: body };
    if (testName !== name) { return; }
    window.TEST_TV = (options && options.tv) || {};
    try {
      window.localStorage.clear();
      var storage = (options && options.storage) || {};
      Object.keys(storage).forEach(function (storageKey) {
        var value = storage[storageKey];
        window.localStorage.setItem(storageKey, typeof value === "string" ? value : JSON.stringify(value));
      });
    } catch (error) { log.push("storage: " + error.message); }
  }

  function finish(result) {
    var pre = document.createElement("pre");
    pre.id = "result";
    pre.textContent = JSON.stringify(Object.assign(result, { log: log }));
    document.body.appendChild(pre);
  }

  window.addEventListener("load", function () {
    var test = tests[name];
    if (!test) {
      finish({ ok: false, message: "No test named " + name });
      return;
    }
    Promise.resolve().then(function () { return test.body(helpers); }).then(function () {
      finish({ ok: true });
    }, function (error) {
      finish({ ok: false, message: error.message });
    });
  });

  return { define: define };
}());
