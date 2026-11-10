import type { Extras, Offer, Pick } from "@/lib/export";
import { languageName, regionName } from "@/lib/regions";
import { Trailer } from "./Trailer";

export const facts = (p: Pick) =>
  [p.runtime && `${p.runtime} min`, p.genres.join(", "), p.director].filter(Boolean).join(" · ");

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

export function ProviderLogo({ offer }: { offer: Offer }) {
  return offer.logo ? (
    <img className="u-plogo" src={`https://image.tmdb.org/t/p/w45${offer.logo}`} alt="" width={22} height={22} loading="lazy" />
  ) : (
    <span className="u-plogo" aria-hidden="true">{offer.name[0]}</span>
  );
}

/** The full view of a pick: the desktop drawer's body, and a phone card's expanded part. */
export function FilmDetails({ pick, extras, region, autoplay = false, inCard = false }:
  { pick: Pick; extras: Extras | null | undefined; region: string; autoplay?: boolean; inCard?: boolean }) {
  const p = extras?.providers;
  const store = p ? [...new Map([...p.rent, ...p.buy].map((o) => [o.name, o])).values()] : []; // stores usually do both
  const groups = p ? ([["Stream", p.stream], ["Rent or buy", store]] as const).filter(([, o]) => o.length) : [];
  const meta = [pick.language && languageName(pick.language),
    pick.vote_count > 0 && `TMDB ${pick.vote_average.toFixed(1)} (${compact(pick.vote_count)} votes)`].filter(Boolean);

  return (
    <div className="u-details">
      {extras?.trailer && (
        <Trailer key={extras.trailer.key} videoKey={extras.trailer.key} title={pick.title} poster={pick.poster_path} autoplay={autoplay} />
      )}
      <p className="u-facts">{[!inCard && facts(pick), ...meta].filter(Boolean).join(" · ")}</p>
      {pick.overview && <p className="u-syn">{pick.overview}</p>}
      {(pick.director || pick.cast.length > 0) && (
        <dl className="u-credits">
          {pick.director && <div><dt>Director</dt><dd>{pick.director}</dd></div>}
          {pick.cast.length > 0 && <div><dt>Starring</dt><dd>{pick.cast.join(", ")}</dd></div>}
        </dl>
      )}
      <section className="u-where" aria-label="Where to watch">
        <h4>Where to watch · {regionName(region)}</h4>
        {extras === undefined ? (
          <p className="fine">Checking…</p>
        ) : extras === null ? (
          <p className="fine">Couldn&apos;t load where to watch.</p>
        ) : groups.length ? (
          groups.map(([label, offers]) => (
            <div key={label} className="u-offers">
              <span className="u-olabel">{label}</span>
              <ul>
                {offers.map((o) => (
                  <li key={o.name}>
                    {p!.link ? (
                      <a href={p!.link} target="_blank" rel="noreferrer"><ProviderLogo offer={o} />{o.name}</a>
                    ) : (
                      <span><ProviderLogo offer={o} />{o.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="fine">Not available to stream, rent or buy in {regionName(region)}.</p>
        )}
        {groups.length > 0 && <p className="fine">Availability by JustWatch</p>}
      </section>
      <p className="u-links">
        <a href={`https://letterboxd.com/tmdb/${pick.tmdb_id}`} target="_blank" rel="noreferrer">Letterboxd ↗</a>
        <a href={`https://www.themoviedb.org/movie/${pick.tmdb_id}`} target="_blank" rel="noreferrer">TMDB ↗</a>
      </p>
    </div>
  );
}
