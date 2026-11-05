// Быстрый выбор периода для отчёта.

export type Preset = 'month' | 'prevMonth' | 'quarter' | 'prevQuarter' | 'year' | 'last30' | 'all';

export const PRESETS: { v: Preset; label: string }[] = [
  { v: 'month', label: 'Этот месяц' },
  { v: 'prevMonth', label: 'Прошлый месяц' },
  { v: 'last30', label: '30 дней' },
  { v: 'quarter', label: 'Этот квартал' },
  { v: 'prevQuarter', label: 'Прошлый квартал' },
  { v: 'year', label: 'Этот год' },
  { v: 'all', label: 'Всё время' },
];

export const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Границы периода включительно, YYYY-MM-DD; пустые — без ограничения. */
export function presetRange(p: Preset, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear(), m = now.getMonth();
  const range = (a: Date, b: Date) => ({ from: iso(a), to: iso(b) });
  switch (p) {
    case 'month': return range(new Date(y, m, 1), new Date(y, m + 1, 0));
    case 'prevMonth': return range(new Date(y, m - 1, 1), new Date(y, m, 0));
    case 'last30': return range(new Date(y, m, now.getDate() - 29), now);
    case 'quarter': { const q = m - (m % 3); return range(new Date(y, q, 1), new Date(y, q + 3, 0)); }
    case 'prevQuarter': { const q = m - (m % 3) - 3; return range(new Date(y, q, 1), new Date(y, q + 3, 0)); }
    case 'year': return range(new Date(y, 0, 1), new Date(y, 11, 31));
    case 'all': return { from: '', to: '' };
  }
}

/** «01.10.2026 – 31.10.2026». */
export function periodLabel(from: string, to: string): string {
  const ru = (s: string) => s.split('-').reverse().join('.');
  if (!from && !to) return '';
  if (!from) return `по ${ru(to)}`;
  if (!to) return `с ${ru(from)}`;
  return `${ru(from)} – ${ru(to)}`;
}
