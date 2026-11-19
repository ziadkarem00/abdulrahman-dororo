import type { ArcId, Episode, StoryArc, StreamServer } from "@/types/dororo";

export const DORORO_ANILIST_ID = 101347;
export const DORORO_MAL_ID = 37520;
export const DORORO_IMDB_ID = "tt9458304";
export const TOTAL_EPISODES = 24;

// Hide AnimeEmbed's built-in settings, captions, fullscreen, and PiP buttons
// so our synced Arabic/English overlay and custom fullscreen wrapper control everything cleanly.
const COMMON_EMBED_PARAMS =
  "captions=off&hide=settings,captions,fullscreen,pip&accent=c81e1e&autoSkip=1";

export const STREAM_SERVERS: StreamServer[] = [
  {
    id: "primary",
    label: "Server 1 • Primary",
    shortLabel: "Server 1",
    badge: "SUB",
    description: "AniList Primary Stream (Japanese Audio)",
    buildUrl: (ep: number) =>
      `https://animeembed.com/embed/ani/${DORORO_ANILIST_ID}/${ep}?track=sub&server=1&${COMMON_EMBED_PARAMS}`,
  },
  {
    id: "mal-mirror",
    label: "Server 2 • MAL Mirror",
    shortLabel: "Server 2",
    badge: "SUB",
    description: "MyAnimeList Backup Mirror (Japanese Audio)",
    buildUrl: (ep: number) =>
      `https://animeembed.com/embed/mal/${DORORO_MAL_ID}/${ep}?track=sub&server=2&${COMMON_EMBED_PARAMS}`,
  },
  {
    id: "dub",
    label: "Server 3 • English Dub",
    shortLabel: "Server 3 • Dub",
    badge: "DUB",
    description: "English Dubbed Audio Stream",
    buildUrl: (ep: number) =>
      `https://animeembed.com/embed/ani/${DORORO_ANILIST_ID}/${ep}?track=dub&${COMMON_EMBED_PARAMS}`,
  },
];

export const STORY_ARCS: StoryArc[] = [
  {
    id: "all",
    name: "All Episodes",
    shortName: "All (1–24)",
    startEpisode: 1,
    endEpisode: 24,
    description: "Complete 24-episode 2019 adaptation by MAPPA & Tezuka Productions.",
  },
  {
    id: "awakening",
    name: "Awakening & First Senses",
    shortName: "Ep 1–6",
    startEpisode: 1,
    endEpisode: 6,
    description: "Daigo's pact, Jukai's prosthetics, and Hyakkimaru reclaiming pain, hearing, and voice.",
  },
  {
    id: "sengoku-roads",
    name: "Roads of the Sengoku",
    shortName: "Ep 7–12",
    startEpisode: 7,
    endEpisode: 12,
    description: "Dororo's past, Tahōmaru's rise, and the bloody confrontation at Fort Banmon.",
  },
  {
    id: "hidden-map",
    name: "The Hidden Map & Cape Hakkotsu",
    shortName: "Ep 13–18",
    startEpisode: 13,
    endEpisode: 18,
    description: "The map on Dororo's back, Sabame's village, and the clash at the Cape of No Mercy.",
  },
  {
    id: "twelve-demons",
    name: "The Twelve Demons & Hall of Hell",
    shortName: "Ep 19–24",
    startEpisode: 19,
    endEpisode: 24,
    description: "Hyakkimaru's return to Daigo's land and the final reckoning for his humanity.",
  },
];

export function getArcForEpisode(ep: number): {
  arcId: Exclude<ArcId, "all">;
  arcName: string;
} {
  if (ep <= 6) {
    return { arcId: "awakening", arcName: "Awakening & First Senses" };
  }
  if (ep <= 12) {
    return { arcId: "sengoku-roads", arcName: "Roads of the Sengoku" };
  }
  if (ep <= 18) {
    return { arcId: "hidden-map", arcName: "The Hidden Map & Cape Hakkotsu" };
  }
  return { arcId: "twelve-demons", arcName: "The Twelve Demons & Hall of Hell" };
}

