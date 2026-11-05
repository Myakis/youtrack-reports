// Общие константы и обёртка API браузера (Firefox: browser.*, Chromium: chrome.* — оба с промисами в MV3).
export const YOUTRACK = 'https://youtrack.office.lan';
export const YOUTRACK_MATCH = 'https://youtrack.office.lan/*';
export const VERSION = '__VERSION__';

declare const browser: any;
declare const chrome: any;
export const api: any = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : undefined;
export const inExtension = !!(api && api.runtime && api.runtime.id);
/**
 * Для какого браузера пакет. Не по наличию `browser`: Яндекс Браузер и другие Chromium тоже его дают.
 * Адрес расширения надёжнее: Firefox — moz-extension://, Chromium — chrome-extension://.
 */
export function detectPlatform(extUrl: string, userAgent = ''): 'firefox' | 'chromium' {
  if (extUrl) return extUrl.startsWith('moz-extension:') ? 'firefox' : 'chromium';
  return /firefox\//i.test(userAgent) ? 'firefox' : 'chromium';
}
export const PLATFORM = detectPlatform(
  inExtension ? String(api.runtime.getURL('')) : '',
  typeof navigator !== 'undefined' ? navigator.userAgent : '',
);
