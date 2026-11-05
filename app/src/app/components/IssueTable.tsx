// Таблица найденных задач: галочки, сортировка по заголовку, выбор строки, двойной щелчок — открыть в YouTrack.
import { useEffect, useRef } from 'react';
import { ArrowDownIcon, ArrowUpIcon, MessageSquareIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fmtDate, type Issue } from '../../core/youtrack';
import { ROLE_NAMES, type Role } from '../../core/participation';

export type SortKey = 'key' | 'summary' | 'state' | 'project' | 'boards' | 'resolved' | 'comments';

export function Pill({ children, kind = 'tag', className }: { children: React.ReactNode; kind?: 'tag' | 'board' | 'role' | 'assignee'; className?: string }) {
  return (
    <span className={cn('mr-1 mb-0.5 inline-block max-w-full truncate rounded px-1.5 align-top text-[11.5px] leading-5',
      kind === 'tag' && 'bg-muted', kind === 'board' && 'bg-board-bg text-board', kind === 'role' && 'bg-selected', kind === 'assignee' && 'bg-ok-bg text-ok', className)}>
      {children}
    </span>
  );
}

export const RoleBadges = ({ roles }: { roles: string[] }) => (
  <>{roles.map((r) => <Pill key={r} kind={r === 'assignee' ? 'assignee' : 'role'}>{ROLE_NAMES[r as Role] || r}</Pill>)}</>
);

export interface IssueTableProps {
  list: Issue[];
  excluded: Set<string>;
  selected: string;
  sortKey: SortKey;
  sortDir: 1 | -1;
  withRoles: boolean;
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

  const head = (k: SortKey | null, label: React.ReactNode, className?: string, title?: string) => (
    <TableHead title={title} className={cn('sticky top-0 z-10 h-8 bg-card text-xs text-muted-foreground', k && 'cursor-pointer select-none hover:text-foreground', className)}
      onClick={k ? () => p.onSort(k) : undefined}>
      <span className="inline-flex items-center gap-1">
        {label}
        {k && p.sortKey === k && (p.sortDir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
      </span>
    </TableHead>
  );

  return (
    <div className="relative min-h-0 flex-1 overflow-auto [&>[data-slot=table-container]]:overflow-visible">
      <Table className={cn('table-fixed', p.withRoles ? 'min-w-[1130px]' : 'min-w-[980px]')}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky top-0 z-10 h-8 w-9 bg-card">
              <Checkbox title="Отметить все видимые" checked={p.list.length > 0 && n === p.list.length ? true : n > 0 ? 'indeterminate' : false}
                onCheckedChange={(v) => p.onToggleAll(!!v)} />
            </TableHead>
            {head('key', 'Ключ', 'w-24')}
            {head('summary', 'Название')}
            {head('state', 'Статус', 'w-30')}
            {head('project', 'Проект', 'w-30')}
            {head('boards', 'Доски', 'w-40')}
            {head(null, 'Теги', 'w-36')}
            {p.withRoles && head(null, 'Участие', 'w-38')}
            {head('resolved', 'Решена', 'w-24')}
            {head('comments', <MessageSquareIcon className="size-3.5" />, 'w-12 text-right', 'Комментарии')}
          </TableRow>
        </TableHeader>
        <TableBody ref={bodyRef}>
          {p.list.map((i) => {
            const off = p.excluded.has(i.key);
            return (
              <TableRow key={i.key} data-key={i.key} data-state={i.key === p.selected ? 'selected' : undefined}
                className={cn('cursor-pointer data-[state=selected]:bg-selected', off && '[&>td:not(:first-child)]:opacity-45')}
                onClick={() => p.onSelect(i.key)} onDoubleClick={() => p.onOpen(i)}>
                <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={!off} onCheckedChange={(v) => p.onToggle(i.key, !!v)} />
                </TableCell>
                <TableCell className="py-1.5 font-mono text-xs">{i.key}</TableCell>
                <TableCell className="truncate py-1.5" title={i.summary}>{i.summary}</TableCell>
                <TableCell className="py-1.5" title={i.state}><Pill>{i.state}</Pill></TableCell>
                <TableCell className="truncate py-1.5" title={i.project}>{i.project}</TableCell>
                <TableCell className="truncate py-1.5" title={i.boards.join('\n')}>{i.boards.map((b) => <Pill key={b} kind="board">{b}</Pill>)}</TableCell>
                <TableCell className="truncate py-1.5" title={i.tags.join(', ')}>{i.tags.map((t) => <Pill key={t}>{t}</Pill>)}</TableCell>
                {p.withRoles && <TableCell className="truncate py-1.5"><RoleBadges roles={i.roles} /></TableCell>}
                <TableCell className="py-1.5">{fmtDate(i.resolved, false)}</TableCell>
                <TableCell className="py-1.5 text-right text-muted-foreground">{i.comments.length || ''}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!p.list.length && <div className="px-4 py-8 text-center text-muted-foreground">{p.empty}</div>}
    </div>
  );
}
