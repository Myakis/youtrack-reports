// Карточка фильтров: сотрудник, статус, проект, доска и спринт, тип, тег, период; команда и запрос YouTrack.
import { useState } from 'react';
import { BookmarkIcon, BookmarkPlusIcon, ChevronRightIcon, RotateCcwIcon, SearchIcon, StarIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { hasSprints, type Board, type Project, type User } from '../../core/youtrack';
import { isParticipant, type Form } from '../lib/form';
import type { SavedSearch } from '../lib/saved';
import { MultiPicker, SinglePicker, SuggestInput } from './pickers';
import { PeriodPicker } from './PeriodPicker';

/** Одна ширина и высота у всех полей фильтра. */
const W = 'h-8 w-full';

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[0.6875rem] tracking-wide text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  );
}

export interface FiltersProps {
  form: Form;
  update: (patch: Partial<Form>) => void;
  users: User[];
  usersFailed: boolean;
  projects: Project[];
  boards: Board[];
  states: string[];
  tags: string[];
  tagsLoaded: boolean;
  /** Типы задач выбранного проекта (доски) или всего YouTrack; note — откуда список. */
  types: { list: string[]; loading: boolean; note: string };
  team: string[];
  login: string;
  userName: (login: string) => string;
  onStar: () => void;
  onTeamPick: (login: string) => void;
  onTeamRemove: (login: string) => void;
  query: string;
  queryEdited: boolean;
  queryNote: string;
  onQuery: (q: string) => void;
  onQueryReset: () => void;
  searching: boolean;
  onSearch: () => void;
  saved: SavedSearch[];
  /** Какой сохранённый поиск запускали последним — его чип подсвечен. */
  activeSaved: string;
  suggestName: () => string;
  onSaveSearch: (name: string) => void;
  onRunSaved: (s: SavedSearch) => void;
  onRemoveSaved: (id: string) => void;
}

