// Командная строка (Ctrl/⌘+K): действия, сохранённые поиски, команда, сотрудники, темы. И подсказка по клавишам.
import type { ReactNode } from 'react';
import { BookmarkIcon, PaletteIcon, StarIcon, UserIcon } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { THEMES, type ThemeId } from '../lib/themes';
import type { SavedSearch } from '../lib/saved';

export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export interface PaletteAction { id: string; label: string; icon: ReactNode; shortcut?: string; keywords?: string[]; run: () => void; disabled?: boolean }

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actions: PaletteAction[];
  saved: SavedSearch[];
  team: { login: string; name: string }[];
  users: { login: string; name: string; email?: string }[];
  theme: ThemeId;
  onSaved: (s: SavedSearch) => void;
  onPerson: (login: string) => void;
  onTheme: (t: ThemeId) => void;
}

export function CommandPalette(p: CommandPaletteProps) {
  const run = (f: () => void) => { p.onOpenChange(false); f(); };
  const inTeam = new Set(p.team.map((t) => t.login));
  return (
    <CommandDialog open={p.open} onOpenChange={p.onOpenChange} title="Командная строка" description="Сотрудник, сохранённый поиск, тема или действие" className="sm:max-w-xl">
      <CommandInput placeholder="Сотрудник, сохранённый поиск, тема или действие…" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Ничего не найдено</CommandEmpty>
        <CommandGroup heading="Действия">
          {p.actions.filter((a) => !a.disabled).map((a) => (
            <CommandItem key={a.id} value={`действие ${a.label}`} keywords={a.keywords} onSelect={() => run(a.run)}>
              {a.icon} {a.label}{a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
        {p.saved.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Сохранённые поиски">
              {p.saved.map((s) => (
                <CommandItem key={s.id} value={`поиск ${s.name} ${s.id}`} onSelect={() => run(() => p.onSaved(s))}>
                  <BookmarkIcon /> {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {p.team.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Команда">
              {p.team.map((u) => (
                <CommandItem key={u.login} value={`команда ${u.name} ${u.login}`} onSelect={() => run(() => p.onPerson(u.login))}>
                  <StarIcon className="fill-amber-400 text-amber-400" /> {u.name}<span className="text-xs text-muted-foreground">{u.login}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Сотрудники — найти задачи">
          {p.users.filter((u) => !inTeam.has(u.login)).map((u) => (
            <CommandItem key={u.login} value={`сотрудник ${u.name} ${u.login} ${u.email || ''}`} onSelect={() => run(() => p.onPerson(u.login))}>
              <UserIcon /> {u.name}<span className="text-xs text-muted-foreground">{u.login}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Тема оформления">
          {THEMES.map((t) => (
            <CommandItem key={t.id || 'system'} value={`тема ${t.name}`} keywords={['тема', 'оформление', 'цвет']} onSelect={() => run(() => p.onTheme(t.id))}>
              <PaletteIcon /> Тема: {t.name}{p.theme === t.id && <CommandShortcut>сейчас</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export const SHORTCUTS: [string, string][] = [
  [`${MOD}+K`, 'Командная строка: сотрудник, сохранённый поиск, тема, действие'],
  [`${MOD}+Enter`, 'Найти задачи'],
  [`${MOD}+S`, 'Выгрузить отмеченные задачи'],
  [`${MOD}+.`, 'Свернуть или показать панель «Детали / ИИ»'],
  ['↑ ↓', 'Предыдущая / следующая задача в таблице'],
  ['Enter', 'Открыть выбранную задачу в YouTrack; в поле фильтра — найти; в окне ИИ — отправить'],
  ['Shift+Enter', 'Новая строка в окне ИИ'],
  ['?', 'Эта подсказка'],
  ['Esc', 'Закрыть окно или всплывающий список'],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Быстрые клавиши</DialogTitle>
          <DialogDescription>Работают, когда курсор не в поле ввода (кроме сочетаний с {MOD}).</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-2 text-[0.8125rem]">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="contents">
              <dt>{k.split(' ').map((x, i) => <kbd key={i} className="mr-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem]">{x}</kbd>)}</dt>
              <dd className="text-muted-foreground">{d}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
