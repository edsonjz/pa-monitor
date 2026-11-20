const pad = (n: number) => String(n).padStart(2, '0');

export const toMin = (s: string | undefined | null): number | null => {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(s ?? '');
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
};

export const fmtMin = (min: number): string => {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

export const fmtClock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export const todayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const minOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Converte célula do Excel (número fracionário, texto "8:00", "08h00"...) para HH:MM. */
export function parseTimeCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if (typeof v === 'number') {
    const frac = v - Math.floor(v);
    return fmtMin(Math.round(frac * 1440));
  }
  const m = /(\d{1,2})\s*[:hH]\s*(\d{2})/.exec(String(v));
  if (!m) return '';
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) return '';
  return `${pad(h)}:${pad(mi)}`;
}
