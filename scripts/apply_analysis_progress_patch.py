from pathlib import Path
from textwrap import dedent


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Could not find patch target: {label}")
    return text.replace(old, new, 1)


root = Path(__file__).resolve().parents[1]
app_path = root / "app/src/App.tsx"
backend_path = root / "supabase/functions/analyze/index.ts"
css_path = root / "app/src/analysis-slideshow.css"

app = app_path.read_text(encoding="utf-8")
app = replace_once(
    app,
    'import SearchQueryStarter from "./components/SearchQueryStarter";\nimport { buildSearchQueryStarter } from "./searchQuery";',
    'import SearchQueryStarter from "./components/SearchQueryStarter";\nimport AnalysisProgress from "./components/AnalysisProgress";\nimport {\n  fetchAnalysisProgress,\n  type AnalysisProgressRow,\n} from "./analysisProgress";\nimport { buildSearchQueryStarter } from "./searchQuery";',
    "App imports",
)
app = replace_once(
    app,
    '  const [result, setResult] = useState<AnalysisResult | null>(null);\n  const [loading, setLoading] = useState(false);\n  const [pdfLoading, setPdfLoading] = useState(false);',
    '  const [result, setResult] = useState<AnalysisResult | null>(null);\n  const [loading, setLoading] = useState(false);\n  const [activeAnalysisRequestId, setActiveAnalysisRequestId] = useState<\n    string | null\n  >(null);\n  const [analysisProgress, setAnalysisProgress] = useState<\n    AnalysisProgressRow[]\n  >([]);\n  const [pdfLoading, setPdfLoading] = useState(false);',
    "analysis progress state",
)
app = replace_once(
    app,
    '  }, [session?.user.id, creditRefreshKey]);\n\n  const sortedKeywords = useMemo(',
    dedent(
        '''
          }, [session?.user.id, creditRefreshKey]);

          useEffect(() => {
            const userId = session?.user.id;

            if (!loading || !userId || !activeAnalysisRequestId) {
              return;
            }

            let cancelled = false;
            let timerId: number | null = null;

            async function pollAnalysisProgress() {
              const rows = await fetchAnalysisProgress(
                userId,
                activeAnalysisRequestId,
              );

              if (cancelled || rows === null) {
                return;
              }

              if (rows.length > 0) {
                setAnalysisProgress(rows);
              }

              timerId = window.setTimeout(() => {
                void pollAnalysisProgress();
              }, 500);
            }

            void pollAnalysisProgress();

            return () => {
              cancelled = true;

              if (timerId !== null) {
                window.clearTimeout(timerId);
              }
            };
          }, [loading, session?.user.id, activeAnalysisRequestId]);

          const sortedKeywords = useMemo(
        '''
    ).lstrip(),
    "analysis progress polling effect",
)
app = replace_once(
    app,
    '    setLoading(true);\n    setError("");\n    setResult(null);\n    setRemainingCreditsAfterAnalysis(null);',
    '    setLoading(true);\n    setError("");\n    setResult(null);\n    setActiveAnalysisRequestId(null);\n    setAnalysisProgress([]);\n    setRemainingCreditsAfterAnalysis(null);',
    "analysis reset",
)
app = replace_once(
    app,
    '      pendingAnalyzeRequestRef.current = pendingRequest;\n      storePendingAnalysisRequest(pendingRequest);\n\n      const { data, error: functionError } = await supabase.functions.invoke<',
    dedent(
        '''
              pendingAnalyzeRequestRef.current = pendingRequest;
              storePendingAnalysisRequest(pendingRequest);
              setActiveAnalysisRequestId(requestId);
              setAnalysisProgress([
                {
                  stage: "input_review",
                  stage_index: 0,
                  status: "running",
                  error_message: null,
                  updated_at: new Date().toISOString(),
                },
              ]);

              const { data, error: functionError } = await supabase.functions.invoke<
        '''
    ).lstrip(),
    "activate progress request",
)
app = replace_once(
    app,
    '      setResult(data);\n      pendingAnalyzeRequestRef.current = null;',
    dedent(
        '''
              const finalProgress = await fetchAnalysisProgress(
                activeSession.user.id,
                requestId,
              );

              if (finalProgress && finalProgress.length > 0) {
                setAnalysisProgress(finalProgress);
              }

              setResult(data);
              pendingAnalyzeRequestRef.current = null;
        '''
    ).lstrip(),
    "final progress refresh",
)
app = replace_once(
    app,
    '  function handleClear() {\n    pendingAnalyzeRequestRef.current = null;\n    clearPendingAnalysisRequest();\n    setText("");',
    '  function handleClear() {\n    pendingAnalyzeRequestRef.current = null;\n    clearPendingAnalysisRequest();\n    setActiveAnalysisRequestId(null);\n    setAnalysisProgress([]);\n    setText("");',
    "clear progress state",
)
app = replace_once(
    app,
    '    pendingAnalyzeRequestRef.current = null;\n    clearPendingAnalysisRequest();\n    clearLocalConsent();',
    '    pendingAnalyzeRequestRef.current = null;\n    clearPendingAnalysisRequest();\n    setActiveAnalysisRequestId(null);\n    setAnalysisProgress([]);\n    clearLocalConsent();',
    "sign-out progress reset",
)
app = replace_once(
    app,
    dedent(
        '''
              {loading && (
                <p className="status-card">
                  Analyzing text securely through Supabase Edge Functions…{" "}
                  {estimatedResultTime}
                </p>
              )}
        '''
    ).lstrip(),
    dedent(
        '''
              {loading && (
                <section
                  className="status-card analysis-progress-card"
                  aria-live="polite"
                  aria-label="Backend analysis progress"
                >
                  <AnalysisProgress rows={analysisProgress} />
                  <p className="analysis-progress-summary">
                    Analyzing text securely through Supabase Edge Functions…{" "}
                    {estimatedResultTime}
                  </p>
                </section>
              )}
        '''
    ).lstrip(),
    "loading progress card",
)
app_path.write_text(app, encoding="utf-8")

