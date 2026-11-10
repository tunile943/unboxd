"use client";

import { useState } from "react";

/** Nothing loads from YouTube until Play: a click swaps the button for the (no-cookie) player. */
export function Trailer({ videoKey, title, poster, autoplay = false }:
  { videoKey: string; title: string; poster: string | null; autoplay?: boolean }) {
  const [playing, setPlaying] = useState(autoplay);
  if (playing) {
    return (
      <div className="u-trailer">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0`}
          title={`${title} trailer`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <button className="u-trailer facade" type="button" onClick={() => setPlaying(true)} aria-label={`Play ${title} trailer`}
            style={poster ? { "--bgimg": `url(https://image.tmdb.org/t/p/w342${poster})` } as React.CSSProperties : undefined}>
      <span className="pb" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 4l14 8-14 8z" fill="currentColor" /></svg>
      </span>
      <small>Trailer · YouTube</small>
    </button>
  );
}
