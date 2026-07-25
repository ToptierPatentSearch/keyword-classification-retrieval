import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Coins, LogOut, RefreshCcw } from "lucide-react";
import { supabase } from "../../supabaseClient";

type UserPackagePurchaseRow = {
  user_id: string;
  user_email: string | null;
  test_packages_bought: number;
  business_packages_bought: number;
  total_packages_bought: number;
  total_analyses_bought: number;
  first_purchase_at: string;
  last_purchase_at: string;
};

type UserPackagePurchasesPageProps = {
  administratorEmail?: string;
  onBack: () => void;
  onSignOut: () => Promise<void>;
};

function asErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to load package-purchase totals.";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function normalizeCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export default function UserPackagePurchasesPage({
  administratorEmail,
  onBack,
  onSignOut,
}: UserPackagePurchasesPageProps) {
  const [rows, setRows] = useState<UserPackagePurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadPurchaseTotals() {
    setLoading(true);
    setError("");

    try {
      const { data, error: loadError } = await supabase.rpc(
        "get_admin_user_package_purchase_totals",
        {
          p_limit: 500,
          p_offset: 0,
        },
      );

      if (loadError) {
        throw loadError;
      }

      const normalizedRows = (Array.isArray(data) ? data : []).map((row) => ({
        ...(row as UserPackagePurchaseRow),
        test_packages_bought: normalizeCount(
          (row as UserPackagePurchaseRow).test_packages_bought,
        ),
        business_packages_bought: normalizeCount(
          (row as UserPackagePurchaseRow).business_packages_bought,
        ),
        total_packages_bought: normalizeCount(
          (row as UserPackagePurchaseRow).total_packages_bought,
        ),
        total_analyses_bought: normalizeCount(
          (row as UserPackagePurchaseRow).total_analyses_bought,
        ),
      }));

      setRows(normalizedRows);
    } catch (loadError) {
      setRows([]);
      setError(asErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPurchaseTotals();
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) =>
      [row.user_email, row.user_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [query, rows]);

  const displayedTotals = useMemo(
    () =>
      filteredRows.reduce(
        (totals, row) => ({
          test: totals.test + row.test_packages_bought,
          business: totals.business + row.business_packages_bought,
          packages: totals.packages + row.total_packages_bought,
          analyses: totals.analyses + row.total_analyses_bought,
        }),
        { test: 0, business: 0, packages: 0, analyses: 0 },
      ),
    [filteredRows],
  );

  return (
    <main className="shell app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Coins />
          </span>
          <span className="brand-copy">
            <strong>Package Purchases</strong>
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
            <h1 style={{ marginBottom: "0.35rem" }}>
              Packages bought by each client
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              Counts are derived from completed, idempotently recorded Stripe
              Checkout purchases.
            </p>
          </div>

          <button
            type="button"
            className="secondary compact-button"
            onClick={() => void loadPurchaseTotals()}
            disabled={loading}
          >
            <RefreshCcw aria-hidden="true" />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <label style={{ display: "grid", gap: "0.35rem", maxWidth: "34rem" }}>
          Search clients
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Email address or user ID"
          />
        </label>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
              gap: "0.75rem",
            }}
          >
            {[
              ["Clients", filteredRows.length],
              ["Test Packs", displayedTotals.test],
              ["Business Packs", displayedTotals.business],
              ["Total Packages", displayedTotals.packages],
              ["Analyses Purchased", displayedTotals.analyses],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  padding: "0.8rem",
                  border: "1px solid #cbd5e1",
                  borderRadius: "0.75rem",
                  background: "#f8fafc",
                }}
              >
                <div className="muted" style={{ fontSize: "0.76rem" }}>
                  {label}
                </div>
                <strong style={{ fontSize: "1.35rem" }}>
                  {Number(value).toLocaleString()}
                </strong>
              </div>
            ))}
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Test Packs</th>
                <th>Business Packs</th>
                <th>Total Packages</th>
                <th>Analyses Purchased</th>
                <th>First Purchase</th>
                <th>Latest Purchase</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.user_id}>
                  <td>
                    <strong>{row.user_email || "Email unavailable"}</strong>
                    <div className="muted" style={{ fontSize: "0.72rem" }}>
                      {row.user_id}
                    </div>
                  </td>
                  <td>{row.test_packages_bought.toLocaleString()}</td>
                  <td>{row.business_packages_bought.toLocaleString()}</td>
                  <td>
                    <strong>{row.total_packages_bought.toLocaleString()}</strong>
                  </td>
                  <td>{row.total_analyses_bought.toLocaleString()}</td>
                  <td>{formatTimestamp(row.first_purchase_at)}</td>
                  <td>{formatTimestamp(row.last_purchase_at)}</td>
                </tr>
              ))}
              {!loading && !error && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No matching package purchases were found.
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
