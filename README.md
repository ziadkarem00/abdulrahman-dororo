# Abdulrahman-Dororo

A sleek, matte dark-mode, single-series anime theater built with **Next.js (App Router)**, **React**, **TypeScript**, and **Tailwind CSS** — dedicated exclusively to **Dororo (2019)** (Episodes 1–24) for **Abdulrahman**.

---

## Features

- **Personalized Welcome Page**: Atmospheric Sengoku ink-and-vermilion welcome curtain greeting **Abdulrahman** with live watch progress and instant resume.
- **3 Working Streaming Servers**:
  - **Server 1 • Primary** (`AniList ID: 101347` — Japanese Audio)
  - **Server 2 • MAL Mirror** (`MyAnimeList ID: 37520` — Japanese Audio Backup)
  - **Server 3 • English Dub** (`AniList ID: 101347` — English Dub)
- **Synced Arabic & English Subtitles (All 24 Episodes)**:
  - Dual-provider `/api/subtitles` engine querying **OpenSubtitles v3** (`tt9458304`) and **SubtitleCat** in parallel, with automatic server-side Arabic translation fallback and strict language validation so **Arabic CC** is always Arabic and **English CC** is always English.
  - Zero-drift `performance.now()` clock anchored directly to player playback events (`play`, `pause`, `buffering`, `progress`, `ended`), supporting overlapping cues.
  - Proper Arabic RTL & punctuation normalization rendered in the **Cairo** font with a transparent cinema outline by default.
  - Built-in **Style** menu for **Size** (`S / M / L / XL`), **Background** (`None / Subtle / Box`), **Color** (`White / Yellow`), **Position** (`Low / Mid / High`), and **Timing Sync** (`-0.5s / 0.0s / +0.5s`).
- **Fullscreen Subtitles on Mobile, Tablet & PC**: Custom fullscreen wrapper (with full-viewport fallback for iOS Safari) keeps Arabic and English subtitles visible and scaled cleanly in fullscreen.
- **Automatic Progress & Favorites**: Saves current episode, watched checkmarks, favorite bookmarks, preferred server, and subtitle settings locally in `localStorage` — no database or login required.

## Story Arcs Covered

| Story Arc | Episodes | Focus |
| :--- | :--- | :--- |
| **Awakening & First Senses** | Ep 1–6 | Daigo's pact, Jukai's prosthetics, and Hyakkimaru reclaiming pain, hearing, and voice |
| **Roads of the Sengoku** | Ep 7–12 | Dororo's past, Tahōmaru's rise, and the battle at Fort Banmon |
| **The Hidden Map & Cape Hakkotsu** | Ep 13–18 | The map on Dororo's back, Sabame's village, and the Cape of No Mercy |
| **The Twelve Demons & Hall of Hell** | Ep 19–24 | Hyakkimaru's return to Daigo's land and the final reckoning |

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS (`Plus Jakarta Sans` UI font + `Cairo` Arabic subtitle font)
- **Icons**: Lucide React
- **Metadata**: Jikan API v4 (`/api/episodes`) with full 24-episode verified fallback
- **Deployment**: Zero-config Vercel deployment (no environment variables required)

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Deploy to GitHub & Vercel

1. Create an empty repository named `abdulrahman-dororo` on GitHub.
2. Inside the unzipped `abdulrahman-dororo` folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Abdulrahman-Dororo"
   git branch -M main
   git remote add origin https://github.com/ziadkarem00/abdulrahman-dororo.git
   git push -u origin main
   ```
3. Import `abdulrahman-dororo` in [Vercel](https://vercel.com/new) and click **Deploy**.

---

[© 2026 Ziad Karem (@ziadkarem00) · All rights reserved](https://github.com/ziadkarem00)
