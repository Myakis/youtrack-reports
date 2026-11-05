import { describe, expect, it } from 'vitest';
import { promoPrompt, reportPrompt, PROMO_COLUMN } from '../src/core/prompts';
import { PROMPT } from '../src/core/export';

describe('запрос «Обоснование повышения» — для ячейки Google-таблицы', () => {
  const base = { name: 'Иван Петров (i.petrov)', period: '01.01.2026 – 31.12.2026 (по дате решения)', count: 142, from: 'Middle', to: 'Senior', about: 'Ведёт UI kit.\nНаставник для новичков.' };

  it('колонка, грейды, период, число задач и описание руководителя', () => {
    const p = promoPrompt(base);
    expect(PROMO_COLUMN).toBe('Письменное обоснование пересмотра');
    expect(p.split('\n')[0]).toBe('Подготовь текст для ячейки Google-таблицы в колонке «Письменное обоснование пересмотра» — обоснование повышения сотрудника Иван Петров (i.petrov) с грейда Middle на грейд Senior.');
    expect(p).toContain('за период 01.01.2026 – 31.12.2026 (по дате решения): всего 142.');
    expect(p).toContain('Описание сотрудника от руководителя:\nВедёт UI kit.\nНаставник для новичков.');
    expect(p).toContain('почему он соответствует грейду Senior');
  });

  it('краткая сводка без списка задач и без оформления', () => {
    const p = promoPrompt(base);
    expect(p).toContain('4–7 предложений');
    expect(p).toContain('Без списка задач, их ключей и названий');
    expect(p).toContain('общее количество задач (142)');
    expect(p).toContain('без Markdown');
    expect(p).toContain('без вступления');
    expect(p).not.toMatch(/PRJ-123|подкрепляй ключами/);
  });

  it('пустые поля не ломают текст', () => {
    const p = promoPrompt({ ...base, from: ' ', to: '', about: '  ', period: undefined });
    expect(p.split('\n')[0]).toMatch(/сотрудника Иван Петров \(i\.petrov\) на следующий грейд\.$/);
    expect(p).toContain('почему он соответствует следующему грейду');
    expect(p).not.toContain('Описание сотрудника от руководителя');
    expect(p).toContain('участвовал сотрудник: всего 142.');
  });

  it('отчёт — прежняя инструкция', () => {
    expect(reportPrompt()).toBe(PROMPT);
  });
});
