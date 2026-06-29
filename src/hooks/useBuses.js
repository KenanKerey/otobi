import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllStops, getBusesByLine } from '../services/ibbApi';
import { getRoutePolyline } from '../services/routeData';
import { touchLine, triggerRefresh } from '../services/supabase';
import { calculateHeading, calculateDistanceKm, calculateEtaMinutes } from '../utils/distance';
import { projectToRoute, pointAtDistance } from '../utils/polyline';

const POLL_INTERVAL = 10000; // ms - how often we pull fresh positions
const ANIM_INTERVAL = 40;    // ms - ~25fps render loop
// If a GPS fix is further than this from the route, don't snap (likely wrong
// direction match or off-route detour) — fall back to straight-line motion.
const MAX_SNAP_OFFSET_M = 120;
// Motion model. IBB's position feed only refreshes every ~30-60s, but the speed
// feed is live, so we drive motion from the reported SPEED: every frame the bus
// advances forward at its speed, and each new GPS fix nudges it forward toward
// the truth. The render point only ever moves FORWARD (never reverses), and we
// cap how far ahead of the last fix it may get so it can't run away.
const EASE = 0.15;            // forward correction toward a new GPS fix (route)
const EASE_LINE = 0.08;       // forward correction in lat/lng fallback mode
const MPS_PER_KMH = 1 / 3.6;
const M_PER_DEG = 111320;

