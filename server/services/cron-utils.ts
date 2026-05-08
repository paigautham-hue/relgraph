/**
 * Minimal IST-aware cron utilities.
 *
 * RelGraph stores cron expressions in the schedule rows in IST (Asia/Kolkata).
 * This module computes the next firing instant *in UTC* (which is what we
 * persist in `agent_schedules.next_run_at`).
 *
 * Why in-house: we only need 5-field standard cron (minute, hour, dom, month,
 * dow) with `*`, integers, ranges (`a-b`), lists (`a,b,c`), and step values
 * (`*​/n`). Full cron libraries (`node-cron`, `cron-parser`) are 50–100 KB
 * dependencies; this is ~150 lines and matches our needs exactly.
 *
 * Limitations (acceptable for week 2 scope):
 *   - No support for L (last day), W (weekday-of-month), # (nth weekday)
 *   - No support for `7` for Sunday (use `0`)
 *   - DoM and DoW intersection: when both are non-`*`, fires on either match
 *     (this is the standard cron behaviour)
 */

const IST_OFFSET_MINUTES = 330; // UTC+5:30, no DST

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>; // 1-12
  daysOfWeek: Set<number>; // 0-6, Sun=0
  domIsWild: boolean;
  dowIsWild: boolean;
}

/**
 * Parse a 5-field cron expression. Returns null on invalid input.
 */
export function parseCron(expr: string): CronFields | null {
  if (typeof expr !== "string") return null;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const [m, h, dom, mon, dow] = fields;
  try {
    return {
      minutes: parseField(m, 0, 59),
      hours: parseField(h, 0, 23),
      daysOfMonth: parseField(dom, 1, 31),
      months: parseField(mon, 1, 12),
      daysOfWeek: parseField(dow, 0, 6),
      domIsWild: dom === "*",
      dowIsWild: dow === "*",
    };
  } catch {
    return null;
  }
}

function parseField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();
  for (const part of field.split(",")) {
    let stem = part;
    let step = 1;
    const stepIdx = part.indexOf("/");
    if (stepIdx !== -1) {
      stem = part.slice(0, stepIdx);
      step = parseInt(part.slice(stepIdx + 1), 10);
      if (!Number.isInteger(step) || step <= 0) throw new Error(`Invalid step: ${part}`);
    }
    let lo: number;
    let hi: number;
    if (stem === "*") {
      lo = min;
      hi = max;
    } else if (stem.includes("-")) {
      const [a, b] = stem.split("-");
      lo = parseInt(a, 10);
      hi = parseInt(b, 10);
    } else {
      lo = hi = parseInt(stem, 10);
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`Invalid range: ${part}`);
    if (lo < min || hi > max || lo > hi) throw new Error(`Out of range: ${part}`);
    for (let v = lo; v <= hi; v += step) result.add(v);
  }
  return result;
}

/**
 * Convert a UTC Date to IST date components (year, month, day, hour, min, dow).
 * Pure: doesn't mutate input.
 */
function toIST(utc: Date): { y: number; mo: number; d: number; h: number; mi: number; dow: number } {
  // Add IST offset to UTC ms, then read as UTC fields. This avoids relying on
  // the host timezone (Manus servers are UTC, dev machines vary).
  const ist = new Date(utc.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    y: ist.getUTCFullYear(),
    mo: ist.getUTCMonth() + 1, // 1-12
    d: ist.getUTCDate(),
    h: ist.getUTCHours(),
    mi: ist.getUTCMinutes(),
    dow: ist.getUTCDay(),
  };
}

/**
 * Build a UTC Date from IST components.
 */
function fromIST(y: number, mo: number, d: number, h: number, mi: number): Date {
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, 0, 0) - IST_OFFSET_MINUTES * 60_000;
  return new Date(utcMs);
}

