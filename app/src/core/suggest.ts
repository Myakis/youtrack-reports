// Подсказки для поля со значениями через запятую («CashDash, Q4»): дополняется то значение, которое сейчас вводят.

const split = (value: string) => value.split(',').map((s) => s.trim());

/** Значение, которое сейчас вводят, — после последней запятой. */
export function currentToken(value: string): string {
  return value.slice(value.lastIndexOf(',') + 1).trim();
}

/**
 * Варианты для того, что сейчас вводят: без уже выбранных, сначала начинающиеся с введённого, затем содержащие его;
 * пустой ввод — все по порядку списка.
 */
export function suggest(all: string[], value: string, limit = 50): string[] {
  const chosen = new Set(split(value).slice(0, -1).map((s) => s.toLowerCase()).filter(Boolean));
  const q = currentToken(value).toLowerCase();
  const starts: string[] = [], contains: string[] = [];
  for (const v of all) {
    const low = v.toLowerCase();
    if (chosen.has(low)) continue;
    if (!q || low.startsWith(q)) starts.push(v);
    else if (low.includes(q)) contains.push(v);
  }
  const out = [...starts, ...contains];
  // Уже введено ровно это значение — подсказывать нечего
  if (out.length === 1 && out[0].toLowerCase() === q) return [];
  return out.slice(0, limit);
}

/** Пункт списка выбора: значение, подпись и серая подсказка справа (проекты доски, ключ проекта). */
export interface PickItem { value: string; label: string; hint?: string }

/**
 * Поиск в списке выбора по подписи и подсказке: сначала те, где подпись начинается с введённого,
 * затем остальные совпадения; порядок списка внутри групп сохраняется.
 */
export function filterItems(items: PickItem[], query: string): PickItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const starts: PickItem[] = [], contains: PickItem[] = [];
  for (const it of items) {
    const label = it.label.toLowerCase();
    if (label.startsWith(q)) starts.push(it);
    else if (label.includes(q) || (it.hint || '').toLowerCase().includes(q)) contains.push(it);
  }
  return [...starts, ...contains];
}

/** Подставить выбранное вместо того, что вводят, и поставить запятую для следующего. */
export function applySuggestion(value: string, pick: string): string {
  const done = split(value).slice(0, -1).filter(Boolean);
  return [...done, pick].join(', ') + ', ';
}

/** Убрать висящую запятую в конце: «CashDash, » → «CashDash». */
export function tidyList(value: string): string {
  return split(value).filter(Boolean).join(', ');
}

/** Список без повторов (без учёта регистра), по алфавиту. */
export function uniqSorted(list: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of list) {
    const t = v.trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ru'));
}
