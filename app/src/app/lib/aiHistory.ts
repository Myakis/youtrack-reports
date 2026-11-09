// История разговоров с ИИ: вопросы и ответы (без данных задач — они большие), чтобы найти обоснование через месяц.
import { store } from './storage';

export interface ChatTurn { kind: 'q' | 'a'; text: string; meta?: string }

export interface SavedChat {
  id: string;
  created: number;
  updated: number;
  /** «Обоснование повышения · Анна Иванова (a.ivanova) · 01.10.2026 – 31.10.2026». */
  title: string;
  goal: string;
  /** По каким задачам: «Анна Иванова (a.ivanova), участие в задачах · 01.10–31.10» и сколько их. */
  context: string;
  count: number;
  turns: ChatTurn[];
}

const KEY = 'aiHistory';
/** Сколько разговоров хранить: старые уходят. */
export const MAX_CHATS = 200;

export const loadChats = () => store.get<SavedChat[]>(KEY, []);

/** Добавить или обновить разговор (по id); новые и обновлённые — сверху. */
export function upsertChat(list: SavedChat[], chat: SavedChat): SavedChat[] {
  return [chat, ...list.filter((c) => c.id !== chat.id)].slice(0, MAX_CHATS);
}

export async function saveChat(chat: SavedChat): Promise<SavedChat[]> {
  const list = upsertChat(await loadChats(), chat);
  await store.set(KEY, list);
  return list;
}

export async function deleteChat(id: string): Promise<SavedChat[]> {
  const list = (await loadChats()).filter((c) => c.id !== id);
  await store.set(KEY, list);
  return list;
}

/** Поиск по названию, контексту и тексту — все слова запроса, без учёта регистра. */
export function filterChats(list: SavedChat[], q: string): SavedChat[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((c) => {
    const hay = [c.title, c.context, ...c.turns.map((t) => t.text)].join('\n').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
