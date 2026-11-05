import { describe, expect, it } from 'vitest';
import { attachBoards, badParts, buildQuery, knownStates, queryParts, withoutPeriod, dropEach, findAssigneeAttr, fieldValue, getJson, normalizeIssue, searchIssues, YtError, type Fetcher } from '../src/core/youtrack';
import { fileName, toCSV, toJSON, toMarkdown } from '../src/core/export';
import { periodLabel, presetRange } from '../src/core/period';
import { mockFetch } from '../src/app/mock';

const BASE = 'https://youtrack.office.lan';

describe('buildQuery', () => {
  it('исполнитель, статус, период', () => {
    expect(buildQuery({ assignee: 'a.ivanova', states: 'Готова', from: '2026-10-01', to: '2026-10-31' }))
      .toBe('assignee: {a.ivanova} state: {Готова} resolved date: 2026-10-01 .. 2026-10-31');
  });
  it('несколько статусов, проект, открытая граница и хвост', () => {
    expect(buildQuery({ assignee: 'x', states: 'Готова, Закрыта', project: 'CD', dateField: 'updated', from: '2026-01-01', extra: 'summary: kit' }))
      .toBe('project: {CD} assignee: {x} state: {Готова}, {Закрыта} updated: 2026-01-01 .. * summary: kit');
  });
  it('тип и тег — как в скрипте YoutrackReportByUser', () => {
    expect(buildQuery({ assignee: 'i.petrov', project: 'PS LAB DEV', states: 'Ревью, Готово', types: 'Frontend, Mobile', tags: 'CashDash', dateField: 'updated', from: '2026-01-01', to: '2026-03-01' }))
      .toBe('project: {PS LAB DEV} assignee: {i.petrov} state: {Ревью}, {Готово} type: {Frontend}, {Mobile} tag: {CashDash} updated: 2026-01-01 .. 2026-03-01');
  });
  it('без периода и без статуса', () => {
    expect(buildQuery({ assignee: 'x', states: ' ' })).toBe('assignee: {x}');
  });
  it('фигурные скобки в значении не ломают запрос', () => {
    expect(buildQuery({ assignee: 'a{b}', states: '' })).toBe('assignee: {ab}');
  });
});

describe('диагностика запроса', () => {
  // Поддельный YouTrack: не знает статус «Готова» и сортировку с пробелом
  const f: Fetcher = async (path) => {
    const q = new URL(path, 'http://x').searchParams.get('query') || '';
    if (/state: \{Готова\}|sort by/.test(q)) return { status: 400, type: 'basic', text: '{"error":"Can\'t parse search query, please check and update query syntax"}' };
    return { status: 200, type: 'basic', text: JSON.stringify([
      { customFields: [{ name: 'State', $type: 'StateIssueCustomField', value: { name: 'Done' } }] },
      { customFields: [{ name: 'State', $type: 'StateIssueCustomField', value: { name: 'Done' } }] },
      { customFields: [{ name: 'State', $type: 'StateIssueCustomField', value: { name: 'In Progress' } }, { name: 'Тип', value: { name: 'Задача' } }] },
    ]) };
  };
  it('находит виноватую часть', async () => {
    const parts = queryParts({ project: 'PSLABDEV', assignee: 'i.petrov', states: 'Готова', from: '2026-01-01', to: '2026-12-31' });
    expect(parts.map((p) => p.what)).toEqual(['project', 'assignee', 'state', 'period']);
    expect((await badParts(f, parts)).map((p) => p.what)).toEqual(['state']);
  });
  it('подсказывает настоящие статусы, частые первыми', async () => {
    expect(await knownStates(f, 'PSLABDEV')).toEqual(['Done', 'In Progress']);
  });
  it('в запросе нет сортировки', () => {
    expect(buildQuery({ assignee: 'x', states: 'Готова', from: '2026-01-01', to: '2026-12-31' })).not.toContain('sort by');
  });
});

