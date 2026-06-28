import { AppProvider, useApp } from './context/AppContext';
import Map from './components/Map';
import SearchBar from './components/SearchBar';
import BottomPanel from './components/BottomPanel';
import LoadingOverlay from './components/LoadingOverlay';
import ErrorBanner from './components/ErrorBanner';

function AppContent() {
  const { buses, loading, error, retry, filterText } = useApp();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <Map buses={buses} />
      <SearchBar />
      <BottomPanel />
      {loading && filterText.length >= 2 && buses.length === 0 && <LoadingOverlay />}
      {error && !loading && <ErrorBanner message={error} onRetry={retry} />}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
