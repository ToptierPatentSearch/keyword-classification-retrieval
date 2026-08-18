import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  LayoutGrid,
  LockKeyhole,
  Search,
  Sparkles,
} from "lucide-react";
import SearchQueryStarter from "./SearchQueryStarter";
import {
  ADAPTIVE_BEAMFORMING_DEMO,
  AI_IMAGE_RECOGNITION_DEMO,
  CARDIAC_MONITORING_DEMO,
  type DemoCase,
} from "./demoData";
import {
  clearDemoNavigationSource,
  getDemoNavigationSource,
} from "./demoNavigation";
import "./TryDemoPage.css";
import "./TryDemoNavigation.css";

type TryDemoPageProps = {
  demo: DemoCase;
  onBack: () => void;
  onContinue: () => void;
  continueLabel: string;
};

const WORKSPACE_DEMOS: ReadonlyArray<{
  demo: DemoCase;
  displayTitle: string;
}> = [
  {
    demo: AI_IMAGE_RECOGNITION_DEMO,
    displayTitle: "AI Image Recognition",
  },
  {
    demo: ADAPTIVE_BEAMFORMING_DEMO,
    displayTitle: "5G/6G Adaptive Beamforming",
  },
  {
    demo: CARDIAC_MONITORING_DEMO,
    displayTitle: "Wearable Cardiac Monitoring",
  },
];

export default function TryDemoPage({
  demo,
  onBack,
  onContinue,
  continueLabel,
}: TryDemoPageProps) {
  const [demoSource] = useState(getDemoNavigationSource);
  const [activeDemo, setActiveDemo] = useState(demo);
  const [isDemoSelectorOpen, setIsDemoSelectorOpen] = useState(false);
  const demoSelectorRef = useRef<HTMLDivElement>(null);
  const isWorkspaceDemo = demoSource === "workspace";

  useEffect(() => {
    setActiveDemo(demo);
  }, [demo]);

  useEffect(() => {
    if (!isDemoSelectorOpen) {
      return;
    }

    function closeSelectorOnOutsideClick(event: MouseEvent) {
      if (
        demoSelectorRef.current &&
        !demoSelectorRef.current.contains(event.target as Node)
      ) {
        setIsDemoSelectorOpen(false);
      }
    }

    function closeSelectorOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDemoSelectorOpen(false);
      }
    }

    document.addEventListener("mousedown", closeSelectorOnOutsideClick);
    document.addEventListener("keydown", closeSelectorOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeSelectorOnOutsideClick);
      document.removeEventListener("keydown", closeSelectorOnEscape);
    };
  }, [isDemoSelectorOpen]);

  function handleBackToExamples() {
    clearDemoNavigationSource();
    onBack();

    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>(".demo-showcase")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function handleContinueFromLanding() {
    clearDemoNavigationSource();
    onContinue();
  }

  function handleReturnToWorkspace() {
    clearDemoNavigationSource();
    onContinue();
  }

  function handleSelectWorkspaceDemo(nextDemo: DemoCase) {
    setIsDemoSelectorOpen(false);

    if (nextDemo.id === activeDemo.id) {
      return;
    }

    setActiveDemo(nextDemo);
    const nextUrl = `${window.location.pathname}${window.location.search}#/demo/${nextDemo.id}`;
    window.history.replaceState(window.history.state, document.title, nextUrl);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
        <button
          className="demo-back-button"
          type="button"
          onClick={
            isWorkspaceDemo ? handleReturnToWorkspace : handleBackToExamples
          }
        >
          <ArrowLeft aria-hidden="true" />
          {isWorkspaceDemo
            ? "Return to workspace"
            : "Back to example analyses"}
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
            using the preselected {activeDemo.title} concept.
          </p>
        </div>
        <aside className="demo-access-note">
          <LockKeyhole aria-hidden="true" />
          <span>
            <strong>
              {isWorkspaceDemo ? "Read-only demo" : "No sign-in required"}
            </strong>
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
              <h2>{activeDemo.title}</h2>
            </span>
          </div>
          <label htmlFor="demo-technical-text">Technical text</label>
          <textarea
            id="demo-technical-text"
            value={activeDemo.technicalExample}
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
            <h2>{activeDemo.conceptTitle}</h2>
            <p>{activeDemo.conceptDescription}</p>
            <div className="demo-facet-row">
              {activeDemo.facets.map((facet) => (
                <span key={facet}>{facet}</span>
              ))}
            </div>
          </article>

          <article className="demo-panel">
            <p className="demo-result-label">Keywords &amp; synonyms</p>
            <div className="demo-keyword-list">
              {activeDemo.keywords.map((keyword) => (
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
              {activeDemo.classifications.map((item) => (
                <div key={item.code} className="demo-classification">
                  <span>{item.system}</span>
                  <strong>{item.code}</strong>
                  <p>{item.title}</p>
                </div>
              ))}
            </div>
          </article>

          <SearchQueryStarter
            starter={activeDemo.queryStarter}
            className="demo-panel"
          />
        </div>
      </section>

      <nav className="demo-footer-nav" aria-label="Demo navigation">
        {isWorkspaceDemo ? (
          <div className="demo-selector-control" ref={demoSelectorRef}>
            <button
              className="demo-choose-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isDemoSelectorOpen}
              aria-controls="demo-selector-menu"
              onClick={() => setIsDemoSelectorOpen((isOpen) => !isOpen)}
            >
              <LayoutGrid aria-hidden="true" />
              Choose another demo
              <ChevronDown className="demo-choose-chevron" aria-hidden="true" />
            </button>

            <div
              id="demo-selector-menu"
              className="demo-selector-popover"
              role="menu"
              aria-label="Choose another guided product demo"
              hidden={!isDemoSelectorOpen}
            >
              <p className="demo-selector-heading">Guided product demos</p>
              {WORKSPACE_DEMOS.map(({ demo: demoOption, displayTitle }) => {
                const isCurrent = demoOption.id === activeDemo.id;

                return (
                  <button
                    key={demoOption.id}
                    type="button"
                    className={`demo-selector-item${
                      isCurrent ? " is-current" : ""
                    }`}
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    onClick={() => handleSelectWorkspaceDemo(demoOption)}
                  >
                    <span className="demo-selector-item-copy">
                      <strong>{displayTitle}</strong>
                      <small>{demoOption.field}</small>
                    </span>
                    {isCurrent ? (
                      <CheckCircle2 aria-hidden="true" />
                    ) : (
                      <ArrowRight aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <button
            className="demo-footer-back"
            type="button"
            onClick={handleBackToExamples}
          >
            <ArrowLeft aria-hidden="true" />
            Back to example analyses
          </button>
        )}

        <button
          className="demo-primary-button"
          type="button"
          onClick={
            isWorkspaceDemo
              ? handleReturnToWorkspace
              : handleContinueFromLanding
          }
        >
          {isWorkspaceDemo ? "Return to analysis workspace" : continueLabel}
          <ArrowRight aria-hidden="true" />
        </button>
      </nav>
    </main>
  );
}
