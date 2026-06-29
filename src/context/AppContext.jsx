import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useBuses } from '../hooks/useBuses';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [filterText, setFilterText] = useState('');
  const [selectedBus, setSelectedBus] = useState(null);
  const [activeBus, setActiveBus] = useState(null); // bus shown in the side detail view
  const [dirFilter, setDirFilter] = useState(null); // show only buses heading to this destination
  const [panelOpen, setPanelOpen] = useState(false);
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem('otobi-theme') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('otobi-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  // Daytime preview: shift the rail clock so trains can be seen at night.
  // previewOffset = seconds added to the real Istanbul clock (null = live now).
  const [previewOffset, setPreviewOffset] = useState(null);
  const togglePreview = useCallback(() => {
    setPreviewOffset((cur) => {
      if (cur != null) return null;
      const ist = new Date(Date.now() + 3 * 3600 * 1000);
      const sec = ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds();
      return 9 * 3600 - sec; // jump to ~09:00
    });
  }, []);

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('ibb-favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Route search state
  const [origin, setOrigin] = useState(null);       // { name, lat, lng }
  const [destination, setDestination] = useState(null); // { name, lat, lng }
  const [routeGeometry, setRouteGeometry] = useState(null); // GeoJSON Feature
  const [routeInfo, setRouteInfo] = useState(null);  // { distance, duration }

  const { buses, loading, error, retry } = useBuses(filterText);

  const lineBuses = buses.filter(bus =>
    bus.line.toLowerCase().includes(filterText.toLowerCase())
  );

  // Available directions (unique destinations) for the line, and the visible set
  // once a direction filter is applied.
  const directions = [...new Set(lineBuses.map(b => b.destination).filter(Boolean))];
  const filteredBuses = dirFilter ? lineBuses.filter(b => b.destination === dirFilter) : lineBuses;

  // Persist favorites
  useEffect(() => {
    localStorage.setItem('ibb-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = useCallback((lineCode) => {
    setFavorites(prev =>
      prev.includes(lineCode)
        ? prev.filter(f => f !== lineCode)
        : [...prev, lineCode]
    );
  }, []);

  const isFavorite = useCallback((lineCode) => {
    return favorites.includes(lineCode);
  }, [favorites]);

  const selectLine = useCallback((lineCode) => {
    setFilterText(lineCode);
    setActiveBus(null);
    setDirFilter(null);
    setPanelOpen(true);
  }, []);

  const clearRoute = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setRouteGeometry(null);
    setRouteInfo(null);
  }, []);

  const value = {
    filterText,
    setFilterText,
    selectedBus,
    setSelectedBus,
    activeBus,
    setActiveBus,
    directions,
    dirFilter,
    setDirFilter,
    theme,
    toggleTheme,
    previewOffset,
    togglePreview,
    panelOpen,
    setPanelOpen,
    favorites,
    toggleFavorite,
    isFavorite,
    selectLine,
    buses: filteredBuses,
    loading,
    error,
    retry,
    // Route
    origin,
    setOrigin,
    destination,
    setDestination,
    routeGeometry,
    setRouteGeometry,
    routeInfo,
    setRouteInfo,
    clearRoute,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
