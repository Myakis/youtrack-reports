import { describe, expect, it } from 'vitest';
import { boardIssueKeys, findBoard, hasSprints, type Board } from '../src/core/youtrack';
import { issuesByKeys } from '../src/core/participation';

const scrum: Board = { id: 'a1', name: 'Mobile Scrum', projects: ['MOB'], noSprints: false, sprints: [{ id: 's1', name: 'Спринт 41' }, { id: 's2', name: 'Спринт 42' }] };
const kanban: Board = { id: 'a2', name: 'CashDash Kanban', projects: ['CD'], noSprints: true, sprints: [{ id: 'k', name: 'Kanban' }] };

/** Ответы по пути; запомнить, что запрашивали. */
function fake(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const f = async (path: string) => {
    calls.push(decodeURIComponent(path));
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    return key ? { status: 200, type: 'basic', text: JSON.stringify(routes[key]) } : { status: 404, type: 'basic', text: '{}' };
  };
  return { f, calls };
}

describe('фильтр по доске', () => {
  it('доска по названию без учёта регистра', () => {
    expect(findBoard([scrum, kanban], ' mobile scrum ')).toBe(scrum);
    expect(findBoard([scrum], 'Нет такой')).toBeNull();
    expect(findBoard([scrum], '')).toBeNull();
  });
  it('выбор спринта — только у доски со спринтами', () => {
    expect(hasSprints(scrum)).toBe(true);
    expect(hasSprints(kanban)).toBe(false);
  });
  it('задачи всех спринтов без повторов', async () => {
    const { f } = fake({
      '/api/agiles/a1/sprints/s1': { issues: [{ idReadable: 'MOB-1' }, { idReadable: 'MOB-2' }] },
      '/api/agiles/a1/sprints/s2': { issues: [{ idReadable: 'MOB-2' }, { idReadable: 'MOB-3' }] },
    });
    expect([...await boardIssueKeys(f, scrum)].sort()).toEqual(['MOB-1', 'MOB-2', 'MOB-3']);
  });
  it('один спринт — только его задачи', async () => {
    const { f, calls } = fake({ '/api/agiles/a1/sprints/s2': { issues: [{ idReadable: 'MOB-3' }] } });
    expect([...await boardIssueKeys(f, scrum, 's2')]).toEqual(['MOB-3']);
    expect(calls).toHaveLength(1);
  });
  it('задачи по ключам с остальными условиями запроса', async () => {
    const { f, calls } = fake({ '/api/issues': [] });
    await issuesByKeys(f, 'https://yt', ['MOB-1', 'MOB-2'], { query: 'state: {Готово}' });
    expect(calls[0]).toContain('query=issue id: MOB-1, MOB-2 state: {Готово}');
  });
});
