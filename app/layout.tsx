import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Karla } from "next/font/google";
import { SettingsProvider, THEME_SCRIPT } from "./settings";
import "./styles/tokens.css";
import "./globals.css";
import "./styles/landing.css";
import "./styles/results.css";
import "./styles/card.css";
import "./styles/settings.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "800"], variable: "--font-display" });
const body = Karla({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Unboxd",
  description: "A Letterboxd recommender. Two boxes of films, carefully packed from your ratings.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme / data-motion are set before paint by THEME_SCRIPT, so the server markup differs on purpose.
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
        <Analytics />
      </body>
    </html>
  );
}
