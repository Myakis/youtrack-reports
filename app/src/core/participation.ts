// Поиск по участию: задачи фильтра, где сотрудник исполнитель сейчас или был им раньше (по истории поля «Исполнитель»);
// по желанию — ещё где менял задачу или комментировал. История читается одним потоком по всему фильтру
// (/api/activities?issueQuery=…); если YouTrack так не умеет — у каждой задачи отдельно, как в скрипте YoutrackReportByUser.
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
  maxIssues?: number;       // по одной задаче: у скольких задач фильтра читать историю (по умолчанию 3 000)
  stop?: { requested: boolean };   // «Показать найденное»: остановиться и вернуть то, что уже проверено
  /** auto — поток по всему фильтру, при неудаче — по одной задаче; perIssue — сразу по одной. */
  mode?: 'auto' | 'perIssue';
  /**
   * Только эти задачи (например, задачи доски): историю читаем лишь у них. Если их в фильтре не больше maxIssues —
   * по одной задаче (так быстрее, чем поток по всему фильтру, где большинство записей пришлось бы выбросить).
   */
  only?: Set<string>;
}

/** Поток: сколько задач фильтра учитываем и сколько записей истории читаем за запрос. */
export const STREAM_MAX_ISSUES = 50000;
const STREAM_PAGE = 500;
/** Предохранитель от бесконечного чтения: 2 млн записей истории. */
const STREAM_MAX_PAGES = 4000;

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
 * История полей всех задач фильтра одним потоком: GET /api/activities?issueQuery=… страницами.
 * Учитываются только записи задач из inFilter — на случай, если сервер проигнорирует issueQuery.
 * null — YouTrack так не умеет (ошибка запроса или в ответе чужие задачи): тогда читаем по одной задаче.
 */
async function streamHistory(f: Fetcher, base: string, inFilter: Set<string>, onAct: (key: string, act: any) => void,
  o: ParticipationOptions): Promise<{ scanned: number; stopped: boolean; truncated: boolean } | null> {
  let scanned = 0, pages = 0;
  for (;;) {
    check(o.signal);
    if (o.stop?.requested) return { scanned, stopped: true, truncated: false };
    if (pages >= STREAM_MAX_PAGES) return { scanned, stopped: false, truncated: true };
    let page: any[];
    try {
      page = await getJson(f, '/api/activities?' + qs({
        categories: 'CustomFieldCategory', issueQuery: base,
        fields: 'target(idReadable),author(login),field(name),added(login),removed(login)', $top: STREAM_PAGE, $skip: scanned,
      }));
    } catch (e) {
      // Первая страница не получилась — у этого YouTrack нет такого способа; дальше — настоящая ошибка
      if (!pages && e instanceof YtError && e.kind === 'http') return null;
      throw e;
    }
    if (!Array.isArray(page)) return pages ? { scanned, stopped: false, truncated: false } : null;
    if (!page.length) return { scanned, stopped: false, truncated: false };
    // Сервер не понял issueQuery и отдаёт историю всего YouTrack — не годится
    if (!pages && !page.some((a) => inFilter.has(a?.target?.idReadable))) return null;
    for (const a of page) {
      const key = a?.target?.idReadable;
      if (key && inFilter.has(key)) onAct(key, a);
    }
    scanned += page.length;
    pages++;
    o.onProgress?.(`История изменений фильтра: ${n(scanned)} записей…`, 0.1 + 0.6 * (1 - 1 / (1 + pages / 8)));
  }
}

/**
 * Задачи фильтра base (без условия на исполнителя), в которых участвовал login, — с ролями.
 * История — одним потоком по фильтру (до STREAM_MAX_ISSUES задач), а если YouTrack так не умеет — как в скрипте
 * YoutrackReportByUser: у каждой задачи отдельно, у первых maxIssues (3 000).
 * Результат: ключ задачи → роли; `all` — задач в фильтре (до limit + 1), `checked` — у скольких проверена история,
 * `limit` — сколько задач фильтра учитывается, `truncated` — в фильтре больше, `stopped` — остановили кнопкой
 * «Показать найденное», `mode` — как читали историю, `scanned` — записей истории в потоке.
 */
