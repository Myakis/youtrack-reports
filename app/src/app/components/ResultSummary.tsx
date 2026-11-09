// Сводка над таблицей: задачи, время, медиана решения, разбивка по типам, проектам и приоритетам;
// «Сравнить…» — с прошлым или другим периодом либо с другим сотрудником: разница у цифр и таблица рядом.
import { ChartColumnIcon, Loader2Icon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { diff, fmtDays, fmtHours, type Stats } from '../../core/stats';
import { fmtDuration, type FlowStats } from '../../core/flow';
import { stateColor } from './FlowBar';
import { SummaryCharts } from './SummaryCharts';
import type { Issue } from '../../core/youtrack';
import type { PickItem } from '../../core/suggest';
import { CompareMenu, type CompareTarget } from './CompareMenu';
import { CompareTable } from './CompareTable';

/** С чем сравнили: цифры, задачи (для графиков) и как это называть. */
export interface CompareResult {
  stats: Stats;
  flows: FlowStats | null;
  issues: Issue[];
  /** Для «по сравнению с …»: «прошлым месяцем», «сотрудником Дмитрий Смирнов». */
  label: string;
  /** Период сравнения строкой. */
  period: string;
  range: { from: string; to: string };
  /** Подписи колонок: текущий поиск и сравнение. */
  aName: string;
  bName: string;
}

export type CompareState =
  | { state: 'idle' }
  | { state: 'busy'; text: string }
  | ({ state: 'done' } & CompareResult);

export interface ResultSummaryProps {
  stats: Stats;
  /** Задачи, по которым сводка (отмеченные), и период поиска — для графиков. */
  issues: Issue[];
  period: { from: string; to: string };
  charts: boolean;
  onCharts: (on: boolean) => void;
  /** Путь по статусам; null — не загружали. */
  flows: FlowStats | null;
  compare: CompareState;
  /** «прошлым месяцем»; null — у периода нет начала или конца. */
  prevLabel: string | null;
  canPeriod: boolean;
  canPerson: boolean;
  compareReason: string;
  login: string;
  users: PickItem[];
  onCompare: (t: CompareTarget) => void;
  onCompareClose: () => void;
}

/** Разница: рост — зелёный, падение — приглушённый (меньше задач — не обязательно плохо). */
function Delta({ cur, prev, fmt, title }: { cur: number; prev: number; fmt?: (n: number) => string; title: string }) {
  const d = cur - prev;
  return (
    <span title={title} className={cn('ml-1 text-[0.6875rem] font-medium tabular-nums', d > 0 ? 'text-ok' : 'text-muted-foreground')}>
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

export function ResultSummary(p: ResultSummaryProps) {
  const { stats: s, issues, period, charts, onCharts, flows, compare: c, onCompareClose } = p;
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
              <span className="ml-1 text-[0.6875rem] text-muted-foreground tabular-nums" title={`${vs}: было ${fmtDays(prev.stats.leadDays)} дн.`}>
                было {fmtDays(prev.stats.leadDays)}
              </span>
            )}
          </Metric>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant={charts ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs" aria-pressed={charts} onClick={() => onCharts(!charts)}
            title={charts ? 'Скрыть графики' : 'Графики: решено по неделям, типы, время по проектам, время в статусах'}>
            <ChartColumnIcon /> Графики
          </Button>
          {c.state === 'busy' && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2Icon className="size-3.5 animate-spin" />{c.text}</span>}
          {prev && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              по сравнению с {prev.label}
              <Button variant="ghost" size="icon" className="size-6" title="Убрать сравнение" onClick={onCompareClose}><XIcon className="size-3.5" /></Button>
            </span>
          )}
          {c.state === 'idle' && (
            <CompareMenu prevLabel={p.prevLabel} canPeriod={p.canPeriod} canPerson={p.canPerson} reason={p.compareReason}
              login={p.login} users={p.users} onCompare={p.onCompare} />
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-0.5">
        <Breakdown label="Типы" items={s.byType} />
        {s.byProject.length > 1 && <Breakdown label="Проекты" items={s.byProject} n={3} />}
        <Breakdown label="Приоритеты" items={s.byPriority} />
        {s.byAssignee.length > 1 && <Breakdown label="Исполнители" items={s.byAssignee} n={4} />}
      </div>
      {flows && flows.states.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs"
          title={'Сколько задача обычно проводит в статусе (медиана по задачам, где он был; все заходы вместе).\nФинальный статус решённой задачи не считается.'}>
          <span className="text-muted-foreground">В статусах (медиана):</span>
          {flows.states.map((x) => (
            <span key={x.state} className="inline-flex items-center gap-1 whitespace-nowrap" title={`${x.state}: медиана ${fmtDuration(x.median)}, задач ${x.count}`}>
              <span className={cn('size-2 rounded-full', stateColor(x.state))} />{x.state} <b className="font-semibold tabular-nums">{fmtDuration(x.median)}</b>
            </span>
          ))}
          {flows.withReturns > 0 && <span className="whitespace-nowrap text-warn">↺ с возвратами: {flows.withReturns} из {flows.total}</span>}
        </div>
      )}
      {prev && <CompareTable a={s} b={prev.stats} aName={prev.aName} bName={prev.bName} aFlows={flows} bFlows={prev.flows} />}
      {charts && <SummaryCharts issues={issues} stats={s} flows={flows} from={period.from} to={period.to} compare={prev} />}
    </div>
  );
}
