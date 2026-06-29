import { useState, useRef, useCallback, useEffect } from 'react';
import MapGL, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import { LocateFixed, Plus, Minus, Compass } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getBusLineRoute, getDirectionStops } from '../services/routeData';
import { createBusGeoJson } from './ThreeBusLayer';
import { useFleetOverview } from '../hooks/useFleetOverview';
import TransitLayers from './TransitLayers';

const MAP_STYLE = 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json';
const ISTANBUL = { longitude: 28.9784, latitude: 41.0082 };

// Navigation route layers (Nereden-Nereye)
const NAV_ROUTE_LAYER = {
  id: 'nav-route-line',
  type: 'line',
  paint: { 'line-color': '#fde047', 'line-width': 4, 'line-opacity': 0.8 },
  layout: { 'line-cap': 'round', 'line-join': 'round' },
};
const NAV_ROUTE_GLOW = {
  id: 'nav-route-glow',
  type: 'line',
  paint: { 'line-color': '#fde047', 'line-width': 12, 'line-opacity': 0.15, 'line-blur': 8 },
};

// Bus line route layers (on click)
const BUS_ROUTE_LAYER = {
  id: 'bus-route-line',
  type: 'line',
  paint: { 'line-color': '#4c8dff', 'line-width': 4, 'line-opacity': 0.95 },
  layout: { 'line-cap': 'round', 'line-join': 'round' },
};
const BUS_ROUTE_GLOW = {
  id: 'bus-route-glow',
  type: 'line',
  paint: { 'line-color': '#4c8dff', 'line-width': 14, 'line-opacity': 0.18, 'line-blur': 8 },
  layout: { 'line-cap': 'round', 'line-join': 'round' },
};

function MapControls({ mapRef }) {
  const handleZoomIn = () => mapRef.current?.getMap().zoomIn({ duration: 300 });
  const handleZoomOut = () => mapRef.current?.getMap().zoomOut({ duration: 300 });
  const handleReset = () => {
    mapRef.current?.getMap().flyTo({
      center: [ISTANBUL.longitude, ISTANBUL.latitude],
      zoom: 11, pitch: 60, bearing: -17, duration: 1500,
    });
  };
  const handleLocate = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.getMap().flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 16, pitch: 60, duration: 1500,
        });
      },
      (err) => console.error('Konum alınamadı:', err.message)
    );
  };

  const btn = 'w-9 h-9 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors cursor-pointer';

  return (
    <div className="absolute bottom-4 left-3 sm:left-4 z-[950] hud-surface rounded-xl overflow-hidden flex flex-col divide-y divide-white/[0.06]">
      <button onClick={handleZoomIn} title="Yakınlaştır" className={btn}><Plus className="h-4 w-4" /></button>
      <button onClick={handleZoomOut} title="Uzaklaştır" className={btn}><Minus className="h-4 w-4" /></button>
      <button onClick={handleReset} title="İstanbul'a dön" className={btn}><Compass className="h-4 w-4" /></button>
      <button onClick={handleLocate} title="Konumuma git" className={btn}><LocateFixed className="h-4 w-4" /></button>
    </div>
  );
}


