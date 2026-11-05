import { describe, expect, it } from 'vitest';
import { applySuggestion, currentToken, suggest, tidyList, uniqSorted } from '../src/core/suggest';
import { listTags } from '../src/core/youtrack';

const tags = ['CashDash', 'Q4', 'баг', 'доки', 'экспорт', 'CashDash Mobile', 'Dash'];

describe('подсказки тегов', () => {
  it('дополняется значение после последней запятой', () => {
    expect(currentToken('CashDash, ба')).toBe('ба');
    expect(currentToken(' q4 ')).toBe('q4');
  });
  it('сначала начинающиеся с введённого, затем содержащие; без учёта регистра', () => {
    expect(suggest(tags, 'dash')).toEqual(['Dash', 'CashDash', 'CashDash Mobile']);
  });
  it('пустой ввод — все; уже выбранные не предлагаются', () => {
    expect(suggest(tags, '')).toEqual(tags);
    expect(suggest(tags, 'cashdash, ')).not.toContain('CashDash');
    expect(suggest(tags, 'cashdash, ')).toContain('CashDash Mobile');
  });
  it('введено ровно значение — подсказок нет', () => {
    expect(suggest(tags, 'Q4')).toEqual([]);
  });
  it('выбор заменяет вводимое и ставит запятую', () => {
    expect(applySuggestion('', 'Q4')).toBe('Q4, ');
    expect(applySuggestion('CashDash, ба', 'баг')).toBe('CashDash, баг, ');
  });
  it('висящая запятая убирается', () => {
    expect(tidyList('CashDash, баг, ')).toBe('CashDash, баг');
  });
  it('без повторов и по алфавиту', () => {
    expect(uniqSorted(['b', 'A', 'a', ' ', 'B '])).toEqual(['A', 'b']);
  });
});

describe('теги из YouTrack', () => {
  it('все страницы, без повторов', async () => {
    const pages = [[{ name: 'Q4' }, { name: 'баг' }], [{ name: 'q4' }, { name: 'CashDash' }], []];
    let n = 0;
    const f = async () => ({ status: 200, type: 'basic', text: JSON.stringify(pages[n++] ?? []) });
    expect(await listTags(f)).toEqual(['баг', 'CashDash', 'Q4']);
  });
});
