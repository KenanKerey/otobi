// 3D rail-vehicle rendering (metro / tram / funicular) via MapLibre fill-extrusion,
// plus a points FeatureCollection used for labels, click hit-areas and ferry markers.

const DEG_PER_METER_LAT = 1 / 111319.5;
const degPerMeterLng = (lat) => 1 / (111319.5 * Math.cos((lat * Math.PI) / 180));

// İstanbul rail line colours (by GTFS short_name).
const LINE_COLORS = {
  M1: '#e30613', M1A: '#e30613', M1B: '#e30613',
  M2: '#009640', M2A: '#009640', M3: '#00a3df', M3A: '#00a3df',
  M4: '#e6007e', M5: '#812990', M6: '#b0a062', M7: '#ec6608',
  M8: '#00a99d', M9: '#ffd200', M10: '#c0007a', M11: '#9b6e3b',
  T1: '#0067b1', T3: '#6b7280', T4: '#e95098', T5: '#0096d6',
  F1: '#8c8c8c', F4: '#8c8c8c',
  MARMARAY: '#e30613', MARMARAY1: '#e30613', MARMARAY2: '#e30613',
};

export function colorForLine(line, routeType) {
  if (routeType === 4) return '#16a6e0'; // ferry
  const key = (line || '').toUpperCase();
  if (LINE_COLORS[key]) return LINE_COLORS[key];
  // Marmaray variants / anything containing a known token
  for (const k of Object.keys(LINE_COLORS)) if (key.startsWith(k)) return LINE_COLORS[k];
  return routeType === 0 ? '#0067b1' : routeType === 7 ? '#8c8c8c' : '#9aa4b2';
}

function boxPolygon(lng, lat, headingDeg, halfLength, halfWidth) {
  const h = ((headingDeg || 0) * Math.PI) / 180;
  const sinH = Math.sin(h);
  const cosH = Math.cos(h);
  const mLng = degPerMeterLng(lat);
  const mLat = DEG_PER_METER_LAT;
  const corners = [
    [halfLength, halfWidth],
    [halfLength, -halfWidth],
    [-halfLength, -halfWidth],
    [-halfLength, halfWidth],
  ];
  const coords = corners.map(([along, across]) => {
    const dLng = (along * sinH + across * cosH) * mLng;
    const dLat = (along * cosH - across * sinH) * mLat;
    return [lng + dLng, lat + dLat];
  });
  coords.push(coords[0]);
  return coords;
}

const empty = () => ({ type: 'FeatureCollection', features: [] });

export function createRailGeoJson(vehicles) {
  if (!vehicles || vehicles.length === 0) {
    return { body: empty(), windows: empty(), points: empty() };
  }

  const body = [];
  const windows = [];
  const points = [];

  for (const v of vehicles) {
    const color = colorForLine(v.line, v.routeType);
    const isFerry = v.routeType === 4;

    points.push({
      type: 'Feature',
      properties: {
        id: v.id, line: v.line, color, routeType: v.routeType,
        ferry: isFerry ? 1 : 0,
        label: isFerry ? '⛴' : v.line,
        nextStop: v.nextStop || '', etaMin: v.etaMin ?? '', headsign: v.headsign || '',
      },
      geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
    });

    if (isFerry) continue; // ferries drawn as flat markers, not 3D boxes

    // Train body (longer box, line-coloured)
    body.push({
      type: 'Feature',
      properties: { color, height: 3.4, base: 0.4 },
      geometry: { type: 'Polygon', coordinates: [boxPolygon(v.lng, v.lat, v.heading, 13, 1.4)] },
    });
    // Window band (inset, dark glass)
    windows.push({
      type: 'Feature',
      properties: { height: 2.9, base: 1.6 },
      geometry: { type: 'Polygon', coordinates: [boxPolygon(v.lng, v.lat, v.heading, 12.2, 1.28)] },
    });
  }

  return {
    body: { type: 'FeatureCollection', features: body },
    windows: { type: 'FeatureCollection', features: windows },
    points: { type: 'FeatureCollection', features: points },
  };
}
