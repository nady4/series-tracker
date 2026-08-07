import assert from "node:assert/strict";
import test from "node:test";
import { normalizeShowStatus } from "../lib/news/schema";

test("does not turn unknown news into an in-air status", () => {
  assert.equal(normalizeShowStatus("unknown", "Running"), "unknown");
});

test("preserves returning and upcoming evidence", () => {
  assert.equal(normalizeShowStatus("returning", "Ended"), "returning");
  assert.equal(normalizeShowStatus("upcoming", "Running"), "upcoming");
});

test("uses TVMaze only for known terminal statuses", () => {
  assert.equal(normalizeShowStatus("unknown", "Ended"), "ended");
  assert.equal(normalizeShowStatus("unknown", "Cancelled"), "cancelled");
});
