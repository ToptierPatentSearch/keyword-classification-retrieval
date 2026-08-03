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

export default function AdminMaintenanceEntryPoint({
  children,
}: {
  children: ReactNode;
}) {
  const hash = useLocationHash();
  const administrationMenuTarget = useAdministrationMenuTarget();

  if (hash === ADMIN_MAINTENANCE_HASH) {
    return <MaintenanceSettingsPage />;
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
