import { useState } from "react";
import { Check, Copy, SearchCheck } from "lucide-react";
import {
  SEARCH_QUERY_REVIEW_NOTICE,
  type GeneratedSearchQueryStarter,
} from "../searchQuery";
import "./SearchQueryStarter.css";

type QueryType = "keyword" | "classification";

type SearchQueryStarterProps = {
  starter: GeneratedSearchQueryStarter;
  className?: string;
};

type QueryBlockProps = {
  label: string;
  query: string;
  queryType: QueryType;
  copiedQuery: QueryType | null;
  onCopy: (queryType: QueryType, query: string) => void;
};

function QueryBlock({
  label,
  query,
  queryType,
  copiedQuery,
  onCopy,
}: QueryBlockProps) {
  const copied = copiedQuery === queryType;

  return (
    <div className="query-starter-block">
      <div className="query-starter-block-heading">
        <strong>{label}</strong>
        <button
          type="button"
          className="query-copy-button"
          onClick={() => onCopy(queryType, query)}
          disabled={!query}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy query"}
        </button>
      </div>
      {query ? (
        <code>{query}</code>
      ) : (
        <p className="query-starter-empty">
          No supported query could be generated from this analysis.
        </p>
      )}
    </div>
  );
}

export default function SearchQueryStarter({
  starter,
  className = "",
}: SearchQueryStarterProps) {
  const [copiedQuery, setCopiedQuery] = useState<QueryType | null>(null);
  const [copyError, setCopyError] = useState("");

  async function handleCopy(queryType: QueryType, query: string) {
    if (!query) {
      return;
    }

    try {
      await navigator.clipboard.writeText(query);
      setCopyError("");
      setCopiedQuery(queryType);
      window.setTimeout(() => {
        setCopiedQuery((currentQuery) =>
          currentQuery === queryType ? null : currentQuery,
        );
      }, 1800);
    } catch {
      setCopiedQuery(null);
      setCopyError(
        "The query could not be copied automatically. Select and copy the displayed text.",
      );
    }
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
          <h2 id="generated-query-starter-title">
            Generated Search Query Starter
          </h2>
        </span>
        <span className="query-credit-note">No additional credit</span>
      </div>

      <div className="query-starter-grid">
        <QueryBlock
          label="Boolean keyword query"
          query={starter.keywordQuery}
          queryType="keyword"
          copiedQuery={copiedQuery}
          onCopy={handleCopy}
        />
        <QueryBlock
          label="IPC/CPC classification query"
          query={starter.classificationQuery}
          queryType="classification"
          copiedQuery={copiedQuery}
          onCopy={handleCopy}
        />
      </div>

      <p className="query-starter-notice">{SEARCH_QUERY_REVIEW_NOTICE}</p>
      {copyError && (
        <p className="query-copy-error" role="alert">
          {copyError}
        </p>
      )}
    </section>
  );
}