export function useBuses(filterText) {
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const lastGoodData = useRef(new Map());
  const prevPositions = useRef(new Map());   // busId -> {lat,lng} previous API fix (for heading)
  const prevTimes = useRef(new Map());       // busId -> last GPS timestamp string
  const lastHeadings = useRef(new Map());
  const lastSpeeds = useRef(new Map());      // busId -> last computed speed (km/h)

  // ── Animation state ──────────────────────────────────────────────
  const routes = useRef(new Map());          // destination -> builtRoute | null (null = none)
  const pendingRoutes = useRef(new Set());   // destinations currently being fetched
  const busState = useRef(new Map());         // busId -> animation state
  const renderedS = useRef(new Map());        // busId -> current distance-along-route
  const renderedPos = useRef(new Map());      // busId -> {lat,lng} (fallback mode)

  const retry = useCallback(() => setRetryCount(c => c + 1), []);

  useEffect(() => {
    if (!filterText || filterText.length < 2) {
      setBuses([]);
      busState.current.clear();
      renderedS.current.clear();
      renderedPos.current.clear();
      setLoading(false);
      setError(null);
      return;
    }

    let alive = true;
    let firstPaint = true;
    const key = filterText.toUpperCase();

    // Kick off (once) a road-geometry fetch for a given direction/destination.
    const ensureRoute = (destination) => {
      const dest = destination || '';
      if (routes.current.has(dest) || pendingRoutes.current.has(dest)) return;
      pendingRoutes.current.add(dest);
      getRoutePolyline(key, dest)
        .then(route => { if (alive) routes.current.set(dest, route || null); })
        .catch(() => { if (alive) routes.current.set(dest, null); })
        .finally(() => pendingRoutes.current.delete(dest));
    };

    const loadData = async () => {
      try {
        // Keep this line marked active and nudge the backend poller (self-throttled,
        // so this is cheap) so Supabase has fresh positions before we read them.
        await touchLine(key).catch(() => {});
        await triggerRefresh();

        const stopsMap = await getAllStops();
        const fetched = await getBusesByLine(filterText, stopsMap);
        if (!alive) return;

        // Compute heading (fallback) + speed (from GPS deltas, no fleet call).
        const enriched = fetched.map(bus => {
          const prev = prevPositions.current.get(bus.id);
          const prevTime = prevTimes.current.get(bus.id);

          let heading = null;
          if (prev) {
            const dist = calculateDistanceKm(prev.lat, prev.lng, bus.lat, bus.lng);
            if (dist > 0.003) heading = calculateHeading(prev.lat, prev.lng, bus.lat, bus.lng);
          }
          if (heading == null && bus.approachingStop?.lat && bus.approachingStop?.lng) {
            heading = calculateHeading(bus.lat, bus.lng, bus.approachingStop.lat, bus.approachingStop.lng);
          }
          if (heading == null) heading = lastHeadings.current.get(bus.id) ?? 0;
          lastHeadings.current.set(bus.id, heading);

          // Speed comes straight from the fleet feed (via Supabase) — instant.
          // Only fall back to a GPS-delta estimate if it's somehow missing.
          let speed = bus.speed;
          if (speed == null) {
            speed = lastSpeeds.current.get(bus.id) ?? null;
            if (prev && bus.rawTime && bus.rawTime !== prevTime) {
              const distKm = calculateDistanceKm(prev.lat, prev.lng, bus.lat, bus.lng);
              let dtSec = POLL_INTERVAL / 1000;
              if (prevTime) {
                const dt = (Date.parse(bus.rawTime.replace(' ', 'T')) - Date.parse(prevTime.replace(' ', 'T'))) / 1000;
                if (dt > 0 && dt < 600) dtSec = dt;
              }
              const inst = distKm / (dtSec / 3600); // km/h
              if (isFinite(inst)) {
                const prevS = lastSpeeds.current.get(bus.id);
                const blended = prevS != null ? prevS * 0.4 + inst * 0.6 : inst;
                speed = Math.max(0, Math.min(120, Math.round(blended)));
              }
            }
          }
          lastSpeeds.current.set(bus.id, speed);

          // Fill in ETA now that we have a speed estimate.
          let approachingStop = bus.approachingStop;
          if (approachingStop) {
            const avg = speed && speed > 0 ? speed : 20;
            approachingStop = { ...approachingStop, etaMin: calculateEtaMinutes(approachingStop.distanceKm, avg) };
          }

          return { ...bus, heading, speed, approachingStop };
        });

        fetched.forEach(b => {
          prevPositions.current.set(b.id, { lat: b.lat, lng: b.lng });
          if (b.rawTime) prevTimes.current.set(b.id, b.rawTime);
        });

        // Make sure we have (or are fetching) a road polyline per direction.
        const dests = new Set(enriched.map(b => b.destination || ''));
        dests.forEach(ensureRoute);

        // Rebuild per-bus animation state. vel is the reported speed (m/s); the
        // render loop advances the bus forward at this speed continuously.
        const fixTime = Date.now();
        const nextState = new Map();
        enriched.forEach(bus => {
          const vel = Math.max(0, (bus.speed ?? 0)) * MPS_PER_KMH; // m/s
          const route = routes.current.get(bus.destination || '');
          if (route) {
            const { s: targetS, offset } = projectToRoute(route, bus.lat, bus.lng);
            if (offset <= MAX_SNAP_OFFSET_M) {
              nextState.set(bus.id, { mode: 'route', route, targetS, vel, meta: bus });
              if (!renderedS.current.has(bus.id)) renderedS.current.set(bus.id, targetS);
              renderedPos.current.delete(bus.id);
              return;
            }
          }
          // Fallback: advance along heading when no route polyline is available.
          nextState.set(bus.id, {
            mode: 'line',
            targetLat: bus.lat, targetLng: bus.lng,
            vel, heading: bus.heading, meta: bus,
          });
          if (!renderedPos.current.has(bus.id)) renderedPos.current.set(bus.id, { lat: bus.lat, lng: bus.lng });
          renderedS.current.delete(bus.id);
        });

        // Drop render state for buses no longer reported.
        for (const id of renderedS.current.keys()) if (!nextState.has(id)) renderedS.current.delete(id);
        for (const id of renderedPos.current.keys()) if (!nextState.has(id)) renderedPos.current.delete(id);

        busState.current = nextState;

        if (firstPaint) {
          // First paint: show buses at their reported positions immediately;
          // the render loop takes over animation from here.
          setBuses(enriched);
          firstPaint = false;
        }

        setError(null);
        lastGoodData.current.set(key, enriched);
      } catch (err) {
        console.error('Bus data error:', err);
        if (!alive) return;
        const cached = lastGoodData.current.get(key);
        if (cached?.length > 0) {
          setError('Veriler geçici olarak güncellenemiyor.');
        } else {
          setError(err.message || 'Veri yüklenirken hata oluştu.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    setLoading(true);
    loadData();
    const pollId = setInterval(loadData, POLL_INTERVAL);

    // ── Continuous render loop ──────────────────────────────────────
    // Advance each bus forward at its reported speed every frame; nudge it
    // forward toward the latest GPS fix; never move backward; cap how far ahead
    // of the fix it may drift. Smooth continuous motion, no reversing.
    const animId = setInterval(() => {
      if (!alive || busState.current.size === 0) return;

      const dt = ANIM_INTERVAL / 1000;
      const blended = [];

      busState.current.forEach((state, id) => {
        if (state.mode === 'route') {
          let s = renderedS.current.get(id);
          if (s == null) s = state.targetS;
          s += state.vel * dt;                                  // continuous forward
          if (state.targetS > s) s += (state.targetS - s) * EASE; // ease up to a newer fix
          const lead = Math.max(150, state.vel * 25);           // don't drift too far ahead
          if (s > state.targetS + lead) s = state.targetS + lead;
          renderedS.current.set(id, s);
          const pt = pointAtDistance(state.route, s);
          blended.push({ ...state.meta, lat: pt.lat, lng: pt.lng, heading: pt.heading });
        } else {
          let cur = renderedPos.current.get(id) || { lat: state.targetLat, lng: state.targetLng };
          const hRad = (state.heading || 0) * Math.PI / 180;
          const latRad = cur.lat * Math.PI / 180;
          let lat = cur.lat + (state.vel * dt * Math.cos(hRad)) / M_PER_DEG;
          let lng = cur.lng + (state.vel * dt * Math.sin(hRad)) / (M_PER_DEG * Math.cos(latRad));
          lat += (state.targetLat - lat) * EASE_LINE;           // drift toward latest fix
          lng += (state.targetLng - lng) * EASE_LINE;
          renderedPos.current.set(id, { lat, lng });
          blended.push({ ...state.meta, lat, lng, heading: state.heading });
        }
      });

      setBuses(blended);
    }, ANIM_INTERVAL);

    return () => {
      alive = false;
      clearInterval(pollId);
      clearInterval(animId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterText, retryCount]);

  return { buses, loading, error, retry };
}
