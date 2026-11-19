import { NextRequest, NextResponse } from "next/server";
import { DORORO_IMDB_ID, TOTAL_EPISODES } from "@/lib/dororo-data";
import {
  decodeSubtitleBuffer,
  hasArabicContent,
  hasEnglishContent,
  normalizeArabicCueText,
  parseSubtitleText,
} from "@/lib/subtitles";
import type { SubtitleCue, SubtitleTrack } from "@/types/dororo";

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
  id?: string;
}

interface ScoredTrack {
  id: string;
  label: string;
  source: string;
  cues: SubtitleCue[];
  score: number;
  fingerprint: string;
}

async function fetchBufferWithTimeout(
  url: string,
  timeoutMs = 7500
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
  timeoutMs = 7500,
  preferArabic = false
): Promise<string | null> {
  const buf = await fetchBufferWithTimeout(url, timeoutMs);
  if (!buf) return null;
  return decodeSubtitleBuffer(buf, preferArabic);
}

function makeFingerprint(cues: SubtitleCue[]): string {
  const count = cues.length;
  const first = cues[0] ? Math.round(cues[0].start) : 0;
  const mid = cues[Math.floor(count / 2)]
    ? Math.round(cues[Math.floor(count / 2)].start)
    : 0;
  const last = cues[count - 1] ? Math.round(cues[count - 1].end) : 0;
  return `${count}:${first}:${mid}:${last}`;
}

