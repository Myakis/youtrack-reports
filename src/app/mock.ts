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

function issue(n: number, project: string, summary: string, who: string, extra: Partial<any> = {}) {
  const created = now - (40 - n) * day;
  return {
    idReadable: `${project}-${100 + n}`,
    summary,
    description: extra.description ?? `Нужно ${summary.toLowerCase()}.\n\n**Критерии готовности:**\n- работает на проде\n- покрыто тестами`,
    created, updated: created + 3 * day, resolved: created + 3 * day,
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

const issues = [
  issue(1, 'CD', 'Добавить экспорт логов в Excel', 'a.ivanova', { tags: ['экспорт', 'Q4'], spent: '2д 4ч', comments: [['m.popov', 'Колонки — как в таблице.'], ['a.ivanova', 'Сделала, проверьте на стенде.']] }),
  issue(2, 'CD', 'Исправить падение при пустом SubID', 'a.ivanova', { type: 'Ошибка', prio: 'Критический', tags: ['баг'], comments: [['d.smirnov', 'Воспроизводится на 1.8.6']] }),
  issue(3, 'MOB', 'Экран истории платежей', 'a.ivanova', { tags: ['UI'], spent: '5д', links: [{ direction: 'OUTWARD', linkType: { name: 'Depend', sourceToTarget: 'зависит от', targetToSource: 'нужна для' }, issues: [{ idReadable: 'CD-101' }] }] }),
  issue(4, 'CD', 'Ускорить поиск по SubID', 'd.smirnov', { tags: ['производительность'] }),
  issue(5, 'MOB', 'Push-уведомления о статусе платежа', 'd.smirnov', { description: '', state: 'Ревью' }),
  issue(6, 'CD', 'Документация по API для агентов', 'e.kuznetsova', { tags: ['доки'], state: 'Готово к тестированию' }),
];

const agiles = [
  { id: '1-1', name: 'CashDash Kanban', projects: [{ shortName: 'CD' }], sprintsSettings: { disableSprints: true }, sprints: [{ id: '2-1', name: 'Kanban' }] },
  { id: '1-2', name: 'Mobile Scrum', projects: [{ shortName: 'MOB' }, { shortName: 'CD' }], sprintsSettings: { disableSprints: false }, sprints: [{ id: '2-2', name: 'Спринт 41' }, { id: '2-3', name: 'Спринт 42' }] },
];
const sprintIssues: Record<string, string[]> = { '2-1': ['CD-101', 'CD-102', 'CD-104', 'CD-106'], '2-2': ['MOB-103'], '2-3': ['MOB-105', 'CD-101'] };

// История: CD-104 сначала делала Анна, потом передала Дмитрию; MOB-105 Анна перевела в тестирование
const activities = [
  { author: { login: 'a.ivanova' }, target: { idReadable: 'CD-104' }, field: { name: 'Исполнитель' }, added: [{ login: 'd.smirnov' }], removed: [{ login: 'a.ivanova' }] },
  { author: { login: 'a.ivanova' }, target: { idReadable: 'MOB-105' }, field: { name: 'Состояние' }, added: [{ name: 'Тестирование' }], removed: [{ name: 'В работе' }] },
  { author: { login: 'm.popov' }, target: { idReadable: 'CD-106' }, field: { name: 'Приоритет' }, added: [{ name: 'Высокий' }], removed: [] },
];

const ok = (body: unknown): RawResponse => ({ status: 200, type: 'basic', text: JSON.stringify(body) });

export const mockFetch: Fetcher = async (path) => {
  await new Promise((r) => setTimeout(r, 150));
  const url = new URL(path, 'http://mock');
  const p = url.pathname;
  const top = Number(url.searchParams.get('$top') || 100), skip = Number(url.searchParams.get('$skip') || 0);
  if (p === '/api/users/me') return ok(users[0]);
  if (p === '/api/users') return ok(users.slice(skip, skip + top));
  if (p === '/api/admin/projects') return ok(projects);
  if (p === '/api/issues') {
    const q = url.searchParams.get('query') || '';
    const who = /(?:assignee|for): \{([^}]+)\}/.exec(q)?.[1];
    const commenter = /commenter: \{([^}]+)\}/.exec(q)?.[1];
    const ids = /issue id: (.+)$/.exec(q)?.[1].split(/,\s*/);
    const prj = /project: \{([^}]+)\}/.exec(q)?.[1];
    const found = issues.filter((i) => (!who || (i.customFields[3].value as { login: string }).login === who)
      && (!commenter || i.comments.some((c: any) => c.author.login === commenter))
      && (!ids || ids.includes(i.idReadable)) && (!prj || i.project!.shortName === prj));
    return ok(found.slice(skip, skip + top));
  }
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
