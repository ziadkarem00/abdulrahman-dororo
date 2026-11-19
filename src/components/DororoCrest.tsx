import React from "react";

interface DororoCrestProps {
  className?: string;
}

export function DororoCrest({ className = "w-8 h-8" }: DororoCrestProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="12"
        fill="#111114"
        stroke="#27272A"
        strokeWidth="2"
      />
      <circle cx="32" cy="32" r="13.5" fill="#C81E1E" />
      <path d="M15 47L45 15L49 17L20 49L15 47Z" fill="#E7DFD3" />
      <path d="M49 47L19 15L15 17L44 49L49 47Z" fill="#E7DFD3" />
      <circle
        cx="32"
        cy="32"
        r="3.2"
        fill="#09090B"
        stroke="#E7DFD3"
        strokeWidth="1.5"
      />
    </svg>
  );
}
