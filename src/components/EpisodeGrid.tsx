"use client";

import React, { useMemo, useState } from "react";
import { Bookmark, Check, Play, Search, X } from "lucide-react";
import { STORY_ARCS } from "@/lib/dororo-data";
import type { ArcId, Episode } from "@/types/dororo";

interface EpisodeGridProps {
  episodes: Episode[];
  currentEpisode: number;
  watchedSet: Set<number>;
  favoriteSet: Set<number>;
  lightsOff: boolean;
  onSelectEpisode: (episodeNumber: number) => void;
  onToggleFavorite: (episodeNumber: number) => void;
}

export function EpisodeGrid({
  episodes,
  currentEpisode,
  watchedSet,
  favoriteSet,
  lightsOff,
  onSelectEpisode,
  onToggleFavorite,
}: EpisodeGridProps) {
  const [selectedArc, setSelectedArc] = useState<ArcId>("all");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const filteredEpisodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return episodes.filter((ep) => {
      if (selectedArc !== "all" && ep.arcId !== selectedArc) return false;
      if (favoritesOnly && !favoriteSet.has(ep.number)) return false;
      if (!q) return true;
      return (
        String(ep.number).includes(q) ||
        ep.title.toLowerCase().includes(q) ||
        ep.romajiTitle.toLowerCase().includes(q)
      );
    });
  }, [episodes, selectedArc, favoritesOnly, favoriteSet, query]);

  const activeArcObj = STORY_ARCS.find((a) => a.id === selectedArc);

  return (
    <section
      className={`mx-auto mt-8 w-full max-w-7xl px-3 sm:px-6 pb-12 transition-opacity duration-300 ${
        lightsOff ? "opacity-15 hover:opacity-100" : "opacity-100"
      }`}
    >
      {/* Section Header + Search + Favorites Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
            Episodes
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {activeArcObj?.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search episode or title..."
              className="w-full rounded-lg border border-hairline bg-charcoal py-1.5 pl-8 pr-8 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-vermilion focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              favoritesOnly
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-hairline bg-charcoal text-zinc-300 hover:border-zinc-700 hover:text-white"
            }`}
          >
            <Bookmark
              className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-amber-300" : ""}`}
            />
            <span>Favorites ({favoriteSet.size})</span>
          </button>
        </div>
      </div>

      {/* Story Arc Filter Tabs */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {STORY_ARCS.map((arc) => {
          const active = arc.id === selectedArc;
          return (
            <button
              key={arc.id}
              type="button"
              onClick={() => setSelectedArc(arc.id)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-vermilion bg-vermilion text-white"
                  : "border-hairline bg-charcoal text-zinc-300 hover:border-zinc-700 hover:text-white"
              }`}
            >
              <span>{arc.name}</span>
              <span
                className={`ml-1.5 font-mono text-[10px] ${
                  active ? "text-white/80" : "text-zinc-500"
                }`}
              >
                {arc.shortName}
              </span>
            </button>
          );
        })}
      </div>

      {/* Responsive Episode Cards Grid */}
      {filteredEpisodes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-hairline bg-charcoal p-8 text-center">
          <p className="text-sm text-zinc-400">
            No episodes match your current filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedArc("all");
              setQuery("");
              setFavoritesOnly(false);
            }}
            className="mt-3 rounded-lg border border-hairline bg-obsidian px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-700 hover:text-white"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredEpisodes.map((ep) => {
            const isPlaying = ep.number === currentEpisode;
            const watched = watchedSet.has(ep.number);
            const favorite = favoriteSet.has(ep.number);

            return (
              <div
                key={ep.number}
                role="button"
                tabIndex={0}
                onClick={() => onSelectEpisode(ep.number)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectEpisode(ep.number);
                  }
                }}
                className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                  isPlaying
                    ? "border-vermilion bg-slatecard ring-1 ring-vermilion/40"
                    : "border-hairline bg-charcoal hover:border-zinc-700 hover:bg-slatecard"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
                          isPlaying
                            ? "bg-vermilion text-white"
                            : "bg-obsidian text-zinc-300 border border-hairline"
                        }`}
                      >
                        {isPlaying && <Play className="h-2.5 w-2.5 fill-white" />}
                        EP {String(ep.number).padStart(2, "0")}
                      </span>

                      {watched && (
                        <span
                          title="Watched"
                          className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/25"
                        >
                          <Check className="h-2.5 w-2.5" />
                          Watched
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(ep.number);
                      }}
                      aria-label={
                        favorite ? "Remove from favorites" : "Add to favorites"
                      }
                      className={`rounded-md p-1 transition-colors ${
                        favorite
                          ? "text-amber-300 hover:text-amber-200"
                          : "text-zinc-600 hover:text-zinc-300"
                      }`}
                    >
                      <Bookmark
                        className={`h-3.5 w-3.5 ${
                          favorite ? "fill-amber-300" : ""
                        }`}
                      />
                    </button>
                  </div>

                  <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold text-zinc-100 group-hover:text-white">
                    {ep.title}
                  </h3>

                  <p className="mt-1 truncate text-[11px] text-zinc-500">
                    {ep.romajiTitle} · {ep.japaneseTitle}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-hairline/70 pt-2 text-[10px] text-zinc-500">
                  <span className="truncate">{ep.arcName}</span>
                  <span className="shrink-0 font-mono">{ep.aired}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
