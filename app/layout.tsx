import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WavesBackground } from "@/components/waves-background";
import { SponsorStrip } from "@/components/sponsor-strip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Snitch",
  description: "Evidence-per-claim incident response console",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WavesBackground />
        <div className="flex flex-1 flex-col">{children}</div>
        <SponsorStrip />
      </body>
    </html>
  );
}
