// Проверка обновлений: последний релиз на GitHub, сравнение версий, пакет для своего браузера.
export const REPO = 'Myakis/youtrack-reports';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Как часто проверять сами (фон и открытие вкладки) — кнопка «Проверить» проверяет всегда. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export type Platform = 'chromium' | 'firefox';

export interface Release {
  version: string;
  notes: string;
  /** Страница релиза на GitHub. */
  page: string;
  /** Пакет для этого браузера; если его нет в релизе — страница релиза. */
  download: string;
  published: string;
}

export interface UpdateState {
  checkedAt: number;
  latest: Release | null;
  error?: string;
}

/** Числа версии: «v0.6.5» → [0, 6, 5]. */
function parts(v: string): number[] {
  return v.trim().replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
}

/** < 0 — a старее b, 0 — одинаковые, > 0 — a новее. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

/** Ответ GitHub API → релиз; пакет выбирается по окончанию имени файла. */
export function parseRelease(json: any, platform: Platform): Release {
  if (!json || typeof json.tag_name !== 'string') throw new Error('GitHub вернул неожиданный ответ');
  const suffix = platform === 'firefox' ? '-firefox.xpi' : '-chromium.zip';
  const asset = (Array.isArray(json.assets) ? json.assets : []).find((a: any) => typeof a?.name === 'string' && a.name.endsWith(suffix));
  const page = typeof json.html_url === 'string' ? json.html_url : RELEASES_URL;
  return {
    version: json.tag_name.replace(/^v/i, ''),
    notes: typeof json.body === 'string' ? json.body : '',
    page,
    download: asset?.browser_download_url || page,
    published: json.published_at || '',
  };
}

/** Последний релиз; null — релизов ещё нет. */
export async function fetchLatest(platform: Platform, fetchFn: typeof fetch = fetch): Promise<Release | null> {
  let r: Response;
  try {
    r = await fetchFn(API_URL, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  } catch {
    throw new Error('Нет связи с GitHub');
  }
  if (r.status === 404) return null;
  if (r.status === 403 || r.status === 429) throw new Error('GitHub временно ограничил запросы — попробуйте позже');
  if (!r.ok) throw new Error(`GitHub ответил ${r.status}`);
  return parseRelease(await r.json(), platform);
}

/** Проверить и вернуть состояние для хранения (ошибка не бросается, а сохраняется). */
export async function checkUpdate(platform: Platform, prev: UpdateState | null, fetchFn?: typeof fetch): Promise<UpdateState> {
  try {
    return { checkedAt: Date.now(), latest: await fetchLatest(platform, fetchFn) };
  } catch (e) {
    return { checkedAt: Date.now(), latest: prev?.latest ?? null, error: (e as Error).message };
  }
}

export function isStale(state: UpdateState | null, now = Date.now()): boolean {
  return !state || now - state.checkedAt > CHECK_EVERY_MS;
}
