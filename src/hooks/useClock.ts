import { useState } from 'react';

interface Sim {
  on: boolean;
  baseSim: number;
  baseReal: number;
}

/** Relógio em tempo real, com modo de simulação (continua correndo a partir do horário escolhido). */
export function useClock() {
  const [, setTick] = useState(0);
  const [sim, setSim] = useState<Sim>({ on: false, baseSim: 0, baseReal: 0 });
  useTicker(() => setTick((t) => t + 1));
  const real = Date.now();
  const now = new Date(sim.on ? sim.baseSim + (real - sim.baseReal) : real);

  return {
    now,
    simOn: sim.on,
    toggleSim: () => setSim(sim.on ? { ...sim, on: false } : { on: true, baseSim: Date.now(), baseReal: Date.now() }),
    setSimTime: (h: number, m: number) => {
      const d = new Date(Date.now());
      d.setHours(h, m, 0, 0);
      setSim({ on: true, baseSim: d.getTime(), baseReal: Date.now() });
    },
    addMinutes: (min: number) => setSim({ on: true, baseSim: now.getTime() + min * 60000, baseReal: Date.now() }),
  };
}

import { useEffect } from 'react';
function useTicker(fn: () => void) {
  useEffect(() => {
    const i = setInterval(fn, 1000);
    return () => clearInterval(i);
  }, []);
}
