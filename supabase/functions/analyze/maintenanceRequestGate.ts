type ServeHandler = (
  request: Request,
  info: Deno.ServeHandlerInfo,
) => Response | Promise<Response>;

type RuntimeSettingRow = {
  maintenance_enabled?: unknown;
  maintenance_title?: unknown;
  maintenance_message?: unknown;
  expected_back_at?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function serviceUnavailableResponse(
  message: string,
  details: {
    code?: string;
    title?: string;
    expectedBackAt?: string | null;
  } = {},
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      code: details.code ?? "SERVICE_STATUS_UNAVAILABLE",
      ...(details.title ? { title: details.title } : {}),
      ...(details.expectedBackAt
        ? { expectedBackAt: details.expectedBackAt }
        : {}),
    }),
    {
      status: 503,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": "300",
      },
    },
  );
}

async function checkMaintenanceMode(
  request: Request,
): Promise<Response | null> {
  if (request.method !== "POST") {
    return null;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return serviceUnavailableResponse(
      "Service availability could not be confirmed. Analysis remains unavailable and no credit was consumed.",
    );
  }

  const settingsUrl = new URL(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/app_runtime_settings`,
  );
  settingsUrl.searchParams.set(
    "select",
    "maintenance_enabled,maintenance_title,maintenance_message,expected_back_at",
  );
  settingsUrl.searchParams.set("setting_key", "eq.global");
  settingsUrl.searchParams.set("limit", "1");

  let response: Response;

  try {
    response = await fetch(settingsUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
  } catch (error) {
    console.error("Application runtime settings request failed:", error);

    return serviceUnavailableResponse(
      "Service availability could not be confirmed. Analysis remains unavailable and no credit was consumed.",
    );
  }

  if (!response.ok) {
    console.error(
      `Application runtime settings request returned HTTP ${response.status}.`,
    );

    return serviceUnavailableResponse(
      "Service availability could not be confirmed. Analysis remains unavailable and no credit was consumed.",
    );
  }

  let rows: RuntimeSettingRow[];

  try {
    rows = (await response.json()) as RuntimeSettingRow[];
  } catch (error) {
    console.error("Application runtime settings response was invalid:", error);

    return serviceUnavailableResponse(
      "Service availability returned an invalid response. Analysis remains unavailable and no credit was consumed.",
    );
  }

  const settings = Array.isArray(rows) ? rows[0] : undefined;

  if (!settings || typeof settings.maintenance_enabled !== "boolean") {
    return serviceUnavailableResponse(
      "Service availability returned an invalid response. Analysis remains unavailable and no credit was consumed.",
    );
  }

  if (!settings.maintenance_enabled) {
    return null;
  }

  const title =
    typeof settings.maintenance_title === "string" &&
    settings.maintenance_title.trim()
      ? settings.maintenance_title.trim()
      : "Scheduled Maintenance";
  const message =
    typeof settings.maintenance_message === "string" &&
    settings.maintenance_message.trim()
      ? settings.maintenance_message.trim()
      : "The patent analysis service is temporarily unavailable while maintenance is performed.";
  const expectedBackAt =
    typeof settings.expected_back_at === "string"
      ? settings.expected_back_at
      : null;

  console.warn(
    JSON.stringify({
      event: "analysis_audit",
      outcome: "rejected",
      stage: "maintenance_check",
      status_code: 503,
      error_message: message,
      occurred_at: new Date().toISOString(),
    }),
  );

  return serviceUnavailableResponse(message, {
    code: "MAINTENANCE_MODE",
    title,
    expectedBackAt,
  });
}

const originalServe = Deno.serve.bind(Deno) as unknown as (
  ...args: unknown[]
) => unknown;

const maintenanceAwareServe = ((...args: unknown[]) => {
  const handlerIndex = typeof args[0] === "function" ? 0 : 1;
  const handler = args[handlerIndex];

  if (typeof handler !== "function") {
    return originalServe(...args);
  }

  const wrappedHandler: ServeHandler = async (request, info) => {
    const maintenanceResponse = await checkMaintenanceMode(request);

    if (maintenanceResponse) {
      return maintenanceResponse;
    }

    return await (handler as ServeHandler)(request, info);
  };
  const wrappedArgs = [...args];
  wrappedArgs[handlerIndex] = wrappedHandler;

  return originalServe(...wrappedArgs);
}) as typeof Deno.serve;

Object.defineProperty(Deno, "serve", {
  configurable: true,
  writable: true,
  value: maintenanceAwareServe,
});
