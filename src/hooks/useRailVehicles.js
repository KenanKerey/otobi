import { useState, useEffect, useRef } from 'react';
import { fetchRailVehicles } from '../services/gtfs';

// Polls the schedule-driven rail/ferry positions and tweens between updates so
// trains glide smoothly instead of jumping every poll.

const POLL_MS = 4000;
const TICK_MS = 100;

function lerpAngle(a, b, f) {
  let d = ((b - a + 540) % 360) - 180;
  return (a + d * f + 360) % 360;
}

// Istanbul (UTC+3) seconds-since-midnight, computed client-side.
function istSecNow() {
  const ist = new Date(Date.now() + 3 * 3600 * 1000);
  return ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds();
}

export function useRailVehicles(enabled = true, previewOffset = null) {
  const [vehicles, setVehicles] = useState([]);
  const stateRef = useRef(new Map()); // id -> { from, to, t0, dur, meta }
  const offsetRef = useRef(previewOffset);
  offsetRef.current = previewOffset;

  useEffect(() => {
    if (!enabled) { setVehicles([]); stateRef.current.clear(); return; }
    let alive = true;

    const sample = (s, now) => {
      const f = Math.max(0, Math.min(1, (now - s.t0) / s.dur));
      return {
        lat: s.from.lat + (s.to.lat - s.from.lat) * f,
        lng: s.from.lng + (s.to.lng - s.from.lng) * f,
        heading: lerpAngle(s.from.heading ?? 0, s.to.heading ?? 0, f),
      };
    };

    async function poll() {
      try {
        const off = offsetRef.current;
        const at = off != null ? istSecNow() + off : undefined;
        const list = await fetchRailVehicles(at);
        if (!alive) return;
        const now = performance.now();
        const next = new Map();
        for (const v of list) {
          const prev = stateRef.current.get(v.id);
          const cur = prev ? sample(prev, now) : { lat: v.lat, lng: v.lng, heading: v.heading };
          next.set(v.id, {
            from: cur,
            to: { lat: v.lat, lng: v.lng, heading: v.heading },
            t0: now, dur: POLL_MS,
            meta: { id: v.id, line: v.line, routeType: v.routeType, direction: v.direction, headsign: v.headsign, nextStop: v.nextStop, etaMin: v.etaMin },
          });
        }
        stateRef.current = next;
      } catch { /* keep last positions on error */ }
    }

    poll();
    const pollId = setInterval(poll, POLL_MS);
    const tickId = setInterval(() => {
      const now = performance.now();
      const out = [];
      for (const s of stateRef.current.values()) {
        const p = sample(s, now);
        out.push({ ...s.meta, lat: p.lat, lng: p.lng, heading: p.heading });
      }
      setVehicles(out);
    }, TICK_MS);

    return () => { alive = false; clearInterval(pollId); clearInterval(tickId); };
  }, [enabled, previewOffset]);

  return vehicles;
}
