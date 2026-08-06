import { useState } from "react";

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

export default function Footer() {
  const [activePage, setActivePage] = useState<FooterPageKey | null>(null);
  const activeTextPage =
    activePage && activePage !== "operation-guide"
      ? footerPages[activePage]
      : null;

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
            onClick={() => setActivePage("input-limitation")}
            aria-expanded={activePage === "input-limitation"}
          >
            Input Limitations
          </button>

          <span>|</span>

          <button
            type="button"
            onClick={() => setActivePage("operation-guide")}
            aria-expanded={activePage === "operation-guide"}
          >
            Operation Guide
          </button>

          <span>|</span>

          <button
            type="button"
            onClick={() => setActivePage("terms-of-use")}
            aria-expanded={activePage === "terms-of-use"}
          >
            Terms of Use
          </button>

          <span>|</span>

          <button
            type="button"
            onClick={() => setActivePage("privacy-policy")}
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
