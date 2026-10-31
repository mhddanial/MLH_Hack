import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AOI-Lite Batam: AI-Assisted SMT Inspection",
  description:
    "Human-in-the-loop AI-assisted Surface-Mount Technology (SMT) PCB inspection and quality-record system powered by multimodal Gemma 4 for Batam electronics manufacturers and SMK labs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-[#ffffff] text-[#161616] antialiased">
        {children}
      </body>
    </html>
  );
}
