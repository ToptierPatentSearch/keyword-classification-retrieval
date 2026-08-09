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
