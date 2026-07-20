import Footer from "./components/Footer";
import termsOfUseText from "./components/terms-of-use.txt?raw";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import UserActivityPage from "./pages/admin/UserActivityPage";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type {
  AnalysisResult,
  ClassificationRouteCode,
  KeywordClassification,
  TechnicalInterpretation,
} from "./types";
import { PricingPlans } from "./components/PricingPlans";
import {
  ArrowRight,
  Clock3,
  Coins,
  Eraser,
  FileText,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
type PlanId = "test" | "business";
const EXPECTED_ANALYSIS_SCHEMA_VERSION = "common-concept-v2";

function TechnicalInterpretationCell({
  interpretation,
}: {
  interpretation?: TechnicalInterpretation;
}) {
  if (!interpretation) {
    return <span style={{ color: "#64748b" }}>—</span>;
  }

  const listText = (values: string[]) =>
    Array.isArray(values) && values.length > 0 ? values.join("; ") : "—";
  const fields = [
    ["Object/system", interpretation.object_or_system || "—"],
    ["Purpose or problem", interpretation.purpose_or_problem || "—"],
    ["Application/use", interpretation.application_or_use || "—"],
    ["Components", listText(interpretation.components)],
    [
      "Component relationships",
      listText(interpretation.component_relationships),
    ],
    ["Material/composition", listText(interpretation.material_or_composition)],
    [
      "Manufacturing or processing steps",
      listText(interpretation.manufacturing_or_processing_steps),
    ],
    ["Operation", interpretation.operation || "—"],
    ["Control means", listText(interpretation.control_means)],
    ["Controlled variable", listText(interpretation.controlled_variables)],
    ["Operating conditions", listText(interpretation.operating_conditions)],
    ["Technical effect", interpretation.technical_effect || "—"],
  ];

  return (
    <div style={{ display: "grid", gap: "0.32rem", minWidth: "15rem" }}>
      {fields.map(([label, value]) => (
        <div key={label} style={{ fontSize: "0.76rem", lineHeight: 1.35 }}>
          <strong>{label}:</strong> {value}
        </div>
      ))}
      {interpretation.search_phrases.length > 0 && (
        <div
          style={{ color: "#475569", fontSize: "0.72rem", lineHeight: 1.35 }}
        >
          <strong>Retrieval phrases:</strong>{" "}
          {interpretation.search_phrases.join("; ")}
        </div>
      )}
    </div>
  );
}

function RouteCodeCard({
  item,
  label,
}: {
  item: ClassificationRouteCode;
  label?: string;
}) {
  const title = item.title_en || item.title_ja;
  const score =
    typeof item.match_score === "number"
      ? Math.round(Math.max(0, Math.min(1, item.match_score)) * 100)
      : null;

  return (
    <div
      style={{
        padding: "0.55rem 0.65rem",
        border: "1px solid #cbd5e1",
        borderRadius: "0.7rem",
        background: "#ffffff",
      }}
    >
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {label && (
          <span
            style={{ color: "#475569", fontSize: "0.7rem", fontWeight: 800 }}
          >
            {label}
          </span>
        )}
        <strong>{item.code}</strong>
        {score !== null && (
          <span
            style={{ color: "#166534", fontSize: "0.7rem", fontWeight: 800 }}
          >
            {score}/100
          </span>
        )}
      </div>
      {title && (
        <div
          style={{ marginTop: "0.2rem", color: "#64748b", fontSize: "0.74rem" }}
        >
          {title}
          {item.edition ? ` · ${item.edition}` : ""}
        </div>
      )}
    </div>
  );
}

function RouteArrow() {
  return (
    <div aria-hidden="true" style={{ color: "#64748b", fontWeight: 900 }}>
      ↓
    </div>
  );
}

function ClassificationRouteCell({
  keyword,
}: {
  keyword: KeywordClassification;
}) {
  const route = keyword.classification_route;

  if (!route) {
    return (
      <span style={{ color: "#b45309", fontSize: "0.8rem" }}>
        Classification route unavailable. Deploy the matching analyze Edge
        Function.
      </span>
    );
  }

  return (
    <div
      style={{ display: "grid", gap: "0.55rem", minWidth: 0, width: "100%" }}
    >
      <div
        style={{
          padding: "0.65rem",
          borderRadius: "0.75rem",
          background: "#f5f3ff",
        }}
      >
        <div style={{ color: "#5b21b6", fontSize: "0.72rem", fontWeight: 900 }}>
          1 · IPC/CPC AREA
        </div>
        {route.ipc_cpc_area.length > 0 ? (
          <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.4rem" }}>
            {route.ipc_cpc_area.map((area) => (
              <RouteCodeCard
                key={`${area.system}-${area.code}`}
                item={area}
                label={area.system}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              marginTop: "0.35rem",
              color: "#64748b",
              fontSize: "0.76rem",
            }}
          >
            No technically supported catalog area; downstream routing was
            withheld.
          </div>
        )}
      </div>

      <RouteArrow />

      <div
        style={{
          padding: "0.65rem",
          borderRadius: "0.75rem",
          background: "#ecfdf5",
        }}
      >
        <div style={{ color: "#166534", fontSize: "0.72rem", fontWeight: 900 }}>
          2 · FI SUBDIVISION
        </div>
        {route.fi_subdivisions.length > 0 ? (
          <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.4rem" }}>
            {route.fi_subdivisions.map((subdivision) => (
              <div key={subdivision.fi.code}>
                <RouteCodeCard item={subdivision.fi} label="FI" />
                <div
                  style={{
                    margin: "0.25rem 0 0.35rem",
                    color: "#475569",
                    fontSize: "0.7rem",
                  }}
                >
                  Linked from: {subdivision.parent_area_codes.join(", ")}
                </div>

                <div
                  style={{
                    marginLeft: "0.8rem",
                    paddingLeft: "0.65rem",
                    borderLeft: "3px solid #86efac",
                  }}
                >
                  <div
                    style={{
                      color: "#166534",
                      fontSize: "0.72rem",
                      fontWeight: 900,
                    }}
                  >
                    3 · F-TERM THEME → ASPECT
                  </div>
                  {subdivision.f_term_themes.length > 0 ? (
                    subdivision.f_term_themes.map((theme) => (
                      <div
                        key={`${subdivision.fi.code}-${theme.theme_code}`}
                        style={{ marginTop: "0.45rem" }}
                      >
                        <div style={{ fontSize: "0.76rem", fontWeight: 800 }}>
                          Theme {theme.theme_code}
                          {theme.title_en || theme.title_ja
                            ? ` · ${theme.title_en || theme.title_ja}`
                            : ""}
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gap: "0.35rem",
                            marginTop: "0.35rem",
                          }}
                        >
                          {theme.aspects.map((aspect) => (
                            <RouteCodeCard
                              key={`${theme.theme_code}-${aspect.code}`}
                              item={aspect}
                              label={`Aspect ${aspect.viewpoint_code ?? ""}`.trim()}
                            />
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        marginTop: "0.35rem",
                        color: "#64748b",
                        fontSize: "0.76rem",
                      }}
                    >
                      No theme/aspect combination passed the FI-scoped
                      threshold.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              marginTop: "0.35rem",
              color: "#64748b",
              fontSize: "0.76rem",
            }}
          >
            No FI subdivision could be linked to the selected IPC/CPC area.
          </div>
        )}
      </div>
    </div>
  );
}

function KeywordResultCard({ keyword }: { keyword: KeywordClassification }) {
  const synonyms = Array.isArray(keyword.synonyms) ? keyword.synonyms : [];

  return (
    <article
      style={{
        width: "100%",
        maxWidth: "54rem",
        margin: "0 auto",
        padding: "1rem",
        border: "1px solid #cbd5e1",
        borderRadius: "1rem",
        background: "#f8fafc",
        display: "grid",
        gap: "0.85rem",
      }}
    >
      <header style={{ display: "grid", gap: "0.35rem" }}>
        <div
          style={{
            color: "#475569",
            fontSize: "0.72rem",
            fontWeight: 900,
            letterSpacing: "0.04em",
          }}
        >
          KEYWORD {keyword.rank}
        </div>
        <h3 style={{ margin: 0 }}>{keyword.term}</h3>
      </header>

      <section style={{ display: "grid", gap: "0.25rem" }}>
        <strong style={{ fontSize: "0.76rem", color: "#475569" }}>
          Normalized term
        </strong>
        <span>{keyword.normalized_term}</span>
      </section>

      <section style={{ display: "grid", gap: "0.4rem" }}>
        <strong style={{ fontSize: "0.76rem", color: "#475569" }}>
          Synonyms and alternative technical names
        </strong>
        {synonyms.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {synonyms.map((synonym) => (
              <span
                key={synonym}
                style={{
                  padding: "0.25rem 0.5rem",
                  border: "1px solid #bfdbfe",
                  borderRadius: "999px",
                  background: "#eff6ff",
                  color: "#1e3a8a",
                  fontSize: "0.76rem",
                }}
              >
                {synonym}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
            No distinct contextual synonym was identified.
          </span>
        )}
      </section>

      <ClassificationRouteCell keyword={keyword} />

      <section
        style={{
          display: "grid",
          gap: "0.5rem",
          padding: "0.75rem",
          borderRadius: "0.75rem",
          background: "#ffffff",
        }}
      >
        <div>
          <strong>Occurrences:</strong> {keyword.count}
        </div>
        <div>
          <strong>Rank:</strong> {keyword.rank}
        </div>
        <div>
          <strong>Confidence:</strong>{" "}
          <span className={`badge ${keyword.classification_confidence}`}>
            {keyword.classification_confidence}
          </span>
        </div>
        <div>
          <strong>Reason:</strong> {keyword.reason}
        </div>
      </section>
    </article>
  );
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

const PENDING_ANALYSIS_REQUEST_KEY = "kcr_pending_analysis_request_v2";

type PendingAnalysisRequest = {
  userId: string;
  requestId: string;
  inputFingerprint: string;
};

async function createAnalysisInputFingerprint(
  input: string,
  selectedKeywords: string[],
): Promise<string> {
  const encodedInput = new TextEncoder().encode(
    JSON.stringify({
      text: input,
      selected_keywords: selectedKeywords,
    }),
  );
  const digest = await crypto.subtle.digest("SHA-256", encodedInput);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readPendingAnalysisRequest(): PendingAnalysisRequest | null {
  try {
    const storedValue = window.localStorage.getItem(
      PENDING_ANALYSIS_REQUEST_KEY,
    );

    if (!storedValue) {
      return null;
    }

    const parsed = JSON.parse(storedValue) as Partial<PendingAnalysisRequest>;
    const validRequestId =
      typeof parsed.requestId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parsed.requestId,
      );
    const validFingerprint =
      typeof parsed.inputFingerprint === "string" &&
      /^[0-9a-f]{64}$/i.test(parsed.inputFingerprint);

    if (
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      !validRequestId ||
      !validFingerprint
    ) {
      window.localStorage.removeItem(PENDING_ANALYSIS_REQUEST_KEY);
      return null;
    }

    return parsed as PendingAnalysisRequest;
  } catch {
    return null;
  }
}

function storePendingAnalysisRequest(request: PendingAnalysisRequest): void {
  try {
    window.localStorage.setItem(
      PENDING_ANALYSIS_REQUEST_KEY,
      JSON.stringify(request),
    );
  } catch {
    // The in-memory fallback still protects retries during this page session.
  }
}

function clearPendingAnalysisRequest(): void {
  try {
    window.localStorage.removeItem(PENDING_ANALYSIS_REQUEST_KEY);
  } catch {
    // Storage can be unavailable in restrictive browser modes.
  }
}

function formatEstimatedDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds} seconds`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return seconds === 0
    ? `${minutes} minute${minutes === 1 ? "" : "s"}`
    : `${minutes} min ${seconds} sec`;
}

function estimateResultTime(characterCount: number): string {
  if (characterCount === 0) {
    return "Estimated analysis time: enter English or Japanese text to calculate.";
  }

  const inputBlocks = Math.ceil(characterCount / 500);
  const minimumSeconds = 20 + inputBlocks * 8;
  const maximumSeconds =
    minimumSeconds + 20 + Math.ceil(characterCount / 2000) * 10;

  return `Estimated analysis time for ${characterCount.toLocaleString()} characters: ${formatEstimatedDuration(minimumSeconds)}–${formatEstimatedDuration(maximumSeconds)}.`;
}
type LandingPageProps = {
  onAcceptTerms: () => void;
};

function LandingPage({ onAcceptTerms }: LandingPageProps) {
  const [checked, setChecked] = useState(false);

  return (
    <main className="landing-page">
      <section className="landing-card">
        <p className="eyebrow">Patent AI Analysis</p>
        <h1>Keyword Classification Retrieval</h1>

        <p className="landing-lead">
          This app helps classify patent-related keywords from English or
          Japanese technical text and supports patent search preparation by
          organizing likely technical terms and classification-related
          information.
        </p>

        <div className="landing-section">
          <h2>Brief Features</h2>
          <ul>
            <li>Classifies patent-related keywords from technical text.</li>
            <li>Supports English and Japanese patent text.</li>
            <li>
              Helps organize terms for prior art search and patent analysis.
            </li>
            <li>Processes analysis securely after authentication.</li>
          </ul>
        </div>
        <div className="landing-section">
          <h2>Terms of Use</h2>
          <div className="muted terms-text">
            {termsOfUseText
              .split(/\n\s*\n/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={`terms-paragraph-${index}`}>{paragraph}</p>
              ))}
          </div>
        </div>

        <label className="terms-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>I accept the Terms of Use.</span>
        </label>

        <button
          className="primary-button"
          type="button"
          disabled={!checked}
          onClick={onAcceptTerms}
        >
          Continue to Sign Up / Sign In
        </button>
      </section>
    </main>
  );
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    const localTimeAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );

    return Math.round((localTimeAsUtc - date.getTime()) / 60000);
  } catch {
    return null;
  }
}

function getLocalTimeZoneAbbreviation(date: Date, timeZone: string): string {
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);

  const fixedAbbreviations: Record<string, string> = {
    "Asia/Tokyo": "JST",
    "Asia/Seoul": "KST",
    "Asia/Shanghai": "CST",
    "Asia/Hong_Kong": "HKT",
    "Asia/Singapore": "SGT",
    UTC: "UTC",
  };

  if (fixedAbbreviations[timeZone]) {
    return fixedAbbreviations[timeZone];
  }

  const dstAwareAbbreviations: Record<
    string,
    {
      standard: string;
      daylight: string;
      standardOffset: number;
      daylightOffset: number;
    }
  > = {
    "America/New_York": {
      standard: "EST",
      daylight: "EDT",
      standardOffset: -300,
      daylightOffset: -240,
    },
    "America/Detroit": {
      standard: "EST",
      daylight: "EDT",
      standardOffset: -300,
      daylightOffset: -240,
    },
    "America/Toronto": {
      standard: "EST",
      daylight: "EDT",
      standardOffset: -300,
      daylightOffset: -240,
    },
    "America/Chicago": {
      standard: "CST",
      daylight: "CDT",
      standardOffset: -360,
      daylightOffset: -300,
    },
    "America/Denver": {
      standard: "MST",
      daylight: "MDT",
      standardOffset: -420,
      daylightOffset: -360,
    },
    "America/Los_Angeles": {
      standard: "PST",
      daylight: "PDT",
      standardOffset: -480,
      daylightOffset: -420,
    },
    "America/Vancouver": {
      standard: "PST",
      daylight: "PDT",
      standardOffset: -480,
      daylightOffset: -420,
    },
    "Europe/Berlin": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Paris": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Rome": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Madrid": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Amsterdam": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Brussels": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Vienna": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Zurich": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Stockholm": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Oslo": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Copenhagen": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Prague": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Warsaw": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/Budapest": {
      standard: "CET",
      daylight: "CEST",
      standardOffset: 60,
      daylightOffset: 120,
    },
    "Europe/London": {
      standard: "GMT",
      daylight: "BST",
      standardOffset: 0,
      daylightOffset: 60,
    },
    "Australia/Sydney": {
      standard: "AEST",
      daylight: "AEDT",
      standardOffset: 600,
      daylightOffset: 660,
    },
    "Australia/Melbourne": {
      standard: "AEST",
      daylight: "AEDT",
      standardOffset: 600,
      daylightOffset: 660,
    },
  };

  const mappedZone = dstAwareAbbreviations[timeZone];

  if (mappedZone && offsetMinutes !== null) {
    if (offsetMinutes === mappedZone.daylightOffset) {
      return mappedZone.daylight;
    }

    return mappedZone.standard;
  }

  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    timeZoneName: "short",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  return timeZoneName || timeZone;
}

function formatLocalExpirationDate(isoString: string | null): string {
  if (!isoString) return "-";

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const localTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    timeZone: localTimeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return `${formattedDate} ${getLocalTimeZoneAbbreviation(date, localTimeZone)}`;
}

export default function App() {
  const TERMS_ACCEPTED_KEY = "kcr_terms_accepted";

  const [termsAccepted, setTermsAccepted] = useState<boolean>(() => {
    return window.localStorage.getItem(TERMS_ACCEPTED_KEY) === "true";
  });

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authMessage, setAuthMessage] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const [creditRefreshKey, setCreditRefreshKey] = useState(0);
  const [, setRemainingCreditsAfterAnalysis] = useState<number | null>(null);
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  const [, setSelectedPlan] = useState<PlanId | null>(null);
  const [creditsExpireAt, setCreditsExpireAt] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<
    "analysis" | "admin-user-activity"
  >(() =>
    window.location.hash === "#/admin/user-activity"
      ? "admin-user-activity"
      : "analysis",
  );
  const analyzeInFlightRef = useRef(false);
  const pendingAnalyzeRequestRef = useRef<PendingAnalysisRequest | null>(null);
  function handleAcceptTerms() {
    window.localStorage.setItem(TERMS_ACCEPTED_KEY, "true");
    setTermsAccepted(true);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function updateRoute() {
      setCurrentRoute(
        window.location.hash === "#/admin/user-activity"
          ? "admin-user-activity"
          : "analysis",
      );
    }

    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkAdminAccess() {
      if (!session) {
        setIsAdmin(false);
        return;
      }

      const { error: adminAccessError } = await supabase
        .rpc("get_admin_user_activity")
        .limit(1);

      if (!cancelled) {
        setIsAdmin(!adminAccessError);
      }
    }

    void checkAdminAccess();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);
  useEffect(() => {
    if (!session) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const plan = params.get("purchasedPlan") as PlanId | null;
    const fallbackPlan = window.localStorage.getItem(
      "lastCheckoutPlan",
    ) as PlanId | null;
    const nextPlan =
      plan === "test" || plan === "business" ? plan : fallbackPlan;

    if (
      checkout === "success" &&
      (nextPlan === "test" || nextPlan === "business")
    ) {
      setRemainingCredits(null);
      setCreditRefreshKey((key) => key + 1);
      window.localStorage.removeItem("lastCheckoutPlan");

      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (checkout === "cancelled") {
      window.localStorage.removeItem("lastCheckoutPlan");

      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [session?.user.id]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCreditBalance() {
      if (!session) {
        setRemainingCredits(null);
        setSelectedPlan(null);
        setCreditsExpireAt(null);
        return;
      }

      const { data, error } = await supabase
        .from("user_credit_balances")
        .select("remaining_credits, plan_mode, expires_at")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to fetch credit balance:", error);
        setRemainingCredits(0);
        setSelectedPlan(null);
        setCreditsExpireAt(null);
        return;
      }

      if (!data) {
        setRemainingCredits(0);
        setSelectedPlan(null);
        setCreditsExpireAt(null);
        return;
      }

      const remaining =
        typeof data.remaining_credits === "number" ? data.remaining_credits : 0;
      const planMode =
        data.plan_mode === "test" || data.plan_mode === "business"
          ? data.plan_mode
          : null;
      const expiresAt =
        typeof data.expires_at === "string" ? data.expires_at : null;
      const isExpired = expiresAt
        ? new Date(expiresAt).getTime() <= Date.now()
        : false;

      if (remaining <= 0 || isExpired) {
        setRemainingCredits(0);
        setSelectedPlan(null);
        setCreditsExpireAt(null);
        return;
      }

      setRemainingCredits(remaining);
      setSelectedPlan(planMode);
      setCreditsExpireAt(expiresAt);
    }

    void fetchCreditBalance();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id, creditRefreshKey]);

  const sortedKeywords = useMemo(
    () =>
      Array.isArray(result?.keywords)
        ? result.keywords.slice().sort((a, b) => a.rank - b.rank)
        : [],
    [result],
  );

  const fallbackEstimatedResultTime = useMemo(
    () => estimateResultTime(text.trim().length),
    [text],
  );

  const estimatedResultTime = fallbackEstimatedResultTime;
  const creditsLoaded = typeof remainingCredits === "number";
  const hasCredits = creditsLoaded && remainingCredits > 0;
  const noCredits = !creditsLoaded || remainingCredits <= 0;
  const showPurchaseCards = noCredits && !loading && !result;
  const showInputCard = hasCredits || result !== null;
  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAuthMessage("");
    setAuthLoading(true);

    try {
      const { error: authError } =
        authMode === "sign-in"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/keyword-classification-retrieval/`,
              },
            });
      if (authError) {
        throw authError;
      }

      setAuthMessage(
        authMode === "sign-in"
          ? "Signed in successfully."
          : "Sign-up requested. Check your email if confirmation is enabled.",
      );
    } catch (authError) {
      setError(asErrorMessage(authError));
    } finally {
      setAuthLoading(false);
    }
  }
  async function handleAnalyze() {
    if (analyzeInFlightRef.current || loading) {
      return;
    }

    if (!session) {
      setError("Please sign in before analyzing patent text.");
      return;
    }

    const trimmedText = text.trim();

    if (!trimmedText) {
      setError("Enter English or Japanese patent text to analyze.");
      return;
    }

    analyzeInFlightRef.current = true;
    setLoading(true);
    setError("");
    setResult(null);
    setRemainingCreditsAfterAnalysis(null);

    try {
      const {
        data: { session: activeSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(
          `Unable to retrieve the signed-in session: ${sessionError.message}`,
        );
      }

      const accessToken = activeSession?.access_token;

      if (
        !activeSession ||
        !accessToken ||
        activeSession.user.id !== session.user.id
      ) {
        throw new Error(
          "Your signed-in session is no longer valid. Please sign in again.",
        );
      }

      const selectedKeywords: string[] = [];
      const inputFingerprint = await createAnalysisInputFingerprint(
        trimmedText,
        selectedKeywords,
      );
      const inMemoryRequest = pendingAnalyzeRequestRef.current;
      const storedRequest = readPendingAnalysisRequest();
      const reusableRequest = [inMemoryRequest, storedRequest].find(
        (candidate) =>
          candidate?.userId === activeSession.user.id &&
          candidate.inputFingerprint === inputFingerprint,
      );
      const requestId = reusableRequest?.requestId ?? crypto.randomUUID();
      const pendingRequest: PendingAnalysisRequest = {
        userId: activeSession.user.id,
        requestId,
        inputFingerprint,
      };

      pendingAnalyzeRequestRef.current = pendingRequest;
      storePendingAnalysisRequest(pendingRequest);

      const { data, error: functionError } = await supabase.functions.invoke<
        AnalysisResult & {
          requestId?: string;
          remainingCredits: number;
        }
      >("analyze", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          input: trimmedText,
          request_id: requestId,
          selected_keywords: selectedKeywords,
        },
      });

      if (functionError) {
        const response = (functionError as unknown as { context?: Response })
          .context;

        let errorBody: {
          error?: string;
          message?: string;
          remainingCredits?: number;
        } | null = null;

        if (response) {
          try {
            errorBody = await response.clone().json();
          } catch {
            errorBody = null;
          }
        }

        if (response?.status === 402) {
          pendingAnalyzeRequestRef.current = null;
          clearPendingAnalysisRequest();
          setError("");
          setResult(null);
          setRemainingCreditsAfterAnalysis(0);
          setRemainingCredits(0);
          setSelectedPlan(null);
          setCreditsExpireAt(null);
          return;
        }

        throw new Error(
          errorBody?.error ?? errorBody?.message ?? functionError.message,
        );
      }

      if (!data) {
        throw new Error(
          "Analyze request completed without returning a result.",
        );
      }

      if (
        data.analysisSchemaVersion !== EXPECTED_ANALYSIS_SCHEMA_VERSION ||
        !data.technical_concept ||
        !Array.isArray(data.keywords) ||
        data.keywords.some(
          (keyword: KeywordClassification) =>
            !Array.isArray(keyword.synonyms) || keyword.synonyms.length === 0,
        )
      ) {
        throw new Error(
          "The deployed analyze Edge Function is outdated. Deploy the matching index(48).ts that returns common-concept-v2.",
        );
      }

      if (typeof data.remainingCredits !== "number") {
        throw new Error("Analyze returned no updated credit balance.");
      }

      setResult(data);
      pendingAnalyzeRequestRef.current = null;
      clearPendingAnalysisRequest();
      setRemainingCreditsAfterAnalysis(data.remainingCredits);
      setRemainingCredits(data.remainingCredits);

      if (data.remainingCredits <= 0) {
        setSelectedPlan(null);
        setCreditsExpireAt(null);
      }
    } catch (analyzeError) {
      setError(asErrorMessage(analyzeError));
    } finally {
      analyzeInFlightRef.current = false;
      setLoading(false);
    }
  }
  function handleClear() {
    pendingAnalyzeRequestRef.current = null;
    clearPendingAnalysisRequest();
    setText("");
    setResult(null);
    setError("");
    setRemainingCreditsAfterAnalysis(null);
  }
  async function handleDownloadPdf() {
    if (!result) {
      return;
    }

    setPdfLoading(true);
    setError("");

    try {
      const { downloadAnalysisPdf } = await import("./pdf");
      downloadAnalysisPdf(result);
    } catch (pdfError) {
      setError(asErrorMessage(pdfError));
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    pendingAnalyzeRequestRef.current = null;
    clearPendingAnalysisRequest();
    setResult(null);
    setRemainingCredits(null);
    setSelectedPlan(null);
    setCreditsExpireAt(null);
  }

  if (authLoading && !session) {
    return (
      <main className="shell">
        <p className="status-card">Loading authentication…</p>
      </main>
    );
  }

  if (!session && !termsAccepted) {
    return <LandingPage onAcceptTerms={handleAcceptTerms} />;
  }

  if (!session) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <p className="eyebrow">Patent AI Analysis</p>
          <h1>Sign in to classify patent keywords</h1>
          <p className="muted">
            Sign in to securely classify patent keywords. Your text is processed
            through our secure backend after authentication.
          </p>

          <form onSubmit={handleAuth} className="auth-form">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
            </label>
            <button className="primary" type="submit" disabled={authLoading}>
              {authLoading
                ? "Working…"
                : authMode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <button
            className="link-button"
            type="button"
            onClick={() =>
              setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in")
            }
          >
            {authMode === "sign-in"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
          {authMessage && <p className="success">{authMessage}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (currentRoute === "admin-user-activity") {
    return (
      <UserActivityPage
        administratorEmail={session.user.email}
        onBack={() => {
          window.location.hash = "";
        }}
        onSignOut={async () => {
          window.location.hash = "";
          await handleSignOut();
        }}
      />
    );
  }

  return (
    <main className="shell app-shell">
      <header className="app-header">
        <div className="brand-lockup" aria-label="Top-tier Patent Search">
          <span className="brand-mark" aria-hidden="true">
            <Search />
          </span>
          <span className="brand-copy">
            <strong>Top-tier Patent Search</strong>
            <span>Classification Intelligence</span>
          </span>
        </div>
        <div className="user-panel">
          <span className="user-email" title={session.user.email}>
            {session.user.email}
          </span>
          <div className="user-panel-actions">
            {isAdmin && (
              <button
                type="button"
                className="secondary compact-button"
                onClick={() => {
                  window.location.hash = "#/admin/user-activity";
                }}
              >
                <Settings aria-hidden="true" />
                Admin
              </button>
            )}
            <button
              type="button"
              className="secondary compact-button"
              onClick={handleSignOut}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="hero" aria-labelledby="analysis-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <Sparkles aria-hidden="true" />
            English / Japanese Patent Intelligence
          </p>
          <h1 id="analysis-title">
            Keyword Extraction &amp; <span>Classification Analysis</span>
          </h1>
          <p className="hero-lead">
            Turn patent text into structured search intelligence with a
            traceable, catalog-backed classification route.
          </p>
          <ol className="workflow-route" aria-label="Analysis workflow">
            <li>Technical concept</li>
            <li>Classification intelligence</li>
            <li>Precision refinement</li>
            <li>Search-ready insights</li>
          </ol>
        </div>
        {hasCredits && (
          <aside className="credit-summary" aria-label="Credit status">
            <div className="credit-summary-heading">
              <span className="credit-summary-icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <span>
                <strong>Analysis access</strong>
                <small>Active and ready</small>
              </span>
              <span className="status-dot">Active</span>
            </div>
            <div className="credit-stats">
              <span className="user-detail">
                <span className="stat-icon" aria-hidden="true">
                  <Coins />
                </span>
                <span>
                  <span className="user-detail-label">Remaining credits</span>
                  <strong>{remainingCredits}</strong>
                </span>
              </span>
              {creditsExpireAt && (
                <span className="user-detail">
                  <span className="stat-icon" aria-hidden="true">
                    <Clock3 />
                  </span>
                  <span>
                    <span className="user-detail-label">Expiration date</span>
                    <strong>{formatLocalExpirationDate(creditsExpireAt)}</strong>
                  </span>
                </span>
              )}
            </div>
          </aside>
        )}
      </section>
      {showPurchaseCards && (
        <PricingPlans
          session={session}
          onError={setError}
          refreshKey={creditRefreshKey}
          onCreditsChange={setRemainingCredits}
        />
      )}
      {showInputCard && (
        <section className="card input-card">
          <div className="input-card-header">
            <div className="section-title">
              <span className="section-icon" aria-hidden="true">
                <FileText />
              </span>
              <span>
                <span className="section-kicker">Analysis input</span>
                <h2>Patent text</h2>
              </span>
            </div>
            <span className="character-count" aria-live="polite">
              {text.length.toLocaleString()} characters
            </span>
          </div>
          <label className="sr-only" htmlFor="patent-analysis-text">
            Patent claims, abstracts, or descriptions
          </label>
          <textarea
            id="patent-analysis-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste English or Japanese patent claims, abstracts, or descriptions…"
            spellCheck={false}
          />
          <div className="input-meta">
            <p className="estimate">
              <Clock3 aria-hidden="true" />
              {estimatedResultTime}
            </p>
            <p className="secure-processing">
              <ShieldCheck aria-hidden="true" />
              Secure authenticated processing
            </p>
          </div>
          <div className="actions input-actions">
            <button
              className="primary"
              type="button"
              onClick={handleAnalyze}
              disabled={loading || !hasCredits}
            >
              <Sparkles aria-hidden="true" />
              {loading ? "Analyzing…" : "Analyze patent text"}
              {!loading && <ArrowRight aria-hidden="true" />}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={handleClear}
              disabled={loading}
            >
              <Eraser aria-hidden="true" />
              Clear
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {loading && (
        <p className="status-card">
          Analyzing text securely through Supabase Edge Functions…{" "}
          {estimatedResultTime}
        </p>
      )}
      {result && (
        <section className="card results-card">
          <div className="section-heading">
            <div>
              <h2>Results</h2>
              <p className="muted">
                Detected language: <strong>{result.language}</strong>
              </p>
              <p className="muted" style={{ marginBottom: 0 }}>
                Every displayed code is catalog-backed and linked to the
                preceding route step. An FI subdivision is withheld unless it
                belongs to the selected IPC/CPC area; an F-term aspect is
                withheld unless its theme and FI scope both match. The route is
                search guidance, not an official classification assignment;
                confirm the current FI/F-term scope and hierarchy in J-PlatPat.
              </p>
            </div>
            <button
              className="primary"
              type="button"
              onClick={handleDownloadPdf}
              disabled={
                !Array.isArray(result.keywords) ||
                result.keywords.length === 0 ||
                pdfLoading
              }
            >
              {pdfLoading ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
          {result.warning && <p className="warning">{result.warning}</p>}
          <section className="common-concept-card">
            <div className="common-concept-label">
              AI-DERIVED COMMON TECHNICAL CONCEPT
            </div>
            <p className="common-concept-note">
              This complete-input concept is shared by all retrieved keywords.
            </p>
            <TechnicalInterpretationCell
              interpretation={result.technical_concept}
            />
          </section>
          <div
            aria-label="Keyword analysis results in portrait layout"
            className="keyword-results-list"
          >
            {sortedKeywords.map((keyword) => (
              <KeywordResultCard
                key={`${keyword.rank}-${keyword.normalized_term}`}
                keyword={keyword}
              />
            ))}
          </div>
        </section>
      )}
      <Footer />
    </main>
  );
}
