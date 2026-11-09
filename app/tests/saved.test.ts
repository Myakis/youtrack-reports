import { describe, expect, it } from 'vitest';
import { suggestName, upsertSaved } from '../src/app/lib/saved';
import { defaultForm } from '../src/app/lib/form';
import { minutesByProject, resolvedBuckets } from '../src/core/stats';
import { normalizeIssue } from '../src/core/youtrack';

const users = [{ login: 'a.ivanova', name: 'Анна Иванова', email: '' }] as any;

describe('сохранённые поиски', () => {
  it('имя по умолчанию — из сотрудника, доски, периода и статуса', () => {
    const f = { ...defaultForm(), assignee: 'a.ivanova', mode: 'participant' as const, board: 'Mobile Scrum', states: 'Готово' };
    expect(suggestName(f, users)).toBe('Анна Иванова (участие) · Mobile Scrum · Этот месяц · Готово');
    expect(suggestName({ ...defaultForm(), states: '', preset: 'custom', from: '2026-01-01', to: '' }, users)).toBe('Все сотрудники · 2026-01-01 – …');
    expect(suggestName({ ...defaultForm(), states: '', preset: 'all', board: 'Mobile Scrum' }, users)).toBe('Все сотрудники · Mobile Scrum · Всё время');
  });
  it('то же имя (без учёта регистра) заменяет, новое — в конец', () => {
    const f = defaultForm();
    let list = upsertSaved([], { name: 'Мой спринт', form: f }, 'a');
    list = upsertSaved(list, { name: 'Ошибки', form: f, query: 'type: Bug' }, 'b');
    list = upsertSaved(list, { name: 'мой спринт', form: { ...f, states: 'Ревью' } }, 'c');
    expect(list.map((s) => [s.id, s.name])).toEqual([['a', 'мой спринт'], ['b', 'Ошибки']]);
    expect(list[0].form.states).toBe('Ревью');
    expect(list[1].query).toBe('type: Bug');
  });
});

describe('данные графиков', () => {
  const at = (s: string) => new Date(s + 'T12:00:00').getTime();
  const mk = (key: string, resolved: string | null, spent?: number, project = 'CashDash') => {
    const i = normalizeIssue({ idReadable: key, created: at('2026-01-01'), resolved: resolved ? at(resolved) : null, project: { name: project } }, 'https://yt');
    if (spent != null) i.spent = spent;
    return i;
  };
  it('по неделям с понедельника, пустые недели на месте, время суммируется', () => {
    const r = resolvedBuckets([mk('A-1', '2026-11-03', 60), mk('A-2', '2026-11-05', 30), mk('A-3', '2026-11-19'), mk('A-4', null)], '2026-11-01', '2026-11-30')!;
    expect(r.by).toBe('week');
    expect(r.buckets.map((b) => [b.label, b.count])).toEqual([['26.10', 0], ['02.11', 2], ['09.11', 0], ['16.11', 1], ['23.11', 0], ['30.11', 0]]);
    expect(r.buckets[1]).toMatchObject({ title: '02.11–08.11', minutes: 90 });
  });
  it('длинный период — по месяцам; без решённых — нет графика', () => {
    const r = resolvedBuckets([mk('A-1', '2026-02-10'), mk('A-2', '2026-02-20'), mk('A-3', '2026-12-01')], '2026-01-01', '2026-12-31')!;
    expect(r.by).toBe('month');
    expect(r.buckets).toHaveLength(12);
    expect(r.buckets[0].label).toBe('янв 26');
    expect(r.buckets[1]).toMatchObject({ label: 'фев', count: 2 });
    expect(resolvedBuckets([mk('A-1', null)])).toBeNull();
  });
  it('время по проектам — по убыванию, без задач без времени', () => {
    expect(minutesByProject([mk('A-1', null, 60), mk('A-2', null, 0, 'Mobile'), mk('A-3', null, 120, 'Mobile'), mk('A-4', null, 30)]))
      .toEqual([['CashDash', 90], ['Mobile', 120]].sort((a, b) => (b[1] as number) - (a[1] as number)));
  });
});

describe('без сотрудника', async () => {
  const { formQuery, isParticipant } = await import('../src/app/lib/form');
  const { computeStats, minutesByAssignee } = await import('../src/core/stats');
  it('«участник» без сотрудника — обычный поиск по задачам', () => {
    const f = { ...defaultForm(), mode: 'participant' as const, assignee: '', project: 'CD' };
    expect(isParticipant(f)).toBe(false);
    expect(isParticipant({ ...f, assignee: 'a.ivanova' })).toBe(true);
    expect(formQuery(f, users, 'assignee')).toMatch(/^project: \{CD\} state: \{Готово\}/);
    expect(formQuery(f, users, 'assignee')).not.toContain('assignee:');
  });
  it('разбивка по исполнителям — задачи и часы', () => {
    const mk = (key: string, who: string, spent: number) => { const i = normalizeIssue({ idReadable: key, customFields: [{ name: 'Исполнитель', value: { fullName: who } }] }, 'https://yt'); i.spent = spent; return i; };
    const list = [mk('A-1', 'Анна', 60), mk('A-2', 'Анна', 30), mk('A-3', 'Дмитрий', 120), mk('A-4', '', 0)];
    expect(computeStats(list).byAssignee).toEqual([['Анна', 2], ['Дмитрий', 1], ['без значения', 1]]);
    expect(minutesByAssignee(list)).toEqual([['Дмитрий', 120], ['Анна', 90]]);
  });
});