export async function findParticipation(f: Fetcher, base: string, login: string, o: ParticipationOptions = {}) {
  const stream = (o.mode ?? 'auto') === 'auto';
  const maxIssues = o.maxIssues ?? 3000;
  const keyLimit = stream ? STREAM_MAX_ISSUES : maxIssues;
  const found = new Map<string, Set<Role>>();
  const add = (key: string, r: Role) => { if (key) (found.get(key) ?? found.set(key, new Set()).get(key)!).add(r); };
  const withBase = (cond: string) => (base.trim() ? `${cond} ${base}` : cond);

  o.onProgress?.('Задачи, где сотрудник — исполнитель…', 0.05);
  for (const k of await keys(f, withBase(`${o.assigneeAttr || 'assignee'}: ${br(login)}`), keyLimit, o.signal)) add(k, 'assignee');
  if (o.wide) {
    o.onProgress?.('Задачи с его комментариями…', 0.08);
    for (const k of await keys(f, withBase(`commenter: ${br(login)}`), keyLimit, o.signal)) add(k, 'commented');
  }

  o.onProgress?.('Задачи фильтра…', 0.1);
  let all = await keys(f, base, o.only ? STREAM_MAX_ISSUES + 1 : keyLimit + 1, o.signal);
  // Только задачи доски: их обычно немного — читаем историю у каждой, а не поток по всему фильтру
  const narrow = !!o.only && all.filter((k) => o.only!.has(k)).length <= maxIssues;
  if (o.only) all = all.filter((k) => o.only!.has(k));
  const onAct = (key: string, act: any) => {
    const r = scanActivities([act], login);
    if (r.wasAssignee) add(key, 'wasAssignee');
    if (o.wide && r.changed) add(key, 'changed');
  };

  if (stream && !narrow) {
    const inFilter = new Set(all.slice(0, STREAM_MAX_ISSUES));
    const r = await streamHistory(f, base, inFilter, onAct, o);
    if (r) {
      return {
        roles: rolesOf(found), all: all.length, checked: r.stopped ? 0 : inFilter.size, limit: STREAM_MAX_ISSUES,
        truncated: all.length > STREAM_MAX_ISSUES || r.truncated, stopped: r.stopped, mode: 'stream' as const, scanned: r.scanned,
      };
    }
    o.onProgress?.('Читаю историю по задачам…', 0.1);
  }

  // По одной задаче — как в скрипте
  const truncated = all.length > maxIssues;
  const list = all.slice(0, maxIssues);
  let done = 0, stopped = false;
  await pool(list, 6, async (key) => {
    if (o.stop?.requested) { stopped = true; return; }
    for (const act of await issueActivities(f, key, o.signal)) onAct(key, act);
    done++;
    if (done % 5 === 0 || done === list.length) o.onProgress?.(`История задач: ${n(done)} из ${n(list.length)}`, 0.1 + 0.6 * done / list.length);
  });
  return {
    roles: rolesOf(found), all: Math.min(all.length, maxIssues + 1), checked: done, limit: maxIssues,
    truncated, stopped, mode: 'perIssue' as const, scanned: 0,
  };
}

function rolesOf(found: Map<string, Set<Role>>): Map<string, Role[]> {
  const roles = new Map<string, Role[]>();
  for (const [k, rs] of found) {
    // «был исполнителем» при «исполнитель сейчас» — лишнее
    if (rs.has('assignee')) rs.delete('wasAssignee');
    roles.set(k, ROLE_ORDER.filter((r) => rs.has(r)));
  }
  return roles;
}

/** Задачи по ключам: запросом «issue id: A, B, …» по 50; если YouTrack его не понял — по одной. */
/** Задачи по ключам; query — ещё условия поверх (статус, период…): тогда вернутся только подходящие. */
export async function issuesByKeys(f: Fetcher, ytUrl: string, list: string[], o: { signal?: Signal; onProgress?: (n: number) => void; query?: string } = {}): Promise<Issue[]> {
  const extra = o.query?.trim() ? ' ' + o.query.trim() : '';
  const out: Issue[] = [];
  for (let i = 0; i < list.length; i += 50) {
    check(o.signal);
    const chunk = list.slice(i, i + 50);
    try {
      const page: any[] = await getJson(f, '/api/issues?' + qs({ query: 'issue id: ' + chunk.join(', ') + extra, fields: ISSUE_FIELDS, $top: chunk.length }));
      out.push(...page.map((r) => normalizeIssue(r, ytUrl)));
    } catch (e) {
      // Без доп. условий можно загрузить по одной; с ними — ошибка в самом запросе, пусть её покажут
      if (!isParseError(e) || extra) throw e;
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
