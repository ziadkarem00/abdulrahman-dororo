import { NextRequest, NextResponse } from "next/server";
import { DORORO_IMDB_ID, TOTAL_EPISODES } from "@/lib/dororo-data";
import {
  analyzeRelease,
  formatCandidateLabel,
  validateEpisodeMatch,
} from "@/lib/release-matcher";
import {
  decodeSubtitleBuffer,
  hasArabicContent,
  hasEnglishContent,
  parseSubtitleText,
} from "@/lib/subtitles";
import type {
  ServerId,
  SubtitleCandidateMeta,
  SubtitleCue,
  SubtitleTrackResponse,
} from "@/types/dororo";

export const runtime = "nodejs";
export const maxDuration = 30;

const SUBDL_API_BASE = "https://api.subdl.com";
const SUBDL_DL_BASE = "https://dl.subdl.com";

// Validation-friendly server cache TTL (30 min in-memory, 1 hour CDN edge)
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000;

interface SubdlFileEntry {
  name?: string;
  file_name?: string;
  url?: string;
  download_url?: string;
  episode?: number | null;
  season?: number | null;
  n_id?: string;
}

interface SubdlSubtitleItem {
  release_name?: string;
  name?: string;
  lang?: string;
  language?: string;
  url?: string;
  download_url?: string;
  n_id?: string;
  nId?: string;
  hi?: boolean | number;
  author?: string;
  comment?: string;
  season?: number | null;
  episode?: number | null;
  episode_from?: number | null;
  episode_end?: number | null;
  full_season?: boolean;
  files?: SubdlFileEntry[];
  unpacked_files?: SubdlFileEntry[];
}

interface InternalCandidate {
  meta: SubtitleCandidateMeta;
  downloadUrl: string;
  nId?: string;
  requiresBearer: boolean;
}

interface SearchCacheEntry {
  expiresAt: number;
  candidates: InternalCandidate[];
}

interface CuesCacheEntry {
  expiresAt: number;
  cues: SubtitleCue[];
}

const searchCache = new Map<string, SearchCacheEntry>();
const cuesCache = new Map<string, CuesCacheEntry>();

function normalizeSubdlUrl(rawUrl: string): string {
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const trimmed = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  if (trimmed.startsWith("/api/")) {
    return `${SUBDL_API_BASE}${trimmed}`;
  }
  return `${SUBDL_DL_BASE}${trimmed}`;
}

function matchesTargetLanguage(
  rawLang: string | undefined,
  target: "en" | "ar"
): boolean {
  const code = (rawLang ?? "").trim().toLowerCase();
  if (target === "ar") {
    return code === "ar" || code === "ara" || code === "arb" || code.includes("arab");
  }
  return code === "en" || code === "eng" || code.includes("english");
}

async function fetchBufferWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 8000
): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PHASE 1: Official SubDL API v2 search with unpack=1.
 * Retrieves individual episode files (including unpacked season packs),
 * retains release_name & metadata, and ranks by release compatibility.
 */
