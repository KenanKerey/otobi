import { useState, useRef, useCallback, useEffect } from 'react';
import MapGL, { Marker, Source, Layer, Popup } from 'react-map-gl/maplibre';
import { LocateFixed, Plus, Minus, Compass } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getBusLineRoute } from '../services/routeData';
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
  paint: { 'line-color': '#38bdf8', 'line-width': 3.5, 'line-opacity': 0.7, 'line-dasharray': [2, 3] },
  layout: { 'line-cap': 'round', 'line-join': 'round' },
};
const BUS_ROUTE_GLOW = {
  id: 'bus-route-glow',
  type: 'line',
  paint: { 'line-color': '#38bdf8', 'line-width': 10, 'line-opacity': 0.12, 'line-blur': 6 },
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
    <div className="absolute bottom-20 right-3 z-[10] hud-surface rounded-md shadow-xl shadow-black/60 overflow-hidden flex flex-col divide-y divide-white/[0.06]">
      <button onClick={handleZoomIn} title="Yakınlaştır" className={btn}><Plus className="h-4 w-4" /></button>
      <button onClick={handleZoomOut} title="Uzaklaştır" className={btn}><Minus className="h-4 w-4" /></button>
      <button onClick={handleReset} title="İstanbul'a dön" className={btn}><Compass className="h-4 w-4" /></button>
      <button onClick={handleLocate} title="Konumuma git" className={btn}><LocateFixed className="h-4 w-4" /></button>
    </div>
  );
}


export default function Map({ buses }) {
  const mapRef = useRef(null);
  const { selectedBus, setSelectedBus, origin, destination, routeGeometry, filterText } = useApp();

  // Show all fleet vehicles when no line is selected
  const fleetActive = !filterText || filterText.length < 2;
  const fleetGeoJson = useFleetOverview(fleetActive);
  const [popupBus, setPopupBus] = useState(null);
  const [busRoute, setBusRoute] = useState(null);
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

  // Fly to selected bus
  useEffect(() => {
    if (selectedBus && mapRef.current) {
      mapRef.current.getMap().flyTo({
        center: [selectedBus.lng, selectedBus.lat],
        zoom: 16, pitch: 60, duration: 1500,
      });
      setPopupBus(selectedBus);
      setSelectedBus(null);
    }
  }, [selectedBus, setSelectedBus]);

  // Compute bus line route on click (using real IBB route data)
  useEffect(() => {
    if (!popupBus) {
      setBusRoute(null);
      busRouteLineRef.current = null;
      return;
    }

    const lineKey = `${popupBus.line}-${popupBus.destination}`;
    if (busRouteLineRef.current === lineKey) return;
    busRouteLineRef.current = lineKey;

    getBusLineRoute(popupBus.line, popupBus.destination).then((geo) => {
      if (geo) setBusRoute(geo);
      else setBusRoute(null);
    });
  }, [popupBus]);

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
    setPopupBus(bus);
    mapRef.current?.getMap().flyTo({
      center: [bus.lng, bus.lat], zoom: 16, pitch: 60, duration: 1000,
    });
  }, []);

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

        {/* Bus labels floating above 3D models */}
        {(buses || []).map((bus) => (
          <Marker
            key={`label-${bus.id}`}
            longitude={bus.lng}
            latitude={bus.lat}
            anchor="bottom"
            offset={[0, -10]}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              handleBusClick(bus);
            }}
          >
            <div className="bus-label-3d">
              <span className="bus-label-line">{bus.line}</span>
              {bus.speed != null && <span className="bus-label-speed">{bus.speed}</span>}
            </div>
          </Marker>
        ))}

        {/* Bus popup */}
        {popupBus && (
          <Popup
            longitude={popupBus.lng}
            latitude={popupBus.lat}
            anchor="bottom"
            offset={[0, -20]}
            closeOnClick={false}
            onClose={() => setPopupBus(null)}
          >
            <div className="flex flex-col gap-2 min-w-[200px]">
              <div className="flex justify-between items-center pb-2 border-b border-white/[0.08]">
                <span className="hud-mono text-[12px] font-bold text-yellow-300 bg-yellow-300/10 px-2 py-0.5 rounded">
                  {popupBus.line}
                </span>
                <span className="hud-mono text-[9px] text-white/25 tracking-wider">{popupBus.plate}</span>
              </div>

              <div className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="hud-mono text-[9px] text-white/30 tracking-wider">YÖN</span>
                  <span className="text-white/70 text-right max-w-[130px] truncate" title={popupBus.destination}>{popupBus.destination}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="hud-mono text-[9px] text-white/30 tracking-wider">SİNYAL</span>
                  <span className="hud-mono text-[10px] text-yellow-300/60">{popupBus.lastUpdate}</span>
                </div>

                {popupBus.approachingStop && (
                  <>
                    <div className="h-px bg-white/[0.06] my-0.5" />
                    <div className="flex justify-between items-center">
                      <span className="hud-mono text-[9px] text-white/30 tracking-wider">DURAK</span>
                      <span className="text-white/60 text-right max-w-[130px] truncate text-[10px]" title={popupBus.approachingStop.name}>{popupBus.approachingStop.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="hud-mono text-[9px] text-white/30 tracking-wider">MESAFE</span>
                      <span className="hud-mono text-[10px] text-white/50">{(popupBus.approachingStop.distanceKm * 1000).toFixed(0)} m</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="hud-mono text-[9px] text-white/30 tracking-wider">TAHMİNİ</span>
                      <span className="hud-mono text-[12px] font-bold text-emerald-400">{popupBus.approachingStop.etaMin} dk</span>
                    </div>
                  </>
                )}

                <div className="h-px bg-white/[0.06] my-0.5" />
                <div className="flex justify-between items-center">
                  <span className="hud-mono text-[9px] text-white/30 tracking-wider">HIZ</span>
                  <span className="hud-mono text-[11px] text-emerald-400/80 font-medium">
                    {popupBus.speed != null ? `${popupBus.speed} km/sa` : 'Veri bekleniyor...'}
                  </span>
                </div>
              </div>
            </div>
          </Popup>
        )}

        <MapControls mapRef={mapRef} />
      </MapGL>
    </div>
  );
}
