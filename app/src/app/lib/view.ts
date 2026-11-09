// Вид таблицы и страницы: какие колонки и в каком порядке, плотность строк, размер текста.

export type ColId =
  | 'key' | 'summary' | 'state' | 'type' | 'project' | 'assignee' | 'boards' | 'swimlanes' | 'tags'
  | 'roles' | 'flow' | 'spent' | 'created' | 'resolved' | 'comments';

/** Колонки по умолчанию в этом порядке; type и created по умолчанию скрыты. */
export const COLUMNS: { id: ColId; name: string; hint?: string }[] = [
  { id: 'key', name: 'Ключ' },
  { id: 'summary', name: 'Название' },
  { id: 'state', name: 'Статус' },
  { id: 'type', name: 'Тип' },
  { id: 'project', name: 'Проект' },
  { id: 'assignee', name: 'Исполнитель', hint: 'когда в задачах несколько исполнителей' },
  { id: 'boards', name: 'Доски' },
  { id: 'swimlanes', name: 'Свимлейн', hint: 'когда включены «Свимлейны»' },
  { id: 'tags', name: 'Теги' },
  { id: 'roles', name: 'Участие', hint: 'в режиме «участник»' },
  { id: 'flow', name: 'Путь по статусам', hint: 'когда включены «Статусы»' },
  { id: 'spent', name: 'Время', hint: 'когда включено «Время»' },
  { id: 'created', name: 'Создана' },
  { id: 'resolved', name: 'Решена' },
  { id: 'comments', name: 'Комментарии' },
];

export interface ColumnsConfig { order: ColId[]; hidden: ColId[] }

export const DEFAULT_COLUMNS: ColumnsConfig = { order: COLUMNS.map((c) => c.id), hidden: ['type', 'created'] };

const known = new Set<string>(COLUMNS.map((c) => c.id));

/** Сохранённые настройки (в том числе старые): неизвестные колонки — прочь, новые — на своё место по умолчанию. */
export function normalizeColumns(saved: Partial<ColumnsConfig> | null | undefined): ColumnsConfig {
  const order = (saved?.order ?? []).filter((id, i, a) => known.has(id) && a.indexOf(id) === i) as ColId[];
  for (const [i, c] of COLUMNS.entries()) {
    if (order.includes(c.id)) continue;
    // Новая колонка — после самой правой из тех, что стояли перед ней по умолчанию
    const after = Math.max(-1, ...COLUMNS.slice(0, i).map((x) => order.indexOf(x.id)));
    order.splice(after + 1, 0, c.id);
  }
  const hidden = saved?.hidden ? saved.hidden.filter((id) => known.has(id)) as ColId[] : DEFAULT_COLUMNS.hidden;
  // Название не прячем — без него таблица бессмысленна
  return { order, hidden: hidden.filter((id) => id !== 'summary') };
}

/** Сдвинуть колонку на d позиций (−1 — выше/левее). */
export function moveColumn(c: ColumnsConfig, id: ColId, d: number): ColumnsConfig {
  const order = [...c.order];
  const i = order.indexOf(id), j = i + d;
  if (i < 0 || j < 0 || j >= order.length) return c;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...c, order };
}

export const toggleColumn = (c: ColumnsConfig, id: ColId, shown: boolean): ColumnsConfig =>
  ({ ...c, hidden: shown ? c.hidden.filter((x) => x !== id) : [...new Set([...c.hidden, id])] });

export type Density = 'normal' | 'compact';

/** Размер текста: 85–130 %. */
export const SCALE_MIN = 0.85, SCALE_MAX = 1.3;
export const clampScale = (v: number) => Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, v || 1)) * 100) / 100;
export const applyScale = (v: number, root: HTMLElement = document.documentElement) => root.style.setProperty('--ui-scale', String(clampScale(v)));
