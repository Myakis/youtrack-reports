// «Сравнить с…»: прошлый период, другой период или другой сотрудник — тот же поиск, и цифры рядом.
import { useState } from 'react';
import { CalendarRangeIcon, GitCompareArrowsIcon, HistoryIcon, UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { presetRange, type Preset } from '../../core/period';
import type { PickItem } from '../../core/suggest';
import { PeriodPicker } from './PeriodPicker';
import { SinglePicker } from './pickers';

export type CompareTarget =
  | { kind: 'prev' }
  | { kind: 'period'; from: string; to: string }
  | { kind: 'person'; login: string };

export interface CompareMenuProps {
  /** «прошлым месяцем»; null — у периода нет начала или конца. */
  prevLabel: string | null;
  /** Можно ли менять период и сотрудника (запрос не правили вручную). */
  canPeriod: boolean;
  /** Можно ли сравнить с сотрудником (поиск был по сотруднику). */
  canPerson: boolean;
  /** Почему сравнить нельзя. */
  reason: string;
  /** Текущий сотрудник — его в списке нет. */
  login: string;
  users: PickItem[];
  onCompare: (t: CompareTarget) => void;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t px-3 py-2.5 first:border-t-0">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">{icon}{title}</div>
      {children}
    </div>
  );
}

export function CompareMenu(p: CompareMenuProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ preset: string; from: string; to: string }>({ preset: 'prevQuarter', ...presetRange('prevQuarter') });
  const [person, setPerson] = useState('');
  const run = (t: CompareTarget) => { setOpen(false); p.onCompare(t); };
  const disabled = !p.canPeriod;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={disabled} title={disabled ? p.reason : 'Сравнить с прошлым периодом, другим периодом или другим сотрудником'}>
          <GitCompareArrowsIcon /> Сравнить…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Section icon={<HistoryIcon />} title="Прошлый период">
          <Button variant="outline" size="sm" className="h-8 justify-start" disabled={!p.prevLabel} onClick={() => run({ kind: 'prev' })}
            title={p.prevLabel ? undefined : 'У периода нет начала или конца'}>
            {p.prevLabel ? `Сравнить с ${p.prevLabel}` : 'Недоступно для «Всё время»'}
          </Button>
        </Section>
        <Section icon={<CalendarRangeIcon />} title="Другой период — те же фильтры">
          <PeriodPicker className="w-full" preset={range.preset} from={range.from} to={range.to}
            onPreset={(v) => setRange({ preset: v, ...presetRange(v as Preset) })}
            onRange={(from, to) => setRange({ preset: 'custom', from, to })} />
          <Button size="sm" className="h-8" disabled={!range.from || !range.to} onClick={() => run({ kind: 'period', from: range.from, to: range.to })}>
            Сравнить с этим периодом
          </Button>
        </Section>
        <Section icon={<UserIcon />} title="Другой сотрудник — тот же период и фильтры">
          {p.canPerson ? (
            <>
              <SinglePicker className="h-8 w-full" value={person} onChange={setPerson} any="Выберите сотрудника" title="Сотрудник"
                find="Имя или логин…" empty="Нет такого сотрудника" items={p.users.filter((u) => u.value !== p.login)} />
              <Button size="sm" className="h-8" disabled={!person} onClick={() => run({ kind: 'person', login: person })}>Сравнить с сотрудником</Button>
            </>
          ) : <p className="text-xs text-muted-foreground">Доступно, когда поиск был по сотруднику.</p>}
        </Section>
      </PopoverContent>
    </Popover>
  );
}
