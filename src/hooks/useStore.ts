import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../types';
import { loadSnapshot, persist, subscribeRealtime } from '../services/storageService';
import { defaultWorkstations } from '../lib/layout';

export function useStore(enabled = true) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Snapshot | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const s = await loadSnapshot();
      ref.current = s;
      setSnap(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      if (!ref.current) {
        ref.current = { workstations: defaultWorkstations(), shifts: [], alerts: [] };
        setSnap(ref.current);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      ref.current = null;
      setSnap(null);
      return;
    }
    void load();
    return subscribeRealtime(() => void load());
  }, [enabled, load]);

  const update = useCallback((fn: (s: Snapshot) => Snapshot) => {
    const prev = ref.current;
    if (!prev) return;
    const next = fn(prev);
    if (next === prev) return;
    ref.current = next;
    setSnap(next);
    persist(prev, next).catch((e) => setError((e as Error).message));
  }, []);

  return { snap, ref, update, error, reload: load };
}
