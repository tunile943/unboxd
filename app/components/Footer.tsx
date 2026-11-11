import Link from "next/link";

export function Footer() {
  return (
    <footer className="u-foot">
      <nav aria-label="Site">
        <Link href="/how-it-works">How it works</Link>
        <Link href="/privacy">Privacy</Link>
        <a href="https://github.com/tunile943/unboxd">GitHub</a>
      </nav>
      <p>
        Unboxd is a non-commercial fan project. This product uses the TMDB API but is not endorsed or certified by TMDB.
        Streaming availability by JustWatch. Not affiliated with Letterboxd.
      </p>
    </footer>
  );
}
