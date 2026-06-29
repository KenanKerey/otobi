import { getLineStops } from './ibbApi';
import { buildRoute } from '../utils/polyline';

const OSRM_BASE = 'https://router.project-osrm.org';
const MAX_OSRM_WAYPOINTS = 25;

// Cache for built route GeoJSON per line+direction
const routeCache = new Map();

// Cache for planar (meter-space) route helpers used by the bus animation.
const polylineCache = new Map();

/**
 * Get the line route as a planar polyline helper (for projecting buses onto
 * the road and animating them along it). Returns null if unavailable.
 */
export async function getRoutePolyline(lineCode, destination) {
  const key = `${(lineCode || '').toUpperCase()}-${destination || ''}`;
  if (polylineCache.has(key)) return polylineCache.get(key);

  const feature = await getBusLineRoute(lineCode, destination);
  const coords = feature?.geometry?.coordinates;
  const route = coords && coords.length >= 2 ? buildRoute(coords) : null;

  polylineCache.set(key, route);
  return route;
}

/**
 * Get the actual bus line route as a GeoJSON Feature.
 * 1. Fetches ordered stops from IBB DurakDetay_GYY API
 * 2. Matches direction based on destination text
 * 3. Routes through ordered stops via OSRM for road-following geometry
 */
export async function getBusLineRoute(lineCode, destination) {
  const key = `${lineCode.toUpperCase()}-${destination || ''}`;
  if (routeCache.has(key)) return routeCache.get(key);

  const stops = await getLineStops(lineCode);
  if (!stops || stops.length < 2) return null;

  // Group stops by direction (YON: "D" = gidiş, "G" = dönüş)
  const directions = new Map();
  stops.forEach(s => {
    const dir = s.direction || 'unknown';
    if (!directions.has(dir)) directions.set(dir, []);
    directions.get(dir).push(s);
  });

  let routeStops = matchDirection(directions, destination);

  if (!routeStops || routeStops.length < 2) return null;

  // Sort by sequence number
  routeStops.sort((a, b) => a.sequence - b.sequence);

  // Route through stops via OSRM for road-following geometry
  const feature = await routeThroughStops(routeStops, lineCode, destination);

  if (feature) {
    routeCache.set(key, feature);
  }

  return feature;
}

const stopsCache = new Map();

/**
 * Ordered stops for the direction matching `destination`. Used to draw the
 * line's stops on the map for the route view.
 */
export async function getDirectionStops(lineCode, destination) {
  const key = `${(lineCode || '').toUpperCase()}-${destination || ''}`;
  if (stopsCache.has(key)) return stopsCache.get(key);

  const stops = await getLineStops(lineCode);
  if (!stops || stops.length < 2) {
    stopsCache.set(key, []);
    return [];
  }

  const directions = new Map();
  stops.forEach(s => {
    const dir = s.direction || 'unknown';
    if (!directions.has(dir)) directions.set(dir, []);
    directions.get(dir).push(s);
  });

  const matched = matchDirection(directions, destination) || [];
  const ordered = [...matched].sort((a, b) => a.sequence - b.sequence);
  stopsCache.set(key, ordered);
  return ordered;
}

/**
 * Match the bus destination text to the correct direction's stop list.
 */
function matchDirection(directions, destination) {
  if (directions.size === 1) {
    return [...directions.values()][0];
  }

  if (destination) {
    const destLower = destination.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    for (const [, dirStops] of directions) {
      const sorted = [...dirStops].sort((a, b) => a.sequence - b.sequence);
      const lastName = sorted[sorted.length - 1]?.name?.toLowerCase() || '';
      const firstName = sorted[0]?.name?.toLowerCase() || '';

      const score = Math.max(fuzzyMatch(destLower, lastName), fuzzyMatch(destLower, firstName));
      if (score > bestScore) {
        bestScore = score;
        bestMatch = sorted;
      }
    }

    if (bestMatch && bestScore > 0.2) return bestMatch;
  }

  // Fallback: direction with most stops
  let best = null;
  for (const [, dirStops] of directions) {
    if (!best || dirStops.length > best.length) best = dirStops;
  }
  return best;
}

/**
 * Route through ordered stops via OSRM to get road-following geometry.
 * OSRM has a 25-waypoint limit, so we chunk large routes.
 */
async function routeThroughStops(stops, lineCode, destination) {
  if (stops.length <= MAX_OSRM_WAYPOINTS) {
    return await osrmRoute(stops, lineCode, destination);
  }

  // Split into overlapping chunks of ~24 stops (overlap 1 for continuity)
  const allCoordinates = [];
  const chunkSize = MAX_OSRM_WAYPOINTS - 1;

  for (let i = 0; i < stops.length; i += chunkSize) {
    const chunk = stops.slice(i, i + chunkSize + 1); // +1 for overlap
    if (chunk.length < 2) break;

    const feature = await osrmRoute(chunk, lineCode, destination);
    if (feature?.geometry?.coordinates) {
      const coords = feature.geometry.coordinates;
      if (allCoordinates.length > 0) {
        // Skip the first coord to avoid duplicate at junction
        allCoordinates.push(...coords.slice(1));
      } else {
        allCoordinates.push(...coords);
      }
    }
  }

  if (allCoordinates.length < 2) return null;

  return {
    type: 'Feature',
    properties: { line: lineCode.toUpperCase(), direction: destination || '', stopCount: stops.length },
    geometry: { type: 'LineString', coordinates: allCoordinates },
  };
}

/**
 * Call OSRM to route through a set of ordered waypoints.
 */
async function osrmRoute(stops, lineCode, destination) {
  const coords = stops.map(s => `${s.lng},${s.lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.routes?.length) return null;

    return {
      type: 'Feature',
      properties: { line: lineCode.toUpperCase(), direction: destination || '', stopCount: stops.length },
      geometry: data.routes[0].geometry,
    };
  } catch {
    return null;
  }
}

/**
 * Simple fuzzy match score between two strings (0-1).
 */
function fuzzyMatch(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;

  const wordsA = a.split(/\s+/).filter(w => w.length > 2);
  const wordsB = b.split(/\s+/).filter(w => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  let matches = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa.includes(wb) || wb.includes(wa)) { matches++; break; }
    }
  }
  return matches / Math.max(wordsA.length, wordsB.length);
}
