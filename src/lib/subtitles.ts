import type { SubtitleCue } from "@/types/dororo";

const BIDI_CONTROL_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const LATIN_CHAR_REGEX = /[A-Za-z]/;
const TIMESTAMP_LINE_REGEX =
  /^((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

function parseTimestamp(raw: string): number {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":");
  if (parts.length === 3) {
    const hours = Number(parts[0]) || 0;
    const minutes = Number(parts[1]) || 0;
    const seconds = Number(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = Number(parts[0]) || 0;
    const seconds = Number(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return 0;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, num: string) => {
      const code = Number(num);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function stripMarkup(text: string): string {
  const cleaned = text
    .replace(/\{\\[^}]*\}/g, "")
    .replace(
      /<\/?(?:i|b|u|s|font|span|div|br|p|c|ruby|rt|v|lang)(?:\s[^>]*)?>/gi,
      ""
    );

  return decodeHtmlEntities(cleaned).trim();
}

/**
 * Decodes raw subtitle bytes cleanly into UTF-8 text, supporting UTF-8,
 * UTF-16LE/BE BOMs, and legacy Windows-1256 Arabic SRT files.
 */
export function decodeSubtitleBuffer(
  buffer: ArrayBuffer,
  preferArabic = false
): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(bytes);
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(bytes);
    }
  }

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const hasReplacementChars = utf8.includes("\uFFFD");

  if (preferArabic && (hasReplacementChars || !ARABIC_CHAR_REGEX.test(utf8))) {
    try {
      const win1256 = new TextDecoder("windows-1256").decode(bytes);
      if (ARABIC_CHAR_REGEX.test(win1256)) {
        return win1256;
      }
    } catch {
      // Fallback to UTF-8 if runtime lacks windows-1256
    }
  }

  return utf8;
}

/**
 * Cleanly converts an SRT (or mixed) subtitle string into valid UTF-8 WebVTT (`WEBVTT`).
 * Preserves Arabic UTF-8 characters and normalizes comma timestamps to dot timestamps.
 */
export function srtToWebVtt(raw: string): string {
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (cleaned.startsWith("WEBVTT")) {
    return cleaned;
  }

  const converted = cleaned.replace(
    /(\d{1,2}:\d{2}:\d{2}),(\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g,
    "$1.$2 --> $3.$4"
  );

  return `WEBVTT\n\n${converted}\n`;
}

export function normalizeArabicLine(line: string): string {
  let s = line.replace(BIDI_CONTROL_REGEX, "").trim();
  if (!s) return "";

  if (ARABIC_CHAR_REGEX.test(s)) {
    s = s.replace(/\?/g, "؟").replace(/,/g, "،");
  }

  const leadingPunctMatch = s.match(/^([.!?؟،…]+)\s*(.+)$/);
  if (leadingPunctMatch && ARABIC_CHAR_REGEX.test(leadingPunctMatch[2])) {
    const punct = leadingPunctMatch[1];
    const body = leadingPunctMatch[2].trim();
    if (!/[.!?؟،…]$/.test(body)) {
      s = `${body}${punct}`;
    } else {
      s = body;
    }
  }

  s = s.replace(/^-\s*/, "- ").replace(/\s{2,}/g, " ").trim();
  return s;
}

export function normalizeArabicCueText(text: string): string {
  return text
    .split("\n")
    .map((line) => normalizeArabicLine(line))
    .filter(Boolean)
    .join("\n");
}

export function hasArabicContent(cues: SubtitleCue[]): boolean {
  if (!cues.length) return false;
  const step = Math.max(1, Math.floor(cues.length / 40));
  let checked = 0;
  let arabicCount = 0;
  for (let i = 0; i < cues.length && checked < 40; i += step) {
    checked += 1;
    if (ARABIC_CHAR_REGEX.test(cues[i].text)) {
      arabicCount += 1;
    }
  }
  return checked > 0 && arabicCount / checked >= 0.45;
}

export function hasEnglishContent(cues: SubtitleCue[]): boolean {
  if (!cues.length) return false;
  const step = Math.max(1, Math.floor(cues.length / 40));
  let checked = 0;
  let latinCount = 0;
  let arabicCount = 0;
  for (let i = 0; i < cues.length && checked < 40; i += step) {
    checked += 1;
    if (LATIN_CHAR_REGEX.test(cues[i].text)) latinCount += 1;
    if (ARABIC_CHAR_REGEX.test(cues[i].text)) arabicCount += 1;
  }
  return (
    checked > 0 &&
    latinCount / checked >= 0.5 &&
    arabicCount / checked < 0.2
  );
}

/**
 * Line-by-line state-machine WebVTT/SRT parser (converts SRT to valid WebVTT first).
 * Never drops cues when blank separator lines contain spaces or are missing.
 */
export function parseSubtitleText(
  raw: string,
  normalizeArabic = false
): SubtitleCue[] {
  const vttText = srtToWebVtt(raw);
  const lines = vttText.split("\n");
  const cues: SubtitleCue[] = [];

  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  let currentLines: string[] = [];

  const flushCue = () => {
    if (
      currentStart === null ||
      currentEnd === null ||
      currentLines.length === 0
    ) {
      currentStart = null;
      currentEnd = null;
      currentLines = [];
      return;
    }

    while (
      currentLines.length > 1 &&
      /^\d+$/.test(currentLines[currentLines.length - 1].trim())
    ) {
      currentLines.pop();
    }

    const rawText = currentLines
      .map((l) => stripMarkup(l))
      .filter(Boolean)
      .join("\n");

    if (rawText) {
      const finalText = normalizeArabic
        ? normalizeArabicCueText(rawText)
        : rawText;

      if (finalText && currentEnd > currentStart) {
        cues.push({
          start: currentStart,
          end: currentEnd,
          text: finalText,
        });
      }
    }

    currentStart = null;
    currentEnd = null;
    currentLines = [];
  };

  let inHeaderNote = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (currentStart === null) {
      if (
        trimmed.startsWith("WEBVTT") ||
        trimmed.startsWith("NOTE") ||
        trimmed.startsWith("STYLE") ||
        trimmed.startsWith("REGION")
      ) {
        inHeaderNote = true;
        continue;
      }
      if (inHeaderNote) {
        if (trimmed === "") {
          inHeaderNote = false;
        }
        continue;
      }
    }

    const tsMatch = trimmed.match(TIMESTAMP_LINE_REGEX);
    if (tsMatch) {
      flushCue();
      const start = parseTimestamp(tsMatch[1]);
      const end = parseTimestamp(tsMatch[2]);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
        currentStart = start;
        currentEnd = end;
        currentLines = [];
      }
      continue;
    }

    if (trimmed === "") {
      flushCue();
      continue;
    }

    if (currentStart !== null) {
      currentLines.push(lines[i]);
    }
  }

  flushCue();

  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return cues;
}

