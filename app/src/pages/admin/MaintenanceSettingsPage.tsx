import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  LogIn,
  LogOut,
  RefreshCcw,
  Save,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { supabase } from "../../supabaseClient";

type RuntimeSettings = {
  maintenance_enabled: boolean;
  maintenance_title: string;
  maintenance_message: string;
  expected_back_at: string | null;
  updated_at: string | null;
};

type MaintenanceDraft = {
  maintenanceEnabled: boolean;
  title: string;
  message: string;
  expectedBackAtLocal: string;
};

const DEFAULT_SETTINGS: RuntimeSettings = {
  maintenance_enabled: false,
  maintenance_title: "Scheduled Maintenance",
  maintenance_message:
    "The patent analysis service is temporarily unavailable while maintenance is performed.",
  expected_back_at: null,
  updated_at: null,
};

function asErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected administrator maintenance error occurred.";
}

function toLocalDateTimeInput(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number: number) => String(number).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function settingsToDraft(settings: RuntimeSettings): MaintenanceDraft {
  return {
    maintenanceEnabled: settings.maintenance_enabled,
    title: settings.maintenance_title,
    message: settings.maintenance_message,
    expectedBackAtLocal: toLocalDateTimeInput(settings.expected_back_at),
  };
}

function normalizeSettingsRow(value: unknown): RuntimeSettings | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;

  return {
    maintenance_enabled: row.maintenance_enabled === true,
    maintenance_title:
      typeof row.maintenance_title === "string" &&
      row.maintenance_title.trim()
        ? row.maintenance_title.trim()
        : DEFAULT_SETTINGS.maintenance_title,
    maintenance_message:
      typeof row.maintenance_message === "string" &&
      row.maintenance_message.trim()
        ? row.maintenance_message.trim()
        : DEFAULT_SETTINGS.maintenance_message,
    expected_back_at:
      typeof row.expected_back_at === "string" ? row.expected_back_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export default function MaintenanceSettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savedSettings, setSavedSettings] =
    useState<RuntimeSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<MaintenanceDraft>(() =>
    settingsToDraft(DEFAULT_SETTINGS),
  );

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) {
        return;
      }

      if (sessionError) {
        setAuthError(sessionError.message);
      }

      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
      setAuthError("");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadSettings = useCallback(async () => {
    if (!session) {
      setIsAdmin(null);
      return;
    }

    setSettingsLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const { error: adminAccessError } = await supabase
        .rpc("get_admin_user_activity")
        .limit(1);

      if (adminAccessError) {
        setIsAdmin(false);
        throw new Error(
          "This account does not have permission to manage application maintenance settings.",
        );
      }

      setIsAdmin(true);

      const { data, error: loadError } = await supabase
        .from("app_runtime_settings")
        .select(
          "maintenance_enabled, maintenance_title, maintenance_message, expected_back_at, updated_at",
        )
        .eq("setting_key", "global")
        .maybeSingle();

      if (loadError) {
        throw loadError;
      }

      const settings = normalizeSettingsRow(data) ?? DEFAULT_SETTINGS;
      setSavedSettings(settings);
      setDraft(settingsToDraft(settings));
    } catch (loadError) {
      setError(asErrorMessage(loadError));
    } finally {
      setSettingsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const hasChanges = useMemo(() => {
    const savedDraft = settingsToDraft(savedSettings);

    return (
      draft.maintenanceEnabled !== savedDraft.maintenanceEnabled ||
      draft.title !== savedDraft.title ||
      draft.message !== savedDraft.message ||
      draft.expectedBackAtLocal !== savedDraft.expectedBackAtLocal
    );
  }, [draft, savedSettings]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        throw signInError;
      }

      setPassword("");
    } catch (signInError) {
      setAuthError(asErrorMessage(signInError));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.hash = "";
  }

  async function handleSave() {
    if (!session || !isAdmin || saving) {
      return;
    }

    const title = draft.title.trim();
    const message = draft.message.trim();

    if (title.length < 1 || title.length > 120) {
      setError("Maintenance title must contain between 1 and 120 characters.");
      return;
    }

    if (message.length < 1 || message.length > 1000) {
      setError("Maintenance message must contain between 1 and 1000 characters.");
      return;
    }

    let expectedBackAt: string | null = null;

    if (draft.maintenanceEnabled && draft.expectedBackAtLocal) {
      const expectedDate = new Date(draft.expectedBackAtLocal);

      if (Number.isNaN(expectedDate.getTime())) {
        setError("Enter a valid expected restoration date and time.");
        return;
      }

      if (expectedDate.getTime() <= Date.now()) {
        setError("Expected restoration time must be in the future.");
        return;
      }

      expectedBackAt = expectedDate.toISOString();
    }

    const enablingMaintenance =
      !savedSettings.maintenance_enabled && draft.maintenanceEnabled;
    const disablingMaintenance =
      savedSettings.maintenance_enabled && !draft.maintenanceEnabled;
    const confirmationMessage = enablingMaintenance
      ? "Publish this maintenance announcement now? Analysis will immediately be blocked for all users, while administrators can still use this control page."
      : disablingMaintenance
        ? "Restore normal operation now? The maintenance announcement will be removed and analysis will be available again."
        : "Save these maintenance announcement settings?";

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const { data, error: saveError } = await supabase.rpc(
        "set_admin_runtime_settings",
        {
          p_maintenance_enabled: draft.maintenanceEnabled,
          p_maintenance_title: title,
          p_maintenance_message: message,
          p_expected_back_at: expectedBackAt,
        },
      );

      if (saveError) {
        throw saveError;
      }

      const returnedRow = Array.isArray(data) ? data[0] : data;
      const settings = normalizeSettingsRow(returnedRow);

      if (!settings) {
        throw new Error(
          "The maintenance settings update completed without returning the saved settings.",
        );
      }

      setSavedSettings(settings);
      setDraft(settingsToDraft(settings));
      setSuccessMessage(
        settings.maintenance_enabled
          ? "Maintenance mode is active and the announcement is now published."
          : "Normal operation has been restored and the maintenance announcement is no longer active.",
      );
      window.dispatchEvent(new Event("runtime-settings-changed"));
    } catch (saveError) {
      setError(asErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (authLoading && !session) {
    return (
      <main className="shell">
        <p className="status-card">Loading administrator access…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <p className="eyebrow">Administrator maintenance control</p>
          <h1>Administrator sign-in required</h1>
          <p className="muted">
            Sign in with an authorized administrator account to publish or
            remove the maintenance announcement.
          </p>

          <form className="auth-form" onSubmit={handleSignIn}>
            <label>
              Administrator email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary" type="submit" disabled={authLoading}>
              <LogIn aria-hidden="true" />
              {authLoading ? "Signing in…" : "Sign in as administrator"}
            </button>
          </form>

          <button
            className="secondary"
            type="button"
            onClick={() => {
              window.location.hash = "";
            }}
          >
            <ArrowLeft aria-hidden="true" />
            Back to application
          </button>

          {authError && (
            <p className="error" role="alert">
              {authError}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="shell app-shell">
      <header className="app-header">
        <div className="brand-lockup" aria-label="Maintenance administration">
          <span className="brand-mark" aria-hidden="true">
            <Wrench />
          </span>
          <span className="brand-copy">
            <strong>Maintenance Control</strong>
            <span>Administrator access</span>
          </span>
        </div>

        <div className="user-panel">
          <span className="user-email" title={session.user.email}>
            {session.user.email}
          </span>
          <div className="user-panel-actions">
            <button
              type="button"
              className="secondary compact-button"
              onClick={() => {
                window.location.hash = "";
              }}
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              className="secondary compact-button"
              onClick={() => void handleSignOut()}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="card" style={{ display: "grid", gap: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="eyebrow">Administrator only</p>
            <h1 style={{ marginBottom: "0.4rem" }}>
              Maintenance announcement
            </h1>
            <p className="muted" style={{ margin: 0, maxWidth: "48rem" }}>
              Intentionally publish a service-wide maintenance announcement or
              restore normal analysis operation. Changes take effect
              immediately after confirmation.
            </p>
          </div>
          <button
            type="button"
            className="secondary compact-button"
            onClick={() => void loadSettings()}
            disabled={settingsLoading || saving}
          >
            <RefreshCcw aria-hidden="true" />
            {settingsLoading ? "Loading…" : "Reload settings"}
          </button>
        </div>

        {isAdmin === false && (
          <div className="error" role="alert">
            Administrator permission was not confirmed for this account.
          </div>
        )}

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="success" role="status">
            {successMessage}
          </div>
        )}

        {isAdmin && (
          <>
            <div
              style={{
                padding: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
                border: savedSettings.maintenance_enabled
                  ? "1px solid #fdba74"
                  : "1px solid #86efac",
                borderRadius: "0.9rem",
                background: savedSettings.maintenance_enabled
                  ? "#fff7ed"
                  : "#f0fdf4",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                {savedSettings.maintenance_enabled ? (
                  <ShieldAlert color="#c2410c" aria-hidden="true" />
                ) : (
                  <CheckCircle2 color="#15803d" aria-hidden="true" />
                )}
                <div>
                  <strong>
                    {savedSettings.maintenance_enabled
                      ? "Maintenance mode is active"
                      : "Normal analysis mode is active"}
                  </strong>
                  <div className="muted" style={{ marginTop: "0.15rem" }}>
                    Last updated: {formatTimestamp(savedSettings.updated_at)}
                  </div>
                </div>
              </div>
            </div>

            <label
              style={{
                padding: "1rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                border: "1px solid #cbd5e1",
                borderRadius: "0.9rem",
                background: "#f8fafc",
              }}
            >
              <input
                type="checkbox"
                checked={draft.maintenanceEnabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maintenanceEnabled: event.target.checked,
                    expectedBackAtLocal: event.target.checked
                      ? current.expectedBackAtLocal
                      : "",
                  }))
                }
                disabled={settingsLoading || saving}
                style={{ marginTop: "0.2rem" }}
              />
              <span>
                <strong>Publish maintenance announcement</strong>
                <span
                  className="muted"
                  style={{ display: "block", marginTop: "0.25rem" }}
                >
                  When enabled, the public application is replaced by the
                  announcement and analysis requests are rejected without
                  consuming credits.
                </span>
              </span>
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))",
                gap: "1rem",
              }}
            >
              <label style={{ display: "grid", gap: "0.4rem" }}>
                Announcement title
                <input
                  type="text"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  minLength={1}
                  maxLength={120}
                  disabled={settingsLoading || saving}
                />
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  {draft.title.length}/120 characters
                </span>
              </label>

              <label style={{ display: "grid", gap: "0.4rem" }}>
                Expected restoration time (optional)
                <input
                  type="datetime-local"
                  value={draft.expectedBackAtLocal}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      expectedBackAtLocal: event.target.value,
                    }))
                  }
                  disabled={
                    !draft.maintenanceEnabled || settingsLoading || saving
                  }
                />
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  Entered in your browser’s local time zone.
                </span>
              </label>
            </div>

            <label style={{ display: "grid", gap: "0.4rem" }}>
              Announcement message
              <textarea
                value={draft.message}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    message: event.target.value,
                  }))
                }
                minLength={1}
                maxLength={1000}
                rows={6}
                disabled={settingsLoading || saving}
              />
              <span className="muted" style={{ fontSize: "0.78rem" }}>
                {draft.message.length}/1,000 characters
              </span>
            </label>

            <section
              aria-labelledby="maintenance-preview-title"
              style={{
                padding: "1.2rem",
                display: "grid",
                gap: "0.7rem",
                border: "1px solid #cbd5e1",
                borderRadius: "1rem",
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  color: "#475569",
                  fontWeight: 800,
                }}
              >
                <Eye aria-hidden="true" />
                Announcement preview
              </div>
              <h2 id="maintenance-preview-title" style={{ margin: 0 }}>
                {draft.title.trim() || "Maintenance announcement title"}
              </h2>
              <p style={{ margin: 0, lineHeight: 1.65 }}>
                {draft.message.trim() || "Maintenance announcement message"}
              </p>
              {draft.maintenanceEnabled && draft.expectedBackAtLocal && (
                <p
                  style={{
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    color: "#9a3412",
                  }}
                >
                  <Clock3 aria-hidden="true" />
                  Expected restoration: {formatTimestamp(
                    new Date(draft.expectedBackAtLocal).toISOString(),
                  )}
                </p>
              )}
            </section>

            <div className="actions" style={{ alignItems: "center" }}>
              <button
                type="button"
                className="primary"
                onClick={() => void handleSave()}
                disabled={
                  !hasChanges || settingsLoading || saving || !isAdmin
                }
              >
                <Save aria-hidden="true" />
                {saving
                  ? "Saving…"
                  : savedSettings.maintenance_enabled &&
                      !draft.maintenanceEnabled
                    ? "Restore normal operation"
                    : draft.maintenanceEnabled
                      ? "Publish maintenance announcement"
                      : "Save maintenance settings"}
              </button>
              {!hasChanges && (
                <span className="muted">No unsaved changes.</span>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
