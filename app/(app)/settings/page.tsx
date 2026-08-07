import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ByokForm } from "@/components/byok-form";
import { PasswordForm } from "@/components/password-form";
import { resolveKey } from "@/lib/keys";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();
  if (!user) redirect("/login");

  const effectiveKey = resolveKey(user);
  const hasByok = effectiveKey?.source === "byok";
  const hasStoredKey = Boolean(user.byokKeyEnc);
  const hasFallback = Boolean(process.env.FALLBACK_LLM_API_KEY);
  const effectiveModel = effectiveKey?.model ?? "gpt-4o-mini";
  const effectiveSource = hasByok ? "BYOK" : hasFallback ? "Fallback (.env)" : "Not configured";
  const effectiveProvider =
    effectiveKey?.baseUrl ?? (hasFallback ? "https://api.openai.com/v1" : "Not configured");

  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">
            Every tracked series is checked daily for new-season news. The search
            runs with Google News RSS and GDELT API and is analyzed with your own
            OpenAI-compatible API key, or with the server fallback key when configured
            (free tier is capped at 20 series).
          </p>
        </div>
      </div>
      <div className="panel settings-panel">
        <h2>News engine</h2>
        <div className="kv-row">
          <span className="k">Key</span>
          <span className="v">
            {hasStoredKey && !hasByok
              ? "Your key saved (test it to activate)"
              : hasByok
                ? "Your key saved (encrypted)"
                : hasFallback
                  ? "Using server fallback key"
                  : "No provider configured"}
          </span>
        </div>
        <div className="kv-row">
          <span className="k">Key source</span>
          <span className="v">
            {effectiveSource}
          </span>
        </div>
        <div className="kv-row">
          <span className="k">Series limit</span>
          <span className="v">
            {hasByok ? "Unlimited" : "20 (free tier)"}
          </span>
        </div>
        <div className="kv-row">
          <span className="k">Effective model</span>
          <span className="v">{effectiveModel}</span>
        </div>
        <div className="kv-row">
          <span className="k">Provider endpoint</span>
          <span className="v">{effectiveProvider}</span>
        </div>
        <div className="kv-row">
          <span className="k">Search sources</span>
          <span className="v">Google News RSS, then GDELT</span>
        </div>
        <ByokForm
          initial={{
            hasKey: hasStoredKey,
            baseUrl: hasStoredKey ? user.byokBaseUrl ?? "" : "",
            model: hasStoredKey ? user.byokModel ?? "" : "",
          }}
        />
      </div>
      <div className="panel settings-panel account-panel">
        <h2>Account security</h2>
        <p className="panel-desc">Change your password while you are signed in.</p>
        <PasswordForm />
      </div>
    </div>
  );
}
