// История изменений: разделы CHANGELOG.md («## 0.9.0 — 06.11.2026») — для окна «Что нового» после обновления.
import { compareVersions } from './update';

export interface ChangelogEntry { version: string; date: string; body: string }

/** Разделы с версией по порядку файла (сверху — новые); «## Не выпущено» и прочие без версии пропускаются. */
export function parseChangelog(text: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  let cur: ChangelogEntry | null = null;
  const lines: string[] = [];
  const flush = () => { if (cur) { cur.body = lines.join('\n').trim(); out.push(cur); } lines.length = 0; };
  for (const l of text.split(/\r?\n/)) {
    const m = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.+))?$/.exec(l);
    if (m) { flush(); cur = { version: m[1], date: (m[2] || '').trim(), body: '' }; continue; }
    if (/^##\s/.test(l)) { flush(); cur = null; continue; }
    if (cur) lines.push(l);
  }
  flush();
  return out;
}

/** Что вышло после версии from до to включительно — новые сверху. */
export function changesBetween(entries: ChangelogEntry[], from: string, to: string): ChangelogEntry[] {
  return entries
    .filter((e) => compareVersions(e.version, from) > 0 && compareVersions(e.version, to) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** Несколько версий одним Markdown: заголовок версии и её изменения. */
export const entriesMarkdown = (entries: ChangelogEntry[]) =>
  entries.map((e) => `### ${e.version}${e.date ? ` — ${e.date}` : ''}\n\n${e.body}`).join('\n\n');

/** Описание релиза с GitHub без хвоста «Установка» (после «---»). */
export const releaseNotesOnly = (notes: string) => notes.split(/\n-{3,}\s*\n/)[0].trim();
