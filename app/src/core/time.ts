// Затраченное время: записи учёта времени (work items) у найденных задач.
// Общий список /api/workItems?query=issue id: … — пачками по 50 задач; если YouTrack так не умеет —
// у каждой задачи отдельно (/api/issues/{id}/timeTracking/workItems).
import { getJson, qs, YtError, type Fetcher, type Issue, type Signal } from './youtrack';

export interface WorkItem { key: string; author: string; date: number; minutes: number }

const PAGE = 500;
const FIELDS = 'date,duration(minutes),author(login),issue(idReadable)';

const check = (s?: Signal) => { if (s?.cancelled) throw new YtError('Отменено'); };

const toItem = (w: any, key?: string): WorkItem => ({
  key: key || w?.issue?.idReadable || '',
  author: w?.author?.login || '',
  date: w?.date || 0,
  minutes: Number(w?.duration?.minutes) || 0,
});

/** Записи времени одной задачи — до пустой страницы. */
async function issueItems(f: Fetcher, key: string, signal?: Signal): Promise<WorkItem[]> {
  const out: WorkItem[] = [];
  for (;;) {
    check(signal);
    const page: any[] = await getJson(f, `/api/issues/${encodeURIComponent(key)}/timeTracking/workItems?` + qs({ fields: FIELDS, $top: PAGE, $skip: out.length }));
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page.map((w) => toItem(w, key)));
  }
  return out;
}

/**
 * Записи времени задач keys; author — только этого сотрудника. null при первой пачке — общий список не годится
 * (ошибка запроса или сервер проигнорировал query и отдаёт чужие задачи).
 */
async function bulkItems(f: Fetcher, keys: string[], author: string, signal?: Signal, onProgress?: (done: number) => void): Promise<WorkItem[] | null> {
  const out: WorkItem[] = [];
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = keys.slice(i, i + 50);
    const inChunk = new Set(chunk);
    let skip = 0;
    for (;;) {
      check(signal);
      let page: any[];
      try {
        page = await getJson(f, '/api/workItems?' + qs({ query: 'issue id: ' + chunk.join(', '), ...(author ? { author } : {}), fields: FIELDS, $top: PAGE, $skip: skip }));
      } catch (e) {
        if (!i && !skip && e instanceof YtError && e.kind === 'http') return null;
        throw e;
      }
      if (!Array.isArray(page)) return i || skip ? out : null;
      if (!page.length) break;
      if (!i && !skip && page.some((w) => !inChunk.has(w?.issue?.idReadable))) return null;
      out.push(...page.map((w) => toItem(w)));
      skip += page.length;
    }
    onProgress?.(Math.min(i + 50, keys.length));
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

/**
 * Проставить задачам spent — минуты по записям времени (author — только его записи, иначе всех).
 * Время считается за всю жизнь задачи, а не только за период поиска: отчёт — о задаче целиком.
 */
export async function attachTime(f: Fetcher, issues: Issue[], o: { author?: string; signal?: Signal; onProgress?: (done: number, total: number) => void } = {}) {
  if (!issues.length) return;
  const keys = issues.map((i) => i.key);
  const author = o.author || '';
  let items = await bulkItems(f, keys, author, o.signal, (d) => o.onProgress?.(d, keys.length));
  if (!items) {
    items = [];
    let done = 0;
    await pool(keys, 6, async (key) => {
      try {
        items!.push(...await issueItems(f, key, o.signal));
      } catch (e) {
        // У проекта выключен учёт времени или нет доступа — у этой задачи времени просто нет
        if (!(e instanceof YtError) || e.message === 'Отменено' || e.kind === 'network' || (e.kind === 'auth' && e.status !== 403)) throw e;
      }
      o.onProgress?.(++done, keys.length);
    });
  }
  const sum = new Map<string, number>();
  for (const w of items) {
    if (author && w.author !== author) continue;
    sum.set(w.key, (sum.get(w.key) || 0) + w.minutes);
  }
  for (const i of issues) i.spent = sum.get(i.key) ?? 0;
}

/** 150 → «2 ч 30 мин», 45 → «45 мин», 0 → «0 ч». */
export function fmtMinutes(m: number): string {
  const sign = m < 0 ? '−' : '';
  m = Math.abs(Math.round(m));
  const h = Math.floor(m / 60), mm = m % 60;
  if (!h && !mm) return '0 ч';
  return sign + [h ? `${h.toLocaleString('ru')} ч` : '', mm ? `${mm} мин` : ''].filter(Boolean).join(' ');
}
