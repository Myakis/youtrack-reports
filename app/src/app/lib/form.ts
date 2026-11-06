// Состояние формы поиска и запрос YouTrack по нему.
import { baseQuery, buildQuery, findBoard, hasSprints, type Board, type DateField, type QueryOptions, type User } from '../../core/youtrack';
import { presetRange, type Preset } from '../../core/period';

export interface Form {
  mode: 'assignee' | 'participant';
  assignee: string;
  states: string;
  project: string;
  board: string;
  /** id спринта выбранной доски; '' — все спринты. */
  sprint: string;
  types: string;
  tags: string;
  preset: string;
  from: string;
  to: string;
  dateField: DateField;
  withBoards: boolean;
  wide: boolean;
}

export function defaultForm(): Form {
  const r = presetRange('month');
  return {
    mode: 'assignee', assignee: '', states: 'Готово', project: '', board: '', sprint: '', types: '', tags: '',
    preset: 'month', from: r.from, to: r.to, dateField: 'resolved', withBoards: true, wide: false,
  };
}

/** Форма из сохранённой (в том числе от прежних версий): недостающее — по умолчанию, период пресета — на сегодня. */
export function restoreForm(saved: any): Form {
  const f = { ...defaultForm(), ...(saved || {}) } as Form;
  f.mode = f.mode === 'participant' ? 'participant' : 'assignee';
  f.withBoards = saved?.withBoards !== false;
  f.wide = !!f.wide;
  if (f.preset !== 'custom') Object.assign(f, presetRange((f.preset || 'month') as Preset));
  return f;
}

/** Логин из поля «Исполнитель»: принимаем и логин, и полное имя. */
export function loginOf(value: string, users: User[]): string {
  const v = value.trim();
  const low = v.toLowerCase();
  const u = users.find((x) => x.login.toLowerCase() === low) || users.find((x) => x.name.toLowerCase() === low);
  return u ? u.login : v;
}

export function queryOptions(f: Form, users: User[], assigneeAttr: string): QueryOptions {
  return {
    assignee: loginOf(f.assignee, users), states: f.states, types: f.types, tags: f.tags, project: f.project,
    dateField: f.dateField, from: f.from, to: f.to, assigneeAttr,
  };
}

/** В режиме «участник» в запросе — только фильтр задач: условие на сотрудника YouTrack Reports проверяет сам. */
export const formQuery = (f: Form, users: User[], attr: string) =>
  (f.mode === 'participant' ? baseQuery(queryOptions(f, users, attr)) : buildQuery(queryOptions(f, users, attr)));

export const boardOf = (f: Form, boards: Board[]) => findBoard(boards, f.board);

/** Спринт учитывается, только если он есть у выбранной доски со спринтами. */
export function sprintOf(f: Form, boards: Board[]): string {
  const b = boardOf(f, boards);
  return b && hasSprints(b) && b.sprints.some((s) => s.id === f.sprint) ? f.sprint : '';
}

/** «Mobile Scrum» или «Mobile Scrum / Спринт 42». */
export function boardLabel(f: Form, boards: Board[]): string {
  const b = boardOf(f, boards);
  if (!b) return '';
  const s = b.sprints.find((x) => x.id === sprintOf(f, boards));
  return s ? `${b.name} / ${s.name}` : b.name;
}
