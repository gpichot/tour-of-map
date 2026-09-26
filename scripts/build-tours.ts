/**
 * Turns raw tour folders into web-ready data.
 *
 *   tours/<slug>/track.gpx          (required)
 *   tours/<slug>/*.jpg|heic|png|mp4|mov
 *   tours/<slug>/meta.json          (optional: { title, description, timeOffsetMinutes, media: { "file.mp4": { caption, time, lat, lon } } })
 *
 * Output: public/tours/<slug>/{tour.json, media/*, thumbs/*} and public/tours/index.json
 *
 * Media placement priority: manual lat/lon > EXIF GPS > capture time matched on the GPX track.
 * Time matching is the key trick: cameras/phones without GPS (and most videos) still get placed.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import exifr from "exifr";
import sharp from "sharp";

const SRC = "tours";
const OUT = "public/tours";
const IMAGE = /\.(jpe?g|png|heic|webp)$/i;
const VIDEO = /\.(mp4|mov|webm|m4v)$/i;

type Pt = { lat: number; lon: number; ele?: number; t?: number; d: number };
type Meta = {
  title?: string;
  description?: string;
  timeOffsetMinutes?: number;
  media?: Record<string, { caption?: string; time?: string; lat?: number; lon?: number }>;
};

const haversine = (a: Pt, b: { lat: number; lon: number }) => {
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function parseGpx(file: string): Promise<Pt[]> {
  const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" }).parse(await fs.readFile(file, "utf8"));
  const arr = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const pts: Pt[] = [];
  for (const trk of arr<any>(xml.gpx?.trk))
    for (const seg of arr<any>(trk.trkseg))
      for (const p of arr<any>(seg.trkpt)) {
        const pt: Pt = { lat: +p.lat, lon: +p.lon, ele: p.ele != null ? +p.ele : undefined, t: p.time ? Date.parse(p.time) : undefined, d: 0 };
        const prev = pts[pts.length - 1];
        pt.d = prev ? prev.d + haversine(prev, pt) : 0;
        pts.push(pt);
      }
  if (!pts.length) throw new Error(`No track points in ${file}`);
  return pts;
}

/** Interpolated position on the track at timestamp t (clamped to the ends). */
function locateByTime(pts: Pt[], t: number) {
  const timed = pts.filter((p) => p.t != null);
  if (!timed.length) return null;
  if (t <= timed[0].t!) return timed[0];
  if (t >= timed[timed.length - 1].t!) return timed[timed.length - 1];
  let lo = 0, hi = timed.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; timed[m].t! <= t ? (lo = m) : (hi = m); }
  const a = timed[lo], b = timed[hi], k = (t - a.t!) / (b.t! - a.t! || 1);
  return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k, d: a.d + (b.d - a.d) * k };
}

/** Distance along track of the nearest point (for EXIF-GPS / manual placements). */
const nearestD = (pts: Pt[], p: { lat: number; lon: number }) =>
  pts.reduce((best, q) => { const dd = haversine(q, p); return dd < best.dd ? { dd, d: q.d } : best; }, { dd: Infinity, d: 0 }).d;

/** Downsample the track for the browser: keep a point every ~15 m. */
function simplify(pts: Pt[], step = 15) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) if (i === pts.length - 1 || pts[i].d - out[out.length - 1].d >= step) out.push(pts[i]);
  return out;
}

async function buildTour(slug: string) {
  const dir = path.join(SRC, slug), out = path.join(OUT, slug);
  const files = await fs.readdir(dir);
  const gpx = files.find((f) => /\.gpx$/i.test(f));
  if (!gpx) return console.warn(`skip ${slug}: no .gpx`), null;
  const meta: Meta = files.includes("meta.json") ? JSON.parse(await fs.readFile(path.join(dir, "meta.json"), "utf8")) : {};
  const offset = (meta.timeOffsetMinutes ?? 0) * 60e3;
  const pts = await parseGpx(path.join(dir, gpx));

  await fs.mkdir(path.join(out, "media"), { recursive: true });
  await fs.mkdir(path.join(out, "thumbs"), { recursive: true });

  const media = [];
  for (const f of files.filter((f) => IMAGE.test(f) || VIDEO.test(f)).sort()) {
    const src = path.join(dir, f), kind = IMAGE.test(f) ? "image" : "video";
    const m = meta.media?.[f] ?? {};
    const exif = kind === "image" ? await exifr.parse(src, { gps: true, pick: ["DateTimeOriginal", "latitude", "longitude"] }).catch(() => null) : null;

    let time = m.time ? Date.parse(m.time) : exif?.DateTimeOriginal ? new Date(exif.DateTimeOriginal).getTime() : (await fs.stat(src)).mtimeMs;
    time += offset; // fixes camera clock drift / timezone mismatch vs GPS (UTC)

    let pos: { lat: number; lon: number; d: number } | null = null;
    if (m.lat != null && m.lon != null) pos = { lat: m.lat, lon: m.lon, d: nearestD(pts, { lat: m.lat, lon: m.lon }) };
    else if (exif?.latitude != null) pos = { lat: exif.latitude, lon: exif.longitude, d: nearestD(pts, { lat: exif.latitude, lon: exif.longitude }) };
    else pos = locateByTime(pts, time);
    if (!pos) { console.warn(`  ! cannot place ${f} (no GPS, no timed track)`); continue; }

    // Web-sized copy + thumbnail for images; videos are copied as-is (transcode yourself if huge).
    let url = `media/${f}`, thumb: string | undefined;
    if (kind === "image") {
      const base = f.replace(/\.[^.]+$/, "");
      url = `media/${base}.jpg`; thumb = `thumbs/${base}.jpg`;
      await sharp(src).rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(out, url));
      await sharp(src).rotate().resize(240, 240, { fit: "cover" }).jpeg({ quality: 70 }).toFile(path.join(out, thumb));
    } else await fs.copyFile(src, path.join(out, url));

    media.push({ file: f, kind, url, thumb, caption: m.caption, time, lat: pos.lat, lon: pos.lon, distance: Math.round(pos.d) });
    console.log(`  + ${f} @ ${(pos.d / 1000).toFixed(1)} km`);
  }
  media.sort((a, b) => a.distance - b.distance);

  const elev = pts.reduce((g, p, i) => (i && p.ele != null && pts[i - 1].ele != null && p.ele > pts[i - 1].ele! ? g + p.ele - pts[i - 1].ele! : g), 0);
  const tour = {
    slug,
    title: meta.title ?? slug,
    description: meta.description ?? "",
    stats: {
      distance: Math.round(pts[pts.length - 1].d),
      elevationGain: Math.round(elev),
      start: pts[0].t, end: pts[pts.length - 1].t,
    },
    track: simplify(pts).map((p) => [+p.lat.toFixed(6), +p.lon.toFixed(6), p.ele != null ? Math.round(p.ele) : null, Math.round(p.d)]),
    media,
  };
  await fs.writeFile(path.join(out, "tour.json"), JSON.stringify(tour));
  return { slug, title: tour.title, description: tour.description, stats: tour.stats, cover: media.find((m) => m.thumb)?.thumb };
}

const slugs = (await fs.readdir(SRC, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name);
const index = [];
for (const s of slugs) { console.log(`tour ${s}`); const t = await buildTour(s); if (t) index.push(t); }
await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, "index.json"), JSON.stringify(index));
console.log(`built ${index.length} tour(s)`);
