import { AlertTriangle, Check } from 'lucide-react';
import type { WsView } from '../lib/engine';
import { BREAK_LABEL, EVENT_LABEL, breakReturn } from '../lib/engine';

interface Props {
  view: WsView;
  dim: boolean;
  highlight: boolean;
  spanClass?: string;
  onOpen: () => void;
  onAck: (alertId: string) => void;
  onQuickLog: (shiftId: string) => void;
  onDropOn: (fromId: string, toId: string) => void;
}

export default function PACard({
  view,
  dim,
  highlight,
  spanClass = '',
  onOpen,
  onAck,
  onQuickLog,
  onDropOn,
}: Props) {
  const { ws, shift, state, alert } = view;
  const isSup = ws.type === 'supervisor';

  let tone = 'pa-free';
  if (state === 'maint') tone = 'pa-maint';
  else if (alert) tone = 'pa-alert';
  else if (state === 'break') tone = 'pa-break';
  else if (state === 'logged') tone = isSup ? 'pa-sup ring-2 ring-emerald-500' : 'pa-logged';
  else if (isSup) tone = 'pa-sup';

  let status = 'Livre';
  if (state === 'maint') status = 'Manutenção';
  else if (shift) {
    if (state === 'logged') status = 'Logado';
    else if (state === 'break' && shift.breakKind)
      status = `${BREAK_LABEL[shift.breakKind]} · volta ${breakReturn(shift, shift.breakKind)}`;
    else if (state === 'done') status = 'Pós-logout';
    else status = shift.loginTime ? `Aguarda login ${shift.loginTime}` : 'Sem escala';
  }
  const hasOp = !!shift && !!shift.operatorName;
  const range =
    shift && (shift.loginTime || shift.logoutTime)
      ? `${shift.loginTime || '--:--'} – ${shift.logoutTime || '--:--'}`
      : 'Entrada – Saída';
  const headBg = alert
    ? 'bg-red-900 text-white'
    : 'bg-[#D9E2F3] text-navy dark:bg-slate-700 dark:text-slate-100';

  return (
    <div
      id={`pa-${ws.id}`}
      draggable={hasOp && !alert}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', ws.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData('text/plain');
        if (from && from !== ws.id) onDropOn(from, ws.id);
      }}
      onClick={onOpen}
      title={shift?.team ? `Equipe: ${shift.team}` : undefined}
      className={`pa-card cursor-pointer ${tone} ${spanClass} ${dim ? 'opacity-25' : ''} ${
        highlight ? 'z-10 ring-4 ring-sky-500' : ''
      }`}
    >
      <div className={`flex items-center justify-between px-1.5 py-[3px] text-[11px] font-bold ${headBg}`}>
        <span>
          {ws.code}
          {isSup ? ' — SUP' : ''}
        </span>
        {view.count > 1 && <span className="rounded bg-black/20 px-1 text-[9px]">{view.count} turnos</span>}
      </div>

      {alert ? (
        <div className="flex flex-1 flex-col justify-between px-1.5 py-1">
          <div className="flex items-start gap-1 font-extrabold text-[11px] leading-tight">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            <span className="truncate">{EVENT_LABEL[alert.eventType]}</span>
          </div>
          <div className="truncate text-[10px] font-semibold">
            {alert.operatorName || '—'} · {alert.scheduledTime}
            {view.alertCount > 1 ? ` (+${view.alertCount - 1})` : ''}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAck(alert.id);
            }}
            className="flex items-center justify-center gap-1 rounded bg-white py-0.5 text-xs font-extrabold text-red-700 shadow hover:bg-red-50"
          >
            <Check size={12} strokeWidth={3} /> OK
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-0.5 px-1.5 text-center">
          <div className={`truncate text-[12px] font-semibold ${hasOp ? '' : 'italic opacity-70'}`}>
            {hasOp ? shift!.operatorName : state === 'maint' ? '🔧' : 'Livre'}
          </div>
          <div className="truncate text-[10px] font-medium">{status}</div>
          <div className={`truncate text-[10px] ${shift ? 'font-bold' : 'italic opacity-60'}`}>{range}</div>

          {hasOp && state !== 'logged' && state !== 'maint' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickLog(shift!.id);
              }}
              title="Dar OK: confirmar presença e marcar como Logado (Verde)"
              className="mx-auto mt-0.5 flex items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow hover:bg-emerald-700 active:scale-95 transition"
            >
              <Check size={11} strokeWidth={3} /> Dar OK
            </button>
          )}

          {hasOp && state === 'logged' && (
            <div className="mx-auto mt-0.5 flex items-center justify-center gap-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
              <Check size={11} strokeWidth={3} /> Logado
            </div>
          )}
        </div>
      )}
    </div>
  );
}
