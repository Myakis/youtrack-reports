import { describe, expect, it } from 'vitest';
import { findParticipation, issueActivities, issuesByKeys, scanActivities } from '../src/core/participation';
import { toCSV, toMarkdown, toTxt } from '../src/core/export';
import { baseQuery, type Fetcher } from '../src/core/youtrack';
import { mockFetch } from '../src/app/mock';

const BASE = 'https://youtrack.office.lan';
const sorted = (m: Map<string, string[]>) => Object.fromEntries([...m].sort());

describe('поиск по участию (как в скрипте YoutrackReportByUser)', () => {
  it('по умолчанию — исполнитель сейчас и был исполнителем', async () => {
    const r = await findParticipation(mockFetch, '', 'a.ivanova');
    expect(sorted(r.roles)).toEqual({
      'CD-101': ['assignee'],
      'CD-102': ['assignee'],
      'CD-104': ['wasAssignee'],   // передала задачу Дмитрию
      'MOB-103': ['assignee'],
    });
    expect(r).toMatchObject({ all: 7, checked: 7, stopped: false });
  });
  it('с доской (only) — история только у задач доски, по одной, без потока по всему фильтру', async () => {
    const paths: string[] = [];
    const f: typeof mockFetch = (path, ...rest) => { paths.push(path); return mockFetch(path, ...rest); };
    const r = await findParticipation(f, '', 'a.ivanova', { only: new Set(['CD-104', 'CD-106', 'NOPE-1']) });
    expect(r).toMatchObject({ mode: 'perIssue', all: 2, checked: 2 });
    expect(r.roles.get('CD-104')).toEqual(['wasAssignee']);
    expect(paths.some((p) => p.startsWith('/api/activities'))).toBe(false);
    expect([...new Set(paths.filter((p) => /\/activities/.test(p)).map((p) => /issues\/([^/]+)/.exec(p)![1]))].sort()).toEqual(['CD-104', 'CD-106']);
  });

  it('шире — ещё менял задачу и комментировал', async () => {
    const r = await findParticipation(mockFetch, '', 'a.ivanova', { wide: true });
    expect(sorted(r.roles)).toEqual({
      'CD-101': ['assignee', 'commented'],
      'CD-102': ['assignee'],
      'CD-104': ['wasAssignee', 'changed'],
      'MOB-103': ['assignee'],
      'MOB-105': ['changed'],      // перевела в тестирование
    });
  });

  it('проверка истории — как was_user_assignee_in_history', () => {
    const acts = [
      { author: { login: 'x' }, field: { name: 'Assignee' }, added: { login: 'dev' }, removed: null },     // одно значение, не массив
      { author: { login: 'dev' }, field: { name: 'Reviewer' }, added: [{ login: 'dev' }], removed: [] },  // другое поле
    ];
    expect(scanActivities(acts, 'dev')).toEqual({ wasAssignee: true, changed: true });
    expect(scanActivities(acts.slice(1), 'dev')).toEqual({ wasAssignee: false, changed: true });
    expect(scanActivities([{ field: { name: ' Исполнитель ' }, removed: [{ login: 'dev' }] }], 'dev').wasAssignee).toBe(true);
  });

  it('история задачи листается до пустой страницы, даже если сервер отдаёт по 42', async () => {
    const seen: number[] = [];
    const f: Fetcher = async (path) => {
      const skip = Number(new URL(path, 'http://x').searchParams.get('$skip'));
      seen.push(skip);
      return { status: 200, type: 'basic', text: JSON.stringify(Array.from({ length: Math.max(0, Math.min(42, 90 - skip)) }, () => ({}))) };
    };
    expect(await issueActivities(f, 'CD-1')).toHaveLength(90);
    expect(seen).toEqual([0, 42, 84, 90]);
  });

  it('история каждой задачи фильтра, как в скрипте', async () => {
    const seen: string[] = [];
    const f: Fetcher = async (path) => {
      const u = new URL(path, 'http://x');
      const skip = Number(u.searchParams.get('$skip'));
      seen.push(u.pathname + (u.searchParams.has('query') ? ' ' + u.searchParams.get('query') : ''));
      const json = (b: unknown) => ({ status: 200, type: 'basic', text: JSON.stringify(b) });
      if (u.pathname === '/api/issues') return json(!skip && !u.searchParams.get('query')!.startsWith('assignee') ? [{ idReadable: 'CD-1' }] : []);
      return json(skip ? [] : [{ field: { name: 'Assignee' }, added: [{ login: 'qa' }], removed: [{ login: 'a' }] }]);
    };
    const base = baseQuery({ assignee: 'a', states: 'Готово', project: 'CD', from: '2026-10-01', to: '2026-10-31' });
    expect(base).toBe('project: {CD} state: {Готово} resolved date: 2026-10-01 .. 2026-10-31');
    const r = await findParticipation(f, base, 'a', { mode: 'perIssue' });
    expect(sorted(r.roles)).toEqual({ 'CD-1': ['wasAssignee'] });
    expect(r).toMatchObject({ all: 1, checked: 1, truncated: false, stopped: false });
    expect(seen).toEqual([
      `/api/issues assignee: {a} ${base}`,
      `/api/issues ${base}`, `/api/issues ${base}`,
      '/api/issues/CD-1/activities', '/api/issues/CD-1/activities',
    ]);
  });

  it('по одной задаче — лимит 3 000 задач фильтра', async () => {
    const f: Fetcher = async (path) => {
      const u = new URL(path, 'http://x');
      const skip = Number(u.searchParams.get('$skip'));
      const json = (b: unknown) => ({ status: 200, type: 'basic', text: JSON.stringify(b) });
      if (u.pathname === '/api/issues') {
        if ((u.searchParams.get('query') || '').startsWith('assignee')) return json([]);
        return json(Array.from({ length: Math.max(0, Math.min(500, 7000 - skip)) }, (_, k) => ({ idReadable: `P-${skip + k}` })));
      }
      return json([]);
    };
    expect(await findParticipation(f, 'q', 'a', { mode: 'perIssue' })).toMatchObject({ all: 3001, checked: 3000, limit: 3000, truncated: true });
    expect(await findParticipation(mockFetch, '', 'a.ivanova', { mode: 'perIssue', maxIssues: 2 })).toMatchObject({ checked: 2, truncated: true });
  });

  it('«Показать найденное» — остановка с тем, что уже проверено', async () => {
    const stop = { requested: false };
    let calls = 0;
    const f: Fetcher = async (path) => {
      const u = new URL(path, 'http://x');
      const skip = Number(u.searchParams.get('$skip'));
      const json = (b: unknown) => ({ status: 200, type: 'basic', text: JSON.stringify(b) });
      if (u.pathname === '/api/issues') return json(skip || (u.searchParams.get('query') || '').startsWith('assignee') ? [] : Array.from({ length: 100 }, (_, k) => ({ idReadable: `P-${k}` })));
      if (!skip && ++calls === 20) stop.requested = true;
      return json(skip ? [] : [{ field: { name: 'Assignee' }, removed: [{ login: 'a' }] }]);
    };
    const r = await findParticipation(f, 'q', 'a', { stop, mode: 'perIssue' });
    expect(r.stopped).toBe(true);
    expect(r.checked).toBeGreaterThanOrEqual(20);
    expect(r.checked).toBeLessThan(100);
    expect(r.roles.size).toBe(r.checked);
  });

  it('по умолчанию — история фильтра одним потоком (/api/activities?issueQuery=…)', async () => {
    const seen: string[] = [];
    const f: Fetcher = async (path) => {
      const u = new URL(path, 'http://x');
      const skip = Number(u.searchParams.get('$skip'));
      seen.push(u.pathname);
      const json = (b: unknown) => ({ status: 200, type: 'basic', text: JSON.stringify(b) });
      if (u.pathname === '/api/issues') {
        if ((u.searchParams.get('query') || '').startsWith('assignee')) return json([]);
        // 7 000 задач в фильтре — больше прежнего лимита
        return json(Array.from({ length: Math.max(0, Math.min(500, 7000 - skip)) }, (_, k) => ({ idReadable: `P-${skip + k}` })));
      }
      expect(u.searchParams.get('issueQuery')).toBe('q');
      if (skip >= 1000) return json([]);
      return json(Array.from({ length: 500 }, (_, k) => {
        const i = skip + k;
        // P-6500 «был исполнителем»; OUT-1 — не из фильтра, не учитывается
        if (i === 10) return { target: { idReadable: 'P-6500' }, field: { name: 'Assignee' }, removed: [{ login: 'a' }] };
        if (i === 11) return { target: { idReadable: 'OUT-1' }, field: { name: 'Assignee' }, removed: [{ login: 'a' }] };
        return { target: { idReadable: `P-${i}` }, author: { login: 'x' }, field: { name: 'State' }, added: [{ name: 'Готово' }] };
      }));
    };
    const r = await findParticipation(f, 'q', 'a');
    expect(sorted(r.roles)).toEqual({ 'P-6500': ['wasAssignee'] });
    expect(r).toMatchObject({ mode: 'stream', all: 7000, checked: 7000, truncated: false, stopped: false, scanned: 1000 });
    expect(seen.filter((x) => x === '/api/activities')).toHaveLength(3);
    expect(seen.some((x) => /\/api\/issues\/.+\/activities/.test(x))).toBe(false);
  });

  it('YouTrack не умеет issueQuery — по одной задаче', async () => {
    const make = (activities: (skip: number) => { status: number; body: unknown }) => {
      const seen: string[] = [];
      const f: Fetcher = async (path) => {
        const u = new URL(path, 'http://x');
        const skip = Number(u.searchParams.get('$skip'));
        seen.push(u.pathname);
        const res = (status: number, b: unknown) => ({ status, type: 'basic', text: JSON.stringify(b) });
        if (u.pathname === '/api/issues') return res(200, skip || (u.searchParams.get('query') || '').startsWith('assignee') ? [] : [{ idReadable: 'CD-1' }]);
        if (u.pathname === '/api/activities') { const a = activities(skip); return res(a.status, a.body); }
        return res(200, skip ? [] : [{ field: { name: 'Assignee' }, removed: [{ login: 'a' }] }]);
      };
      return { f, seen };
    };
    // ошибка запроса
    const bad = make(() => ({ status: 400, body: { error: 'Unknown parameter issueQuery' } }));
    const r1 = await findParticipation(bad.f, 'q', 'a');
    expect(r1).toMatchObject({ mode: 'perIssue', checked: 1 });
    expect(sorted(r1.roles)).toEqual({ 'CD-1': ['wasAssignee'] });
    expect(bad.seen).toContain('/api/issues/CD-1/activities');
    // issueQuery проигнорирован: в ответе только чужие задачи
    const ignored = make((skip) => ({ status: 200, body: skip ? [] : [{ target: { idReadable: 'ZZ-9' }, field: { name: 'Assignee' }, removed: [{ login: 'a' }] }] }));
    const r2 = await findParticipation(ignored.f, 'q', 'a');
    expect(r2.mode).toBe('perIssue');
    expect(sorted(r2.roles)).toEqual({ 'CD-1': ['wasAssignee'] });
  });

  it('поток: «Показать найденное» — остановка между страницами', async () => {
    const stop = { requested: false };
    let pages = 0;
    const f: Fetcher = async (path) => {
      const u = new URL(path, 'http://x');
      const skip = Number(u.searchParams.get('$skip'));
      const json = (b: unknown) => ({ status: 200, type: 'basic', text: JSON.stringify(b) });
      if (u.pathname === '/api/issues') return json(skip || (u.searchParams.get('query') || '').startsWith('assignee') ? [] : [{ idReadable: 'P-1' }]);
      if (++pages === 3) stop.requested = true;
      return json(Array.from({ length: 500 }, () => ({ target: { idReadable: 'P-1' }, field: { name: 'Assignee' }, removed: [{ login: 'a' }] })));
    };
    const r = await findParticipation(f, 'q', 'a', { stop });
    expect(r).toMatchObject({ mode: 'stream', stopped: true, scanned: 1500 });
    expect(sorted(r.roles)).toEqual({ 'P-1': ['wasAssignee'] });
  });

  it('задачи по ключам; если «issue id:» не понят — по одной', async () => {
    const list = await issuesByKeys(mockFetch, BASE, ['CD-104', 'MOB-105']);
    expect(list.map((i) => i.key).sort()).toEqual(['CD-104', 'MOB-105']);

    const f: Fetcher = async (path) => path.startsWith('/api/issues?')
      ? { status: 400, type: 'basic', text: '{"error":"Can\'t parse search query"}' }
      : { status: 200, type: 'basic', text: JSON.stringify({ idReadable: decodeURIComponent(path.split('/')[3].split('?')[0]) }) };
    expect((await issuesByKeys(f, BASE, ['A-1', 'B-2'])).map((i) => i.key)).toEqual(['A-1', 'B-2']);
  });

  it('участие и TXT в выгрузке', async () => {
    const [i] = await issuesByKeys(mockFetch, BASE, ['CD-104']);
    i.roles = ['wasAssignee', 'changed'];
    const meta = { assignee: 'Анна', query: 'q', generated: 0 };
    expect(toMarkdown([i], meta)).toContain('- **Участие сотрудника:** был исполнителем, менял задачу');
    expect(toCSV([i]).split('\r\n')[0]).toMatch(/^﻿Ключ;Название;Участие;/);
    i.description = 'строка 1\n\n  строка   2';
    expect(toTxt([i, { ...i, key: 'CD-1', summary: 'Пусто', description: '' }]))
      .toBe('- CD-104: Ускорить поиск по SubID (Описание: строка 1 строка 2)\n\n- CD-1: Пусто (Описание: <пусто>)\n');
    expect(toTxt([])).toBe('Нет задач\n');
  });
});
