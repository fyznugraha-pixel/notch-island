/**
 * Natural language parser for dates & times in Indonesian and English
 * Specially tuned for Gili Quick To-Do
 */

export interface NlpDateResult {
  hasDate: boolean;
  hasTime: boolean;
  rawMatched: string;
  startIndex: number;
  endIndex: number;
  cleanText: string;
  dueAt: number | null;
  chipLabel: string;
  badgeLabel: string;
  badgeType: "am" | "bl" | "gr"; // amber (today/soon), blue (scheduled), gray (later)
}

const INDO_DAYS: Record<string, number> = {
  minggu: 0,
  ahad: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  "jum'at": 5,
  sabtu: 6,
};

const ENG_DAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTH_NAMES_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

const DAY_NAMES_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatNlpDateBadge(
  dueAt: number,
  referenceDate: Date = new Date(),
  lang: "en" | "id" = "id",
  hasTime: boolean = true
): {
  chipLabel: string;
  badgeLabel: string;
  badgeType: "am" | "bl" | "gr";
} {
  const target = new Date(dueAt);
  const now = referenceDate;
  const isEn = lang === "en";
  
  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const hh = String(target.getHours()).padStart(2, "0");
  const mm = String(target.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  const dayName = isEn ? DAY_NAMES_EN[target.getDay()] : DAY_NAMES_ID[target.getDay()];
  const monthName = isEn ? MONTH_NAMES_EN[target.getMonth()] : MONTH_NAMES_ID[target.getMonth()];
  const dateNum = target.getDate();

  if (isSameDay(target, now)) {
    const todayLabel = isEn ? "Today" : "Hari ini";
    return {
      chipLabel: hasTime ? `${todayLabel} · ${timeStr}` : todayLabel,
      badgeLabel: hasTime ? `${todayLabel} · ${timeStr}` : todayLabel,
      badgeType: "am",
    };
  }

  if (isSameDay(target, tomorrow)) {
    const tomorrowLabel = isEn ? "Tomorrow" : "Besok";
    return {
      chipLabel: hasTime ? `${tomorrowLabel} · ${timeStr}` : tomorrowLabel,
      badgeLabel: hasTime ? `${tomorrowLabel} · ${timeStr}` : tomorrowLabel,
      badgeType: "gr",
    };
  }

  // Future day
  const chipLabel = hasTime
    ? `${dayName}, ${dateNum} ${monthName} · ${timeStr}`
    : `${dayName}, ${dateNum} ${monthName}`;
  const badgeLabel = hasTime ? `${dayName} · ${timeStr}` : dayName;

  return {
    chipLabel,
    badgeLabel,
    badgeType: "bl",
  };
}

/**
 * Parses date/time expressions from task input string.
 */
export function parseDateNlp(
  text: string,
  referenceDate: Date = new Date(),
  lang: "en" | "id" = "id"
): NlpDateResult {
  const emptyResult: NlpDateResult = {
    hasDate: false,
    hasTime: false,
    rawMatched: "",
    startIndex: -1,
    endIndex: -1,
    cleanText: text.trim(),
    dueAt: null,
    chipLabel: "",
    badgeLabel: "",
    badgeType: "gr",
  };

  if (!text || !text.trim()) {
    return emptyResult;
  }

  const lower = text.toLowerCase();

  // Day relative phrases:
  // "hari ini", "today", "malam ini", "sore ini", "siang ini", "pagi ini"
  // "besok pagi", "besok sore", "besok malam", "besok", "tomorrow"
  // "lusa", "akhir pekan", "weekend"
  // or days of week: "senin", "selasa", "rabu", "kamis", "jumat", "jum'at", "sabtu", "minggu", "monday", etc.
  const relativeDayPattern = 
    /\b(?:hari ini|today|malam ini|sore ini|siang ini|pagi ini|besok lusa|besok(?:\s+(?:pagi|siang|sore|malam))?|tomorrow(?:\s+(?:morning|afternoon|evening|night))?|lusa|akhir pekan|weekend|senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

  // Try matching combined: [Day] [Time] or [Time] [Day] or just [Day] or just [Time]
  // Pattern 1: Day phrase followed optionally by "jam / pukul / at" + time
  const combinedPattern = new RegExp(
    `(${relativeDayPattern.source})(?:\\s+(?:(?:jam|pukul|at)\\s+)?(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:pagi|siang|sore|malam|am|pm|morning|afternoon|evening|night)?))?`,
    "i"
  );

  let match = lower.match(combinedPattern);
  let matchedIndex = -1;
  let matchedRaw = "";
  let targetDate: Date | null = null;
  let hasExplicitTime = false;

  if (match && match.index !== undefined) {
    const fullMatchedStr = match[0].trim();
    const dayPart = match[1] ? match[1].toLowerCase() : "";
    const timePart = match[2] ? match[2].trim() : "";

    targetDate = new Date(referenceDate);
    // If no explicit time is given, default to end of that day (23:59:00)
    // so it acts as an all-day deadline and doesn't arbitrarily default to 9:00 AM.
    let resolvedHour = 23;
    let resolvedMinute = 59;

    // Resolve Day & time-of-day period
    if (dayPart === "hari ini" || dayPart === "today") {
      // Date is already today
    } else if (dayPart === "pagi ini") {
      resolvedHour = 9;
      resolvedMinute = 0;
      hasExplicitTime = true;
    } else if (dayPart === "siang ini") {
      resolvedHour = 13;
      resolvedMinute = 0;
      hasExplicitTime = true;
    } else if (dayPart === "sore ini") {
      resolvedHour = 17;
      resolvedMinute = 0;
      hasExplicitTime = true;
    } else if (dayPart === "malam ini") {
      resolvedHour = 20;
      resolvedMinute = 0;
      hasExplicitTime = true;
    } else if (dayPart.startsWith("besok") || dayPart.startsWith("tomorrow")) {
      targetDate.setDate(targetDate.getDate() + 1);
      if (dayPart.includes("pagi") || dayPart.includes("morning")) {
        resolvedHour = 9;
        resolvedMinute = 0;
        hasExplicitTime = true;
      } else if (dayPart.includes("siang")) {
        resolvedHour = 13;
        resolvedMinute = 0;
        hasExplicitTime = true;
      } else if (dayPart.includes("sore") || dayPart.includes("afternoon")) {
        resolvedHour = 16;
        resolvedMinute = 0;
        hasExplicitTime = true;
      } else if (dayPart.includes("malam") || dayPart.includes("evening") || dayPart.includes("night")) {
        resolvedHour = 20;
        resolvedMinute = 0;
        hasExplicitTime = true;
      }
    } else if (dayPart === "lusa" || dayPart === "besok lusa") {
      targetDate.setDate(targetDate.getDate() + 2);
    } else if (dayPart === "akhir pekan" || dayPart === "weekend") {
      // Nearest coming Saturday
      const currentDay = targetDate.getDay();
      const daysUntilSaturday = (6 - currentDay + 7) % 7 || 7;
      targetDate.setDate(targetDate.getDate() + daysUntilSaturday);
    } else {
      // Named day of week
      const targetDayOfWeek = INDO_DAYS[dayPart] ?? ENG_DAYS[dayPart];
      if (targetDayOfWeek !== undefined) {
        const currentDay = targetDate.getDay();
        let diff = (targetDayOfWeek - currentDay + 7) % 7;
        if (diff === 0) diff = 7; // next week's day if same day
        targetDate.setDate(targetDate.getDate() + diff);
      }
    }

    // Resolve explicit time part if present (e.g. "jam 4 sore", "16:00", "4pm")
    if (timePart) {
      const parsedTime = parseTimeSnippet(timePart);
      if (parsedTime) {
        resolvedHour = parsedTime.hour;
        resolvedMinute = parsedTime.minute;
        hasExplicitTime = true;
      }
    }

    targetDate.setHours(resolvedHour, resolvedMinute, 0, 0);

    matchedIndex = match.index;
    matchedRaw = text.slice(match.index, match.index + fullMatchedStr.length);
  }

  // If no day matched, check standalone time like "jam 4 sore", "jam 16:00", "pukul 8 malam"
  if (!targetDate) {
    const standaloneTimeMatch = lower.match(/(?:\b(?:jam|pukul|at)\s+\d{1,2}(?:[:.]\d{2})?\s*(?:pagi|siang|sore|malam|am|pm|morning|afternoon|evening|night)?\b|\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\b)/i);
    if (standaloneTimeMatch && standaloneTimeMatch.index !== undefined) {
      const parsed = parseTimeSnippet(standaloneTimeMatch[0]);
      if (parsed) {
        targetDate = new Date(referenceDate);
        targetDate.setHours(parsed.hour, parsed.minute, 0, 0);
        // If time has already passed today, advance to tomorrow
        if (targetDate.getTime() <= referenceDate.getTime()) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
        matchedIndex = standaloneTimeMatch.index;
        matchedRaw = text.slice(matchedIndex, matchedIndex + standaloneTimeMatch[0].length);
        hasExplicitTime = true;
      }
    }
  }

  if (targetDate && matchedIndex >= 0) {
    // Extract clean text by cutting out matchedRaw and any dangling prepositions (di, pada, ke, at, on)
    const before = text.slice(0, matchedIndex);
    const after = text.slice(matchedIndex + matchedRaw.length);
    let clean = `${before} ${after}`
      .replace(/\s+(pada|di|jam|pukul|at|on|for)\s*$/i, "")
      .replace(/^\s*(pada|di|jam|pukul|at|on|for)\s+/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!clean) {
      clean = text.trim();
    }

    const { chipLabel, badgeLabel, badgeType } = formatNlpDateBadge(
      targetDate.getTime(),
      referenceDate,
      lang,
      hasExplicitTime
    );

    return {
      hasDate: true,
      hasTime: hasExplicitTime,
      rawMatched: matchedRaw,
      startIndex: matchedIndex,
      endIndex: matchedIndex + matchedRaw.length,
      cleanText: clean,
      dueAt: targetDate.getTime(),
      chipLabel,
      badgeLabel,
      badgeType,
    };
  }

  return emptyResult;
}

function parseTimeSnippet(snippet: string): { hour: number; minute: number } | null {
  const match = snippet.match(/(?:(?:jam|pukul|at)\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|siang|sore|malam|am|pm|morning|afternoon|evening|night)?/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const modifier = match[3] ? match[3].toLowerCase() : "";

  if (isNaN(h) || h < 0 || h > 24 || isNaN(m) || m < 0 || m > 59) {
    return null;
  }

  if (modifier === "sore" || modifier === "pm" || modifier === "afternoon" || modifier === "evening") {
    if (h < 12) h += 12;
  } else if (modifier === "malam" || modifier === "night") {
    if (h < 12 && h >= 6) h += 12;
    else if (h < 6) h += 12; // e.g. "jam 8 malam" -> 20
  } else if (modifier === "siang") {
    if (h < 12 && h >= 1 && h <= 3) h += 12; // "jam 1 siang" -> 13
  } else if (modifier === "pagi" || modifier === "am" || modifier === "morning") {
    if (h === 12) h = 0;
  } else {
    // No modifier: if h between 1 and 6, user likely means afternoon (e.g. jam 4 -> 16:00) unless 24hr format
    if (h >= 1 && h <= 6 && (snippet.includes("jam") || snippet.includes("pukul") || snippet.includes("at"))) {
      h += 12;
    }
  }

  return { hour: h % 24, minute: m };
}
