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
  const hasOp = !!shift && !!shift.operatorName.trim();

  let bodyTone = 'pa-free';
  if (state === 'maint') bodyTone = 'pa-maint';
  else if (alert) bodyTone = 'pa-alert';
  else if (state === 'falta') bodyTone = 'pa-falta';
  else if (state === 'atestado') bodyTone = 'pa-atestado';
  else if (state === 'dsr') bodyTone = 'pa-dsr';
  else if (state === 'break') bodyTone = 'pa-break';
  else if (state === 'logged') bodyTone = isSup ? 'pa-sup' : 'pa-logged';
  else if (isSup) bodyTone = 'pa-sup';
  else if (hasOp && (state === 'pending' || state === 'done')) bodyTone = 'pa-pending';

  let badge: { text: string; cls: string } | null = null;
  if (state === 'falta') badge = { text: '🚫 FALTA', cls: 'bg-rose-600 text-white' };
  else if (state === 'atestado') badge = { text: '📋 ATESTADO', cls: 'bg-cyan-700 text-white' };
  else if (state === 'dsr') badge = { text: '🏖️ DSR', cls: 'bg-purple-700 text-white' };
  else if (state === 'break' && shift?.breakKind)
    badge = {
      text: `⏸ ${BREAK_LABEL[shift.breakKind]} · ${breakReturn(shift, shift.breakKind)}`,
      cls: 'bg-amber-600/20 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100',
    };
  else if (state === 'done' && hasOp)
    badge = { text: 'Pós-logout', cls: 'bg-slate-600/20 text-slate-700 dark:text-slate-200' };
  else if (state === 'pending' && hasOp)
    badge = {
      text: shift?.loginTime ? `Aguarda ${shift.loginTime}` : 'Pendente',
      cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-200',
    };

  const range =
    shift && (shift.loginTime || shift.logoutTime)
      ? `${shift.loginTime || '--:--'}–${shift.logoutTime || '--:--'}`
      : 'Entrada - Saída';

  const headBg = alert
    ? 'bg-red-900 text-white border-red-950'
    : isSup
      ? 'bg-[#FFE699] text-slate-900 border-amber-400/80 dark:bg-yellow-700/80 dark:text-yellow-50 dark:border-yellow-600'
      : 'bg-[#D9E2F3] text-slate-900 border-slate-400/70 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600';

  const isAbsent = state === 'falta' || state === 'atestado' || state === 'dsr';

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
      title={
        hasOp
          ? `${shift!.operatorName}${shift!.team ? ` · Equipe: ${shift!.team}` : ''} (clique para editar ou registrar Falta/Atestado/DSR)`
          : 'Clique para atribuir operador'
      }
      className={`pa-card cursor-pointer ${bodyTone} ${spanClass} ${dim ? 'opacity-25' : ''} ${
        highlight ? 'z-10 ring-4 ring-sky-500' : ''
      }`}
    >
      {/* FAIXA 1: CABEÇALHO FIXO (24px) */}
      <div className={`relative flex h-[24px] shrink-0 items-center justify-center border-b px-1.5 text-[11px] font-bold ${headBg}`}>
        <span className="truncate">
          {ws.code}
          {isSup ? ' — SUPERVISOR' : ''}
        </span>
        {view.count > 1 && (
          <span className="absolute right-1 rounded bg-black/15 px-1 text-[9px] font-extrabold">{view.count}t</span>
        )}
      </div>

      {alert ? (
        /* MODO ALERTA ATIVO */
        <div className="flex flex-1 flex-col justify-between px-1.5 py-1.5">
          <div className="flex items-center gap-1 text-[10.5px] font-extrabold leading-tight">
            <AlertTriangle size={12} className="shrink-0" />
            <span className="truncate">{EVENT_LABEL[alert.eventType]}</span>
          </div>
          <div className="truncate text-center text-[11px] font-bold">
            {alert.operatorName || '—'} · {alert.scheduledTime}
            {view.alertCount > 1 ? ` (+${view.alertCount - 1})` : ''}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAck(alert.id);
            }}
            className="flex items-center justify-center gap-1 rounded bg-white py-0.5 text-[11px] font-extrabold text-red-700 shadow hover:bg-red-50 active:scale-95"
          >
            <Check size={12} strokeWidth={3} /> OK
          </button>
        </div>
      ) : (
        <>
          {/* FAIXA 2: CORPO CENTRAL (54px) */}
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden px-1.5 text-center">
            <div
              className={`line-clamp-2 w-full break-words text-[12px] leading-tight ${
                hasOp
                  ? `font-bold ${isSup ? 'italic' : ''} ${isAbsent ? 'line-through opacity-75' : ''}`
                  : 'italic opacity-70'
              }`}
            >
              {hasOp ? shift!.operatorName : state === 'maint' ? '🔧 Manutenção' : 'Livre'}
            </div>
            {badge && (
              <span className={`max-w-full truncate rounded px-1.5 py-[1px] text-[9.5px] font-extrabold leading-tight ${badge.cls}`}>
                {badge.text}
              </span>
            )}
          </div>

          {/* FAIXA 3: RODAPÉ DE HORÁRIO (26px) */}
          <div className="flex h-[26px] shrink-0 items-center justify-center gap-1.5 border-t border-slate-300/80 bg-white px-1.5 text-[10.5px] dark:border-slate-700 dark:bg-slate-900">
            <span
              className={`truncate italic ${
                shift ? 'font-bold text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {range}
            </span>
            {hasOp && state === 'pending' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickLog(shift!.id);
                }}
                title="Dar OK: confirmar presença e marcar como Logado (Verde)"
                className="flex shrink-0 items-center gap-0.5 rounded bg-emerald-600 px-1.5 py-[2px] text-[9.5px] font-extrabold text-white shadow-sm hover:bg-emerald-700 active:scale-95"
              >
                <Check size={10} strokeWidth={3} /> OK
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
