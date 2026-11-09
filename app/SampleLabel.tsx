// Who the sample diary in public/sample/ is, so testers can judge its picks. Keep in sync with the CSVs.
export function SampleLabel({ ref }: { ref: React.Ref<HTMLDialogElement> }) {
  return (
    <dialog
      ref={ref}
      className="label-dialog"
      aria-labelledby="sample-label-title"
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <div className="label-card">
        <form method="dialog">
          <button className="label-close" aria-label="Close">
            ×
          </button>
        </form>
        <div className="label-top">
          <span>
            FROM <b>Unboxd sample shelf</b>
          </span>
          <span className="barcode" aria-hidden="true" />
        </div>
        <div className="label-to">
          <small>SHIP TO</small>
          <h2 id="sample-label-title">The sample diary</h2>
          <p>
            A demo profile written by hand for trying Unboxd, not a real Letterboxd member. Recommendations
            are generated live from it.
          </p>
        </div>
        <dl className="label-stats">
          {[
            ["Watched", 51],
            ["Rated", 47],
            ["Liked", 12],
            ["Watchlist", 12],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <section>
          <h3>Contents</h3>
          <p>
            Mostly English-language films from the 2010s and 2020s, logged across 2024 and 2025, plus two
            non-English favorites.
          </p>
        </section>
        <section>
          <h3 className="love">Loves</h3>
          <ul>
            <li>
              <b>Smart sci-fi:</b> Arrival, Blade Runner 2049, Dune: Part Two
            </li>
            <li>
              <b>Auteur thrillers:</b> Parasite, Get Out, Prisoners
            </li>
            <li>
              <b>Small, personal dramas:</b> Lady Bird, Moonlight, Past Lives
            </li>
            <li>
              <b>Inventive animation:</b> Spirited Away, Into the Spider-Verse
            </li>
          </ul>
        </section>
        <section>
          <h3>Shrugs at</h3>
          <p>Twisty crowd-pleasers that don&apos;t land: Tenet, Glass Onion, The Menu.</p>
        </section>
        <section className="fragile">
          <h3>Fragile: can&apos;t stand</h3>
          <p>Franchise filler: Morbius, Madame Web, Fast X, Transformers: Age of Extinction.</p>
        </section>
        <footer>
          <span>Rewatched: Into the Spider-Verse ×2, Arrival, Mad Max: Fury Road</span>
          <span>Watchlist leans older and non-English: Seven Samurai, Perfect Days, In the Mood for Love</span>
        </footer>
      </div>
    </dialog>
  );
}
