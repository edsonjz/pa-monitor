// Serviço de autenticação do Admin Geral (adm156 / poa156) com hash SHA-256 e proteção contra força bruta

const USER_HASH = 'c618e4aef245d7d36de2563905c8fb7b82a8b52cd8254bddbffcec169647cca6'; // SHA-256 de adm156
const PASS_HASH = '3a2f38f5801d38e3632723cc11b2f993a65ceed0b8d2debc4433d5b14b3ca013'; // SHA-256 de poa156

const SESSION_KEY = 'pa_admin_session';
const ATTEMPTS_KEY = 'pa_auth_attempts';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000; // 60 segundos de bloqueio após 5 tentativas incorretas
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas de validade da sessão

export async function sha256(plainText: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(plainText.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
}

function getAttempts(): AttemptRecord {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return { count: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockedUntil: null };
  }
}

function setAttempts(record: AttemptRecord) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(record));
  } catch {
    // ignorar erros de storage
  }
}

export function getLockoutRemainingSeconds(): number {
  const record = getAttempts();
  if (!record.lockedUntil) return 0;
  const rem = Math.ceil((record.lockedUntil - Date.now()) / 1000);
  if (rem <= 0) {
    setAttempts({ count: 0, lockedUntil: null });
    return 0;
  }
  return rem;
}

export interface SessionData {
  user: string;
  token: string;
  createdAt: number;
  expiresAt: number;
}

export function getSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: SessionData = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      logout();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

export function logout(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignorar
  }
}

export async function login(
  user: string,
  pass: string,
  rememberMe = true,
): Promise<{ success: boolean; error?: string }> {
  const lockRem = getLockoutRemainingSeconds();
  if (lockRem > 0) {
    return {
      success: false,
      error: `Muitas tentativas incorretas. Sistema bloqueado temporariamente por ${lockRem}s.`,
    };
  }

  const uHash = await sha256(user);
  const pHash = await sha256(pass);

  if (uHash === USER_HASH && pHash === PASS_HASH) {
    // Resetar tentativas em caso de sucesso
    setAttempts({ count: 0, lockedUntil: null });

    // Gerar token de sessão criptográfico seguro
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const session: SessionData = {
      user: 'adm156',
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };

    const targetStorage = rememberMe ? localStorage : sessionStorage;
    targetStorage.setItem(SESSION_KEY, JSON.stringify(session));

    return { success: true };
  }

  // Falha de autenticação
  const attempts = getAttempts();
  const newCount = attempts.count + 1;
  let lockedUntil: number | null = null;
  let errorMsg = `Usuário ou senha inválidos (${MAX_ATTEMPTS - newCount} tentativa(s) restante(s)).`;

  if (newCount >= MAX_ATTEMPTS) {
    lockedUntil = Date.now() + LOCKOUT_MS;
    errorMsg = `Limite de tentativas excedido. Bloqueado por 60 segundos.`;
  }

  setAttempts({ count: newCount, lockedUntil });
  return { success: false, error: errorMsg };
}

