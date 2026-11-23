import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro não tratado na interface:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
          <div className="w-full max-w-md rounded-xl border border-red-300 bg-white p-6 text-center shadow-xl dark:border-red-800 dark:bg-slate-900">
            <h1 className="text-lg font-bold text-red-700 dark:text-red-400">Ocorreu um erro inesperado</h1>
            <p className="mt-2 break-words text-sm text-slate-600 dark:text-slate-300">
              {this.state.error.message || 'Erro de renderização na interface.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
