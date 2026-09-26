import { useEffect, useState } from "react";
import { BASE, type Tour, type TourSummary, km, nearestMedia, pointAt } from "./types";
import TourMap from "./components/TourMap";
import MediaStrip from "./components/MediaStrip";
import ElevationProfile from "./components/ElevationProfile";
import Viewer from "./components/Viewer";

const hashSlug = () => decodeURIComponent(location.hash.slice(1));

export default function App() {
  const [tours, setTours] = useState<TourSummary[] | null>(null);
  const [slug, setSlug] = useState(hashSlug);
  const [tour, setTour] = useState<Tour | null>(null);
  const [active, setActive] = useState(-1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [scrubD, setScrubD] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${BASE}tours/index.json`).then((r) => r.json()).then(setTours).catch(() => setTours([]));
    const onHash = () => setSlug(hashSlug());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const current = slug || tours?.[0]?.slug;
  useEffect(() => {
    if (!current) return;
    setTour(null); setActive(-1); setViewerOpen(false);
    fetch(`${BASE}tours/${current}/tour.json`).then((r) => r.json()).then(setTour);
  }, [current]);

  useEffect(() => {
    if (!tour?.media.length) return;
    const n = tour.media.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setActive((a) => (viewerOpen ? (a + 1) % n : Math.min(a + 1, n - 1)));
      if (e.key === "ArrowLeft") setActive((a) => (viewerOpen ? (a - 1 + n) % n : Math.max(a - 1, 0)));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [tour, viewerOpen]);

  if (tours && !tours.length) return <p className="empty">No tours yet — add one in <code>tours/</code> and run <code>npm run tours</code>.</p>;

  const s = tour?.stats;
  const selectAt = (d: number) => tour?.media.length && setActive(nearestMedia(tour.media, d));
  const openOrSelect = (i: number) => (i === active ? setViewerOpen(true) : setActive(i));

  return (
    <>
      <header id="bar">
        <select aria-label="Tour" value={current ?? ""} onChange={(e) => (location.hash = e.target.value)}>
          {tours?.map((t) => <option key={t.slug} value={t.slug}>{t.title}</option>)}
        </select>
        {s && tour && (
          <div id="stats">
            {km(s.distance)} · ↑{s.elevationGain} m
            {s.start && s.end ? ` · ${((s.end - s.start) / 36e5).toFixed(1)} h` : ""} · {tour.media.length} media
          </div>
        )}
      </header>
      {tour && (
        <>
          <TourMap
            tour={tour}
            active={active}
            cursor={scrubD != null ? pointAt(tour.track, scrubD) : null}
            onPin={(i) => { setActive(i); setViewerOpen(true); }}
            onTrackClick={selectAt}
          />
          <section id="panel">
            <ElevationProfile
              tour={tour}
              mark={scrubD ?? tour.media[active]?.distance}
              onScrub={setScrubD}
              onRelease={(d) => { setScrubD(null); selectAt(d); }}
            />
            <MediaStrip tour={tour} active={active} onClick={openOrSelect} />
          </section>
          {viewerOpen && active >= 0 && (
            <Viewer
              tour={tour}
              index={active}
              onStep={(k) => setActive((a) => (a + k + tour.media.length) % tour.media.length)}
              onClose={() => setViewerOpen(false)}
            />
          )}
        </>
      )}
    </>
  );
}