analysis_progress_module = dedent(
    '''
    import { supabase } from "./supabaseClient";

    export const ANALYSIS_PROGRESS_STAGES = [
      { id: "input_review", label: "Input review" },
      { id: "concept_extraction", label: "Concept extraction" },
      { id: "keyword_expansion", label: "Keyword expansion" },
      { id: "classification", label: "Classification" },
      { id: "query_generation", label: "Query generation" },
      { id: "final_formatting", label: "Final formatting" },
    ] as const;

    export type AnalysisProgressStage =
      (typeof ANALYSIS_PROGRESS_STAGES)[number]["id"];
    export type AnalysisProgressStatus = "running" | "completed" | "failed";

    export interface AnalysisProgressRow {
      stage: AnalysisProgressStage;
      stage_index: number;
      status: AnalysisProgressStatus;
      error_message: string | null;
      updated_at: string;
    }

    const validStages = new Set<string>(
      ANALYSIS_PROGRESS_STAGES.map((stage) => stage.id),
    );
    const validStatuses = new Set<string>(["running", "completed", "failed"]);
    let progressTableUnavailable = false;

    export async function fetchAnalysisProgress(
      userId: string,
      requestId: string,
    ): Promise<AnalysisProgressRow[] | null> {
      if (progressTableUnavailable) {
        return null;
      }

      const { data, error } = await supabase
        .from("analysis_progress")
        .select("stage, stage_index, status, error_message, updated_at")
        .eq("user_id", userId)
        .eq("request_id", requestId)
        .order("stage_index", { ascending: true });

      if (error) {
        progressTableUnavailable = true;
        console.warn(
          "Backend analysis progress is unavailable. Analysis will continue normally:",
          error.message,
        );
        return null;
      }

      return (data ?? []).filter(
        (row): row is AnalysisProgressRow =>
          typeof row.stage === "string" &&
          validStages.has(row.stage) &&
          typeof row.stage_index === "number" &&
          typeof row.status === "string" &&
          validStatuses.has(row.status) &&
          (row.error_message === null ||
            typeof row.error_message === "string") &&
          typeof row.updated_at === "string",
      );
    }
    '''
).lstrip()
(root / "app/src/analysisProgress.ts").write_text(
    analysis_progress_module,
    encoding="utf-8",
)

