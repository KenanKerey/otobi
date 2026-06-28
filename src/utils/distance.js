/**
 * Haversine distance between two points in km.
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * ETA in minutes based on distance and speed.
 */
export function calculateEtaMinutes(distanceKm, averageSpeedKmh = 20) {
  if (distanceKm == null || isNaN(distanceKm)) return null;
  const timeHours = distanceKm / averageSpeedKmh;
  return Math.max(1, Math.ceil(timeHours * 60));
}

/**
 * Calculate bearing/heading from point A to point B in degrees (0-360).
 * 0 = North, 90 = East, 180 = South, 270 = West.
 */
export function calculateHeading(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1R = lat1 * Math.PI / 180;
  const lat2R = lat2 * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2R);
  const x =
    Math.cos(lat1R) * Math.sin(lat2R) -
    Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);

  let heading = Math.atan2(y, x) * 180 / Math.PI;
  return (heading + 360) % 360;
}
