export type ArcId =
  | "all"
  | "awakening"
  | "sengoku-roads"
  | "hidden-map"
  | "twelve-demons";

export interface StoryArc {
  id: ArcId;
  name: string;
  shortName: string;
  startEpisode: number;
  endEpisode: number;
  description: string;
}

export interface Episode {
  number: number;
  title: string;
  romajiTitle: string;
  japaneseTitle: string;
  aired: string;
  arcId: Exclude<ArcId, "all">;
  arcName: string;
  filler: boolean;
}

export type ServerId = "primary" | "mal-mirror" | "dub";

export interface EmbedCaptionOptions {
  nativeEnglish: boolean;
  captionSize?: "s" | "m" | "l" | "xl";
  captionColor?: string;
  captionBg?: 0 | 1;
}

export interface StreamServer {
  id: ServerId;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
  supportsNativeEn: boolean;
  buildUrl: (episodeNumber: number, options?: EmbedCaptionOptions) => string;
}

export type SubtitleLang = "ar" | "en" | "off";

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export type ReleaseSourceType = "WEB" | "AMZN" | "Blu-ray" | "TV" | "Unknown";

export interface SubtitleCandidateMeta {
  id: string;
  label: string;
  releaseName: string;
  releaseGroup: string;
  sourceType: ReleaseSourceType;
  provider: "subdl" | "opensubtitles";
  isHumanCreated: boolean;
  isHearingImpaired: boolean;
  compatibilityScore: number;
  loaded: boolean;
  cueCount?: number;
}

export interface SubtitleTrackResponse {
  episode: number;
  lang: "ar" | "en";
  server: ServerId;
  provider: string;
  selectedTrackId: string | null;
  selectedReleaseName: string | null;
  cues: SubtitleCue[];
  candidates: SubtitleCandidateMeta[];
  warning?: string;
}

export type SubtitleSize = "sm" | "md" | "lg" | "xl";
export type SubtitleBackground = "none" | "subtle" | "box";
export type SubtitleColor = "white" | "yellow";
export type SubtitlePosition = "low" | "standard" | "high";

export interface SubtitleStyle {
  size: SubtitleSize;
  background: SubtitleBackground;
  color: SubtitleColor;
  position: SubtitlePosition;
  offset: number;
}

export interface WatchState {
  currentEpisode: number;
  watchedEpisodes: number[];
  favoriteEpisodes: number[];
  serverId: ServerId;
  subtitleLang: SubtitleLang;
  lastUpdated: number;
}
