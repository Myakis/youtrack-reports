// Запросы к REST API YouTrack. Сам fetch подставляется снаружи: из расширения (сессия или токен) или тестовые данные.

export interface RawResponse {
  status: number;
  type: string;   // 'basic' | 'opaqueredirect' | 'error' | ...
  text: string;
  error?: string;
}
export type Fetcher = (path: string) => Promise<RawResponse>;

export class YtError extends Error {
  constructor(message: string, public kind: 'auth' | 'http' | 'network' | 'server' = 'server', public status = 0) {
    super(message);
  }
}

/** Отмена долгой загрузки. */
export interface Signal { cancelled: boolean }

function reason(text: string): string {
  try {
    const j = JSON.parse(text);
    return j.error_description || j.error || j.message || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

export async function getJson<T = any>(f: Fetcher, path: string): Promise<T> {
  const r = await f(path);
  if (r.type === 'error') throw new YtError(r.error || 'Сеть недоступна', 'network');
  if (r.type === 'opaqueredirect' || r.status === 0 || r.status === 302 || r.status === 401) {
    throw new YtError('Нет входа в YouTrack (сессия истекла или не начата).', 'auth', r.status);
  }
  if (r.status === 403) throw new YtError('YouTrack: нет прав на этот запрос.', 'auth', 403);
  if (r.status !== 200) throw new YtError(`HTTP ${r.status}: ${reason(r.text)}`, 'http', r.status);
  try {
    return JSON.parse(r.text) as T;
  } catch {
    // Вместо JSON пришла страница входа — тоже «нет входа»
    throw new YtError('YouTrack ответил не JSON — похоже, нужен вход.', 'auth', r.status);
  }
}

export const qs = (p: Record<string, string | number>) =>
  Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

// ---------- Пользователи и проекты ----------

export interface User { login: string; name: string; email?: string }

export async function me(f: Fetcher): Promise<User> {
  const u = await getJson(f, '/api/users/me?' + qs({ fields: 'login,fullName,email' }));
  return { login: u.login, name: u.fullName || u.login, email: u.email || undefined };
}

/** Все пользователи (без заблокированных), по имени. */
export async function listUsers(f: Fetcher): Promise<User[]> {
  const out: User[] = [];
  // До пустой страницы: сервер может отдать меньше, чем просили
  for (let skip = 0; skip < 20000;) {
    const page: any[] = await getJson(f, '/api/users?' + qs({ fields: 'login,fullName,email,banned', $top: 500, $skip: skip }));
    if (!page.length) break;
    skip += page.length;
    for (const u of page) if (!u.banned && u.login) out.push({ login: u.login, name: u.fullName || u.login, email: u.email || undefined });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export interface Project { key: string; name: string }

export async function listProjects(f: Fetcher): Promise<Project[]> {
  const ps: any[] = await getJson(f, '/api/admin/projects?' + qs({ fields: 'shortName,name,archived', $top: 1000 }));
  return ps.filter((p) => !p.archived).map((p) => ({ key: p.shortName, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// ---------- Запрос ----------

export type DateField = 'resolved' | 'updated' | 'created';
const DATE_ATTR: Record<DateField, string> = { resolved: 'resolved date', updated: 'updated', created: 'created' };

export interface QueryOptions {
  assignee: string;   // логин
  states: string;     // «Готово» или несколько через запятую
  types?: string;     // «Frontend, Mobile»
  tags?: string;      // «CashDash»
  project?: string;   // короткое имя проекта
  dateField?: DateField;
  from?: string;      // YYYY-MM-DD
  to?: string;
  extra?: string;     // произвольный хвост запроса
  assigneeAttr?: string;  // как искать исполнителя: «assignee» (по умолчанию, как в самом YouTrack), «for» или «Исполнитель»
}

/** Варианты условия на исполнителя; «assignee:» — так ищет сам YouTrack при фильтре «Исполнитель». */
export const ASSIGNEE_ATTRS = ['assignee', 'for', 'Исполнитель'];

/** Значение в фигурных скобках — так YouTrack понимает пробелы и кириллицу. */
export const br = (v: string) => `{${v.trim().replace(/[{}]/g, '')}}`;

export interface QueryPart { what: 'project' | 'assignee' | 'state' | 'type' | 'tag' | 'period' | 'extra'; text: string }

/** «a, b» → «{a}, {b}»: несколько значений через запятую YouTrack понимает как «или». */
const values = (s: string | undefined) => (s || '').split(',').map((v) => v.trim()).filter(Boolean).map(br).join(', ');

/**
 * Части запроса на языке поиска YouTrack — как в скрипте YoutrackReportByUser: «state: {Ревью}, {Готово}»,
 * «type: …», «tag: …». Сортировки в запросе нет — таблица сортирует сама.
 */
export function queryParts(o: QueryOptions): QueryPart[] {
  const parts: QueryPart[] = [];
  if (o.project?.trim()) parts.push({ what: 'project', text: `project: ${br(o.project)}` });
  if (o.assignee.trim()) parts.push({ what: 'assignee', text: `${o.assigneeAttr || 'assignee'}: ${br(o.assignee)}` });
  if (values(o.states)) parts.push({ what: 'state', text: `state: ${values(o.states)}` });
  if (values(o.types)) parts.push({ what: 'type', text: `type: ${values(o.types)}` });
  if (values(o.tags)) parts.push({ what: 'tag', text: `tag: ${values(o.tags)}` });
  if (o.from || o.to) parts.push({ what: 'period', text: `${DATE_ATTR[o.dateField || 'resolved']}: ${o.from || '*'} .. ${o.to || '*'}` });
  if (o.extra?.trim()) parts.push({ what: 'extra', text: o.extra.trim() });
  return parts;
}

export const buildQuery = (o: QueryOptions) => queryParts(o).map((p) => p.text).join(' ');

/** Запрос без условия на исполнителя — фильтр задач для поиска по участию. */
export const baseQuery = (o: QueryOptions) => queryParts(o).filter((p) => p.what !== 'assignee').map((p) => p.text).join(' ');

/** YouTrack не понял запрос (HTTP 400 «Can't parse search query»). */
export const isParseError = (e: unknown) => e instanceof YtError && e.status === 400;

/** Какие части запроса YouTrack не понимает: каждая проверяется отдельным запросом на 1 задачу. */
export async function badParts(f: Fetcher, parts: QueryPart[]): Promise<QueryPart[]> {
  const bad: QueryPart[] = [];
  for (const p of parts) {
    try {
      await getJson(f, '/api/issues?' + qs({ query: p.text, fields: 'idReadable', $top: 1 }));
    } catch (e) {
      if (isParseError(e)) bad.push(p);
      else throw e;
    }
  }
  return bad;
}

/** Сколько задач находит запрос (до 100); YouTrack не понял запрос — -1. */
export async function countQuery(f: Fetcher, query: string): Promise<number> {
  try {
    return (await getJson<any[]>(f, '/api/issues?' + qs({ query, fields: 'idReadable', $top: 100 }))).length;
  } catch (e) {
    if (isParseError(e)) return -1;
    throw e;
  }
}

const join = (parts: QueryPart[]) => parts.map((p) => p.text).join(' ');

/** Ничего не нашлось: сколько задач находится, если убрать каждое условие по очереди. */
export async function dropEach(f: Fetcher, parts: QueryPart[]): Promise<{ part: QueryPart; found: number }[]> {
  const out: { part: QueryPart; found: number }[] = [];
  for (const part of parts) out.push({ part, found: await countQuery(f, join(parts.filter((p) => p !== part))) });
  return out;
}

/** Найти вариант условия на исполнителя, с которым запрос что-то находит; null — ни с одним. */
export async function findAssigneeAttr(f: Fetcher, o: QueryOptions): Promise<{ attr: string; found: number } | null> {
  for (const attr of ASSIGNEE_ATTRS) {
    if (attr === (o.assigneeAttr || 'assignee')) continue;
    const found = await countQuery(f, buildQuery({ ...o, assigneeAttr: attr }));
    if (found > 0) return { attr, found };
  }
  return null;
}

/**
 * По дате решения ничего не нашлось — а без периода? Задачи в «нерешённом» состоянии (по настройке YouTrack)
 * даты решения не имеют, и условие «resolved date» их отсекает. Возвращает, сколько задач без периода (до 100)
 * и есть ли среди них хоть одна с датой решения.
 */
export async function withoutPeriod(f: Fetcher, parts: QueryPart[]): Promise<{ found: number; anyResolved: boolean }> {
  const query = parts.filter((p) => p.what !== 'period').map((p) => p.text).join(' ');
  const list: any[] = await getJson(f, '/api/issues?' + qs({ query, fields: 'resolved', $top: 100 }));
  return { found: list.length, anyResolved: list.some((i) => i.resolved) };
}

/** Значения поля статуса, которые встречаются у задач (проекта): подсказка, как статус называется на самом деле. */
export async function knownStates(f: Fetcher, project?: string): Promise<string[]> {
  const query = project?.trim() ? `project: ${br(project)}` : '';
  const list: any[] = await getJson(f, '/api/issues?' + qs({ query, fields: 'customFields(name,$type,value(name))', $top: 300 }));
  const seen = new Map<string, number>();
  for (const i of list) {
    for (const cf of i.customFields || []) {
      if (cf.$type !== 'StateIssueCustomField' && !STATE_NAMES.includes(String(cf.name).toLowerCase())) continue;
      const v = cf.value?.name;
      if (v) seen.set(v, (seen.get(v) || 0) + 1);
    }
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

// ---------- Задачи ----------

export interface Comment { author: string; login: string; created: number; text: string }
export interface Link { type: string; keys: string[] }
export interface Issue {
  key: string;            // PRJ-123
  url: string;
  summary: string;
  description: string;
  project: string;
  projectKey: string;
  tags: string[];
  boards: string[];       // «Доска» или «Доска / Спринт»
  state: string;
  assignee: string;
  reporter: string;
  created: number;
  updated: number;
  resolved: number | null;
  fields: Record<string, string>;   // все поля задачи: Тип, Приоритет, Оценка…
  comments: Comment[];
  links: Link[];
  roles: string[];         // как сотрудник участвовал в задаче (поиск по участию)
}

export const ISSUE_FIELDS = [
  'idReadable,summary,description,created,updated,resolved',
  'reporter(login,fullName)',
  'project(name,shortName)',
  'tags(name)',
  'customFields(name,$type,value(name,login,fullName,text,presentation,minutes))',
  'comments(text,created,deleted,author(login,fullName))',
  'links(direction,linkType(name,sourceToTarget,targetToSource),issues(idReadable))',
].join(',');

const STATE_NAMES = ['state', 'состояние', 'статус', 'status'];
export const ASSIGNEE_NAMES = ['assignee', 'исполнитель'];

/** Значение поля задачи строкой. */
export function fieldValue(type: string, v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => fieldValue(type, x)).filter(Boolean).join(', ');
  if (typeof v === 'number') return /Date/.test(type) ? fmtDate(v, /DateTime/.test(type)) : String(v);
  if (typeof v !== 'object') return String(v);
  return v.fullName || v.name || v.presentation || v.text || v.login || '';
}

export function fmtDate(ms: number | null | undefined, time = true): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  const s = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  return time ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
}

export function normalizeIssue(raw: any, base: string): Issue {
  const fields: Record<string, string> = {};
  let state = '', assignee = '';
  for (const cf of raw.customFields || []) {
    const val = fieldValue(cf.$type || '', cf.value);
    fields[cf.name] = val;
    const n = String(cf.name).toLowerCase();
    if (!state && (STATE_NAMES.includes(n) || cf.$type === 'StateIssueCustomField')) state = val;
    if (!assignee && ASSIGNEE_NAMES.includes(n)) assignee = val;
  }
  const links: Link[] = [];
  for (const l of raw.links || []) {
    const keys = (l.issues || []).map((i: any) => i.idReadable).filter(Boolean);
    if (!keys.length) continue;
    const t = l.linkType || {};
    links.push({ type: (l.direction === 'INWARD' ? t.targetToSource : t.sourceToTarget) || t.name || 'связана', keys });
  }
  return {
    key: raw.idReadable,
    url: `${base}/issue/${raw.idReadable}`,
    summary: raw.summary || '',
    description: raw.description || '',
    project: raw.project?.name || '',
    projectKey: raw.project?.shortName || '',
    tags: (raw.tags || []).map((t: any) => t.name),
    boards: [],
    state,
    assignee,
    reporter: raw.reporter?.fullName || raw.reporter?.login || '',
    created: raw.created || 0,
    updated: raw.updated || 0,
    resolved: raw.resolved || null,
    fields,
    comments: (raw.comments || [])
      .filter((c: any) => !c.deleted)
      .map((c: any) => ({ author: c.author?.fullName || c.author?.login || '?', login: c.author?.login || '', created: c.created || 0, text: c.text || '' }))
      .sort((a: Comment, b: Comment) => a.created - b.created),
    links,
    roles: [],
  };
}

/** Все задачи по запросу, страницами по 100. */
export async function searchIssues(
  f: Fetcher, base: string, query: string,
  opts: { limit?: number; signal?: Signal; onProgress?: (n: number) => void } = {},
): Promise<Issue[]> {
  const limit = opts.limit ?? 5000;
  const out: Issue[] = [];
  const PAGE = 100;
  // До пустой страницы: сервер может отдать меньше, чем просили (бывает ~42), — это ещё не конец
  while (out.length < limit) {
    if (opts.signal?.cancelled) throw new YtError('Отменено');
    const top = Math.min(PAGE, limit - out.length);
    const page: any[] = await getJson(f, '/api/issues?' + qs({ query, fields: ISSUE_FIELDS, $top: top, $skip: out.length }));
    if (!page.length) break;
    for (const r of page.slice(0, top)) out.push(normalizeIssue(r, base));
    opts.onProgress?.(out.length);
  }
  return out;
}

// ---------- Доски ----------

export interface Board { id: string; name: string; projects: string[]; noSprints: boolean; sprints: { id: string; name: string }[] }

export async function listBoards(f: Fetcher): Promise<Board[]> {
  const as: any[] = await getJson(f, '/api/agiles?' + qs({ fields: 'id,name,projects(shortName),sprintsSettings(disableSprints),sprints(id,name)', $top: 1000 }));
  return as.map((a) => ({
    id: a.id,
    name: a.name,
    projects: (a.projects || []).map((p: any) => p.shortName),
    noSprints: !!a.sprintsSettings?.disableSprints,
    sprints: (a.sprints || []).map((s: any) => ({ id: s.id, name: s.name })),
  }));
}

/** Выполнить задачи не больше n одновременно. */
async function pool<T>(items: T[], n: number, run: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await run(items[i++]);
  }));
}

/**
 * Проставить задачам доски: у задачи в REST нет поля «доска», поэтому берём доски проектов этих задач
 * и смотрим, какие задачи лежат в их спринтах. Доска без спринтов — просто «Доска».
 */
export async function attachBoards(f: Fetcher, issues: Issue[], opts: { signal?: Signal; onProgress?: (done: number, total: number) => void } = {}) {
  if (!issues.length) return;
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const projects = new Set(issues.map((i) => i.projectKey));
  const boards = (await listBoards(f)).filter((b) => b.projects.some((p) => projects.has(p)));
  const jobs = boards.flatMap((b) => b.sprints.map((s) => ({ b, s })));
  let done = 0;
  await pool(jobs, 4, async ({ b, s }) => {
    if (opts.signal?.cancelled) return;
    try {
      const sp = await getJson(f, `/api/agiles/${b.id}/sprints/${s.id}?` + qs({ fields: 'issues(idReadable)' }));
      const label = b.noSprints || b.sprints.length < 2 ? b.name : `${b.name} / ${s.name}`;
      for (const it of sp.issues || []) {
        const issue = byKey.get(it.idReadable);
        if (issue && !issue.boards.includes(label)) issue.boards.push(label);
      }
    } catch (e) {
      if ((e as YtError).kind === 'auth' && (e as YtError).status !== 403) throw e;
      // Нет доступа к отдельной доске — пропускаем её
    }
    opts.onProgress?.(++done, jobs.length);
  });
}
