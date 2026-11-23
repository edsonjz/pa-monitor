import { memo, useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { fmtClock } from '../lib/time';

interface Props {
  getNow: () => Date;
}

export default memo(function HeaderClock({ getNow }: Props) {
  const [text, setText] = useState(() => fmtClock(getNow()));

  useEffect(() => {
    setText(fmtClock(getNow()));
    const id = setInterval(() => {
      setText(fmtClock(getNow()));
    }, 1000);
    return () => clearInterval(id);
  }, [getNow]);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-1">
      <Clock size={18} />
      <span className="font-mono text-2xl font-bold tabular-nums">{text}</span>
    </div>
  );
});
