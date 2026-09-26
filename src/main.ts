import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

type Media = { file: string; kind: "image" | "video"; url: string; thumb?: string; caption?: string; time: number; lat: number; lon: number; distance: number };
type Tour = {
  slug: string; title: string; description: string;
  stats: { distance: number; elevationGain: number; start?: number; end?: number };
  track: [number, number, number | null, number][]; // lat, lon, ele, distance(m)
  media: Media[];
};
type TourSummary = Pick<Tour, "slug" | "title" | "stats">;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;

const map = L.map("map", { zoomControl: false }).setView([46, 2], 5);
L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const layer = L.layerGroup().addTo(map);
const cursor = L.marker([0, 0], { icon: L.divIcon({ className: "cursor-dot", iconSize: [14, 14] }), interactive: false });

let tour: Tour, active = -1, pins: L.Marker[] = [];

async function init() {
  const list: TourSummary[] = await fetch(`${base}tours/index.json`).then((r) => r.json()).catch(() => []);
  const select = $<HTMLSelectElement>("tour-select");
  if (!list.length) { $("stats").textContent = "No tours yet — add one in tours/ and run npm run tours"; return; }
  select.innerHTML = list.map((t) => `<option value="${t.slug}">${t.title}</option>`).join("");
  select.onchange = () => { location.hash = select.value; };
  window.onhashchange = () => load(location.hash.slice(1) || list[0].slug);
  const initial = location.hash.slice(1) || list[0].slug;
  select.value = initial;
  load(initial);
}

async function load(slug: string) {
  tour = await fetch(`${base}tours/${slug}/tour.json`).then((r) => r.json());
  const root = `${base}tours/${slug}/`;
  $<HTMLSelectElement>("tour-select").value = slug;
  const s = tour.stats, hrs = s.start && s.end ? ` · ${((s.end - s.start) / 36e5).toFixed(1)} h` : "";
  $("stats").textContent = `${(s.distance / 1000).toFixed(1)} km · ↑${s.elevationGain} m${hrs} · ${tour.media.length} media`;

  layer.clearLayers();
  const line = L.polyline(tour.track.map(([a, b]) => [a, b] as L.LatLngTuple), { color: "#e4572e", weight: 5, opacity: 0.9 }).addTo(layer);
  L.circleMarker(line.getLatLngs()[0] as L.LatLng, { radius: 6, color: "#fff", fillColor: "#2a9d8f", fillOpacity: 1 }).addTo(layer);
  map.fitBounds(line.getBounds(), { padding: [30, 30] });
  // Tap on the track → jump to the nearest media
  line.on("click", (e: L.LeafletMouseEvent) => select(nearestMedia(distanceAt(e.latlng))));

  pins = tour.media.map((m, i) => {
    const icon = L.divIcon({
      className: "", iconSize: [36, 36],
      html: `<div class="pin ${m.kind}" style="background-image:url('${root}${m.thumb ?? ""}')"></div>`,
    });
    return L.marker([m.lat, m.lon], { icon }).on("click", () => select(i, true)).addTo(layer);
  });

  $("strip").innerHTML = tour.media.map((m, i) => `
    <button class="thumb" data-i="${i}" role="listitem" aria-label="${m.caption ?? m.file}">
      ${m.thumb ? `<img loading="lazy" src="${root}${m.thumb}" alt="">` : `<video muted preload="metadata" src="${root}${m.url}#t=0.5"></video>`}
      ${m.kind === "video" ? '<span class="play">▶</span>' : ""}
      <span class="km">${(m.distance / 1000).toFixed(1)} km</span>
    </button>`).join("");
  $("strip").querySelectorAll<HTMLElement>(".thumb").forEach((el) => {
    const i = +el.dataset.i!;
    el.onclick = () => (i === active ? openViewer(i) : select(i));
  });
  active = -1;
  drawProfile();
}

/** Highlight media i on map, strip and profile. */
function select(i: number, openIt = false) {
  if (i < 0 || !tour.media[i]) return;
  pins[active]?.getElement()?.firstElementChild?.classList.remove("active");
  document.querySelector(".thumb.active")?.classList.remove("active");
  active = i;
  const m = tour.media[i];
  pins[i].getElement()?.firstElementChild?.classList.add("active");
  const el = document.querySelector<HTMLElement>(`.thumb[data-i="${i}"]`);
  el?.classList.add("active");
  el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  map.flyTo([m.lat, m.lon], Math.max(map.getZoom(), 14), { duration: 0.6 });
  drawProfile(m.distance);
  if (openIt) openViewer(i);
}

