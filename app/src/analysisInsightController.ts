import { loadPatentSearchInsights, type PatentSearchInsight } from "./analysisInsights";

const ANALYSIS_STATUS_MARKER =
  "Analyzing text securely through Supabase Edge Functions";
const ROTATION_MS = 5_000;

let insightCache: PatentSearchInsight[] | null = null;
let insightLoadPromise: Promise<PatentSearchInsight[]> | null = null;

async function getInsights(): Promise<PatentSearchInsight[]> {
  if (insightCache) {
    return insightCache;
  }

  if (!insightLoadPromise) {
    insightLoadPromise = loadPatentSearchInsights()
      .then((insights) => {
        insightCache = insights;
        return insights;
      })
      .finally(() => {
        insightLoadPromise = null;
      });
  }

  return insightLoadPromise;
}

function makeSpan(className: string, text = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function attachInsightCard(statusCard: HTMLElement): void {
  if (statusCard.dataset.patentInsightAttached === "true") {
    return;
  }

  statusCard.dataset.patentInsightAttached = "true";
  statusCard.classList.add("analysis-insight-status-card");

  const panel = makeSpan("analysis-insight-panel");
  const eyebrow = makeSpan("analysis-insight-eyebrow", "PATENT SEARCH INSIGHT");
  const title = makeSpan("analysis-insight-title", "Loading insight…");
  const body = makeSpan(
    "analysis-insight-body",
    "Retrieving curated patent-search guidance from Supabase.",
  );
  const counter = makeSpan("analysis-insight-counter");

  panel.append(eyebrow, title, body, counter);
  statusCard.append(panel);

  void getInsights()
    .then((insights) => {
      if (!statusCard.isConnected) {
        return;
      }

      if (insights.length === 0) {
        title.textContent = "Patent search insight unavailable";
        body.textContent = "No active patent-search insights are configured.";
        return;
      }

      let index = Math.floor(Date.now() / ROTATION_MS) % insights.length;

      const renderInsight = () => {
        const insight = insights[index];
        title.textContent = insight.title;
        body.textContent = insight.body;
        counter.textContent = `${insight.display_order} of ${insights.length}`;
      };

      renderInsight();

      const timerId = window.setInterval(() => {
        if (!statusCard.isConnected) {
          window.clearInterval(timerId);
          return;
        }

        index = (index + 1) % insights.length;
        renderInsight();
      }, ROTATION_MS);
    })
    .catch((error: unknown) => {
      console.warn("Failed to load patent-search insights:", error);
      title.textContent = "Patent search insight unavailable";
      body.textContent =
        "Analysis is continuing securely, but the insight library could not be loaded.";
    });
}

function scanForAnalysisStatusCard(): void {
  document
    .querySelectorAll<HTMLElement>(".app-shell > .status-card")
    .forEach((statusCard) => {
      if (statusCard.textContent?.includes(ANALYSIS_STATUS_MARKER)) {
        attachInsightCard(statusCard);
      }
    });
}

export function startAnalysisInsightController(): void {
  scanForAnalysisStatusCard();

  const observer = new MutationObserver(scanForAnalysisStatusCard);
  observer.observe(document.body, { childList: true, subtree: true });
}
