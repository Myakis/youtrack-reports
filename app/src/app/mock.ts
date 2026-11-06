// Тестовые данные: страница открыта не как расширение (например, http://localhost:8778/dist/firefox/app.html).
import type { Fetcher, RawResponse } from '../core/youtrack';

const users = [
  { login: 'a.ivanova', fullName: 'Анна Иванова', email: 'a.ivanova@office.lan' },
  { login: 'd.smirnov', fullName: 'Дмитрий Смирнов', email: 'd.smirnov@office.lan' },
  { login: 'e.kuznetsova', fullName: 'Екатерина Кузнецова' },
  { login: 'm.popov', fullName: 'Максим Попов' },
  { login: 'old.user', fullName: 'Уволенный Сотрудник', banned: true },
];
const projects = [{ shortName: 'CD', name: 'CashDash' }, { shortName: 'MOB', name: 'Мобильное приложение' }];

const day = 86400000;
const now = Date.now();
const u = (login: string) => ({ login, fullName: users.find((x) => x.login === login)!.fullName });

/** extra.ago — сколько дней назад решена (по умолчанию 3 + n): часть задач в этом месяце, часть — в прошлом. */
function issue(n: number, project: string, summary: string, who: string, extra: Partial<any> = {}) {
  const resolvedAt = now - (extra.ago ?? 3 + n) * day;
  const created = resolvedAt - (2 + n) * day;
  return {
    idReadable: `${project}-${100 + n}`,
    summary,
    description: extra.description ?? `Нужно ${summary.toLowerCase()}.\n\n**Критерии готовности:**\n- работает на проде\n- покрыто тестами`,
    created, updated: resolvedAt, resolved: extra.state && extra.state !== 'Готово' ? null : resolvedAt,
    reporter: u('m.popov'),
    project: projects.find((p) => p.shortName === project),
    tags: (extra.tags || []).map((name: string) => ({ name })),
    customFields: [
      { name: 'Тип', $type: 'SingleEnumIssueCustomField', value: { name: extra.type || 'Задача' } },
      { name: 'Приоритет', $type: 'SingleEnumIssueCustomField', value: { name: extra.prio || 'Обычный' } },
      { name: 'Состояние', $type: 'StateIssueCustomField', value: { name: extra.state || 'Готово' } },
      { name: 'Исполнитель', $type: 'SingleUserIssueCustomField', value: u(who) },
      { name: 'Затраченное время', $type: 'PeriodIssueCustomField', value: extra.spent ? { presentation: extra.spent } : null },
    ],
    comments: (extra.comments || []).map(([login, text]: [string, string], k: number) => ({ text, created: created + (k + 1) * day / 2, deleted: false, author: u(login) })),
    links: extra.links || [],
  };
}

// CD-101 и CD-102 — подзадачи эпика CD-107: на доске CashDash Kanban они в его свимлейне
const subtaskOf = (key: string) => ({ direction: 'INWARD', linkType: { name: 'Subtask', sourceToTarget: 'parent for', targetToSource: 'subtask of' }, issues: [{ idReadable: key }] });

const issues = [
  issue(1, 'CD', 'Добавить экспорт логов в Excel', 'a.ivanova', { ago: 2, tags: ['экспорт', 'Q4'], spent: '2д 4ч', links: [subtaskOf('CD-107')], comments: [['m.popov', 'Колонки — как в таблице.'], ['a.ivanova', 'Сделала, проверьте на стенде.']] }),
  issue(2, 'CD', 'Исправить падение при пустом SubID', 'a.ivanova', { ago: 4, type: 'Ошибка', prio: 'Критический', tags: ['баг'], links: [subtaskOf('CD-107')], comments: [['d.smirnov', 'Воспроизводится на 1.8.6']] }),
  issue(3, 'MOB', 'Экран истории платежей', 'a.ivanova', { ago: 35, tags: ['UI'], spent: '5д', links: [{ direction: 'OUTWARD', linkType: { name: 'Depend', sourceToTarget: 'зависит от', targetToSource: 'нужна для' }, issues: [{ idReadable: 'CD-101' }] }] }),
  issue(4, 'CD', 'Ускорить поиск по SubID', 'd.smirnov', { ago: 1, tags: ['производительность'] }),
  issue(5, 'MOB', 'Push-уведомления о статусе платежа', 'd.smirnov', { description: '', state: 'Ревью' }),
  issue(6, 'CD', 'Документация по API для агентов', 'e.kuznetsova', { tags: ['доки'], state: 'Готово к тестированию' }),
  issue(7, 'CD', 'Algeria', 'm.popov', { type: 'Эпик', state: 'В работе' }),
];

const agiles = [
  { id: '1-1', name: 'CashDash Kanban', projects: [{ shortName: 'CD' }], sprintsSettings: { disableSprints: true }, sprints: [{ id: '2-1', name: 'Kanban' }],
    swimlaneSettings: { $type: 'IssueBasedSwimlaneSettings', enabled: true, field: { name: 'Тип', customField: { name: 'Тип' } }, values: [{ name: 'Эпик' }] } },
  { id: '1-2', name: 'Mobile Scrum', projects: [{ shortName: 'MOB' }, { shortName: 'CD' }], sprintsSettings: { disableSprints: false }, sprints: [{ id: '2-2', name: 'Спринт 41' }, { id: '2-3', name: 'Спринт 42' }],
    swimlaneSettings: { $type: 'AttributeBasedSwimlaneSettings', enabled: true, field: { name: 'Приоритет', customField: { name: 'Приоритет' } }, values: [{ name: 'Критический' }, { name: 'Обычный' }] } },
];
const sprintIssues: Record<string, string[]> = { '2-1': ['CD-101', 'CD-102', 'CD-104', 'CD-106', 'CD-107'], '2-2': ['MOB-103'], '2-3': ['MOB-105', 'CD-101'] };

