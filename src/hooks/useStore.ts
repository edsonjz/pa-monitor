import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../types';
import { applyRealtimeChange, type RealtimeChange } from '../services/realtimeReducer';
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
  const pendingChangesRef = useRef<RealtimeChange[]>([]);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const s = await loadSnapshot();
      pendingChangesRef.current = [];
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
      pendingChangesRef.current = [];
      ref.current = null;
      setSnap(null);
      setRealtimeStatus('idle');
      return;
    }
    void load();
    return subscribeRealtime(
      (change) => {
        if (simRef.current) return;
        if (inFlightRef.current > 0) {
          pendingChangesRef.current.push(change);
          return;
        }
        const cur = ref.current;
        if (!cur) return;
        const next = applyRealtimeChange(cur, change);
        if (next === cur) return;
        ref.current = next;
        setSnap(next);
      },
      setRealtimeStatus,
      () => {
        if (!simRef.current) void load();
      },
    );
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
          if (inFlightRef.current === 0 && !simRef.current && pendingChangesRef.current.length > 0) {
            const queued = pendingChangesRef.current.splice(0);
            const cur = ref.current;
            if (cur) {
              let merged = cur;
              for (const change of queued) {
                merged = applyRealtimeChange(merged, change);
              }
              if (merged !== cur) {
                ref.current = merged;
                setSnap(merged);
              }
            }
          }
        }
      });
    },
    [load],
  );

  return { snap, ref, update, error, reload: load, realtimeStatus };
}