analysis_progress_component = dedent(
    '''
    import {
      ANALYSIS_PROGRESS_STAGES,
      type AnalysisProgressRow,
    } from "../analysisProgress";

    type AnalysisProgressProps = {
      rows: AnalysisProgressRow[];
    };

    export default function AnalysisProgress({ rows }: AnalysisProgressProps) {
      const rowsByStage = new Map(rows.map((row) => [row.stage, row]));
      const reachedStageIndex = rows.reduce(
        (highest, row) => Math.max(highest, row.stage_index),
        0,
      );
      const currentStage =
        ANALYSIS_PROGRESS_STAGES[reachedStageIndex] ??
        ANALYSIS_PROGRESS_STAGES[0];
      const currentRow = rowsByStage.get(currentStage.id);
      const currentLabel =
        currentRow?.status === "failed"
          ? `${currentStage.label} could not be completed`
          : currentStage.label;

      return (
        <div className="analysis-progress-panel">
          <div className="analysis-progress-heading">
            <span className="analysis-progress-kicker">BACKEND PROCESSING</span>
            <strong>
              Current stage: <span>{currentLabel}</span>
            </strong>
          </div>

          <ol className="analysis-progress-steps">
            {ANALYSIS_PROGRESS_STAGES.map((stage, index) => {
              const row = rowsByStage.get(stage.id);
              const isFailed = row?.status === "failed";
              const isComplete =
                row?.status === "completed" || index < reachedStageIndex;
              const isCurrent = index === reachedStageIndex && !isComplete;
              const stateClass = isFailed
                ? "is-failed"
                : isComplete
                  ? "is-complete"
                  : isCurrent
                    ? "is-current"
                    : "is-pending";

              return (
                <li
                  key={stage.id}
                  className={stateClass}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span className="analysis-progress-step-number" aria-hidden="true">
                    {isComplete ? "✓" : index + 1}
                  </span>
                  <span>{stage.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      );
    }
    '''
).lstrip()
(root / "app/src/components/AnalysisProgress.tsx").write_text(
    analysis_progress_component,
    encoding="utf-8",
)

css = css_path.read_text(encoding="utf-8")
css_addition = dedent(
    '''

    /* Backend-reported analysis stages */
    .analysis-progress-card {
      display: grid;
      gap: 0.9rem;
    }

    .analysis-progress-panel {
      display: grid;
      gap: 0.9rem;
      width: min(100%, 900px);
      margin: 0 auto;
      padding: 1.1rem 1.2rem;
      border: 1px solid rgba(37, 99, 235, 0.22);
      border-radius: 0.95rem;
      background: linear-gradient(135deg, #eff6ff, #ffffff);
      text-align: left;
    }

    .analysis-progress-heading {
      display: grid;
      gap: 0.25rem;
    }

    .analysis-progress-heading strong {
      color: #0f172a;
      font-size: clamp(1rem, 2vw, 1.2rem);
    }

    .analysis-progress-heading strong span {
      color: #1d4ed8;
    }

    .analysis-progress-kicker {
      color: #475569;
      font-size: 0.7rem;
      font-weight: 900;
      letter-spacing: 0.08em;
    }

    .analysis-progress-steps {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 0.55rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .analysis-progress-steps li {
      display: grid;
      justify-items: center;
      gap: 0.4rem;
      min-width: 0;
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 750;
      line-height: 1.25;
      text-align: center;
    }

    .analysis-progress-step-number {
      display: grid;
      width: 2rem;
      height: 2rem;
      place-items: center;
      border: 2px solid #cbd5e1;
      border-radius: 999px;
      background: #ffffff;
      color: #64748b;
      font-size: 0.8rem;
      font-weight: 900;
    }

    .analysis-progress-steps li.is-current {
      color: #1d4ed8;
    }

    .analysis-progress-steps li.is-current .analysis-progress-step-number {
      border-color: #2563eb;
      background: #dbeafe;
      color: #1d4ed8;
      box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.12);
      animation: analysis-progress-pulse 1.4s ease-in-out infinite;
    }

    .analysis-progress-steps li.is-complete {
      color: #166534;
    }

    .analysis-progress-steps li.is-complete .analysis-progress-step-number {
      border-color: #22c55e;
      background: #dcfce7;
      color: #166534;
    }

    .analysis-progress-steps li.is-failed {
      color: #b91c1c;
    }

    .analysis-progress-steps li.is-failed .analysis-progress-step-number {
      border-color: #ef4444;
      background: #fee2e2;
      color: #b91c1c;
    }

    .analysis-progress-summary {
      margin: 0;
      color: #475569;
      font-size: 0.84rem;
      line-height: 1.5;
      text-align: center;
    }

    @keyframes analysis-progress-pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.06);
      }
    }

    @media (max-width: 760px) {
      .analysis-progress-steps {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        row-gap: 0.85rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .analysis-progress-steps li.is-current .analysis-progress-step-number {
        animation: none;
      }
    }
    '''
)
if "/* Backend-reported analysis stages */" not in css:
    css += css_addition
css_path.write_text(css, encoding="utf-8")

