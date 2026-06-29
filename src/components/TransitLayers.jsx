import { useState, useEffect } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { fetchRailNetwork } from '../services/gtfs';
import { fetchMetroStations } from '../services/supabase';
import { buildMetroNetwork } from '../hooks/useMetroSim';
import { colorForLine } from './Rail3D';

// Static transit NETWORK visuals. Non-metro (ferry/tram/funicular/Marmaray) is
// drawn from the REAL GTFS shapes; metro is drawn from the CURRENT Metro İstanbul
// stations (so M4 reaches Sabiha Gökçen). Live vehicles (RailLayer) sit on these.
export default function TransitLayers() {
  const [network, setNetwork] = useState(null);
  const [metroNet, setMetroNet] = useState(null);

  useEffect(() => {
    fetchRailNetwork()
      .then((fc) => {
        for (const f of fc.features || []) {
          const p = f.properties || {};
          p.color = colorForLine(p.line, p.route_type);
          p.ferry = p.route_type === 4 ? 1 : 0;
        }
        setNetwork(fc);
      })
      .catch((err) => console.warn('Rail network load error:', err));

    fetchMetroStations()
      .then((rows) => setMetroNet(buildMetroNetwork(rows)))
      .catch((err) => console.warn('Metro network load error:', err));
  }, []);

  return (
    <>
      {/* Current metro network (Metro İstanbul stations) */}
      {metroNet && (
        <Source id="metro-network-src" type="geojson" data={metroNet}>
          <Layer
            id="metro-network-glow"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 9],
              'line-opacity': 0.12,
              'line-blur': 4,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="metro-network-line"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 5.5],
              'line-opacity': 0.92,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}

      {network && (
        <Source id="gtfs-network-src" type="geojson" data={network}>
      {/* soft glow */}
      <Layer
        id="gtfs-network-glow"
        type="line"
        paint={{
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 9],
          'line-opacity': 0.12,
          'line-blur': 4,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      {/* ferry routes: dashed */}
      <Layer
        id="gtfs-network-ferry"
        type="line"
        filter={['==', ['get', 'ferry'], 1]}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 3],
          'line-opacity': 0.6,
          'line-dasharray': [3, 2],
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      {/* rail lines: solid */}
      <Layer
        id="gtfs-network-rail"
        type="line"
        filter={['==', ['get', 'ferry'], 0]}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 5.5],
          'line-opacity': 0.9,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
        </Source>
      )}
    </>
  );
}
