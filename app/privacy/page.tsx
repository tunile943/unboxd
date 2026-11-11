import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";

export const metadata: Metadata = {
  title: "Privacy · Unboxd",
  description: "What Unboxd keeps in your browser, what goes to the server, and how to clear it.",
};

const SERVICES = [
  ["TMDB", "Posters come from TMDB's image server, which sees your IP address like any website does."],
  ["YouTube", "Trailers load from youtube-nocookie.com, and only once you press play. From then on, Google's privacy policy applies."],
  ["JustWatch", "Where-to-watch data is from JustWatch (via TMDB). The links are plain links; I don't earn anything from them."],
  ["Vercel", "Hosts the site and counts visits with Web Analytics (no cookies, nothing that follows you around the web)."],
];

export default function Privacy() {
  return (
    <InfoPage path="/privacy">
      <div className="info-head">
        <p className="stamp">Last updated 10 Nov 2026</p>
        <h1>Privacy</h1>
        <p className="lede">Short version: your films stay on your device, and I don&apos;t want your data (no accounts, no ads, nothing to sell).</p>
      </div>

      <section>
        <h2>What stays in your browser</h2>
        <p>Your export is opened right here, on your device. Unboxd reads 5 of its files (watched, diary, ratings, likes, watchlist); your reviews and everything else in the ZIP are never touched.</p>
        <p>So you don&apos;t have to upload again next time, your films, matches, match fixes and picks are saved in this browser. Your settings (theme, motion, watch region) live there too.</p>
        <p className="note"><b>Want it gone?</b> Choose <b>Clear data</b> on your results and your films, matches and picks are wiped from this browser. Clearing the site&apos;s data in your browser settings removes everything, settings included.</p>
      </section>

      <section>
        <h2>What goes to the server</h2>
        <p>Matching films and picking recommendations happen on the server, so those 5 lists go there, trimmed to what it needs (titles, years, ratings, rewatches, watch dates). Letterboxd links, tags and the rest are stripped out in your browser first. Each request is answered and then thrown away; there&apos;s no user database and nothing is logged against you.</p>
        <p>The server does keep a cache of TMDB lookups (a film&apos;s genres, cast, keywords) for 1 to 14 days. It&apos;s shared by everyone and has no idea who asked.</p>
      </section>

      <section>
        <h2>Other services your browser talks to</h2>
        <dl className="services">
          {SERVICES.map(([name, text]) => (
            <div key={name}><dt>{name}</dt><dd>{text}</dd></div>
          ))}
        </dl>
      </section>

      <section>
        <h2>What Unboxd doesn&apos;t do</h2>
        <ul>
          <li>No accounts or sign-in.</li>
          <li>No ads or trackers.</li>
          <li>No selling or sharing your data.</li>
          <li>No scraping Letterboxd; it only knows what&apos;s in the export you upload.</li>
        </ul>
      </section>

      <section className="ask">
        <h2>Something look wrong?</h2>
        <p>Unboxd is a personal, open-source project, so you can check all of this in the code. Or just open an issue on <a href="https://github.com/tunile943/unboxd">GitHub</a>.</p>
      </section>
    </InfoPage>
  );
}
