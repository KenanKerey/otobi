import { useState, useRef, useCallback } from 'react';
import { Search, X, Clock, ArrowRight, MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { searchStops, planTrip, fetchShape } from '../services/gtfs';
import { colorForLine } from './Rail3D';

const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const pad = (n) => String(n).padStart(2, '0');
const secToHHMM = (s) => `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}`;
const hhmmToSec = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 : null;
};

export default function Planner() {
  const { setRouteGeometry, clearRoute } = useApp();
  const now = new Date();

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromRes, setFromRes] = useState([]);
  const [toRes, setToRes] = useState([]);
  const [activeField, setActiveField] = useState(null);
  const [timeStr, setTimeStr] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [weekday, setWeekday] = useState(now.getDay());
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  const doSearch = useCallback((text, setter) => {
    clearTimeout(debounce.current);
    if (text.length < 2) { setter([]); return; }
    debounce.current = setTimeout(async () => {
      try { setter(await searchStops(text)); } catch { setter([]); }
    }, 300);
  }, []);

  const onPlan = async () => {
    if (!fromText || !toText) return;
    setLoading(true);
    setResults(null);
    try {
      const after = hhmmToSec(timeStr) ?? 0;
      const rows = await planTrip(fromText, toText, weekday, after, after + 3 * 3600);
      // keep the soonest departure per line
      const seen = new Set();
      const uniq = [];
      for (const r of rows) {
        const k = `${r.line}-${r.dep_sec}`;
        if (seen.has(k)) continue;
        seen.add(k); uniq.push(r);
      }
      setResults(uniq);
    } catch (e) {
      console.error('Planlama hatası:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const showOnMap = async (r) => {
    if (!r.shape_id) return;
    try {
      const coords = await fetchShape(r.shape_id);
      if (coords.length > 1) {
        setRouteGeometry({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
      }
    } catch { /* ignore */ }
  };

  const pickFrom = (s) => { setFromText(s.name); setFromRes([]); setActiveField(null); };
  const pickTo = (s) => { setToText(s.name); setToRes([]); setActiveField(null); };

  return (
    <div className="px-3 py-2.5 flex flex-col gap-2">
      {/* From */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
          <div className="w-3 h-3 rounded-full bg-emerald-400/80 border border-emerald-400/30" />
        </div>
        <input
          type="text"
          className="block w-full pl-8 pr-8 py-2 rounded bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/20 focus:outline-none focus:border-emerald-400/30 focus:bg-white/[0.06] text-[12px] transition-all"
          placeholder="Kalkış durağı..."
          value={fromText}
          onChange={(e) => { setFromText(e.target.value); setActiveField('from'); doSearch(e.target.value, setFromRes); }}
          onFocus={() => setActiveField('from')}
        />
        {fromText && (
          <button onClick={() => { setFromText(''); setFromRes([]); }} className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-white/20 hover:text-white/50 cursor-pointer">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {activeField === 'from' && fromRes.length > 0 && (
        <div className="rounded border border-white/[0.06] bg-black/60 max-h-36 overflow-y-auto -mt-1">
          {fromRes.map((s, i) => (
            <button key={i} onClick={() => pickFrom(s)} className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[11px] text-white/55 hover:bg-white/[0.04] cursor-pointer border-b border-white/[0.04] last:border-0">
              <MapPin className="h-3 w-3 text-emerald-400/60 shrink-0" /><span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* To */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
          <div className="w-3 h-3 rounded-full bg-red-400/80 border border-red-400/30" />
        </div>
        <input
          type="text"
          className="block w-full pl-8 pr-8 py-2 rounded bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/20 focus:outline-none focus:border-red-400/30 focus:bg-white/[0.06] text-[12px] transition-all"
          placeholder="Varış durağı..."
          value={toText}
          onChange={(e) => { setToText(e.target.value); setActiveField('to'); doSearch(e.target.value, setToRes); }}
          onFocus={() => setActiveField('to')}
        />
        {toText && (
          <button onClick={() => { setToText(''); setToRes([]); }} className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-white/20 hover:text-white/50 cursor-pointer">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {activeField === 'to' && toRes.length > 0 && (
        <div className="rounded border border-white/[0.06] bg-black/60 max-h-36 overflow-y-auto -mt-1">
          {toRes.map((s, i) => (
            <button key={i} onClick={() => pickTo(s)} className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[11px] text-white/55 hover:bg-white/[0.04] cursor-pointer border-b border-white/[0.04] last:border-0">
              <MapPin className="h-3 w-3 text-red-400/60 shrink-0" /><span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Day + time + go */}
      <div className="flex items-center gap-1.5">
        <select
          value={weekday}
          onChange={(e) => setWeekday(+e.target.value)}
          className="bg-white/[0.04] border border-white/[0.06] rounded text-white/70 text-[11px] py-2 px-1.5 focus:outline-none cursor-pointer"
        >
          {DAYS.map((d, i) => <option key={i} value={i} className="bg-[#11151c]">{d}</option>)}
        </select>
        <div className="relative flex-1">
          <Clock className="h-3 w-3 text-white/30 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="time"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            className="block w-full pl-7 pr-1 py-2 rounded bg-white/[0.04] border border-white/[0.06] text-white text-[12px] focus:outline-none focus:border-emerald-400/30"
          />
        </div>
        <button
          onClick={onPlan}
          disabled={!fromText || !toText || loading}
          className="px-3 py-2 rounded bg-emerald-500/80 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold cursor-pointer transition-colors flex items-center gap-1"
        >
          <Search className="h-3 w-3" /> Bul
        </button>
      </div>

      {/* Results */}
      {loading && (
        <div className="text-center py-2 text-[11px] text-white/35">Seferler aranıyor…</div>
      )}
      {results && !loading && results.length === 0 && (
        <div className="text-center py-2 text-[11px] text-white/35">Bu aralıkta direkt sefer bulunamadı.</div>
      )}
      {results && results.length > 0 && (
        <div className="max-h-64 overflow-y-auto flex flex-col gap-1.5 mt-0.5">
          <div className="text-[9px] uppercase tracking-wider text-white/30 px-0.5">
            {DAYS[weekday]} · {results.length} sefer
          </div>
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => showOnMap(r)}
              className="text-left rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors cursor-pointer p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded text-white shrink-0" style={{ background: colorForLine(r.line, r.route_type) }}>
                  {r.line}
                </span>
                <div className="flex items-center gap-1.5 text-[13px] text-white/90 font-medium">
                  <span>{secToHHMM(r.dep_sec)}</span>
                  <ArrowRight className="h-3 w-3 text-white/40" />
                  <span>{secToHHMM(r.arr_sec)}</span>
                </div>
                <span className="ml-auto text-[12px] font-bold" style={{ color: 'var(--accent)' }}>{r.duration_min} dk</span>
              </div>
              <div className="text-[10px] text-white/40 mt-1 truncate">{r.from_stop} → {r.to_stop}</div>
            </button>
          ))}
          <button onClick={() => { setResults(null); clearRoute(); }} className="text-[10px] text-white/30 hover:text-white/60 py-1 cursor-pointer">temizle</button>
        </div>
      )}
    </div>
  );
}