function scoreTrackQuality(cues: SubtitleCue[], hint = ""): number {
  if (cues.length < 40) return 0;
  let score = 0;

  if (cues.length >= 180 && cues.length <= 700) {
    score += 55;
  } else if (cues.length >= 120) {
    score += 35;
  } else {
    score += 10;
  }

  const lastEnd = cues[cues.length - 1]?.end ?? 0;
  if (lastEnd >= 1150 && lastEnd <= 1650) {
    score += 30;
  } else if (lastEnd >= 900) {
    score += 15;
  }

  const lower = hint.toLowerCase();
  if (
    lower.includes("web") ||
    lower.includes("amzn") ||
    lower.includes("prime") ||
    lower.includes("horriblesubs") ||
    lower.includes("erai")
  ) {
    score += 22;
  } else if (lower.includes("bdrip") || lower.includes("blu")) {
    score += 8;
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

async function fetchFromOpenSubtitlesEndpoint(
  baseUrl: string,
  providerTag: string,
  episode: number,
  targetLang: "en" | "ar"
): Promise<ScoredTrack[]> {
  const url = `${baseUrl}/subtitles/series/${DORORO_IMDB_ID}:1:${episode}.json`;
  const raw = await fetchTextWithTimeout(url, 6500, false);
  if (!raw) return [];

  let parsed: { subtitles?: OpenSubEntry[] };
  try {
    parsed = JSON.parse(raw) as { subtitles?: OpenSubEntry[] };
  } catch {
    return [];
  }

  const list = Array.isArray(parsed.subtitles) ? parsed.subtitles : [];
  const wantedCodes =
    targetLang === "ar" ? ["ara", "ar", "arb"] : ["eng", "en"];

  const matching = list.filter(
    (s) => s.url && s.lang && wantedCodes.includes(s.lang.toLowerCase())
  );

  const fetched = await Promise.all(
    matching.slice(0, 5).map(async (entry, idx) => {
      if (!entry.url) return null;
      const srtText = await fetchTextWithTimeout(
        entry.url,
        7500,
        targetLang === "ar"
      );
      if (!srtText) return null;

      const cues = parseSubtitleText(srtText, targetLang === "ar");
      if (targetLang === "ar" && !hasArabicContent(cues)) return null;
      if (targetLang === "en" && !hasEnglishContent(cues)) return null;

      const score = scoreTrackQuality(cues, entry.url);
      if (score <= 0) return null;

      return {
        id: `${providerTag}-${idx + 1}`,
        label:
          providerTag === "os-v3"
            ? `OpenSubtitles #${idx + 1}`
            : `OS Archive #${idx + 1}`,
        source: providerTag,
        cues,
        score,
        fingerprint: makeFingerprint(cues),
      } satisfies ScoredTrack;
    })
  );

  return fetched.filter((t): t is ScoredTrack => t !== null);
}

async function fetchFromSubtitleCat(
  episode: number,
  targetLang: "en" | "ar"
): Promise<ScoredTrack[]> {
  const ep2 = String(episode).padStart(2, "0");
  const searchUrls = [
    `https://www.subtitlecat.com/?search=dororo+2019+ep${ep2}`,
    `https://www.subtitlecat.com/?search=dororo+2019+s01e${ep2}`,
    `https://www.subtitlecat.com/?search=dororo&show=1000`,
  ];

  const foundPages: Array<{ path: string; title: string; rank: number }> = [];
  const seenPaths = new Set<string>();

  for (const searchUrl of searchUrls) {
    const html = await fetchTextWithTimeout(searchUrl, 6500, false);
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
      if (
        lower.includes("web") ||
        lower.includes("amzn") ||
        lower.includes("prime")
      ) {
        rank += 6;
      }
      if (lower.includes("multi-subs")) rank += 2;
      if (lower.includes("1080p")) rank += 1;
      foundPages.push({ path, title, rank });
    }

    if (foundPages.length >= 3) break;
  }

  if (foundPages.length === 0) return [];
  foundPages.sort((a, b) => b.rank - a.rank);

  const results = await Promise.all(
    foundPages.slice(0, 3).map(async (page, idx) => {
      const detailHtml = await fetchTextWithTimeout(
        `https://www.subtitlecat.com${page.path}`,
        6500,
        false
      );
      if (!detailHtml) return null;

      const srtRegex = /href="(\/subs\/[^"]+\.srt)"/gi;
      const srtLinks: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = srtRegex.exec(detailHtml)) !== null) {
        srtLinks.push(m[1]);
      }
      if (srtLinks.length === 0) return null;

      const langSuffix = targetLang === "ar" ? /-ar\.srt$/i : /-en\.srt$/i;
      let chosen = srtLinks.find((href) => langSuffix.test(href));

      if (!chosen && targetLang === "en") {
        chosen =
          srtLinks.find((href) => !/-[a-z]{2}(-[A-Z]{2})?\.srt$/i.test(href)) ??
          srtLinks[0];
      }
      if (!chosen) return null;

      const srtText = await fetchTextWithTimeout(
        `https://www.subtitlecat.com${chosen}`,
        7500,
        targetLang === "ar"
      );
      if (!srtText) return null;

      const cues = parseSubtitleText(srtText, targetLang === "ar");
      if (targetLang === "ar" && !hasArabicContent(cues)) return null;
      if (targetLang === "en" && !hasEnglishContent(cues)) return null;

      const score = scoreTrackQuality(cues, page.title);
      if (score <= 0) return null;

      const isWeb = /web|amzn|prime/i.test(page.title);
      return {
        id: `sc-${idx + 1}`,
        label: isWeb ? "SubtitleCat WEB" : `SubtitleCat #${idx + 1}`,
        source: "subtitlecat",
        cues,
        score,
        fingerprint: makeFingerprint(cues),
      } satisfies ScoredTrack;
    })
  );

  return results.filter((t): t is ScoredTrack => t !== null);
}

async function callGoogleTranslateGtx(payload: string): Promise<string | null> {
  const endpoints = [
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t",
    "https://clients5.google.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=ar&dt=t",
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": FETCH_HEADERS["User-Agent"],
        },
        body: new URLSearchParams({ q: payload }).toString(),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Array<Array<[string, string]>>;
      const segments = Array.isArray(data?.[0]) ? data[0] : [];
      const combined = segments.map((seg) => seg[0] ?? "").join("");
      if (combined.trim()) return combined;
    } catch {
      // try next mirror
    }
  }
  return null;
}

async function translateBatchToArabic(
  lines: string[],
  depth = 0
): Promise<string[]> {
  if (lines.length === 0) return [];

  const singleLines = lines.map((t) => t.replace(/\n+/g, " / ").trim());
  const payload = singleLines.join("\n");

  const combined = await callGoogleTranslateGtx(payload);
  if (combined) {
    const split = combined.split("\n");
    if (split.length === singleLines.length) {
      return split.map((line, i) => {
        const cleaned = normalizeArabicCueText(line.replace(/\s*\/\s*/g, "\n"));
        return cleaned || lines[i];
      });
    }

    if (lines.length > 1 && depth < 2) {
      const mid = Math.ceil(lines.length / 2);
      const left = await translateBatchToArabic(lines.slice(0, mid), depth + 1);
      const right = await translateBatchToArabic(lines.slice(mid), depth + 1);
      return [...left, ...right];
    }

    return singleLines.map((orig, i) => {
      const cand = split[i]
        ? normalizeArabicCueText(split[i].replace(/\s*\/\s*/g, "\n"))
        : "";
      return cand || normalizeArabicCueText(combined) || orig;
    });
  }

  return lines;
}

