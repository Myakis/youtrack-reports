// Запросы к REST API YouTrack. Сам fetch подставляется снаружи: из расширения (сессия или токен) или тестовые данные.
import { uniqSorted } from './suggest';
import type { Flow } from './flow';

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

export interface Project { key: string; name: string; id?: string }

export async function listProjects(f: Fetcher): Promise<Project[]> {
  const ps: any[] = await getJson(f, '/api/admin/projects?' + qs({ fields: 'id,shortName,name,archived', $top: 1000 }));
  return ps.filter((p) => !p.archived).map((p) => ({ key: p.shortName, name: p.name, id: p.id })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Теги, видимые текущему пользователю (общие и свои), без повторов, по алфавиту. */
export async function listTags(f: Fetcher): Promise<string[]> {
  const out: string[] = [];
  for (let skip = 0; skip < 20000;) {
    const page: any[] = await getJson(f, '/api/tags?' + qs({ fields: 'name', $top: 500, $skip: skip }));
    if (!page.length) break;
    skip += page.length;
    for (const t of page) if (t?.name) out.push(t.name);
  }
  return uniqSorted(out);
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
const TYPE_NAMES = ['type', 'тип'];

/**
 * Типы задач проектов: значения поля «Тип» из настроек проекта (полный список, без архивных);
 * если настройки не прочитать — типы последних 300 задач этих проектов (без проектов — всего YouTrack), по частоте.
 * from — откуда список: 'project' — из настроек, 'issues' — по задачам.
 */
export async function knownTypes(f: Fetcher, projects: Project[]): Promise<{ types: string[]; from: 'project' | 'issues' }> {
  const out = new Set<string>();
  let ok = projects.length > 0;
  for (const p of projects) {
    if (!p.id) { ok = false; break; }
    try {
      const cfs: any[] = await getJson(f, `/api/admin/projects/${encodeURIComponent(p.id)}/customFields?` + qs({
        fields: 'field(name),bundle(values(name,archived))', $top: 200,
      }));
      const cf = cfs.find((c) => TYPE_NAMES.includes(String(c?.field?.name || '').trim().toLowerCase()));
      const vals = (cf?.bundle?.values || []).filter((v: any) => v?.name && !v.archived).map((v: any) => v.name as string);
      if (!vals.length) { ok = false; break; }
      vals.forEach((v: string) => out.add(v));
    } catch (e) {
      if ((e as YtError).kind === 'network') throw e;
      ok = false;
      break;
    }
  }
  if (ok) return { types: [...out], from: 'project' };
  const query = projects.length ? `project: ${projects.map((p) => br(p.key)).join(', ')}` : '';
  const list: any[] = await getJson(f, '/api/issues?' + qs({ query, fields: 'customFields(name,value(name))', $top: 300 }));
  const seen = new Map<string, number>();
  for (const i of list) {
    for (const cf of i.customFields || []) {
      if (!TYPE_NAMES.includes(String(cf.name).trim().toLowerCase())) continue;
      const v = cf.value?.name;
      if (v) seen.set(v, (seen.get(v) || 0) + 1);
    }
  }
  return { types: [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v), from: 'issues' };
}

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
  swimlanes: string[];    // свимлейн на доске: «Algeria (PRJ-5270)» или значение поля; на нескольких досках — «Доска / …»
  parents: string[];      // ключи родительских задач («подзадача для»)
  spent: number | null;   // минуты по записям учёта времени (сотрудника или всех); null — не загружали
  stateField: string;     // как называется поле статуса у задачи («Состояние», «State»…)
  flow: Flow | null;      // путь по статусам; null — не загружали
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

export const STATE_NAMES = ['state', 'состояние', 'статус', 'status'];
export const ASSIGNEE_NAMES = ['assignee', 'исполнитель'];

/** Связь «подзадача для»: у дочерней задачи связь типа Subtask входящая. */
function isParentLink(l: any): boolean {
  const t = l.linkType || {};
  const subtask = String(t.name || '').toLowerCase() === 'subtask' || /subtask of|подзадача/i.test(String(t.targetToSource || ''));
  return subtask && l.direction === 'INWARD';
}

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
  let state = '', assignee = '', stateField = '';
  for (const cf of raw.customFields || []) {
    const val = fieldValue(cf.$type || '', cf.value);
    fields[cf.name] = val;
    const n = String(cf.name).toLowerCase();
    if (!state && (STATE_NAMES.includes(n) || cf.$type === 'StateIssueCustomField')) { state = val; stateField = cf.name; }
    if (!assignee && ASSIGNEE_NAMES.includes(n)) assignee = val;
  }
  const links: Link[] = [];
  const parents: string[] = [];
  for (const l of raw.links || []) {
    const keys = (l.issues || []).map((i: any) => i.idReadable).filter(Boolean);
    if (!keys.length) continue;
    const t = l.linkType || {};
    if (isParentLink(l)) parents.push(...keys);
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
    swimlanes: [],
    parents,
    spent: null,
    stateField,
    flow: null,
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

/**
 * Свимлейны доски: by 'issue' — строки доски это задачи (карточки — их подзадачи), field/values — какие задачи
 * становятся строками (например, Тип = Эпик); by 'field' — строки это значения поля field.
 */
export interface Swimlanes { by: 'issue' | 'field'; field: string; values: string[] }
export interface Board { id: string; name: string; projects: string[]; noSprints: boolean; sprints: { id: string; name: string }[]; swimlanes?: Swimlanes | null }

export function parseSwimlanes(s: any): Swimlanes | null {
  if (!s || s.enabled === false) return null;
  const field = s.field?.customField?.name || s.field?.name || s.field?.presentation || '';
  const values = (s.values || []).map((v: any) => v?.name || v?.presentation).filter(Boolean);
  if (/IssueBased/.test(s.$type || '')) return { by: 'issue', field, values };
  if (/AttributeBased/.test(s.$type || '') && field) return { by: 'field', field, values };
  return null;
}

export async function listBoards(f: Fetcher): Promise<Board[]> {
  const as: any[] = await getJson(f, '/api/agiles?' + qs({
    fields: 'id,name,projects(shortName),sprintsSettings(disableSprints),sprints(id,name),'
      + 'swimlaneSettings($type,enabled,field(name,presentation,customField(name)),values(name,presentation))',
    $top: 1000,
  }));
  return as.map((a) => ({
    id: a.id,
    name: a.name,
    projects: (a.projects || []).map((p: any) => p.shortName),
    noSprints: !!a.sprintsSettings?.disableSprints,
    sprints: (a.sprints || []).map((s: any) => ({ id: s.id, name: s.name })),
    swimlanes: parseSwimlanes(a.swimlaneSettings),
  }));
}

/** Найти доску по названию (без учёта регистра). */
export function findBoard(boards: Board[], name: string): Board | null {
  const n = name.trim().toLowerCase();
  return n ? boards.find((b) => b.name.toLowerCase() === n) ?? null : null;
}

/** Есть ли у доски спринты, между которыми стоит выбирать. */
export const hasSprints = (b: Board) => !b.noSprints && b.sprints.length > 1;

/**
 * Ключи задач на доске: все спринты или один. У задачи в REST нет поля «доска», поэтому — через спринты
 * (у доски без спринтов он один, скрытый).
 */
export async function boardIssueKeys(f: Fetcher, board: Board, sprintId = '', opts: { signal?: Signal; onProgress?: (done: number, total: number) => void } = {}): Promise<Set<string>> {
  const sprints = sprintId ? board.sprints.filter((s) => s.id === sprintId) : board.sprints;
  const keys = new Set<string>();
  let done = 0;
  await pool(sprints, 4, async (s) => {
    if (opts.signal?.cancelled) return;
    const sp = await getJson(f, `/api/agiles/${board.id}/sprints/${s.id}?` + qs({ fields: 'issues(idReadable)' }));
    for (const it of sp.issues || []) if (it?.idReadable) keys.add(it.idReadable);
    opts.onProgress?.(++done, sprints.length);
  });
  return keys;
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
 * Возвращает, на каких досках лежит каждая задача, — для свимлейнов.
 */
export async function attachBoards(f: Fetcher, issues: Issue[], opts: { signal?: Signal; onProgress?: (done: number, total: number) => void } = {}): Promise<Map<string, Board[]>> {
  const onBoard = new Map<string, Board[]>();
  if (!issues.length) return onBoard;
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
        if (!issue) continue;
        if (!issue.boards.includes(label)) issue.boards.push(label);
        const list = onBoard.get(issue.key) ?? onBoard.set(issue.key, []).get(issue.key)!;
        if (!list.includes(b)) list.push(b);
      }
    } catch (e) {
      if ((e as YtError).kind === 'auth' && (e as YtError).status !== 403) throw e;
      // Нет доступа к отдельной доске — пропускаем её
    }
    opts.onProgress?.(++done, jobs.length);
  });
  return onBoard;
}

/** Ключи → краткие задачи (название и поля), запросом «issue id: …» по 50. Недоступные пропускаются. */
async function briefIssues(f: Fetcher, keys: string[], signal?: Signal): Promise<Map<string, { summary: string; fields: Record<string, string> }>> {
  const out = new Map<string, { summary: string; fields: Record<string, string> }>();
  for (let i = 0; i < keys.length; i += 50) {
    if (signal?.cancelled) throw new YtError('Отменено');
    const chunk = keys.slice(i, i + 50);
    let page: any[] = [];
    try {
      page = await getJson(f, '/api/issues?' + qs({ query: 'issue id: ' + chunk.join(', '), fields: 'idReadable,summary,customFields(name,$type,value(name,login,fullName,presentation))', $top: chunk.length }));
    } catch (e) {
      if (!isParseError(e)) throw e;   // какой-то ключ YouTrack не знает — без названий для этой пачки
    }
    for (const r of page) {
      const fields: Record<string, string> = {};
      for (const cf of r.customFields || []) fields[cf.name] = fieldValue(cf.$type || '', cf.value);
      out.set(r.idReadable, { summary: r.summary || '', fields });
    }
  }
  return out;
}

/** Совпадает ли значение поля с одним из values (без учёта регистра); пустой values — любое. */
const matches = (value: string, values: string[]) => !values.length || values.some((v) => v.toLowerCase() === value.trim().toLowerCase());

/**
 * Проставить задачам свимлейны досок, на которых они лежат (onBoard — из attachBoards).
 * Свимлейны по задачам: строка — родительская задача («подзадача для»), подходящая под настройку доски.
 * Свимлейны по полю: строка — значение этого поля у задачи.
 */
export async function attachSwimlanes(f: Fetcher, issues: Issue[], onBoard: Map<string, Board[]>, opts: { signal?: Signal } = {}) {
  const lanesOf = (i: Issue) => (onBoard.get(i.key) || []).filter((b) => b.swimlanes);
  const parentKeys = [...new Set(issues.flatMap((i) => (lanesOf(i).some((b) => b.swimlanes!.by === 'issue') ? i.parents : [])))];
  const parents = parentKeys.length ? await briefIssues(f, parentKeys, opts.signal) : new Map();
  for (const i of issues) {
    const boards = lanesOf(i);
    const out: string[] = [];
    for (const b of boards) {
      const s = b.swimlanes!;
      let lane = '';
      if (s.by === 'issue') {
        const key = i.parents.find((k) => {
          const p = parents.get(k);
          // Строкой становится не любая родительская задача, а подходящая под настройку (например, Тип = Эпик)
          return p && (!s.field || !(s.field in p.fields) || matches(p.fields[s.field], s.values));
        });
        if (key) lane = `${parents.get(key)!.summary || key} (${key})`;
      } else {
        const v = i.fields[s.field] || '';
        if (v && matches(v, s.values)) lane = v;
      }
      if (lane) out.push(boards.length > 1 ? `${b.name} / ${lane}` : lane);
    }
    i.swimlanes = [...new Set(out)];
  }
}
