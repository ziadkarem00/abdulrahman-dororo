"use client";

import React, { useEffect } from "react";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { DororoCrest } from "@/components/DororoCrest";
import { TOTAL_EPISODES } from "@/lib/dororo-data";

interface WelcomeCurtainProps {
  isOpen: boolean;
  onEnter: () => void;
  currentEpisode: number;
  currentEpisodeTitle: string;
  watchedCount: number;
}

export function WelcomeCurtain({
  isOpen,
  onEnter,
  currentEpisode,
  currentEpisodeTitle,
  watchedCount,
}: WelcomeCurtainProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        onEnter();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onEnter]);

  if (!isOpen) return null;

  const progressPercent = Math.round((watchedCount / TOTAL_EPISODES) * 100);
  const hasStarted = watchedCount > 0 || currentEpisode > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/98 px-4 py-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Abdulrahman-Dororo"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-charcoal p-6 sm:p-9 shadow-2xl">
        {/* Top Crimson Seal Line */}
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-vermilion/80 to-transparent" />

        <div className="flex flex-col items-center text-center">
          <DororoCrest className="h-14 w-14 sm:h-16 sm:w-16" />

          <p className="mt-4 text-xs font-medium tracking-[0.28em] text-bone/70 uppercase">
            どろろ · 百鬼丸
          </p>

          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-obsidian px-3 py-1 text-[11px] font-medium text-zinc-400">
            <Sparkles className="h-3 w-3 text-vermilion" />
            <span>Dedicated to Abdulrahman</span>
          </div>

          <h1 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Welcome, Abdulrahman
          </h1>

          <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
            Your private theater for <span className="text-zinc-200 font-medium">Dororo (2019)</span>.
            All {TOTAL_EPISODES} episodes, three streaming servers (Sub &amp; Dub), and synced
            Arabic &amp; English subtitles ready on phone, tablet, or desktop.
          </p>

          {/* Progress Card */}
          <div className="mt-6 w-full rounded-xl border border-hairline bg-obsidian/80 p-4 text-left">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>{hasStarted ? "Ready to resume" : "Starting from the beginning"}</span>
              <span className="font-mono text-zinc-300">
                {watchedCount} / {TOTAL_EPISODES} ({progressPercent}%)
              </span>
            </div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-vermilion transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-300">
              <Play className="h-3.5 w-3.5 shrink-0 text-vermilion fill-vermilion" />
              <span className="truncate">
                Episode {currentEpisode}: <span className="text-white font-medium">{currentEpisodeTitle}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onEnter}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-vermilion px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-vermilion-hover focus:outline-none focus:ring-2 focus:ring-vermilion/60 focus:ring-offset-2 focus:ring-offset-charcoal"
          >
            <span>{hasStarted ? `Continue Episode ${currentEpisode}` : "Enter Theater"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-3 text-[11px] text-zinc-500">
            Press <kbd className="rounded border border-hairline bg-obsidian px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">Enter</kbd> to begin
          </p>
        </div>
      </div>
    </div>
  );
}
