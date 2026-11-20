let ctx: AudioContext | null = null;

/** Beep suave de dois tons via Web Audio API (sem arquivos externos). */
export function beep() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      const s = t + i * 0.22;
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.12, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.38);
      o.connect(g);
      g.connect(ctx!.destination);
      o.start(s);
      o.stop(s + 0.42);
    });
  } catch {
    /* áudio indisponível */
  }
}
