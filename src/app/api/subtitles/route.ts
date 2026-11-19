import { NextRequest, NextResponse } from "next/server";
import { DORORO_IMDB_ID, TOTAL_EPISODES } from "@/lib/dororo-data";
import {
  decodeSubtitleBuffer,
  hasArabicContent,
  hasEnglishContent,
  normalizeArabicCueText,
  parseSubtitleText,
} from "@/lib/subtitles";
import type { SubtitleCue } from "@/types/dororo";

export const runtime = "nodejs";
export const maxDuration = 30;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/json,text/plain,*/*",
};

interface OpenSubEntry {
  url?: string;
  lang?: string;
}

interface CandidateTrack {
  cues: SubtitleCue[];
  score: number;
  provider: "opensubtitles" | "subtitlecat";
}

async function fetchBufferWithTimeout(
  url: string,
  timeoutMs = 8000
): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = 8000,
  preferArabic = false
): Promise<string | null> {
  const buf = await fetchBufferWithTimeout(url, timeoutMs);
  if (!buf) return null;
  return decodeSubtitleBuffer(buf, preferArabic);
}

/**
 * Scores a subtitle track for completeness and streaming timing accuracy.
 * A full 24-minute Dororo episode typically has 200-450 cues spanning ~1300-1450s.
 */
function scoreTrackQuality(cues: SubtitleCue[], titleHint = ""): number {
  if (cues.length < 30) return 0;
  let score = 0;

  // Completeness score: strongly prefer full-episode tracks (180..550 cues)
  if (cues.length >= 180 && cues.length <= 650) {
    score += 50;
  } else if (cues.length >= 120) {
    score += 30;
  } else {
    score += 10;
  }

  // Span score: check that cues cover the full ~20-24 min episode runtime
  const lastEnd = cues[cues.length - 1]?.end ?? 0;
  if (lastEnd >= 1150 && lastEnd <= 1650) {
    score += 30;
  } else if (lastEnd >= 900) {
    score += 15;
  }

  // Release timing preference: AnimeEmbed streams match WEB-DL / Amazon Prime timing best
  const lower = titleHint.toLowerCase();
  if (
    lower.includes("web") ||
    lower.includes("amzn") ||
    lower.includes("prime") ||
    lower.includes("horriblesubs") ||
    lower.includes("erai")
  ) {
    score += 20;
  } else if (lower.includes("bdrip") || lower.includes("blu")) {
    score += 10;
  }

  return score;
}

function matchesDororoEpisode(title: string, episode: number): boolean {
  const lower = title.toLowerCase();
  if (!lower.includes("dororo")) return false;
  if (lower.includes("1969")) return false;

  const ep2 = String(episode).padStart(2, "0");
  const patterns = [
    new RegExp(`s0?1e0?${episode}(?!\\d)`, "i"),
    new RegExp(`\\bep\\.?\\s*0?${episode}(?!\\d)`, "i"),
    new RegExp(`\\be0?${episode}(?!\\d)`, "i"),
    new RegExp(`\\s-\\s0?${episode}(?!\\d)`),
    new RegExp(`\\b${ep2}\\b`),
  ];

  return patterns.some((re) => re.test(lower));
}

