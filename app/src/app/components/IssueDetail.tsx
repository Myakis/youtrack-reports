// Детали задачи: поля, описание и комментарии.
import { ExternalLinkIcon } from 'lucide-react';
import { fmtDate, type Issue } from '../../core/youtrack';
import { fmtMinutes } from '../../core/time';
import { Pill, RoleBadges } from './IssueTable';

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mt-4 mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>
);
const None = () => <span className="text-muted-foreground">—</span>;

export function IssueDetail({ issue: i }: { issue: Issue | null }) {
  if (!i) return <div className="px-4 py-8 text-center text-muted-foreground">Щёлкните задачу, чтобы увидеть описание и комментарии</div>;
  const rows: [string, React.ReactNode][] = [
    ...(i.roles.length ? [['Участие', <RoleBadges roles={i.roles} />] as [string, React.ReactNode]] : []),
    ['Проект', i.project],
    ['Доски', i.boards.length ? i.boards.map((b) => <Pill key={b} kind="board">{b}</Pill>) : <None />],
    ...(i.swimlanes.length ? [['Свимлейн', i.swimlanes.map((s) => <Pill key={s} kind="lane">{s}</Pill>)] as [string, React.ReactNode]] : []),
    ['Теги', i.tags.length ? i.tags.map((t) => <Pill key={t}>{t}</Pill>) : <None />],
    ['Создана', fmtDate(i.created)],
    ['Решена', fmtDate(i.resolved)],
    ...(i.spent != null ? [['Списано', i.spent ? fmtMinutes(i.spent) : <None />] as [string, React.ReactNode]] : []),
    ['Автор', i.reporter],
    ...Object.entries(i.fields).filter(([, v]) => v),
    ...(i.links.length ? [['Связи', i.links.map((l) => `${l.type} ${l.keys.join(', ')}`).join('; ')] as [string, React.ReactNode]] : []),
  ];
  return (
    <div className="h-full overflow-auto px-4 py-3.5">
      <a className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline" href={i.url} target="_blank" rel="noopener">
        {i.key} <ExternalLinkIcon className="size-3" />
      </a>
      <h2 className="mt-0.5 text-base leading-snug font-semibold">{i.summary}</h2>
      <dl className="my-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>)}
      </dl>
      <H>Описание</H>
      {i.description.trim()
        ? <div className="rounded-md bg-muted px-3 py-2.5 text-[12.5px] break-words whitespace-pre-wrap">{i.description}</div>
        : <p className="text-muted-foreground">Нет описания</p>}
      <H>Комментарии ({i.comments.length})</H>
      {i.comments.length ? i.comments.map((c, k) => (
        <div key={k} className="mb-2.5 border-l-[3px] py-0.5 pl-2.5">
          <div className="mb-0.5 text-xs text-muted-foreground"><b className="text-foreground">{c.author}</b> · {fmtDate(c.created)}</div>
          <div className="break-words whitespace-pre-wrap">{c.text}</div>
        </div>
      )) : <p className="text-muted-foreground">Нет комментариев</p>}
    </div>
  );
}
