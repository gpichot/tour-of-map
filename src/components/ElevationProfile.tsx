import { useEffect, useRef, useState } from "react";
import type { Tour } from "../types";

type Props = { tour: Tour; mark?: number; onScrub: (d: number) => void; onRelease: (d: number) => void };

/** Canvas elevation chart; drag to scrub along the route. */
export default function ElevationProfile({ tour, mark, onScrub, onRelease }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current!, dpr = devicePixelRatio, w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext("2d")!; c.scale(dpr, dpr);
    const pts = tour.track.filter((p) => p[2] != null);
    if (!pts.length) return;
    const eles = pts.map((p) => p[2]!), min = Math.min(...eles), max = Math.max(...eles);
    const total = tour.stats.distance || 1;
    const x = (d: number) => (d / total) * w, y = (e: number) => h - 4 - ((e - min) / (max - min || 1)) * (h - 12);
    c.beginPath(); c.moveTo(0, h);
    pts.forEach((p) => c.lineTo(x(p[3]), y(p[2]!)));
    c.lineTo(w, h); c.closePath();
    c.fillStyle = "#e4572e33"; c.fill(); c.strokeStyle = "#e4572e"; c.stroke();
    c.fillStyle = "#888";
    tour.media.forEach((m) => c.fillRect(x(m.distance) - 1, h - 6, 2, 6));
    if (mark != null) { c.fillStyle = getComputedStyle(canvas).color; c.fillRect(x(mark) - 1, 0, 2, h); }
  }, [tour, mark, width]);

  const toD = (e: React.PointerEvent<HTMLCanvasElement>) =>
    Math.max(0, Math.min(1, e.nativeEvent.offsetX / e.currentTarget.clientWidth)) * tour.stats.distance;

  return (
    <canvas
      id="profile" ref={ref} aria-label="Elevation profile"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onScrub(toD(e)); }}
      onPointerMove={(e) => e.buttons && onScrub(toD(e))}
      onPointerUp={(e) => onRelease(toD(e))}
    />
  );
}