async function fetchFromSubtitleCat(
  episode: number,
  targetLang: "en" | "ar"
): Promise<CandidateTrack | null> {
  const ep2 = String(episode).padStart(2, "0");
  const searchUrls = [
    `https://www.subtitlecat.com/?search=dororo+2019+ep${ep2}`,
    `https://www.subtitlecat.com/?search=dororo+2019+s01e${ep2}`,
    `https://www.subtitlecat.com/?search=dororo&show=1000`,
  ];

  const foundPages: Array<{ path: string; title: string; rank: number }> = [];
  const seenPaths = new Set<string>();

  for (const searchUrl of searchUrls) {
    const html = await fetchTextWithTimeout(searchUrl, 7000, false);
    if (!html) continue;

    const linkRegex = /href="(\/subs\/[^"]+\.html)"[^>]*>([^<]+)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      const path = match[1];
      const title = match[2];
      if (seenPaths.has(path) || !matchesDororoEpisode(title, episode)) continue;
      seenPaths.add(path);

      let rank = 1;
      const lower = title.toLowerCase();
      if (lower.includes("2019")) rank += 4;
      // Strongly prefer WEB / Prime releases (matches AnimeEmbed streaming sync)
      if (lower.includes("web") || lower.includes("amzn") || lower.includes("prime")) {
        rank += 6;
      }
      if (lower.includes("multi-subs")) rank += 2;
      if (lower.includes("1080p")) rank += 1;
      foundPages.push({ path, title, rank });
    }

    if (foundPages.length >= 2) break;
  }

  if (foundPages.length === 0) return null;
  foundPages.sort((a, b) => b.rank - a.rank);

  let best: CandidateTrack | null = null;

  for (const page of foundPages.slice(0, 2)) {
    const detailHtml = await fetchTextWithTimeout(
      `https://www.subtitlecat.com${page.path}`,
      7000,
      false
    );
    if (!detailHtml) continue;

    const srtRegex = /href="(\/subs\/[^"]+\.srt)"/gi;
    const srtLinks: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = srtRegex.exec(detailHtml)) !== null) {
      srtLinks.push(m[1]);
    }
    if (srtLinks.length === 0) continue;

    const langSuffix = targetLang === "ar" ? /-ar\.srt$/i : /-en\.srt$/i;
    let chosen = srtLinks.find((href) => langSuffix.test(href));

    if (!chosen && targetLang === "en") {
      chosen =
        srtLinks.find((href) => !/-[a-z]{2}(-[A-Z]{2})?\.srt$/i.test(href)) ??
        srtLinks[0];
    }
    if (!chosen) continue;

    const srtText = await fetchTextWithTimeout(
      `https://www.subtitlecat.com${chosen}`,
      8000,
      targetLang === "ar"
    );
    if (!srtText) continue;

    const cues = parseSubtitleText(srtText, targetLang === "ar");
    if (targetLang === "ar" && !hasArabicContent(cues)) continue;
    if (targetLang === "en" && !hasEnglishContent(cues)) continue;

    const score = scoreTrackQuality(cues, page.title);
    if (score > 0 && (!best || score > best.score)) {
      best = { cues, score, provider: "subtitlecat" };
    }
    if (best && best.score >= 95) break;
  }

  return best;
}

async function fetchFromOpenSubtitles(
  episode: number,
  targetLang: "en" | "ar"
): Promise<CandidateTrack | null> {
  const url = `https://opensubtitles-v3.strem.io/subtitles/series/${DORORO_IMDB_ID}:1:${episode}.json`;
  const raw = await fetchTextWithTimeout(url, 7000, false);
  if (!raw) return null;

  let parsed: { subtitles?: OpenSubEntry[] };
  try {
    parsed = JSON.parse(raw) as { subtitles?: OpenSubEntry[] };
  } catch {
    return null;
  }

  const list = Array.isArray(parsed.subtitles) ? parsed.subtitles : [];
  const wantedCodes =
    targetLang === "ar" ? ["ara", "ar", "arb"] : ["eng", "en"];

  const matching = list.filter(
    (s) => s.url && s.lang && wantedCodes.includes(s.lang.toLowerCase())
  );

  let best: CandidateTrack | null = null;

  // Check up to 4 candidates in parallel and pick the most complete track
  const fetched = await Promise.all(
    matching.slice(0, 4).map(async (entry) => {
      if (!entry.url) return null;
      const srtText = await fetchTextWithTimeout(
        entry.url,
        8000,
        targetLang === "ar"
      );
      if (!srtText) return null;

      const cues = parseSubtitleText(srtText, targetLang === "ar");
      if (targetLang === "ar" && !hasArabicContent(cues)) return null;
      if (targetLang === "en" && !hasEnglishContent(cues)) return null;

      const score = scoreTrackQuality(cues, entry.url);
      if (score <= 0) return null;
      return {
        cues,
        score,
        provider: "opensubtitles" as const,
      };
    })
  );

  for (const cand of fetched) {
    if (cand && (!best || cand.score > best.score)) {
      best = cand;
    }
  }

  return best;
}

