// Период: одна кнопка, во всплывающем окне — готовые периоды слева и календарь на два месяца справа.
import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { ru } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { iso, periodLabel, PRESETS } from '../../core/period';

/** «2026-11-05» → дата в местном времени (без сдвига часового пояса). */
const parse = (s: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};

export interface PeriodPickerProps {
  preset: string;
  from: string;
  to: string;
  onPreset: (preset: string) => void;
  onRange: (from: string, to: string) => void;
  className?: string;
}

export function PeriodPicker({ preset, from, to, onPreset, onRange, className }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  // Первый щелчок — начало периода, второй — конец
  const [pickEnd, setPickEnd] = useState(false);
  const start = parse(from), end = parse(to);
  const presetName = PRESETS.find((p) => p.v === preset)?.label;
  const dates = periodLabel(from, to);

  const onDay = (day: Date) => {
    const d = iso(day);
    if (!pickEnd || !start) { onRange(d, d); setPickEnd(true); return; }
    if (d < from) { onRange(d, from); } else { onRange(from, d); }
    setPickEnd(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setPickEnd(false); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-8 justify-start gap-2 bg-transparent px-2.5 font-normal shadow-xs dark:bg-input/30', className)}
          title="Период: готовый или свой — щелчок по началу и концу в календаре">
          <CalendarIcon className="size-3.5 opacity-60" />
          {preset !== 'custom' && presetName
            ? <span className="truncate">{presetName}{dates && <span className="text-muted-foreground"> · {dates}</span>}</span>
            : <span className={cn('truncate', !dates && 'text-muted-foreground')}>{dates || 'Всё время'}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto p-0" align="start">
        <div className="flex w-40 flex-col gap-0.5 border-r p-1.5">
          {PRESETS.map((p) => (
            <Button key={p.v} variant="ghost" size="sm"
              className={cn('h-7 justify-start font-normal', preset === p.v && 'bg-accent font-medium text-accent-foreground')}
              onClick={() => { onPreset(p.v); setOpen(false); }}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-col">
          <Calendar
            mode="range" locale={ru} numberOfMonths={2} weekStartsOn={1}
            defaultMonth={start ? new Date(start.getFullYear(), start.getMonth() - (end && end.getMonth() !== start.getMonth() ? 0 : 1), 1) : undefined}
            selected={start ? { from: start, to: end } : undefined}
            onSelect={(_, day) => onDay(day)}
          />
          <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            <span className="flex-1">{pickEnd ? 'Выберите конец периода' : dates ? `Выбрано: ${dates}` : 'Щёлкните начало и конец периода'}</span>
            <Button size="sm" className="h-7" onClick={() => setOpen(false)}>Готово</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
