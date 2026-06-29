import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Star, X, MapPin, Route, Bus, Sun, Moon, TrainFront } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLineSearch } from '../hooks/useLineSearch';
import { geocode, getRoute } from '../services/routing';
import Planner from './Planner';

const POPULAR_LINES = [
  '500T', '34BZ', '34AS', '76D', '34G',
  '15F', '29C', '30D', '41Y', '122',
];

export default function SearchBar() {
  const {
    filterText, setFilterText, buses, loading,
    favorites, toggleFavorite, isFavorite, selectLine,
    origin, setOrigin, destination, setDestination,
    setRouteGeometry, setRouteInfo, clearRoute,
    theme, toggleTheme,
  } = useApp();

  const [mode, setMode] = useState('line'); // 'line' | 'route'
  const [inputValue, setInputValue] = useState(filterText);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const { results } = useLineSearch(inputValue);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Route search state
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [originResults, setOriginResults] = useState([]);
  const [destResults, setDestResults] = useState([]);
  const [activeField, setActiveField] = useState(null); // 'origin' | 'dest'
  const [routeLoading, setRouteLoading] = useState(false);
  const geocodeTimeout = useRef(null);

  useEffect(() => {
    setInputValue(filterText);
  }, [filterText]);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
        setActiveField(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Geocode debounce for route fields
  const doGeocode = useCallback((text, setter) => {
    clearTimeout(geocodeTimeout.current);
    if (text.length < 2) {
      setter([]);
      return;
    }
    geocodeTimeout.current = setTimeout(async () => {
      const results = await geocode(text);
      setter(results);
    }, 400);
  }, []);

  const handleOriginChange = (e) => {
    const val = e.target.value;
    setOriginText(val);
    setActiveField('origin');
    doGeocode(val, setOriginResults);
  };

  const handleDestChange = (e) => {
    const val = e.target.value;
    setDestText(val);
    setActiveField('dest');
    doGeocode(val, setDestResults);
  };

  const selectOrigin = (place) => {
    setOrigin(place);
    setOriginText(place.name);
    setOriginResults([]);
    setActiveField(null);
  };

  const selectDest = (place) => {
    setDestination(place);
    setDestText(place.name);
    setDestResults([]);
    setActiveField(null);
  };

  const handleFindRoute = async () => {
    if (!origin || !destination) return;
    setRouteLoading(true);
    try {
      const result = await getRoute(origin, destination);
      setRouteGeometry(result.geometry);
      setRouteInfo({ distance: result.distance, duration: result.duration });
    } catch (err) {
      console.error('Rota hatası:', err);
    } finally {
      setRouteLoading(false);
    }
  };

  // Auto-find route when both are selected
  useEffect(() => {
    if (origin && destination) {
      handleFindRoute();
    }
  }, [origin, destination]);

  const handleClearRoute = () => {
    setOriginText('');
    setDestText('');
    setOriginResults([]);
    setDestResults([]);
    clearRoute();
  };

  // Line search handlers
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    // setFilterText burada çağrılmıyor - sadece tıklama/Enter'da çağrılacak
    setShowDropdown(val.length > 0);
    setHighlightIndex(-1);
  };

  const handleSelectLine = (code) => {
    setInputValue(code);
    selectLine(code);
    setShowDropdown(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    setInputValue('');
    setFilterText('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelectLine(results[highlightIndex].code);
    } else if (e.key === 'Enter' && highlightIndex < 0 && inputValue.length >= 2) {
      e.preventDefault();
      handleSelectLine(inputValue.toUpperCase());
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    if (newMode === 'line') {
      handleClearRoute();
    } else {
      setShowDropdown(false);
    }
  };

  const hasSearch = filterText && filterText.length >= 2;
  const showFavorites = mode === 'line' && !inputValue && favorites.length > 0;
  const showPopular = mode === 'line' && !inputValue;

  return (
    <div
      ref={containerRef}
      className="absolute top-3 left-3 sm:top-4 sm:left-4 z-[1000] w-[calc(100vw-1.5rem)] sm:w-80 max-w-sm"
    >
      <div className="hud-surface rounded-2xl overflow-hidden hud-fade">
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div>
            <h1 className="hud-display text-[16px] sm:text-[18px] text-white tracking-tight">
              Otobi
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 hud-led-pulse" />
              <span className="hud-mono text-[9px] text-emerald-400/70 tracking-widest">
                CANLI TAKİP
              </span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
              className="p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-white/5 text-white/40 hover:text-white/70"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {mode === 'line' && hasSearch && (
              <button
                onClick={() => toggleFavorite(filterText.toUpperCase())}
                title={isFavorite(filterText.toUpperCase()) ? 'Favorilerden kaldır' : 'Favorilere ekle'}
                className="p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-white/5"
              >
                <Star
                  className={`h-4 w-4 ${
                    isFavorite(filterText.toUpperCase())
                      ? 'text-[#34d27b] fill-current'
                      : 'text-white/25 hover:text-white/50'
                  }`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="flex mx-3 mb-2 rounded bg-white/[0.03] border border-white/[0.06] overflow-hidden">
          <button
            onClick={() => switchMode('line')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 hud-mono text-[10px] tracking-wider transition-colors cursor-pointer ${
              mode === 'line'
                ? 'bg-white/[0.07] text-white font-semibold'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Bus className="h-3 w-3" />
            HAT ARA
          </button>
          <button
            onClick={() => switchMode('route')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 hud-mono text-[10px] tracking-wider transition-colors cursor-pointer ${
              mode === 'route'
                ? 'bg-white/[0.07] text-white font-semibold'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Route className="h-3 w-3" />
            ROTA
          </button>
          <button
            onClick={() => switchMode('metro')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 hud-mono text-[10px] tracking-wider transition-colors cursor-pointer ${
              mode === 'metro'
                ? 'bg-white/[0.07] text-white font-semibold'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <TrainFront className="h-3 w-3" />
            TARİFE
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06] mx-3" />

        {/* ── LINE SEARCH MODE ── */}
        {mode === 'line' && (
          <>
            {/* Search Input */}
            <div className="relative px-3 py-2.5">
              <div className="absolute inset-y-0 left-3 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-white/25" />
              </div>
              <input
                ref={inputRef}
                type="text"
                className="block w-full pl-8 pr-8 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder-white/25 focus:outline-none focus:border-[#34d27b]/50 focus:bg-white/[0.07] hud-mono text-[13px] transition-all"
                placeholder="Hat kodu ara..."
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setShowDropdown(inputValue.length > 0)}
                onKeyDown={handleKeyDown}
              />
              {inputValue && (
                <button
                  onClick={handleClear}
                  className="absolute inset-y-0 right-3 pr-2.5 flex items-center text-white/20 hover:text-white/50 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Autocomplete Dropdown */}
            {showDropdown && results.length > 0 && (
              <div className="border-t border-white/[0.06] max-h-56 overflow-y-auto">
                {results.map((line, idx) => (
                  <button
                    key={`${line.code}-${idx}`}
                    onClick={() => handleSelectLine(line.code)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors cursor-pointer border-b border-white/[0.03] last:border-0 ${
                      idx === highlightIndex ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="line-chip shrink-0">{line.code}</span>
                    <span className="text-white/55 text-[12px] truncate">{line.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Favorites */}
            {showFavorites && (
              <div className="px-3 pb-2">
                <span className="hud-mono text-[8px] text-white/20 tracking-[0.2em] uppercase">
                  Favoriler
                </span>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {favorites.map((fav) => (
                    <button
                      key={fav}
                      onClick={() => handleSelectLine(fav)}
                      className="line-chip flex items-center gap-1 hover:border-white/20 transition-colors cursor-pointer"
                    >
                      <Star className="h-2.5 w-2.5 fill-current text-[#34d27b]" />
                      {fav}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Popular Lines */}
            {showPopular && (
              <div className="px-3 pb-2.5">
                <span className="hud-mono text-[8px] text-white/20 tracking-[0.2em] uppercase">
                  Popüler hatlar
                </span>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {POPULAR_LINES.map((code) => (
                    <button
                      key={code}
                      onClick={() => handleSelectLine(code)}
                      className="hud-mono text-[10px] font-medium text-white/40 bg-white/[0.03] border border-white/[0.06] px-2 py-1 rounded hover:bg-white/[0.06] hover:text-white/60 transition-colors cursor-pointer"
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── ROUTE SEARCH MODE ── */}
        {mode === 'route' && (
          <div className="px-3 py-2.5 flex flex-col gap-2">
            {/* Origin */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <div className="w-3 h-3 rounded-full bg-emerald-400/80 border border-emerald-400/30" />
              </div>
              <input
                type="text"
                className="block w-full pl-8 pr-8 py-2 rounded bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/20 focus:outline-none focus:border-emerald-400/30 focus:bg-white/[0.06] hud-mono text-[11px] tracking-wide transition-all"
                placeholder="Nereden..."
                value={originText}
                onChange={handleOriginChange}
                onFocus={() => setActiveField('origin')}
              />
              {originText && (
                <button
                  onClick={() => { setOriginText(''); setOrigin(null); setOriginResults([]); }}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-white/20 hover:text-white/50 transition-colors cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Origin results dropdown */}
            {activeField === 'origin' && originResults.length > 0 && (
              <div className="rounded border border-white/[0.06] bg-black/60 max-h-40 overflow-y-auto -mt-1">
                {originResults.map((place, idx) => (
                  <button
                    key={idx}
                    onClick={() => selectOrigin(place)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 text-[11px] text-white/50 hover:bg-white/[0.04] transition-colors cursor-pointer border-b border-white/[0.04] last:border-0"
                  >
                    <MapPin className="h-3 w-3 text-emerald-400/60 shrink-0" />
                    <span className="truncate">{place.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Destination */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <div className="w-3 h-3 rounded-full bg-red-400/80 border border-red-400/30" />
              </div>
              <input
                type="text"
                className="block w-full pl-8 pr-8 py-2 rounded bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/20 focus:outline-none focus:border-red-400/30 focus:bg-white/[0.06] hud-mono text-[11px] tracking-wide transition-all"
                placeholder="Nereye..."
                value={destText}
                onChange={handleDestChange}
                onFocus={() => setActiveField('dest')}
              />
              {destText && (
                <button
                  onClick={() => { setDestText(''); setDestination(null); setDestResults([]); }}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-white/20 hover:text-white/50 transition-colors cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Dest results dropdown */}
            {activeField === 'dest' && destResults.length > 0 && (
              <div className="rounded border border-white/[0.06] bg-black/60 max-h-40 overflow-y-auto -mt-1">
                {destResults.map((place, idx) => (
                  <button
                    key={idx}
                    onClick={() => selectDest(place)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 text-[11px] text-white/50 hover:bg-white/[0.04] transition-colors cursor-pointer border-b border-white/[0.04] last:border-0"
                  >
                    <MapPin className="h-3 w-3 text-red-400/60 shrink-0" />
                    <span className="truncate">{place.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Route info or clear */}
            {origin && destination && (
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  {routeLoading ? (
                    <span className="hud-mono text-[9px] text-white/30 tracking-wider">
                      Rota hesaplanıyor...
                    </span>
                  ) : (
                    <span className="hud-mono text-[9px] text-emerald-400/70 tracking-wider">
                      Rota haritada gösterildi
                    </span>
                  )}
                </div>
                <button
                  onClick={handleClearRoute}
                  className="hud-mono text-[9px] text-white/30 hover:text-white/60 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.06] transition-colors cursor-pointer tracking-wider"
                >
                  TEMİZLE
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── METRO/RAIL TIMETABLE PLANNER ── */}
        {mode === 'metro' && <Planner />}

        {/* Status Bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.06] bg-white/[0.02]">
          {mode === 'metro' ? (
            <span className="hud-mono text-[9px] text-white/20 tracking-wider">
              Gerçek GTFS tarifesi · metro · tramvay · vapur
            </span>
          ) : mode === 'line' ? (
            !hasSearch ? (
              <span className="hud-mono text-[9px] text-white/20 tracking-wider">
                Hat arayarak başlayın
              </span>
            ) : loading ? (
              <span className="hud-mono text-[9px] text-white/30 tracking-wider">
                Yükleniyor...
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 hud-led-pulse" />
                <span className="hud-mono text-[9px] text-white/40 tracking-wider">
                  <span className="text-emerald-400 font-bold">{buses.length}</span> araç aktif
                </span>
              </div>
            )
          ) : (
            <span className="hud-mono text-[9px] text-white/20 tracking-wider">
              Konum seçerek rota oluşturun
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
