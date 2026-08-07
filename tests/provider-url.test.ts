import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeProviderBaseUrl } from "../lib/security/provider-url";

const environment = process.env as Record<string, string | undefined>;

function setNodeEnvironment(value: string | undefined) {
  if (value === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = value;
}

test("rejects non-HTTPS provider URLs in production", async () => {
  const previous = process.env.NODE_ENV;
  setNodeEnvironment("production");
  try {
    await assert.rejects(
      assertSafeProviderBaseUrl("http://example.com/v1"),
      /must use HTTPS/,
    );
  } finally {
    setNodeEnvironment(previous);
  }
});

test("rejects local provider destinations in production", async () => {
  const previous = process.env.NODE_ENV;
  setNodeEnvironment("production");
  try {
    await assert.rejects(
      assertSafeProviderBaseUrl("https://127.0.0.1:8787/v1"),
      /private or local/,
    );
  } finally {
    setNodeEnvironment(previous);
  }
});

test("rejects credentials and query strings in provider URLs", async () => {
  await assert.rejects(
    assertSafeProviderBaseUrl("https://user:pass@example.com/v1"),
    /credentials/,
  );
  await assert.rejects(
    assertSafeProviderBaseUrl("https://example.com/v1?token=secret"),
    /query parameters/,
  );
});
