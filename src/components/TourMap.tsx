import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { type Tour, type TrackPoint, tourUrl } from "../types";

type Props = {
  tour: Tour;
  active: number;
  cursor: TrackPoint | null;
  onPin: (i: number) => void;
  onTrackClick: (distance: number) => void;
};

const cursorIcon = L.divIcon({ className: "cursor-dot", iconSize: [14, 14] });

/** Imperative map moves: fit on tour load, fly to the active media, follow the scrub cursor. */
function Camera({ tour, active, cursor }: Pick<Props, "tour" | "active" | "cursor">) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLngBounds(tour.track.map((p) => [p[0], p[1]])), { padding: [30, 30] });
  }, [map, tour]);
  useEffect(() => {
    const m = tour.media[active];
    if (m) map.flyTo([m.lat, m.lon], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [map, tour, active]);
  useEffect(() => {
    if (cursor) map.panTo([cursor[0], cursor[1]], { animate: false });
  }, [map, cursor]);
  return null;
}

export default function TourMap({ tour, active, cursor, onPin, onTrackClick }: Props) {
  const line = useMemo(() => tour.track.map((p) => [p[0], p[1]] as L.LatLngTuple), [tour]);
  const icons = useMemo(
    () => tour.media.map((m, i) => (on: boolean) => L.divIcon({
      className: "", iconSize: [36, 36],
      html: `<div class="pin ${m.kind}${on ? " active" : ""}" style="background-image:url('${m.thumb ? tourUrl(tour.slug, m.thumb) : ""}')" data-i="${i}"></div>`,
    })),
    [tour],
  );

  return (
    <MapContainer id="map" center={line[0]} zoom={12} zoomControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution="&copy; OpenStreetMap contributors" />
      <Polyline
        positions={line}
        pathOptions={{ color: "#e4572e", weight: 5, opacity: 0.9 }}
        eventHandlers={{
          click: (e) => {
            const nearest = tour.track.reduce((b, p) => {
              const dd = e.latlng.distanceTo([p[0], p[1]]);
              return dd < b.dd ? { dd, d: p[3] } : b;
            }, { dd: Infinity, d: 0 });
            onTrackClick(nearest.d);
          },
        }}
      />
      <CircleMarker center={line[0]} radius={6} pathOptions={{ color: "#fff", fillColor: "#2a9d8f", fillOpacity: 1 }} />
      {tour.media.map((m, i) => (
        <Marker
          key={m.file}
          position={[m.lat, m.lon]}
          icon={icons[i](i === active)}
          zIndexOffset={i === active ? 1000 : 0}
          eventHandlers={{ click: () => onPin(i) }}
        />
      ))}
      {cursor && <Marker position={[cursor[0], cursor[1]]} icon={cursorIcon} interactive={false} />}
      <Camera tour={tour} active={active} cursor={cursor} />
    </MapContainer>
  );
}
