import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Creative Reference Assistant",
  description:
    "Turn a creative brief and your own reference folder into an explainable, accessible visual board.",
  applicationName: "Creative Reference Assistant",
  keywords: ["creative direction", "moodboard", "visual references", "design workflow"],
  openGraph: {
    title: "Creative Reference Assistant",
    description:
      "Build explainable visual reference boards from your creative brief.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Creative Reference Assistant",
    description:
      "Build explainable visual reference boards from your creative brief.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider delay={300}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