export const FALLBACK_EPISODES: Episode[] = [
  {
    number: 1,
    title: "The Story of Daigo",
    romajiTitle: "Daigo no Maki",
    japaneseTitle: "醍醐の巻",
    aired: "2019-01-07",
    ...getArcForEpisode(1),
    filler: false,
  },
  {
    number: 2,
    title: "The Story of Bandai",
    romajiTitle: "Bandai no Maki",
    japaneseTitle: "万代の巻",
    aired: "2019-01-14",
    ...getArcForEpisode(2),
    filler: false,
  },
  {
    number: 3,
    title: "The Story of Jukai",
    romajiTitle: "Jukai no Maki",
    japaneseTitle: "寿海の巻",
    aired: "2019-01-21",
    ...getArcForEpisode(3),
    filler: false,
  },
  {
    number: 4,
    title: "The Story of the Cursed Sword",
    romajiTitle: "Yōtō no Maki",
    japaneseTitle: "妖刀の巻",
    aired: "2019-01-28",
    ...getArcForEpisode(4),
    filler: false,
  },
  {
    number: 5,
    title: "The Story of the Moriko Song: Part 1",
    romajiTitle: "Moriko Uta no Maki-jō",
    japaneseTitle: "守小唄の巻・上",
    aired: "2019-02-04",
    ...getArcForEpisode(5),
    filler: false,
  },
  {
    number: 6,
    title: "The Story of the Moriko Song: Part 2",
    romajiTitle: "Moriko Uta no Maki-ge",
    japaneseTitle: "守小唄の巻・下",
    aired: "2019-02-11",
    ...getArcForEpisode(6),
    filler: false,
  },
  {
    number: 7,
    title: "The Story of the Jorogumo Silk Spider",
    romajiTitle: "Jorōgumo no Maki",
    japaneseTitle: "絡新婦の巻",
    aired: "2019-02-18",
    ...getArcForEpisode(7),
    filler: false,
  },
  {
    number: 8,
    title: "The Story of Saru",
    romajiTitle: "Saru no Maki",
    japaneseTitle: "さるの巻",
    aired: "2019-02-25",
    ...getArcForEpisode(8),
    filler: false,
  },
  {
    number: 9,
    title: "The Story of the Merciless",
    romajiTitle: "Muzanchō no Maki",
    japaneseTitle: "無残帳の巻",
    aired: "2019-03-04",
    ...getArcForEpisode(9),
    filler: false,
  },
  {
    number: 10,
    title: "The Story of Tahōmaru",
    romajiTitle: "Tahōmaru no Maki",
    japaneseTitle: "多宝丸の巻",
    aired: "2019-03-11",
    ...getArcForEpisode(10),
    filler: false,
  },
  {
    number: 11,
    title: "The Story of Banmon: Part 1",
    romajiTitle: "Banmon no Maki-jō",
    japaneseTitle: "ばんもんの巻・上",
    aired: "2019-03-18",
    ...getArcForEpisode(11),
    filler: false,
  },
  {
    number: 12,
    title: "The Story of Banmon: Part 2",
    romajiTitle: "Banmon no Maki-ge",
    japaneseTitle: "ばんもんの巻・下",
    aired: "2019-03-25",
    ...getArcForEpisode(12),
    filler: false,
  },
  {
    number: 13,
    title: "The Story of the Blank-faced Buddha",
    romajiTitle: "Hakumen Fudō no Maki",
    japaneseTitle: "白面不動の巻",
    aired: "2019-04-08",
    ...getArcForEpisode(13),
    filler: false,
  },
  {
    number: 14,
    title: "The Story of Sabame",
    romajiTitle: "Saba-Me no Maki",
    japaneseTitle: "鯖目の巻",
    aired: "2019-04-15",
    ...getArcForEpisode(14),
    filler: false,
  },
  {
    number: 15,
    title: "The Story of the Scene from Hell",
    romajiTitle: "Jigokuhen no Maki",
    japaneseTitle: "地獄変の巻",
    aired: "2019-04-22",
    ...getArcForEpisode(15),
    filler: false,
  },
  {
    number: 16,
    title: "The Story of Shiranui",
    romajiTitle: "Shiranui no Maki",
    japaneseTitle: "しらぬいの巻",
    aired: "2019-04-29",
    ...getArcForEpisode(16),
    filler: false,
  },
  {
    number: 17,
    title: "The Story of Questions and Answers",
    romajiTitle: "Mondō no Maki",
    japaneseTitle: "問答の巻",
    aired: "2019-05-06",
    ...getArcForEpisode(17),
    filler: false,
  },
  {
    number: 18,
    title: "The Story of the Cape of No Mercy",
    romajiTitle: "Mujō misaki no maki",
    japaneseTitle: "無常岬の巻",
    aired: "2019-05-13",
    ...getArcForEpisode(18),
    filler: false,
  },
  {
    number: 19,
    title: "The Story of the Amanojaku",
    romajiTitle: "Amanojaku no maki",
    japaneseTitle: "天邪鬼の巻",
    aired: "2019-05-20",
    ...getArcForEpisode(19),
    filler: false,
  },
  {
    number: 20,
    title: "The Story of the Nue",
    romajiTitle: "Nue no maki",
    japaneseTitle: "鵺の巻",
    aired: "2019-05-27",
    ...getArcForEpisode(20),
    filler: false,
  },
  {
    number: 21,
    title: "The Story of Breaking the Cycle of Suffering",
    romajiTitle: "Gyakuru no maki",
    japaneseTitle: "逆流の巻",
    aired: "2019-06-03",
    ...getArcForEpisode(21),
    filler: false,
  },
  {
    number: 22,
    title: "The Story of Nui",
    romajiTitle: "Nui no maki",
    japaneseTitle: "縫の巻",
    aired: "2019-06-10",
    ...getArcForEpisode(22),
    filler: false,
  },
  {
    number: 23,
    title: "The Story of the Demons",
    romajiTitle: "Kishin no maki",
    japaneseTitle: "鬼神の巻",
    aired: "2019-06-17",
    ...getArcForEpisode(23),
    filler: false,
  },
  {
    number: 24,
    title: "Dororo and Hyakkimaru",
    romajiTitle: "Dororo to Hyakkimaru",
    japaneseTitle: "どろろと百鬼丸",
    aired: "2019-06-24",
    ...getArcForEpisode(24),
    filler: false,
  },
];
