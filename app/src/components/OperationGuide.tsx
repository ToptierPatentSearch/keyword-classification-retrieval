import type { ReactNode } from "react";

import { ANALYSIS_PROGRESS_STAGES } from "../analysisProgress";
import "./operation-guide.css";

type GuideStepId =
  | "sign-in"
  | "credits"
  | "input"
  | "analyze"
  | "results"
  | "queries"
  | "pdf";

type GuideStep = {
  id: GuideStepId;
  number: number;
  title: string;
  description: string;
  caption: string;
  tips?: string[];
  warning?: string;
};

const guideSteps: GuideStep[] = [
  {
    id: "sign-in",
    number: 1,
    title: "Create an account or sign in",
    description:
      "Open the app and sign in with your registered email address. Follow the email authentication instructions when account confirmation is required.",
    caption:
      "The sign-in area uses your email address to identify the account that owns the analysis credits.",
    tips: [
      "Use the same email address for authentication and credit purchases.",
      "Check the spam folder when the authentication email does not arrive.",
    ],
  },
  {
    id: "credits",
    number: 2,
    title: "Check or purchase analysis credits",
    description:
      "Confirm the remaining-credit display. When no credits remain, select an analysis pack and complete payment through Stripe Checkout.",
    caption:
      "The app shows the available packs when credits are unavailable and updates the balance after the Stripe webhook confirms payment.",
    tips: [
      "Test Pack provides 2 analyses for ¥500.",
      "Business Pack provides 10 analyses for ¥2,000.",
      "Return to the app with the same signed-in account after checkout.",
    ],
    warning:
      "Do not treat the checkout success screen alone as proof that credits were granted. The server-side payment confirmation updates the balance.",
  },
  {
    id: "input",
    number: 3,
    title: "Enter English or Japanese technical text",
    description:
      "Paste a technical concept, invention summary, claim-related passage, or search-preparation description into the input field.",
    caption:
      "Clear, focused input helps the app identify useful keywords, related concepts, and classification candidates.",
    tips: [
      "State the technical subject, purpose, components, and relationships clearly.",
      "Remove unrelated background information before analysis.",
      "Do not enter confidential client information, passwords, API keys, or personal data.",
    ],
  },
  {
    id: "analyze",
    number: 4,
    title: "Run the analysis",
    description:
      "Review the character count and remaining credits, and then select Analyze patent text. While the request is running, the app reports the current backend stage and displays curated patent-search guidance.",
    caption:
      "The upper panel reports completed, current, and pending analysis stages. The lower panel rotates patent-search insights while processing continues.",
    tips: [
      "A green check mark identifies a completed stage; the blue marker identifies the current stage.",
      "Patent Search Insight cards change automatically and do not alter the analysis result.",
      "Wait for all six stages to finish before reviewing the generated output.",
    ],
    warning:
      "Do not repeatedly select Analyze while the first request is still processing.",
  },
  {
    id: "results",
    number: 5,
    title: "Review the analysis results",
    description:
      "Examine the extracted keywords, synonyms, technical concepts, and IPC or CPC classification information before using them in a search.",
    caption:
      "The result organizes search concepts and classification candidates, but professional review remains necessary.",
    tips: [
      "Confirm that each classification is technically relevant.",
      "Remove unrelated synonyms before conducting a database search.",
      "Verify important classification symbols against an official classification resource.",
    ],
  },
  {
    id: "queries",
    number: 6,
    title: "Use the Search Query Starter",
    description:
      "Review and copy the generated Boolean keyword query and Google Patents CPC query. Adapt them to the search objective and database syntax.",
    caption:
      "The two query blocks provide starting points for keyword searching and CPC-focused Google Patents searching.",
    tips: [
      "Test keyword and classification blocks separately before combining them.",
      "Add exclusions only after reviewing unwanted result patterns.",
      "Treat every generated query as a starting point rather than a complete search strategy.",
    ],
  },
  {
    id: "pdf",
    number: 7,
    title: "Download and retain the result",
    description:
      "Use Download PDF to retain the analysis. Review the downloaded document before sending it to a client or including it in a patent-search report.",
    caption:
      "The PDF provides a portable record of the input, analysis results, and search-query starter.",
    tips: [
      "Use a descriptive file name containing the project and analysis date.",
      "Keep the original input together with the downloaded result.",
    ],
  },
];

function BrowserFrame({ children }: { children: ReactNode }) {
  return (
    <div className="guide-browser-frame">
      <div className="guide-browser-bar" aria-hidden="true">
        <span />
        <span />
        <span />
        <div className="guide-browser-address">keyword-classification-retrieval</div>
      </div>
      <div className="guide-browser-content">{children}</div>
    </div>
  );
}

