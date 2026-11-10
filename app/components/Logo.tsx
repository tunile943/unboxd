// Flap-o: an isometric kraft box with a light-green inside. Full cut (two front flaps) for 24 px and up,
// small cut (no flaps) below that: the favicon, the "o" in the wordmark and the tab glyph.
export function BoxMark({ small = false, className }: { small?: boolean; className?: string }) {
  if (small)
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        <polygon points="8,22 32,10 32,18 16,26" fill="var(--i-wall)" />
        <polygon points="56,22 32,10 32,18 48,26" fill="var(--i-wall2)" />
        <polygon points="16,26 32,18 48,26 32,34" fill="var(--i-floor)" />
        <polygon points="8,22 32,34 32,58 8,46" fill="var(--i-l)" stroke="var(--lgap)" strokeWidth="2.5" strokeLinejoin="round" />
        <polygon points="32,34 56,22 56,46 32,58" fill="var(--i-r)" stroke="var(--lgap)" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g transform="translate(0 -3)" stroke="var(--lgap)" strokeWidth="1.6" strokeLinejoin="round">
        <polygon points="12,24 32,14 32,22 20,28" fill="var(--i-wall)" stroke="none" />
        <polygon points="52,24 32,14 32,22 44,28" fill="var(--i-wall2)" stroke="none" />
        <polygon points="20,28 32,22 44,28 32,34" fill="var(--i-floor)" stroke="none" />
        <polygon points="12,24 32,34 32,57 12,47" fill="var(--i-l)" />
        <polygon points="32,34 52,24 52,47 32,57" fill="var(--i-r)" />
        <polygon points="12,24 32,34 23,40 3,30" fill="var(--i-ffl)" />
        <polygon points="32,34 52,24 61,30 41,40" fill="var(--i-ffr)" />
      </g>
    </svg>
  );
}

/** "Un" orange, "box" green with the box as its "o", "d" blue. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`wm ${className ?? ""}`} role="img" aria-label="Unboxd">
      <span className="o">Un</span>
      <span className="g">b</span>
      <BoxMark small className="og" />
      <span className="g">x</span>
      <span className="b">d</span>
    </span>
  );
}
