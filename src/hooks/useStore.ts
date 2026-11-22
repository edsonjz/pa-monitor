import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../types';
import { loadSnapshot, persist, type RealtimeStatus, subscribeRealtime } from '../services/storageService';
import { defaultWorkstations } from '../lib/layout';

export function useStore(enabled = true, simulationMode = false) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle');
  const ref = useRef<Snapshot | null>(null);
  const simRef = useRef(simulationMode);
  simRef.current = simulationMode;
  const prevSimRef = useRef(simulationMode);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const inFlightRef = useRef(0);
  const pendingReloadRef = useRef(false);

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
      setRealtimeStatus('idle');
      return;
    }
    void load();
    return subscribeRealtime(() => {
      if (simRef.current) return;
      if (inFlightRef.current > 0) {
        pendingReloadRef.current = true;
        return;
      }
      void load();
    }, setRealtimeStatus);
  }, [enabled, load]);

  useEffect(() => {
    if (prevSimRef.current && !simulationMode && enabled) {
      void load();
    }
    prevSimRef.current = simulationMode;
  }, [simulationMode, enabled, load]);

  const update = useCallback(
    (fn: (s: Snapshot) => Snapshot) => {
      const prev = ref.current;
      if (!prev) return;
      const next = fn(prev);
      if (next === prev) return;
      ref.current = next;
      setSnap(next);
      if (simRef.current) return;

      inFlightRef.current += 1;
      queueRef.current = queueRef.current.then(async () => {
        try {
          await persist(prev, next);
          setError(null);
        } catch (e) {
          setError(`Falha ao salvar: ${(e as Error).message}`);
          await load();
        } finally {
          inFlightRef.current = Math.max(0, inFlightRef.current - 1);
          if (inFlightRef.current === 0 && pendingReloadRef.current && !simRef.current) {
            pendingReloadRef.current = false;
            void load();
          }
        }
      });
    },
    [load],
  );

  return { snap, ref, update, error, reload: load, realtimeStatus };
}
