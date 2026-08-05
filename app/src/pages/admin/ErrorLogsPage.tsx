import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import {
  type ChangeEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../supabaseClient";
import { formatLocalAndUtcTimestamp } from "../../lib/time";

type ErrorSeverity = "warning" | "error" | "critical";
type ErrorStatus = "open" | "resolved" | "ignored";

type ErrorLog = {
  id: string;
  occurred_at: string;
  user_id: string | null;
  request_id: string | null;
  component: string;
  operation: string;
  environment: string;
  release: string | null;
  severity: ErrorSeverity;
  error_code: string | null;
  message: string;
  http_status: number | null;
  retryable: boolean;
  details: Record<string, unknown>;
  status: ErrorStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

type ErrorLogsPageProps = {
  administratorEmail?: string;
  onBack: () => void;
  onSignOut: () => void | Promise<void>;
};

const PAGE_SIZE = 25;
const MAX_LOGS = 500;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return formatLocalAndUtcTimestamp(value, {
    seconds: true,
    invalidValue: value,
  });
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export default function ErrorLogsPage({
  administratorEmail,
  onBack,
  onSignOut,
}: ErrorLogsPageProps) {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"all" | ErrorSeverity>("all");
  const [status, setStatus] = useState<"all" | ErrorStatus>("open");
  const [component, setComponent] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("error_logs")
      .select(
        "id, occurred_at, user_id, request_id, component, operation, " +
          "environment, release, severity, error_code, message, http_status, " +
          "retryable, details, status, resolved_at, resolved_by, resolution_note",
      )
      .order("occurred_at", { ascending: false })
      .limit(MAX_LOGS);

    if (error) {
      setLogs([]);
      setLoadError(
        `Error logs could not be loaded: ${error.message}. Confirm that this account has the administrator role, then sign out and sign in again.`,
      );
      setLoading(false);
      return;
    }

    setLogs((data ?? []) as unknown as ErrorLog[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setPage(1);
  }, [search, severity, status, component]);

  const components = useMemo(
    () =>
      Array.from(new Set(logs.map((log) => log.component))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    const query = normalizeSearchValue(search);

    return logs.filter((log) => {
      if (severity !== "all" && log.severity !== severity) return false;
      if (status !== "all" && log.status !== status) return false;
      if (component !== "all" && log.component !== component) return false;
      if (!query) return true;

      return [
        log.request_id,
        log.user_id,
        log.error_code,
        log.message,
        log.component,
        log.operation,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
    });
  }, [component, logs, search, severity, status]);

  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount);
  const pageLogs = filteredLogs.slice(
    (visiblePage - 1) * PAGE_SIZE,
    visiblePage * PAGE_SIZE,
  );

  const openCount = logs.filter((log) => log.status === "open").length;
  const criticalCount = logs.filter(
    (log) => log.status === "open" && log.severity === "critical",
  ).length;
  const errorCount = logs.filter(
    (log) => log.status === "open" && log.severity === "error",
  ).length;
  const warningCount = logs.filter(
    (log) => log.status === "open" && log.severity === "warning",
  ).length;

  async function resolveLog(log: ErrorLog) {
    const note = window.prompt(
      "Resolution note (required):",
      log.resolution_note ?? "",
    );

    if (note === null) return;
    if (!note.trim()) {
      setLoadError("A resolution note is required before closing an error.");
      return;
    }

    setResolvingId(log.id);
    setLoadError("");

    const { error } = await supabase.rpc("resolve_app_error", {
      p_error_id: log.id,
      p_status: "resolved",
      p_resolution_note: note.trim(),
    });

    if (error) {
      setLoadError(`The error could not be resolved: ${error.message}`);
      setResolvingId(null);
      return;
    }

    setResolvingId(null);
    setExpandedId(null);
    await loadLogs();
  }

  function clearFilters() {
    setSearch("");
    setSeverity("all");
    setStatus("open");
    setComponent("all");
  }

  return (
    <main className="shell admin-page-shell">
      <nav className="admin-page-navigation" aria-label="Administrator navigation">
        <button className="secondary compact-button" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back to analysis
        </button>
        <div className="admin-page-account">
          <span title={administratorEmail}>{administratorEmail}</span>
          <button
            className="secondary compact-button"
            type="button"
            onClick={() => void onSignOut()}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </button>
        </div>
      </nav>

      <section className="card admin-user-activity">
        <div className="admin-page-title-row">
          <div>
            <p className="eyebrow">
              <TriangleAlert aria-hidden="true" />
              Administrator operations
            </p>
            <h1>Error Logs</h1>
            <p className="muted">
              Review structured server failures without exposing patent text,
              credentials, or payment details.
            </p>
          </div>
          <button
            className="primary"
            type="button"
            disabled={loading}
            onClick={() => void loadLogs()}
          >
            <RefreshCw aria-hidden="true" />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="admin-error-summary" aria-label="Open error summary">
          <article>
            <span>Open</span>
            <strong>{openCount}</strong>
          </article>
          <article>
            <span>Critical</span>
            <strong>{criticalCount}</strong>
          </article>
          <article>
            <span>Errors</span>
            <strong>{errorCount}</strong>
          </article>
          <article>
            <span>Warnings</span>
            <strong>{warningCount}</strong>
          </article>
        </div>

        <div className="admin-filters admin-error-filters">
          <label className="admin-search-filter">
            Search request ID, code, message, or operation
            <input
              type="search"
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSearch(event.target.value)
              }
              placeholder="Request ID or error code"
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setStatus(event.target.value as "all" | ErrorStatus)
              }
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="ignored">Ignored</option>
              <option value="all">All</option>
            </select>
          </label>
          <label>
            Severity
            <select
              value={severity}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setSeverity(event.target.value as "all" | ErrorSeverity)
              }
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
            </select>
          </label>
          <label>
            Component
            <select
              value={component}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setComponent(event.target.value)
              }
            >
              <option value="all">All</option>
              {components.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary admin-clear-filters"
            type="button"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>

        <p className="admin-filter-note">
          Showing the newest {MAX_LOGS} records at most. Open errors are shown
          by default.
        </p>

        {loadError && (
          <p className="error" role="alert">
            {loadError}
          </p>
        )}

        {loading ? (
          <p className="admin-table-message">Loading error logs…</p>
        ) : filteredLogs.length === 0 ? (
          <p className="admin-table-message">
            No error logs match the selected filters.
          </p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Occurred</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Component</th>
                    <th>Operation</th>
                    <th>Error code</th>
                    <th>Message</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageLogs.map((log) => {
                    const expanded = expandedId === log.id;

                    return (
                      <Fragment key={log.id}>
                        <tr>
                          <td>{formatDateTime(log.occurred_at)}</td>
                          <td>
                            <span className={`admin-error-pill ${log.severity}`}>
                              {log.severity}
                            </span>
                          </td>
                          <td>
                            <span className={`admin-error-pill ${log.status}`}>
                              {log.status}
                            </span>
                          </td>
                          <td>{log.component}</td>
                          <td>{log.operation}</td>
                          <td className="admin-error-code">
                            {log.error_code ?? "—"}
                          </td>
                          <td className="admin-error-message-cell">{log.message}</td>
                          <td>
                            <div className="admin-error-actions">
                              <button
                                className="admin-details-button"
                                type="button"
                                aria-expanded={expanded}
                                onClick={() =>
                                  setExpandedId(expanded ? null : log.id)
                                }
                              >
                                {expanded ? "Hide" : "Details"}
                              </button>
                              {log.status === "open" && (
                                <button
                                  className="admin-resolve-button"
                                  type="button"
                                  disabled={resolvingId === log.id}
                                  onClick={() => void resolveLog(log)}
                                >
                                  <CheckCircle2 aria-hidden="true" />
                                  {resolvingId === log.id
                                    ? "Resolving…"
                                    : "Resolve"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="admin-details-row">
                            <td colSpan={8}>
                              <div className="admin-error-details">
                                <dl className="admin-error-details-grid">
                                  <div>
                                    <dt>Request ID</dt>
                                    <dd>{log.request_id ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>User ID</dt>
                                    <dd>{log.user_id ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>HTTP status</dt>
                                    <dd>{log.http_status ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>Environment</dt>
                                    <dd>{log.environment}</dd>
                                  </div>
                                  <div>
                                    <dt>Release</dt>
                                    <dd>{log.release ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>Retryable</dt>
                                    <dd>{log.retryable ? "Yes" : "No"}</dd>
                                  </div>
                                  <div>
                                    <dt>Resolved</dt>
                                    <dd>{formatDateTime(log.resolved_at)}</dd>
                                  </div>
                                  <div>
                                    <dt>Resolved by</dt>
                                    <dd>{log.resolved_by ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>Resolution note</dt>
                                    <dd>{log.resolution_note ?? "—"}</dd>
                                  </div>
                                </dl>
                                <pre aria-label="Structured error details">
                                  {JSON.stringify(log.details ?? {}, null, 2)}
                                </pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="admin-pagination">
              <p>
                {filteredLogs.length} matching record
                {filteredLogs.length === 1 ? "" : "s"}
              </p>
              <div className="admin-page-controls">
                <button
                  className="secondary compact-button"
                  type="button"
                  disabled={visiblePage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft aria-hidden="true" />
                  Previous
                </button>
                <span>
                  Page {visiblePage} of {pageCount}
                </span>
                <button
                  className="secondary compact-button"
                  type="button"
                  disabled={visiblePage >= pageCount}
                  onClick={() =>
                    setPage((value) => Math.min(pageCount, value + 1))
                  }
                >
                  Next
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