async function searchSubdlCandidates(
  episode: number,
  targetLang: "en" | "ar"
): Promise<{ candidates: InternalCandidate[]; error?: string }> {
  const apiKey = process.env.SUBDL_API_KEY?.trim();
  if (!apiKey) {
    return { candidates: [], error: "SUBDL_API_KEY not configured" };
  }

  const searchUrl = new URL(`${SUBDL_API_BASE}/api/v2/subtitles/search`);
  searchUrl.searchParams.set("imdb_id", DORORO_IMDB_ID);
  searchUrl.searchParams.set("season", "1");
  searchUrl.searchParams.set("episode", String(episode));
  searchUrl.searchParams.set("languages", "en,ar");
  searchUrl.searchParams.set("unpack", "1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);

  let payload: { status?: boolean; subtitles?: SubdlSubtitleItem[]; error?: { message?: string } } | null =
    null;

  try {
    const res = await fetch(searchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": "Abdulrahman-Dororo/2.0",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      return { candidates: [], error: `SubDL API HTTP ${res.status}` };
    }

    payload = (await res.json()) as {
      status?: boolean;
      subtitles?: SubdlSubtitleItem[];
      error?: { message?: string };
    };
  } catch {
    return { candidates: [], error: "SubDL API request failed" };
  } finally {
    clearTimeout(timer);
  }

  const items = Array.isArray(payload?.subtitles) ? payload.subtitles : [];
  const results: InternalCandidate[] = [];
  const seenKeys = new Set<string>();

  for (const item of items) {
    const rawLang = item.lang ?? item.language;
    if (!matchesTargetLanguage(rawLang, targetLang)) continue;

    const parentRelease = item.release_name ?? item.name ?? "";
    const unpackedList = Array.isArray(item.files)
      ? item.files
      : Array.isArray(item.unpacked_files)
      ? item.unpacked_files
      : [];

    // Case A: Season pack expanded by unpack=1 into per-episode files
    if (unpackedList.length > 0) {
      for (const file of unpackedList) {
        const fileName = file.file_name ?? file.name ?? "";
        const rawUrl = file.download_url ?? file.url;
        if (!rawUrl) continue;

        // Only accept actual subtitle files matching the exact requested episode
        if (/\.(zip|rar|7z|nfo|txt)$/i.test(fileName)) continue;
        const epCheck = validateEpisodeMatch(
          fileName || parentRelease,
          episode,
          file.episode,
          file.season ?? item.season,
          false
        );
        if (!epCheck.matched || epCheck.isSeasonPack) continue;

        const fullRelease = fileName
          ? `${parentRelease ? `${parentRelease} — ` : ""}${fileName}`
          : parentRelease;

        const analysis = analyzeRelease(fullRelease, episode, {
          hi: Boolean(item.hi),
          comment: item.comment,
          author: item.author,
          explicitEpisode: file.episode ?? episode,
          explicitSeason: file.season ?? item.season ?? 1,
          isFullSeason: false,
          provider: "subdl",
        });

        const downloadUrl = normalizeSubdlUrl(rawUrl);
        if (seenKeys.has(downloadUrl)) continue;
        seenKeys.add(downloadUrl);

        results.push({
          meta: {
            id: `subdl-${targetLang}-${results.length + 1}`,
            label: formatCandidateLabel(analysis, results.length, "subdl"),
            releaseName: analysis.releaseName,
            releaseGroup: analysis.releaseGroup,
            sourceType: analysis.sourceType,
            provider: "subdl",
            isHumanCreated: analysis.isHumanCreated,
            isHearingImpaired: analysis.isHearingImpaired,
            compatibilityScore: analysis.compatibilityScore,
            loaded: false,
          },
          downloadUrl,
          nId: file.n_id ?? item.n_id ?? item.nId,
          requiresBearer: downloadUrl.startsWith(SUBDL_API_BASE),
        });
      }
      continue;
    }

    // Case B: Direct single-episode entry (or direct download via nId)
    const rawUrl = item.download_url ?? item.url;
    const nId = item.n_id ?? item.nId;
    if (!rawUrl && !nId) continue;

    // Skip raw un-unpacked zip archives if no file-level URL is provided
    if (rawUrl && /\.zip$/i.test(rawUrl) && !nId) continue;

    const analysis = analyzeRelease(parentRelease, episode, {
      hi: Boolean(item.hi),
      comment: item.comment,
      author: item.author,
      explicitEpisode: item.episode,
      explicitSeason: item.season,
      isFullSeason: item.full_season,
      provider: "subdl",
    });

    if (!analysis.isEpisodeMatch) continue;

    const downloadUrl = rawUrl
      ? normalizeSubdlUrl(rawUrl)
      : `${SUBDL_API_BASE}/api/v2/subtitles/${encodeURIComponent(
          nId!
        )}/download?format=file`;

    if (seenKeys.has(downloadUrl)) continue;
    seenKeys.add(downloadUrl);

    results.push({
      meta: {
        id: `subdl-${targetLang}-${results.length + 1}`,
        label: formatCandidateLabel(analysis, results.length, "subdl"),
        releaseName: analysis.releaseName,
        releaseGroup: analysis.releaseGroup,
        sourceType: analysis.sourceType,
        provider: "subdl",
        isHumanCreated: analysis.isHumanCreated,
        isHearingImpaired: analysis.isHearingImpaired,
        compatibilityScore: analysis.compatibilityScore,
        loaded: false,
      },
      downloadUrl,
      nId,
      requiresBearer: downloadUrl.startsWith(SUBDL_API_BASE),
    });
  }

  results.sort((a, b) => b.meta.compatibilityScore - a.meta.compatibilityScore);
  return { candidates: results.slice(0, 6) };
}

/**
 * Secondary fallback provider (OpenSubtitles v3 Stremio endpoint).
 * Only invoked when SubDL is unconfigured, unavailable, or returns zero compatible tracks.
 * Never silently returns an incompatible or wrong-language subtitle.
 */
async function searchOpenSubtitlesFallback(
  episode: number,
  targetLang: "en" | "ar"
): Promise<InternalCandidate[]> {
  const url = `https://opensubtitles-v3.strem.io/subtitles/series/${DORORO_IMDB_ID}:1:${episode}.json`;
  const buf = await fetchBufferWithTimeout(
    url,
    {
      Accept: "application/json",
      "User-Agent": "Abdulrahman-Dororo/2.0",
    },
    6500
  );
  if (!buf) return [];

  let parsed: { subtitles?: Array<{ url?: string; lang?: string; id?: string }> };
  try {
    parsed = JSON.parse(new TextDecoder("utf-8").decode(buf)) as {
      subtitles?: Array<{ url?: string; lang?: string; id?: string }>;
    };
  } catch {
    return [];
  }

  const list = Array.isArray(parsed.subtitles) ? parsed.subtitles : [];
  const matching = list.filter(
    (s) => s.url && matchesTargetLanguage(s.lang, targetLang)
  );

  const candidates: InternalCandidate[] = [];
  for (let i = 0; i < Math.min(matching.length, 4); i++) {
    const entry = matching[i];
    if (!entry.url) continue;

    const releaseHint = `Dororo S01E${String(episode).padStart(2, "0")} (OpenSubtitles #${
      i + 1
    })`;
    const analysis = analyzeRelease(releaseHint, episode, {
      explicitEpisode: episode,
      explicitSeason: 1,
      provider: "opensubtitles",
    });

    candidates.push({
      meta: {
        id: `os-${targetLang}-${i + 1}`,
        label: `OpenSubtitles #${i + 1} (Fallback)`,
        releaseName: releaseHint,
        releaseGroup: analysis.releaseGroup,
        sourceType: analysis.sourceType,
        provider: "opensubtitles",
        isHumanCreated: analysis.isHumanCreated,
        isHearingImpaired: analysis.isHearingImpaired,
        compatibilityScore: analysis.compatibilityScore,
        loaded: false,
      },
      downloadUrl: entry.url,
      requiresBearer: false,
    });
  }

  return candidates;
}

async function downloadAndValidateCandidate(
  candidate: InternalCandidate,
  targetLang: "en" | "ar"
): Promise<SubtitleCue[] | null> {
  const cacheKey = `${candidate.downloadUrl}:${targetLang}`;
  const cached = cuesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.cues;
  }

  const headers: Record<string, string> = {
    Accept: "text/vtt,text/plain,*/*",
    "User-Agent": "Abdulrahman-Dororo/2.0",
  };
  const apiKey = process.env.SUBDL_API_KEY?.trim();
  if (candidate.requiresBearer && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let buf = await fetchBufferWithTimeout(candidate.downloadUrl, headers, 8500);

  // If direct URL failed and candidate has an nId, try official SubDL v2 download endpoint
  if (!buf && candidate.nId && apiKey) {
    const dlUrl = `${SUBDL_API_BASE}/api/v2/subtitles/${encodeURIComponent(
      candidate.nId
    )}/download?format=file`;
    buf = await fetchBufferWithTimeout(
      dlUrl,
      { ...headers, Authorization: `Bearer ${apiKey}` },
      8500
    );
  }

  if (!buf || buf.byteLength < 64) return null;

  // Guard against accidental ZIP binary responses (PK\x03\x04)
  const magic = new Uint8Array(buf.slice(0, 4));
  if (magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04) {
    return null;
  }

  const decoded = decodeSubtitleBuffer(buf, targetLang === "ar");
  // Preserve original timestamps verbatim; normalize Arabic RTL punctuation only
  const cues = parseSubtitleText(decoded, targetLang === "ar");

  // Strict language validation — never serve English under Arabic CC or vice versa
  if (cues.length < 25) return null;
  if (targetLang === "ar" && !hasArabicContent(cues)) return null;
  if (targetLang === "en" && !hasEnglishContent(cues)) return null;

  cuesCache.set(cacheKey, {
    expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
    cues,
  });

  return cues;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const epParam = Number(searchParams.get("ep") ?? "1");
  const langParam = (searchParams.get("lang") ?? "ar").toLowerCase();
  const serverParam = (searchParams.get("server") ?? "primary") as ServerId;
  const requestedTrackId = searchParams.get("trackId")?.trim() || null;

  const episode = Math.max(
    1,
    Math.min(TOTAL_EPISODES, Number.isFinite(epParam) ? Math.floor(epParam) : 1)
  );
  const lang: "ar" | "en" = langParam === "en" ? "en" : "ar";
  const server: ServerId =
    serverParam === "mal-mirror" || serverParam === "dub"
      ? serverParam
      : "primary";

  // 1. Lookup or run release-aware search (cached 30m server-side to protect SubDL quota)
  const searchKey = `${episode}:${lang}`;
  let candidates: InternalCandidate[] = [];
  let warning: string | undefined;

  const cachedSearch = searchCache.get(searchKey);
  if (cachedSearch && cachedSearch.expiresAt > Date.now()) {
    candidates = cachedSearch.candidates;
  } else {
    const subdlRes = await searchSubdlCandidates(episode, lang);
    candidates = subdlRes.candidates;
    if (subdlRes.error) {
      warning = subdlRes.error;
    }

    // Secondary fallback only when SubDL has no compatible candidates
    if (candidates.length === 0) {
      const fallbackCandidates = await searchOpenSubtitlesFallback(episode, lang);
      candidates = fallbackCandidates;
    }

    if (candidates.length > 0) {
      searchCache.set(searchKey, {
        expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
        candidates,
      });
    }
  }

  // 2. Download & validate the requested track (or walk ranked candidates until one validates)
  let selected: InternalCandidate | null = null;
  let validatedCues: SubtitleCue[] = [];

  if (requestedTrackId) {
    const match = candidates.find((c) => c.meta.id === requestedTrackId);
    if (match) {
      const cues = await downloadAndValidateCandidate(match, lang);
      if (cues) {
        selected = match;
        validatedCues = cues;
      }
    }
  } else {
    // Try ranked candidates in release-compatibility order (stops on first valid download to save quota)
    for (const cand of candidates.slice(0, 3)) {
      const cues = await downloadAndValidateCandidate(cand, lang);
      if (cues) {
        selected = cand;
        validatedCues = cues;
        break;
      }
    }
  }

  const candidateMetas: SubtitleCandidateMeta[] = candidates.map((c) => ({
    ...c.meta,
    loaded: selected?.meta.id === c.meta.id,
    cueCount: selected?.meta.id === c.meta.id ? validatedCues.length : c.meta.cueCount,
  }));

  const body: SubtitleTrackResponse = {
    episode,
    lang,
    server,
    provider: selected?.meta.provider ?? "none",
    selectedTrackId: selected?.meta.id ?? null,
    selectedReleaseName: selected?.meta.releaseName ?? null,
    cues: validatedCues,
    candidates: candidateMetas,
    ...(warning && !selected ? { warning } : {}),
  };

  // Validation-friendly cache policy (1 hour instead of 7 days so fixes propagate rapidly)
  return NextResponse.json(body, {
    headers: {
      "Cache-Control":
        validatedCues.length > 0
          ? "public, s-maxage=3600, stale-while-revalidate=600"
          : "no-store",
    },
  });
}