function GuideIllustration({ step }: { step: GuideStepId }) {
  if (step === "sign-in") {
    return (
      <BrowserFrame>
        <div className="guide-sign-in-layout" aria-hidden="true">
          <div className="guide-brand-block">
            <span className="guide-mini-eyebrow">Keyword &amp; Classification Mapping</span>
            <strong>Patent search preparation begins here.</strong>
            <p>Organize technical concepts and classification candidates.</p>
          </div>
          <div className="guide-sign-in-card">
            <strong>Sign in</strong>
            <label>Email address</label>
            <div className="guide-mock-input">name@example.com</div>
            <div className="guide-primary-button">Send sign-in link</div>
            <span className="guide-callout guide-callout-one">1</span>
            <span className="guide-callout guide-callout-two">2</span>
          </div>
        </div>
      </BrowserFrame>
    );
  }

  if (step === "credits") {
    return (
      <BrowserFrame>
        <div className="guide-credit-layout" aria-hidden="true">
          <div className="guide-credit-summary">
            <span>Remaining credits</span>
            <strong>0</strong>
          </div>
          <div className="guide-plan-grid">
            <div className="guide-plan-card">
              <span>Test Pack</span>
              <strong>2 analyses</strong>
              <b>¥500</b>
              <div className="guide-secondary-button">Select pack</div>
            </div>
            <div className="guide-plan-card guide-plan-card-featured">
              <span>Business Pack</span>
              <strong>10 analyses</strong>
              <b>¥2,000</b>
              <div className="guide-primary-button">Select pack</div>
            </div>
          </div>
          <span className="guide-callout guide-callout-one">1</span>
          <span className="guide-callout guide-callout-three">2</span>
        </div>
      </BrowserFrame>
    );
  }

  if (step === "input") {
    return (
      <BrowserFrame>
        <div className="guide-input-layout" aria-hidden="true">
          <div className="guide-input-heading">
            <div>
              <span className="guide-mini-eyebrow">Analyze technical text</span>
              <strong>Enter English or Japanese patent text</strong>
            </div>
            <div className="guide-credit-pill">Credits: 4</div>
          </div>
          <div className="guide-text-area">
            A wireless charging system includes a transmitting coil, a receiving
            coil, and a controller that adjusts power transfer according to
            coupling conditions...
          </div>
          <div className="guide-character-row">
            <span>Focused technical descriptions produce clearer results.</span>
            <b>186 / 10,000</b>
          </div>
          <span className="guide-callout guide-callout-one">1</span>
          <span className="guide-callout guide-callout-four">2</span>
        </div>
      </BrowserFrame>
    );
  }

  if (step === "analyze") {
    return (
      <BrowserFrame>
        <div className="guide-analyze-layout" aria-hidden="true">
          <div className="guide-analysis-progress-panel">
            <div className="guide-analysis-progress-heading">
              <span>BACKEND PROCESSING</span>
              <strong>
                Current stage: <b>Classification</b>
              </strong>
            </div>
            <ol className="guide-analysis-progress-steps">
              {ANALYSIS_PROGRESS_STAGES.map((stage, index) => {
                const state =
                  index < 3
                    ? "is-complete"
                    : index === 3
                      ? "is-current"
                      : "is-pending";

                return (
                  <li className={state} key={stage.id}>
                    <span>{index < 3 ? "✓" : index + 1}</span>
                    <b>{stage.label}</b>
                  </li>
                );
              })}
            </ol>
            <p>Analyzing text securely through Supabase Edge Functions…</p>
          </div>

          <div className="guide-patent-insight-panel">
            <div className="guide-insight-icon" aria-hidden="true">
              <span />
            </div>
            <div className="guide-insight-copy">
              <span>PATENT SEARCH INSIGHT</span>
              <strong>Combine keyword and classification searching.</strong>
              <p>
                Keywords provide semantic flexibility, while IPC, CPC, FI, and
                F-term classifications provide technical structure.
              </p>
            </div>
            <div className="guide-insight-meta">
              <span>Changes automatically</span>
              <b>3 of 30</b>
            </div>
          </div>
          <span className="guide-callout guide-callout-analysis">1</span>
          <span className="guide-callout guide-callout-insight">2</span>
        </div>
      </BrowserFrame>
    );
  }

  if (step === "results") {
    return (
      <BrowserFrame>
        <div className="guide-result-layout" aria-hidden="true">
          <div className="guide-result-header">
            <div>
              <span className="guide-mini-eyebrow">Analysis result</span>
              <strong>Wireless power transfer</strong>
            </div>
            <div className="guide-success-pill">Completed</div>
          </div>
          <div className="guide-result-grid">
            <div className="guide-result-card">
              <span>Keyword candidates</span>
              <div className="guide-tag-row">
                <b>wireless charging</b>
                <b>inductive coupling</b>
                <b>power transfer</b>
                <b>coil alignment</b>
              </div>
            </div>
            <div className="guide-result-card">
              <span>Classification candidates</span>
              <div className="guide-code-row">
                <b>H02J 50/10</b>
                <small>Inductive power transfer</small>
              </div>
              <div className="guide-code-row">
                <b>B60L 53/12</b>
                <small>Wireless charging of vehicles</small>
              </div>
            </div>
          </div>
          <span className="guide-callout guide-callout-one">1</span>
          <span className="guide-callout guide-callout-three">2</span>
        </div>
      </BrowserFrame>
    );
  }

  if (step === "queries") {
    return (
      <BrowserFrame>
        <div className="guide-query-layout" aria-hidden="true">
          <div className="guide-query-title">
            <span className="guide-mini-eyebrow">Search Query Starter</span>
            <strong>Copy, test, and refine the generated queries</strong>
          </div>
          <div className="guide-query-grid">
            <div className="guide-query-card">
              <div className="guide-query-card-heading">
                <b>Boolean keyword query</b>
                <span>Copy</span>
              </div>
              <code>
                (&quot;wireless charging&quot; OR &quot;inductive power
                transfer&quot;) AND (coil OR coupler)
              </code>
            </div>
            <div className="guide-query-card">
              <div className="guide-query-card-heading">
                <b>Google Patents CPC query</b>
                <span>Copy</span>
              </div>
              <code>
                (CPC=H02J50/10 OR CPC=B60L53/12) AND (&quot;wireless
                charging&quot;)
              </code>
            </div>
          </div>
          <span className="guide-callout guide-callout-two">1</span>
          <span className="guide-callout guide-callout-five">2</span>
        </div>
      </BrowserFrame>
    );
  }

  return (
    <BrowserFrame>
      <div className="guide-pdf-layout" aria-hidden="true">
        <div className="guide-report-preview">
          <div className="guide-report-header">
            <span>Keyword &amp; Classification Mapping</span>
            <strong>Analysis Report</strong>
          </div>
          <div className="guide-report-line guide-report-line-wide" />
          <div className="guide-report-line" />
          <div className="guide-report-line guide-report-line-short" />
          <div className="guide-report-table">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="guide-download-panel">
          <div className="guide-pdf-icon">PDF</div>
          <strong>Analysis result ready</strong>
          <p>Review the report and retain it with the original input.</p>
          <div className="guide-primary-button">Download PDF</div>
        </div>
        <span className="guide-callout guide-callout-one">1</span>
        <span className="guide-callout guide-callout-three">2</span>
      </div>
    </BrowserFrame>
  );
}