// ---------- Elevation profile (canvas, scrub to move along the route) ----------
const canvas = $<HTMLCanvasElement>("profile");
function drawProfile(markD?: number) {
  const dpr = devicePixelRatio, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext("2d")!; c.scale(dpr, dpr);
  const pts = tour.track.filter((p) => p[2] != null);
  if (!pts.length) return;
  const eles = pts.map((p) => p[2]!), min = Math.min(...eles), max = Math.max(...eles) || 1;
  const total = tour.stats.distance || 1;
  const x = (d: number) => (d / total) * w, y = (e: number) => h - 4 - ((e - min) / (max - min || 1)) * (h - 12);
  c.beginPath(); c.moveTo(0, h);
  pts.forEach((p) => c.lineTo(x(p[3]), y(p[2]!)));
  c.lineTo(w, h); c.closePath();
  c.fillStyle = "#e4572e33"; c.fill(); c.strokeStyle = "#e4572e"; c.stroke();
  c.fillStyle = "#888";
  tour.media.forEach((m) => c.fillRect(x(m.distance) - 1, h - 6, 2, 6));
  if (markD != null) { c.fillStyle = "#1d1d1f"; c.fillRect(x(markD) - 1, 0, 2, h); }
}
function scrub(e: PointerEvent) {
  const d = (e.offsetX / canvas.clientWidth) * tour.stats.distance;
  const p = pointAt(d);
  cursor.setLatLng([p[0], p[1]]).addTo(map);
  map.panTo([p[0], p[1]], { animate: false });
  drawProfile(d);
  return d;
}
canvas.onpointerdown = (e) => { canvas.setPointerCapture(e.pointerId); scrub(e); };
canvas.onpointermove = (e) => { if (e.buttons) scrub(e); };
canvas.onpointerup = (e) => { cursor.remove(); select(nearestMedia(scrub(e))); };
addEventListener("resize", () => tour && drawProfile(tour.media[active]?.distance));

const pointAt = (d: number) => tour.track.find((p) => p[3] >= d) ?? tour.track[tour.track.length - 1];
const distanceAt = (ll: L.LatLng) => tour.track.reduce((b, p) => {
  const dd = map.distance(ll, [p[0], p[1]]); return dd < b.dd ? { dd, d: p[3] } : b;
}, { dd: Infinity, d: 0 }).d;
const nearestMedia = (d: number) => tour.media.reduce((b, m, i) =>
  Math.abs(m.distance - d) < Math.abs(tour.media[b].distance - d) ? i : b, 0);

// ---------- Fullscreen viewer ----------
const viewer = $<HTMLDialogElement>("viewer");
function openViewer(i: number) {
  const m = tour.media[i], src = `${base}tours/${tour.slug}/${m.url}`;
  $("viewer-media").innerHTML = m.kind === "image"
    ? `<img src="${src}" alt="">`
    : `<video src="${src}" controls autoplay playsinline></video>`;
  $("viewer-cap").textContent = [m.caption, `${(m.distance / 1000).toFixed(1)} km`, new Date(m.time).toLocaleString()].filter(Boolean).join(" · ");
  if (!viewer.open) viewer.showModal();
  select(i);
}
const step = (k: number) => openViewer((active + k + tour.media.length) % tour.media.length);
$("prev").onclick = () => step(-1);
$("next").onclick = () => step(1);
$("close").onclick = () => viewer.close();
viewer.onclose = () => ($("viewer-media").innerHTML = "");
addEventListener("keydown", (e) => {
  if (!tour?.media.length) return;
  if (e.key === "ArrowRight") viewer.open ? step(1) : select(Math.min(active + 1, tour.media.length - 1));
  if (e.key === "ArrowLeft") viewer.open ? step(-1) : select(Math.max(active - 1, 0));
});
// Swipe in viewer
let sx = 0;
viewer.addEventListener("touchstart", (e) => (sx = e.touches[0].clientX), { passive: true });
viewer.addEventListener("touchend", (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); });

init();
