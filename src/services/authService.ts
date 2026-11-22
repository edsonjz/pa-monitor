import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, setAuthPersistence, supabase } from './supabaseClient';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role?: string;
  isLocalMode?: boolean;
}

const LOCAL_MODE_KEY = 'pa_local_mode';
const LEGACY_SESSION_KEY = 'pa_admin_session';
const LEGACY_ATTEMPTS_KEY = 'pa_auth_attempts';

const LOCAL_MODE_USER: AuthUser = {
  id: 'local',
  email: 'Modo Local',
  displayName: 'Modo Local (Testes)',
  isLocalMode: true,
};

function clearLegacyAuthKeys(): void {
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    sessionStorage.removeItem(LEGACY_ATTEMPTS_KEY);
    localStorage.removeItem(LEGACY_ATTEMPTS_KEY);
  } catch {
    // ignorar erros de storage
  }
}

function userFromSupabase(u: User): AuthUser {
  const email = u.email ?? '';
  const displayName = String(
    u.user_metadata?.full_name || u.user_metadata?.name || email.split('@')[0] || 'Supervisor',
  );
  const role = typeof u.app_metadata?.role === 'string' ? u.app_metadata.role : undefined;
  return {
    id: u.id,
    email,
    displayName,
    role,
  };
}

function mapAuthError(message: string, status?: number): string {
  const msg = message.toLowerCase();
  if (msg.includes('invalid login credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (msg.includes('email not confirmed')) {
    return 'E-mail pendente de confirmação. Contate o administrador.';
  }
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Muitas tentativas de login. Aguarde alguns instantes e tente novamente.';
  }
  return 'Não foi possível autenticar. Verifique sua conexão e tente novamente.';
}

export async function getInitialAuthUser(): Promise<AuthUser | null> {
  clearLegacyAuthKeys();

  if (!isSupabaseConfigured || !supabase) {
    try {
      return sessionStorage.getItem(LOCAL_MODE_KEY) === '1' ? LOCAL_MODE_USER : null;
    } catch {
      return null;
    }
  }

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session) return null;

  void supabase.realtime.setAuth(sessionData.session.access_token);

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    await supabase.auth.signOut().catch(() => {});
    return null;
  }

  return userFromSupabase(userData.user);
}

export function subscribeAuthState(onChange: (user: AuthUser | null) => void): () => void {
  const client = supabase;
  if (!isSupabaseConfigured || !client) return () => {};

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (session?.user) {
      void client.realtime.setAuth(session.access_token);
      onChange(userFromSupabase(session.user));
    } else {
      onChange(null);
    }
  });

  return () => subscription.unsubscribe();
}

export async function loginWithPassword(
  email: string,
  password: string,
  rememberMe = true,
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase não configurado. Utilize o Modo Local.' };
  }

  setAuthPersistence(rememberMe);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return { success: false, error: mapAuthError(error.message, error.status) };
  }
  if (!data.session || !data.user) {
    return { success: false, error: 'Não foi possível iniciar a sessão. Tente novamente.' };
  }

  void supabase.realtime.setAuth(data.session.access_token);
  return { success: true, user: userFromSupabase(data.user) };
}

export function enterLocalMode(): AuthUser {
  try {
    sessionStorage.setItem(LOCAL_MODE_KEY, '1');
  } catch {
    // ignorar erros de storage
  }
  return LOCAL_MODE_USER;
}

export async function logout(): Promise<void> {
  clearLegacyAuthKeys();
  try {
    sessionStorage.removeItem(LOCAL_MODE_KEY);
  } catch {
    // ignorar erros de storage
  }
  if (supabase) {
    await supabase.auth.signOut();
  }
}
