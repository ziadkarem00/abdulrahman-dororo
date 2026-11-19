# Abdulrahman-Dororo

A matte dark-mode, single-series anime theater built with **Next.js (App Router)**, **React**, **TypeScript**, and **Tailwind CSS** — dedicated exclusively to **Dororo (2019)** (Episodes 1–24) for **Abdulrahman**.

## Features

- **Personalized Welcome Page**: Sengoku ink-and-vermilion welcome curtain greeting **Abdulrahman** with live watch progress and instant resume.
- **3 Streaming Servers**:
  - **Server 1 • Primary** (`AniList ID: 101347` — Japanese Audio)
  - **Server 2 • MAL Mirror** (`MyAnimeList ID: 37520` — Japanese Audio Backup)
  - **Server 3 • English Dub** (`AniList ID: 101347` — English Dub)
- **Release-Aware SubDL API v2 Subtitle Engine (Arabic & English)**:
  - Queries the official [SubDL API v2](https://subdl.com/developers) (`GET /api/v2/subtitles/search` with `imdb_id=tt9458304`, `season=1`, `episode={ep}`, `languages=en,ar`, `unpack=1`) server-side using `Authorization: Bearer $SUBDL_API_KEY`.
  - Extracts individual episode files from unpacked season packs, preserves original timestamps, validates language and episode number, and ranks candidates by actual release compatibility (`AMZN` / `WEBRip` / `HorribleSubs` / `Erai-raws` / `Blu-ray`) while preferring human-created translations over machine translations.
  - Exposes all ranked candidate releases per `(episode, server, language)` so you can pick the exact matching release, with optional **AnimeEmbed Native (Fallback)** for English on Servers 1 & 2 and an OpenSubtitles secondary fallback when SubDL has no match.
- **Drift-Free Playback Clock & Real-Time Sync**:
  - Continuous `performance.now()` clock anchored directly to [AnimeEmbed](https://animeembed.com/) `channel: "animeembed", version: 1` events (`ready`, `play`, `pause`, `buffering`, `progress`, `ended`), supporting seeking and playback-rate changes with zero artificial extrapolation cap.
  - Compact **Subtitle Sync** (`-0.5s`, `+0.5s`, readout, `Reset`) inside **Style & Sync** dynamically shifts cue timestamps (clamped `>= 0`) without reloading the video and saves per `(episode, server, language)` in `localStorage`.
- **Fullscreen Subtitles on Mobile, Tablet & PC**: Outer fullscreen wrapper (with iOS Safari full-viewport fallback) keeps Arabic (`dir="rtl"`, `Cairo` font) and English subtitles visible in fullscreen.

## Required Environment Variables (Vercel & Local)

| Variable | Required | Description |
| :--- | :--- | :--- |
| `SUBDL_API_KEY` | **Yes** (Recommended) | Free API key from [SubDL Developer API](https://subdl.com/developers) (`Authorization: Bearer`). Kept strictly server-side in `/api/subtitles`. |

### Setting `SUBDL_API_KEY` on Vercel
1. Create a free account at [subdl.com](https://subdl.com/developers) and generate an API key in your API panel (2,000 searches/day and 50 downloads/day on the free tier).
2. Open your Vercel project → **Settings** → **Environment Variables**.
3. Add `SUBDL_API_KEY` with your key value, select **Production, Preview, and Development**, and click **Save**.
4. Redeploy your latest commit so `/api/subtitles` picks up the key.

## Local Development

```bash
npm install
# Create .env.local with: SUBDL_API_KEY=your_key_here
npm run dev
```

## Verification Checklist (Post-Deploy)

After deploying with `SUBDL_API_KEY` set:
1. Run `npx tsc --noEmit && npm run build` locally to confirm zero TypeScript or Next.js build errors.
2. Test **Episodes 1, 6, 12, 18, and 24** across **Server 1, Server 2, and Server 3** in both **Arabic CC** and **English CC**.
3. Spot-check subtitle sync at **00:30**, **10:00**, and **20:00**, plus pause/resume, forward/backward seeking, Arabic RTL punctuation, and fullscreen captions.

---

[© 2026 Ziad Karem (@ziadkarem00) · All rights reserved](https://github.com/ziadkarem00)
