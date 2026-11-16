import type { Settings } from "./db";

const TZ = "Europe/Amsterdam";

/** "HH:MM" in Dutch local time for a timestamp (ms). */
export function localTime(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms));
  const h = parts.find((p) => p.type === "hour")!.value;
  const m = parts.find((p) => p.type === "minute")!.value;
  return `${h}:${m}`;
}

/** Whether "HH:MM" falls in [start, end), with support for windows over midnight. */
export function isQuiet(s: Pick<Settings, "quietEnabled" | "quietStart" | "quietEnd">, hhmm: string): boolean {
  if (!s.quietEnabled || s.quietStart === s.quietEnd) return false;
  return s.quietStart < s.quietEnd
    ? hhmm >= s.quietStart && hhmm < s.quietEnd
    : hhmm >= s.quietStart || hhmm < s.quietEnd;
}
