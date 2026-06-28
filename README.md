# Otobi — İstanbul Live Bus Tracker

A real-time İstanbul public-transport map. It tracks IETT buses live, snaps them
to the actual road network, and animates them smoothly between GPS updates — on a
3D MapLibre map. Inspired by the look of istanbulasim.com, but built around **real
vehicle positions** rather than a timetable simulation.

> ⚠️ Research / hobby project. Data belongs to İBB / IETT (see *Data & credits*).

## Features

- **Live bus tracking** per line, using the official IETT real-time feed.
- **Road-snapped motion** — buses are projected onto their line's road geometry, so
  they follow streets instead of cutting across buildings.
- **Smooth hybrid animation** — positions glide continuously between API updates
  (route-based interpolation + bounded dead-reckoning) instead of teleporting every
  poll.
- **3D map** with extruded buses, transit lines, stops and ETA to the approaching stop.
- **Line search & route (A→B) planning** over geocoded stops.

## Tech stack

- **Frontend:** React 19, Vite, MapLibre GL (`react-map-gl`), Tailwind.
- **Data:** IETT SOAP web services (`api.ibb.gov.tr`), OSRM (road geometry),
  Nominatim (geocoding).
- **Backend:** Supabase (Postgres + Edge Functions + pg_cron) for cached static data
  and a single shared poller.

## Architecture highlights

The interesting engineering is in **staying live without hammering a rate-limited API**:

- **Route snapping + interpolation** (`src/utils/polyline.js`, `src/hooks/useBuses.js`)
  — each bus is projected onto its line polyline and advanced along it, so motion is
  both on-road and continuous.
- **Caching + circuit-breaking dev proxy** (`vite.config.js`) — collapses bursts
  (HMR, multiple tabs), and backs off when the upstream gateway rate-limits, serving
  the last good data instead of erroring.
- **Supabase as a shared backend** — static data (15k stops, ~800 lines) is seeded
  server-side via an Edge Function, so clients read it from Postgres instead of hitting
  IETT. A scheduled poller (in progress) fetches the live fleet once per minute and
  serves every visitor from one source, removing per-client rate-limit exposure.

## Local setup

```bash
npm install
cp .env.example .env      # then fill in your Supabase URL + anon key
npm run dev               # http://localhost:5173
```

The Supabase keys in `.env` are public client keys (protected by Row Level Security).
Never commit `.env`; it is git-ignored.

## Data & credits

- Transit data: **İBB / IETT Açık Veri** (`api.ibb.gov.tr`, `data.ibb.gov.tr`).
- Routing: **OSRM**. Geocoding: **Nominatim / OpenStreetMap**.
- Visual inspiration: istanbulasim.com.

This project is not affiliated with or endorsed by İBB / IETT.
