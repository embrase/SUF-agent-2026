// src/hooks/useStaticData.ts
import { useState, useEffect } from 'react';

const STATIC_BASE = import.meta.env.VITE_STATIC_BASE_URL || '/data';

// Simple in-memory cache to avoid refetching on navigation
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

export function useStaticData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `${STATIC_BASE}${path}`;

    // Check cache
    const cached = cache.get(url);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setData(cached.data as T);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          cache.set(url, { data: json, ts: Date.now() });
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [path]);

  return { data, loading, error };
}
