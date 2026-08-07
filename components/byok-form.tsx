"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  initial: { hasKey: boolean; baseUrl: string; model: string };
};

export function ByokForm({ initial }: Props) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [busy, setBusy] = useState<null | "save" | "test" | "clear">(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function save() {
    if (!apiKey.trim() && !initial.hasKey) {
      setError("Enter an API key before saving.");
      return;
    }
    setBusy("save");
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/settings/byok", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl, model })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save key.");
      setApiKey("");
      setOkMsg(
        apiKey.trim()
          ? "Key saved. It is encrypted at rest and only used for news searches."
          : "Provider settings updated."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save key.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/settings/byok/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl, model })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed.");
      setOkMsg(
        `Connection OK — ${data.source === "fallback" ? "server fallback" : "your BYOK provider"} answered with model "${data.model}".`
      );
      if (!apiKey && initial.hasKey) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    if (!window.confirm("Remove your saved API key and return to the free tier?")) return;
    setBusy("clear");
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/settings/byok", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not clear key.");
      setApiKey("");
      setOkMsg("Key removed. You are back on the free tier (20 series).");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear key.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="byok-form">
      {error && <div className="form-error" role="alert">{error}</div>}
      {okMsg && <div className="form-info" role="status">{okMsg}</div>}

      <div className="field">
        <label htmlFor="byok-key">
          API key {initial.hasKey && "(saved - enter a new one to replace)"}
        </label>
        <input
          id="byok-key"
          className="input"
          type="password"
          autoComplete="off"
          placeholder={initial.hasKey ? "sk-•••••••• (saved)" : "sk-…"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="byok-url">Base URL</label>
        <input
          id="byok-url"
          className="input"
          placeholder="https://opencode.ai/zen/go/v1 (default)"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="byok-model">Model</label>
        <input
          id="byok-model"
          className="input"
          placeholder="deepseek-v4-flash (default)"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>

      <div className="btn-row">
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={busy !== null}
        >
          {busy === "save" && <span className="spinner" />}
          Save key
        </button>
        <button
          className="btn btn-ghost"
          onClick={test}
          disabled={busy !== null}
        >
          {busy === "test" && <span className="spinner" />}
          Test key
        </button>
        {initial.hasKey && (
          <button
            className="btn btn-ghost"
            onClick={clear}
            disabled={busy !== null}
          >
            {busy === "clear" && <span className="spinner" />}
            Remove key
          </button>
        )}
      </div>
    </div>
  );
}
