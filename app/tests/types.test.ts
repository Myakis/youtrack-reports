import { describe, expect, it } from 'vitest';
import { knownTypes, listProjects, type Fetcher } from '../src/core/youtrack';
import { mockFetch } from '../src/app/mock';

describe('типы задач для фильтра', () => {
  it('проект — значения поля «Тип» из настроек, без архивных', async () => {
    const ps = await listProjects(mockFetch);
    const r = await knownTypes(mockFetch, ps.filter((p) => p.key === 'CD'));
    expect(r).toEqual({ types: ['Задача', 'Ошибка', 'Эпик', 'Frontend', 'Backend'], from: 'project' });
  });
  it('доска с двумя проектами — объединение без повторов', async () => {
    const r = await knownTypes(mockFetch, await listProjects(mockFetch));
    expect(r.from).toBe('project');
    expect(r.types).toHaveLength(7);
    expect([...r.types].sort()).toEqual(['Backend', 'Frontend', 'Mobile', 'Дизайн', 'Задача', 'Ошибка', 'Эпик'].sort());
  });
  it('без проекта или без доступа к настройкам — по последним задачам, по частоте', async () => {
    expect(await knownTypes(mockFetch, [])).toEqual({ types: ['Задача', 'Ошибка', 'Эпик'], from: 'issues' });
    const denied: Fetcher = (p) => (p.includes('/customFields') ? Promise.resolve({ status: 403, type: 'basic', text: '{}' }) : mockFetch(p));
    const r = await knownTypes(denied, [{ key: 'CD', name: 'CashDash', id: '0-1' }]);
    expect(r.from).toBe('issues');
    expect(r.types).toContain('Ошибка');
  });
});
