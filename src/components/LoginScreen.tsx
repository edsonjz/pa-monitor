import { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { getLockoutRemainingSeconds, login } from '../services/authService';

interface Props {
  onSuccess: () => void;
}

export default function LoginScreen({ onSuccess }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockout, setLockout] = useState(getLockoutRemainingSeconds());

  useEffect(() => {
    if (lockout <= 0) return;
    const interval = setInterval(() => {
      const rem = getLockoutRemainingSeconds();
      setLockout(rem);
      if (rem <= 0) setError('');
    }, 1000);
    return () => clearInterval(interval);
  }, [lockout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Por favor, informe o usuário e a senha.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await login(username, password, remember);
      if (res.success) {
        onSuccess();
      } else {
        setError(res.error || 'Credenciais inválidas.');
        const rem = getLockoutRemainingSeconds();
        if (rem > 0) setLockout(rem);
      }
    } catch {
      setError('Erro ao processar autenticação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#071326] via-[#0B1E3B] to-[#122A54] p-4 text-slate-100">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-sky-900/50 bg-slate-900/90 shadow-2xl backdrop-blur-md">
        {/* Header visual */}
        <div className="border-b border-sky-800/40 bg-sky-950/40 px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-emerald-400 shadow-lg shadow-sky-500/20">
            <ShieldCheck size={32} className="text-white" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
            Monitor de PAs — Central 156
          </h1>
          <p className="mt-1 text-xs text-sky-200/80">
            Acesso Administrativo Geral e Supervisão
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6 sm:p-8">
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/70 p-3 text-center text-xs font-semibold text-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-300">
              Usuário
            </label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                autoFocus
                disabled={lockout > 0 || loading}
                placeholder="Ex: adm156"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/90 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-300">
              Senha
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                type={showPass ? 'text' : 'password'}
                disabled={lockout > 0 || loading}
                placeholder="Digite a senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/90 py-2.5 pl-9 pr-10 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-3 text-slate-400 hover:text-white"
                tabIndex={-1}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <label className="flex cursor-pointer items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
              />
              Lembrar meu acesso
            </label>
          </div>

          <button
            type="submit"
            disabled={lockout > 0 || loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/30 transition hover:from-sky-500 hover:to-emerald-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : lockout > 0 ? (
              `Bloqueado (${lockout}s)`
            ) : (
              'Entrar no Sistema'
            )}
          </button>
        </form>

        <div className="border-t border-slate-800 bg-slate-950/60 px-6 py-3 text-center text-[11px] text-slate-400">
          Autenticação criptográfica de segurança · Central 156
        </div>
      </div>
    </div>
  );
}
