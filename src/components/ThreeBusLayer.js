// 3D Bus rendering via MapLibre fill-extrusion layers
// Each bus is rendered as an extruded polygon (body + stripe + windows)

const DEG_PER_METER_LAT = 1 / 111319.5;

function degPerMeterLng(lat) {
  return 1 / (111319.5 * Math.cos((lat * Math.PI) / 180));
}

// Create a rotated rectangular polygon for a bus at given position/heading
function busPolygon(lng, lat, headingDeg, halfLength, halfWidth) {
  const h = ((headingDeg || 0) * Math.PI) / 180;
  const sinH = Math.sin(h);
  const cosH = Math.cos(h);
  const mLng = degPerMeterLng(lat);
  const mLat = DEG_PER_METER_LAT;

  // Corners in bus space: (along, across) → front-right, front-left, rear-left, rear-right
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

  // Close the polygon
  coords.push(coords[0]);
  return coords;
}

// Generate GeoJSON FeatureCollections for the multi-layer bus rendering
export function createBusGeoJson(buses) {
  if (!buses || buses.length === 0) {
    const empty = { type: 'FeatureCollection', features: [] };
    return { body: empty, stripe: empty, windows: empty, wheels: empty };
  }

  const bodyFeatures = [];
  const stripeFeatures = [];
  const windowFeatures = [];
  const wheelFeatures = [];

  buses.forEach((bus) => {
    const { lng, lat, heading } = bus;

    // Bus body (main white shape)
    bodyFeatures.push({
      type: 'Feature',
      properties: { height: 3.0, base: 0.5 },
      geometry: {
        type: 'Polygon',
        coordinates: [busPolygon(lng, lat, heading, 6, 1.25)],
      },
    });

    // Orange IETT stripe (slightly wider to be visible)
    stripeFeatures.push({
      type: 'Feature',
      properties: { height: 1.1, base: 0.5 },
      geometry: {
        type: 'Polygon',
        coordinates: [busPolygon(lng, lat, heading, 6.05, 1.28)],
      },
    });

    // Windows (upper section, slightly inset)
    windowFeatures.push({
      type: 'Feature',
      properties: { height: 2.8, base: 1.4 },
      geometry: {
        type: 'Polygon',
        coordinates: [busPolygon(lng, lat, heading, 5.5, 1.27)],
      },
    });

    // Wheels / undercarriage (dark, low)
    wheelFeatures.push({
      type: 'Feature',
      properties: { height: 0.5, base: 0 },
      geometry: {
        type: 'Polygon',
        coordinates: [busPolygon(lng, lat, heading, 5.5, 1.35)],
      },
    });
  });

  return {
    body: { type: 'FeatureCollection', features: bodyFeatures },
    stripe: { type: 'FeatureCollection', features: stripeFeatures },
    windows: { type: 'FeatureCollection', features: windowFeatures },
    wheels: { type: 'FeatureCollection', features: wheelFeatures },
  };
}
