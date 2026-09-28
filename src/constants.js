/** Discord refuses timeouts longer than 28 days, so that is the hard ceiling. */
export const MAX_TIMEOUT_MS = 2_419_200_000;

/** Bulk delete reaches at most 100 messages, and only ones younger than 14 days. */
export const MAX_PURGE = 100;

/** Slowmode tops out at six hours. */
export const MAX_SLOWMODE = 21_600;

const UNIT_SECONDS = { w: 604_800, d: 86_400, h: 3_600, m: 60, s: 1 };

/**
 * Turn "1h30m" or a bare "10" (minutes unless told otherwise) into milliseconds.
 * Throws on anything it cannot fully consume, so a typo never becomes a 0 ms timeout.
 */
export function parseDuration(text, defaultUnit = "m") {
  const value = String(text ?? "").trim().toLowerCase();
  if (!value) throw new Error("Enter a duration.");
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return Math.floor(Number(value) * (UNIT_SECONDS[defaultUnit] ?? 60) * 1000);
  }

  let total = 0;
  let consumed = 0;
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)(w|d|h|m|s)/g)) {
    total += Number(match[1]) * UNIT_SECONDS[match[2]] * 1000;
    consumed += match[0].length;
  }
  if (!total || value.replace(/\s/g, "").length !== consumed) {
    throw new Error("Use a duration such as 1h30m or 10m.");
  }
  return total;
}

/** Render milliseconds back as "1d 2h 30m" for the moderator reply and the DM. */
export function durationParts(ms) {
  let seconds = Math.max(0, Math.floor(ms / 1000));
  return Object.entries(UNIT_SECONDS)
    .flatMap(([name, size]) => {
      const value = Math.floor(seconds / size);
      seconds %= size;
      return value ? [`${value}${name}`] : [];
    })
    .join(" ") || "0s";
}
