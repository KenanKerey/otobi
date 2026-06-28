import { calculateHeading } from './distance';

// Build a route helper in a local planar (meter) space for fast projection.
// coordsLngLat: [[lng, lat], ...] (OSRM/GeoJSON order)
const M_PER_DEG = 111320;

export function buildRoute(coordsLngLat) {
  if (!coordsLngLat || coordsLngLat.length < 2) return null;

  const refLat = coordsLngLat[0][1];
  const kx = Math.cos((refLat * Math.PI) / 180) * M_PER_DEG;
  const ky = M_PER_DEG;

  const pts = coordsLngLat.map(([lng, lat]) => ({
    lng,
    lat,
    x: lng * kx,
    y: lat * ky,
  }));

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }

  return { pts, cum, total: cum[cum.length - 1], kx, ky };
}

// Project a GPS point onto the route. Returns distance-along-route in meters,
// plus the squared planar distance to the route (for quality checks).
export function projectToRoute(route, lat, lng) {
  const px = lng * route.kx;
  const py = lat * route.ky;
  const { pts, cum } = route;

  let bestS = 0;
  let bestD2 = Infinity;

  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, ay = pts[i].y;
    const bx = pts[i + 1].x, by = pts[i + 1].y;
    const dx = bx - ax, dy = by - ay;
    const segLen2 = dx * dx + dy * dy;

    let t = segLen2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / segLen2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const cx = ax + dx * t;
    const cy = ay + dy * t;
    const d2 = (px - cx) ** 2 + (py - cy) ** 2;

    if (d2 < bestD2) {
      bestD2 = d2;
      bestS = cum[i] + Math.sqrt(segLen2) * t;
    }
  }

  return { s: bestS, offset: Math.sqrt(bestD2) };
}

// Get the lat/lng/heading at a given distance along the route.
export function pointAtDistance(route, s) {
  const { pts, cum, total } = route;
  if (s <= 0) {
    return { lat: pts[0].lat, lng: pts[0].lng, heading: calculateHeading(pts[0].lat, pts[0].lng, pts[1].lat, pts[1].lng) };
  }
  if (s >= total) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    return { lat: b.lat, lng: b.lng, heading: calculateHeading(a.lat, a.lng, b.lat, b.lng) };
  }

  // Find the segment containing distance s (linear scan; routes are small).
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < s) i++;

  const segLen = cum[i + 1] - cum[i] || 1;
  const t = (s - cum[i]) / segLen;
  const a = pts[i], b = pts[i + 1];

  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    heading: calculateHeading(a.lat, a.lng, b.lat, b.lng),
  };
}
