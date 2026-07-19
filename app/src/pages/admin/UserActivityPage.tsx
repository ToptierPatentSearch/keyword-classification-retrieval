import { Fragment, useEffect, useMemo, useState } from "react";
import Footer from "../../components/Footer";
import { supabase } from "../../supabaseClient";

type UserActivityRow = {
  user_id: string;
  email: string | null;
  signed_up_at_japan: string | null;
  confirmed_at_japan: string | null;
  latest_sign_in_at_japan: string | null;
  latest_sign_out_at_japan: string | null;
  login_count: number;
  logout_count: number;
  remaining_credits: number;
};

type SortKey =
  | "email"
  | "signedUp"
  | "latestSignIn"
  | "loginCount"
  | "remainingCredits";

type SortDirection = "ascending" | "descending";

type UserActivityPageProps = {
  administratorEmail?: string;
  onBack: () => void;
  onSignOut: () => Promise<void>;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function parseJapanTimestamp(value: string | null): Date | null {
  if (!value) return null;

  const trimmedValue = value.trim();
  const japanLocalTimestamp =
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const normalizedValue = japanLocalTimestamp.test(trimmedValue)
    ? `${trimmedValue.replace(" ", "T")}+09:00`
    : trimmedValue;
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalTimestamp(value: string | null): string {
  const date = parseJapanTimestamp(value);
  if (!date) return "-";

  const localTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: localTimeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);

  return localTimeZone === "Asia/Tokyo"
    ? formatted.replace(/GMT\+9$/, "JST")
    : formatted;
}

function getLatestActivityDate(row: UserActivityRow): Date | null {
  const dates = [
    row.latest_sign_in_at_japan,
    row.latest_sign_out_at_japan,
    row.signed_up_at_japan,
  ]
    .map(parseJapanTimestamp)
    .filter((date): date is Date => date !== null);

  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function dateInputBoundary(value: string, endOfDay: boolean): number | null {
  if (!value) return null;

  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${value}T${time}`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function sortValue(
  row: UserActivityRow,
  sortKey: SortKey,
): string | number | null {
  switch (sortKey) {
    case "email":
      return row.email?.toLocaleLowerCase() ?? null;
    case "signedUp":
      return parseJapanTimestamp(row.signed_up_at_japan)?.getTime() ?? null;
    case "latestSignIn":
      return parseJapanTimestamp(row.latest_sign_in_at_japan)?.getTime() ?? null;
    case "loginCount":
      return row.login_count;
    case "remainingCredits":
      return row.remaining_credits;
  }
}

function compareRows(
  left: UserActivityRow,
  right: UserActivityRow,
  sortKey: SortKey,
  direction: SortDirection,
): number {
  const leftValue = sortValue(left, sortKey);
  const rightValue = sortValue(right, sortKey);

  if (leftValue === null && rightValue === null) return 0;
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;

  const comparison =
    typeof leftValue === "string" && typeof rightValue === "string"
      ? leftValue.localeCompare(rightValue)
      : Number(leftValue) - Number(rightValue);

  return direction === "ascending" ? comparison : -comparison;
}

function SortableHeader({
  activeKey,
  direction,
  label,
  onSort,
  sortKey,
}: {
  activeKey: SortKey;
  direction: SortDirection;
  label: string;
  onSort: (sortKey: SortKey) => void;
  sortKey: SortKey;
}) {
  const isActive = activeKey === sortKey;

  return (
    <th aria-sort={isActive ? direction : "none"} scope="col">
      <button
        className="admin-sort-button"
        type="button"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span aria-hidden="true" className="admin-sort-indicator">
          {isActive ? (direction === "ascending" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export default function UserActivityPage({
  administratorEmail,
  onBack,
  onSignOut,
}: UserActivityPageProps) {
  const [rows, setRows] = useState<UserActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("latestSignIn");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("descending");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  async function loadUserActivity() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("get_admin_user_activity");

    if (error) {
      const errorText = error.message.toLocaleLowerCase();
      const accessDenied =
        errorText.includes("not allowed") ||
        errorText.includes("not authenticated") ||
        errorText.includes("permission denied");

      setIsAllowed(accessDenied ? false : null);
      setRows([]);
      setErrorMessage(
        accessDenied
          ? "You do not have permission to view user activity."
          : "User activity could not be loaded. Please try again.",
      );
      setLoading(false);
      return;
    }

    setIsAllowed(true);
    setRows((data ?? []) as UserActivityRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadUserActivity();
  }, []);

  const filteredAndSortedRows = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase();
    const fromBoundary = dateInputBoundary(dateFrom, false);
    const toBoundary = dateInputBoundary(dateTo, true);

    return rows
      .filter((row) => {
        const matchesSearch =
          !normalizedSearchTerm ||
          row.email?.toLocaleLowerCase().includes(normalizedSearchTerm) ||
          row.user_id.toLocaleLowerCase().includes(normalizedSearchTerm);

        if (!matchesSearch) return false;

        const latestActivity = getLatestActivityDate(row)?.getTime() ?? null;
        if (fromBoundary !== null && latestActivity === null) return false;
        if (toBoundary !== null && latestActivity === null) return false;
        if (
          fromBoundary !== null &&
          latestActivity !== null &&
          latestActivity < fromBoundary
        ) {
          return false;
        }
        if (
          toBoundary !== null &&
          latestActivity !== null &&
          latestActivity > toBoundary
        ) {
          return false;
        }

        return true;
      })
      .sort((left, right) =>
        compareRows(left, right, sortKey, sortDirection),
      );
  }, [dateFrom, dateTo, rows, searchTerm, sortDirection, sortKey]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedRows.length / pageSize),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const visibleRows = filteredAndSortedRows.slice(
    pageStart,
    pageStart + pageSize,
  );

  function updateSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((direction) =>
        direction === "ascending" ? "descending" : "ascending",
      );
    } else {
      setSortKey(nextSortKey);
      setSortDirection(nextSortKey === "email" ? "ascending" : "descending");
    }
    setCurrentPage(1);
  }

  function clearFilters() {
    setSearchTerm("");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  }

  const firstVisibleRow =
    filteredAndSortedRows.length === 0 ? 0 : pageStart + 1;
  const lastVisibleRow = Math.min(
    pageStart + pageSize,
    filteredAndSortedRows.length,
  );

  return (
    <main className="shell admin-page-shell">
      <nav className="admin-page-navigation" aria-label="Admin navigation">
        <button className="secondary" type="button" onClick={onBack}>
          ← Back to analysis
        </button>
        <div className="admin-page-account">
          {administratorEmail && <span>{administratorEmail}</span>}
          <button className="secondary" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </nav>

      <section className="admin-user-activity card">
        <div className="admin-page-title-row">
          <div>
            <p className="eyebrow">Administrator dashboard</p>
            <h1>Admin: User Activity</h1>
          </div>
          <button
            className="primary"
            type="button"
            onClick={loadUserActivity}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {errorMessage && (
          <p className={isAllowed === false ? "warning" : "error"}>
            {errorMessage}
          </p>
        )}

        {isAllowed && (
          <>
            <div className="admin-filters" role="search">
              <label className="admin-search-filter">
                Search users
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Email or user UUID"
                />
              </label>
              <label>
                Latest activity from
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </label>
              <label>
                Latest activity to
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </label>
              <button
                className="secondary admin-clear-filters"
                type="button"
                onClick={clearFilters}
                disabled={!searchTerm && !dateFrom && !dateTo}
              >
                Clear filters
              </button>
            </div>

            <p className="admin-filter-note">
              Dates use your local time. “Latest activity” is the most recent
              sign-in, sign-out, or signup event.
            </p>

            {loading && <p className="admin-table-message">Loading users…</p>}

            {!loading && rows.length === 0 && (
              <p className="admin-table-message">No user activity was found.</p>
            )}

            {!loading && rows.length > 0 && visibleRows.length === 0 && (
              <p className="admin-table-message">
                No users match the selected filters.
              </p>
            )}

            {!loading && visibleRows.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <SortableHeader
                        activeKey={sortKey}
                        direction={sortDirection}
                        label="Email"
                        onSort={updateSort}
                        sortKey="email"
                      />
                      <SortableHeader
                        activeKey={sortKey}
                        direction={sortDirection}
                        label="Signed up"
                        onSort={updateSort}
                        sortKey="signedUp"
                      />
                      <SortableHeader
                        activeKey={sortKey}
                        direction={sortDirection}
                        label="Latest sign-in"
                        onSort={updateSort}
                        sortKey="latestSignIn"
                      />
                      <SortableHeader
                        activeKey={sortKey}
                        direction={sortDirection}
                        label="Logins"
                        onSort={updateSort}
                        sortKey="loginCount"
                      />
                      <SortableHeader
                        activeKey={sortKey}
                        direction={sortDirection}
                        label="Credits"
                        onSort={updateSort}
                        sortKey="remainingCredits"
                      />
                      <th scope="col">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const isExpanded = expandedUserId === row.user_id;

                      return (
                        <Fragment key={row.user_id}>
                          <tr>
                            <td className="admin-email-cell">
                              {row.email || "-"}
                            </td>
                            <td>
                              {formatLocalTimestamp(row.signed_up_at_japan)}
                            </td>
                            <td>
                              {formatLocalTimestamp(
                                row.latest_sign_in_at_japan,
                              )}
                            </td>
                            <td>{row.login_count}</td>
                            <td>
                              <span className="admin-credit-pill">
                                {row.remaining_credits}
                              </span>
                            </td>
                            <td>
                              <button
                                className="admin-details-button"
                                type="button"
                                aria-expanded={isExpanded}
                                aria-controls={`admin-details-${row.user_id}`}
                                onClick={() =>
                                  setExpandedUserId(
                                    isExpanded ? null : row.user_id,
                                  )
                                }
                              >
                                {isExpanded ? "Hide" : "View"}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr
                              className="admin-details-row"
                              id={`admin-details-${row.user_id}`}
                            >
                              <td colSpan={6}>
                                <dl className="admin-user-details">
                                  <div>
                                    <dt>User UUID</dt>
                                    <dd>{row.user_id}</dd>
                                  </div>
                                  <div>
                                    <dt>Confirmed</dt>
                                    <dd>
                                      {formatLocalTimestamp(
                                        row.confirmed_at_japan,
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Latest sign-out</dt>
                                    <dd>
                                      {formatLocalTimestamp(
                                        row.latest_sign_out_at_japan,
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Logouts</dt>
                                    <dd>{row.logout_count}</dd>
                                  </div>
                                </dl>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && filteredAndSortedRows.length > 0 && (
              <div className="admin-pagination">
                <p aria-live="polite">
                  Showing {firstVisibleRow}–{lastVisibleRow} of{" "}
                  {filteredAndSortedRows.length} users
                </p>
                <label>
                  Rows per page
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="admin-page-controls">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    disabled={safeCurrentPage === 1}
                  >
                    Previous
                  </button>
                  <span>
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) => Math.min(totalPages, page + 1))
                    }
                    disabled={safeCurrentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <Footer />
    </main>
  );
}
