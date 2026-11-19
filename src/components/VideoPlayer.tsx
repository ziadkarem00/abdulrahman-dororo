"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Maximize,
  Minimize,
  Moon,
  RotateCcw,
  Server,
  SlidersHorizontal,
  Subtitles,
  Sun,
} from "lucide-react";
import { STREAM_SERVERS, TOTAL_EPISODES } from "@/lib/dororo-data";
import { findActiveCues, shiftSubtitleCues } from "@/lib/subtitles";
import type {
  Episode,
  ServerId,
  SubtitleBackground,
  SubtitleColor,
  SubtitleCue,
  SubtitleLang,
  SubtitlePosition,
  SubtitleSize,
  SubtitleStyle,
  SubtitleTrack,
} from "@/types/dororo";

const SUB_STYLE_STORAGE_KEY = "abdulrahman_dororo_sub_style_v1";
const SYNC_OFFSET_STORAGE_KEY = "abdulrahman_dororo_sync_offset_v1";
const SUB_CACHE_VERSION = "5";

const DEFAULT_SUB_STYLE: SubtitleStyle = {
  size: "md",
  background: "none",
  color: "white",
  position: "standard",
  offset: 0,
};

interface VideoPlayerProps {
  episode: Episode;
  serverId: ServerId;
  subtitleLang: SubtitleLang;
  isWatched: boolean;
  isFavorite: boolean;
  lightsOff: boolean;
  onSelectServer: (id: ServerId) => void;
  onSelectSubtitleLang: (lang: SubtitleLang) => void;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  onToggleWatched: () => void;
  onToggleFavorite: () => void;
  onToggleLightsOff: () => void;
  onAutoMarkWatched: () => void;
}

