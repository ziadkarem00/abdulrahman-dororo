import { NextRequest, NextResponse } from "next/server";
import { DORORO_IMDB_ID, TOTAL_EPISODES } from "@/lib/dororo-data";
import {
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

async function fetchTextWithTimeout(url: string, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function matchesDororoEpisode(title: string, episode: number): boolean {
  const lower = title.toLowerCase();
  if (!lower.includes("dororo")) return false;
  // Avoid matching the 1969 black-and-white series
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
): Promise<SubtitleCue[] | null> {
  const ep2 = String(episode).padStart(2, "0");
  const searchUrls = [
    `https://www.subtitlecat.com/?search=dororo+2019+s01e${ep2}`,
    `https://www.subtitlecat.com/?search=dororo+2019+ep${ep2}`,
    `https://www.subtitlecat.com/?search=dororo&show=1000`,
  ];

  let detailPath: string | null = null;

  for (const searchUrl of searchUrls) {
    const html = await fetchTextWithTimeout(searchUrl, 7000);
    if (!html) continue;

    // Extract anchor links to /subs/...html
    const linkRegex = /href="(\/subs\/[^"]+\.html)"[^>]*>([^<]+)<\/a>/gi;
    let match: RegExpExecArray | null;
    const candidates: Array<{ path: string; score: number }> = [];

    while ((match = linkRegex.exec(html)) !== null) {
      const path = match[1];
      const title = match[2];
      if (!matchesDororoEpisode(title, episode)) continue;

      let score = 1;
      const lower = title.toLowerCase();
      if (lower.includes("2019")) score += 4;
      if (lower.includes("bdrip") || lower.includes("web") || lower.includes("1080p")) {
        score += 2;
      }
      if (lower.includes("arid")) score += 2;
      candidates.push({ path, score });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      detailPath = candidates[0].path;
      break;
    }
  }

  if (!detailPath) return null;

  const detailHtml = await fetchTextWithTimeout(
    `https://www.subtitlecat.com${detailPath}`,
    7000
  );
  if (!detailHtml) return null;

  // SubtitleCat exposes direct .srt links like href="/subs/1738/...-ar.srt" or "-en.srt"
  const srtRegex = /href="(\/subs\/[^"]+\.srt)"/gi;
  const srtLinks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = srtRegex.exec(detailHtml)) !== null) {
    srtLinks.push(m[1]);
  }

  if (srtLinks.length === 0) return null;

  const langSuffix = targetLang === "ar" ? /-ar\.srt$/i : /-en\.srt$/i;
  let chosen = srtLinks.find((href) => langSuffix.test(href));

  // For English, fall back to the original/un-suffixed .srt if it's English
  if (!chosen && targetLang === "en") {
    chosen =
      srtLinks.find((href) => !/-[a-z]{2}(-[A-Z]{2})?\.srt$/i.test(href)) ??
      srtLinks[0];
  }

  if (!chosen) return null;

  const srtText = await fetchTextWithTimeout(
    `https://www.subtitlecat.com${chosen}`,
    8000
  );
  if (!srtText) return null;

  const cues = parseSubtitleText(srtText, targetLang === "ar");
  if (targetLang === "ar" && !hasArabicContent(cues)) return null;
  if (targetLang === "en" && !hasEnglishContent(cues)) return null;
  return cues;
}

async function fetchFromOpenSubtitles(
  episode: number,
  targetLang: "en" | "ar"
): Promise<SubtitleCue[] | null> {
  const url = `https://opensubtitles-v3.strem.io/subtitles/series/${DORORO_IMDB_ID}:1:${episode}.json`;
  const raw = await fetchTextWithTimeout(url, 7000);
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

  for (const entry of matching.slice(0, 3)) {
    if (!entry.url) continue;
    const srtText = await fetchTextWithTimeout(entry.url, 8000);
    if (!srtText) continue;

    const cues = parseSubtitleText(srtText, targetLang === "ar");
    if (targetLang === "ar" && hasArabicContent(cues)) return cues;
    if (targetLang === "en" && hasEnglishContent(cues)) return cues;
  }

  return null;
}

async function translateBatchToArabic(lines: string[]): Promise<string[]> {
  if (lines.length === 0) return [];

  // Flatten multi-line cues into single-line placeholders so newline count stays 1:1
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
      return split.map((line) =>
        normalizeArabicCueText(line.replace(/\s*\/\s*/g, "\n"))
      );
    }

    // If line count drifted, split batch in half and recurse cleanly
    if (lines.length > 1) {
      const mid = Math.ceil(lines.length / 2);
      const [left, right] = await Promise.all([
        translateBatchToArabic(lines.slice(0, mid)),
        translateBatchToArabic(lines.slice(mid)),
      ]);
      return [...left, ...right];
    }

    return [normalizeArabicCueText(combined)];
  } catch {
    if (lines.length > 1) {
      const mid = Math.ceil(lines.length / 2);
      const [left, right] = await Promise.all([
        translateBatchToArabic(lines.slice(0, mid)),
        translateBatchToArabic(lines.slice(mid)),
      ]);
      return [...left, ...right];
    }
    return lines;
  }
}

async function translateCuesToArabic(cues: SubtitleCue[]): Promise<SubtitleCue[]> {
  const BATCH_SIZE = 32;
  const batches: SubtitleCue[][] = [];
  for (let i = 0; i < cues.length; i += BATCH_SIZE) {
    batches.push(cues.slice(i, i + BATCH_SIZE));
  }

  const CONCURRENCY = 4;
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const epParam = Number(searchParams.get("ep") ?? "1");
  const langParam = (searchParams.get("lang") ?? "ar").toLowerCase();

  const episode = Math.max(
    1,
    Math.min(TOTAL_EPISODES, Number.isFinite(epParam) ? Math.floor(epParam) : 1)
  );
  const lang: "ar" | "en" = langParam === "en" ? "en" : "ar";

  // Query OpenSubtitles v3 and SubtitleCat in parallel for fastest response
  const [osNative, scNative] = await Promise.all([
    fetchFromOpenSubtitles(episode, lang),
    fetchFromSubtitleCat(episode, lang),
  ]);

  const nativeCues = osNative ?? scNative;
  if (nativeCues && nativeCues.length > 0) {
    return NextResponse.json(
      {
        episode,
        lang,
        source: osNative ? "opensubtitles" : "subtitlecat",
        cues: nativeCues,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=604800, stale-while-revalidate=86400",
        },
      }
    );
  }

  // If Arabic was requested and no native Arabic track existed, pull English and translate server-side
  if (lang === "ar") {
    const [osEn, scEn] = await Promise.all([
      fetchFromOpenSubtitles(episode, "en"),
      fetchFromSubtitleCat(episode, "en"),
    ]);
    const englishCues = osEn ?? scEn;

    if (englishCues && englishCues.length > 0) {
      const arabicCues = await translateCuesToArabic(englishCues);
      if (arabicCues.length > 0) {
        return NextResponse.json(
          {
            episode,
            lang: "ar",
            source: "translated",
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

  return NextResponse.json(
    {
      episode,
      lang,
      source: "none",
      cues: [],
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600",
      },
    }
  );
}
