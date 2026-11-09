// Сохранённые поиски: набор фильтров под своим именем — запускается одним щелчком.
import { PRESETS } from '../../core/period';
import type { User } from '../../core/youtrack';
import { loginOf, type Form } from './form';

export interface SavedSearch {
  id: string;
  name: string;
  form: Form;
  /** Запрос, исправленный вручную; нет — собирается из полей. */
  query?: string;
}

/** Имя по умолчанию: «Анна Иванова (участие) · Mobile Scrum · Этот месяц · Готово». */
export function suggestName(f: Form, users: User[]): string {
  const login = loginOf(f.assignee, users);
  const who = login ? (users.find((u) => u.login === login)?.name || login) + (f.mode === 'participant' ? ' (участие)' : '') : 'Все сотрудники';
  const period = f.preset !== 'custom' ? PRESETS.find((p) => p.v === f.preset)?.label : f.from || f.to ? `${f.from || '…'} – ${f.to || '…'}` : '';
  return [who, f.board, f.project, period, f.states].map((s) => (s || '').trim()).filter(Boolean).join(' · ') || 'Поиск';
}

/** Добавить или заменить поиск с тем же именем (без учёта регистра); новые — в конец. */
export function upsertSaved(list: SavedSearch[], s: Omit<SavedSearch, 'id'>, id = Date.now().toString(36)): SavedSearch[] {
  const same = list.find((x) => x.name.trim().toLowerCase() === s.name.trim().toLowerCase());
  return same ? list.map((x) => (x === same ? { ...s, id: same.id } : x)) : [...list, { ...s, id }];
}
