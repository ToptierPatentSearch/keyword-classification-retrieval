import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, LogOut, RefreshCcw } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { formatLocalAndUtcTimestamp } from "../../lib/time";

type ActivityRow = Record<string, unknown>;

type UserActivityPageProps = {
  administratorEmail?: string;
  onBack: () => void;
  onSignOut: () => Promise<void>;
};

const PREFERRED_COLUMN_ORDER = [
  "email",
  "user_email",
  "user_id",
  "created_at",
  "signed_up_at",
  "last_sign_in_at",
  "last_signed_in_at",
  "last_sign_out_at",
  "last_signed_out_at",
  "last_activity_at",
  "analysis_count",
  "remaining_credits",
];

function asErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to load administrator user activity.";
}

function humanizeColumnName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return value.toLocaleString();
  }

  if (typeof value === "string") {
    const looksLikeTimestamp =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) &&
      !Number.isNaN(new Date(value).getTime());

    if (looksLikeTimestamp) {
      return formatLocalAndUtcTimestamp(value, { invalidValue: value });
    }

    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function UserActivityPage({
  administratorEmail,
  onBack,
  onSignOut,
}: UserActivityPageProps) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadActivity() {
    setLoading(true);
    setError("");

    try {
      const { data, error: loadError } = await supabase.rpc(
        "get_admin_user_activity",
      );

      if (loadError) {
        throw loadError;
      }

      setRows(
        Array.isArray(data)
          ? data.filter(
              (row): row is ActivityRow =>
                typeof row === "object" && row !== null,
            )
          : [],
      );
    } catch (loadError) {
      setRows([]);
      setError(asErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadActivity();
  }, []);

  const columns = useMemo(() => {
    const discoveredColumns = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row))),
    );
    const preferredColumns = PREFERRED_COLUMN_ORDER.filter((column) =>
      discoveredColumns.includes(column),
    );
    const remainingColumns = discoveredColumns
      .filter((column) => !preferredColumns.includes(column))
      .sort((left, right) => left.localeCompare(right));

    return [...preferredColumns, ...remainingColumns];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) =>
      Object.values(row).some((value) =>
        formatValue(value).toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [query, rows]);

  return (
    <main className="shell app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Activity />
          </span>
          <span className="brand-copy">
            <strong>User Activity</strong>
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
            <h1 style={{ marginBottom: "0.35rem" }}>User activity</h1>
            <p className="muted" style={{ margin: 0 }}>
              Authentication, account, credit, and analysis activity returned
              by the protected administrator database function.
            </p>
          </div>

          <button
            type="button"
            className="secondary compact-button"
            onClick={() => void loadActivity()}
            disabled={loading}
          >
            <RefreshCcw aria-hidden="true" />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <label style={{ display: "grid", gap: "0.35rem", maxWidth: "34rem" }}>
          Search activity
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Email, user ID, date, or activity"
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
            {rows.length.toLocaleString()} users.
          </p>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{humanizeColumnName(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, rowIndex) => (
                <tr
                  key={
                    String(row.user_id ?? row.id ?? row.email ?? rowIndex)
                  }
                >
                  {columns.map((column) => (
                    <td key={column}>{formatValue(row[column])}</td>
                  ))}
                </tr>
              ))}
              {!loading && !error && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="muted">
                    No matching user activity records were found.
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
