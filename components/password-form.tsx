"use client";

import { useState } from "react";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not change password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed. Sign in again to continue.");
      window.setTimeout(() => window.location.assign("/login"), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="password-form" onSubmit={save}>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="form-info" role="status">{message}</div>}
      <div className="field">
        <label htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <span className="hint">Use at least 8 characters.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>
      <button className="btn btn-ghost" disabled={busy}>
        {busy && <span className="spinner" />}
        Change password
      </button>
    </form>
  );
}
