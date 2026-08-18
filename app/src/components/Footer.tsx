import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Play } from "lucide-react";

import "./FooterDemoMenu.css";
import inputLimitationText from "./input-limitation.txt?raw";
import OperationGuide from "./OperationGuide";
import privacyPolicyText from "./privacy-policy.txt?raw";
import termsOfUseText from "./terms-of-use.txt?raw";

type FooterPageKey =
  | "input-limitation"
  | "operation-guide"
  | "terms-of-use"
  | "privacy-policy";

type TextFooterPageKey = Exclude<FooterPageKey, "operation-guide">;

type FooterDemoId =
  | "ai-image-recognition"
  | "adaptive-beamforming"
  | "cardiac-monitoring";

const footerPages: Record<
  TextFooterPageKey,
  {
    title: string;
    body: string;
  }
> = {
  "input-limitation": {
    title: "Input Limitations",
    body: inputLimitationText,
  },
  "terms-of-use": {
    title: "Terms of Use",
    body: termsOfUseText,
  },
  "privacy-policy": {
    title: "Privacy Policy",
    body: privacyPolicyText,
  },
};

const footerDemos: ReadonlyArray<{
  id: FooterDemoId;
  title: string;
}> = [
  {
    id: "ai-image-recognition",
    title: "AI Image Recognition",
  },
  {
    id: "adaptive-beamforming",
    title: "5G/6G Adaptive Beamforming",
  },
  {
    id: "cardiac-monitoring",
    title: "Wearable Cardiac Monitoring",
  },
];

export default function Footer() {
  const [activePage, setActivePage] = useState<FooterPageKey | null>(null);
  const [isDemoMenuOpen, setIsDemoMenuOpen] = useState(false);
  const demoMenuRef = useRef<HTMLSpanElement>(null);
  const activeTextPage =
    activePage && activePage !== "operation-guide"
      ? footerPages[activePage]
      : null;

  useEffect(() => {
    if (!isDemoMenuOpen) {
      return;
    }

    function closeDemoMenuOnOutsideClick(event: MouseEvent) {
      if (
        demoMenuRef.current &&
        !demoMenuRef.current.contains(event.target as Node)
      ) {
        setIsDemoMenuOpen(false);
      }
    }

    function closeDemoMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDemoMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeDemoMenuOnOutsideClick);
    document.addEventListener("keydown", closeDemoMenuOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeDemoMenuOnOutsideClick);
      document.removeEventListener("keydown", closeDemoMenuOnEscape);
    };
  }, [isDemoMenuOpen]);

  function openFooterPage(page: FooterPageKey) {
    setIsDemoMenuOpen(false);
    setActivePage(page);
  }

  function openDemo(demoId: FooterDemoId) {
    setIsDemoMenuOpen(false);
    setActivePage(null);
    window.location.hash = `#/demo/${demoId}`;
  }

  return (
    <>
      {activePage && (
        <section
          className={`footer-page-panel ${
            activePage === "operation-guide"
              ? "footer-page-panel--operation-guide"
              : ""
          }`}
          aria-labelledby={
            activePage === "operation-guide"
              ? "operation-guide-title"
              : "footer-page-title"
          }
        >
          <button
            type="button"
            className="footer-page-close"
            onClick={() => setActivePage(null)}
            aria-label={`Close ${
              activePage === "operation-guide"
                ? "Operation Guide"
                : activeTextPage?.title ?? "footer information"
            }`}
          >
            Close
          </button>

          {activePage === "operation-guide" ? (
            <OperationGuide />
          ) : activeTextPage ? (
            <>
              <h2 id="footer-page-title">{activeTextPage.title}</h2>
              <pre className="footer-page-text">{activeTextPage.body}</pre>
            </>
          ) : null}
        </section>
      )}

      <footer className="app-footer">
        <div className="app-footer-links">
          <button
            type="button"
            onClick={() => openFooterPage("input-limitation")}
            aria-expanded={activePage === "input-limitation"}
          >
            Input Limitations
          </button>

          <span>|</span>

          <button
            type="button"
            onClick={() => openFooterPage("operation-guide")}
            aria-expanded={activePage === "operation-guide"}
          >
            Operation Guide
          </button>

          <span>|</span>

          <span className="footer-demo-menu" ref={demoMenuRef}>
            <button
              type="button"
              className="footer-demo-trigger"
              aria-haspopup="menu"
              aria-expanded={isDemoMenuOpen}
              aria-controls="footer-demo-menu"
              onClick={() => {
                setActivePage(null);
                setIsDemoMenuOpen((isOpen) => !isOpen);
              }}
            >
              <Play aria-hidden="true" />
              Demos
              <ChevronDown
                className="footer-demo-chevron"
                aria-hidden="true"
              />
            </button>

            <div
              id="footer-demo-menu"
              className="footer-demo-popover"
              role="menu"
              aria-label="Guided product demos"
              hidden={!isDemoMenuOpen}
            >
              <p className="footer-demo-popover-title">Guided product demos</p>
              {footerDemos.map((demo) => (
                <button
                  key={demo.id}
                  type="button"
                  className="footer-demo-item"
                  role="menuitem"
                  onClick={() => openDemo(demo.id)}
                >
                  <span>{demo.title}</span>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
          </span>

          <span>|</span>

          <button
            type="button"
            onClick={() => openFooterPage("terms-of-use")}
            aria-expanded={activePage === "terms-of-use"}
          >
            Terms of Use
          </button>

          <span>|</span>

          <button
            type="button"
            onClick={() => openFooterPage("privacy-policy")}
            aria-expanded={activePage === "privacy-policy"}
          >
            Privacy Policy
          </button>
        </div>

        <p className="app-footer-note">
          keyword-classification-retrieval is an AI-assisted tool for supporting
          patent keyword classification and retrieval. Results should be
          reviewed before business, legal, or technical use.
        </p>

        <p className="app-footer-copyright">
          © 2026 Top-tier Patent Search. All rights reserved.
        </p>
      </footer>
    </>
  );
}
