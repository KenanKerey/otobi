const OSRM_BASE = 'https://router.project-osrm.org';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// Istanbul bounding box for geocoding
const ISTANBUL_VIEWBOX = '28.4,40.8,29.6,41.4';

export async function geocode(query) {
  if (!query || query.length < 2) return [];

  const params = new URLSearchParams({
    q: query + ', İstanbul',
    format: 'json',
    viewbox: ISTANBUL_VIEWBOX,
    bounded: '1',
    limit: '5',
    'accept-language': 'tr',
  });

  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: { 'User-Agent': 'Otobi/1.0' },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.map(item => ({
    name: item.display_name.split(',').slice(0, 3).join(', '),
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
}

// Nearest-neighbor ordering for unordered waypoints
function orderByNearest(points) {
  if (points.length <= 2) return points;

  const remaining = [...points];
  // Start with northernmost point
  remaining.sort((a, b) => b.lat - a.lat);
  const result = [remaining.shift()];

  while (remaining.length > 0) {
    const last = result[result.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = (remaining[i].lat - last.lat) ** 2 + (remaining[i].lng - last.lng) ** 2;
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    result.push(remaining.splice(nearestIdx, 1)[0]);
  }
  return result;
}

// Route through multiple waypoints (for bus line routes)
export async function getRouteThrough(points) {
  if (!points || points.length < 2) return null;

  // Deduplicate close points (within ~50m)
  const deduped = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = deduped[deduped.length - 1];
    const d = (points[i].lat - last.lat) ** 2 + (points[i].lng - last.lng) ** 2;
    if (d > 0.0000005) deduped.push(points[i]);
  }

  // Order by nearest-neighbor
  const ordered = orderByNearest(deduped);

  // Sample to max 25 waypoints (OSRM limit)
  let waypoints = ordered;
  if (ordered.length > 25) {
    const step = (ordered.length - 1) / 24;
    waypoints = Array.from({ length: 25 }, (_, i) =>
      ordered[Math.round(i * step)]
    );
  }

  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.routes?.length) return null;

    return {
      type: 'Feature',
      properties: {},
      geometry: data.routes[0].geometry,
    };
  } catch {
    return null;
  }
}

export async function getRoute(from, to) {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Rota hesaplanamadı');

  const data = await res.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error('Rota bulunamadı');
  }

  const route = data.routes[0];
  return {
    geometry: {
      type: 'Feature',
      properties: {},
      geometry: route.geometry,
    },
    distance: route.distance, // meters
    duration: route.duration, // seconds
  };
}
