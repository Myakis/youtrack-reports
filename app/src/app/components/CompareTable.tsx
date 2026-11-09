// Сравнение рядом: показатель — текущий поиск — сравнение — разница.
import { cn } from '@/lib/utils';
import { diff, fmtDays, fmtHours, type Stats } from '../../core/stats';
import { fmtDuration, type FlowStats } from '../../core/flow';
import { stateColor } from './FlowBar';

interface Row {
  label: React.ReactNode;
  a: number | null;
  b: number | null;
  fmt: (v: number) => string;
  /** Рост — хорошо (задач больше) или нет (дольше решали) — для цвета разницы. */
  better?: 'more' | 'less';
  group?: string;
}

const count = (v: number) => v.toLocaleString('ru');

/** Значения разбивки по ключам из обеих сторон: первые n по сумме. */
function pairs(a: [string, number][], b: [string, number][], n: number): [string, number, number][] {
  const keys = new Map<string, [number, number]>();
  for (const [k, v] of a) keys.set(k, [v, 0]);
  for (const [k, v] of b) keys.set(k, [keys.get(k)?.[0] ?? 0, v]);
  return [...keys].map(([k, [x, y]]) => [k, x, y] as [string, number, number])
    .filter(([k]) => k !== 'без значения')
    .sort((p, q) => q[1] + q[2] - (p[1] + p[2])).slice(0, n);
}

export function CompareTable({ a, b, aName, bName, aFlows, bFlows }: {
  a: Stats; b: Stats; aName: string; bName: string; aFlows: FlowStats | null; bFlows: FlowStats | null;
}) {
  const rows: Row[] = [
    { label: 'Задач', a: a.count, b: b.count, fmt: count, better: 'more' },
    ...(a.spent != null || b.spent != null ? [{ label: 'Время', a: a.spent, b: b.spent, fmt: fmtHours, better: 'more' as const }] : []),
    { label: 'Решение (медиана)', a: a.leadDays, b: b.leadDays, fmt: (v: number) => `${fmtDays(v)} дн.`, better: 'less' },
    ...pairs(a.byType, b.byType, 5).map(([k, x, y]) => ({ label: k, a: x, b: y, fmt: count, group: 'По типам' })),
  ];
  if (aFlows || bFlows) {
    const st = new Map<string, [number | null, number | null]>();
    for (const x of aFlows?.states ?? []) st.set(x.state, [x.median, null]);
    for (const x of bFlows?.states ?? []) st.set(x.state, [st.get(x.state)?.[0] ?? null, x.median]);
    for (const [k, [x, y]] of st) {
      rows.push({ label: <span className="inline-flex items-center gap-1.5"><span className={cn('size-2 rounded-full', stateColor(k))} />{k}</span>, a: x, b: y, fmt: fmtDuration, better: 'less', group: 'В статусах (медиана)' });
    }
    rows.push({ label: 'Задач с возвратами', a: aFlows?.withReturns ?? null, b: bFlows?.withReturns ?? null, fmt: count, better: 'less', group: 'В статусах (медиана)' });
  }

  let group = '';
  return (
    <div className="overflow-auto rounded-md border">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr className="[&>th]:px-2.5 [&>th]:py-1.5 [&>th]:font-medium">
            <th className="text-left">Показатель</th>
            <th className="text-right"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" />{aName}</span></th>
            <th className="text-right"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-muted-foreground/50" />{bName}</span></th>
            <th className="text-right">Разница</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const head = r.group && r.group !== group ? (group = r.group) : null;
            const d = r.a != null && r.b != null ? r.a - r.b : null;
            const good = d == null || !d || !r.better ? null : (d > 0) === (r.better === 'more');
            return [
              head && (
                <tr key={`g${i}`}><td colSpan={4} className="px-2.5 pt-2 pb-0.5 text-[0.6875rem] font-medium text-muted-foreground">{head}</td></tr>
              ),
              <tr key={i} className="border-t first:border-t-0 [&>td]:px-2.5 [&>td]:py-1">
                <td className={cn('text-left', r.group && 'pl-4')}>{r.label}</td>
                <td className="text-right font-semibold">{r.a != null ? r.fmt(r.a) : '—'}</td>
                <td className="text-right text-muted-foreground">{r.b != null ? r.fmt(r.b) : '—'}</td>
                <td className={cn('text-right font-medium', good === true ? 'text-ok' : good === false ? 'text-warn' : 'text-muted-foreground')}>
                  {d != null ? diff(r.a!, r.b!, r.fmt) : ''}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
