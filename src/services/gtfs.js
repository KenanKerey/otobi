// GTFS-backed transit data (metro, tram, funicular, ferry) served from Supabase.
// Live vehicle positions are computed server-side from the real GTFS schedule
// (rail-positions edge function); the planner queries the GTFS tables directly.

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const authHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: authHeaders });
  if (!res.ok) throw new Error(`GTFS ${path}: ${res.status}`);
  return res.json();
}

// ── Live rail/ferry vehicles (schedule-driven, computed server-side) ──
// atSec (optional): clock override in seconds-since-midnight for daytime preview.
export async function fetchRailVehicles(atSec) {
  const q = atSec != null ? `?at=${Math.round(atSec)}` : '';
  const res = await fetch(`${URL}/functions/v1/rail-positions${q}`, { headers: authHeaders });
  if (!res.ok) throw new Error(`rail-positions: ${res.status}`);
  const data = await res.json();
  return data.vehicles || [];
}

// ── Planner helpers (read GTFS tables) ──

// Rail + ferry routes for the line picker.
export async function fetchRailRoutes() {
  // route_type in (0,1,4,6,7): tram, metro, ferry, gondola, funicular
  return rest('gtfs_routes?select=route_id,short_name,long_name,route_type,agency_id&route_type=in.(0,1,4,6,7)&order=route_type.asc,short_name.asc');
}

// Service ids active on a given weekday (0=Sunday .. 6=Saturday).
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export async function fetchActiveServiceIds(weekday) {
  const col = DOW[weekday];
  const rows = await rest(`gtfs_calendar?select=service_id&${col}=is.true`);
  return rows.map((r) => r.service_id);
}

async function rpc(fn, body) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status}`);
  return res.json();
}

// Stop autocomplete (Turkish-insensitive, de-duplicated by name).
export async function searchStops(q) {
  if (!q || q.length < 2) return [];
  return rpc('search_stops', { p_q: q });
}

// Direct-route trip planner: origin → destination on a given weekday + time window.
// weekday: 0=Sunday..6=Saturday. after/before: seconds since midnight.
export async function planTrip(from, to, weekday, after = 0, before = 86400) {
  return rpc('plan_trip', { p_from: from, p_to: to, p_weekday: weekday, p_after: after, p_before: before });
}

// Real GTFS rail+ferry network (one representative shape per route) as GeoJSON.
export async function fetchRailNetwork() {
  const fc = await rpc('rail_network', {});
  return fc && fc.features ? fc : { type: 'FeatureCollection', features: [] };
}

// Ordered shape points for drawing a route on the map.
export async function fetchShape(shapeId) {
  const rows = await rest(`gtfs_shapes?select=lat,lng,seq&shape_id=eq.${encodeURIComponent(shapeId)}&order=seq.asc`);
  return rows.map((r) => [r.lng, r.lat]);
}
