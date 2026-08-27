import { useMemo, useState } from "react";
import { Check, Copy, SearchCheck } from "lucide-react";
import {
  SEARCH_QUERY_REVIEW_NOTICE,
  getSearchQueryDatabases,
  type GeneratedSearchQueryStarter,
  type SearchDatabaseId,
  type SearchStrategyId,
} from "../searchQuery";
import { databaseSafeQuery } from "../queryOutputSafety";
import "./SearchQueryStarter.css";

type CopiedQueryKey = `${SearchDatabaseId}:${SearchStrategyId | "all"}`;

type SearchQueryStarterProps = {
  starter: GeneratedSearchQueryStarter;
  className?: string;
};

export default function SearchQueryStarter({
  starter,
  className = "",
}: SearchQueryStarterProps) {
  const databases = useMemo(() => getSearchQueryDatabases(starter), [starter]);
  const initialDatabaseId = databases[0]?.id ?? "google_patents";
  const [activeDatabaseId, setActiveDatabaseId] =
    useState<SearchDatabaseId>(initialDatabaseId);
  const [copiedQuery, setCopiedQuery] = useState<CopiedQueryKey | null>(null);
  const [copyError, setCopyError] = useState("");

  const activeDatabase = useMemo(
    () =>
      databases.find((database) => database.id === activeDatabaseId) ??
      databases[0],
    [activeDatabaseId, databases],
  );

  const reviewLabel =
    starter.reviewStatus === "corrected"
      ? "AI corrected source"
      : starter.reviewStatus === "accepted"
        ? "AI reviewed source"
        : starter.reviewStatus === "demo"
          ? "Pre-reviewed demo"
          : "Review unavailable";

  async function copyText(key: CopiedQueryKey, text: string) {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyError("");
      setCopiedQuery(key);
      window.setTimeout(() => {
        setCopiedQuery((currentQuery) =>
          currentQuery === key ? null : currentQuery,
        );
      }, 1800);
    } catch {
      setCopiedQuery(null);
      setCopyError(
        "The query could not be copied automatically. Select and copy the displayed text.",
      );
    }
  }

  function handleCopyStrategy(strategyId: SearchStrategyId, copyValue: string) {
    if (!activeDatabase) {
      return;
    }

    void copyText(
      `${activeDatabase.id}:${strategyId}`,
      databaseSafeQuery(activeDatabase.id, copyValue),
    );
  }

  function handleCopyAll() {
    if (!activeDatabase) {
      return;
    }

    const allQueries = activeDatabase.strategies
      .map(
        (strategy) =>
          `${strategy.label}${strategy.recommended ? " (recommended)" : ""}\n${databaseSafeQuery(
            activeDatabase.id,
            strategy.copyText,
          )}`,
      )
      .join("\n\n");

    void copyText(`${activeDatabase.id}:all`, allQueries);
  }

  return (
    <section
      className={`search-query-starter${className ? ` ${className}` : ""}`}
      aria-labelledby="generated-query-starter-title"
    >
      <div className="query-starter-heading">
        <span className="query-starter-icon" aria-hidden="true">
          <SearchCheck />
        </span>
        <span>
          <span className="query-starter-kicker">Search preparation</span>
          <h2 id="generated-query-starter-title">Search Query Strategies</h2>
        </span>
        <span className="query-starter-badges">
          <span className={`query-review-note ${starter.reviewStatus}`}>
            {reviewLabel}
          </span>
          <span className="query-credit-note">No additional credit</span>
        </span>
      </div>

      <p className="query-starter-intro">
        Choose a target database, then start with Query 2 for a balanced search.
        AI-reviewed terminology and verified classification scope are reused where available;
        Query 1 is broader and Query 3 is more selective.
      </p>

      <div
        className="query-database-tabs"
        role="tablist"
        aria-label="Patent search database"
      >
        {databases.map((database) => (
          <button
            key={database.id}
            type="button"
            role="tab"
            aria-selected={database.id === activeDatabase?.id}
            className={`query-database-tab${
              database.id === activeDatabase?.id ? " active" : ""
            }`}
            onClick={() => setActiveDatabaseId(database.id)}
          >
            {database.label}
          </button>
        ))}
      </div>

      {activeDatabase && (
        <div
          className="query-database-panel"
          role="tabpanel"
          aria-label={`${activeDatabase.label} search queries`}
        >
          <div className="query-database-summary">
            <div>
              <strong>{activeDatabase.syntaxLabel}</strong>
              <p>{activeDatabase.note}</p>
            </div>
            <button
              type="button"
              className="query-copy-all-button"
              onClick={handleCopyAll}
              disabled={activeDatabase.strategies.every(
                (strategy) => !strategy.copyText,
              )}
            >
              {copiedQuery === `${activeDatabase.id}:all` ? (
                <Check aria-hidden="true" />
              ) : (
                <Copy aria-hidden="true" />
              )}
              {copiedQuery === `${activeDatabase.id}:all`
                ? "Copied all"
                : "Copy all queries"}
            </button>
          </div>

          <div className="query-strategy-list">
            {activeDatabase.strategies.map((strategy) => {
              const copiedKey: CopiedQueryKey = `${activeDatabase.id}:${strategy.id}`;
              const copied = copiedQuery === copiedKey;
              const displayedQuery = databaseSafeQuery(
                activeDatabase.id,
                strategy.query,
              );

              return (
                <article
                  key={strategy.id}
                  className={`query-strategy-card${
                    strategy.recommended ? " recommended" : ""
                  }`}
                >
                  <div className="query-strategy-heading">
                    <div>
                      <div className="query-strategy-title-row">
                        <strong>{strategy.label}</strong>
                        {strategy.recommended && (
                          <span className="query-recommended-badge">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p>{strategy.purpose}</p>
                    </div>
                    <button
                      type="button"
                      className="query-copy-button"
                      onClick={() =>
                        handleCopyStrategy(strategy.id, strategy.copyText)
                      }
                      disabled={!strategy.copyText}
                    >
                      {copied ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <Copy aria-hidden="true" />
                      )}
                      {copied ? "Copied" : "Copy query"}
                    </button>
                  </div>

                  {displayedQuery ? (
                    <code className="query-strategy-code">{displayedQuery}</code>
                  ) : (
                    <p className="query-starter-empty">
                      No supported query could be generated from this analysis.
                    </p>
                  )}

                  {strategy.classificationFilters.length > 0 && (
                    <div className="query-classification-filters">
                      <span>Classification filters</span>
                      {strategy.classificationFilters.map((filter) => (
                        <code key={filter}>{filter}</code>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      <p className="query-review-summary">{starter.reviewSummary}</p>
      <p className="query-starter-notice">{SEARCH_QUERY_REVIEW_NOTICE}</p>
      {copyError && (
        <p className="query-copy-error" role="alert">
          {copyError}
        </p>
      )}
    </section>
  );
}
