// Сводка по найденным задачам и сравнение с прошлым периодом.
import { iso, type Preset } from './period';
import type { Issue } from './youtrack';

const TYPE_NAMES = ['тип', 'type'];
const PRIORITY_NAMES = ['приоритет', 'priority'];

/** Значение поля по одному из названий (без учёта регистра). */
function fieldOf(i: Issue, names: string[]): string {
  for (const [k, v] of Object.entries(i.fields)) if (names.includes(k.trim().toLowerCase())) return v;
  return '';
}

export interface Stats {
  count: number;
  /** Медиана дней от создания до решения (по решённым задачам); null — решённых нет. */
  leadDays: number | null;
  /** Минуты по учёту времени; null — время не загружали. */
  spent: number | null;
  byType: [string, number][];
  byProject: [string, number][];
  byPriority: [string, number][];
}

/** Сколько раз встречается каждое значение — по убыванию; пустое — «без значения». */
function counts(values: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v || 'без значения', (m.get(v || 'без значения') || 0) + 1);
  const none = (k: string) => (k === 'без значения' ? 1 : 0);
  return [...m].sort((a, b) => none(a[0]) - none(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeStats(issues: Issue[]): Stats {
  const day = 86400000;
  const lead = issues.filter((i) => i.resolved && i.created && i.resolved >= i.created).map((i) => (i.resolved! - i.created) / day);
  const timed = issues.filter((i) => i.spent != null);
  return {
    count: issues.length,
    leadDays: median(lead),
    spent: timed.length ? timed.reduce((s, i) => s + (i.spent || 0), 0) : null,
    byType: counts(issues.map((i) => fieldOf(i, TYPE_NAMES))),
    byProject: counts(issues.map((i) => i.project)),
    byPriority: counts(issues.map((i) => fieldOf(i, PRIORITY_NAMES))),
  };
}

/** Число дней с одним знаком после запятой: 2,5. */
export const fmtDays = (d: number) => (Math.round(d * 10) / 10).toLocaleString('ru');

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Прошлый период для сравнения: месяц — прошлый месяц, квартал — прошлый квартал, год — прошлый год,
 * иначе — столько же дней непосредственно перед началом. null — у периода нет начала и конца.
 */
export function previousRange(preset: string, from: string, to: string): { from: string; to: string; label: string } | null {
  if (!from || !to) return null;
  const a = parse(from);
  const y = a.getFullYear(), m = a.getMonth();
  const range = (x: Date, z: Date, label: string) => ({ from: iso(x), to: iso(z), label });
  switch (preset as Preset) {
    case 'month':
    case 'prevMonth':
      return range(new Date(y, m - 1, 1), new Date(y, m, 0), 'прошлым месяцем');
    case 'quarter':
    case 'prevQuarter':
      return range(new Date(y, m - 3, 1), new Date(y, m, 0), 'прошлым кварталом');
    case 'year':
      return range(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31), 'прошлым годом');
  }
  const days = Math.round((parse(to).getTime() - a.getTime()) / 86400000) + 1;
  return range(new Date(y, m, a.getDate() - days), new Date(y, m, a.getDate() - 1), `предыдущими ${days} дн.`);
}

/** Разница со знаком: «+4», «−2», «0». */
export function diff(cur: number, prev: number, fmt: (n: number) => string = (n) => n.toLocaleString('ru')): string {
  const d = cur - prev;
  if (!d) return '±0';
  return (d > 0 ? '+' : '−') + fmt(Math.abs(d));
}

/** Сводка строками для выгрузки: задачи, время, типы, проекты, приоритеты; prev — для сравнения. */
export function statsLines(s: Stats, prev?: { stats: Stats; label: string; period: string } | null): string[] {
  const top = (xs: [string, number][]) => xs.map(([k, n]) => `${k} — ${n}`).join(', ');
  const vs = (cur: number, p: number, fmt?: (n: number) => string) => (prev ? ` (${diff(cur, p, fmt)} по сравнению с ${prev.label})` : '');
  const out = [`Задач: ${s.count}${vs(s.count, prev?.stats.count ?? 0)}`];
  if (s.spent != null) out.push(`Затраченное время: ${fmtHours(s.spent)}${prev?.stats.spent != null ? vs(s.spent, prev.stats.spent, fmtHours) : ''}`);
  if (s.leadDays != null) out.push(`От создания до решения (медиана): ${fmtDays(s.leadDays)} дн.`);
  if (s.byType.length) out.push(`По типам: ${top(s.byType)}`);
  if (s.byProject.length > 1) out.push(`По проектам: ${top(s.byProject)}`);
  if (s.byPriority.length) out.push(`По приоритетам: ${top(s.byPriority)}`);
  if (prev) out.push(`Прошлый период (${prev.period}): задач ${prev.stats.count}${prev.stats.spent != null ? `, время ${fmtHours(prev.stats.spent)}` : ''}`);
  return out;
}

/** Минуты → «12,5 ч» (для сводки удобнее часы с дробью). */
export const fmtHours = (m: number) => `${(Math.round(m / 6) / 10).toLocaleString('ru')} ч`;
