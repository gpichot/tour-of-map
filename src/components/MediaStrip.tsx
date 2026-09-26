import { useEffect, useRef } from "react";
import { type Tour, km, tourUrl } from "../types";

export default function MediaStrip({ tour, active, onClick }: { tour: Tour; active: number; onClick: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  return (
    <div id="strip" role="list" ref={ref}>
      {tour.media.map((m, i) => (
        <button key={m.file} className={`thumb${i === active ? " active" : ""}`} data-i={i} role="listitem"
          aria-label={m.caption ?? m.file} onClick={() => onClick(i)}>
          {m.thumb
            ? <img loading="lazy" src={tourUrl(tour.slug, m.thumb)} alt="" />
            : <video muted preload="metadata" src={`${tourUrl(tour.slug, m.url)}#t=0.5`} />}
          {m.kind === "video" && <span className="play">▶</span>}
          <span className="km">{km(m.distance)}</span>
        </button>
      ))}
    </div>
  );
}
