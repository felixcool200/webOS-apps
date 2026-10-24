"use strict";

const test = require("node:test");
const assert = require("node:assert");
const SettingsSpecs = require("../app/settings-specs.js");
const SettingsLogic = require("../app/settings-logic.js");

test("every page row says what it reads, how it shows, and what it does", () => {
  Object.keys(SettingsSpecs.PAGES).forEach((id) => {
    const page = SettingsSpecs.PAGES[id];
    assert.ok(page.title && page.lg, id + " has a title and an LG Settings panel");
    const keys = [];
    page.sections.forEach((section) => {
      assert.ok(section.title && section.rows.length, id + ": a section has a title and rows");
      section.rows.forEach((row) => {
        assert.ok(row.key && row.label && row.help, id + ": " + JSON.stringify(row).slice(0, 60));
        assert.ok(["range", "choice", "info", "link"].includes(row.kind), row.key + "'s kind");
        if (row.kind === "link") { assert.ok(row.launch && row.launch.id, row.key + " says what it opens"); }
        else if (row.source) { assert.ok(SettingsLogic.SOURCES[row.source], row.key + "'s source " + row.source + " exists"); }
        else { assert.ok(row.category, row.key + " has a settingsservice category"); }
        if (row.kind === "choice") { assert.ok(row.labels, row.key + " names its values"); }
        assert.ok(!keys.includes(row.key), row.key + " appears once on " + id);
        keys.push(row.key);
      });
    });
    const known = keys.concat((page.extra || []).map((item) => item.key));
    page.sections.forEach((section) => section.rows.forEach((row) => {
      [].concat(row.greyedWhen || [], row.showWhen || [], row.hideWhen || []).forEach((rule) => {
        assert.ok(known.includes(rule.key), row.key + "'s rule reads " + rule.key + ", a row or extra key of " + id);
      });
    }));
  });
});
