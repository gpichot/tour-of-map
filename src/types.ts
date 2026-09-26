export type Media = {
  file: string; kind: "image" | "video"; url: string; thumb?: string; caption?: string;
  time: number; lat: number; lon: number; distance: number;
};
export type TrackPoint = [lat: number, lon: number, ele: number | null, distance: number];
export type Tour = {
  slug: string; title: string; description: string;
  stats: { distance: number; elevationGain: number; start?: number; end?: number };
  track: TrackPoint[];
  media: Media[];
};
export type TourSummary = Pick<Tour, "slug" | "title" | "stats">;

export const BASE = import.meta.env.BASE_URL;
export const tourUrl = (slug: string, path: string) => `${BASE}tours/${slug}/${path}`;
export const km = (m: number) => `${(m / 1000).toFixed(1)} km`;

export const pointAt = (track: TrackPoint[], d: number) => track.find((p) => p[3] >= d) ?? track[track.length - 1];
export const nearestMedia = (media: Media[], d: number) =>
  media.reduce((b, m, i) => (Math.abs(m.distance - d) < Math.abs(media[b].distance - d) ? i : b), 0);
