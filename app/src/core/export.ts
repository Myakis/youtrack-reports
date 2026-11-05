// Выгрузка задач: Markdown (для модели), JSON, CSV (Excel), TXT (как в скрипте YoutrackReportByUser).
import { fmtDate, type Issue } from './youtrack';
import { rolesLabel } from './participation';

export interface ExportMeta {
  assignee: string;     // «Иван Петров (ivan.petrov)»
  query: string;
  period?: string;      // «01.10.2026 – 31.10.2026 (по дате решения)»
  generated: number;
}

export interface ExportOptions {
  description?: boolean;   // по умолчанию да
  comments?: boolean;      // по умолчанию да
  fields?: boolean;        // все поля задачи; по умолчанию да
  prompt?: boolean;        // инструкция для модели в начале
}

/** Поля, которые уже есть отдельными строками — в «Поля» не повторяем. */
const SKIP_FIELDS = new Set(['state', 'состояние', 'статус', 'status', 'assignee', 'исполнитель']);

export const PROMPT = [
  'Ниже — задачи, которые выполнил сотрудник за период. По ним составь отчёт для руководителя:',
  '1. Краткое резюме: что сделано в целом (3–5 предложений).',
  '2. Основные направления работы — сгруппируй задачи по смыслу (проект, доска, тема) и опиши, что сделано в каждой группе.',
  '3. Самые значимые результаты.',
  '4. Сложности и заметные обсуждения — по комментариям.',
  'Пиши по-русски, по делу, ссылайся на ключи задач (например, PRJ-123).',
].join('\n');

/** Многострочный текст как цитата Markdown, чтобы заголовки внутри описания не ломали структуру. */
function quote(s: string): string {
  return s.trim().split(/\r?\n/).map((l) => (l ? '> ' + l : '>')).join('\n');
}

export function toMarkdown(issues: Issue[], meta: ExportMeta, o: ExportOptions = {}): string {
  const out: string[] = [];
  if (o.prompt) out.push(PROMPT, '', '---', '');
  out.push(`# Задачи: ${meta.assignee}`, '');
  out.push(`- Всего задач: ${issues.length}`);
  if (meta.period) out.push(`- Период: ${meta.period}`);
  out.push(`- Запрос YouTrack: \`${meta.query}\``);
  out.push(`- Выгружено: ${fmtDate(meta.generated)}`, '');

  for (const i of issues) {
    out.push(`## ${i.key} — ${i.summary}`, '');
    const line = (k: string, v: string) => { if (v) out.push(`- **${k}:** ${v}`); };
    line('Участие сотрудника', rolesLabel(i.roles));
    line('Проект', i.project);
    line('Доски', i.boards.join('; '));
    line('Теги', i.tags.join(', '));
    line('Статус', i.state);
    line('Исполнитель', i.assignee);
    line('Автор', i.reporter);
    line('Создана', fmtDate(i.created));
    line('Решена', fmtDate(i.resolved));
    if (o.fields !== false) {
      for (const [k, v] of Object.entries(i.fields)) if (v && !SKIP_FIELDS.has(k.toLowerCase())) line(k, v);
    }
    line('Связи', i.links.map((l) => `${l.type} ${l.keys.join(', ')}`).join('; '));
    line('Ссылка', i.url);
    out.push('');
    if (o.description !== false) {
      out.push('### Описание', '', i.description.trim() ? quote(i.description) : '_нет описания_', '');
    }
    if (o.comments !== false && i.comments.length) {
      out.push(`### Комментарии (${i.comments.length})`, '');
      for (const c of i.comments) out.push(`**${c.author}**, ${fmtDate(c.created)}:`, '', quote(c.text), '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function toJSON(issues: Issue[], meta: ExportMeta, o: ExportOptions = {}): string {
  const items = issues.map((i) => ({
    key: i.key,
    summary: i.summary,
    ...(i.roles.length ? { roles: rolesLabel(i.roles).split(', ') } : {}),
    ...(o.description !== false ? { description: i.description } : {}),
    project: i.project,
    boards: i.boards,
    tags: i.tags,
    state: i.state,
    assignee: i.assignee,
    reporter: i.reporter,
    created: i.created ? new Date(i.created).toISOString() : null,
    resolved: i.resolved ? new Date(i.resolved).toISOString() : null,
    ...(o.fields !== false ? { fields: i.fields } : {}),
    links: i.links,
    ...(o.comments !== false ? { comments: i.comments.map((c) => ({ author: c.author, created: new Date(c.created).toISOString(), text: c.text })) } : {}),
    url: i.url,
  }));
  return JSON.stringify({
    ...(o.prompt ? { instruction: PROMPT } : {}),
    assignee: meta.assignee, period: meta.period || null, query: meta.query,
    generated: new Date(meta.generated).toISOString(), count: issues.length, issues: items,
  }, null, 2) + '\n';
}

/** CSV для Excel: «;» и BOM, чтобы кириллица открылась без настройки. */
export function toCSV(issues: Issue[], o: ExportOptions = {}): string {
  const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ['Ключ', 'Название', 'Проект', 'Доски', 'Теги', 'Статус', 'Исполнитель', 'Создана', 'Решена', 'Ссылка'];
  if (o.description !== false) head.push('Описание');
  if (o.comments !== false) head.push('Комментарии');
  const withRoles = issues.some((i) => i.roles.length);
  if (withRoles) head.splice(2, 0, 'Участие');
  const rows = [head];
  for (const i of issues) {
    const r = [i.key, i.summary, i.project, i.boards.join('; '), i.tags.join(', '), i.state, i.assignee, fmtDate(i.created), fmtDate(i.resolved), i.url];
    if (withRoles) r.splice(2, 0, rolesLabel(i.roles));
    if (o.description !== false) r.push(i.description);
    if (o.comments !== false) r.push(i.comments.map((c) => `${c.author}, ${fmtDate(c.created)}: ${c.text}`).join('\n\n'));
    rows.push(r);
  }
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** TXT как в скрипте YoutrackReportByUser: «- KEY: название (Описание: описание в одну строку)». */
export function toTxt(issues: Issue[]): string {
  if (!issues.length) return 'Нет задач\n';
  const one = (s: string) => s.split(/\s+/).filter(Boolean).join(' ');
  return issues.map((i) => `- ${i.key}: ${i.summary} (Описание: ${one(i.description) || '<пусто>'})`).join('\n\n') + '\n';
}

/** Имя файла: «Задачи_ivan.petrov_2026-10-29.md». */
export function fileName(login: string, ext: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const safe = (login || 'все').replace(/[^\p{L}\p{N}._-]+/gu, '_');
  return `Задачи_${safe}_${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.${ext}`;
}
