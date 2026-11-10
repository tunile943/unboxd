import type { Extras, Pick } from "@/lib/export";
import { regionName } from "@/lib/regions";
import { FilmDetails, facts, ProviderLogo } from "./FilmDetails";

export type OpenDetails = (pick: Pick, opts: { play: boolean; button: HTMLButtonElement }) => void;

function Availability({ title, extras, region }: { title: string; extras: Extras | null | undefined; region: string }) {
  if (extras === undefined) return <span className="u-avail loading" aria-hidden="true" />;
  if (extras === null) return null;
  const { link, stream, rent, buy } = extras.providers;
  if (stream.length) {
    const shown = stream.slice(0, 2);
    const more = stream.length - shown.length;
    const names = stream.map((o) => o.name).join(", ");
    const body = (
      <>
        {shown.map((o) => <ProviderLogo key={o.name} offer={o} />)}
        <span aria-hidden="true">{shown.length === 1 && !more ? shown[0].name : more ? `+${more}` : ""}</span>
        <span className="sr-only">Stream {title} on {names}</span>
      </>
    );
    return link ? (
      <a className="u-avail" href={link} target="_blank" rel="noreferrer" title={`Stream on ${names}`}>{body}</a>
    ) : (
      <span className="u-avail" title={`Stream on ${names}`}>{body}</span>
    );
  }
  if (rent.length || buy.length) {
    const body = <>Rent or buy<span className="sr-only"> {title}</span></>;
    return link ? (
      <a className="u-avail" href={link} target="_blank" rel="noreferrer">{body}</a>
    ) : (
      <span className="u-avail">{body}</span>
    );
  }
  return <span className="u-avail none">Not streaming in {regionName(region)}</span>;
}

export function PickCard({ pick, index, extras, region, phone, expanded, onDetails }: {
  pick: Pick; index: number; extras: Extras | null | undefined; region: string;
  phone: boolean; expanded: { play: boolean } | null; onDetails: OpenDetails;
}) {
  const line = facts(pick);
  return (
    <li className={`u-card${expanded ? " open" : ""}`} style={{ "--d": `${0.08 + Math.min(index, 8) * 0.05}s` } as React.CSSProperties}>
      {pick.poster_path ? (
        <img className="poster" src={`https://image.tmdb.org/t/p/w154${pick.poster_path}`} alt="" width={52} height={78} loading="lazy" />
      ) : (
        <span className="poster" style={{ "--c": `var(--po${(index % 6) + 1})` } as React.CSSProperties}>{pick.title}</span>
      )}
      <div>
        <h3>{pick.title} <span>{pick.year}</span></h3>
        <p>{pick.reason}</p>
        {line && <p className="u-facts">{line}</p>}
        {(pick.on_watchlist || pick.bridge_label || pick.new_label) && (
          <div className="u-stk">
            {pick.on_watchlist && <span className="badge">★ on your watchlist</span>}
            {pick.bridge_label && <span className="sticker">{pick.bridge_label}</span>}
            {pick.new_label && <span className="sticker new">new: {pick.new_label}</span>}
          </div>
        )}
      </div>
      <div className="u-actions">
        {extras?.trailer && (
          <button className="u-act play" type="button" aria-haspopup={phone ? undefined : "dialog"}
                  onClick={(e) => onDetails(pick, { play: true, button: e.currentTarget })}>
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M6 4l15 8-15 8z" fill="currentColor" /></svg>
            Trailer<span className="sr-only"> for {pick.title}</span>
          </button>
        )}
        <Availability title={pick.title} extras={extras} region={region} />
        <button className="u-act more" type="button"
                aria-expanded={phone ? !!expanded : undefined} aria-haspopup={phone ? undefined : "dialog"}
                onClick={(e) => onDetails(pick, { play: false, button: e.currentTarget })}>
          {phone && expanded ? "Less" : "Details"}<span className="sr-only"> about {pick.title}</span>
        </button>
      </div>
      {phone && expanded && (
        <div className="u-inline">
          <FilmDetails key={String(expanded.play)} pick={pick} extras={extras} region={region} autoplay={expanded.play} inCard />
        </div>
      )}
    </li>
  );
}
