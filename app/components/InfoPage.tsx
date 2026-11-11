import Link from "next/link";
import { Footer } from "./Footer";
import { Wordmark } from "./Logo";
import { SettingsMenu } from "./SettingsMenu";

const PAGES = [["/how-it-works", "How it works"], ["/privacy", "Privacy"]] as const;

/** The shell for the static pages: wordmark home, page links, settings, then the page and the footer. */
export function InfoPage({ path, wide = false, children }:
  { path: (typeof PAGES)[number][0]; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="page">
      <header className="landing-nav info-nav">
        <Link href="/" className="wm-link"><Wordmark /></Link>
        <nav aria-label="Pages">
          {PAGES.map(([href, label]) => (
            <Link key={href} href={href} aria-current={href === path ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
        <SettingsMenu />
      </header>
      <main className={`info${wide ? " wide" : ""}`}>{children}</main>
      <Footer />
    </div>
  );
}
