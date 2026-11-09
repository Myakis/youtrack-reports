import { describe, expect, it } from 'vitest';
import { attachFlow, buildFlow, flowStats, flowText, fmtDuration, stateDurations } from '../src/core/flow';
import { toCSV, toMarkdown } from '../src/core/export';
import { normalizeIssue, searchIssues, type Fetcher } from '../src/core/youtrack';
import { mockFetch } from '../src/app/mock';

const BASE = 'https://yt';
const H = 3600000, D = 24 * H;
const ch = (at: number, from: string, to: string) => ({ at, from, to });

describe('путь по статусам', () => {
  it('этапы по сменам статуса, возвраты назад', () => {
    const f = buildFlow(0, 'Готово', [
      ch(1 * D, 'Новая', 'В работе'), ch(3 * D, 'В работе', 'Ревью'), ch(4 * D, 'Ревью', 'В работе'),
      ch(5 * D, 'В работе', 'Ревью'), ch(6 * D, 'Ревью', 'Готово'),
    ]);
    expect(f.steps.map((s) => s.state)).toEqual(['Новая', 'В работе', 'Ревью', 'В работе', 'Ревью', 'Готово']);
    expect(f.steps[0]).toEqual({ state: 'Новая', from: 0, to: D });
    expect(f.steps.at(-1)!.to).toBeNull();
    expect(f.returns).toBe(2);   // снова в работу и снова на ревью
  });
  it('без смен — один этап с текущим статусом; смены не по порядку сортируются', () => {
    expect(buildFlow(5, 'Новая', [])).toEqual({ steps: [{ state: 'Новая', from: 5, to: null }], returns: 0 });
    const f = buildFlow(0, 'Ревью', [ch(2 * D, 'В работе', 'Ревью'), ch(D, 'Новая', 'В работе')]);
    expect(f.steps.map((s) => s.state)).toEqual(['Новая', 'В работе', 'Ревью']);
  });
  it('время в статусах: заходы суммируются; финальный статус решённой не считается, нерешённой — до now', () => {
    const f = buildFlow(0, 'Готово', [ch(D, 'Новая', 'В работе'), ch(3 * D, 'В работе', 'Ревью'), ch(4 * D, 'Ревью', 'В работе'), ch(5 * D, 'В работе', 'Готово')]);
    expect(Object.fromEntries(stateDurations(f, true))).toEqual({ 'Новая': D, 'В работе': 3 * D, 'Ревью': D });
    const open = buildFlow(0, 'Ревью', [ch(D, 'Новая', 'Ревью')]);
    expect(stateDurations(open, false, 3 * D).get('Ревью')).toBe(2 * D);
  });
  it('текст и длительности', () => {
    expect(fmtDuration(30 * 60000)).toBe('<1 ч');
    expect(fmtDuration(5 * H)).toBe('5 ч');
    expect(fmtDuration(2.5 * D)).toBe('2,5 дн.');
    const f = buildFlow(0, 'Готово', [ch(2 * D, 'Новая', 'В работе'), ch(3 * D, 'В работе', 'Готово')]);
    expect(flowText(f, true)).toBe('Новая (2 дн.) → В работе (1 дн.) → Готово');
    expect(flowText(buildFlow(0, 'Ревью', []), false, 5 * H)).toBe('Ревью (5 ч, сейчас)');
  });
});

describe('загрузка пути', () => {
  it('тестовые данные: история у каждой задачи отдельно; CD-101 возвращали из ревью', async () => {
    const paths: string[] = [];
    const f: Fetcher = (p) => { paths.push(p); return mockFetch(p); };
    const list = await searchIssues(mockFetch, BASE, 'assignee: {a.ivanova} state: {Готово}');
    await attachFlow(f, list);
    const cd101 = list.find((i) => i.key === 'CD-101')!;
    expect(cd101.flow!.steps.map((s) => s.state)).toEqual(['Новая', 'В работе', 'Ревью', 'В работе', 'Ревью', 'Готово']);
    expect(cd101.flow!.returns).toBe(2);
    expect(paths.some((p) => p.startsWith('/api/activities?'))).toBe(false);
    expect([...new Set(paths.map((p) => /issues\/([^/]+)\/activities/.exec(p)![1]))].sort()).toEqual(['CD-101', 'CD-102', 'MOB-103']);
    const s = flowStats(list)!;
    expect(s.states.map((x) => x.state)).toEqual(['Новая', 'В работе', 'Ревью', 'Тестирование']);
    expect(s).toMatchObject({ withReturns: 1, total: 3 });
  });
  it('чужие поля в истории не мешают; задача без доступа к истории — по текущему статусу', async () => {
    const acts: Record<string, any[]> = {
      'P-1': [
        { timestamp: D, field: { name: 'State' }, removed: { name: 'Open' }, added: { name: 'In Progress' } },
        { timestamp: 2 * D, field: { name: 'Priority' }, removed: { name: 'Normal' }, added: { name: 'Major' } },
      ],
    };
    const f: Fetcher = async (path) => {
      const u = new URL(path, 'http://x');
      const skip = Number(u.searchParams.get('$skip'));
      const k = /^\/api\/issues\/([^/]+)\/activities$/.exec(u.pathname)![1];
      if (k === 'P-2') return { status: 403, type: 'basic', text: '{"error":"forbidden"}' };
      return { status: 200, type: 'basic', text: JSON.stringify(skip ? [] : acts[k] || []) };
    };
    const state = (v: string) => [{ name: 'State', $type: 'StateIssueCustomField', value: { name: v } }];
    const i = normalizeIssue({ idReadable: 'P-1', created: 0, customFields: state('In Progress') }, BASE);
    const j = normalizeIssue({ idReadable: 'P-2', created: 0, customFields: state('Open') }, BASE);
    const seen: [number, number][] = [];
    await attachFlow(f, [i, j], { onProgress: (d, t) => seen.push([d, t]) });
    expect(i.flow!.steps.map((s) => s.state)).toEqual(['Open', 'In Progress']);
    expect(j.flow!.steps.map((s) => s.state)).toEqual(['Open']);
    expect(seen).toEqual([[0, 2], [1, 2], [2, 2]]);   // счётчик — после каждой задачи
  });
});

describe('путь в выгрузке', () => {
  const i = normalizeIssue({ idReadable: 'A-1', created: 0, resolved: 3 * D }, BASE);
  i.flow = buildFlow(0, 'Готово', [ch(D, 'Новая', 'В работе'), ch(3 * D, 'В работе', 'Готово')]);
  it('Markdown: путь у задачи и время в статусах в сводке', () => {
    const md = toMarkdown([i], { assignee: 'Анна', query: 'q', generated: 0 });
    expect(md).toContain('- **Путь по статусам:** Новая (1 дн.) → В работе (2 дн.) → Готово');
    expect(md).toContain('- В статусах (медиана): Новая — 1 дн., В работе — 2 дн.');
  });
  it('CSV: колонка «Путь по статусам»', () => {
    const [head, row] = toCSV([i], { description: false, comments: false }).split('\r\n');
    expect(head.split(';').slice(-2)).toEqual(['Путь по статусам', 'Ссылка']);
    expect(row).toContain('Новая (1 дн.) → В работе (2 дн.) → Готово');
  });
});
