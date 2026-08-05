import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Clock3, LogIn, RefreshCw, Search, Wrench } from "lucide-react";
import { supabase } from "../supabaseClient";
import { ADMIN_MAINTENANCE_HASH } from "./AdminMaintenanceEntryPoint";
import { formatLocalAndUtcTimestamp } from "../lib/time";

type RuntimeSettings = {
  maintenance_enabled: boolean;
  maintenance_title: string;
  maintenance_message: string;
  expected_back_at: string | null;
};

type RuntimeStatus =
  | { state: "loading" }
  | { state: "available" }
  | { state: "maintenance"; settings: RuntimeSettings }
  | { state: "unavailable"; message: string };

const DEFAULT_SETTINGS: RuntimeSettings = {
  maintenance_enabled: false,
  maintenance_title: "Scheduled Maintenance",
  maintenance_message:
    "The patent analysis service is temporarily unavailable while maintenance is performed.",
  expected_back_at: null,
};

const STATUS_REFRESH_INTERVAL_MS = 60_000;

function formatExpectedBackAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const formatted = formatLocalAndUtcTimestamp(value, { invalidValue: "" });
  return formatted || null;
}

function StatusShell({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
        background:
          "radial-gradient(circle at top, rgba(219, 234, 254, 0.9), rgba(248, 250, 252, 0.96) 42%, #f8fafc 100%)",
      }}
    >
      <section
        style={{
          width: "min(100%, 44rem)",
          padding: "clamp(1.5rem, 5vw, 3rem)",
          border: "1px solid #cbd5e1",
          borderRadius: "1.25rem",
          background: "rgba(255, 255, 255, 0.96)",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
          textAlign: "center",
        }}
      >
        {children}
      </section>
    </main>
  );
}

function Brand() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.8rem",
        marginBottom: "2rem",
      }}
      aria-label="Top-tier Patent Search"
    >
      <span
        style={{
          width: "2.8rem",
          height: "2.8rem",
          display: "grid",
          placeItems: "center",
          borderRadius: "0.8rem",
          background: "#0f172a",
          color: "#ffffff",
        }}
        aria-hidden="true"
      >
        <Search size={21} />
      </span>
      <span style={{ display: "grid", gap: "0.1rem", textAlign: "left" }}>
        <strong style={{ color: "#0f172a", fontSize: "1rem" }}>
          Top-tier Patent Search
        </strong>
        <span style={{ color: "#64748b", fontSize: "0.78rem" }}>
          Patent Search Intelligence
        </span>
      </span>
    </div>
  );
}

function LoadingPage() {
  return (
    <StatusShell>
      <Brand />
      <p style={{ margin: 0, color: "#475569" }}>
        Checking service availability…
      </p>
    </StatusShell>
  );
}

