from pathlib import Path
import re

WORKFLOW_PATH = Path(".github/workflows/apply-local-utc-time.yml")
SCRIPT_PATH = Path(".github/apply-local-utc-time.py")


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def add_import(text: str, anchor: str, import_line: str) -> str:
    if import_line in text:
        return text
    if anchor not in text:
        raise SystemExit(f"Import anchor not found: {anchor}")
    return text.replace(anchor, f"{anchor}\n{import_line}", 1)


def replace_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Expected one replacement for {label}, found {count}")
    return updated


app_path = "app/src/App.tsx"
text = read(app_path)
text = add_import(
    text,
    'import { buildSearchQueryStarter } from "./searchQuery";',
    'import { formatLocalAndUtcTimestamp } from "./lib/time";',
)
text = replace_once(
    text,
    r'function getTimeZoneOffsetMinutes\(date: Date, timeZone: string\): number \| null \{.*?\n\}\n\nfunction getLocalTimeZoneAbbreviation\(date: Date, timeZone: string\): string \{.*?\n\}\n\nfunction formatLocalExpirationDate\(isoString: string \| null\): string \{.*?\n\}\n\n(?=export default function App)',
    '''function formatLocalExpirationDate(isoString: string | null): string {
  return formatLocalAndUtcTimestamp(isoString, { invalidValue: "-" });
}

''',
    "App expiration formatter",
)
write(app_path, text)

consent_path = "app/src/pages/admin/UserConsentsPage.tsx"
text = read(consent_path)
text = add_import(
    text,
    'import { supabase } from "../../supabaseClient";',
    'import { formatLocalAndUtcTimestamp } from "../../lib/time";',
)
text = replace_once(
    text,
    r'function formatTimestamp\(value: string \| null\): string \{.*?\n\}\n\n(?=export default function UserConsentsPage)',
    '''function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  return formatLocalAndUtcTimestamp(value, {
    seconds: true,
    invalidValue: value,
  });
}

''',
    "consent timestamp formatter",
)
write(consent_path, text)

activity_path = "app/src/pages/admin/UserActivityPage.tsx"
text = read(activity_path)
text = add_import(
    text,
    'import { supabase } from "../../supabaseClient";',
    'import { formatLocalAndUtcTimestamp } from "../../lib/time";',
)
text = replace_once(
    text,
    r'    if \(looksLikeTimestamp\) \{.*?\n    \}\n\n    return value;',
    '''    if (looksLikeTimestamp) {
      return formatLocalAndUtcTimestamp(value, { invalidValue: value });
    }

    return value;''',
    "activity timestamp formatter",
)
write(activity_path, text)

purchases_path = "app/src/pages/admin/UserPackagePurchasesPage.tsx"
text = read(purchases_path)
text = add_import(
    text,
    'import { supabase } from "../../supabaseClient";',
    'import { formatLocalAndUtcTimestamp } from "../../lib/time";',
)
text = replace_once(
    text,
    r'function formatTimestamp\(value: string\): string \{.*?\n\}\n\n(?=function normalizeCount)',
    '''function formatTimestamp(value: string): string {
  return formatLocalAndUtcTimestamp(value, { invalidValue: value });
}

''',
    "purchase timestamp formatter",
)
write(purchases_path, text)

errors_path = "app/src/pages/admin/ErrorLogsPage.tsx"
text = read(errors_path)
text = add_import(
    text,
    'import { supabase } from "../../supabaseClient";',
    'import { formatLocalAndUtcTimestamp } from "../../lib/time";',
)
text = replace_once(
    text,
    r'function formatDateTime\(value: string \| null\): string \{.*?\n\}\n\n(?=function normalizeSearchValue)',
    '''function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return formatLocalAndUtcTimestamp(value, {
    seconds: true,
    invalidValue: value,
  });
}

''',
    "error timestamp formatter",
)
write(errors_path, text)

gate_path = "app/src/components/RuntimeMaintenanceGate.tsx"
text = read(gate_path)
text = add_import(
    text,
    'import { ADMIN_MAINTENANCE_HASH } from "./AdminMaintenanceEntryPoint";',
    'import { formatLocalAndUtcTimestamp } from "../lib/time";',
)
text = replace_once(
    text,
    r'function formatExpectedBackAt\(value: string \| null\): string \| null \{.*?\n\}\n\n(?=function StatusShell)',
    '''function formatExpectedBackAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const formatted = formatLocalAndUtcTimestamp(value, { invalidValue: "" });
  return formatted || null;
}

''',
    "maintenance gate timestamp formatter",
)
write(gate_path, text)

maintenance_path = "app/src/pages/admin/MaintenanceSettingsPage.tsx"
text = read(maintenance_path)
text = add_import(
    text,
    'import { supabase } from "../../supabaseClient";',
    'import {\n  formatLocalAndUtcTimestamp,\n  getLocalTimeZoneDescription,\n} from "../../lib/time";',
)
text = replace_once(
    text,
    r'function getBrowserTimeZoneLabel\(date = new Date\(\)\): string \{.*?\n\}\n\n(?=function toLocalDateTimeText)',
    "",
    "browser timezone label helper",
)
text = replace_once(
    text,
    r'function formatTimestamp\(value: string \| null\): string \{.*?\n\}\n\n(?=function settingsToDraft)',
    '''function formatTimestamp(value: string | null): string {
  return formatLocalAndUtcTimestamp(value, { invalidValue: "Not recorded" });
}

''',
    "maintenance settings timestamp formatter",
)
if "getBrowserTimeZoneLabel()" not in text:
    raise SystemExit("Maintenance timezone label call not found")
text = text.replace(
    "getBrowserTimeZoneLabel()",
    "getLocalTimeZoneDescription()",
    1,
)
old_help = '''                  Browser local time: {browserTimeZoneLabel}. Use YYYY-MM-DD
                  HH:MM, for example 2026-08-03 15:30.'''
new_help = '''                  User local time: {browserTimeZoneLabel}. Saved timestamps use
                  UTC. Use YYYY-MM-DD HH:MM, for example 2026-08-03 15:30.'''
if old_help not in text:
    raise SystemExit("Maintenance timezone help text not found")
text = text.replace(old_help, new_help, 1)
write(maintenance_path, text)

WORKFLOW_PATH.unlink()
SCRIPT_PATH.unlink()
