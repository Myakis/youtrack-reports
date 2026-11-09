import { describe, expect, it } from 'vitest';
import { clampScale, COLUMNS, DEFAULT_COLUMNS, moveColumn, normalizeColumns, toggleColumn } from '../src/app/lib/view';
import { filterChats, MAX_CHATS, upsertChat, type SavedChat } from '../src/app/lib/aiHistory';

describe('колонки таблицы', () => {
  it('по умолчанию — все по порядку, часть скрыта', () => {
    expect(normalizeColumns(null)).toEqual(DEFAULT_COLUMNS);
    expect(DEFAULT_COLUMNS.order).toHaveLength(COLUMNS.length);
  });
  it('старые настройки: неизвестные убираются, новые встают на своё место, название не прячется', () => {
    const c = normalizeColumns({ order: ['summary', 'key', 'old' as any, 'resolved'], hidden: ['summary', 'tags'] });
    expect(c.order.slice(0, 3)).toEqual(['summary', 'key', 'state']);
    expect(c.order).toHaveLength(COLUMNS.length);
    expect(c.order.indexOf('comments')).toBe(c.order.length - 1);
    expect(c.hidden).toEqual(['tags']);
  });
  it('сдвиг и показ', () => {
    const c = moveColumn(DEFAULT_COLUMNS, 'state', -1);
    expect(c.order.slice(0, 3)).toEqual(['key', 'state', 'summary']);
    expect(moveColumn(DEFAULT_COLUMNS, 'key', -1)).toBe(DEFAULT_COLUMNS);
    expect(toggleColumn(DEFAULT_COLUMNS, 'assignee', true).hidden).not.toContain('assignee');
    expect(toggleColumn(DEFAULT_COLUMNS, 'tags', false).hidden).toContain('tags');
  });
  it('размер текста — в пределах 85–130 %', () => {
    expect(clampScale(2)).toBe(1.3);
    expect(clampScale(0.5)).toBe(0.85);
    expect(clampScale(NaN)).toBe(1);
  });
});

describe('история разговоров с ИИ', () => {
  const chat = (id: string, title: string, answer = ''): SavedChat => ({ id, created: 1, updated: 1, title, goal: 'report', context: '', count: 1, turns: [{ kind: 'q', text: 'вопрос' }, { kind: 'a', text: answer }] });
  it('новый и обновлённый — сверху, без дублей, не больше MAX_CHATS', () => {
    let l = upsertChat([], chat('a', 'A'));
    l = upsertChat(l, chat('b', 'B'));
    l = upsertChat(l, chat('a', 'A2'));
    expect(l.map((c) => c.title)).toEqual(['A2', 'B']);
    const many = Array.from({ length: MAX_CHATS + 5 }, (_, i) => chat(String(i), 'x'));
    expect(many.reduce((acc, c) => upsertChat(acc, c), [] as SavedChat[])).toHaveLength(MAX_CHATS);
  });
  it('поиск по названию и тексту ответов — все слова', () => {
    const l = [chat('a', 'Обоснование повышения · Анна', 'Ведёт UI kit'), chat('b', 'Ретроспектива · Дмитрий', 'Ревью тормозит')];
    expect(filterChats(l, 'анна kit').map((c) => c.id)).toEqual(['a']);
    expect(filterChats(l, 'ревью').map((c) => c.id)).toEqual(['b']);
    expect(filterChats(l, '  ')).toHaveLength(2);
  });
});
