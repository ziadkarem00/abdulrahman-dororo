import type { SubtitleCue } from "@/types/dororo";

const BIDI_CONTROL_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const LATIN_CHAR_REGEX = /[A-Za-z]/;

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

function stripMarkup(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, "") // ASS/SSA override tags
    .replace(/<[^>]+>/g, "") // HTML tags like <i>, <font>
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

export function normalizeArabicLine(line: string): string {
  let s = line.replace(BIDI_CONTROL_REGEX, "").trim();
  if (!s) return "";

  // Convert ASCII question mark & comma inside Arabic text to proper Arabic punctuation
  if (ARABIC_CHAR_REGEX.test(s)) {
    s = s.replace(/\?/g, "؟").replace(/,/g, "،");
  }

  // Fix legacy RTL fansub punctuation placed at the visual start of a line (e.g. ".مرحبا" -> "مرحبا.")
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

  // Fix misplaced leading hyphen spacing for dialogue
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
  const sample = cues.slice(0, Math.min(cues.length, 40));
  let arabicCount = 0;
  for (const cue of sample) {
    if (ARABIC_CHAR_REGEX.test(cue.text)) {
      arabicCount += 1;
    }
  }
  return arabicCount / sample.length >= 0.45;
}

export function hasEnglishContent(cues: SubtitleCue[]): boolean {
  if (!cues.length) return false;
  const sample = cues.slice(0, Math.min(cues.length, 40));
  let latinCount = 0;
  let arabicCount = 0;
  for (const cue of sample) {
    if (LATIN_CHAR_REGEX.test(cue.text)) latinCount += 1;
    if (ARABIC_CHAR_REGEX.test(cue.text)) arabicCount += 1;
  }
  return latinCount / sample.length >= 0.5 && arabicCount / sample.length < 0.2;
}

export function parseSubtitleText(
  raw: string,
  normalizeArabic = false
): SubtitleCue[] {
  const normalized = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    // Find the line containing "-->"
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx === -1) continue;

    const timeLine = lines[timeIdx];
    const [startRaw, endRest] = timeLine.split("-->");
    if (!startRaw || !endRest) continue;

    const endRaw = endRest.trim().split(/\s+/)[0];
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;

    const rawText = lines
      .slice(timeIdx + 1)
      .map((l) => stripMarkup(l))
      .filter(Boolean)
      .join("\n");

    if (!rawText) continue;

    const finalText = normalizeArabic
      ? normalizeArabicCueText(rawText)
      : rawText;

    if (finalText) {
      cues.push({ start, end, text: finalText });
    }
  }

  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return cues;
}

/**
 * Returns ALL cues active at `timeSeconds` (supports overlapping anime signs + dialogue
 * without dropping spoken lines).
 */
export function findActiveCues(
  cues: SubtitleCue[],
  timeSeconds: number
): SubtitleCue[] {
  if (!cues.length || timeSeconds < 0) return [];
  const active: SubtitleCue[] = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.start > timeSeconds) break;
    if (timeSeconds >= cue.start && timeSeconds <= cue.end) {
      active.push(cue);
    }
  }
  return active;
}