export default function Map({ buses }) {
  const mapRef = useRef(null);
  const { activeBus, setActiveBus, origin, destination, routeGeometry, filterText } = useApp();

  // Show all fleet vehicles when no line is selected
  const fleetActive = !filterText || filterText.length < 2;
  const fleetGeoJson = useFleetOverview(fleetActive);
  const [busRoute, setBusRoute] = useState(null);
  const [routeStops, setRouteStops] = useState(null);
  const busRouteLineRef = useRef(null);

  // 3D bus GeoJSON data (fill-extrusion layers) - recomputed every render
  const busGeo = createBusGeoJson(buses);

  // Compute approaching stops
  const approachingStops = Object.values(
    (buses || []).reduce((acc, bus) => {
      if (bus.approachingStop?.lat && bus.approachingStop?.lng) {
        acc[bus.approachingStop.code] = bus.approachingStop;
      }
      return acc;
    }, {})
  );

  const [viewState, setViewState] = useState({
    ...ISTANBUL, zoom: 11, pitch: 60, bearing: -17,
  });

  // Fly to the active bus when it changes (selected from map or list)
  useEffect(() => {
    if (activeBus && mapRef.current) {
      mapRef.current.getMap().flyTo({
        center: [activeBus.lng, activeBus.lat],
        zoom: 16, pitch: 60, duration: 1200,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBus?.id]);

  // Draw the active bus's line route + stops (real IBB route data)
  useEffect(() => {
    if (!activeBus) {
      setBusRoute(null);
      setRouteStops(null);
      busRouteLineRef.current = null;
      return;
    }
    const lineKey = `${activeBus.line}-${activeBus.destination}`;
    if (busRouteLineRef.current === lineKey) return;
    busRouteLineRef.current = lineKey;

    getBusLineRoute(activeBus.line, activeBus.destination).then((geo) => {
      setBusRoute(geo || null);
    });
    getDirectionStops(activeBus.line, activeBus.destination).then((stops) => {
      setRouteStops({
        type: 'FeatureCollection',
        features: (stops || []).map((s) => ({
          type: 'Feature',
          properties: { name: s.name },
          geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        })),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBus?.id]);

  // Fit route bounds (Nereden-Nereye)
  useEffect(() => {
    if (origin && destination && mapRef.current) {
      const map = mapRef.current.getMap();
      map.fitBounds(
        [[Math.min(origin.lng, destination.lng), Math.min(origin.lat, destination.lat)],
         [Math.max(origin.lng, destination.lng), Math.max(origin.lat, destination.lat)]],
        { padding: { top: 120, bottom: 80, left: 60, right: 60 }, pitch: 50, duration: 1500 }
      );
    }
  }, [origin, destination]);

  const onMapLoad = useCallback((evt) => {
    const map = evt.target;
    const sources = Object.keys(map.getStyle().sources);

    for (const src of sources) {
      if (map.getLayer('3d-buildings')) break;
      try {
        map.addLayer({
          id: '3d-buildings',
          source: src,
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'render_height'], 0, '#12121e', 50, '#1a1a30', 100, '#222240'],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.7,
          },
        });
      } catch { /* skip */ }
    }
  }, []);

  const handleBusClick = useCallback((bus) => {
    setActiveBus(bus);
  }, [setActiveBus]);

  return (
    <div className="absolute inset-0">
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        onLoad={onMapLoad}
        attributionControl={true}
        maxPitch={85}
      >
        {/* Bus line route */}
        {busRoute && (
          <Source id="bus-route-src" type="geojson" data={busRoute}>
            <Layer {...BUS_ROUTE_GLOW} />
            <Layer {...BUS_ROUTE_LAYER} />
          </Source>
        )}

        {/* Line stops along the route */}
        {routeStops && (
          <Source id="route-stops-src" type="geojson" data={routeStops}>
            <Layer
              id="route-stops"
              type="circle"
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 14, 3.5, 16, 5],
                'circle-color': '#0b0d12',
                'circle-stroke-color': '#4c8dff',
                'circle-stroke-width': 1.6,
                'circle-opacity': 0.92,
              }}
            />
          </Source>
        )}

        {/* Navigation route */}
        {routeGeometry && (
          <Source id="nav-route-src" type="geojson" data={routeGeometry}>
            <Layer {...NAV_ROUTE_GLOW} />
            <Layer {...NAV_ROUTE_LAYER} />
          </Source>
        )}

        {/* ═══ Transit Lines (metro, tram, ferry) ═══ */}
        <TransitLayers />

        {/* ═══ Fleet Overview (all vehicles as dots) ═══ */}
        {fleetActive && fleetGeoJson && (
          <Source id="fleet-overview-src" type="geojson" data={fleetGeoJson}>
            <Layer
              id="fleet-dots-glow"
              type="circle"
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 6],
                'circle-color': '#fde047',
                'circle-opacity': 0.1,
                'circle-blur': 1,
              }}
            />
            <Layer
              id="fleet-dots"
              type="circle"
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 3.5],
                'circle-color': '#fde047',
                'circle-opacity': 0.6,
              }}
            />
          </Source>
        )}

        {/* ═══ 3D Bus Models (fill-extrusion) ═══ */}
        {/* Wheels / undercarriage */}
        <Source id="bus-wheels-src" type="geojson" data={busGeo.wheels}>
          <Layer
            id="bus-wheels"
            type="fill-extrusion"
            paint={{
              'fill-extrusion-color': '#1a1a1a',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'base'],
              'fill-extrusion-opacity': 0.95,
            }}
          />
        </Source>

        {/* Bus body (main white shape) */}
        <Source id="bus-body-src" type="geojson" data={busGeo.body}>
          <Layer
            id="bus-body"
            type="fill-extrusion"
            paint={{
              'fill-extrusion-color': '#e8e8e8',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'base'],
              'fill-extrusion-opacity': 0.95,
            }}
          />
        </Source>

        {/* Orange IETT stripe */}
        <Source id="bus-stripe-src" type="geojson" data={busGeo.stripe}>
          <Layer
            id="bus-stripe"
            type="fill-extrusion"
            paint={{
              'fill-extrusion-color': '#f59e0b',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'base'],
              'fill-extrusion-opacity': 0.95,
            }}
          />
        </Source>

        {/* Windows (blue tint) */}
        <Source id="bus-windows-src" type="geojson" data={busGeo.windows}>
          <Layer
            id="bus-windows"
            type="fill-extrusion"
            paint={{
              'fill-extrusion-color': '#4a90d9',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'base'],
              'fill-extrusion-opacity': 0.8,
            }}
          />
        </Source>

        {/* Origin / Destination */}
        {origin && (
          <Marker longitude={origin.lng} latitude={origin.lat} anchor="center">
            <div className="route-marker origin">A</div>
          </Marker>
        )}
        {destination && (
          <Marker longitude={destination.lng} latitude={destination.lat} anchor="center">
            <div className="route-marker destination">B</div>
          </Marker>
        )}

        {/* Stop markers */}
        {approachingStops.map((stop) => (
          <Marker key={`stop-${stop.code}`} longitude={stop.lng} latitude={stop.lat} anchor="center">
            <div className="stop-marker-3d" title={stop.name}>
              <div className="stop-inner" />
            </div>
          </Marker>
        ))}

        {/* Directional bus blips — arrow shows heading; speed only when zoomed
            in or selected, so clustered buses don't overlap into a mess. */}
        {(buses || []).map((bus) => {
          const isSel = activeBus?.id === bus.id;
          const showLabel = viewState.zoom >= 13 || isSel;
          return (
            <Marker
              key={`bus-${bus.id}`}
              longitude={bus.lng}
              latitude={bus.lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                handleBusClick(bus);
              }}
            >
              <div className={`bus-blip${isSel ? ' selected' : ''}`} title={`${bus.line} → ${bus.destination}`}>
                <span className="bus-dot" />
                {showLabel && <span className="bus-blip-label">{bus.line}</span>}
              </div>
            </Marker>
          );
        })}

        <MapControls mapRef={mapRef} />
      </MapGL>
    </div>
  );
}