describe('withoutPeriod', () => {
  it('убирает период из запроса и смотрит, есть ли дата решения', async () => {
    let q = '';
    const f: Fetcher = async (path) => {
      q = new URL(path, 'http://x').searchParams.get('query') || '';
      return { status: 200, type: 'basic', text: JSON.stringify([{ resolved: null }, {}]) };
    };
    const parts = queryParts({ assignee: 'i.petrov', states: 'Новая', from: '2026-10-01', to: '2026-12-31' });
    expect(await withoutPeriod(f, parts)).toEqual({ found: 2, anyResolved: false });
    expect(q).toBe('assignee: {i.petrov} state: {Новая}');
  });
});

describe('пустой результат', () => {
  // Поддельный YouTrack: «assignee:» и «for:» не находят ничего, «Исполнитель:» — находит; период отсекает всё
  const f: Fetcher = async (path) => {
    const q = new URL(path, 'http://x').searchParams.get('query') || '';
    const n = /assignee:|for:|created:/.test(q) ? 0 : 3;
    return { status: 200, type: 'basic', text: JSON.stringify(Array.from({ length: n }, (_, k) => ({ idReadable: 'P-' + k }))) };
  };
  const o = { assignee: 'i.petrov', states: 'Новая', dateField: 'created' as const, from: '2026-10-01', to: '2026-12-31' };
  it('условие на исполнителя — по имени поля', () => {
    expect(buildQuery({ ...o, assigneeAttr: 'Исполнитель' })).toBe('Исполнитель: {i.petrov} state: {Новая} created: 2026-10-01 .. 2026-12-31');
  });
  it('убирает условия по очереди', async () => {
    const r = await dropEach(f, queryParts({ ...o, dateField: 'updated' }));
    expect(r.map((d) => [d.part.what, d.found])).toEqual([['assignee', 3], ['state', 0], ['period', 0]]);
  });
  it('подбирает вариант условия на исполнителя', async () => {
    expect(await findAssigneeAttr(f, { ...o, dateField: 'updated' })).toEqual({ attr: 'Исполнитель', found: 3 });
    expect(await findAssigneeAttr(f, o)).toBeNull();
  });
});

describe('fieldValue', () => {
  it('пользователь, список, время, дата', () => {
    expect(fieldValue('SingleUserIssueCustomField', { login: 'a', fullName: 'Анна' })).toBe('Анна');
    expect(fieldValue('MultiEnumIssueCustomField', [{ name: 'iOS' }, { name: 'Android' }])).toBe('iOS, Android');
    expect(fieldValue('PeriodIssueCustomField', { presentation: '2д 4ч', minutes: 1200 })).toBe('2д 4ч');
    expect(fieldValue('DateIssueCustomField', Date.UTC(2026, 9, 1, 12))).toBe('01.10.2026');
    expect(fieldValue('SimpleIssueCustomField', 5)).toBe('5');
    expect(fieldValue('X', null)).toBe('');
  });
});

describe('normalizeIssue', () => {
  it('статус, исполнитель, удалённые комментарии, связи', () => {
    const i = normalizeIssue({
      idReadable: 'CD-1', summary: 'S', project: { name: 'CashDash', shortName: 'CD' }, tags: [{ name: 't' }],
      customFields: [
        { name: 'Состояние', $type: 'StateIssueCustomField', value: { name: 'Готова' } },
        { name: 'Исполнитель', $type: 'SingleUserIssueCustomField', value: { login: 'a', fullName: 'Анна' } },
      ],
      comments: [
        { text: 'второй', created: 2, author: { login: 'b', fullName: 'Б' } },
        { text: 'удалён', created: 3, deleted: true, author: { login: 'b' } },
        { text: 'первый', created: 1, author: { login: 'a', fullName: 'Анна' } },
      ],
      links: [
        { direction: 'INWARD', linkType: { name: 'Depend', sourceToTarget: 'зависит от', targetToSource: 'нужна для' }, issues: [{ idReadable: 'CD-2' }] },
        { direction: 'OUTWARD', linkType: { name: 'Relates' }, issues: [] },
      ],
    }, BASE);
    expect(i.state).toBe('Готова');
    expect(i.assignee).toBe('Анна');
    expect(i.url).toBe(BASE + '/issue/CD-1');
    expect(i.comments.map((c) => c.text)).toEqual(['первый', 'второй']);
    expect(i.links).toEqual([{ type: 'нужна для', keys: ['CD-2'] }]);
  });
});

