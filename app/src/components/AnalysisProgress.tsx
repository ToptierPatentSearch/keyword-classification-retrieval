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
