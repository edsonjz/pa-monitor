import { useCallback, useEffect, useRef, useState } from 'react';

interface Sim {
  on: boolean;
  baseSim: number;
  baseReal: number;
}

const minKeyOf = (d: Date) => Math.floor(d.getTime() / 60000);

/** Relógio baseado em minuto para a raiz, evitando re-render de todos os cards a cada segundo. */
export function useClock() {
  const [sim, setSim] = useState<Sim>({ on: false, baseSim: 0, baseReal: 0 });
  const simRef = useRef(sim);
  simRef.current = sim;

  const getNow = useCallback(() => {
    const s = simRef.current;
    const real = Date.now();
    return new Date(s.on ? s.baseSim + (real - s.baseReal) : real);
  }, []);

  const [minuteKey, setMinuteKey] = useState(() => Math.floor(Date.now() / 60000));

  useEffect(() => {
    const id = setInterval(() => {
      const next = minKeyOf(getNow());
      setMinuteKey((prev) => (prev === next ? prev : next));
    }, 1000);
    return () => clearInterval(id);
  }, [getNow]);

  const toggleSim = useCallback(() => {
    const cur = simRef.current;
    const next: Sim = cur.on
      ? { ...cur, on: false }
      : { on: true, baseSim: Date.now(), baseReal: Date.now() };
    simRef.current = next;
    setSim(next);
    setMinuteKey(minKeyOf(getNow()));
  }, [getNow]);

  const setSimTime = useCallback((h: number, m: number) => {
    const d = new Date(Date.now());
    d.setHours(h, m, 0, 0);
    const next: Sim = { on: true, baseSim: d.getTime(), baseReal: Date.now() };
    simRef.current = next;
    setSim(next);
    setMinuteKey(minKeyOf(d));
  }, []);

  const addMinutes = useCallback(
    (min: number) => {
      const curNow = getNow();
      const nextTs = curNow.getTime() + min * 60000;
      const next: Sim = { on: true, baseSim: nextTs, baseReal: Date.now() };
      simRef.current = next;
      setSim(next);
      setMinuteKey(Math.floor(nextTs / 60000));
    },
    [getNow],
  );

  return {
    now: getNow(),
    minuteKey,
    getNow,
    simOn: sim.on,
    toggleSim,
    setSimTime,
    addMinutes,
  };
}
