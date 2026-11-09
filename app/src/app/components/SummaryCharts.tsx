// Графики сводки: решённые задачи по неделям (месяцам), типы, время или задачи по проектам, время в статусах.
// Величины — одним цветом (акцент); статусы — своими цветами с подписью рядом. Наведение — точные цифры в шапке карточки.
// При сравнении вторая серия — серая, рядом с основной (столбики по неделям — по порядку недель), с легендой.
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { fmtHours, minutesByAssignee, minutesByProject, resolvedBuckets, type Stats } from '../../core/stats';
import { fmtDuration, type FlowStats } from '../../core/flow';
import type { Issue } from '../../core/youtrack';
import { stateColor } from './FlowBar';
import type { CompareResult } from './ResultSummary';

const B_COLOR = 'bg-muted-foreground/45';

function Card({ title, readout, children, className }: { title: string; readout: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-md border bg-background/40 px-2.5 py-2', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{title}</span>
        <span className="truncate text-muted-foreground tabular-nums">{readout}</span>
      </div>
      {children}
    </div>
  );
}

/** Решённые по неделям: столбики от общей базовой линии; пустая неделя — только линия. */
function ResolvedChart({ issues, from, to, compare }: { issues: Issue[]; from: string; to: string; compare?: CompareResult | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = resolvedBuckets(issues, from, to);
  if (!data) return null;
  const { buckets, by } = data;
  // Сравнение: тот же шаг (неделя/месяц) — столбики по порядку; другой шаг — не рисуем, сравнить нельзя
  const other = compare ? resolvedBuckets(compare.issues, compare.range.from || from, compare.range.to || to) : null;
  const bb = other && other.by === by ? other.buckets : null;
  const n = Math.max(buckets.length, bb?.length ?? 0);
  const max = Math.max(1, ...buckets.map((b) => b.count), ...(bb ?? []).map((b) => b.count));
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const withTime = issues.some((i) => i.spent != null);
  const h = hover != null ? buckets[hover] : null;
  const hb = hover != null && bb ? bb[hover] : null;
  const step = Math.max(1, Math.ceil(n / 6));   // подписей не больше ~6
  const one = (b: { title: string; count: number; minutes: number }) => `${b.title}: ${b.count} ${plural(b.count)}${withTime && b.minutes ? ` · ${fmtHours(b.minutes)}` : ''}`;
  const bar = (count: number, color: string, active: boolean) => (
    <div className={cn('w-full rounded-t-[4px] transition-opacity', count ? color : '', count && !active && 'opacity-80')}
      style={{ height: count ? `${Math.max(4, (count / max) * 100)}%` : 0 }} />
  );
  return (
    <Card title={by === 'week' ? 'Решено по неделям' : 'Решено по месяцам'} className="col-span-2"
      readout={hover != null ? [h && one(h), hb && `сравнение — ${one(hb)}`].filter(Boolean).join(' · ') : `всего ${total}, макс. ${max} за ${by === 'week' ? 'неделю' : 'месяц'}`}>
      <div className="flex h-20 items-end gap-[3px] border-b border-border" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="flex h-full min-w-0 flex-1 cursor-default items-end gap-[2px]" onMouseEnter={() => setHover(i)}>
            {bar(buckets[i]?.count ?? 0, 'bg-primary', hover === i)}
            {bb && bar(bb[i]?.count ?? 0, B_COLOR, hover === i)}
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] text-[0.625rem] text-muted-foreground">
        {Array.from({ length: n }, (_, i) => <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">{i % step === 0 ? buckets[i]?.label ?? '' : ''}</span>)}
      </div>
    </Card>
  );
}

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'задача' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'задачи' : 'задач');

/** Горизонтальные столбики: подпись слева, значение справа, первые n строк. */
function Bars({ title, items, fmt, color, n = 5, note, other }: {
  title: string; items: [string, number][]; fmt: (v: number) => string; color?: (k: string) => string; n?: number; note?: string;
  /** Значения сравнения по тем же ключам — серым под основным. */
  other?: [string, number][] | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  if (!items.length) return null;
  const ov = other ? new Map(other) : null;
  const max = Math.max(...items.map(([, v]) => v), ...(other ?? []).map(([, v]) => v)) || 1;
  const shown = items.slice(0, n);
  const rest = items.slice(n);
  const h = items.find(([k]) => k === hover);
  return (
    <Card title={title} readout={h ? `${h[0]}: ${fmt(h[1])}${ov ? ` · сравнение ${fmt(ov.get(h[0]) ?? 0)}` : ''}` : note ?? (rest.length ? `ещё ${rest.length}` : '')}>
      <div className="flex flex-col gap-1" onMouseLeave={() => setHover(null)}>
        {shown.map(([k, v]) => (
          <div key={k} className="grid cursor-default grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2 text-[0.7188rem]" onMouseEnter={() => setHover(k)}>
            <span className="flex min-w-0 items-center gap-1.5">
              {color && <span className={cn('size-2 shrink-0 rounded-full', color(k))} />}
              <span className="truncate" title={k}>{k}</span>
            </span>
            <span className="flex flex-col gap-[2px]">
              <span className="h-2 rounded-r-[4px] bg-muted">
                <span className={cn('block h-full rounded-r-[4px] transition-colors', color ? color(k) : hover === k ? 'bg-primary' : 'bg-primary/70', color && hover !== k && 'opacity-80')}
                  style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />
              </span>
              {ov && (
                <span className="h-1 rounded-r-[4px]">
                  <span className={cn('block h-full rounded-r-[4px]', B_COLOR)} style={{ width: `${ov.get(k) ? Math.max(2, (ov.get(k)! / max) * 100) : 0}%` }} />
                </span>
              )}
            </span>
            <span className="text-right text-muted-foreground tabular-nums">{fmt(v)}{ov && <span className="text-[0.625rem]"> / {fmt(ov.get(k) ?? 0)}</span>}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SummaryCharts({ issues, stats, flows, from, to, compare }: {
  issues: Issue[]; stats: Stats; flows: FlowStats | null; from: string; to: string; compare?: CompareResult | null;
}) {
  const byProjectTime = minutesByProject(issues);
  const count = (v: number) => v.toLocaleString('ru');
  const c = compare ?? null;
  const states = (f: FlowStats | null) => (f?.states ?? []).map((x) => [x.state, x.median] as [string, number]);
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {c && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[0.6875rem] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" />{c.aName}</span>
          <span className="inline-flex items-center gap-1.5"><span className={cn('size-2 rounded-sm', B_COLOR)} />{c.bName}</span>
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
        <ResolvedChart issues={issues} from={from} to={to} compare={c} />
        {stats.byAssignee.length > 1 && (minutesByAssignee(issues).length
          ? <Bars title="Время по исполнителям" items={minutesByAssignee(issues)} fmt={fmtHours} n={8} other={c ? minutesByAssignee(c.issues) : null} />
          : <Bars title="Задачи по исполнителям" items={stats.byAssignee} fmt={count} n={8} other={c?.stats.byAssignee} />)}
        <Bars title="Типы" items={stats.byType} fmt={count} other={c?.stats.byType} />
        {byProjectTime.length
          ? <Bars title="Время по проектам" items={byProjectTime} fmt={fmtHours} other={c ? minutesByProject(c.issues) : null} />
          : stats.byProject.length > 1 && <Bars title="Проекты" items={stats.byProject} fmt={count} other={c?.stats.byProject} />}
        {flows && flows.states.length > 0 && (
          <Bars title="В статусах" items={states(flows)} fmt={fmtDuration} color={stateColor} n={6} note="медиана" other={c ? states(c.flows) : null} />
        )}
      </div>
    </div>
  );
}
