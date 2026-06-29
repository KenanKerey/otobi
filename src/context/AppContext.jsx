import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useBuses } from '../hooks/useBuses';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [filterText, setFilterText] = useState('');
  const [selectedBus, setSelectedBus] = useState(null);
  const [activeBus, setActiveBus] = useState(null); // bus shown in the side detail view
  const [panelOpen, setPanelOpen] = useState(false);
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

  const filteredBuses = buses.filter(bus =>
    bus.line.toLowerCase().includes(filterText.toLowerCase())
  );

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
