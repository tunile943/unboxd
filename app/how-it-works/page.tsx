import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "../components/InfoPage";

export const metadata: Metadata = {
  title: "How it works · Unboxd",
  description: "How Unboxd gets from your Letterboxd ratings to two boxes of films.",
};

const poster = (path: string) => `https://image.tmdb.org/t/p/w154${path}`;

const DIARY = [
  { title: "Arrival", year: 2016, rated: "★★★★★ · liked", weight: "+0.95", poster: "/pEzNVQfdzYDzVK0XqxERIw2x2se.jpg" },
  { title: "Sicario", year: 2015, rated: "★★★★½", weight: "+0.70", poster: "/lz8vNyXeidqqOdJW9ZjnDAMb5Vr.jpg" },
  { title: "A loud action sequel", year: null, rated: "★★", weight: "−0.60", poster: null },
];

// [facet, [chip, liked?, strong?]]
const TASTE: [string, [string, boolean, boolean?][]][] = [
  ["People", [["Denis Villeneuve", true, true], ["Roger Deakins", true]]],
  ["Form", [["Thriller", true], ["2010s", true], ["Action", false]]],
  ["Place", [["US · English", true]]],
  ["Theme", [["moral dilemma", true], ["grief", true]]],
];

const QUESTIONS = [
  ["Why is Boxd Out so different?",
    "That's the point. It skips the genres, decades and languages you watch most, then keeps only films that share a director, actor or theme with your favorites. Some will miss; that's the cost of looking outside the box."],
  ["Why does a film “need a check”?",
    "Letterboxd's export has titles and years, not IDs, so every film is looked up on TMDB. When 2 films share a name, or the year is off by 1, Unboxd flags it instead of guessing. Pick the right one in Match review and your picks update."],
  ["It recommended a film I've already seen",
    "Then it's probably not in your export (watched but never logged), or it was matched to the wrong TMDB entry. Check Your data; a fix in Match review sticks, even after an update."],
  ["How do I get new picks after watching more?",
    "Export again from Letterboxd and choose Update. Only the new films get looked up, and your match fixes stay."],
  ["Why is the first upload slow?",
    "Every film has to be looked up on TMDB the first time (around 30 seconds for a big diary). After that it's saved in your browser, so coming back is instant."],
  ["Does it compare me with other users?",
    "No. There are no users to compare you with; Unboxd reads your export and TMDB, and that's it."],
];

function Box({ mode, question, title, year, path, why }:
  { mode: "in" | "out"; question: string; title: string; year: number; path: string; why: string }) {
  return (
    <div className={`how-box ${mode}`}>
      <h3>{mode === "in" ? "Boxd In" : "Boxd Out"} <span>· {question}</span></h3>
      <div className="how-film">
        <img src={poster(path)} alt="" width={64} height={96} loading="lazy" />
        <p><b>{title}</b><small>{year} · Denis Villeneuve</small>{why}</p>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <InfoPage path="/how-it-works" wide>
      <div className="info-head">
        <h1>Why did I get this film?</h1>
        <p className="lede">Unboxd only knows your Letterboxd ratings. Here&apos;s how it gets from those to 2 boxes, using a tiny example diary (real ones have hundreds of films).</p>
      </div>

      <section className="how-step" aria-labelledby="s1">
        <div>
          <p className="kick">1 · Your diary</p>
          <h2 id="s1">You, compared with you</h2>
          <p>Your ratings are ranked against each other, not against everyone&apos;s. A 3.5 from a tough rater counts for more than a 3.5 from someone who gives everything 4 stars. Likes and rewatches break ties; your lowest-rated films count against.</p>
        </div>
        <ul className="how-diary" aria-label="Example diary">
          {DIARY.map((f) => (
            <li key={f.title}>
              {f.poster ? <img src={poster(f.poster)} alt="" width={36} height={54} loading="lazy" /> : <span className="ps" />}
              <span><b>{f.title}</b>{f.year && ` ${f.year}`}<small>{f.rated}</small></span>
              <b className={f.weight.startsWith("+") ? "w pos" : "w neg"}>{f.weight}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="how-step" aria-labelledby="s2">
        <div>
          <p className="kick">2 · Your taste</p>
          <h2 id="s2">What your favorites share</h2>
          <p>Every film is made of 4 things: people, form, place and theme. 2 Villeneuve films near the top make him a strong signal; the sequel you didn&apos;t like pulls action down a bit.</p>
        </div>
        <dl className="how-taste">
          {TASTE.map(([facet, chips]) => (
            <div key={facet}>
              <dt>{facet}</dt>
              <dd>
                {chips.map(([name, up, strong]) => (
                  <span key={name} className={`chip${up ? "" : " down"}${strong ? " strong" : ""}`}>
                    {name} <span aria-hidden="true">{up ? (strong ? "↑↑" : "↑") : "↓"}</span>
                    <span className="sr-only">{up ? (strong ? ", strong" : ", up") : ", down"}</span>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="how-step stack" aria-labelledby="s3">
        <div>
          <p className="kick">3 · Two boxes</p>
          <h2 id="s3">Same taste, 2 questions</h2>
          <p>Candidates come from TMDB&apos;s suggestions for your favorites, plus searches for the directors and themes you rate highest. Then each box asks something different.</p>
        </div>
        <div className="how-boxes">
          <Box mode="in" question="“How close is it?”" title="Prisoners" year={2013} path="/uhviyknTT5cEQXbn6vWIqfM4vGm.jpg"
               why="Another Villeneuve thriller, close on all 4 and well rated on TMDB." />
          <Box mode="out" question="“New, but with a bridge?”" title="Incendies" year={2010} path="/yH6DAQVgbyj72S66gN4WWVoTjuf.jpg"
               why="A French-language drama you probably wouldn't have found, with a director you already love as the way in." />
        </div>
        <p className="muted">Each box is then mixed so it isn&apos;t 10 films by the same director, and anything you&apos;ve seen is left out. The line on each card (&ldquo;Because you liked Arrival and Sicario&rdquo;) tells you where it came from.</p>
      </section>

      <section className="how-faq" aria-labelledby="faq">
        <h2 id="faq">Questions</h2>
        <div>
          {QUESTIONS.map(([q, a], i) => (
            <details key={q} open={i === 0}>
              <summary>{q}<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <p className="muted">Curious where your data goes? See <Link href="/privacy">Privacy</Link>. Something else? Open an issue on <a href="https://github.com/tunile943/unboxd">GitHub</a>.</p>
      </section>
    </InfoPage>
  );
}
