// Колонки таблицы: показать/скрыть галочкой, порядок — стрелками; «Как было» — по умолчанию.
import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { COLUMNS, DEFAULT_COLUMNS, moveColumn, toggleColumn, type ColumnsConfig } from '../lib/view';

export function ColumnsEditor({ value, onChange, className }: { value: ColumnsConfig; onChange: (c: ColumnsConfig) => void; className?: string }) {
  const changed = JSON.stringify(value) !== JSON.stringify(DEFAULT_COLUMNS);
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {value.order.map((id, i) => {
        const c = COLUMNS.find((x) => x.id === id)!;
        const shown = !value.hidden.includes(id);
        const fixed = id === 'summary';
        return (
          <div key={id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent">
            <Checkbox id={`col-${id}`} checked={shown} disabled={fixed} onCheckedChange={(v) => onChange(toggleColumn(value, id, !!v))} />
            <label htmlFor={`col-${id}`} className={cn('min-w-0 flex-1 truncate text-[0.8125rem]', !shown && 'text-muted-foreground')}
              title={fixed ? 'Название всегда видно' : c.hint ? `Видна, ${c.hint}` : undefined}>
              {c.name}{c.hint && <span className="text-[0.6875rem] text-muted-foreground"> · {c.hint}</span>}
            </label>
            <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" disabled={i === 0} title="Левее" aria-label={`${c.name}: левее`}
              onClick={() => onChange(moveColumn(value, id, -1))}><ArrowUpIcon className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" disabled={i === value.order.length - 1} title="Правее" aria-label={`${c.name}: правее`}
              onClick={() => onChange(moveColumn(value, id, 1))}><ArrowDownIcon className="size-3.5" /></Button>
          </div>
        );
      })}
      <Button variant="ghost" size="sm" className="mt-1 h-7 self-start text-xs" disabled={!changed} onClick={() => onChange(DEFAULT_COLUMNS)}>
        <RotateCcwIcon /> Как было
      </Button>
    </div>
  );
}

/** Кнопка «Колонки» над таблицей. */
export function ColumnsButton(p: { value: ColumnsConfig; onChange: (c: ColumnsConfig) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="size-8" title="Колонки таблицы: какие показывать и в каком порядке"><Columns3Icon /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(34rem,var(--radix-popover-content-available-height))] w-72 overflow-auto p-2">
        <div className="px-1.5 pb-1.5 text-xs font-medium text-muted-foreground">Колонки таблицы (сверху вниз — слева направо)</div>
        <ColumnsEditor value={p.value} onChange={p.onChange} />
      </PopoverContent>
    </Popover>
  );
}
