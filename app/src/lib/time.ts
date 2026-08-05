export type TimestampFormatOptions = {
  seconds?: boolean;
  invalidValue?: string;
};

const DISPLAY_LOCALE = "en-US";
const UTC_TIME_ZONE = "UTC";

const FIXED_ABBREVIATIONS: Record<string, string> = {
  UTC: "UTC",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
  "Asia/Tokyo": "JST",
  "Asia/Seoul": "KST",
  "Asia/Shanghai": "CST",
  "Asia/Hong_Kong": "HKT",
  "Asia/Singapore": "SGT",
  "Asia/Taipei": "CST",
  "Asia/Bangkok": "ICT",
  "Asia/Kolkata": "IST",
  "Asia/Dubai": "GST",
};

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || UTC_TIME_ZONE;
  } catch {
    return UTC_TIME_ZONE;
  }
}

export function getTimeZoneOffsetMinutes(
  date: Date,
  timeZone: string,
): number | null {
  try {
    const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    const localTimeAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );

    return Math.round((localTimeAsUtc - date.getTime()) / 60000);
  } catch {
    return null;
  }
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const minutes = String(absoluteOffset % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function normalizeDetectedAbbreviation(
  detected: string | undefined,
  offsetMinutes: number | null,
): string | null {
  if (!detected) {
    return null;
  }

  if (detected === "GMT") {
    return "UTC";
  }

  if (/^GMT(?:$|[+-])/iu.test(detected)) {
    return offsetMinutes === null ? "UTC" : `UTC${formatOffset(offsetMinutes)}`;
  }

  return detected;
}

export function getUserTimeZoneAbbreviation(
  date = new Date(),
  timeZone = getUserTimeZone(),
): string {
  const fixed = FIXED_ABBREVIATIONS[timeZone];
  if (fixed) {
    return fixed;
  }

  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);

  try {
    const detected = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      timeZone,
      hour: "numeric",
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;

    const normalized = normalizeDetectedAbbreviation(detected, offsetMinutes);
    if (normalized) {
      return normalized;
    }
  } catch {
    // Fall through to the explicit UTC offset label.
  }

  return offsetMinutes === null ? timeZone : `UTC${formatOffset(offsetMinutes)}`;
}

export function getLocalTimeZoneDescription(date = new Date()): string {
  const timeZone = getUserTimeZone();
  const abbreviation = getUserTimeZoneAbbreviation(date, timeZone);
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);

  if (
    offsetMinutes === null ||
    abbreviation.startsWith("UTC+") ||
    abbreviation.startsWith("UTC-")
  ) {
    return `${timeZone} (${abbreviation})`;
  }

  return `${timeZone} (${abbreviation}, UTC${formatOffset(offsetMinutes)})`;
}

function formatInTimeZone(
  date: Date,
  timeZone: string,
  seconds: boolean,
): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  }).format(date);
}

export function formatLocalAndUtcTimestamp(
  value: string | Date | null | undefined,
  options: TimestampFormatOptions = {},
): string {
  const invalidValue = options.invalidValue ?? "—";
  if (!value) {
    return invalidValue;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return invalidValue;
  }

  const seconds = options.seconds ?? false;
  const localTimeZone = getUserTimeZone();
  const localAbbreviation = getUserTimeZoneAbbreviation(date, localTimeZone);
  const localOffset = getTimeZoneOffsetMinutes(date, localTimeZone);
  const localText = formatInTimeZone(date, localTimeZone, seconds);
  const utcText = formatInTimeZone(date, UTC_TIME_ZONE, seconds);

  if (
    localTimeZone === UTC_TIME_ZONE ||
    localTimeZone === "Etc/UTC" ||
    (localAbbreviation === "UTC" && localOffset === 0)
  ) {
    return `${utcText} UTC`;
  }

  return `${localText} ${localAbbreviation} / ${utcText} UTC`;
}
