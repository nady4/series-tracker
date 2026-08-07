import assert from "node:assert/strict";
import test from "node:test";
import { parseJsonResponse } from "../lib/news/chat";

test("repairs adjacent source objects and trailing commas", () => {
  const response = `
    Here is the result:
    {
      "showStatus": "unknown",
      "hasNextSeasonNews": false,
      "nextSeason": null,
      "sources": [
        {"title":"First","url":"https://example.com/first"}
        {"title":"Second","url":"https://example.com/second"},
      ],
      "summary": "No confirmed news."
    }
  `;

  assert.deepEqual(parseJsonResponse(response), {
    showStatus: "unknown",
    hasNextSeasonNews: false,
    nextSeason: null,
    sources: [
      { title: "First", url: "https://example.com/first" },
      { title: "Second", url: "https://example.com/second" },
    ],
    summary: "No confirmed news.",
  });
});

test("extracts balanced JSON before trailing provider text", () => {
  const response = '{"showStatus":"in_air","hasNextSeasonNews":false} additional text';
  assert.deepEqual(parseJsonResponse(response), {
    showStatus: "in_air",
    hasNextSeasonNews: false,
  });
});

test("accepts providers that return JSON as a string or content part", () => {
  const value = { showStatus: "ended", hasNextSeasonNews: false };
  assert.deepEqual(parseJsonResponse(JSON.stringify(JSON.stringify(value))), value);
  assert.deepEqual(parseJsonResponse([{ type: "text", text: JSON.stringify(value) }]), value);
});