describe('getJson', () => {
  it('401, редирект и HTML — это «нет входа»', async () => {
    for (const r of [
      { status: 401, type: 'basic', text: '' },
      { status: 0, type: 'opaqueredirect', text: '' },
      { status: 200, type: 'basic', text: '<html>login</html>' },
    ]) {
      await expect(getJson(async () => r, '/x')).rejects.toMatchObject({ kind: 'auth' });
    }
  });
  it('сетевая ошибка и HTTP 400 с текстом YouTrack', async () => {
    await expect(getJson(async () => ({ status: 0, type: 'error', text: '', error: 'offline' }), '/x')).rejects.toMatchObject({ kind: 'network' });
    await expect(getJson(async () => ({ status: 400, type: 'basic', text: '{"error_description":"Bad query"}' }), '/x'))
      .rejects.toThrow('HTTP 400: Bad query');
  });
});

describe('searchIssues + attachBoards', () => {
  it('сервер отдаёт меньше, чем просили (~42), — листаем дальше до пустой страницы', async () => {
    const f: Fetcher = async (path) => {
      const skip = Number(new URL(path, 'http://x').searchParams.get('$skip'));
      const n = Math.max(0, Math.min(42, 130 - skip));
      return { status: 200, type: 'basic', text: JSON.stringify(Array.from({ length: n }, (_, k) => ({ idReadable: `P-${skip + k}` }))) };
    };
    expect(await searchIssues(f, BASE, 'q')).toHaveLength(130);
  });
  it('листает страницами до конца', async () => {
    const seen: number[] = [];
    const f: Fetcher = async (path) => {
      const skip = Number(new URL(path, 'http://x').searchParams.get('$skip'));
      seen.push(skip);
      const n = skip < 200 ? 100 : skip < 230 ? 30 : 0;
      return { status: 200, type: 'basic', text: JSON.stringify(Array.from({ length: n }, (_, k) => ({ idReadable: `P-${skip + k}` }))) };
    };
    const list = await searchIssues(f, BASE, 'q');
    expect(list).toHaveLength(230);
    expect(seen).toEqual([0, 100, 200, 230]);
  });
  it('лимит и отмена', async () => {
    const f: Fetcher = async () => ({ status: 200, type: 'basic', text: JSON.stringify(Array.from({ length: 100 }, (_, k) => ({ idReadable: 'P-' + k }))) });
    expect(await searchIssues(f, BASE, 'q', { limit: 150 })).toHaveLength(150);
    await expect(searchIssues(f, BASE, 'q', { signal: { cancelled: true } })).rejects.toBeInstanceOf(YtError);
  });
  it('доски по тестовым данным: канбан без спринтов и скрам со спринтами', async () => {
    const list = await searchIssues(mockFetch, BASE, 'assignee: {a.ivanova} state: {Готово}');
    expect(list.map((i) => i.key).sort()).toEqual(['CD-101', 'CD-102', 'MOB-103']);
    await attachBoards(mockFetch, list);
    const b = Object.fromEntries(list.map((i) => [i.key, i.boards.sort()]));
    expect(b['CD-101']).toEqual(['CashDash Kanban', 'Mobile Scrum / Спринт 42']);
    expect(b['MOB-103']).toEqual(['Mobile Scrum / Спринт 41']);
  });
});

