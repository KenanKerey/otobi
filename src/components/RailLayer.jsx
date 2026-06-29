import { useMemo, useState, useEffect } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useRailVehicles } from '../hooks/useRailVehicles';
import { useMetroVehicles } from '../hooks/useMetroSim';
import { fetchMetroStations } from '../services/supabase';
import { createRailGeoJson } from './Rail3D';

// Live vehicles: GTFS schedule (ferry/tram/funicular/Marmaray) + estimated metro
// from the current Metro İstanbul station data (so M4 reaches Sabiha Gökçen).
export default function RailLayer({ enabled = true, previewOffset = null }) {
  const gtfsVehicles = useRailVehicles(enabled, previewOffset);

  const [metroStations, setMetroStations] = useState(null);
  useEffect(() => {
    fetchMetroStations().then(setMetroStations).catch(() => {});
  }, []);
  const metroVehicles = useMetroVehicles(enabled ? metroStations : null, previewOffset);

  const vehicles = useMemo(
    () => [...gtfsVehicles, ...metroVehicles],
    [gtfsVehicles, metroVehicles]
  );
  const geo = useMemo(() => createRailGeoJson(vehicles), [vehicles]);

  if (!vehicles.length) return null;

  return (
    <>
      {/* 3D train bodies (metro / tram / funicular), coloured by line.
          Only at closer zoom — at overview zoom the coloured dots below carry it. */}
      <Source id="rail-body-src" type="geojson" data={geo.body}>
        <Layer
          id="rail-body"
          type="fill-extrusion"
          minzoom={13}
          paint={{
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-opacity': 0.95,
          }}
        />
      </Source>
      <Source id="rail-windows-src" type="geojson" data={geo.windows}>
        <Layer
          id="rail-windows"
          type="fill-extrusion"
          minzoom={13}
          paint={{
            'fill-extrusion-color': '#0b1622',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-opacity': 0.85,
          }}
        />
      </Source>

      {/* Points: ferry markers + line labels + click hit-area */}
      <Source id="rail-points-src" type="geojson" data={geo.points}>
        {/* glow under each vehicle */}
        <Layer
          id="rail-glow"
          type="circle"
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 15, 13],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.16,
            'circle-blur': 1,
          }}
        />
        {/* ferry dots (3D trains cover metro; ferries shown here) */}
        <Layer
          id="rail-ferry-dots"
          type="circle"
          filter={['==', ['get', 'ferry'], 1]}
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3.5, 15, 7],
            'circle-color': '#16a6e0',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.6,
            'circle-opacity': 0.97,
          }}
        />
        {/* coloured metro/tram dot — visible at EVERY zoom so moving trains are
            always seen on the overview; 3D boxes sit on top once zoomed in */}
        <Layer
          id="rail-metro-dots"
          type="circle"
          filter={['==', ['get', 'ferry'], 0]}
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 11, 4.5, 14, 6],
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.4,
            'circle-opacity': 0.96,
          }}
        />
        {/* line-code labels */}
        <Layer
          id="rail-labels"
          type="symbol"
          minzoom={11}
          filter={['==', ['get', 'ferry'], 0]}
          layout={{
            'text-field': ['get', 'label'],
            'text-size': 10,
            'text-font': ['Noto Sans Bold'],
            'text-offset': [0, -1.4],
            'text-anchor': 'bottom',
            'text-allow-overlap': false,
          }}
          paint={{
            'text-color': '#ffffff',
            'text-halo-color': ['get', 'color'],
            'text-halo-width': 1.8,
          }}
        />
        {/* transparent hit-area for clicks */}
        <Layer
          id="rail-points"
          type="circle"
          paint={{ 'circle-radius': 14, 'circle-color': '#000000', 'circle-opacity': 0 }}
        />
      </Source>
    </>
  );
}
