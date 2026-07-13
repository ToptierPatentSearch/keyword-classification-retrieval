import { useState } from "react";

import inputLimitationText from "./input-limitation.txt?raw";
import operationGuideText from "./operation-guide.txt?raw";
import privacyPolicyText from "./privacy-policy.txt?raw";
import termsOfUseText from "./terms-of-use.txt?raw";

type FooterPageKey =
  | "input-limitation"
  | "operation-guide"
  | "terms-of-use"
  | "privacy-policy";

const footerPages: Record<
  FooterPageKey,
  {
    title: string;
    body: string;
  }
> = {
  "input-limitation": {
    title: "Input Limitations",
    body: inputLimitationText,
  },
  "operation-guide": {
    title: "Operation Guide",
    body: operationGuideText,
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

  return (
    <>
      {activePage && (
        <section className="footer-page-panel">
          <button
            type="button"
            className="footer-page-close"
            onClick={() => setActivePage(null)}
          >
            Close
          </button>

          <h2>{footerPages[activePage].title}</h2>

          <pre className="footer-page-text">
            {footerPages[activePage].body}
          </pre>
        </section>
      )}

      <footer className="app-footer">
        <div className="app-footer-links">
          <button
            type="button"
            onClick={() => setActivePage("input-limitation")}
          >
            Input Limitations
          </button>

          <span>|</span>

          <button
            type="button"
            onClick={() => setActivePage("operation-guide")}
          >
            Operation Guide
          </button>

          <span>|</span>

          <button type="button" onClick={() => setActivePage("terms-of-use")}>
            Terms of Use
          </button>

          <span>|</span>

          <button
            type="button"
            onClick={() => setActivePage("privacy-policy")}
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