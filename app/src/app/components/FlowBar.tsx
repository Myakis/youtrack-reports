// Путь задачи по статусам: цветная полоска (этапы пропорционально времени) и подробный список шагов.
import { cn } from '@/lib/utils';
import { fmtDuration, flowText, type Flow } from '../../core/flow';
import { fmtDate } from '../../core/youtrack';

/** Цвет статуса: по смыслу названия, остальные — по хешу из запасной палитры. */
const KNOWN: [RegExp, string][] = [
  [/нов|open|backlog|бэклог|submitted|to ?do|сделать/i, 'bg-slate-400'],
  [/работ|progress|develop|разработ/i, 'bg-sky-500'],
  [/ревью|review|провер/i, 'bg-violet-500'],
  [/тест|test|qa/i, 'bg-amber-500'],
  [/готов|done|закрыт|closed|fixed|resolved|выполн|verified/i, 'bg-emerald-500'],
  [/ожид|wait|hold|пауз|block|блок/i, 'bg-rose-400'],
];
const SPARE = ['bg-teal-500', 'bg-orange-400', 'bg-indigo-400', 'bg-lime-500', 'bg-pink-400', 'bg-cyan-500'];

export function stateColor(state: string): string {
  for (const [re, c] of KNOWN) if (re.test(state)) return c;
  let h = 0;
  for (const ch of state) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE[h % SPARE.length];
}

/** Полоска пути для таблицы: последний этап решённой задачи — узкий хвостик, он не длится. */
export function FlowBar({ flow, resolved, now = Date.now() }: { flow: Flow; resolved: boolean; now?: number }) {
  const n = flow.steps.length;
  const parts = flow.steps.map((s, i) => {
    const last = i === n - 1;
    return { state: s.state, ms: last && resolved ? 0 : Math.max(0, (s.to ?? now) - s.from), last };
  });
  const total = parts.reduce((a, p) => a + p.ms, 0) || 1;
  return (
    <span className="flex items-center gap-1.5" title={flowText(flow, resolved, now) + (flow.returns ? `\nВозвратов: ${flow.returns}` : '')}>
      <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        {parts.map((p, i) => (
          <span key={i} className={cn('h-full border-r border-card last:border-r-0', stateColor(p.state))}
            style={p.ms ? { width: `${(p.ms / total) * 100}%`, minWidth: 3 } : { width: 4, flex: 'none' }} />
        ))}
      </span>
      {flow.returns > 0 && <span className="text-[0.6875rem] font-medium text-warn tabular-nums">↺{flow.returns}</span>}
    </span>
  );
}

/** Шаги пути в деталях задачи: статус, с какого числа, сколько длился. */
export function FlowSteps({ flow, resolved, now = Date.now() }: { flow: Flow; resolved: boolean; now?: number }) {
  if (!flow.steps.length) return <p className="text-muted-foreground">Нет истории статусов</p>;
  return (
    <ol className="relative ml-1 border-l pl-3.5 text-[0.7812rem]">
      {flow.steps.map((s, i) => {
        const last = i === flow.steps.length - 1;
        return (
          <li key={i} className="relative mb-1.5 last:mb-0">
            <span className={cn('absolute top-1.5 -left-[19px] size-2 rounded-full ring-2 ring-card', stateColor(s.state))} />
            <span className="font-medium">{s.state}</span>
            <span className="text-muted-foreground"> · {fmtDate(s.from)}</span>
            {!(last && resolved) && (
              <span className="text-muted-foreground"> · {fmtDuration((s.to ?? now) - s.from)}{last ? ' (сейчас)' : ''}</span>
            )}
          </li>
        );
      })}
      {flow.returns > 0 && <li className="mt-1.5 text-xs text-warn">Возвращалась назад: {flow.returns} раз(а)</li>}
    </ol>
  );
}
