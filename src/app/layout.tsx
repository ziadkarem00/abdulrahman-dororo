import type { Metadata, Viewport } from "next";
import { Cairo, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Abdulrahman-Dororo — Dororo (2019) Private Theater",
  description:
    "Dedicated single-series theater for Dororo (2019) — all 24 episodes with synced Arabic & English subtitles, 3 streaming servers, and automatic watch progress.",
};

export const viewport: Viewport = {
  themeColor: "#09090B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${cairo.variable} dark`}
    >
      <body className="font-sans bg-obsidian text-zinc-100 antialiased selection:bg-vermilion/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