backend = backend_path.read_text(encoding="utf-8")
backend = replace_once(
    backend,
    'const corsHeaders = {\n  "Access-Control-Allow-Origin": "*",\n  "Access-Control-Allow-Headers":\n    "authorization, x-client-info, apikey, content-type",\n  "Access-Control-Allow-Methods": "POST, OPTIONS",\n  "Access-Control-Max-Age": "86400",\n};\n\nconst MIN_INPUT_CHARS = 20;',
    dedent(
        '''
        const corsHeaders = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Max-Age": "86400",
        };

        type AnalysisProgressStage =
          | "input_review"
          | "concept_extraction"
          | "keyword_expansion"
          | "classification"
          | "query_generation"
          | "final_formatting";
        type AnalysisProgressStatus = "running" | "completed" | "failed";

        const ANALYSIS_PROGRESS_STAGE_INDEX: Record<AnalysisProgressStage, number> = {
          input_review: 0,
          concept_extraction: 1,
          keyword_expansion: 2,
          classification: 3,
          query_generation: 4,
          final_formatting: 5,
        };
        let analysisProgressUnavailable = false;

        async function writeAnalysisProgress(
          adminClient: SupabaseClient,
          userId: string,
          requestId: string,
          stage: AnalysisProgressStage,
          status: AnalysisProgressStatus = "running",
          errorMessage: string | null = null,
        ): Promise<void> {
          if (analysisProgressUnavailable) {
            return;
          }

          const now = new Date();
          const { error } = await adminClient.from("analysis_progress").upsert(
            {
              user_id: userId,
              request_id: requestId,
              stage,
              stage_index: ANALYSIS_PROGRESS_STAGE_INDEX[stage],
              status,
              error_message: errorMessage,
              updated_at: now.toISOString(),
              expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            },
            { onConflict: "user_id,request_id,stage" },
          );

          if (error) {
            analysisProgressUnavailable = true;
            console.warn(
              "Analysis progress could not be recorded; analysis will continue normally:",
              error.message,
            );
          }
        }

        const MIN_INPUT_CHARS = 20;
        '''
    ).lstrip(),
    "backend progress types and writer",
)
backend = replace_once(
    backend,
    '  let auditSelectedKeywordCount: number | undefined;\n\n  try {',
    '  let auditSelectedKeywordCount: number | undefined;\n  let auditAdminClient: SupabaseClient | undefined;\n  let auditProgressStage: AnalysisProgressStage = "input_review";\n\n  try {',
    "backend progress audit state",
)
backend = replace_once(
    backend,
    '    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {\n      auth: {\n        persistSession: false,\n        autoRefreshToken: false,\n      },\n    });\n\n    auditStage = "request_validation";',
    '    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {\n      auth: {\n        persistSession: false,\n        autoRefreshToken: false,\n      },\n    });\n    auditAdminClient = adminClient;\n\n    auditStage = "request_validation";',
    "capture admin client",
)
backend = replace_once(
    backend,
    '    logAnalysisAudit("started", {\n      stage: "request_accepted",\n      user_id: auditUserId,\n      request_id: auditRequestId,\n      input_hash: auditInputHash,\n      input_characters: auditInputCharacters,\n      selected_keyword_count: auditSelectedKeywordCount,\n    });\n\n    auditStage = "idempotency_check";',
    '    logAnalysisAudit("started", {\n      stage: "request_accepted",\n      user_id: auditUserId,\n      request_id: auditRequestId,\n      input_hash: auditInputHash,\n      input_characters: auditInputCharacters,\n      selected_keyword_count: auditSelectedKeywordCount,\n    });\n\n    auditProgressStage = "input_review";\n    await writeAnalysisProgress(\n      adminClient,\n      user.id,\n      requestId,\n      auditProgressStage,\n    );\n\n    auditStage = "idempotency_check";',
    "record input review",
)
backend = replace_once(
    backend,
    '    auditStage = "openai_analysis";\n    const aiResult = await analyzePatentText(text, apiKey, selectedKeywords);\n    let result: AnalysisResult;',
    '    auditStage = "openai_analysis";\n    auditProgressStage = "concept_extraction";\n    await writeAnalysisProgress(\n      adminClient,\n      user.id,\n      requestId,\n      auditProgressStage,\n    );\n    const aiResult = await analyzePatentText(text, apiKey, selectedKeywords);\n    auditProgressStage = "keyword_expansion";\n    await writeAnalysisProgress(\n      adminClient,\n      user.id,\n      requestId,\n      auditProgressStage,\n    );\n    let result: AnalysisResult;',
    "record AI stages",
)
backend = replace_once(
    backend,
    '    try {\n      auditStage = "classification_lookup";\n      result = await lookupAndRankClassifications(adminClient, aiResult);',
    '    try {\n      auditStage = "classification_lookup";\n      auditProgressStage = "classification";\n      await writeAnalysisProgress(\n        adminClient,\n        user.id,\n        requestId,\n        auditProgressStage,\n      );\n      result = await lookupAndRankClassifications(adminClient, aiResult);',
    "record classification stage",
)
backend = replace_once(
    backend,
    '      auditStage = "search_query_review";\n      const searchQueryStarter = await reviewSearchQueriesWithAi(result, apiKey);',
    '      auditStage = "search_query_review";\n      auditProgressStage = "query_generation";\n      await writeAnalysisProgress(\n        adminClient,\n        user.id,\n        requestId,\n        auditProgressStage,\n      );\n      const searchQueryStarter = await reviewSearchQueriesWithAi(result, apiKey);',
    "record query generation stage",
)
backend = replace_once(
    backend,
    '    auditStage = "pre_charge_validation";\n    validateAnalysisReadyForCharge(result, text);',
    '    auditStage = "pre_charge_validation";\n    auditProgressStage = "final_formatting";\n    await writeAnalysisProgress(\n      adminClient,\n      user.id,\n      requestId,\n      auditProgressStage,\n    );\n    validateAnalysisReadyForCharge(result, text);',
    "record final formatting stage",
)
backend = replace_once(
    backend,
    '    return jsonResponse({\n      ...preparedResponse,\n      remainingCredits: Number.isFinite(remainingCredits)',
    '    await writeAnalysisProgress(\n      adminClient,\n      user.id,\n      requestId,\n      "final_formatting",\n      "completed",\n    );\n\n    return jsonResponse({\n      ...preparedResponse,\n      remainingCredits: Number.isFinite(remainingCredits)',
    "complete progress",
)
backend = replace_once(
    backend,
    '    logAnalysisAudit("failed", {\n      stage: auditStage,\n      user_id: auditUserId,\n      request_id: auditRequestId,\n      input_hash: auditInputHash,\n      input_characters: auditInputCharacters,\n      selected_keyword_count: auditSelectedKeywordCount,\n      status_code: status,\n      error_name: error instanceof Error ? error.name : "UnknownError",\n      error_message: message,\n      duration_ms: Date.now() - analysisStartedAt,\n    });\n\n    return jsonResponse({ error: message }, { status });',
    '    logAnalysisAudit("failed", {\n      stage: auditStage,\n      user_id: auditUserId,\n      request_id: auditRequestId,\n      input_hash: auditInputHash,\n      input_characters: auditInputCharacters,\n      selected_keyword_count: auditSelectedKeywordCount,\n      status_code: status,\n      error_name: error instanceof Error ? error.name : "UnknownError",\n      error_message: message,\n      duration_ms: Date.now() - analysisStartedAt,\n    });\n\n    if (auditAdminClient && auditUserId && auditRequestId) {\n      await writeAnalysisProgress(\n        auditAdminClient,\n        auditUserId,\n        auditRequestId,\n        auditProgressStage,\n        "failed",\n        message,\n      );\n    }\n\n    return jsonResponse({ error: message }, { status });',
    "record failed progress",
)
backend_path.write_text(backend, encoding="utf-8")

