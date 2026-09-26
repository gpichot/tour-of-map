import { useEffect, useRef } from "react";
import { type Tour, km, tourUrl } from "../types";

type Props = { tour: Tour; index: number; onStep: (k: number) => void; onClose: () => void };

export default function Viewer({ tour, index, onStep, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const startX = useRef(0);
  const m = tour.media[index], src = tourUrl(tour.slug, m.url);

  useEffect(() => {
    // No close() on cleanup: unmounting removes the dialog, and a close event would re-trigger onClose.
    if (!ref.current!.open) ref.current!.showModal();
  }, []);

  return (
    <dialog id="viewer" ref={ref} onClose={onClose}
      onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - startX.current; if (Math.abs(dx) > 50) onStep(dx < 0 ? 1 : -1); }}>
      <button id="prev" aria-label="Previous" onClick={() => onStep(-1)}>‹</button>
      <figure>
        <div id="viewer-media">
          {m.kind === "image"
            ? <img key={src} src={src} alt={m.caption ?? ""} />
            : <video key={src} src={src} controls autoPlay playsInline />}
        </div>
        <figcaption>{[m.caption, km(m.distance), new Date(m.time).toLocaleString()].filter(Boolean).join(" · ")}</figcaption>
      </figure>
      <button id="next" aria-label="Next" onClick={() => onStep(1)}>›</button>
      <button id="close" aria-label="Close" onClick={onClose}>×</button>
    </dialog>
  );
}
