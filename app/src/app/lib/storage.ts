// Настройки: storage.local в расширении, localStorage на тестовой странице.
import { api, inExtension } from '../../shared';

export const store = {
  async get<T>(key: string, def: T): Promise<T> {
    try {
      if (inExtension) return ((await api.storage.local.get(key))[key] ?? def) as T;
      const v = localStorage.getItem('td.' + key);
      return v == null ? def : JSON.parse(v);
    } catch { return def; }
  },
  async set(key: string, value: unknown) {
    try {
      if (inExtension) await api.storage.local.set({ [key]: value });
      else localStorage.setItem('td.' + key, JSON.stringify(value));
    } catch { /* настройки не сохранятся — не страшно */ }
  },
};
