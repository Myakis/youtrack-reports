// Поиск по участию: задачи фильтра, где сотрудник исполнитель сейчас или был им раньше (по истории поля «Исполнитель»);
// по желанию — ещё где менял задачу или комментировал. Логика как в скрипте YoutrackReportByUser: история читается
// у каждой задачи фильтра (/api/issues/{id}/activities).
import {
  ASSIGNEE_NAMES, br, getJson, ISSUE_FIELDS, isParseError, normalizeIssue, qs,
  type Fetcher, type Issue, type Signal, YtError,
} from './youtrack';

export type Role = 'assignee' | 'wasAssignee' | 'changed' | 'commented';

export const ROLE_NAMES: Record<Role, string> = {
  assignee: 'исполнитель',
  wasAssignee: 'был исполнителем',
  changed: 'менял задачу',
  commented: 'комментировал',
};
const ROLE_ORDER: Role[] = ['assignee', 'wasAssignee', 'changed', 'commented'];

export interface ParticipationOptions {
  assigneeAttr?: string;
  wide?: boolean;           // ещё «менял задачу» и «комментировал»
  signal?: Signal;
  onProgress?: (text: string, part: number) => void;
  maxIssues?: number;       // у скольких задач фильтра читать историю (по умолчанию 3 000)
  stop?: { requested: boolean };   // «Показать найденное»: остановиться и вернуть то, что уже проверено
}

const check = (s?: Signal) => { if (s?.cancelled) throw new YtError('Отменено'); };

/** Выполнить задачи не больше n одновременно. */
async function pool<T>(items: T[], n: number, run: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await run(items[i++]);
  }));
}

/** Ключи задач по запросу. Листаем до пустой страницы: сервер может отдать меньше, чем просили. */
export async function keys(f: Fetcher, query: string, limit: number, signal?: Signal): Promise<string[]> {
  const out: string[] = [];
  while (out.length < limit) {
    check(signal);
    const page: any[] = await getJson(f, '/api/issues?' + qs({ query, fields: 'idReadable', $top: 500, $skip: out.length }));
    if (!page.length) break;
    out.push(...page.map((i) => i.idReadable));
  }
  return out.slice(0, limit);
}

/** История изменений полей одной задачи — тоже до пустой страницы. */
export async function issueActivities(f: Fetcher, key: string, signal?: Signal): Promise<any[]> {
  const out: any[] = [];
  for (;;) {
    check(signal);
    const page: any[] = await getJson(f, `/api/issues/${encodeURIComponent(key)}/activities?` + qs({
      categories: 'CustomFieldCategory', fields: 'author(login),field(name),added(login),removed(login)', $top: 100, $skip: out.length,
    }));
    if (!page.length) break;
    out.push(...page);
  }
  return out;
}

const logins = (v: any): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((u: any) => u?.login).filter(Boolean);

/** Был ли login в поле «Исполнитель» (его ставили или снимали), и менял ли он поля задачи. */
export function scanActivities(acts: any[], login: string): { wasAssignee: boolean; changed: boolean } {
  let wasAssignee = false, changed = false;
  for (const a of acts) {
    if (a.author?.login === login) changed = true;
    const field = String(a.field?.name || '').trim().toLowerCase();
    if (ASSIGNEE_NAMES.includes(field) && [...logins(a.added), ...logins(a.removed)].includes(login)) wasAssignee = true;
  }
  return { wasAssignee, changed };
}

const n = (x: number) => x.toLocaleString('ru');

/**
 * Задачи фильтра base (без условия на исполнителя), в которых участвовал login, — с ролями. Как скрипт
 * YoutrackReportByUser: история каждой задачи отдельно, у первых maxIssues (3 000) задач фильтра.
 * Результат: ключ задачи → роли; `all` — задач в фильтре (до maxIssues + 1), `checked` — у скольких проверена история,
 * `truncated` — в фильтре больше лимита, `stopped` — остановили кнопкой «Показать найденное».
 */
export async function findParticipation(f: Fetcher, base: string, login: string, o: ParticipationOptions = {}) {
  const maxIssues = o.maxIssues ?? 3000;
  const found = new Map<string, Set<Role>>();
  const add = (key: string, r: Role) => { if (key) (found.get(key) ?? found.set(key, new Set()).get(key)!).add(r); };
  const withBase = (cond: string) => (base.trim() ? `${cond} ${base}` : cond);

  o.onProgress?.('Задачи, где сотрудник — исполнитель…', 0.05);
  for (const k of await keys(f, withBase(`${o.assigneeAttr || 'assignee'}: ${br(login)}`), maxIssues, o.signal)) add(k, 'assignee');
  if (o.wide) {
    o.onProgress?.('Задачи с его комментариями…', 0.08);
    for (const k of await keys(f, withBase(`commenter: ${br(login)}`), maxIssues, o.signal)) add(k, 'commented');
  }

  o.onProgress?.('Задачи фильтра…', 0.1);
  const all = await keys(f, base, maxIssues + 1, o.signal);
  const truncated = all.length > maxIssues;
  const list = all.slice(0, maxIssues);
  let done = 0, stopped = false;
  await pool(list, 6, async (key) => {
    if (o.stop?.requested) { stopped = true; return; }
    const r = scanActivities(await issueActivities(f, key, o.signal), login);
    if (r.wasAssignee) add(key, 'wasAssignee');
    if (o.wide && r.changed) add(key, 'changed');
    done++;
    if (done % 5 === 0 || done === list.length) o.onProgress?.(`История задач: ${n(done)} из ${n(list.length)}`, 0.1 + 0.6 * done / list.length);
  });
  const checked = done;

  const roles = new Map<string, Role[]>();
  for (const [k, rs] of found) {
    // «был исполнителем» при «исполнитель сейчас» — лишнее
    if (rs.has('assignee')) rs.delete('wasAssignee');
    roles.set(k, ROLE_ORDER.filter((r) => rs.has(r)));
  }
  return { roles, all: all.length, checked, truncated, stopped };
}

/** Задачи по ключам: запросом «issue id: A, B, …» по 50; если YouTrack его не понял — по одной. */
export async function issuesByKeys(f: Fetcher, ytUrl: string, list: string[], o: { signal?: Signal; onProgress?: (n: number) => void } = {}): Promise<Issue[]> {
  const out: Issue[] = [];
  for (let i = 0; i < list.length; i += 50) {
    check(o.signal);
    const chunk = list.slice(i, i + 50);
    try {
      const page: any[] = await getJson(f, '/api/issues?' + qs({ query: 'issue id: ' + chunk.join(', '), fields: ISSUE_FIELDS, $top: chunk.length }));
      out.push(...page.map((r) => normalizeIssue(r, ytUrl)));
    } catch (e) {
      if (!isParseError(e)) throw e;
      for (const k of chunk) {
        check(o.signal);
        out.push(normalizeIssue(await getJson(f, `/api/issues/${encodeURIComponent(k)}?` + qs({ fields: ISSUE_FIELDS })), ytUrl));
      }
    }
    o.onProgress?.(out.length);
  }
  return out;
}

export const rolesLabel = (roles: string[]) => roles.map((r) => ROLE_NAMES[r as Role] || r).join(', ');