/** «Сохранить поиск»: имя (предложенное по фильтрам) и кнопка; то же имя — заменить. */
function SaveSearch({ saved, suggest, onSave }: { saved: SavedSearch[]; suggest: () => string; onSave: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const exists = saved.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
  const save = () => { if (!name.trim()) return; onSave(name.trim()); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setName(suggest()); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" title="Сохранить текущие фильтры (и запрос, если правили вручную) под именем">
          <BookmarkPlusIcon className="size-3.5" /> Сохранить поиск
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-2 p-3">
        <Label htmlFor="saved-name" className="text-xs">Название поиска</Label>
        <Input id="saved-name" className="h-8" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <p className="text-[0.6875rem] text-muted-foreground">
          Период вроде «Этот месяц» при запуске считается на сегодня.{exists && ' Поиск с таким именем заменится.'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen(false)}>Отмена</Button>
          <Button size="sm" className="h-7" disabled={!name.trim()} onClick={save}>{exists ? 'Заменить' : 'Сохранить'}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Filters(p: FiltersProps) {
  const { form: f, update } = p;
  const [qOpen, setQOpen] = useState(false);
  const board = p.boards.find((b) => b.name === f.board) ?? null;
  const starred = !!p.login && p.team.includes(p.login);
  const tag = (s: string) => ({ value: s, label: s });

  return (
    <section className="flex flex-col gap-2.5 rounded-lg border bg-card px-3 py-2.5">
      {/* Сетка с равными колонками: при переносе поля встают ровными рядами */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] items-end gap-x-2.5 gap-y-2">
        <Field label="Сотрудник" className="col-span-2">
          <div className="flex gap-1.5">
            <div className="relative min-w-0 flex-1">
              <SuggestInput className="w-full" value={f.assignee} onChange={(v) => update({ assignee: v })} onEnter={p.onSearch}
                placeholder={p.usersFailed ? 'Все сотрудники — или логин' : 'Все сотрудники — или имя, логин'}
                items={p.users.map((u) => ({ value: u.login, label: u.name, hint: u.login + (u.email ? ' · ' + u.email : '') }))}
                emptyText="Нет такого сотрудника" />
              {f.assignee && (
                <button type="button" className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  title="Все сотрудники" aria-label="Все сотрудники" onClick={() => update({ assignee: '' })}>
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
            <Button variant="outline" size="icon" className="size-8" title="Добавить в команду / убрать" disabled={!f.assignee.trim()} onClick={p.onStar}>
              <StarIcon className={cn(starred && 'fill-amber-400 text-amber-400')} />
            </Button>
          </div>
        </Field>
        {/* Роль — только для одного сотрудника: у «всех» её нет */}
        {f.assignee.trim() && (
          <Field label="Роль">
            <Select value={f.mode} onValueChange={(v) => update({ mode: v as Form['mode'] })}>
              <SelectTrigger size="sm" className={W} title={'Исполнитель — задачи, где он исполнитель сейчас.\nУчастник — ещё и задачи, где он был исполнителем раньше, менял задачу (например, перевёл в тестирование) или комментировал.'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assignee">исполнитель</SelectItem>
                <SelectItem value="participant">участник</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Статус">
          <MultiPicker className={W} any="Любой статус" title="Статус"
            values={f.states.split(',').map((s) => s.trim()).filter(Boolean)}
            onChange={(v) => update({ states: [...new Set(v)].join(', ') })} items={p.states} />
        </Field>
        <Field label="Проект">
          <SinglePicker className={W} value={f.project} onChange={(v) => update({ project: v })} any="Все проекты" title="Проект"
            find="Найти проект…" empty={p.projects.length ? 'Проектов не найдено' : 'Список проектов ещё загружается…'}
            items={p.projects.map((x) => ({ value: x.key, label: x.name, hint: x.key }))} />
        </Field>
        <Field label="Доска">
          <SinglePicker className={W} value={f.board} onChange={(v) => update({ board: v, sprint: '' })} any="Любая доска"
            title="Только задачи этой доски. Сотрудник тогда необязателен — покажутся все задачи доски по остальным условиям"
            find="Найти доску…" empty={p.boards.length ? 'Досок не найдено' : 'Список досок ещё загружается…'}
            items={p.boards.map((b) => ({ value: b.name, label: b.name, hint: b.projects.join(', ') }))} />
        </Field>
        {board && hasSprints(board) && (
          <Field label="Спринт">
            <SinglePicker className={W} value={f.sprint} onChange={(v) => update({ sprint: v })} any="Все спринты" title="Спринт доски"
              find="Найти спринт…" empty="Спринтов не найдено"
              // Новые спринты обычно в конце — показываем их первыми
              items={[...board.sprints].reverse().map((s) => ({ value: s.id, label: s.name }))} />
          </Field>
        )}
        <Field label="Тип">
          <MultiPicker className={W} any="Любой тип" title="Тип задачи"
            values={f.types.split(',').map((s) => s.trim()).filter(Boolean)}
            onChange={(v) => update({ types: [...new Set(v)].join(', ') })} items={p.types.list}
            find="Найти или добавить тип…" empty="Нет такого типа" loading={p.types.loading ? 'Типы загружаются…' : 'Типов не нашлось — введите вручную'}
            heading={p.types.note} />
        </Field>
        <Field label="Тег">
          <SuggestInput className={W} multi value={f.tags} onChange={(v) => update({ tags: v })} onEnter={p.onSearch}
            placeholder="Любой" title="Можно несколько через запятую — любой из них" items={p.tags.map(tag)}
            emptyText={p.tagsLoaded ? 'Тегов не найдено — введите вручную' : 'Загрузка тегов…'} />
        </Field>
        <Field label="Период" className="col-span-2">
          <PeriodPicker className="h-8 w-full" preset={f.preset} from={f.from} to={f.to}
            onPreset={(v) => update({ preset: v })} onRange={(from, to) => update({ from, to, preset: 'custom' })} />
        </Field>
        <Field label="По дате">
          <Select value={f.dateField} onValueChange={(v) => update({ dateField: v as Form['dateField'] })}>
            <SelectTrigger size="sm" className={W}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="resolved">решения</SelectItem>
              <SelectItem value="updated">обновления</SelectItem>
              <SelectItem value="created">создания</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ещё" className={isParticipant(f) ? 'col-span-4' : 'col-span-3'}>
          <div className="flex h-8 items-center gap-4">
            <Label className="gap-2 font-normal" title="Определить доски и спринты задач — дольше, зато в выгрузке будет доска">
              <Checkbox checked={f.withBoards} onCheckedChange={(v) => update({ withBoards: !!v })} /> Доски
            </Label>
            <Label className="gap-2 font-normal has-disabled:opacity-50" title={f.withBoards ? 'Ещё свимлейн доски — строка, в которой лежит карточка (например, эпик-родитель)' : 'Свимлейны определяются вместе с досками — включите «Доски»'}>
              <Checkbox checked={f.withBoards && f.withSwimlanes} disabled={!f.withBoards} onCheckedChange={(v) => update({ withSwimlanes: !!v })} /> Свимлейны
            </Label>
            <Label className="gap-2 font-normal" title="Затраченное время по учёту времени: сколько списал сотрудник (без сотрудника — все) за всю жизнь задачи">
              <Checkbox checked={f.withTime} onCheckedChange={(v) => update({ withTime: !!v })} /> Время
            </Label>
            <Label className="gap-2 font-normal" title="Путь по статусам: сколько задача пробыла в работе, на ревью, в тестировании и возвращалась ли назад — по истории статуса">
              <Checkbox checked={f.withFlow} onCheckedChange={(v) => update({ withFlow: !!v })} /> Статусы
            </Label>
            {isParticipant(f) && (
              <Label className="gap-2 font-normal whitespace-nowrap" title="Кроме «исполнитель / был исполнителем» — ещё задачи, где сотрудник менял поля (например, статус) или комментировал">
                <Checkbox checked={f.wide} onCheckedChange={(v) => update({ wide: !!v })} /> + менял / комментировал
              </Label>
            )}
          </div>
        </Field>
        {/* «Найти» — всегда в последней колонке ряда */}
        <div className="col-end-[-1] flex justify-end">
          <Button className="h-8 w-full" onClick={p.onSearch} disabled={p.searching} title="Найти задачи (Enter)"><SearchIcon /> Найти</Button>
        </div>
      </div>

      <div className="flex min-h-6 flex-wrap items-center gap-1.5">
        <span className="mr-1 text-muted-foreground">Команда:</span>
        {p.team.map((login) => (
          <span key={login} className={cn('inline-flex items-center rounded-full border bg-muted pl-2.5 text-xs', login === p.login && 'border-primary bg-selected')}>
            <button className="py-0.5" title={login} onClick={() => p.onTeamPick(login)}>{p.userName(login)}</button>
            <button className="ml-0.5 rounded-full p-1 text-muted-foreground hover:text-destructive" title="Убрать из команды" onClick={() => p.onTeamRemove(login)}>
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        {!p.team.length && <span className="text-xs text-muted-foreground">отметьте ☆ у исполнителя, чтобы он появился здесь</span>}
      </div>

      <div className="-mt-1 flex min-h-6 flex-wrap items-center gap-1.5">
        <span className="mr-1 text-muted-foreground">Поиски:</span>
        {p.saved.map((s) => (
          <span key={s.id} className={cn('inline-flex max-w-72 items-center rounded-full border bg-muted pl-2 text-xs', s.id === p.activeSaved && 'border-primary bg-selected')}>
            <button className="flex min-w-0 items-center gap-1 py-0.5" title={`Запустить: ${s.name}${s.query ? `\nЗапрос: ${s.query}` : ''}`} onClick={() => p.onRunSaved(s)} disabled={p.searching}>
              <BookmarkIcon className="size-3 shrink-0 text-muted-foreground" /><span className="truncate">{s.name}</span>
            </button>
            <button className="ml-0.5 rounded-full p-1 text-muted-foreground hover:text-destructive" title="Удалить сохранённый поиск" onClick={() => p.onRemoveSaved(s.id)}>
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <SaveSearch saved={p.saved} suggest={p.suggestName} onSave={p.onSaveSearch} />
      </div>

      <Collapsible open={qOpen} onOpenChange={setQOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronRightIcon className={cn('size-3.5 transition-transform', qOpen && 'rotate-90')} />
          Запрос YouTrack <span>{p.queryNote}</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1.5">
          <div className="flex items-start gap-2">
            <Textarea rows={2} spellCheck={false} className="min-h-14 flex-1 font-mono text-xs" value={p.query}
              onChange={(e) => p.onQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.onSearch(); } }} />
            <Button variant="outline" size="sm" onClick={p.onQueryReset} disabled={!p.queryEdited} title="Собрать запрос заново из полей выше">
              <RotateCcwIcon /> Из полей
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono">
            Язык поиска YouTrack: <code>assignee:</code> — исполнитель, <code>state: {'{Ревью}, {Готово}'}</code> — статус (запятая — «или»),{' '}
            <code>type: {'{…}'}</code>, <code>tag: {'{…}'}</code>, <code>project: {'{…}'}</code>. Можно править вручную.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
