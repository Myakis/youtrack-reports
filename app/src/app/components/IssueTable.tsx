// Таблица найденных задач: галочки, сортировка по заголовку, выбор строки, двойной щелчок — открыть в YouTrack.
// Колонки — по настройке (какие и в каком порядке); колонки данных, которых нет (время, путь…), не показываются.
import { useEffect, useRef } from 'react';
import { ArrowDownIcon, ArrowUpIcon, MessageSquareIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fmtDate, type Issue } from '../../core/youtrack';
import { fmtMinutes } from '../../core/time';
import { FlowBar } from './FlowBar';
import { ROLE_NAMES, type Role } from '../../core/participation';
import type { ColId, ColumnsConfig, Density } from '../lib/view';

export type SortKey = 'key' | 'summary' | 'state' | 'type' | 'project' | 'assignee' | 'boards' | 'swimlanes' | 'spent' | 'flow' | 'created' | 'resolved' | 'comments';

export function Pill({ children, kind = 'tag', className }: { children: React.ReactNode; kind?: 'tag' | 'board' | 'lane' | 'role' | 'assignee'; className?: string }) {
  return (
    <span className={cn('mr-1 mb-0.5 inline-block max-w-full truncate rounded px-1.5 align-top text-[0.7188rem] leading-5',
      kind === 'tag' && 'bg-muted', kind === 'board' && 'bg-board-bg text-board', kind === 'lane' && 'border border-board/30 leading-[18px] text-board', kind === 'role' && 'bg-selected', kind === 'assignee' && 'bg-ok-bg text-ok', className)}>
      {children}
    </span>
  );
}

export const RoleBadges = ({ roles }: { roles: string[] }) => (
  <>{roles.map((r) => <Pill key={r} kind={r === 'assignee' ? 'assignee' : 'role'}>{ROLE_NAMES[r as Role] || r}</Pill>)}</>
);

const none = <span className="text-muted-foreground">—</span>;
const fieldOf = (i: Issue, names: string[]) => Object.entries(i.fields).find(([k]) => names.includes(k.trim().toLowerCase()))?.[1] ?? '';
export const typeOf = (i: Issue) => fieldOf(i, ['тип', 'type']);

interface ColSpec {
  id: ColId;
  header: React.ReactNode;
  /** Ширина в px; у названия нет — оно забирает остаток. */
  w?: number;
  sort?: SortKey;
  title?: string;
  right?: boolean;
  /** Колонка данных, которые загружаются не всегда. */
  needs?: 'roles' | 'swimlanes' | 'time' | 'flow' | 'people';
  cell: (i: Issue) => { node: React.ReactNode; title?: string; className?: string };
}

const SPECS: ColSpec[] = [
  { id: 'key', header: 'Ключ', w: 96, sort: 'key', cell: (i) => ({ node: i.key, className: 'font-mono text-xs' }) },
  { id: 'summary', header: 'Название', sort: 'summary', cell: (i) => ({ node: i.summary, title: i.summary, className: 'truncate' }) },
  { id: 'state', header: 'Статус', w: 120, sort: 'state', cell: (i) => ({ node: <Pill>{i.state}</Pill>, title: i.state }) },
  { id: 'type', header: 'Тип', w: 110, sort: 'type', cell: (i) => ({ node: typeOf(i) || none, title: typeOf(i), className: 'truncate' }) },
  { id: 'project', header: 'Проект', w: 120, sort: 'project', cell: (i) => ({ node: i.project, title: i.project, className: 'truncate' }) },
  { id: 'assignee', header: 'Исполнитель', w: 150, sort: 'assignee', needs: 'people', cell: (i) => ({ node: i.assignee || none, title: i.assignee, className: 'truncate' }) },
  { id: 'boards', header: 'Доски', w: 160, sort: 'boards', cell: (i) => ({ node: i.boards.map((b) => <Pill key={b} kind="board">{b}</Pill>), title: i.boards.join('\n'), className: 'truncate' }) },
  { id: 'swimlanes', header: 'Свимлейн', w: 160, sort: 'swimlanes', needs: 'swimlanes', cell: (i) => ({ node: i.swimlanes.map((x) => <Pill key={x} kind="lane">{x}</Pill>), title: i.swimlanes.join('\n'), className: 'truncate' }) },
  { id: 'tags', header: 'Теги', w: 144, cell: (i) => ({ node: i.tags.map((t) => <Pill key={t}>{t}</Pill>), title: i.tags.join(', '), className: 'truncate' }) },
  { id: 'roles', header: 'Участие', w: 152, needs: 'roles', cell: (i) => ({ node: <RoleBadges roles={i.roles} />, className: 'truncate' }) },
  { id: 'flow', header: 'Путь', w: 144, sort: 'flow', needs: 'flow', title: 'Путь по статусам; ↺ — сколько раз возвращалась назад. Сортировка: сначала с возвратами',
    cell: (i) => ({ node: i.flow ? <FlowBar flow={i.flow} resolved={!!i.resolved} /> : none }) },
  { id: 'spent', header: 'Время', w: 96, sort: 'spent', right: true, needs: 'time', title: 'Списано по учёту времени',
    cell: (i) => ({ node: i.spent ? fmtMinutes(i.spent) : none, className: 'whitespace-nowrap tabular-nums' }) },
  { id: 'created', header: 'Создана', w: 96, sort: 'created', cell: (i) => ({ node: fmtDate(i.created, false) }) },
  { id: 'resolved', header: 'Решена', w: 96, sort: 'resolved', cell: (i) => ({ node: fmtDate(i.resolved, false) }) },
  { id: 'comments', header: <MessageSquareIcon className="size-3.5" />, w: 48, sort: 'comments', right: true, title: 'Комментарии',
    cell: (i) => ({ node: i.comments.length || '', className: 'text-muted-foreground' }) },
];

