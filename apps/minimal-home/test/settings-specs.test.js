"use strict";

const test = require("node:test");
const assert = require("node:assert");
const SettingsSpecs = require("../app/settings-specs.js");

test("every page row says what it reads, how it shows, and what it does", () => {
  Object.keys(SettingsSpecs.PAGES).forEach((id) => {
    const page = SettingsSpecs.PAGES[id];
    assert.ok(page.title && page.lg, id + " has a title and an LG Settings panel");
    const keys = [];
    page.sections.forEach((section) => {
      assert.ok(section.title && section.rows.length, id + ": a section has a title and rows");
      section.rows.forEach((row) => {
        assert.ok(row.key && row.category && row.label && row.help, id + ": " + JSON.stringify(row).slice(0, 60));
        assert.ok(["range", "choice"].includes(row.kind), row.key + "'s kind");
        if (row.kind === "choice") { assert.ok(row.labels, row.key + " names its values"); }
        assert.ok(!keys.includes(row.key), row.key + " appears once on " + id);
        keys.push(row.key);
      });
    });
    page.sections.forEach((section) => section.rows.forEach((row) => {
      if (row.greyedWhen) { assert.ok(keys.includes(row.greyedWhen.key), row.key + " is greyed by a row on the page"); }
    }));
  });
});
