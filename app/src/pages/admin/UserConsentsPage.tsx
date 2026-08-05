import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LogOut, RefreshCcw, ShieldCheck } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { formatLocalAndUtcTimestamp } from "../../lib/time";

type UserConsentRow = {
  consent_id: string;
  user_id: string;
  user_email: string | null;
  terms_version: string;
  refund_policy_version: string;
  consent_text: string;
  accepted_at: string;
  accepted_at_client: string | null;
  source: string;
};

type UserConsentsPageProps = {
  administratorEmail?: string;
  onBack: () => void;
  onSignOut: () => Promise<void>;
};

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load user consent records.";
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  return formatLocalAndUtcTimestamp(value, {
    seconds: true,
    invalidValue: value,
  });
}

export default function UserConsentsPage({
  administratorEmail,
  onBack,
  onSignOut,
}: UserConsentsPageProps) {
  const [rows, setRows] = useState<UserConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadConsents() {
    setLoading(true);
    setError("");

    try {
      const { data, error: loadError } = await supabase.rpc(
        "get_admin_user_consents",
        {
          p_limit: 500,
          p_offset: 0,
        },
      );

      if (loadError) {
        throw loadError;
      }

      setRows(Array.isArray(data) ? (data as UserConsentRow[]) : []);
    } catch (loadError) {
      setRows([]);
      setError(asErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConsents();
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) =>
      [
        row.user_email,
        row.user_id,
        row.terms_version,
        row.refund_policy_version,
        row.source,
        row.consent_text,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [query, rows]);

  return (
    <main className="shell app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck />
          </span>
          <span className="brand-copy">
            <strong>Consent Audit</strong>
            <span>Administrator access</span>
          </span>
        </div>

        <div className="user-panel">
          <span className="user-email" title={administratorEmail}>
            {administratorEmail}
          </span>
          <div className="user-panel-actions">
            <button
              type="button"
              className="secondary compact-button"
              onClick={onBack}
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              className="secondary compact-button"
              onClick={() => void onSignOut()}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="card" style={{ display: "grid", gap: "1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "end",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="eyebrow">Administrator only</p>
            <h1 style={{ marginBottom: "0.35rem" }}>User consent records</h1>
            <p className="muted" style={{ margin: 0 }}>
              Server-recorded acceptance of the Terms of Use and Refund Policy.
            </p>
          </div>

          <button
            type="button"
            className="secondary compact-button"
            onClick={() => void loadConsents()}
            disabled={loading}
          >
            <RefreshCcw aria-hidden="true" />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <label style={{ display: "grid", gap: "0.35rem", maxWidth: "34rem" }}>
          Search consent records
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Email, user ID, policy version, or consent text"
          />
        </label>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && (
          <p className="muted" style={{ margin: 0 }}>
            Showing {filteredRows.length.toLocaleString()} of{" "}
            {rows.length.toLocaleString()} records.
          </p>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Accepted at</th>
                <th>Terms version</th>
                <th>Refund version</th>
                <th>Source</th>
                <th>Consent wording</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.consent_id}>
                  <td>
                    <strong>{row.user_email || "Email unavailable"}</strong>
                    <div className="muted" style={{ fontSize: "0.72rem" }}>
                      {row.user_id}
                    </div>
                  </td>
                  <td>
                    {formatTimestamp(row.accepted_at)}
                    {row.accepted_at_client && (
                      <div className="muted" style={{ fontSize: "0.72rem" }}>
                        Client: {formatTimestamp(row.accepted_at_client)}
                      </div>
                    )}
                  </td>
                  <td>{row.terms_version}</td>
                  <td>{row.refund_policy_version}</td>
                  <td>{row.source}</td>
                  <td style={{ minWidth: "18rem" }}>{row.consent_text}</td>
                </tr>
              ))}
              {!loading && !error && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No matching consent records were found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
