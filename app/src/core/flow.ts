// Путь задачи по статусам: по истории поля «Состояние» — в каких статусах задача была, сколько в каждом
// и сколько раз возвращалась назад. История — у каждой задачи отдельно (/api/issues/{id}/activities),
// по 8 одновременно: общий /api/activities?issueQuery=… на больших YouTrack отвечает очень медленно.
import { getJson, qs, STATE_NAMES, YtError, type Fetcher, type Issue, type Signal } from './youtrack';

export interface Step {
  state: string;
  from: number;
  /** Конец этапа; null — задача сейчас в этом статусе. */
  to: number | null;
}

export interface Flow {
  steps: Step[];
  /** Сколько раз задача уходила в статус, где уже была (например, из ревью обратно в работу). */
  returns: number;
}

/** Смена статуса: когда, из какого, в какой. */
export interface StateChange { at: number; from: string; to: string }

const DAY = 86400000;
const PAGE = 200;
const FIELDS = 'timestamp,field(name),added(name),removed(name)';

const check = (s?: Signal) => { if (s?.cancelled) throw new YtError('Отменено'); };
const nameOf = (v: any): string => (Array.isArray(v) ? v[0]?.name : v?.name) || '';

/** Путь по сменам статуса. Начальный статус — «откуда» первой смены, без смен — текущий. */
export function buildFlow(created: number, current: string, changes: StateChange[]): Flow {
  const sorted = [...changes].sort((a, b) => a.at - b.at);
  const steps: Step[] = [];
  const first = sorted[0]?.from || (sorted.length ? '' : current);
  if (first) steps.push({ state: first, from: created, to: null });
  const seen = new Set(first ? [first] : []);
  let returns = 0;
  for (const c of sorted) {
    if (!c.to) continue;
    const last = steps[steps.length - 1];
    if (last) last.to = Math.max(c.at, last.from);
    if (seen.has(c.to)) returns++;
    seen.add(c.to);
    steps.push({ state: c.to, from: c.at, to: null });
  }
  return { steps, returns };
}

/**
 * Время в каждом статусе (мс), суммарно за все заходы. Последний этап решённой задачи (Готово) не считается —
 * он не кончается; у нерешённой — считается до now: задача всё ещё там.
 */
export function stateDurations(flow: Flow, resolved: boolean, now = Date.now()): Map<string, number> {
  const out = new Map<string, number>();
  flow.steps.forEach((s, i) => {
    const last = i === flow.steps.length - 1;
    if (last && resolved) return;
    const end = s.to ?? now;
    out.set(s.state, (out.get(s.state) || 0) + Math.max(0, end - s.from));
  });
  return out;
}

/** 3 600 000 → «1 ч», 2,5 суток → «2,5 дн.», меньше часа → «<1 ч». */
export function fmtDuration(ms: number): string {
  if (ms < 3600000) return '<1 ч';
  if (ms < DAY) return `${Math.round(ms / 3600000)} ч`;
  return `${(Math.round(ms / DAY * 10) / 10).toLocaleString('ru')} дн.`;
}

/** «Новая (2 дн.) → В работе (3 дн.) → Готово». */
export function flowText(flow: Flow, resolved: boolean, now = Date.now()): string {
  return flow.steps.map((s, i) => {
    const last = i === flow.steps.length - 1;
    if (last && resolved) return s.state;
    return `${s.state} (${fmtDuration((s.to ?? now) - s.from)}${last ? ', сейчас' : ''})`;
  }).join(' → ');
}

/** Похоже ли поле на «Состояние»: по названию поля задачи или по общим названиям. */
const isStateField = (name: string, stateField: string) => {
  const n = name.trim().toLowerCase();
  return (stateField && n === stateField.trim().toLowerCase()) || STATE_NAMES.includes(n);
};

const toChange = (a: any): StateChange => ({ at: a?.timestamp || 0, from: nameOf(a?.removed), to: nameOf(a?.added) });

/** История одной задачи — до пустой страницы. */
async function issueChanges(f: Fetcher, key: string, signal?: Signal): Promise<any[]> {
  const out: any[] = [];
  for (;;) {
    check(signal);
    const page: any[] = await getJson(f, `/api/issues/${encodeURIComponent(key)}/activities?` + qs({ categories: 'CustomFieldCategory', fields: FIELDS, $top: PAGE, $skip: out.length }));
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
  }
  return out;
}

/** Выполнить задачи не больше n одновременно. */
async function pool<T>(items: T[], n: number, run: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await run(items[i++]);
  }));
}

/** Проставить задачам flow — путь по статусам. */
export async function attachFlow(f: Fetcher, issues: Issue[], o: { signal?: Signal; onProgress?: (done: number, total: number) => void } = {}) {
  if (!issues.length) return;
  const keys = issues.map((i) => i.key);
  const acts = new Map<string, any[]>();
  let done = 0;
  o.onProgress?.(0, keys.length);
  await pool(keys, 8, async (key) => {
    try {
      acts.set(key, await issueChanges(f, key, o.signal));
    } catch (e) {
      // Нет доступа к истории задачи — путь у неё будет по текущему статусу
      if (!(e instanceof YtError) || e.message === 'Отменено' || e.kind === 'network' || (e.kind === 'auth' && e.status !== 403)) throw e;
    }
    o.onProgress?.(++done, keys.length);
  });
  for (const i of issues) {
    const changes = (acts.get(i.key) || []).filter((a) => isStateField(a?.field?.name || '', i.stateField)).map(toChange);
    i.flow = buildFlow(i.created, i.state, changes);
  }
}

// ---------- Сводка по путям ----------

export interface FlowStats {
  /** Статусы в обычном порядке прохождения: медиана времени в статусе и у скольких задач он был. */
  states: { state: string; median: number; count: number }[];
  /** Задач с возвратами назад. */
  withReturns: number;
  /** У скольких задач путь загружен. */
  total: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function flowStats(issues: Issue[], now = Date.now()): FlowStats | null {
  const withFlow = issues.filter((i) => i.flow);
  if (!withFlow.length) return null;
  const times = new Map<string, number[]>();
  const order = new Map<string, number[]>();
  for (const i of withFlow) {
    const d = stateDurations(i.flow!, !!i.resolved, now);
    for (const [s, ms] of d) (times.get(s) ?? times.set(s, []).get(s)!).push(ms);
    // Где статус впервые встретился в пути этой задачи
    const first = new Map<string, number>();
    i.flow!.steps.forEach((st, k) => { if (!first.has(st.state)) first.set(st.state, k); });
    for (const [s, k] of first) (order.get(s) ?? order.set(s, []).get(s)!).push(k);
  }
  // Порядок статусов — по средней позиции первого появления в пути
  const pos = (s: string) => { const xs = order.get(s) || [99]; return xs.reduce((a, b) => a + b, 0) / xs.length; };
  const states = [...times].map(([state, xs]) => ({ state, median: median(xs), count: xs.length })).sort((a, b) => pos(a.state) - pos(b.state));
  return { states, withReturns: withFlow.filter((i) => i.flow!.returns > 0).length, total: withFlow.length };
}
