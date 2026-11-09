// Выпадающие списки фильтров на shadcn/ui: один выбор (проект, доска, спринт), несколько (статусы)
// и поле с подсказками (сотрудник, теги через запятую).
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { applySuggestion, currentToken, filterItems, suggest, tidyList, type PickItem } from '../../core/suggest';

export type { PickItem };

/** Поиск в списке появляется, когда пунктов больше этого. */
const FIND_FROM = 8;
/** Больше не рисуем — длинные списки (пользователи) сужаются поиском. */
const MAX_SHOWN = 200;

function Highlight({ text, query }: { text: string; query: string }) {
  const k = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (k < 0) return <>{text}</>;
  return <>{text.slice(0, k)}<mark className="bg-transparent font-semibold text-primary">{text.slice(k, k + query.length)}</mark>{text.slice(k + query.length)}</>;
}

function Trigger({ label, muted, title, className, ...props }: { label: ReactNode; muted?: boolean; title?: string; className?: string } & React.ComponentProps<'button'>) {
  return (
    <Button variant="outline" role="combobox" title={title} className={cn('h-8 justify-between gap-2 bg-transparent px-2.5 font-normal shadow-xs dark:bg-input/30', className)} {...props}>
      <span className={cn('truncate', muted && 'text-muted-foreground')}>{label}</span>
      <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
    </Button>
  );
}

// ---------- Один выбор ----------
export interface SinglePickerProps {
  value: string;
  onChange: (value: string) => void;
  items: PickItem[];
  /** Текст, когда ничего не выбрано, и пункта сброса: «Все проекты». */
  any: string;
  find: string;
  empty: string;
  title: string;
  className?: string;
}

