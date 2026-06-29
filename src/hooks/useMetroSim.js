import { useState, useEffect, useMemo, useRef } from 'react';
import { buildRoute, pointAtDistance } from '../utils/polyline';
import { colorForLine } from '../components/Rail3D';

// Metro vehicles from the CURRENT Metro İstanbul station data (metro_stations),
// because the GTFS metro geometry is frozen at 2023 (e.g. M4 stops at Tavşantepe).
// Geometry/stations are real & current (M4 → Sabiha Gökçen); train timing is an
// estimate (constant cruise + ping-pong turnarounds), since the live metro
// timetable API is offline. Ferries/tram/Marmaray still use the exact GTFS schedule.

const AVG = 11;          // m/s effective speed (includes dwell)
const MIN_HEADWAY = 2800; // metres between simulated trains
const TICK_MS = 250;
const SERVICE_START = 6 * 3600;     // 06:00
const SERVICE_END = 24 * 3600 + 1800; // 00:30 next day

const istSecNow = () => {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
};

// Group station rows into per-line ordered route objects (metros only: "M…").
function buildLines(stations) {
  if (!stations?.length) return [];
  const byLine = new Map();
  for (const s of stations) {
    if (!/^m\d/i.test(s.line_name || '')) continue; // metros only
    if (!byLine.has(s.line_name)) byLine.set(s.line_name, []);
    byLine.get(s.line_name).push(s);
  }
  const out = [];
  for (const [line, list] of byLine) {
    list.sort((a, b) => a.ordinal - b.ordinal);
    if (list.length < 2) continue;
    const coords = list.map((s) => [s.lng, s.lat]);
    const route = buildRoute(coords);
    if (!route || route.total < 500) continue;
    const names = list.map((s) => s.name);
    const count = Math.max(1, Math.min(10, Math.floor(route.total / MIN_HEADWAY)));
    out.push({ line, color: colorForLine(line, 1), route, names, total: route.total, count });
  }
  return out;
}

export function buildMetroNetwork(stations) {
  const lines = buildLines(stations);
  return {
    type: 'FeatureCollection',
    features: lines.map((ln) => ({
      type: 'Feature',
      properties: { line: ln.line, color: ln.color, route_type: 1 },
      geometry: { type: 'LineString', coordinates: ln.route.pts.map((p) => [p.lng, p.lat]) },
    })),
  };
}

export function useMetroVehicles(stations, previewOffset = null) {
  const [vehicles, setVehicles] = useState([]);
  const lines = useMemo(() => buildLines(stations), [stations]);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!lines.length) { setVehicles([]); return; }

    const id = setInterval(() => {
      const eff = istSecNow() + (previewOffset || 0);
      const within = eff >= SERVICE_START && eff <= SERVICE_END;
      if (!within) { setVehicles([]); return; }

      const t = (Date.now() - startRef.current) / 1000;
      const out = [];
      for (const ln of lines) {
        const D = ln.total;
        const period = 2 * D; // out-and-back (distance)
        const cum = ln.route.cum;
        for (let k = 0; k < ln.count; k++) {
          const p = (((t * AVG) + k * (period / ln.count)) % period + period) % period;
          const forward = p <= D;
          const s = forward ? p : period - p;
          const pt = pointAtDistance(ln.route, s);

          // upcoming station + ETA in travel direction
          let nextIdx;
          if (forward) { nextIdx = cum.findIndex((c) => c > s + 1); if (nextIdx < 0) nextIdx = cum.length - 1; }
          else { nextIdx = 0; for (let i = cum.length - 1; i >= 0; i--) { if (cum[i] < s - 1) { nextIdx = i; break; } } }
          const distToNext = Math.abs(cum[nextIdx] - s);

          out.push({
            id: `${ln.line}-${k}`,
            line: ln.line,
            routeType: 1,
            direction: forward ? 0 : 1,
            headsign: forward ? ln.names[ln.names.length - 1] : ln.names[0],
            lat: pt.lat,
            lng: pt.lng,
            heading: forward ? pt.heading : (pt.heading + 180) % 360,
            nextStop: ln.names[nextIdx],
            etaMin: Math.max(1, Math.round(distToNext / AVG / 60)),
          });
        }
      }
      setVehicles(out);
    }, TICK_MS);

    return () => clearInterval(id);
  }, [lines, previewOffset]);

  return vehicles;
}
