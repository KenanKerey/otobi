import { useState, useRef } from 'react';
import { ChevronUp, ChevronDown, Navigation, MapPin, Clock, Gauge } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function BottomPanel() {
  const { buses, filterText, panelOpen, setPanelOpen, setSelectedBus } = useApp();
  const [expanded, setExpanded] = useState(false);
  const dragStartY = useRef(null);

  if (!filterText || filterText.length < 2 || buses.length === 0) return null;

  const handleTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (dragStartY.current === null) return;
    const diff = dragStartY.current - e.changedTouches[0].clientY;
    if (diff > 50) {
      setExpanded(true);
      setPanelOpen(true);
    } else if (diff < -50) {
      if (expanded) setExpanded(false);
      else setPanelOpen(false);
    }
    dragStartY.current = null;
  };

  const togglePanel = () => {
    if (!panelOpen) setPanelOpen(true);
    else if (expanded) setExpanded(false);
    else setPanelOpen(false);
  };

  const panelHeight = !panelOpen ? 'h-12' : expanded ? 'h-[70vh]' : 'h-[38vh]';

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-[1000] ${panelHeight} transition-all duration-300 ease-out hud-fade`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="h-full hud-surface rounded-t-lg flex flex-col shadow-2xl shadow-black/80">
        {/* Handle */}
        <button
          onClick={togglePanel}
          className="w-full shrink-0 cursor-pointer px-3 pt-2 pb-1.5"
        >
          <div className="w-8 h-[3px] rounded-full bg-white/15 mx-auto mb-2" />
          <div className="flex items-center gap-2">
            <span className="hud-mono text-[11px] font-bold text-yellow-300 bg-yellow-300/10 px-1.5 py-0.5 rounded">
              {filterText.toUpperCase()}
            </span>
            <div className="flex items-center gap-1 flex-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 hud-led-pulse" />
              <span className="hud-mono text-[10px] text-white/35 tracking-wider">
                {buses.length} araç
              </span>
            </div>
            {panelOpen
              ? <ChevronDown className="h-3.5 w-3.5 text-white/25" />
              : <ChevronUp className="h-3.5 w-3.5 text-white/25" />
            }
          </div>
        </button>

        {/* Bus List */}
        {panelOpen && (
          <div className="flex-1 overflow-y-auto">
            <div className="h-px bg-white/[0.06]" />
            {buses.map((bus, idx) => (
              <button
                key={bus.id}
                onClick={() => setSelectedBus(bus)}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors cursor-pointer hover:bg-white/[0.03] ${
                  idx < buses.length - 1 ? 'border-b border-white/[0.04]' : ''
                }`}
              >
                {/* Left: line badge */}
                <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                  <span className="hud-mono text-[10px] font-bold text-yellow-300 bg-yellow-300/10 px-1.5 py-0.5 rounded">
                    {bus.line}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-emerald-400 hud-led-pulse" />
                </div>

                {/* Center: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <Navigation className="h-3 w-3 text-white/20 shrink-0" />
                    <span className="text-[12px] text-white/70 truncate">{bus.destination}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="hud-mono text-[9px] text-white/25 tracking-wider">{bus.plate}</span>
                    {bus.speed != null && (
                      <span className="hud-mono text-[9px] text-emerald-400/50 flex items-center gap-0.5">
                        <Gauge className="h-2.5 w-2.5" />
                        {bus.speed} km/sa
                      </span>
                    )}
                  </div>
                  {bus.approachingStop && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <MapPin className="h-3 w-3 text-sky-400/60 shrink-0" />
                      <span className="text-[10px] text-white/35 truncate">{bus.approachingStop.name}</span>
                    </div>
                  )}
                </div>

                {/* Right: ETA */}
                <div className="flex flex-col items-end shrink-0">
                  {bus.approachingStop ? (
                    <>
                      <span className="hud-mono text-[14px] font-bold text-emerald-400">
                        {bus.approachingStop.etaMin}
                      </span>
                      <span className="hud-mono text-[8px] text-emerald-400/50 tracking-wider">DAKİKA</span>
                      <span className="hud-mono text-[9px] text-white/20 mt-0.5">
                        {(bus.approachingStop.distanceKm * 1000).toFixed(0)}m
                      </span>
                    </>
                  ) : (
                    <span className="hud-mono text-[10px] text-white/20 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {bus.lastUpdate}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