describe('export', () => {
  const issue = normalizeIssue({
    idReadable: 'CD-7', summary: 'Экспорт; "CSV"', description: '# Заголовок\nтекст',
    created: Date.UTC(2026, 9, 1, 9), resolved: Date.UTC(2026, 9, 3, 15),
    project: { name: 'CashDash', shortName: 'CD' }, tags: [{ name: 'Q4' }],
    customFields: [{ name: 'Тип', value: { name: 'Задача' } }, { name: 'Состояние', $type: 'StateIssueCustomField', value: { name: 'Готова' } }],
    comments: [{ text: 'Готово\nпроверьте', created: Date.UTC(2026, 9, 3, 10), author: { login: 'a', fullName: 'Анна' } }],
  }, BASE);
  issue.boards = ['Kanban'];
  const meta = { assignee: 'Анна (a)', query: 'for: {a}', period: '01.10.2026 – 31.10.2026', generated: Date.UTC(2026, 9, 29, 9) };

  it('Markdown: метаданные, описание цитатой, комментарии', () => {
    const md = toMarkdown([issue], meta);
    expect(md).toContain('# Задачи: Анна (a)');
    expect(md).toContain('## CD-7 — Экспорт; "CSV"');
    expect(md).toContain('- **Доски:** Kanban');
    expect(md).toContain('- **Теги:** Q4');
    expect(md).toContain('- **Тип:** Задача');
    expect(md).not.toContain('- **Состояние:**');   // уже есть строкой «Статус»
    expect(md).toContain('> # Заголовок\n> текст');
    expect(md).toContain('**Анна**, 03.10.2026 13:00:\n\n> Готово\n> проверьте');
    expect(md.startsWith('Ниже')).toBe(false);
    expect(toMarkdown([issue], meta, { prompt: true }).startsWith('Ниже')).toBe(true);
    expect(toMarkdown([issue], meta, { comments: false, description: false })).not.toMatch(/Описание|Комментарии/);
  });

  it('JSON', () => {
    const j = JSON.parse(toJSON([issue], meta));
    expect(j.count).toBe(1);
    expect(j.issues[0]).toMatchObject({ key: 'CD-7', boards: ['Kanban'], tags: ['Q4'], state: 'Готова', resolved: '2026-10-03T15:00:00.000Z' });
    expect(j.issues[0].comments[0]).toMatchObject({ author: 'Анна', text: 'Готово\nпроверьте' });
  });

  it('CSV: BOM, «;», экранирование', () => {
    const csv = toCSV([issue]);
    expect(csv.startsWith('﻿Ключ;Название;')).toBe(true);
    expect(csv).toContain('CD-7;"Экспорт; ""CSV""";CashDash;Kanban;Q4;Готова;');
    expect(csv).toContain('"Анна, 03.10.2026 13:00: Готово\nпроверьте"');
  });

  it('имя файла', () => {
    expect(fileName('a.ivanova', 'md', new Date(2026, 9, 29))).toBe('Задачи_a.ivanova_2026-10-29.md');
    expect(fileName('a b/c', 'csv', new Date(2026, 0, 5))).toBe('Задачи_a_b_c_2026-01-05.csv');
  });
});

describe('period', () => {
  const now = new Date(2026, 9, 29);
  it('пресеты', () => {
    expect(presetRange('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('prevMonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('quarter', now)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(presetRange('prevQuarter', now)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(presetRange('prevQuarter', new Date(2026, 1, 10))).toEqual({ from: '2025-10-01', to: '2025-12-31' });
    expect(presetRange('last30', now)).toEqual({ from: '2026-09-30', to: '2026-10-29' });
    expect(presetRange('all', now)).toEqual({ from: '', to: '' });
  });
  it('подпись', () => {
    expect(periodLabel('2026-10-01', '2026-10-31')).toBe('01.10.2026 – 31.10.2026');
    expect(periodLabel('', '2026-10-31')).toBe('по 31.10.2026');
    expect(periodLabel('', '')).toBe('');
  });
});