export function VideoPlayer({
  episode,
  serverId,
  subtitleLang,
  isWatched,
  isFavorite,
  lightsOff,
  onSelectServer,
  onSelectSubtitleLang,
  onPrevEpisode,
  onNextEpisode,
  onToggleWatched,
  onToggleFavorite,
  onToggleLightsOff,
  onAutoMarkWatched,
}: VideoPlayerProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);

  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  // "native" uses AnimeEmbed's stream-native English track (default on Server 1 & 2);
  // numeric index selects one of the up-to-3 external tracks ("Arabic 1/2/3" or "English 1/2/3")
  const [selectedTrackKey, setSelectedTrackKey] = useState<string>("0");
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [activeLines, setActiveLines] = useState<string[]>([]);
  const [styleOpen, setStyleOpen] = useState(false);
  const [subStyle, setSubStyle] = useState<SubtitleStyle>(DEFAULT_SUB_STYLE);
  const [syncOffset, setSyncOffset] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);

  // Zero-drift performance.now() playback clock anchored to AnimeEmbed postMessage events
  const anchorVideoTimeRef = useRef<number>(0);
  const anchorPerfTimeRef = useRef<number>(0);
  const lastReportedTimeRef = useRef<number>(-1);
  const playbackRateRef = useRef<number>(1);
  const isPlayingRef = useRef<boolean>(false);
  const hasEndedMarkedRef = useRef<boolean>(false);
  const lastRenderedKeyRef = useRef<string>("");

  const trackCacheRef = useRef<Map<string, SubtitleTrack[]>>(new Map());

  const activeServer = useMemo(
    () => STREAM_SERVERS.find((s) => s.id === serverId) ?? STREAM_SERVERS[0],
    [serverId]
  );

  // Default English on Server 1 & 2 to stream-native captions first; user can also pick English 1/2/3
  useEffect(() => {
    if (subtitleLang === "en" && activeServer.supportsNativeEn) {
      setSelectedTrackKey("native");
    } else {
      setSelectedTrackKey("0");
    }
  }, [subtitleLang, activeServer.supportsNativeEn, episode.number]);

  const useNativeEnglish =
    subtitleLang === "en" &&
    activeServer.supportsNativeEn &&
    selectedTrackKey === "native";

  const rawOverlayCues: SubtitleCue[] = useMemo(() => {
    if (useNativeEnglish || subtitleLang === "off") return [];
    const idx = Number(selectedTrackKey);
    const chosen = Number.isFinite(idx) ? tracks[idx] : tracks[0];
    return chosen?.cues ?? tracks[0]?.cues ?? [];
  }, [tracks, selectedTrackKey, useNativeEnglish, subtitleLang]);

  // Dynamically shift every cue's startTime & endTime (clamped >= 0) in real time without reloading video
  const shiftedCues: SubtitleCue[] = useMemo(
    () => shiftSubtitleCues(rawOverlayCues, syncOffset),
    [rawOverlayCues, syncOffset]
  );

  const embedUrl = useMemo(() => {
    const sizeMap: Record<SubtitleSize, "s" | "m" | "l" | "xl"> = {
      sm: "s",
      md: "m",
      lg: "l",
      xl: "xl",
    };
    return activeServer.buildUrl(episode.number, {
      nativeEnglish: useNativeEnglish,
      captionSize: sizeMap[subStyle.size],
      captionColor: subStyle.color === "yellow" ? "fde047" : "ffffff",
      captionBg: subStyle.background === "none" ? 0 : 1,
    });
  }, [
    activeServer,
    episode.number,
    useNativeEnglish,
    subStyle.size,
    subStyle.color,
    subStyle.background,
  ]);

  // Load saved subtitle style & persisted sync offset from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SUB_STYLE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SubtitleStyle>;
        setSubStyle((prev) => ({ ...prev, ...parsed }));
      }
      const savedOffset = localStorage.getItem(SYNC_OFFSET_STORAGE_KEY);
      if (savedOffset !== null) {
        const num = Number(savedOffset);
        if (Number.isFinite(num)) {
          setSyncOffset(num);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const updateSubStyle = useCallback((patch: Partial<SubtitleStyle>) => {
    setSubStyle((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SUB_STYLE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const updateSyncOffset = useCallback((nextVal: number) => {
    const rounded = Number(nextVal.toFixed(1));
    setSyncOffset(rounded);
    try {
      localStorage.setItem(SYNC_OFFSET_STORAGE_KEY, String(rounded));
    } catch {
      // ignore storage errors
    }
  }, []);

  // Close style popover on outside click
  useEffect(() => {
    if (!styleOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        styleMenuRef.current &&
        !styleMenuRef.current.contains(e.target as Node)
      ) {
        setStyleOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [styleOpen]);

  // Reset clock when episode, server, or native-vs-overlay iframe mode changes
  useEffect(() => {
    anchorVideoTimeRef.current = 0;
    anchorPerfTimeRef.current = performance.now();
    lastReportedTimeRef.current = -1;
    playbackRateRef.current = 1;
    isPlayingRef.current = false;
    hasEndedMarkedRef.current = false;
    lastRenderedKeyRef.current = "";
    setActiveLines([]);
  }, [episode.number, serverId, useNativeEnglish]);

  // Fetch up to 3 external tracks per language (Wyzie TMDB 83100 + fallbacks)
  useEffect(() => {
    if (subtitleLang === "off") {
      setTracks([]);
      setActiveLines([]);
      setLoadingSubs(false);
      return;
    }

    const cacheKey = `${episode.number}:${subtitleLang}`;
    const cached = trackCacheRef.current.get(cacheKey);
    if (cached) {
      setTracks(cached);
      setLoadingSubs(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoadingSubs(!useNativeEnglish);
    setTracks([]);
    setActiveLines([]);

    fetch(
      `/api/subtitles?ep=${episode.number}&lang=${subtitleLang}&v=${SUB_CACHE_VERSION}`,
      { signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            tracks?: SubtitleTrack[];
            cues?: SubtitleCue[];
            source?: string;
          } | null
        ) => {
          if (cancelled) return;
          let fetchedTracks: SubtitleTrack[] = Array.isArray(data?.tracks)
            ? data.tracks
            : [];
          if (
            fetchedTracks.length === 0 &&
            Array.isArray(data?.cues) &&
            data.cues.length > 0
          ) {
            fetchedTracks = [
              {
                id: "primary",
                label: subtitleLang === "ar" ? "Arabic 1" : "English 1",
                source: data.source ?? "primary",
                count: data.cues.length,
                cues: data.cues,
              },
            ];
          }
          trackCacheRef.current.set(cacheKey, fetchedTracks);
          setTracks(fetchedTracks);
        }
      )
      .catch(() => {
        if (!cancelled) setTracks([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSubs(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [episode.number, subtitleLang, useNativeEnglish]);

  // Resilient AnimeEmbed postMessage listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;

      try {
        const host = new URL(event.origin).hostname.toLowerCase();
        if (host !== "animeembed.com" && !host.endsWith(".animeembed.com")) {
          return;
        }
      } catch {
        return;
      }

      const raw = event.data;
      const msg = (
        typeof raw === "string"
          ? (() => {
              try {
                return JSON.parse(raw);
              } catch {
                return null;
              }
            })()
          : raw
      ) as {
        channel?: string;
        version?: number;
        event?: string;
        currentTime?: number;
        time?: number;
        data?: {
          time?: number;
          currentTime?: number;
          seconds?: number;
          position?: number;
          duration?: number;
          speed?: number;
          playbackRate?: number;
          paused?: boolean;
          playing?: boolean;
        };
      } | null;

      if (!msg || msg.channel !== "animeembed") return;

      const now = performance.now();
      const d = msg.data ?? {};
      const reportedTime =
        typeof d.currentTime === "number"
          ? d.currentTime
          : typeof d.time === "number"
          ? d.time
          : typeof d.seconds === "number"
          ? d.seconds
          : typeof d.position === "number"
          ? d.position
          : typeof msg.currentTime === "number"
          ? msg.currentTime
          : typeof msg.time === "number"
          ? msg.time
          : null;

      const reportedRate =
        typeof d.playbackRate === "number" && d.playbackRate > 0
          ? d.playbackRate
          : typeof d.speed === "number" && d.speed > 0
          ? d.speed
          : null;

      if (reportedRate !== null) {
        playbackRateRef.current = reportedRate;
      }

      switch (msg.event) {
        case "progress":
        case "timeupdate":
        case "seeked": {
          if (reportedTime !== null && Number.isFinite(reportedTime)) {
            const prevReported = lastReportedTimeRef.current;
            if (d.paused === true) {
              isPlayingRef.current = false;
            } else if (
              d.playing === true ||
              (prevReported >= 0 &&
                reportedTime > prevReported + 0.01 &&
                reportedTime - prevReported < 3.5)
            ) {
              isPlayingRef.current = true;
            }

            anchorVideoTimeRef.current = reportedTime;
            anchorPerfTimeRef.current = now;
            lastReportedTimeRef.current = reportedTime;
          }
          if (
            !hasEndedMarkedRef.current &&
            reportedTime !== null &&
            typeof d.duration === "number" &&
            d.duration > 60 &&
            reportedTime / d.duration >= 0.85
          ) {
            hasEndedMarkedRef.current = true;
            onAutoMarkWatched();
          }
          break;
        }
        case "play": {
          if (reportedTime !== null && Number.isFinite(reportedTime)) {
            anchorVideoTimeRef.current = reportedTime;
            lastReportedTimeRef.current = reportedTime;
          }
          anchorPerfTimeRef.current = now;
          isPlayingRef.current = true;
          break;
        }
        case "pause":
        case "buffering": {
          if (reportedTime !== null && Number.isFinite(reportedTime)) {
            anchorVideoTimeRef.current = reportedTime;
            lastReportedTimeRef.current = reportedTime;
          } else if (isPlayingRef.current) {
            const delta = Math.min(
              2.0,
              (now - anchorPerfTimeRef.current) / 1000
            );
            anchorVideoTimeRef.current += delta * playbackRateRef.current;
          }
          anchorPerfTimeRef.current = now;
          isPlayingRef.current = false;
          break;
        }
        case "ended": {
          isPlayingRef.current = false;
          if (!hasEndedMarkedRef.current) {
            hasEndedMarkedRef.current = true;
            onAutoMarkWatched();
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onAutoMarkWatched]);

  // Smooth requestAnimationFrame subtitle sync loop using dynamically shifted cues
  useEffect(() => {
    if (
      useNativeEnglish ||
      subtitleLang === "off" ||
      shiftedCues.length === 0
    ) {
      lastRenderedKeyRef.current = "";
      setActiveLines([]);
      return;
    }

    let rafId = 0;

    const tick = () => {
      const rawElapsed = isPlayingRef.current
        ? (performance.now() - anchorPerfTimeRef.current) / 1000
        : 0;
      const clampedElapsed = Math.min(2.0, Math.max(0, rawElapsed));
      const videoTime =
        anchorVideoTimeRef.current + clampedElapsed * playbackRateRef.current;

      const matched = findActiveCues(shiftedCues, videoTime);
      const nextLines = matched.map((c) => c.text);
      const key = nextLines.join("\n---\n");

      if (key !== lastRenderedKeyRef.current) {
        lastRenderedKeyRef.current = key;
        setActiveLines(nextLines);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [shiftedCues, subtitleLang, useNativeEnglish]);

  // Track native fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const fsEl = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setIsFullscreen(Boolean(fsEl));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  // Lock body scroll in pseudo-fullscreen on iOS Safari
  useEffect(() => {
    if (!isPseudoFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsPseudoFullscreen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onEsc);
    };
  }, [isPseudoFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const stage = stageRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> })
      | null;
    if (!stage) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      return;
    }

    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      try {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      } catch {
        setIsFullscreen(false);
      }
      return;
    }

    try {
      if (stage.requestFullscreen) {
        await stage.requestFullscreen();
      } else if (stage.webkitRequestFullscreen) {
        await stage.webkitRequestFullscreen();
      } else {
        setIsPseudoFullscreen(true);
      }
    } catch {
      setIsPseudoFullscreen(true);
    }
  }, [isPseudoFullscreen]);

  const inAnyFullscreen = isFullscreen || isPseudoFullscreen;

  const sizeClass = useMemo(() => {
    const map: Record<SubtitleSize, string> = inAnyFullscreen
      ? {
          sm: "text-base sm:text-xl md:text-2xl",
          md: "text-lg sm:text-2xl md:text-3xl",
          lg: "text-xl sm:text-3xl md:text-4xl",
          xl: "text-2xl sm:text-4xl md:text-5xl",
        }
      : {
          sm: "text-xs sm:text-sm md:text-base",
          md: "text-sm sm:text-base md:text-xl",
          lg: "text-base sm:text-lg md:text-2xl",
          xl: "text-lg sm:text-2xl md:text-3xl",
        };
    return map[subStyle.size];
  }, [inAnyFullscreen, subStyle.size]);

  const bgClass = useMemo(() => {
    const map: Record<SubtitleBackground, string> = {
      none: "bg-transparent subtitle-cinema-outline px-1.5 py-0.5",
      subtle:
        "bg-black/50 backdrop-blur-[2px] rounded-md px-3 py-1 subtitle-cinema-outline",
      box: "bg-black/85 rounded-md px-3.5 py-1.5",
    };
    return map[subStyle.background];
  }, [subStyle.background]);

  const colorClass =
    subStyle.color === "yellow" ? "text-amber-300" : "text-white";

  const positionClass = useMemo(() => {
    const map: Record<SubtitlePosition, string> = {
      low: "bottom-[6%] sm:bottom-[8%]",
      standard: "bottom-[12%] sm:bottom-[14%]",
      high: "bottom-[20%] sm:bottom-[22%]",
    };
    return map[subStyle.position];
  }, [subStyle.position]);

  const isArabic = subtitleLang === "ar";
  const showTrackPicker =
    subtitleLang !== "off" &&
    (tracks.length > 1 ||
      (subtitleLang === "en" &&
        activeServer.supportsNativeEn &&
        tracks.length > 0));

  const formattedOffset =
    syncOffset > 0 ? `+${syncOffset.toFixed(1)}s` : `${syncOffset.toFixed(1)}s`;

  return (
    <section
      id="theater-player"
      className="relative z-20 mx-auto w-full max-w-7xl px-3 sm:px-6 pt-4 sm:pt-6"
    >
      {/* Episode Header Bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center rounded bg-vermilion/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-vermilion border border-vermilion/30">
              EP {String(episode.number).padStart(2, "0")} / {TOTAL_EPISODES}
            </span>
            <span className="truncate text-zinc-400">{episode.arcName}</span>
            <span className="hidden sm:inline text-zinc-600">•</span>
            <span className="hidden sm:inline text-zinc-500">
              {episode.romajiTitle}
            </span>
          </div>
          <h1 className="mt-1 truncate text-base sm:text-xl font-bold tracking-tight text-white">
            {episode.title}
          </h1>
        </div>

        {/* Lights Off + Fullscreen Quick Triggers */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleLightsOff}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              lightsOff
                ? "border-vermilion bg-vermilion/15 text-white"
                : "border-hairline bg-charcoal text-zinc-300 hover:border-zinc-700 hover:text-white"
            }`}
          >
            {lightsOff ? (
              <Sun className="h-3.5 w-3.5 text-amber-300" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-zinc-400" />
            )}
            <span className="hidden sm:inline">
              {lightsOff ? "Lights On" : "Lights Off"}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Fullscreen with Subtitles"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-charcoal px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            <Maximize className="h-3.5 w-3.5 text-vermilion" />
            <span>Fullscreen</span>
          </button>
        </div>
      </div>

      {/* 16:9 Theater Player Wrapper */}
      <div
        ref={stageRef}
        className={`player-stage relative w-full overflow-hidden rounded-xl border border-hairline bg-black shadow-2xl ${
          isPseudoFullscreen ? "player-stage-pseudo-fs" : "aspect-video"
        }`}
      >
        <iframe
          ref={iframeRef}
          key={`${episode.number}-${serverId}-${
            useNativeEnglish ? "native-en" : "overlay"
          }`}
          src={embedUrl}
          title={`Dororo Episode ${episode.number}: ${episode.title}`}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
        />

        {/* Exit Fullscreen Button inside fullscreen/pseudo-fullscreen */}
        {inAnyFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Exit Fullscreen"
            className="absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/90"
          >
            <Minimize className="h-3.5 w-3.5" />
            <span>Exit Fullscreen</span>
          </button>
        )}

        {/* Synced Arabic (RTL) / External English Subtitle Overlay */}
        {!useNativeEnglish &&
          subtitleLang !== "off" &&
          activeLines.length > 0 && (
            <div
              className={`pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center justify-end gap-1 px-4 sm:px-8 text-center ${positionClass}`}
            >
              {activeLines.map((cueText, idx) => (
                <div
                  key={`${idx}-${cueText.slice(0, 16)}`}
                  dir={isArabic ? "rtl" : "ltr"}
                  style={{
                    unicodeBidi: isArabic ? "isolate" : "normal",
                    lineHeight: isArabic ? 1.45 : 1.35,
                  }}
                  className={`max-w-[92%] sm:max-w-[82%] whitespace-pre-line font-semibold tracking-normal ${
                    isArabic ? "font-arabic" : "font-sans"
                  } ${sizeClass} ${bgClass} ${colorClass}`}
                >
                  {cueText}
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Unified Control Deck Below Video */}
      <div className="mt-3 rounded-xl border border-hairline bg-charcoal p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: 3 Verified Working Servers */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 mr-1">
              <Server className="h-3.5 w-3.5 text-vermilion" />
              <span>Server</span>
            </span>

            {STREAM_SERVERS.map((srv) => {
              const active = srv.id === serverId;
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => onSelectServer(srv.id)}
                  title={srv.description}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-vermilion bg-vermilion text-white"
                      : "border-hairline bg-obsidian text-zinc-300 hover:border-zinc-700 hover:text-white"
                  }`}
                >
                  <span className="hidden sm:inline">{srv.label}</span>
                  <span className="sm:hidden">{srv.shortLabel}</span>
                  <span
                    className={`rounded px-1 py-0.5 text-[10px] font-bold tracking-wider ${
                      active
                        ? "bg-black/25 text-white"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {srv.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Arabic CC / English CC / Off + Track Selector + Subtitle Menu */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 mr-1">
              <Subtitles className="h-3.5 w-3.5 text-vermilion" />
              <span>Subtitles</span>
            </span>

            <div className="inline-flex rounded-lg border border-hairline bg-obsidian p-0.5">
              {(
                [
                  { id: "ar", label: "Arabic CC" },
                  { id: "en", label: "English CC" },
                  { id: "off", label: "Off" },
                ] as Array<{ id: SubtitleLang; label: string }>
              ).map((opt) => {
                const active = subtitleLang === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelectSubtitleLang(opt.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-vermilion text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {loadingSubs && (
              <Loader2
                className="h-4 w-4 animate-spin text-vermilion"
                aria-label="Loading subtitles"
              />
            )}

            {/* Track Switcher (Native Stream + up to 3 external tracks per language) */}
            {showTrackPicker && (
              <div className="relative inline-flex items-center">
                <Layers className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
                <select
                  aria-label="Subtitle Track"
                  value={selectedTrackKey}
                  onChange={(e) => setSelectedTrackKey(e.target.value)}
                  className="rounded-lg border border-hairline bg-obsidian py-1.5 pl-7 pr-6 text-xs font-medium text-zinc-200 focus:border-vermilion focus:outline-none"
                >
                  {subtitleLang === "en" && activeServer.supportsNativeEn && (
                    <option value="native" className="bg-charcoal">
                      Stream Native (Default)
                    </option>
                  )}
                  {tracks.map((t, idx) => (
                    <option
                      key={t.id}
                      value={String(idx)}
                      className="bg-charcoal"
                    >
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Subtitle Style & Sync Popover */}
            <div ref={styleMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setStyleOpen((o) => !o)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  styleOpen
                    ? "border-vermilion bg-vermilion/15 text-white"
                    : "border-hairline bg-obsidian text-zinc-300 hover:border-zinc-700 hover:text-white"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Style &amp; Sync</span>
                {!useNativeEnglish && subtitleLang !== "off" && syncOffset !== 0 && (
                  <span className="rounded bg-vermilion/20 px-1 py-0.5 font-mono text-[10px] text-vermilion">
                    {formattedOffset}
                  </span>
                )}
              </button>

              {styleOpen && (
                <div className="absolute right-0 left-auto z-40 mt-2 w-[min(19.5rem,calc(100vw-2rem))] rounded-xl border border-hairline bg-charcoal p-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                    <span className="text-xs font-semibold text-white">
                      Subtitle Menu &amp; Sync
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        updateSubStyle(DEFAULT_SUB_STYLE);
                        updateSyncOffset(0);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset All
                    </button>
                  </div>

                  {/* Real-Time Subtitle Sync Control (-0.5s, readout, +0.5s, Reset) */}
                  {!useNativeEnglish && subtitleLang !== "off" && (
                    <div className="mt-3 rounded-lg border border-hairline bg-obsidian/70 p-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-zinc-300">
                          Subtitle Sync
                        </span>
                        <span className="font-mono font-semibold text-white">
                          {formattedOffset}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateSyncOffset(syncOffset - 0.5)}
                          className="rounded-md border border-hairline bg-charcoal py-1.5 text-xs font-mono font-medium text-zinc-200 transition-colors hover:border-vermilion hover:text-white"
                        >
                          -0.5s
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSyncOffset(syncOffset + 0.5)}
                          className="rounded-md border border-hairline bg-charcoal py-1.5 text-xs font-mono font-medium text-zinc-200 transition-colors hover:border-vermilion hover:text-white"
                        >
                          +0.5s
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSyncOffset(0)}
                          className="rounded-md border border-hairline bg-charcoal py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Size */}
                  <div className="mt-3">
                    <span className="text-[11px] font-medium text-zinc-400">
                      Size
                    </span>
                    <div className="mt-1.5 grid grid-cols-4 gap-1">
                      {(
                        [
                          { id: "sm", label: "S" },
                          { id: "md", label: "M" },
                          { id: "lg", label: "L" },
                          { id: "xl", label: "XL" },
                        ] as Array<{ id: SubtitleSize; label: string }>
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => updateSubStyle({ size: s.id })}
                          className={`rounded-md border py-1 text-xs font-medium transition-colors ${
                            subStyle.size === s.id
                              ? "border-vermilion bg-vermilion text-white"
                              : "border-hairline bg-obsidian text-zinc-300 hover:text-white"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background */}
                  <div className="mt-3">
                    <span className="text-[11px] font-medium text-zinc-400">
                      Background
                    </span>
                    <div className="mt-1.5 grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: "none", label: "None" },
                          { id: "subtle", label: "Subtle" },
                          { id: "box", label: "Box" },
                        ] as Array<{ id: SubtitleBackground; label: string }>
                      ).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => updateSubStyle({ background: b.id })}
                          className={`rounded-md border py-1 text-xs font-medium transition-colors ${
                            subStyle.background === b.id
                              ? "border-vermilion bg-vermilion text-white"
                              : "border-hairline bg-obsidian text-zinc-300 hover:text-white"
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color & Position */}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] font-medium text-zinc-400">
                        Color
                      </span>
                      <div className="mt-1.5 grid grid-cols-2 gap-1">
                        {(
                          [
                            { id: "white", label: "White" },
                            { id: "yellow", label: "Yellow" },
                          ] as Array<{ id: SubtitleColor; label: string }>
                        ).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => updateSubStyle({ color: c.id })}
                            className={`rounded-md border py-1 text-xs font-medium transition-colors ${
                              subStyle.color === c.id
                                ? "border-vermilion bg-vermilion text-white"
                                : "border-hairline bg-obsidian text-zinc-300 hover:text-white"
                            }`}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-medium text-zinc-400">
                        Position
                      </span>
                      <div className="mt-1.5 grid grid-cols-3 gap-1">
                        {(
                          [
                            { id: "low", label: "Low" },
                            { id: "standard", label: "Mid" },
                            { id: "high", label: "High" },
                          ] as Array<{ id: SubtitlePosition; label: string }>
                        ).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => updateSubStyle({ position: p.id })}
                            className={`rounded-md border py-1 text-[11px] font-medium transition-colors ${
                              subStyle.position === p.id
                                ? "border-vermilion bg-vermilion text-white"
                                : "border-hairline bg-obsidian text-zinc-300 hover:text-white"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Action Row: Prev / Next / Watched / Favorite */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevEpisode}
              disabled={episode.number <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-obsidian px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>

            <button
              type="button"
              onClick={onNextEpisode}
              disabled={episode.number >= TOTAL_EPISODES}
              className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-obsidian px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleWatched}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isWatched
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-hairline bg-obsidian text-zinc-300 hover:border-zinc-700 hover:text-white"
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              <span>{isWatched ? "Watched" : "Mark Watched"}</span>
            </button>

            <button
              type="button"
              onClick={onToggleFavorite}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isFavorite
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-hairline bg-obsidian text-zinc-300 hover:border-zinc-700 hover:text-white"
              }`}
            >
              <Bookmark
                className={`h-3.5 w-3.5 ${isFavorite ? "fill-amber-300" : ""}`}
              />
              <span>{isFavorite ? "Saved" : "Favorite"}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
