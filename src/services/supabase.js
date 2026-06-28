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
