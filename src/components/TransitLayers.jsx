import { useState, useEffect } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';

export default function TransitLayers() {
  const [railData, setRailData] = useState(null);
  const [ferryData, setFerryData] = useState(null);
  const [stationData, setStationData] = useState(null);

  useEffect(() => {
    // Fetch static GeoJSON files once
    Promise.all([
      fetch('/transit/rail.geojson').then(r => r.ok ? r.json() : null),
      fetch('/transit/ferry.geojson').then(r => r.ok ? r.json() : null),
      fetch('/transit/stations.geojson').then(r => r.ok ? r.json() : null),
    ]).then(([rail, ferry, stations]) => {
      if (rail) setRailData(rail);
      if (ferry) setFerryData(ferry);
      if (stations) setStationData(stations);
    }).catch(err => console.warn('Transit layer load error:', err));
  }, []);

  return (
    <>
      {/* Rail lines (metro, tram, light rail) */}
      {railData && (
        <Source id="transit-rail-src" type="geojson" data={railData}>
          <Layer
            id="transit-rail-glow"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 8],
              'line-opacity': 0.12,
              'line-blur': 4,
            }}
          />
          <Layer
            id="transit-rail-line"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 3.5],
              'line-opacity': 0.7,
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
          />
        </Source>
      )}

      {/* Ferry routes */}
      {ferryData && (
        <Source id="transit-ferry-src" type="geojson" data={ferryData}>
          <Layer
            id="transit-ferry-line"
            type="line"
            paint={{
              'line-color': '#4fc3f7',
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 2.5],
              'line-opacity': 0.5,
              'line-dasharray': [4, 3],
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
          />
        </Source>
      )}

      {/* Stations */}
      {stationData && (
        <Source id="transit-stations-src" type="geojson" data={stationData}>
          <Layer
            id="transit-station-dots"
            type="circle"
            minzoom={12}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 5],
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#0a0a0a',
              'circle-opacity': 0.8,
            }}
          />
          <Layer
            id="transit-station-labels"
            type="symbol"
            minzoom={14}
            layout={{
              'text-field': ['get', 'name'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9, 16, 11],
              'text-offset': [0, 1.2],
              'text-anchor': 'top',
              'text-max-width': 8,
              'text-font': ['Noto Sans Regular'],
            }}
            paint={{
              'text-color': '#e2e8f0',
              'text-halo-color': '#0a0a0a',
              'text-halo-width': 1.5,
              'text-opacity': 0.7,
            }}
          />
        </Source>
      )}
    </>
  );
}
