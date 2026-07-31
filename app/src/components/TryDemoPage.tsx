import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  LockKeyhole,
  Search,
  Sparkles,
} from "lucide-react";
import SearchQueryStarter from "./SearchQueryStarter";
import type { GeneratedSearchQueryStarter } from "../searchQuery";
import "./TryDemoPage.css";

const DEMO_TECHNICAL_EXAMPLE = `An electric-vehicle wireless charging system includes a ground-side power-transmitting coil, a vehicle-side power-receiving coil, and a camera that detects alignment markers around the charging pad. A controller estimates lateral and angular misalignment from the camera images and adjusts the vehicle parking position before energizing the transmitting coil. During power transfer, the controller monitors coupling efficiency and coil temperature, then changes the inverter frequency and transmitted power to maintain charging efficiency while preventing overheating.`;

const DEMO_KEYWORDS = [
  {
    term: "electric-vehicle wireless charging",
    synonyms: "contactless EV charging · inductive vehicle charging",
  },
  {
    term: "coil alignment control",
    synonyms: "charging-pad positioning · coil misalignment correction",
  },
  {
    term: "coupling-efficiency optimization",
    synonyms: "power-transfer efficiency control · resonant coupling adjustment",
  },
  {
    term: "coil temperature protection",
    synonyms: "thermal monitoring · overheating prevention",
  },
];

const DEMO_CLASSIFICATIONS = [
  {
    system: "IPC / CPC",
    code: "B60L 53/12",
    title: "Inductive energy transfer for electrically propelled vehicles",
  },
  {
    system: "IPC / CPC",
    code: "B60L 53/38",
    title: "Automatic or assisted alignment of charging devices and vehicles",
  },
  {
    system: "IPC / CPC",
    code: "H02J 50/10",
    title: "Circuit arrangements for inductive wireless power transfer",
  },
];

const DEMO_QUERY_STARTER: GeneratedSearchQueryStarter = {
  keywordQuery:
    '("wireless EV charging" OR "inductive vehicle charging") AND ("coil alignment" OR "coil misalignment correction") AND ("coupling-efficiency optimization" OR "coil temperature protection")',
  classificationQuery:
    "IPC=(B60L 53/12 OR H02J 50/10) OR CPC=(B60L 53/38)",
  reviewStatus: "demo",
  reviewSummary:
    "This demonstration query was pre-reviewed for technical relevance, Boolean structure, and use of the displayed classification codes.",
};

type TryDemoPageProps = {
  onBack: () => void;
  onContinue: () => void;
  continueLabel: string;
};

export default function TryDemoPage({
  onBack,
  onContinue,
  continueLabel,
}: TryDemoPageProps) {
  return (
    <main className="demo-page">
      <header className="demo-header">
        <div className="demo-brand" aria-label="Top-tier Patent Search">
          <span className="demo-brand-mark" aria-hidden="true">
            <Search />
          </span>
          <span>
            <strong>Top-tier Patent Search</strong>
            <small>Keyword &amp; Classification Mapping</small>
          </span>
        </div>
        <button className="demo-back-button" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back to overview
        </button>
      </header>

      <section className="demo-hero" aria-labelledby="demo-title">
        <div>
          <p className="demo-eyebrow">
            <Sparkles aria-hidden="true" />
            Guided product demo
          </p>
          <h1 id="demo-title">
            See technical text become <span>search-ready insight</span>
          </h1>
          <p>
            This read-only example previews the app’s patent-search workflow
            using a preselected electric-vehicle wireless-charging concept.
          </p>
        </div>
        <aside className="demo-access-note">
          <LockKeyhole aria-hidden="true" />
          <span>
            <strong>No sign-in required</strong>
            <small>No analysis credit is used</small>
          </span>
        </aside>
      </section>

      <ol className="demo-workflow" aria-label="Demonstration workflow">
        <li className="is-complete">
          <span>1</span>
          Input
        </li>
        <li className="is-complete">
          <span>2</span>
          Technical concept
        </li>
        <li className="is-complete">
          <span>3</span>
          Keywords &amp; synonyms
        </li>
        <li className="is-complete">
          <span>4</span>
          Classification mapping
        </li>
        <li className="is-complete">
          <span>5</span>
          Search preparation
        </li>
      </ol>

      <section className="demo-layout">
        <article className="demo-panel demo-input-panel">
          <div className="demo-section-heading">
            <span className="demo-section-icon" aria-hidden="true">
              <FileSearch />
            </span>
            <span>
              <small>Preselected technical example</small>
              <h2>EV wireless charging</h2>
            </span>
          </div>
          <label htmlFor="demo-technical-text">Technical text</label>
          <textarea
            id="demo-technical-text"
            value={DEMO_TECHNICAL_EXAMPLE}
            readOnly
            aria-readonly="true"
          />
          <p className="demo-readonly-note">
            This sample is loaded automatically and cannot be edited in demo
            mode.
          </p>
        </article>

        <div className="demo-results">
          <article className="demo-panel demo-concept-panel">
            <p className="demo-result-label">Common technical concept</p>
            <h2>Adaptive alignment and safe power-transfer control</h2>
            <p>
              A wireless EV charging system uses image-based coil positioning,
              efficiency feedback, and temperature monitoring to establish and
              maintain efficient inductive power transfer.
            </p>
            <div className="demo-facet-row">
              <span>Object/system</span>
              <span>Component relationships</span>
              <span>Control means</span>
              <span>Technical effect</span>
            </div>
          </article>

          <article className="demo-panel">
            <p className="demo-result-label">Keywords &amp; synonyms</p>
            <div className="demo-keyword-list">
              {DEMO_KEYWORDS.map((keyword) => (
                <div key={keyword.term} className="demo-keyword">
                  <CheckCircle2 aria-hidden="true" />
                  <span>
                    <strong>{keyword.term}</strong>
                    <small>{keyword.synonyms}</small>
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="demo-panel">
            <p className="demo-result-label">
              Representative classification mapping
            </p>
            <div className="demo-classification-list">
              {DEMO_CLASSIFICATIONS.map((item) => (
                <div key={item.code} className="demo-classification">
                  <span>{item.system}</span>
                  <strong>{item.code}</strong>
                  <p>{item.title}</p>
                </div>
              ))}
            </div>
          </article>

          <SearchQueryStarter
            starter={DEMO_QUERY_STARTER}
            className="demo-panel"
          />
        </div>
      </section>

      <section className="demo-footer-cta">
        <div>
          <p className="demo-result-label">Ready to analyze your own text?</p>
          <h2>Continue to the secure analysis workspace.</h2>
          <p>
            Actual analysis supports English or Japanese input and may produce
            different terms and classifications depending on the technical
            disclosure.
          </p>
        </div>
        <button className="demo-primary-button" type="button" onClick={onContinue}>
          {continueLabel}
          <ArrowRight aria-hidden="true" />
        </button>
      </section>
    </main>
  );
}
