import { memo, useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { fmtClock } from '../lib/time';

interface Props {
  getNow: () => Date;
  simOn: boolean;
  minuteKey: number;
}

export default memo(function HeaderClock({ getNow, simOn, minuteKey }: Props) {
  const [text, setText] = useState(() => fmtClock(getNow()));

  useEffect(() => {
    setText(fmtClock(getNow()));
    const id = setInterval(() => {
      setText(fmtClock(getNow()));
    }, 1000);
    return () => clearInterval(id);
  }, [getNow, simOn, minuteKey]);

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1 ${simOn ? 'bg-fuchsia-600' : 'bg-black/30'}`}>
      <Clock size={18} />
      <span className="font-mono text-2xl font-bold tabular-nums">{text}</span>
      {simOn && <span className="text-[10px] font-bold uppercase">simulação</span>}
    </div>
  );
});
