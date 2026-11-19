import { NextResponse } from "next/server";
import {
  DORORO_MAL_ID,
  FALLBACK_EPISODES,
  TOTAL_EPISODES,
  getArcForEpisode,
} from "@/lib/dororo-data";
import type { Episode } from "@/types/dororo";

interface JikanEpisode {
  mal_id: number;
  title?: string;
  title_romanji?: string | null;
  title_japanese?: string | null;
  aired?: string | null;
  filler?: boolean;
}

async function fetchJikanWithRetry(url: string, retries = 2): Promise<JikanEpisode[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Abdulrahman-Dororo/1.0",
        },
        next: { revalidate: 86400 },
      });

      if (res.status === 429 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }

      if (!res.ok) return [];
      const json = (await res.json()) as { data?: JikanEpisode[] };
      return Array.isArray(json.data) ? json.data : [];
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  return [];
}

export async function GET() {
  const jikanList = await fetchJikanWithRetry(
    `https://api.jikan.moe/v4/anime/${DORORO_MAL_ID}/episodes?page=1`
  );

  const byNumber = new Map<number, JikanEpisode>();
  for (const item of jikanList) {
    if (item.mal_id >= 1 && item.mal_id <= TOTAL_EPISODES) {
      byNumber.set(item.mal_id, item);
    }
  }

  const episodes: Episode[] = FALLBACK_EPISODES.map((fallback) => {
    const live = byNumber.get(fallback.number);
    if (!live) return fallback;

    const arc = getArcForEpisode(fallback.number);
    return {
      number: fallback.number,
      title: live.title?.trim() || fallback.title,
      romajiTitle: live.title_romanji?.trim() || fallback.romajiTitle,
      japaneseTitle: live.title_japanese?.trim() || fallback.japaneseTitle,
      aired: live.aired ? live.aired.slice(0, 10) : fallback.aired,
      arcId: arc.arcId,
      arcName: arc.arcName,
      filler: Boolean(live.filler),
    };
  });

  return NextResponse.json(
    {
      episodes,
      source: jikanList.length > 0 ? "jikan" : "fallback",
      total: TOTAL_EPISODES,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
