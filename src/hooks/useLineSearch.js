import { useState, useEffect, useMemo, useRef } from 'react';
import { getAllLines } from '../services/ibbApi';

export function useLineSearch(query) {
  const [allLines, setAllLines] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const fetchStarted = useRef(false);

  // Lazy load: only fetch lines when user starts typing
  useEffect(() => {
    if (!query || query.length < 1 || fetchStarted.current) return;

    fetchStarted.current = true;
    let cancelled = false;

    getAllLines().then(lines => {
      if (!cancelled) {
        setAllLines(lines);
        setLoaded(true);
      }
    });

    return () => { cancelled = true; };
  }, [query]);

  const results = useMemo(() => {
    if (!query || query.length < 1 || !loaded) return [];

    const q = query.toLowerCase();
    return allLines
      .filter(line =>
        line.code.toLowerCase().includes(q) ||
        line.name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, allLines, loaded]);

  return { results, loaded };
}
