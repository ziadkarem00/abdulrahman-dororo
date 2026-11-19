import type { ReleaseSourceType } from "@/types/dororo";

export interface ReleaseAnalysis {
  releaseName: string;
  releaseGroup: string;
  sourceType: ReleaseSourceType;
  isHumanCreated: boolean;
  isHearingImpaired: boolean;
  isEpisodeMatch: boolean;
  isSeasonPack: boolean;
  compatibilityScore: number;
}

const MACHINE_TRANSLATION_REGEX =
  /\b(machine[\s._-]?trans|auto[\s._-]?trans|google[\s._-]?trans|deepl|ai[\s._-]?trans|mt[\s._-]?sub|translated\s+from)\b/i;

const KNOWN_GROUPS: Array<{ pattern: RegExp; name: string; bonus: number }> = [
  { pattern: /horriblesubs/i, name: "HorribleSubs", bonus: 26 },
  { pattern: /subsplease/i, name: "SubsPlease", bonus: 24 },
  { pattern: /erai[\s._-]?raws/i, name: "Erai-raws", bonus: 22 },
  { pattern: /\bamzn\b|amazon|prime/i, name: "AMZN", bonus: 25 },
  { pattern: /arid/i, name: "Arid", bonus: 14 },
  { pattern: /judas|ember|cleo|asw/i, name: "Anime-Rip", bonus: 10 },
];

/**
 * Validates that a release name or filename belongs to Dororo (2019)
 * and matches the requested episode number (or is a valid S01 season pack).
 */
