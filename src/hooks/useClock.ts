import { useCallback, useEffect, useState } from 'react';

const minKeyOf = (ts: number) => Math.floor(ts / 60000);

/** Relógio baseado em minuto para a raiz, evitando re-render de todos os cards a cada segundo. */
export function useClock() {
  const getNow = useCallback(() => new Date(), []);
  const [minuteKey, setMinuteKey] = useState(() => minKeyOf(Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      const next = minKeyOf(Date.now());
      setMinuteKey((prev) => (prev === next ? prev : next));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return {
    now: getNow(),
    minuteKey,
    getNow,
  };
}