function MaintenancePage({
  settings,
  onAdministratorAccess,
  showAdministratorAccess,
}: {
  settings: RuntimeSettings;
  onAdministratorAccess: () => void;
  showAdministratorAccess: boolean;
}) {
  const expectedBackAt = formatExpectedBackAt(settings.expected_back_at);

  return (
    <StatusShell>
      <Brand />
      <span
        style={{
          width: "4.5rem",
          height: "4.5rem",
          margin: "0 auto 1.25rem",
          display: "grid",
          placeItems: "center",
          borderRadius: "999px",
          background: "#fff7ed",
          color: "#c2410c",
        }}
        aria-hidden="true"
      >
        <Wrench size={31} />
      </span>
      <p
        style={{
          margin: "0 0 0.65rem",
          color: "#9a3412",
          fontSize: "0.76rem",
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Service announcement
      </p>
      <h1
        style={{
          margin: 0,
          color: "#0f172a",
          fontSize: "clamp(1.8rem, 5vw, 2.7rem)",
          lineHeight: 1.15,
        }}
      >
        {settings.maintenance_title}
      </h1>
      <p
        style={{
          maxWidth: "35rem",
          margin: "1.1rem auto 0",
          color: "#334155",
          fontSize: "1.05rem",
          lineHeight: 1.7,
        }}
      >
        {settings.maintenance_message}
      </p>
      {expectedBackAt && (
        <div
          style={{
            maxWidth: "31rem",
            margin: "1.5rem auto 0",
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            border: "1px solid #fed7aa",
            borderRadius: "0.9rem",
            background: "#fff7ed",
            color: "#9a3412",
            textAlign: "left",
          }}
        >
          <Clock3 size={22} aria-hidden="true" />
          <span>
            <strong>Expected service restoration</strong>
            <br />
            {expectedBackAt}
          </span>
        </div>
      )}
      <p
        style={{
          maxWidth: "34rem",
          margin: "1.5rem auto 0",
          color: "#64748b",
          fontSize: "0.9rem",
          lineHeight: 1.6,
        }}
      >
        Analysis requests are blocked at the server while maintenance mode is
        active, so no analysis credit will be consumed.
      </p>
      {showAdministratorAccess && (
        <button
          type="button"
          onClick={onAdministratorAccess}
          style={{
            marginTop: "1.4rem",
            padding: "0.7rem 0.9rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            border: "1px solid #cbd5e1",
            borderRadius: "0.75rem",
            background: "#ffffff",
            color: "#334155",
            font: "inherit",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <LogIn size={17} aria-hidden="true" />
          Administrator access
        </button>
      )}
    </StatusShell>
  );
}

function StatusUnavailablePage({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <StatusShell>
      <Brand />
      <span
        style={{
          width: "4.5rem",
          height: "4.5rem",
          margin: "0 auto 1.25rem",
          display: "grid",
          placeItems: "center",
          borderRadius: "999px",
          background: "#fef2f2",
          color: "#b91c1c",
        }}
        aria-hidden="true"
      >
        <Wrench size={31} />
      </span>
      <h1 style={{ margin: 0, color: "#0f172a", fontSize: "2rem" }}>
        Service Temporarily Unavailable
      </h1>
      <p
        role="alert"
        style={{
          maxWidth: "34rem",
          margin: "1rem auto 0",
          color: "#475569",
          lineHeight: 1.65,
        }}
      >
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: "1.4rem",
          padding: "0.75rem 1rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          border: 0,
          borderRadius: "0.75rem",
          background: "#0f172a",
          color: "#ffffff",
          font: "inherit",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <RefreshCw size={17} aria-hidden="true" />
        Check again
      </button>
    </StatusShell>
  );
}

export default function RuntimeMaintenanceGate({
  children,
}: {
  children: ReactNode;
}) {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({
    state: "loading",
  });
  const [hasAdministratorAccess, setHasAdministratorAccess] = useState(false);
  const [locationHash, setLocationHash] = useState(() => window.location.hash);

  const loadRuntimeStatus = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_runtime_settings")
      .select(
        "maintenance_enabled, maintenance_title, maintenance_message, expected_back_at",
      )
      .eq("setting_key", "global")
      .maybeSingle();

    if (error) {
      console.error("Failed to load application runtime settings:", error);
      setRuntimeStatus({
        state: "unavailable",
        message:
          "The application could not confirm its operating status. Analysis remains unavailable to prevent accidental processing during an unknown service state.",
      });
      return;
    }

    const settings: RuntimeSettings = data
      ? {
          maintenance_enabled: data.maintenance_enabled === true,
          maintenance_title:
            typeof data.maintenance_title === "string" &&
            data.maintenance_title.trim()
              ? data.maintenance_title.trim()
              : DEFAULT_SETTINGS.maintenance_title,
          maintenance_message:
            typeof data.maintenance_message === "string" &&
            data.maintenance_message.trim()
              ? data.maintenance_message.trim()
              : DEFAULT_SETTINGS.maintenance_message,
          expected_back_at:
            typeof data.expected_back_at === "string"
              ? data.expected_back_at
              : null,
        }
      : DEFAULT_SETTINGS;

    setRuntimeStatus(
      settings.maintenance_enabled
        ? { state: "maintenance", settings }
        : { state: "available" },
    );
  }, []);

  useEffect(() => {
    void loadRuntimeStatus();

    const intervalId = window.setInterval(() => {
      void loadRuntimeStatus();
    }, STATUS_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadRuntimeStatus();
      }
    };
    const handleRuntimeSettingsChanged = () => {
      void loadRuntimeStatus();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(
      "runtime-settings-changed",
      handleRuntimeSettingsChanged,
    );

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(
        "runtime-settings-changed",
        handleRuntimeSettingsChanged,
      );
    };
  }, [loadRuntimeStatus]);

  useEffect(() => {
    let cancelled = false;
    let checkVersion = 0;

    async function checkAdministratorAccess(
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"],
    ) {
      const currentCheckVersion = ++checkVersion;
      setHasAdministratorAccess(false);

      if (!session) {
        return;
      }

      const { error: adminAccessError } = await supabase
        .rpc("get_admin_user_activity")
        .limit(1);

      if (!cancelled && currentCheckVersion === checkVersion) {
        setHasAdministratorAccess(!adminAccessError);
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        void checkAdministratorAccess(data.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void checkAdministratorAccess(session);
    });

    return () => {
      cancelled = true;
      checkVersion += 1;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleHashChange = () => setLocationHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (locationHash === ADMIN_MAINTENANCE_HASH) {
    return <>{children}</>;
  }

  if (runtimeStatus.state === "loading") {
    return <LoadingPage />;
  }

  if (runtimeStatus.state === "maintenance") {
    return (
      <MaintenancePage
        settings={runtimeStatus.settings}
        showAdministratorAccess={hasAdministratorAccess}
        onAdministratorAccess={() => {
          window.location.hash = ADMIN_MAINTENANCE_HASH;
        }}
      />
    );
  }

  if (runtimeStatus.state === "unavailable") {
    return (
      <StatusUnavailablePage
        message={runtimeStatus.message}
        onRetry={() => {
          setRuntimeStatus({ state: "loading" });
          void loadRuntimeStatus();
        }}
      />
    );
  }

  return <>{children}</>;
}