export function validateEpisodeMatch(
  releaseName: string,
  episode: number,
  explicitEpisode?: number | null,
  explicitSeason?: number | null,
  isFullSeason?: boolean
): { matched: boolean; isSeasonPack: boolean } {
  const lower = releaseName.toLowerCase();

  // Reject 1969 original black-and-white series
  if (lower.includes("1969")) {
    return { matched: false, isSeasonPack: false };
  }

  // Reject wrong season if explicitly specified
  if (
    typeof explicitSeason === "number" &&
    explicitSeason > 0 &&
    explicitSeason !== 1
  ) {
    return { matched: false, isSeasonPack: false };
  }

  // Exact numeric episode metadata from SubDL API
  if (typeof explicitEpisode === "number" && explicitEpisode > 0) {
    return {
      matched: explicitEpisode === episode,
      isSeasonPack: false,
    };
  }

  // Check for season pack ranges like [01-24], E01-24, 01~24, S01 Complete
  const packRange =
    /\[0?1[\s~-]+24\]|e0?1[\s~-]+e?24|s0?1(?:\s|$|\.)(?:complete|full|batch|japanese)/i.test(
      lower
    );

  // Check if filename explicitly mentions a DIFFERENT single episode
  const sxeMatch = lower.match(/s0?1\s*e(\d{1,2})(?!\s*[-~]\s*e?\d)/i);
  if (sxeMatch) {
    return {
      matched: Number(sxeMatch[1]) === episode,
      isSeasonPack: false,
    };
  }

  const epWordMatch = lower.match(/\bep\.?\s*(\d{1,2})(?!\s*[-~]\s*\d)/i);
  if (epWordMatch) {
    return {
      matched: Number(epWordMatch[1]) === episode,
      isSeasonPack: false,
    };
  }

  const dashEpMatch = lower.match(/\s-\s0?(\d{1,2})(?:\s|\[|\.|$)/);
  if (dashEpMatch) {
    return {
      matched: Number(dashEpMatch[1]) === episode,
      isSeasonPack: false,
    };
  }

  // Explicit single-episode match via padded number (e.g. "01", "06", "12", "18", "24")
  const ep2 = String(episode).padStart(2, "0");
  if (
    new RegExp(`(?:^|[\\s._\\[\\(-])(?:e|ep)?${ep2}(?:[\\s._\\]\\)-]|$)`, "i").test(
      lower
    ) &&
    !packRange
  ) {
    return { matched: true, isSeasonPack: false };
  }

  if (isFullSeason || packRange) {
    return { matched: true, isSeasonPack: true };
  }

  // If SubDL already filtered by imdb_id + season=1 + episode=N, allow clean title-only names
  if (lower.includes("dororo") && !/\b\d{2}\b/.test(lower)) {
    return { matched: true, isSeasonPack: false };
  }

  return { matched: false, isSeasonPack: false };
}

/**
 * Classifies a subtitle release by source type (AMZN / WEB / Blu-ray / TV),
 * release group, human-translation status, and compatibility score for streaming playback.
 */
export function analyzeRelease(
  releaseName: string,
  episode: number,
  options?: {
    hi?: boolean;
    comment?: string;
    author?: string;
    explicitEpisode?: number | null;
    explicitSeason?: number | null;
    isFullSeason?: boolean;
    provider?: "subdl" | "opensubtitles";
  }
): ReleaseAnalysis {
  const cleanName = releaseName.trim() || `Dororo S01E${String(episode).padStart(2, "0")}`;
  const combinedText = `${cleanName} ${options?.comment ?? ""} ${options?.author ?? ""}`;
  const lower = combinedText.toLowerCase();

  const { matched, isSeasonPack } = validateEpisodeMatch(
    cleanName,
    episode,
    options?.explicitEpisode,
    options?.explicitSeason,
    options?.isFullSeason
  );

  // Detect source type (AMZN / WEB-DL / WEBRip vs Blu-ray vs TV)
  let sourceType: ReleaseSourceType = "Unknown";
  let sourceScore = 10;

  if (/\bamzn\b|amazon|prime/i.test(lower)) {
    sourceType = "AMZN";
    sourceScore = 44;
  } else if (
    /\bweb[\s._-]?dl\b|\bwebrip\b|\bweb[\s._-]?rip\b|\[web\]|\bweb\b/i.test(lower)
  ) {
    sourceType = "WEB";
    sourceScore = 42;
  } else if (/horriblesubs|subsplease/i.test(lower)) {
    // HorribleSubs & SubsPlease are simulcast WEB rips matching standard anime streams
    sourceType = "WEB";
    sourceScore = 40;
  } else if (/blu[\s._-]?ray|\bbdrip\b|\bbd[\s._-]?remux\b|\bbd\b/i.test(lower)) {
    sourceType = "Blu-ray";
    sourceScore = 24;
  } else if (/\bhdtv\b|\btvrip\b/i.test(lower)) {
    sourceType = "TV";
    sourceScore = 14;
  }

  // Detect release group
  let releaseGroup = "";
  let groupScore = 0;
  for (const grp of KNOWN_GROUPS) {
    if (grp.pattern.test(cleanName)) {
      releaseGroup = grp.name;
      groupScore = grp.bonus;
      break;
    }
  }

  // Detect human-created vs machine-translated
  const isHumanCreated = !MACHINE_TRANSLATION_REGEX.test(combinedText);
  const humanBonus = isHumanCreated ? 25 : -40;

  // Detect Hearing Impaired (SDH / HI)
  const isHearingImpaired =
    Boolean(options?.hi) || /\b(sdh|hearing[\s._-]?impaired|\[hi\])\b/i.test(lower);
  const hiPenalty = isHearingImpaired ? -8 : 4;

  // Provider trust bonus (SubDL v2 has structured release_name metadata)
  const providerBonus = options?.provider === "subdl" ? 15 : 0;

  // Exact single-episode match gets a slight boost over un-extracted pack names
  const exactBonus = matched && !isSeasonPack ? 10 : matched ? 4 : -100;

  const compatibilityScore =
    sourceScore + groupScore + humanBonus + hiPenalty + providerBonus + exactBonus;

  return {
    releaseName: cleanName,
    releaseGroup,
    sourceType,
    isHumanCreated,
    isHearingImpaired,
    isEpisodeMatch: matched,
    isSeasonPack,
    compatibilityScore,
  };
}

/**
 * Formats a concise, informative track label showing release group, source type, and provider.
 */
export function formatCandidateLabel(
  analysis: ReleaseAnalysis,
  index: number,
  provider: "subdl" | "opensubtitles"
): string {
  const parts: string[] = [];
  if (analysis.releaseGroup) parts.push(analysis.releaseGroup);
  if (analysis.sourceType !== "Unknown" && analysis.sourceType !== analysis.releaseGroup) {
    parts.push(analysis.sourceType);
  }
  const tag = parts.length > 0 ? parts.join(" · ") : `Release ${index + 1}`;
  const src = provider === "subdl" ? "SubDL" : "OpenSub";
  const hiSuffix = analysis.isHearingImpaired ? " · HI" : "";
  return `${tag} (${src}${hiSuffix})`;
}