async function translateBatchToArabic(
  lines: string[],
  depth = 0
): Promise<string[]> {
  if (lines.length === 0) return [];

  const singleLines = lines.map((t) => t.replace(/\n+/g, " / ").trim());
  const payload = singleLines.join("\n");

  try {
    const res = await fetch(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": FETCH_HEADERS["User-Agent"],
        },
        body: new URLSearchParams({ q: payload }).toString(),
      }
    );

    if (!res.ok) throw new Error("Translate HTTP error");
    const data = (await res.json()) as Array<Array<[string, string]>>;
    const segments = Array.isArray(data?.[0]) ? data[0] : [];
    const combined = segments.map((seg) => seg[0] ?? "").join("");
    const split = combined.split("\n");

    if (split.length === singleLines.length) {
      return split.map((line, i) => {
        const cleaned = normalizeArabicCueText(line.replace(/\s*\/\s*/g, "\n"));
        return cleaned || lines[i];
      });
    }

    if (lines.length > 1 && depth < 3) {
      const mid = Math.ceil(lines.length / 2);
      const [left, right] = await Promise.all([
        translateBatchToArabic(lines.slice(0, mid), depth + 1),
        translateBatchToArabic(lines.slice(mid), depth + 1),
      ]);
      return [...left, ...right];
    }

    return singleLines.map((orig, i) => {
      const candidate = split[i] ? normalizeArabicCueText(split[i]) : "";
      return candidate || normalizeArabicCueText(combined) || orig;
    });
  } catch {
    if (lines.length > 1 && depth < 2) {
      const mid = Math.ceil(lines.length / 2);
      const [left, right] = await Promise.all([
        translateBatchToArabic(lines.slice(0, mid), depth + 1),
        translateBatchToArabic(lines.slice(mid), depth + 1),
      ]);
      return [...left, ...right];
    }
    return lines;
  }
}

async function translateCuesToArabic(cues: SubtitleCue[]): Promise<SubtitleCue[]> {
  const BATCH_SIZE = 24;
  const batches: SubtitleCue[][] = [];
  for (let i = 0; i < cues.length; i += BATCH_SIZE) {
    batches.push(cues.slice(i, i + BATCH_SIZE));
  }

  const CONCURRENCY = 5;
  const translatedTexts: string[] = new Array(cues.length);

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map((batch) => translateBatchToArabic(batch.map((c) => c.text)))
    );

    results.forEach((texts, batchOffset) => {
      const startIndex = (i + batchOffset) * BATCH_SIZE;
      texts.forEach((txt, idx) => {
        translatedTexts[startIndex + idx] = txt;
      });
    });
  }

  const out: SubtitleCue[] = cues.map((cue, idx) => ({
    start: cue.start,
    end: cue.end,
    text: translatedTexts[idx] || cue.text,
  }));

  return hasArabicContent(out) ? out : [];
}

function pickBestTrack(
  a: CandidateTrack | null,
  b: CandidateTrack | null
): CandidateTrack | null {
  if (!a) return b;
  if (!b) return a;
  return b.score > a.score ? b : a;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const epParam = Number(searchParams.get("ep") ?? "1");
  const langParam = (searchParams.get("lang") ?? "ar").toLowerCase();

  const episode = Math.max(
    1,
    Math.min(TOTAL_EPISODES, Number.isFinite(epParam) ? Math.floor(epParam) : 1)
  );
  const lang: "ar" | "en" = langParam === "en" ? "en" : "ar";

  // Query both providers in parallel and select the highest-completeness, WEB-timed track
  const [osNative, scNative] = await Promise.all([
    fetchFromOpenSubtitles(episode, lang),
    fetchFromSubtitleCat(episode, lang),
  ]);

  const bestNative = pickBestTrack(osNative, scNative);

  // Only accept a native track if it has healthy full-episode cue coverage (>= 120 cues)
  if (bestNative && bestNative.cues.length >= 120) {
    return NextResponse.json(
      {
        episode,
        lang,
        source: bestNative.provider,
        count: bestNative.cues.length,
        cues: bestNative.cues,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=604800, stale-while-revalidate=86400",
        },
      }
    );
  }

  // If Arabic was requested and native Arabic was missing or incomplete, translate the best WEB English track
  if (lang === "ar") {
    const [osEn, scEn] = await Promise.all([
      fetchFromOpenSubtitles(episode, "en"),
      fetchFromSubtitleCat(episode, "en"),
    ]);
    const bestEn = pickBestTrack(osEn, scEn);

    if (bestEn && bestEn.cues.length > 0) {
      const arabicCues = await translateCuesToArabic(bestEn.cues);
      if (arabicCues.length > 0) {
        return NextResponse.json(
          {
            episode,
            lang: "ar",
            source: `translated-${bestEn.provider}`,
            count: arabicCues.length,
            cues: arabicCues,
          },
          {
            headers: {
              "Cache-Control":
                "public, s-maxage=604800, stale-while-revalidate=86400",
            },
          }
        );
      }
    }
  }

  // Fallback to whatever native track existed (even if < 120 cues)
  if (bestNative && bestNative.cues.length > 0) {
    return NextResponse.json(
      {
        episode,
        lang,
        source: bestNative.provider,
        count: bestNative.cues.length,
        cues: bestNative.cues,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=604800, stale-while-revalidate=86400",
        },
      }
    );
  }

  return NextResponse.json(
    {
      episode,
      lang,
      source: "none",
      count: 0,
      cues: [],
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600",
      },
    }
  );
}
