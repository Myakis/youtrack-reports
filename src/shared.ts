// Общие константы и обёртка API браузера (Firefox: browser.*, Chromium: chrome.* — оба с промисами в MV3).
export const YOUTRACK = 'https://youtrack.office.lan';
export const YOUTRACK_MATCH = 'https://youtrack.office.lan/*';
export const VERSION = '__VERSION__';

declare const browser: any;
declare const chrome: any;
export const api: any = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : undefined;
export const inExtension = !!(api && api.runtime && api.runtime.id);
