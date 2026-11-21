// Аккаунты: регистрация и вход по почте и паролю (Supabase Auth), по желанию — Google.
// Без входа дневник работает как гостевой и хранится только в браузере.

import { SUPABASE_URL, SUPABASE_KEY, GOOGLE_ENABLED, POLICY_VERSION } from './config.js';

const USER_KEY = 'artech-user';
const listeners = new Set();
let clientPromise = null;

export function getClient() {
  if (!clientPromise) {
    clientPromise = import('./vendor/supabase.js').then(({ createClient }) => {
      const c = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'artech-auth' },
      });
      c.auth.onAuthStateChange((event, session) => {
        // Supabase вызывает обработчик синхронно внутри своих блокировок — работу откладываем
        setTimeout(() => setSessionUser(session?.user || null, event), 0);
      });
      return c;
    });
  }
  return clientPromise;
}

function mapUser(u) {
  if (!u) return null;
  const meta = u.user_metadata || {};
  const name = meta.name || meta.full_name || (u.email || '').split('@')[0];
  return {
    sub: u.id,
    email: u.email || '',
    name,
    givenName: String(name).split(' ')[0],
    picture: meta.avatar_url || meta.picture || '',
    provider: u.app_metadata?.provider || 'email',
  };
}

function setSessionUser(u, event) {
  const prev = currentUser();
  const next = mapUser(u);
  try {
    if (next) localStorage.setItem(USER_KEY, JSON.stringify(next));
    else localStorage.removeItem(USER_KEY);
  } catch (e) { /* ignore */ }
  if ((prev?.sub || null) !== (next?.sub || null) || event === 'USER_UPDATED') listeners.forEach((fn) => fn(next, event));
}

export function currentUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; } catch (e) { return null; }
}

export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const googleConfigured = () => GOOGLE_ENABLED;

export function databaseFor(user) {
  return user ? 'artech-diary-' + String(user.sub).replace(/[^a-zA-Z0-9_-]/g, '') : 'artech-diary';
}

// Понятные сообщения вместо технических
export function humanError(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(m)) return 'Неверная почта или пароль';
  if (/already registered|already been registered|User already exists/i.test(m)) return 'Эта почта уже зарегистрирована — войдите';
  if (/Email not confirmed/i.test(m)) return 'Почта не подтверждена — откройте письмо от Supabase и перейдите по ссылке';
  if (/rate limit|too many/i.test(m)) return 'Слишком много попыток. Подождите минуту и попробуйте снова';
  if (/Password should be|weak/i.test(m)) return 'Пароль слишком простой: минимум 6 символов';
  if (/valid email|invalid format|Unable to validate email/i.test(m)) return 'Проверьте адрес почты';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Нет связи с сервером — проверьте интернет';
  return m || 'Что-то пошло не так';
}

const redirectTo = () => location.origin + location.pathname;

export async function signUp({ email, password, name }) {
  const c = await getClient();
  const { data, error } = await c.auth.signUp({
    email, password,
    options: { data: { name, consent: POLICY_VERSION }, emailRedirectTo: redirectTo() },
  });
  if (error) throw error;
  // Если в проекте включено подтверждение почты, сессии ещё нет
  return { needsConfirm: !data.session, user: mapUser(data.user) };
}

export async function signIn({ email, password }) {
  const c = await getClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const c = await getClient();
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
  if (error) throw error;
}

export async function resetPassword(email) {
  const c = await getClient();
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw error;
}

export async function signOut() {
  try { const c = await getClient(); await c.auth.signOut(); } catch (e) { /* сеть недоступна — выходим локально */ }
  setSessionUser(null, 'SIGNED_OUT');
}

export async function deleteAccount() {
  const c = await getClient();
  const { error } = await c.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  await signOut();
}

// Восстановить сессию при запуске (и обработать возврат по ссылке из письма или от Google)
export async function initAuth() {
  try {
    const c = await getClient();
    const { data } = await c.auth.getSession();
    setSessionUser(data.session?.user || null, 'INITIAL');
  } catch (e) {
    console.warn('Auth недоступен, работаем офлайн', e);
  }
}

// Смена пароля и имени для вошедшего пользователя
export async function updatePassword(password) {
  const c = await getClient();
  const { error } = await c.auth.updateUser({ password });
  if (error) throw error;
}

export async function updateName(name) {
  const c = await getClient();
  const { data, error } = await c.auth.updateUser({ data: { name } });
  if (error) throw error;
  setSessionUser(data.user, 'USER_UPDATED'); // сразу обновить сохранённого пользователя, не дожидаясь события
}