export default function OperationGuide() {
  return (
    <article className="operation-guide">
      <header className="operation-guide-header">
        <p className="operation-guide-eyebrow">Illustrated quick-start guide</p>
        <h2 id="operation-guide-title">
          How to use keyword-classification-retrieval
        </h2>
        <p>
          Follow these steps to enter technical information, analyze it, review
          the classification output, and prepare patent-search queries.
        </p>
      </header>

      <nav
        className="operation-guide-navigation"
        aria-label="Operation guide sections"
      >
        <strong>Guide sections</strong>
        <ol>
          {guideSteps.map((step) => (
            <li key={step.id}>
              <a href={`#guide-${step.id}`}>{step.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="operation-guide-steps">
        {guideSteps.map((step) => (
          <section
            id={`guide-${step.id}`}
            className="operation-guide-step"
            key={step.id}
          >
            <div className="operation-guide-step-heading">
              <span className="operation-guide-step-number" aria-hidden="true">
                {step.number}
              </span>
              <div>
                <p className="operation-guide-step-label">Step {step.number}</p>
                <h3>{step.title}</h3>
              </div>
            </div>

            <p className="operation-guide-description">{step.description}</p>

            <figure className="operation-guide-figure">
              <GuideIllustration step={step.id} />
              <figcaption>
                Illustration {step.number}: {step.caption}
              </figcaption>
            </figure>

            {step.tips && (
              <aside className="operation-guide-tips">
                <h4>Recommended practice</h4>
                <ul>
                  {step.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </aside>
            )}

            {step.warning && (
              <aside className="operation-guide-warning">
                <strong>Important:</strong> {step.warning}
              </aside>
            )}

            <a className="operation-guide-back-link" href="#operation-guide-title">
              Back to guide sections
            </a>
          </section>
        ))}
      </div>

      <section className="operation-guide-review">
        <h3>Before using the output</h3>
        <p>
          The app provides AI-assisted search preparation. Review the technical
          meaning, classification relevance, keyword coverage, and database
          syntax before using the output for business, patent, legal, technical,
          or client-facing work.
        </p>
      </section>
    </article>
  );
}
