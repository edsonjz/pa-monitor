import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
)?.trim();

/** true somente quando URL e chave pública estão preenchidas no .env */
export const isSupabaseConfigured = Boolean(url && key);

const PERSIST_PREF_KEY = 'pa_auth_persist';

function shouldPersistSession(): boolean {
  try {
    return localStorage.getItem(PERSIST_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAuthPersistence(rememberMe: boolean): void {
  try {
    localStorage.setItem(PERSIST_PREF_KEY, rememberMe ? '1' : '0');
  } catch {
    // ignorar erros de storage
  }
}

const authStorage = {
  getItem(storageKey: string): string | null {
    try {
      const fromSession = sessionStorage.getItem(storageKey);
      if (fromSession !== null) return fromSession;
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  },
  setItem(storageKey: string, value: string): void {
    try {
      if (shouldPersistSession()) {
        sessionStorage.removeItem(storageKey);
        localStorage.setItem(storageKey, value);
      } else {
        localStorage.removeItem(storageKey);
        sessionStorage.setItem(storageKey, value);
      }
    } catch {
      // ignorar erros de storage
    }
  },
  removeItem(storageKey: string): void {
    try {
      sessionStorage.removeItem(storageKey);
      localStorage.removeItem(storageKey);
    } catch {
      // ignorar erros de storage
    }
  },
};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