export function SinglePicker({ value, onChange, items, any, find, empty, title, className }: SinglePickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cur = items.find((i) => i.value === value);
  const shown = useMemo(() => filterItems(items, q).slice(0, MAX_SHOWN), [items, q]);
  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQ(''); }}>
      <PopoverTrigger asChild>
        <Trigger label={value ? cur?.label ?? value : any} muted={!value} className={className}
          title={value ? `${title}: ${cur?.label ?? value}${cur?.hint ? ` (${cur.hint})` : ''}` : title} />
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-(--radix-popover-trigger-width) max-w-96 p-0" align="start">
        <Command shouldFilter={false} value={value || undefined}>
          {items.length > FIND_FROM && <CommandInput placeholder={find} value={q} onValueChange={setQ} />}
          <CommandList>
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup>
              {shown.map((it) => (
                <CommandItem key={it.value} value={it.value} onSelect={() => pick(it.value)} className="gap-3">
                  <CheckIcon className={cn('size-3.5', it.value === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 truncate"><Highlight text={it.label} query={q} /></span>
                  {it.hint && <span className="max-w-[45%] truncate text-xs text-muted-foreground"><Highlight text={it.hint} query={q} /></span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="border-t p-1.5">
            <Button variant="ghost" size="sm" className="h-7 w-full justify-start text-muted-foreground" onClick={() => pick('')}>{any}</Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------- Несколько (статусы, типы) ----------
export interface MultiPickerProps {
  values: string[];
  onChange: (values: string[]) => void;
  items: string[];
  any: string;
  title: string;
  className?: string;
  /** Тексты: поле поиска, «не найдено», «ещё загружается», подпись над списком. */
  find?: string;
  empty?: string;
  loading?: string;
  heading?: string;
}

export function MultiPicker({ values, onChange, items, any, title, className, find = 'Найти или добавить статус…', empty = 'Нет такого статуса',
  loading = 'Статусы ещё загружаются — введите вручную', heading }: MultiPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  // Выбранные, которых нет среди известных (введённые вручную), — тоже в списке
  const all = useMemo(() => [...items, ...values.filter((v) => !items.includes(v))], [items, values]);
  const shown = all.filter((s) => !q || s.toLowerCase().includes(q.toLowerCase()));
  const custom = q.replace(/[,{}]/g, ' ').trim();
  const canAdd = custom && !all.some((s) => s.toLowerCase() === custom.toLowerCase());
  const toggle = (s: string) => onChange(values.includes(s) ? values.filter((x) => x !== s) : [...values, s]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQ(''); }}>
      <PopoverTrigger asChild>
        <Trigger label={values.length ? values.join(', ') : any} muted={!values.length} className={className}
          title={values.length ? `${title}: ${values.join(' или ')}` : `${any} — можно выбрать несколько`} />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={find} value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{items.length ? empty : loading}</CommandEmpty>
            <CommandGroup heading={heading}>
              {shown.map((s) => (
                <CommandItem key={s} value={'s:' + s} onSelect={() => toggle(s)} className="gap-2">
                  <span className={cn('flex size-4 items-center justify-center rounded-[4px] border border-input', values.includes(s) && 'border-primary bg-primary text-primary-foreground')}>
                    {values.includes(s) && <CheckIcon className="size-3 text-primary-foreground" />}
                  </span>
                  <Highlight text={s} query={q} />
                </CommandItem>
              ))}
              {canAdd && (
                <CommandItem value={'add:' + custom} onSelect={() => { onChange([...values, custom]); setQ(''); }} className="gap-2">
                  <PlusIcon className="size-3.5" /> Добавить «{custom}»
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
          <div className="flex justify-between gap-2 border-t p-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={() => onChange([])}>{any}</Button>
            <Button size="sm" className="h-7" onClick={() => setOpen(false)}>OK</Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------- Поле с подсказками ----------
export interface SuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  items: PickItem[];
  /** Значения через запятую: дополняется то, что после последней запятой. */
  multi?: boolean;
  placeholder?: string;
  title?: string;
  emptyText: string;
  /** Enter без выбранной подсказки. */
  onEnter?: () => void;
  className?: string;
}

export function SuggestInput({ value, onChange, items, multi, placeholder, title, emptyText, onEnter, className }: SuggestInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const token = multi ? currentToken(value) : value.trim();

  const shown = useMemo(() => {
    if (multi) {
      const labels = suggest(items.map((i) => i.label), value, MAX_SHOWN);
      return labels.map((l) => items.find((i) => i.label === l)!).filter(Boolean);
    }
    // Уже выбрано точное значение — подсказывать нечего
    if (items.some((i) => i.value.toLowerCase() === token.toLowerCase())) return [];
    return filterItems(items, token).slice(0, token ? 50 : 0);
  }, [items, value, multi, token]);

  const visible = open && (shown.length > 0 || (multi && !token));
  const pick = (it: PickItem) => {
    onChange(multi ? applySuggestion(value, it.value) : it.value);
    setActive(-1);
    if (!multi) setOpen(false);
  };
  const move = (d: number) => {
    if (!shown.length) return;
    const n = (active + d + shown.length) % shown.length;
    setActive(n);
    listRef.current?.querySelectorAll('[data-i]')[n]?.scrollIntoView({ block: 'nearest' });
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); move(e.key === 'ArrowDown' ? 1 : -1); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && visible && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape' && visible) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Enter') { e.preventDefault(); setOpen(false); onEnter?.(); }
  };

  return (
    <div className={cn('relative', className)}>
      <Input
        value={value} placeholder={placeholder} title={title} autoComplete="off" spellCheck={false} className="h-8"
        role="combobox" aria-expanded={visible} aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); if (multi) { const t = tidyList(value); if (t !== value) onChange(t); } }}
        onKeyDown={onKey}
      />
      {visible && (
        <div ref={listRef} role="listbox"
          className="absolute top-full left-0 z-50 mt-1 max-h-64 w-full min-w-56 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          // mousedown, а не click: иначе поле теряет фокус и список закрывается раньше выбора
          onMouseDown={(e) => e.preventDefault()}>
          {shown.length ? shown.map((it, i) => (
            <div key={it.value} data-i={i} role="option" aria-selected={i === active}
              className={cn('flex cursor-default items-baseline gap-3 rounded-sm px-2 py-1.5 select-none', i === active && 'bg-accent text-accent-foreground')}
              onMouseEnter={() => setActive(i)} onClick={() => pick(it)}>
              <span className="flex-1 truncate"><Highlight text={it.label} query={token} /></span>
              {it.hint && <span className="max-w-[50%] truncate text-xs text-muted-foreground">{it.hint}</span>}
            </div>
          )) : <div className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</div>}
        </div>
      )}
    </div>
  );
}
