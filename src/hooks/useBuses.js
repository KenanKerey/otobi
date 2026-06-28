import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllStops, getBusesByLine } from '../services/ibbApi';
import { getRoutePolyline } from '../services/routeData';
import { calculateHeading, calculateDistanceKm, calculateEtaMinutes } from '../utils/distance';
import { projectToRoute, pointAtDistance } from '../utils/polyline';

const POLL_INTERVAL = 20000; // ms - how often we pull fresh API positions
const ANIM_INTERVAL = 40;    // ms - ~25fps render loop
// If a GPS fix is further than this from the route, don't snap (likely wrong
// direction match or off-route detour) — fall back to straight-line motion.
const MAX_SNAP_OFFSET_M = 120;
// A bus that advanced more than this between two fixes is treated as "moving".
const MOVE_THRESHOLD_M = 8;
// How far past a fix we let a moving bus dead-reckon before the next one
// arrives (1.3 = up to +30% of the poll interval). Keeps motion fluid if a
// poll is late; bounded so predictions never drift far from reality.
const OVERSHOOT = 1.3;

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
  const renderedS = useRef(new Map());        // busId -> current distance-along-route (route mode)
  const renderedPos = useRef(new Map());      // busId -> {lat,lng} (fallback mode)
  const pollStart = useRef(0);

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

          // Speed: derive from distance / time between consecutive GPS fixes.
          // Only recompute when a genuinely new fix arrived (timestamp changed).
          let speed = lastSpeeds.current.get(bus.id) ?? null;
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
              // Light smoothing to tame GPS jitter.
              const blended = prevS != null ? prevS * 0.4 + inst * 0.6 : inst;
              speed = Math.max(0, Math.min(120, Math.round(blended)));
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

        // Rebuild per-bus animation state from current rendered position to the
        // new API target. Buses glide over the whole POLL_INTERVAL → continuous
        // motion, snapped to the road polyline when one is available.
        const nextState = new Map();
        enriched.forEach(bus => {
          const route = routes.current.get(bus.destination || '');
          if (route) {
            const { s: targetS, offset } = projectToRoute(route, bus.lat, bus.lng);
            if (offset <= MAX_SNAP_OFFSET_M) {
              const prevS = renderedS.current.has(bus.id)
                ? renderedS.current.get(bus.id)
                : targetS;
              const moving = Math.abs(targetS - prevS) > MOVE_THRESHOLD_M;
              nextState.set(bus.id, { mode: 'route', route, prevS, targetS, moving, meta: bus });
              renderedPos.current.delete(bus.id);
              return;
            }
          }
          // Fallback: straight-line glide from last rendered point to new fix.
          const prev = renderedPos.current.get(bus.id) || { lat: bus.lat, lng: bus.lng };
          const moving = calculateDistanceKm(prev.lat, prev.lng, bus.lat, bus.lng) * 1000 > MOVE_THRESHOLD_M;
          nextState.set(bus.id, {
            mode: 'line',
            prevLat: prev.lat, prevLng: prev.lng,
            targetLat: bus.lat, targetLng: bus.lng,
            moving,
            meta: bus,
          });
          renderedS.current.delete(bus.id);
        });

        // Drop state for buses no longer reported.
        for (const id of renderedS.current.keys()) if (!nextState.has(id)) renderedS.current.delete(id);
        for (const id of renderedPos.current.keys()) if (!nextState.has(id)) renderedPos.current.delete(id);

        busState.current = nextState;
        pollStart.current = Date.now();

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
    const animId = setInterval(() => {
      if (!alive || busState.current.size === 0) return;

      const rawP = (Date.now() - pollStart.current) / POLL_INTERVAL;
      const blended = [];

      busState.current.forEach((state, id) => {
        // Glide across the whole interval; moving buses may briefly dead-reckon
        // past the last fix (OVERSHOOT) so late polls don't cause a hard stop.
        const p = Math.min(rawP, state.moving ? OVERSHOOT : 1);

        if (state.mode === 'route') {
          const s = state.prevS + (state.targetS - state.prevS) * p;
          renderedS.current.set(id, s);
          const pt = pointAtDistance(state.route, s);
          blended.push({ ...state.meta, lat: pt.lat, lng: pt.lng, heading: pt.heading });
        } else {
          const lat = state.prevLat + (state.targetLat - state.prevLat) * p;
          const lng = state.prevLng + (state.targetLng - state.prevLng) * p;
          renderedPos.current.set(id, { lat, lng });
          let heading = state.meta.heading;
          if (state.targetLat !== state.prevLat || state.targetLng !== state.prevLng) {
            const h = calculateHeading(state.prevLat, state.prevLng, state.targetLat, state.targetLng);
            if (!isNaN(h)) heading = h;
          }
          blended.push({ ...state.meta, lat, lng, heading });
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