async function translateCuesToArabic(cues: SubtitleCue[]): Promise<SubtitleCue[]> {
  // Paced 2-concurrency batching prevents Google 429 rate-limits on Vercel IPs
  const BATCH_SIZE = 28;
  const batches: SubtitleCue[][] = [];
  for (let i = 0; i < cues.length; i += BATCH_SIZE) {
    batches.push(cues.slice(i, i + BATCH_SIZE));
  }

  const CONCURRENCY = 2;
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

function deduplicateAndRank(tracks: ScoredTrack[]): ScoredTrack[] {
  const sorted = [...tracks].sort(
    (a, b) => b.score - a.score || b.cues.length - a.cues.length
  );
  const seen = new Set<string>();
  const unique: ScoredTrack[] = [];

  for (const t of sorted) {
    if (seen.has(t.fingerprint)) continue;
    seen.add(t.fingerprint);
    unique.push(t);
  }
  return unique;
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

  // Query 3 independent keyless APIs in parallel
  const [osV3, osLegacy, subCat] = await Promise.all([
    fetchFromOpenSubtitlesEndpoint(
      "https://opensubtitles-v3.strem.io",
      "os-v3",
      episode,
      lang
    ),
    fetchFromOpenSubtitlesEndpoint(
      "https://opensubtitles.strem.io",
      "os-legacy",
      episode,
      lang
    ),
    fetchFromSubtitleCat(episode, lang),
  ]);

  let ranked = deduplicateAndRank([...osV3, ...osLegacy, ...subCat]);

  // For Arabic: if we don't have a high-scoring WEB-timed track (or < 2 options),
  // also translate the best WEB-timed English track so there is ALWAYS a complete WEB-synced Arabic option
  if (lang === "ar") {
    const hasStrongNative = ranked.some(
      (t) => t.score >= 85 && t.cues.length >= 160
    );

    if (!hasStrongNative || ranked.length < 2) {
      const [enOsV3, enSubCat] = await Promise.all([
        fetchFromOpenSubtitlesEndpoint(
          "https://opensubtitles-v3.strem.io",
          "os-v3",
          episode,
          "en"
        ),
        fetchFromSubtitleCat(episode, "en"),
      ]);
      const bestEnList = deduplicateAndRank([...enOsV3, ...enSubCat]);
      const bestEn = bestEnList[0];

      if (bestEn && bestEn.cues.length > 0) {
        const arabicCues = await translateCuesToArabic(bestEn.cues);
        if (arabicCues.length > 0) {
          const translatedTrack: ScoredTrack = {
            id: "web-translated-ar",
            label: "WEB Sync (Auto-AR)",
            source: `translated-${bestEn.source}`,
            cues: arabicCues,
            // Prioritize WEB-translated track if no strong native track exists
            score: hasStrongNative ? bestEn.score - 5 : bestEn.score + 10,
            fingerprint: makeFingerprint(arabicCues),
          };
          ranked = deduplicateAndRank([...ranked, translatedTrack]);
        }
      }
    }
  }

  // Keep up to 4 cleanest distinct tracks so user can instant-switch if one release differs in timing
  const topTracks: SubtitleTrack[] = ranked.slice(0, 4).map((t, i) => ({
    id: t.id,
    label: `Track ${i + 1} · ${t.label}`,
    source: t.source,
    count: t.cues.length,
    cues: t.cues,
  }));

  const primary = topTracks[0] ?? null;

  return NextResponse.json(
    {
      episode,
      lang,
      source: primary?.source ?? "none",
      count: primary?.count ?? 0,
      cues: primary?.cues ?? [],
      tracks: topTracks,
    },
    {
      headers: {
        "Cache-Control":
          topTracks.length > 0
            ? "public, s-maxage=604800, stale-while-revalidate=86400"
            : "public, s-maxage=1800",
      },
    }
  );
}
