// Вход через Google (Google Identity Services, без собственного сервера).
// Мы получаем только имя, почту и аватар из ID-токена и храним их в этом браузере.
// Аккаунт нужен, чтобы у каждого человека на устройстве был свой дневник.

import { GOOGLE_CLIENT_ID } from './config.js';

const USER_KEY = 'artech-user';
const listeners = new Set();
let gisPromise = null;

export function currentUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; } catch (e) { return null; }
}

export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((fn) => fn(currentUser()));

export const googleConfigured = () => Boolean(GOOGLE_CLIENT_ID);

export function databaseFor(user) {
  return user ? 'artech-diary-' + String(user.sub).replace(/[^a-zA-Z0-9_-]/g, '') : 'artech-diary';
}

function decodeJwt(token) {
  const part = token.split('.')[1];
  const json = decodeURIComponent(
    atob(part.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
  return JSON.parse(json);
}

function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { gisPromise = null; reject(new Error('Не удалось загрузить вход Google — проверьте интернет')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function handleCredential(resp) {
  try {
    const p = decodeJwt(resp.credential);
    const user = { sub: p.sub, name: p.name || p.email, givenName: p.given_name || '', email: p.email, picture: p.picture || '', signedInAt: Date.now() };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    emit();
  } catch (e) {
    console.error('Не удалось прочитать ответ Google', e);
  }
}

// Рисует официальную кнопку Google в контейнере
export async function renderGoogleButton(el, { width = 280 } = {}) {
  if (!googleConfigured()) return false;
  const google = await loadGis();
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredential,
    ux_mode: 'popup',
    auto_select: false,
    itp_support: true,
  });
  google.accounts.id.renderButton(el, {
    theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ru', width,
  });
  return true;
}

export function signOut() {
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch (e) { /* ignore */ }
  localStorage.removeItem(USER_KEY);
  emit();
}
