"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { EpisodeGrid } from "@/components/EpisodeGrid";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { VideoPlayer } from "@/components/VideoPlayer";
import { WelcomeCurtain } from "@/components/WelcomeCurtain";
import { FALLBACK_EPISODES, TOTAL_EPISODES } from "@/lib/dororo-data";
import type {
  Episode,
  ServerId,
  SubtitleLang,
  WatchState,
} from "@/types/dororo";

const WATCH_STATE_KEY = "abdulrahman_dororo_watch_v1";
const EPISODES_CACHE_KEY = "abdulrahman_dororo_episodes_v1";

const DEFAULT_WATCH_STATE: WatchState = {
  currentEpisode: 1,
  watchedEpisodes: [],
  favoriteEpisodes: [],
  serverId: "primary",
  subtitleLang: "ar",
  lastUpdated: 0,
};

export default function HomePage() {
  const [episodes, setEpisodes] = useState<Episode[]>(FALLBACK_EPISODES);
  const [watchState, setWatchState] = useState<WatchState>(DEFAULT_WATCH_STATE);
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [lightsOff, setLightsOff] = useState(false);

  // Hydrate persisted watch state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCH_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WatchState>;
        setWatchState((prev) => ({
          ...prev,
          currentEpisode:
            typeof parsed.currentEpisode === "number" &&
            parsed.currentEpisode >= 1 &&
            parsed.currentEpisode <= TOTAL_EPISODES
              ? parsed.currentEpisode
              : prev.currentEpisode,
          watchedEpisodes: Array.isArray(parsed.watchedEpisodes)
            ? parsed.watchedEpisodes
            : prev.watchedEpisodes,
          favoriteEpisodes: Array.isArray(parsed.favoriteEpisodes)
            ? parsed.favoriteEpisodes
            : prev.favoriteEpisodes,
          serverId:
            parsed.serverId === "primary" ||
            parsed.serverId === "mal-mirror" ||
            parsed.serverId === "dub"
              ? parsed.serverId
              : prev.serverId,
          subtitleLang:
            parsed.subtitleLang === "ar" ||
            parsed.subtitleLang === "en" ||
            parsed.subtitleLang === "off"
              ? parsed.subtitleLang
              : prev.subtitleLang,
          lastUpdated:
            typeof parsed.lastUpdated === "number" ? parsed.lastUpdated : 0,
        }));
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  // Hydrate cached episodes and refresh from /api/episodes
  useEffect(() => {
    try {
      const cached = localStorage.getItem(EPISODES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Episode[];
        if (Array.isArray(parsed) && parsed.length === TOTAL_EPISODES) {
          setEpisodes(parsed);
        }
      }
    } catch {
      // ignore
    }

    let cancelled = false;
    fetch("/api/episodes")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { episodes?: Episode[] } | null) => {
        if (cancelled) return;
        if (Array.isArray(data?.episodes) && data.episodes.length === TOTAL_EPISODES) {
          setEpisodes(data.episodes);
          try {
            localStorage.setItem(
              EPISODES_CACHE_KEY,
              JSON.stringify(data.episodes)
            );
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // Fallback episodes already rendered
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateWatchState = useCallback(
    (updater: (prev: WatchState) => WatchState) => {
      setWatchState((prev) => {
        const next = { ...updater(prev), lastUpdated: Date.now() };
        try {
          localStorage.setItem(WATCH_STATE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    []
  );

  const watchedSet = useMemo(
    () => new Set(watchState.watchedEpisodes),
    [watchState.watchedEpisodes]
  );

  const favoriteSet = useMemo(
    () => new Set(watchState.favoriteEpisodes),
    [watchState.favoriteEpisodes]
  );

  const currentEpisodeObj = useMemo(
    () =>
      episodes.find((ep) => ep.number === watchState.currentEpisode) ??
      episodes[0],
    [episodes, watchState.currentEpisode]
  );

  const handleSelectEpisode = useCallback(
    (episodeNumber: number) => {
      const clamped = Math.max(1, Math.min(TOTAL_EPISODES, episodeNumber));
      updateWatchState((prev) => ({ ...prev, currentEpisode: clamped }));
      const el = document.getElementById("theater-player");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [updateWatchState]
  );

  const handleSelectServer = useCallback(
    (serverId: ServerId) => {
      updateWatchState((prev) => ({ ...prev, serverId }));
    },
    [updateWatchState]
  );

  const handleSelectSubtitleLang = useCallback(
    (subtitleLang: SubtitleLang) => {
      updateWatchState((prev) => ({ ...prev, subtitleLang }));
    },
    [updateWatchState]
  );

  const handleToggleWatched = useCallback(
    (episodeNumber: number) => {
      updateWatchState((prev) => {
        const exists = prev.watchedEpisodes.includes(episodeNumber);
        const watchedEpisodes = exists
          ? prev.watchedEpisodes.filter((n) => n !== episodeNumber)
          : [...prev.watchedEpisodes, episodeNumber].sort((a, b) => a - b);
        return { ...prev, watchedEpisodes };
      });
    },
    [updateWatchState]
  );

  const handleAutoMarkWatched = useCallback(() => {
    updateWatchState((prev) => {
      if (prev.watchedEpisodes.includes(prev.currentEpisode)) return prev;
      return {
        ...prev,
        watchedEpisodes: [...prev.watchedEpisodes, prev.currentEpisode].sort(
          (a, b) => a - b
        ),
      };
    });
  }, [updateWatchState]);

  const handleToggleFavorite = useCallback(
    (episodeNumber: number) => {
      updateWatchState((prev) => {
        const exists = prev.favoriteEpisodes.includes(episodeNumber);
        const favoriteEpisodes = exists
          ? prev.favoriteEpisodes.filter((n) => n !== episodeNumber)
          : [...prev.favoriteEpisodes, episodeNumber].sort((a, b) => a - b);
        return { ...prev, favoriteEpisodes };
      });
    },
    [updateWatchState]
  );

  const progressPercent = Math.round(
    (watchState.watchedEpisodes.length / TOTAL_EPISODES) * 100
  );

  return (
    <div className="flex min-h-dvh flex-col bg-obsidian text-zinc-100">
      {/* Lights Off Dimmer Backdrop */}
      {lightsOff && (
        <div
          onClick={() => setLightsOff(false)}
          className="fixed inset-0 z-10 bg-black/85 transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Welcome Page Overlay for Abdulrahman */}
      <WelcomeCurtain
        isOpen={welcomeOpen}
        onEnter={() => setWelcomeOpen(false)}
        currentEpisode={currentEpisodeObj.number}
        currentEpisodeTitle={currentEpisodeObj.title}
        watchedCount={watchState.watchedEpisodes.length}
      />

      <Navbar
        watchedCount={watchState.watchedEpisodes.length}
        lightsOff={lightsOff}
        onOpenWelcome={() => setWelcomeOpen(true)}
      />

      <main className="flex-1">
        {/* Compact Continue Watching Banner */}
        <section
          className={`mx-auto mt-4 w-full max-w-7xl px-3 sm:px-6 transition-opacity duration-300 ${
            lightsOff ? "opacity-15 hover:opacity-100" : "opacity-100"
          }`}
        >
          <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-charcoal px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-bone/75">
                <span>Dororo (2019) · Sengoku Saga</span>
                <span className="text-zinc-600">•</span>
                <span className="font-mono text-zinc-400">
                  {watchState.watchedEpisodes.length} / {TOTAL_EPISODES} Watched ({progressPercent}%)
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-vermilion transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSelectEpisode(currentEpisodeObj.number)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-vermilion px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-vermilion-hover"
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              <span>Resume Episode {currentEpisodeObj.number}</span>
            </button>
          </div>
        </section>

        {/* Theater Video Player */}
        <VideoPlayer
          episode={currentEpisodeObj}
          serverId={watchState.serverId}
          subtitleLang={watchState.subtitleLang}
          isWatched={watchedSet.has(currentEpisodeObj.number)}
          isFavorite={favoriteSet.has(currentEpisodeObj.number)}
          lightsOff={lightsOff}
          onSelectServer={handleSelectServer}
          onSelectSubtitleLang={handleSelectSubtitleLang}
          onPrevEpisode={() =>
            handleSelectEpisode(currentEpisodeObj.number - 1)
          }
          onNextEpisode={() =>
            handleSelectEpisode(currentEpisodeObj.number + 1)
          }
          onToggleWatched={() => handleToggleWatched(currentEpisodeObj.number)}
          onToggleFavorite={() =>
            handleToggleFavorite(currentEpisodeObj.number)
          }
          onToggleLightsOff={() => setLightsOff((v) => !v)}
          onAutoMarkWatched={handleAutoMarkWatched}
        />

        {/* Story Arc Filter & Episode Grid */}
        <EpisodeGrid
          episodes={episodes}
          currentEpisode={currentEpisodeObj.number}
          watchedSet={watchedSet}
          favoriteSet={favoriteSet}
          lightsOff={lightsOff}
          onSelectEpisode={handleSelectEpisode}
          onToggleFavorite={handleToggleFavorite}
        />
      </main>

      <Footer lightsOff={lightsOff} />
    </div>
  );
}