/**
 * Dynamically shifts all subtitle cue start/end timestamps by `offsetSeconds`,
 * clamping both timestamps to `>= 0` without reloading the video stream.
 */
export function shiftSubtitleCues(
  cues: SubtitleCue[],
  offsetSeconds: number
): SubtitleCue[] {
  if (!offsetSeconds || !cues.length) return cues;
  const shifted: SubtitleCue[] = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const start = Math.max(0, Number((cue.start + offsetSeconds).toFixed(3)));
    const end = Math.max(0, Number((cue.end + offsetSeconds).toFixed(3)));
    if (end > start) {
      shifted.push({ start, end, text: cue.text });
    }
  }
  return shifted;
}

/**
 * Returns ALL cues active at `timeSeconds` with a 40ms boundary tolerance.
 */
export function findActiveCues(
  cues: SubtitleCue[],
  timeSeconds: number
): SubtitleCue[] {
  if (!cues.length || timeSeconds < 0) return [];
  const active: SubtitleCue[] = [];
  const TOLERANCE = 0.04;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.start > timeSeconds + TOLERANCE) break;
    if (
      timeSeconds >= cue.start - TOLERANCE &&
      timeSeconds <= cue.end + TOLERANCE
    ) {
      active.push(cue);
    }
  }
  return active;
}
