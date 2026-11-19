import React from "react";
import { DororoCrest } from "@/components/DororoCrest";

interface FooterProps {
  lightsOff: boolean;
}

export function Footer({ lightsOff }: FooterProps) {
  return (
    <footer
      className={`border-t border-hairline bg-obsidian transition-opacity duration-300 ${
        lightsOff ? "opacity-15 hover:opacity-100" : "opacity-100"
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
        <div className="flex items-center gap-2.5">
          <DororoCrest className="h-6 w-6 shrink-0" />
          <span className="text-xs font-semibold tracking-wide text-zinc-300">
            ABDULRAHMAN-DORORO
          </span>
          <span className="text-xs text-zinc-600">·</span>
          <span className="text-xs text-zinc-500">Dororo (2019) Theater</span>
        </div>

        <a
          href="https://github.com/ziadkarem00"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-400 transition-colors hover:text-white underline-offset-4 hover:underline"
        >
          © 2026 Ziad Karem (@ziadkarem00) · All rights reserved
        </a>
      </div>
    </footer>
  );
}
