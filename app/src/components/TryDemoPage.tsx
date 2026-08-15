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
import type { DemoCase } from "./demoData"; 
import "./TryDemoPage.css";


type TryDemoPageProps = {
  demo: DemoCase;
  onBack: () => void;
  onContinue: () => void;
  continueLabel: string;
};

export default function TryDemoPage({
  demo,
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
            This read-only example previews the app&apos;s patent-search workflow
            using the preselected {demo.title} concept.
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
              <h2>{demo.title}</h2>
            </span>
          </div>
          <label htmlFor="demo-technical-text">Technical text</label>
          <textarea
            id="demo-technical-text"
            value={demo.technicalExample}
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
            <h2>{demo.conceptTitle}</h2>
            <p>{demo.conceptDescription}</p>
            <div className="demo-facet-row">
              {demo.facets.map((facet) => (
                <span key={facet}>{facet}</span>
              ))}
            </div>
          </article>

          <article className="demo-panel">
            <p className="demo-result-label">Keywords &amp; synonyms</p>
            <div className="demo-keyword-list">
              {demo.keywords.map((keyword) => (
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
              {demo.classifications.map((item) => (
                <div key={item.code} className="demo-classification">
                  <span>{item.system}</span>
                  <strong>{item.code}</strong>
                  <p>{item.title}</p>
                </div>
              ))}
            </div>
          </article>

          <SearchQueryStarter
            starter={demo.queryStarter}
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
