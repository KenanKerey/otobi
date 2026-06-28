import { useState, useEffect, useRef } from 'react';
import { getFleetPositions } from '../services/ibbApi';

/**
 * Polls all fleet vehicle positions when no specific line is selected.
 * Returns a GeoJSON FeatureCollection for performant MapLibre circle layer rendering.
 */
export function useFleetOverview(active) {
  const [fleetGeoJson, setFleetGeoJson] = useState(null);
  const lastData = useRef(null);

  useEffect(() => {
    if (!active) {
      setFleetGeoJson(null);
      return;
    }

    let alive = true;

    const loadFleet = async () => {
      try {
        const vehicles = await getFleetPositions();
        if (!alive || vehicles.length === 0) return;

        const geojson = {
          type: 'FeatureCollection',
          features: vehicles.map(v => ({
            type: 'Feature',
            properties: {
              id: v.id,
              line: v.line,
              speed: v.speed,
            },
            geometry: {
              type: 'Point',
              coordinates: [v.lng, v.lat],
            },
          })),
        };

        lastData.current = geojson;
        setFleetGeoJson(geojson);
      } catch (err) {
        console.warn('Fleet overview error:', err);
        if (lastData.current) setFleetGeoJson(lastData.current);
      }
    };

    loadFleet();
    // Fleet data is cached ~30s in the service layer; polling faster just
    // returns the cache, so align the interval to avoid redundant work.
    const pollId = setInterval(loadFleet, 30000);

    return () => {
      alive = false;
      clearInterval(pollId);
    };
  }, [active]);

  return fleetGeoJson;
}
