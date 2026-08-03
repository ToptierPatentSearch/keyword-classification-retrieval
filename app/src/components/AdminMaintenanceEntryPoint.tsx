import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Wrench } from "lucide-react";
import MaintenanceSettingsPage from "../pages/admin/MaintenanceSettingsPage";

export const ADMIN_MAINTENANCE_HASH = "#/admin/maintenance";

function useLocationHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return hash;
}

function useAdministrationMenuTarget(): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const updateTarget = () => {
      const nextTarget = document.getElementById("administration-menu");
      setTarget((currentTarget) =>
        currentTarget === nextTarget ? currentTarget : nextTarget,
      );
    };

    updateTarget();

    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return target;
}

function getBrowserTimeZoneLabel(): string {
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const date = new Date();
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffsetMinutes / 60)).padStart(
    2,
    "0",
  );
  const offsetRemainder = String(absoluteOffsetMinutes % 60).padStart(2, "0");
  const detectedAbbreviation = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const abbreviation =
    timeZone === "Asia/Tokyo" ? "JST" : detectedAbbreviation || timeZone;

  return `${timeZone} (${abbreviation}, UTC${sign}${offsetHours}:${offsetRemainder})`;
}

function useMaintenanceControlEnhancements(hash: string): void {
  useEffect(() => {
    if (hash !== ADMIN_MAINTENANCE_HASH) {
      return;
    }

    const timeZoneLabel = getBrowserTimeZoneLabel();
    const helperText = `Browser local time: ${timeZoneLabel}. Enter YYYY-MM-DDTHH:MM, for example 2026-08-03T15:30.`;

    const enhanceControls = () => {
      const restorationInput = document.querySelector<HTMLInputElement>(
        'input[type="datetime-local"], input[data-maintenance-restoration-time="true"]',
      );

      if (!restorationInput) {
        return;
      }

      if (
        restorationInput.dataset.maintenanceRestorationTime !== "true"
      ) {
        restorationInput.dataset.maintenanceRestorationTime = "true";
      }

      if (restorationInput.type !== "text") {
        restorationInput.type = "text";
      }

      if (restorationInput.placeholder !== "YYYY-MM-DDTHH:MM") {
        restorationInput.placeholder = "YYYY-MM-DDTHH:MM";
      }

      restorationInput.lang = "en";
      restorationInput.inputMode = "numeric";
      restorationInput.autocomplete = "off";
      restorationInput.pattern =
        "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}";
      restorationInput.title =
        `Expected restoration time in ${timeZoneLabel}. Use YYYY-MM-DDTHH:MM.`;
      restorationInput.setAttribute(
        "aria-label",
        `Expected restoration time in ${timeZoneLabel}. Use YYYY-MM-DDTHH:MM.`,
      );

      const helper =
        restorationInput.parentElement?.querySelector<HTMLElement>(".muted");

      if (helper && helper.textContent !== helperText) {
        helper.textContent = helperText;
      }
    };

    enhanceControls();

    const observer = new MutationObserver(enhanceControls);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => observer.disconnect();
  }, [hash]);
}

export default function AdminMaintenanceEntryPoint({
  children,
}: {
  children: ReactNode;
}) {
  const hash = useLocationHash();
  const administrationMenuTarget = useAdministrationMenuTarget();

  useMaintenanceControlEnhancements(hash);

  if (hash === ADMIN_MAINTENANCE_HASH) {
    return (
      <>
        <style>{`
          .app-shell label > input[type="checkbox"] {
            width: 1.1rem !important;
            height: 1.1rem;
            min-width: 1.1rem;
            flex: 0 0 1.1rem;
            margin: 0.2rem 0 0;
            padding: 0;
          }
        `}</style>
        <MaintenanceSettingsPage />
      </>
    );
  }

  return (
    <>
      <style>{`
        .app-header {
          position: relative;
          z-index: 100;
          overflow: visible;
        }

        .app-header .user-panel,
        .app-header .admin-menu {
          position: relative;
          z-index: 110;
          overflow: visible;
        }

        .app-header .admin-menu-popover {
          z-index: 120;
        }
      `}</style>
      {children}
      {administrationMenuTarget &&
        createPortal(
          <button
            type="button"
            className="admin-menu-item"
            onClick={() => {
              window.location.hash = ADMIN_MAINTENANCE_HASH;
            }}
          >
            <Wrench aria-hidden="true" />
            Maintenance
          </button>,
          administrationMenuTarget,
        )}
    </>
  );
}
