import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { changesBetween, entriesMarkdown, parseChangelog, releaseNotesOnly } from '../src/core/changelog';

const TEXT = `# История изменений

## Не выпущено
- черновик

## 0.10.0 — 10.11.2026
- Новое A
  с переносом строки

## 0.9.1
- Исправление

## 0.9.0 — 06.11.2026
- Новое B

## 0.8.0 — 05.11.2026
- Старое
`;

describe('CHANGELOG', () => {
  it('разделы с версией; «Не выпущено» пропускается', () => {
    const e = parseChangelog(TEXT);
    expect(e.map((x) => [x.version, x.date])).toEqual([['0.10.0', '10.11.2026'], ['0.9.1', ''], ['0.9.0', '06.11.2026'], ['0.8.0', '05.11.2026']]);
    expect(e[0].body).toBe('- Новое A\n  с переносом строки');
  });
  it('что вышло между версиями — после from до to включительно, новые сверху', () => {
    const e = parseChangelog(TEXT);
    expect(changesBetween(e, '0.8.0', '0.10.0').map((x) => x.version)).toEqual(['0.10.0', '0.9.1', '0.9.0']);
    expect(changesBetween(e, '0.9.1', '0.9.1')).toEqual([]);
    expect(entriesMarkdown(changesBetween(e, '0.9.0', '0.9.1'))).toBe('### 0.9.1\n\n- Исправление');
  });
  it('описание релиза без хвоста «Установка»', () => {
    expect(releaseNotesOnly('- A\n- B\n\n---\n\n**Установка**\n- …')).toBe('- A\n- B');
    expect(releaseNotesOnly('- A')).toBe('- A');
  });
  it('настоящий CHANGELOG.md разбирается и в нём есть 0.9.0', () => {
    const e = parseChangelog(readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf-8'));
    expect(e.find((x) => x.version === '0.9.0')?.body).toContain('YouTrack Reports');
    expect(e.length).toBeGreaterThan(10);
  });
});