export interface IssueTableProps {
  list: Issue[];
  excluded: Set<string>;
  selected: string;
  sortKey: SortKey;
  sortDir: 1 | -1;
  /** Какие данные загружены — колонки без данных не показываются. */
  has: { roles: boolean; swimlanes: boolean; time: boolean; flow: boolean; people: boolean };
  columns: ColumnsConfig;
  density: Density;
  empty: string;
  onSort: (k: SortKey) => void;
  onToggle: (key: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onSelect: (key: string) => void;
  onOpen: (issue: Issue) => void;
}

export function IssueTable(p: IssueTableProps) {
  const n = p.list.filter((i) => !p.excluded.has(i.key)).length;
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    if (p.selected) bodyRef.current?.querySelector<HTMLElement>(`tr[data-key="${CSS.escape(p.selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [p.selected]);

  const cols = p.columns.order
    .filter((id) => !p.columns.hidden.includes(id))
    .map((id) => SPECS.find((c) => c.id === id)!)
    .filter((c) => c && (!c.needs || p.has[c.needs]));
  const minWidth = 36 + 280 + cols.reduce((a, c) => a + (c.w ?? 0), 0);
  const py = p.density === 'compact' ? 'py-0.5' : 'py-1.5';

  return (
    <div className="relative min-h-0 flex-1 overflow-auto [&>[data-slot=table-container]]:overflow-visible">
      <Table className={cn('table-fixed', p.density === 'compact' && 'text-[0.75rem]')} style={{ minWidth: `${minWidth / 16}rem` }}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky top-0 z-10 h-8 w-9 bg-card">
              <Checkbox title="Отметить все видимые" checked={p.list.length > 0 && n === p.list.length ? true : n > 0 ? 'indeterminate' : false}
                onCheckedChange={(v) => p.onToggleAll(!!v)} />
            </TableHead>
            {cols.map((c) => (
              <TableHead key={c.id} title={c.title} style={c.w ? { width: `${c.w / 16}rem` } : undefined}
                className={cn('sticky top-0 z-10 h-8 bg-card text-xs text-muted-foreground', c.right && 'text-right', c.sort && 'cursor-pointer select-none hover:text-foreground')}
                onClick={c.sort ? () => p.onSort(c.sort!) : undefined}>
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {c.sort && p.sortKey === c.sort && (p.sortDir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody ref={bodyRef}>
          {p.list.map((i) => {
            const off = p.excluded.has(i.key);
            return (
              <TableRow key={i.key} data-key={i.key} data-state={i.key === p.selected ? 'selected' : undefined}
                className={cn('cursor-pointer data-[state=selected]:bg-selected', off && '[&>td:not(:first-child)]:opacity-45')}
                onClick={() => p.onSelect(i.key)} onDoubleClick={() => p.onOpen(i)}>
                <TableCell className={py} onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={!off} onCheckedChange={(v) => p.onToggle(i.key, !!v)} />
                </TableCell>
                {cols.map((c) => {
                  const x = c.cell(i);
                  return <TableCell key={c.id} title={x.title} className={cn(py, c.right && 'text-right', x.className)}>{x.node}</TableCell>;
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!p.list.length && <div className="px-4 py-8 text-center text-muted-foreground">{p.empty}</div>}
    </div>
  );
}
