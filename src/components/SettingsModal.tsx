import { useEffect } from 'react';
import { CloudUpload, Eraser, RotateCcw, X } from 'lucide-react';
import { storageMode } from '../services/storageService';

interface Props {
  onClose: () => void;
  onSync: () => void;
  onClearSamples: () => void;
  onReset: () => void;
  syncing: boolean;
  message: string;
}

export default function SettingsModal({ onClose, onSync, onClearSamples, onReset, syncing, message }: Props) {
  const online = storageMode === 'supabase';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="settings-modal-title" className="text-lg font-bold text-navy dark:text-sky-300">
            Configurações
          </h2>
          <button onClick={onClose} aria-label="Fechar">
            <X />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          Armazenamento: <b>{online ? 'Supabase (nuvem + Realtime)' : 'Local (localStorage)'}</b>
        </p>
        <div className="space-y-2">
          <button disabled={!online || syncing} onClick={onSync} className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            <CloudUpload size={16} /> {syncing ? 'Sincronizando…' : 'Sincronizar dados locais para o Supabase'}
          </button>
          {!online && (
            <p className="text-xs text-slate-500">
              Habilita quando VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) estiverem preenchidos no .env.
            </p>
          )}
          <button onClick={onClearSamples} className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold dark:border-slate-600">
            <Eraser size={16} /> Limpar exemplos
          </button>
          <button onClick={onReset} className="flex w-full items-center justify-center gap-2 rounded-md border border-red-400 px-3 py-2 text-sm font-semibold text-red-600">
            <RotateCcw size={16} /> Apagar todos os operadores e logs
          </button>
        </div>
        {message && <p className="mt-3 text-sm font-medium text-sky-700 dark:text-sky-300">{message}</p>}
      </div>
    </div>
  );
}
