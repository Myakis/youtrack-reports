// Запросы к YouTrack из страницы: сессия браузера или постоянный токен; вне расширения — тестовые данные.
import { api, inExtension, YOUTRACK, YOUTRACK_MATCH } from '../../shared';
import type { Fetcher, RawResponse } from '../../core/youtrack';
import { mockFetch } from '../mock';

let token = '';
export const setToken = (t: string) => { token = t; };
export const getToken = () => token;

const extFetch: Fetcher = async (path) => {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  try {
    const r = await fetch(YOUTRACK + path, { headers, credentials: token ? 'omit' : 'include', redirect: 'manual', cache: 'no-store' });
    return { status: r.status, type: r.type, text: r.type === 'opaqueredirect' ? '' : await r.text() } as RawResponse;
  } catch (e) {
    return { status: 0, type: 'error', text: '', error: (e as Error).message };
  }
};
export const yt: Fetcher = inExtension ? extFetch : mockFetch;

export async function hasYtPerm(): Promise<boolean> {
  if (!inExtension) return true;
  try { return await api.permissions.contains({ origins: [YOUTRACK_MATCH] }); } catch { return true; }
}

/** Открыть адрес в новой вкладке. */
export const openUrl = (url: string, active = true) => (inExtension ? api.tabs.create({ url, active }) : window.open(url));
export const openYt = (path = '/') => openUrl(YOUTRACK + path);

export const num = (n: number) => n.toLocaleString('ru');

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function download(text: string, name: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
