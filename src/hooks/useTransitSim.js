import { useState, useEffect, useRef } from 'react';
import { buildRoute, pointAtDistance } from '../utils/polyline';

// Schedule-style simulation: there is no public real-time GPS for İstanbul metro
// trains or Şehir Hatları ferries, so we animate estimated vehicles along the
// known line geometries at assumed speeds/headways. Not real positions — a live
// looking approximation (the approach istanbulasim.com uses).

const METRO_SPEED = 11;     // m/s  (~40 km/h)
const FERRY_SPEED = 7;      // m/s  (~25 km/h)
const METRO_HEADWAY = 2600; // metres between simulated vehicles
const FERRY_HEADWAY = 4500;
const TICK_MS = 400;

function buildLines(geo, mode) {
  if (!geo?.features) return [];
  const speed = mode === 'ferry' ? FERRY_SPEED : METRO_SPEED;
  const headway = mode === 'ferry' ? FERRY_HEADWAY : METRO_HEADWAY;
  const lines = [];

  for (const f of geo.features) {
    const g = f.geometry;
    const parts =
      g?.type === 'LineString' ? [g.coordinates] :
      g?.type === 'MultiLineString' ? g.coordinates : [];
    for (const coords of parts) {
      if (!coords || coords.length < 2) continue;
      const route = buildRoute(coords);
      if (!route || route.total < 500) continue; // skip tiny stubs
      const count = Math.max(1, Math.min(3, Math.floor(route.total / headway)));
      const color = mode === 'ferry' ? '#16a6e0' : (f.properties?.color || '#9aa4b2');
      lines.push({ route, speed, count, color, mode });
    }
  }
  return lines;
}

export function useTransitSim(railData, ferryData) {
  const [fc, setFc] = useState(null);
  const linesRef = useRef([]);
  const startRef = useRef(Date.now());

  useEffect(() => {
    linesRef.current = [
      ...buildLines(railData, 'metro'),
      ...buildLines(ferryData, 'ferry'),
    ];
  }, [railData, ferryData]);

  useEffect(() => {
    const id = setInterval(() => {
      const t = (Date.now() - startRef.current) / 1000;
      const features = [];
      for (const ln of linesRef.current) {
        const cycle = 2 * ln.route.total; // ping-pong (out and back)
        for (let i = 0; i < ln.count; i++) {
          const offset = (i / ln.count) * cycle;
          const d = (offset + ln.speed * t) % cycle;
          const s = d <= ln.route.total ? d : cycle - d; // triangle wave
          const pt = pointAtDistance(ln.route, s);
          features.push({
            type: 'Feature',
            properties: { color: ln.color, mode: ln.mode },
            geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
          });
        }
      }
      setFc({ type: 'FeatureCollection', features });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return fc;
}
