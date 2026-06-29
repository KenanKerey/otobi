import { ArrowLeft, MapPin, Clock, Gauge, Navigation } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function BottomPanel() {
  const { buses, filterText, activeBus, setActiveBus, routeDir, setRouteDir } = useApp();

  if (!filterText || filterText.length < 2 || buses.length === 0) return null;

  // The line's directions (unique destinations) for the route toggle.
  const directions = [...new Set(buses.map((b) => b.destination).filter(Boolean))];

  // Soonest-arriving buses first.
  const sorted = [...buses].sort(
    (a, b) => (a.approachingStop?.etaMin ?? 999) - (b.approachingStop?.etaMin ?? 999)
  );

  // Live data for the bus shown in the detail view.
  const live = activeBus ? (buses.find((b) => b.id === activeBus.id) || null) : null;

  return (
    <div className="absolute z-[900] left-2 right-2 bottom-2 h-[48vh] sm:left-auto sm:right-4 sm:top-4 sm:bottom-4 sm:h-auto sm:w-[360px] flex">
      <div className="hud-surface rounded-2xl flex flex-col w-full overflow-hidden hud-fade">
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-0.5 shrink-0">
          <div className="w-9 h-1 rounded-full bg-white/15" />
        </div>
        {live ? (
          /* ── Detail view ── */
          <>
            <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-white/[0.06]">
              <button
                onClick={() => setActiveBus(null)}
                className="p-1 -ml-1 rounded-lg hover:bg-white/[0.06] text-white/55 hover:text-white transition-colors cursor-pointer"
                title="Listeye dön"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="line-chip">{live.line}</span>
              <span className="hud-mono text-[10px] text-white/35 ml-auto">{live.plate}</span>
            </div>

            <div className="p-3.5 flex flex-col gap-3 overflow-y-auto">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-white/40 shrink-0" />
                <span className="text-[14px] font-semibold text-white/90">{live.destination}</span>
              </div>

              {directions.length > 1 && (
                <div className="flex gap-1 rounded-xl bg-white/[0.04] border border-white/[0.06] p-1">
                  {directions.map((d) => {
                    const isActive = (routeDir ?? live.destination) === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setRouteDir(d)}
                        title={d}
                        className={`flex-1 min-w-0 text-[10.5px] px-2 py-1.5 rounded-lg truncate transition-colors cursor-pointer ${
                          isActive ? 'bg-white/[0.08] text-white font-semibold' : 'text-white/45 hover:text-white/70'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}

              {live.approachingStop && (
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-white/35 mb-1">Yaklaşan durak</div>
                    <div className="text-[13px] text-white/85 truncate">{live.approachingStop.name}</div>
                    <div className="hud-mono text-[10px] text-white/40 mt-0.5">
                      {(live.approachingStop.distanceKm * 1000).toFixed(0)} m uzakta
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <div className="text-[26px] font-bold leading-none" style={{ color: 'var(--accent)' }}>
                      {live.approachingStop.etaMin}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-white/35 mt-0.5">dakika</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
                  <div className="flex items-center gap-1.5 text-white/40 text-[10px] uppercase tracking-wide mb-1">
                    <Gauge className="h-3 w-3" /> Hız
                  </div>
                  <div className="text-[15px] font-semibold text-white/85">
                    {live.speed != null ? live.speed : '—'}
                    <span className="text-[11px] text-white/40 font-normal"> km/sa</span>
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
                  <div className="flex items-center gap-1.5 text-white/40 text-[10px] uppercase tracking-wide mb-1">
                    <Clock className="h-3 w-3" /> Son sinyal
                  </div>
                  <div className="text-[15px] font-semibold text-white/85 hud-mono">{live.lastUpdate}</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── List view ── */
          <>
            <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-white/[0.06]">
              <span className="line-chip">{filterText.toUpperCase()}</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34d27b] hud-led-pulse" />
                <span className="text-[12px] text-white/55">
                  <span className="font-semibold text-white/80">{buses.length}</span> araç
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {sorted.map((bus) => (
                <button
                  key={bus.id}
                  onClick={() => setActiveBus(bus)}
                  className="w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors cursor-pointer hover:bg-white/[0.035] border-b border-white/[0.04]"
                >
                  <span className="w-2 h-2 rounded-full bg-[#34d27b] shrink-0 hud-led-pulse" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-white/90 truncate">{bus.destination}</div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-white/40">
                      <span className="hud-mono">{bus.plate}</span>
                      {bus.speed != null && (
                        <span className="flex items-center gap-1">
                          <Gauge className="h-3 w-3" />{bus.speed} km/sa
                        </span>
                      )}
                    </div>
                    {bus.approachingStop && (
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-white/45">
                        <MapPin className="h-3 w-3 text-[#4c8dff] shrink-0" />
                        <span className="truncate">{bus.approachingStop.name}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 pl-1">
                    {bus.approachingStop ? (
                      <>
                        <div className="text-[19px] font-bold leading-none" style={{ color: 'var(--accent)' }}>
                          {bus.approachingStop.etaMin}
                        </div>
                        <div className="text-[9px] uppercase tracking-wide text-white/35 mt-0.5">dakika</div>
                      </>
                    ) : (
                      <span className="text-[11px] text-white/30 flex items-center gap-1">
                        <Clock className="h-3 w-3" />{bus.lastUpdate}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
