import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.44.4";

export interface MaintenanceStatus {
  maintenanceEnabled: boolean;
  title: string;
  message: string;
  expectedBackAt: string | null;
}

export type MaintenanceStatusResult =
  | { ok: true; status: MaintenanceStatus }
  | { ok: false; message: string };

const DEFAULT_STATUS: MaintenanceStatus = {
  maintenanceEnabled: false,
  title: "Scheduled Maintenance",
  message:
    "The patent analysis service is temporarily unavailable while maintenance is performed.",
  expectedBackAt: null,
};

export async function readMaintenanceStatus(
  adminClient: SupabaseClient,
): Promise<MaintenanceStatusResult> {
  const { data, error } = await adminClient
    .from("app_runtime_settings")
    .select(
      "maintenance_enabled, maintenance_title, maintenance_message, expected_back_at",
    )
    .eq("setting_key", "global")
    .maybeSingle();

  if (error) {
    console.error("Application runtime settings lookup failed:", error);

    return {
      ok: false,
      message:
        "Service availability could not be confirmed. Analysis remains unavailable and no credit was consumed.",
    };
  }

  if (!data) {
    return { ok: true, status: DEFAULT_STATUS };
  }

  if (typeof data.maintenance_enabled !== "boolean") {
    return {
      ok: false,
      message:
        "Service availability returned an invalid response. Analysis remains unavailable and no credit was consumed.",
    };
  }

  return {
    ok: true,
    status: {
      maintenanceEnabled: data.maintenance_enabled,
      title:
        typeof data.maintenance_title === "string" &&
        data.maintenance_title.trim()
          ? data.maintenance_title.trim()
          : DEFAULT_STATUS.title,
      message:
        typeof data.maintenance_message === "string" &&
        data.maintenance_message.trim()
          ? data.maintenance_message.trim()
          : DEFAULT_STATUS.message,
      expectedBackAt:
        typeof data.expected_back_at === "string"
          ? data.expected_back_at
          : null,
    },
  };
}
