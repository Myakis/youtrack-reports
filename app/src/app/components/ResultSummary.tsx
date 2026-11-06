// Сводка над таблицей: задачи, время, медиана решения, разбивка по типам, проектам и приоритетам;
// кнопка «Сравнить с прошлым периодом» — те же цифры за прошлый период и разница.
import { GitCompareArrowsIcon, Loader2Icon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { diff, fmtDays, fmtHours, type Stats } from '../../core/stats';

export type CompareState =
  | { state: 'idle' }
  | { state: 'busy'; text: string }
  | { state: 'done'; stats: Stats; label: string; period: string };

export interface ResultSummaryProps {
  stats: Stats;
  compare: CompareState;
  /** «Сравнить с прошлым месяцем»; null — сравнить нельзя, reason — почему. */
  compareLabel: string | null;
  compareReason: string;
  onCompare: () => void;
  onCompareClose: () => void;
}

/** Разница: рост — зелёный, падение — приглушённый (меньше задач — не обязательно плохо). */
function Delta({ cur, prev, fmt, title }: { cur: number; prev: number; fmt?: (n: number) => string; title: string }) {
  const d = cur - prev;
  return (
    <span title={title} className={cn('ml-1 text-[11px] font-medium tabular-nums', d > 0 ? 'text-ok' : 'text-muted-foreground')}>
      {diff(cur, prev, fmt)}
    </span>
  );
}

function Metric({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      {children}
    </div>
  );
}

/** «Задача 5 · Ошибка 3 · ещё 2»: первые n, остальное — в подсказке. */
function Breakdown({ label, items, n = 4 }: { label: string; items: [string, number][]; n?: number }) {
  if (!items.length || (items.length === 1 && items[0][0] === 'без значения')) return null;
  const rest = items.slice(n);
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 text-xs" title={items.map(([k, v]) => `${k}: ${v}`).join('\n')}>
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate">
        {items.slice(0, n).map(([k, v], i) => (
          <span key={k}>{i > 0 && <span className="text-muted-foreground"> · </span>}{k} <b className="font-semibold tabular-nums">{v}</b></span>
        ))}
        {rest.length > 0 && <span className="text-muted-foreground"> · ещё {rest.length}</span>}
      </span>
    </div>
  );
}

export function ResultSummary({ stats: s, compare: c, compareLabel, compareReason, onCompare, onCompareClose }: ResultSummaryProps) {
  const prev = c.state === 'done' ? c : null;
  const vs = prev ? `По сравнению с ${prev.label} (${prev.period})` : '';
  return (
    <div className="flex flex-col gap-1 border-b px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Metric label="Задач" value={s.count.toLocaleString('ru')}>
          {prev && <Delta cur={s.count} prev={prev.stats.count} title={`${vs}: было ${prev.stats.count}`} />}
        </Metric>
        {s.spent != null && (
          <Metric label="Время" value={fmtHours(s.spent)}>
            {prev?.stats.spent != null && <Delta cur={s.spent} prev={prev.stats.spent} fmt={fmtHours} title={`${vs}: было ${fmtHours(prev.stats.spent)}`} />}
          </Metric>
        )}
        {s.leadDays != null && (
          <Metric label="Решение (медиана)" value={`${fmtDays(s.leadDays)} дн.`}>
            {prev?.stats.leadDays != null && (
              <span className="ml-1 text-[11px] text-muted-foreground tabular-nums" title={`${vs}: было ${fmtDays(prev.stats.leadDays)} дн.`}>
                было {fmtDays(prev.stats.leadDays)}
              </span>
            )}
          </Metric>
        )}
        <div className="ml-auto flex items-center gap-1">
          {c.state === 'busy' && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2Icon className="size-3.5 animate-spin" />{c.text}</span>}
          {prev && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              по сравнению с {prev.label}
              <Button variant="ghost" size="icon" className="size-6" title="Убрать сравнение" onClick={onCompareClose}><XIcon className="size-3.5" /></Button>
            </span>
          )}
          {c.state === 'idle' && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!compareLabel} onClick={onCompare}
              title={compareLabel ? 'Тот же поиск за прошлый период — и разница в цифрах' : compareReason}>
              <GitCompareArrowsIcon /> {compareLabel || 'Сравнить с прошлым периодом'}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-0.5">
        <Breakdown label="Типы" items={s.byType} />
        {s.byProject.length > 1 && <Breakdown label="Проекты" items={s.byProject} n={3} />}
        <Breakdown label="Приоритеты" items={s.byPriority} />
      </div>
    </div>
  );
}