migration = dedent(
    '''
    create table if not exists public.analysis_progress (
      user_id uuid not null references auth.users(id) on delete cascade,
      request_id uuid not null,
      stage text not null check (
        stage in (
          'input_review',
          'concept_extraction',
          'keyword_expansion',
          'classification',
          'query_generation',
          'final_formatting'
        )
      ),
      stage_index smallint not null check (stage_index between 0 and 5),
      status text not null default 'running' check (
        status in ('running', 'completed', 'failed')
      ),
      error_message text,
      updated_at timestamptz not null default now(),
      expires_at timestamptz not null default (now() + interval '1 day'),
      primary key (user_id, request_id, stage)
    );

    create index if not exists analysis_progress_request_stage_idx
      on public.analysis_progress (user_id, request_id, stage_index);

    create index if not exists analysis_progress_expires_at_idx
      on public.analysis_progress (expires_at);

    alter table public.analysis_progress enable row level security;

    drop policy if exists "Users can read own analysis progress"
      on public.analysis_progress;

    create policy "Users can read own analysis progress"
      on public.analysis_progress
      for select
      to authenticated
      using (auth.uid() = user_id);

    revoke all on table public.analysis_progress from anon;
    revoke insert, update, delete on table public.analysis_progress from authenticated;
    grant select on table public.analysis_progress to authenticated;

    comment on table public.analysis_progress is
      'Short-lived backend progress events for an authenticated patent-text analysis request.';
    '''
).lstrip()
(root / "supabase/migrations/20260809090000_create_analysis_progress.sql").write_text(
    migration,
    encoding="utf-8",
)

print("Analysis progress patch applied.")