/**
 * Compute the next UTC instant when this cron fires, after `from` (exclusive).
 * Returns null if the cron is invalid.
 *
 * IST semantics: cron fields are interpreted in Asia/Kolkata. Returned Date is
 * absolute UTC.
 */
export function computeNextRunAt(cronExpr: string, from: Date): Date | null {
  const fields = parseCron(cronExpr);
  if (!fields) return null;

  // Start from the next minute boundary in IST.
  let { y, mo, d, h, mi } = toIST(from);
  mi += 1;
  if (mi > 59) {
    mi = 0;
    h += 1;
    if (h > 23) {
      h = 0;
      d += 1;
    }
  }

  // Cap iteration at ~366 days to avoid pathological infinite loops on
  // impossible expressions (e.g. Feb 30).
  const MAX_DAYS = 366;
  for (let dayCount = 0; dayCount < MAX_DAYS; dayCount++) {
    // Normalise calendar (handle month/year rollover from added days).
    const normalised = fromIST(y, mo, d, 0, 0);
    const ist = toIST(normalised);
    y = ist.y;
    mo = ist.mo;
    d = ist.d;
    const dow = ist.dow;

    // Month / DoM / DoW match?
    if (!fields.months.has(mo)) {
      // Skip to first day of next valid month.
      mo += 1;
      d = 1;
      h = 0;
      mi = 0;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
      continue;
    }
    const dayMatches = matchesDay(fields, d, dow);
    if (!dayMatches) {
      d += 1;
      h = 0;
      mi = 0;
      continue;
    }

    // Hour scan within this day.
    for (let hh = h; hh <= 23; hh++) {
      if (!fields.hours.has(hh)) continue;
      // Minute scan within this hour.
      const startMi = hh === h ? mi : 0;
      for (let mm = startMi; mm <= 59; mm++) {
        if (fields.minutes.has(mm)) {
          return fromIST(y, mo, d, hh, mm);
        }
      }
    }

    // No match in remainder of day — advance to next day at 00:00.
    d += 1;
    h = 0;
    mi = 0;
  }

  return null; // unreachable for valid crons
}

/**
 * DoM and DoW combine with OR when both are non-wild (standard cron). When
 * either is wild, only the non-wild field constrains.
 */
function matchesDay(fields: CronFields, dom: number, dow: number): boolean {
  if (fields.domIsWild && fields.dowIsWild) return true;
  if (fields.domIsWild) return fields.daysOfWeek.has(dow);
  if (fields.dowIsWild) return fields.daysOfMonth.has(dom);
  return fields.daysOfMonth.has(dom) || fields.daysOfWeek.has(dow);
}

/**
 * Quick human-readable description of a cron in IST (best-effort, used only
 * for admin UI hints; not a full grammar). Falls back to the raw expression.
 */
export function describeCronIST(expr: string): string {
  const fields = parseCron(expr);
  if (!fields) return expr;
  const m = expr.trim().split(/\s+/);
  // Common patterns
  if (expr === "* * * * *") return "every minute (event-driven placeholder)";
  if (m[0] === "0" && m[1] === "*" && m[2] === "*" && m[3] === "*" && m[4] === "*") return "every hour, on the hour (IST)";
  if (m[0] === "0" && /^\*\/\d+$/.test(m[1]) && m[2] === "*" && m[3] === "*" && m[4] === "*") {
    const step = m[1].split("/")[1];
    return `every ${step} hours, on the hour (IST)`;
  }
  if (m[0] === "0" && /^\d+$/.test(m[1]) && m[2] === "*" && m[3] === "*" && m[4] === "*") {
    return `daily at ${m[1].padStart(2, "0")}:00 IST`;
  }
  if (m[0] === "0" && /^\d+$/.test(m[1]) && m[2] === "*" && m[3] === "*" && /^\d$/.test(m[4])) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `weekly on ${dayNames[parseInt(m[4], 10)]} at ${m[1].padStart(2, "0")}:00 IST`;
  }
  return `${expr} (IST)`;
}
