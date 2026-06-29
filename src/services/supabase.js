// Thin Supabase REST client for the pre-seeded static transit data
// (stops + lines). No SDK dependency — just fetch against PostgREST.
// These reads hit Supabase, not the rate-limited IBB API.

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function rest(path, init = {}) {
  if (!URL || !KEY) throw new Error('Supabase env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) tanımlı değil');
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
  return res.json();
}

// All stops in a single response (RPC bypasses PostgREST's 1000-row cap).
export async function fetchAllStops() {
  return rest('rpc/get_all_stops', { method: 'POST', body: '{}' });
}

// 792 lines — comfortably under the row cap, plain select is fine.
export async function fetchAllLines() {
  return rest('lines?select=code,name&order=code.asc');
}

// ── Live positions (backend poller writes these; clients only read) ──
const VEHICLE_COLS = 'kapino,line,yon,guzergah,lat,lng,speed,plate,yakin_durak,raw_time,updated_at';

export async function fetchVehiclesByLine(line) {
  const code = encodeURIComponent((line || '').toUpperCase());
  const fresh = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  return rest(`vehicle_positions?select=${VEHICLE_COLS}&line=eq.${code}&updated_at=gte.${fresh}&order=updated_at.desc`);
}

// Tell the backend a line is being viewed, so the poller keeps it fresh.
export async function touchLine(line) {
  return rest('rpc/touch_line', { method: 'POST', body: JSON.stringify({ p_line: (line || '').toUpperCase() }) });
}

// Nudge the poller for an immediate refresh (it self-throttles, so calling this
// often is cheap and never floods the upstream IBB API). Fire-and-forget.
export async function triggerRefresh() {
  try {
    await fetch(`${URL}/functions/v1/refresh-positions`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch { /* best effort */ }
}