// История: CD-104 сначала делала Анна, потом передала Дмитрию; MOB-105 Анна перевела в тестирование
const activities = [
  { author: { login: 'a.ivanova' }, target: { idReadable: 'CD-104' }, field: { name: 'Исполнитель' }, added: [{ login: 'd.smirnov' }], removed: [{ login: 'a.ivanova' }] },
  { author: { login: 'a.ivanova' }, target: { idReadable: 'MOB-105' }, field: { name: 'Состояние' }, added: [{ name: 'Тестирование' }], removed: [{ name: 'В работе' }] },
  { author: { login: 'm.popov' }, target: { idReadable: 'CD-106' }, field: { name: 'Приоритет' }, added: [{ name: 'Высокий' }], removed: [] },
];

// Учёт времени (минуты)
const workItems = ([
  ['CD-101', 'a.ivanova', 300], ['CD-101', 'd.smirnov', 60], ['CD-102', 'a.ivanova', 135], ['MOB-103', 'a.ivanova', 480],
  ['CD-104', 'a.ivanova', 90], ['CD-104', 'd.smirnov', 240], ['MOB-105', 'd.smirnov', 360], ['CD-106', 'e.kuznetsova', 150],
] as [string, string, number][]).map(([key, login, minutes], k) => ({ date: now - k * day, duration: { minutes }, author: { login }, issue: { idReadable: key } }));

/** Условие периода из запроса: «resolved date: 2026-10-01 .. 2026-10-31». */
function inPeriod(i: any, q: string): boolean {
  const m = /(resolved date|updated|created): (\S+) \.\. (\S+)/.exec(q);
  if (!m) return true;
  const v = m[1] === 'resolved date' ? i.resolved : m[1] === 'updated' ? i.updated : i.created;
  if (!v) return false;
  const d = new Date(v);
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (m[2] === '*' || s >= m[2]) && (m[3] === '*' || s <= m[3]);
}

const ok = (body: unknown): RawResponse => ({ status: 200, type: 'basic', text: JSON.stringify(body) });

export const mockFetch: Fetcher = async (path) => {
  await new Promise((r) => setTimeout(r, 150));
  const url = new URL(path, 'http://mock');
  const p = url.pathname;
  const top = Number(url.searchParams.get('$top') || 100), skip = Number(url.searchParams.get('$skip') || 0);
  if (p === '/api/users/me') return ok(users[0]);
  if (p === '/api/users') return ok(users.slice(skip, skip + top));
  if (p === '/api/admin/projects') return ok(projects);
  if (p === '/api/tags') {
    const all = ['экспорт', 'Q4', 'баг', 'UI', 'производительность', 'доки', 'CashDash', 'CashDash Mobile', 'Рефакторинг'].map((name) => ({ name }));
    return ok(all.slice(skip, skip + top));
  }
  if (p === '/api/issues') {
    const q = url.searchParams.get('query') || '';
    const who = /(?:assignee|for): \{([^}]+)\}/.exec(q)?.[1];
    const commenter = /commenter: \{([^}]+)\}/.exec(q)?.[1];
    const ids = /issue id: ([^\s,]+(?:,\s*[^\s,]+)*)/.exec(q)?.[1].split(/,\s*/);
    const prj = /project: \{([^}]+)\}/.exec(q)?.[1];
    const found = issues.filter((i) => (!who || (i.customFields[3].value as { login: string }).login === who)
      && (!commenter || i.comments.some((c: any) => c.author.login === commenter))
      && (!ids || ids.includes(i.idReadable)) && (!prj || i.project!.shortName === prj) && inPeriod(i, q));
    return ok(found.slice(skip, skip + top));
  }
  if (p === '/api/workItems') {
    const ids = /issue id: ([^\s,]+(?:,\s*[^\s,]+)*)/.exec(url.searchParams.get('query') || '')?.[1].split(/,\s*/);
    const author = url.searchParams.get('author');
    return ok(workItems.filter((w) => (!ids || ids.includes(w.issue.idReadable)) && (!author || w.author.login === author)).slice(skip, skip + top));
  }
  // История по всему фильтру одним потоком (issueQuery тестовые данные не разбирают)
  if (p === '/api/activities') return ok(activities.slice(skip, skip + top));
  const acts = /^\/api\/issues\/([^/]+)\/activities$/.exec(p);
  if (acts) return ok(activities.filter((a) => a.target.idReadable === decodeURIComponent(acts[1])).slice(skip, skip + top));
  const one = /^\/api\/issues\/([^/]+)$/.exec(p);
  if (one) {
    const i = issues.find((x) => x.idReadable === decodeURIComponent(one[1]));
    return i ? ok(i) : { status: 404, type: 'basic', text: '{"error":"not found"}' };
  }
  if (p === '/api/agiles') return ok(agiles);
  const sp = /^\/api\/agiles\/[^/]+\/sprints\/([^/]+)$/.exec(p);
  if (sp) return ok({ issues: (sprintIssues[sp[1]] || []).map((idReadable) => ({ idReadable })) });
  return { status: 404, type: 'basic', text: '{"error":"not found"}' };
};
