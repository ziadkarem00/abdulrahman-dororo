"use client";

import React from "react";
import { DoorOpen } from "lucide-react";
import { DororoCrest } from "@/components/DororoCrest";
import { TOTAL_EPISODES } from "@/lib/dororo-data";

interface NavbarProps {
  watchedCount: number;
  lightsOff: boolean;
  onOpenWelcome: () => void;
}

export function Navbar({
  watchedCount,
  lightsOff,
  onOpenWelcome,
}: NavbarProps) {
  const pct = Math.round((watchedCount / TOTAL_EPISODES) * 100);

  return (
    <header
      className={`sticky top-0 z-30 border-b border-hairline bg-obsidian/90 backdrop-blur-md transition-opacity duration-300 ${
        lightsOff ? "opacity-15 hover:opacity-100" : "opacity-100"
      }`}
    >
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:px-6">
        {/* Brand Logo (responsive, never clips on narrow mobile) */}
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <DororoCrest className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm sm:text-base font-extrabold tracking-tight text-white">
                ABDULRAHMAN-DORORO
              </span>
              <span className="hidden md:inline-flex shrink-0 items-center rounded-md border border-hairline bg-charcoal px-2 py-0.5 text-[10px] font-medium tracking-wide text-bone/80">
                Dedicated to Abdulrahman
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-zinc-500">
              Dororo (2019) · Complete 24 Episodes
            </p>
          </div>
        </div>

        {/* Right: Progress Pill + Welcome Button */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-charcoal px-2.5 py-1.5">
            <div className="hidden sm:block h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-vermilion transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-xs font-medium text-zinc-300">
              {watchedCount}/{TOTAL_EPISODES}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenWelcome}
            title="Show Welcome Screen"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-charcoal px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            <DoorOpen className="h-3.5 w-3.5 text-vermilion" />
            <span className="hidden sm:inline">Welcome</span>
          </button>
        </div>
      </div>
    </header>
  );
}
