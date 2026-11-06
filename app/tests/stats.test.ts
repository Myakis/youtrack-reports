import { describe, expect, it } from 'vitest';
import { computeStats, diff, fmtHours, previousRange, statsLines } from '../src/core/stats';
import { attachTime, fmtMinutes } from '../src/core/time';
import { toCSV, toMarkdown } from '../src/core/export';
import { normalizeIssue, searchIssues, type Fetcher } from '../src/core/youtrack';
import { mockFetch } from '../src/app/mock';

const BASE = 'https://yt';
const day = 86400000;
const mk = (key: string, o: { type?: string; prio?: string; project?: string; lead?: number; spent?: number | null } = {}) => {
  const i = normalizeIssue({
    idReadable: key, created: day, resolved: o.lead == null ? null : day + o.lead * day, project: { name: o.project || 'CashDash' },
    customFields: [
      ...(o.type ? [{ name: 'Тип', value: { name: o.type } }] : []),
      ...(o.prio ? [{ name: 'Priority', value: { name: o.prio } }] : []),
    ],
  }, BASE);
  i.spent = o.spent === undefined ? null : o.spent;
  return i;
};

describe('сводка', () => {
  it('считает типы, проекты, приоритеты, медиану решения и время', () => {
    const s = computeStats([
      mk('A-1', { type: 'Задача', prio: 'Обычный', lead: 1, spent: 60 }),
      mk('A-2', { type: 'Ошибка', prio: 'Критический', lead: 3, spent: 90 }),
      mk('A-3', { type: 'Задача', project: 'Mobile', lead: 10, spent: 0 }),
    ]);
    expect(s).toMatchObject({ count: 3, leadDays: 3, spent: 150 });
    expect(s.byType).toEqual([['Задача', 2], ['Ошибка', 1]]);
    expect(s.byProject).toEqual([['CashDash', 2], ['Mobile', 1]]);
    expect(s.byPriority).toEqual([['Критический', 1], ['Обычный', 1], ['без значения', 1]]);
  });
  it('время не загружали — spent null; нерешённые не влияют на медиану', () => {
    const s = computeStats([mk('A-1', { lead: 2 }), mk('A-2', { lead: 4 }), mk('A-3')]);
    expect(s.spent).toBeNull();
    expect(s.leadDays).toBe(3);
    expect(computeStats([]).leadDays).toBeNull();
  });
  it('форматы и разница', () => {
    expect(fmtMinutes(150)).toBe('2 ч 30 мин');
    expect(fmtMinutes(45)).toBe('45 мин');
    expect(fmtMinutes(0)).toBe('0 ч');
    expect(fmtHours(150)).toBe('2,5 ч');
    expect(diff(7, 3)).toBe('+4');
    expect(diff(3, 7)).toBe('−4');
    expect(diff(3, 3)).toBe('±0');
  });
});

describe('прошлый период', () => {
  it('месяц, квартал, год — календарные; свой период — столько же дней перед ним', () => {
    expect(previousRange('month', '2026-11-01', '2026-11-30')).toMatchObject({ from: '2026-10-01', to: '2026-10-31', label: 'прошлым месяцем' });
    expect(previousRange('prevMonth', '2026-01-01', '2026-01-31')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(previousRange('quarter', '2026-10-01', '2026-12-31')).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
    expect(previousRange('year', '2026-01-01', '2026-12-31')).toMatchObject({ from: '2025-01-01', to: '2025-12-31' });
    expect(previousRange('custom', '2026-11-10', '2026-11-19')).toMatchObject({ from: '2026-10-31', to: '2026-11-09', label: 'предыдущими 10 дн.' });
    expect(previousRange('last30', '2026-10-08', '2026-11-06')).toMatchObject({ from: '2026-09-08', to: '2026-10-07' });
  });
  it('без начала или конца — сравнивать не с чем', () => {
    expect(previousRange('all', '', '')).toBeNull();
    expect(previousRange('custom', '2026-01-01', '')).toBeNull();
  });
});

describe('затраченное время', () => {
  it('общий список /api/workItems: только записи сотрудника', async () => {
    const list = await searchIssues(mockFetch, BASE, 'assignee: {a.ivanova} state: {Готово}');
    await attachTime(mockFetch, list, { author: 'a.ivanova' });
    expect(Object.fromEntries(list.map((i) => [i.key, i.spent]))).toEqual({ 'CD-101': 300, 'CD-102': 135, 'MOB-103': 480 });
  });
  it('без сотрудника — время всех', async () => {
    const list = await searchIssues(mockFetch, BASE, 'issue id: CD-101, CD-104');
    await attachTime(mockFetch, list);
    expect(Object.fromEntries(list.map((i) => [i.key, i.spent]))).toEqual({ 'CD-101': 360, 'CD-104': 330 });
  });
  it('общего списка нет (404) или он не понял query — по одной задаче', async () => {
    const items: Record<string, any[]> = {
      'P-1': [{ date: 1, duration: { minutes: 30 }, author: { login: 'me' } }, { date: 2, duration: { minutes: 15 }, author: { login: 'other' } }],
      'P-2': [],
    };
    for (const bulk of ['404', 'ignored']) {
      const f: Fetcher = async (path) => {
        const u = new URL(path, 'http://x');
        if (u.pathname === '/api/workItems') {
          return bulk === '404' ? { status: 404, type: 'basic', text: '{}' }
            : { status: 200, type: 'basic', text: JSON.stringify(Number(u.searchParams.get('$skip')) ? [] : [{ issue: { idReadable: 'X-9' }, duration: { minutes: 5 } }]) };
        }
        const m = /^\/api\/issues\/([^/]+)\/timeTracking\/workItems$/.exec(u.pathname);
        return { status: 200, type: 'basic', text: JSON.stringify(Number(u.searchParams.get('$skip')) ? [] : items[m![1]]) };
      };
      const list = [normalizeIssue({ idReadable: 'P-1' }, BASE), normalizeIssue({ idReadable: 'P-2' }, BASE)];
      await attachTime(f, list, { author: 'me' });
      expect(list.map((i) => i.spent)).toEqual([30, 0]);
    }
  });
});

describe('сводка в выгрузке', () => {
  const list = [mk('A-1', { type: 'Задача', lead: 1, spent: 90 }), mk('A-2', { type: 'Ошибка', lead: 2, spent: 30 })];
  it('Markdown: раздел «Сводка» с разницей к прошлому периоду, время у задачи', () => {
    const prev = { stats: computeStats([mk('B-1', { spent: 60 })]), label: 'прошлым месяцем', period: '01.10.2026 – 31.10.2026' };
    const md = toMarkdown(list, { assignee: 'Анна', query: 'q', generated: 0, compare: prev });
    expect(md).toContain('## Сводка');
    expect(md).toContain('- Задач: 2 (+1 по сравнению с прошлым месяцем)');
    expect(md).toContain('- Затраченное время: 2 ч (+1 ч по сравнению с прошлым месяцем)');
    expect(md).toContain('- По типам: Задача — 1, Ошибка — 1');
    expect(md).toContain('- **Списано времени:** 1 ч 30 мин');
  });
  it('CSV: колонка «Время, ч» перед ссылкой', () => {
    const [head, row] = toCSV(list, { description: false, comments: false }).split('\r\n');
    expect(head.split(';').slice(-2)).toEqual(['Время, ч', 'Ссылка']);
    expect(row.split(';').slice(-2)).toEqual(['1,5', `${BASE}/issue/A-1`]);
  });
  it('statsLines без сравнения — без «прошлый период»', () => {
    expect(statsLines(computeStats(list)).join('\n')).not.toMatch(/Прошлый период|по сравнению/);
  });
});
