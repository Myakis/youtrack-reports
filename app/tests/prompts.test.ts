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

describe('свои промпты целей', async () => {
  const { fillPrompt, goalPrompt, defaultTemplate } = await import('../src/core/prompts');
  const info = { name: 'Иван Петров (i.petrov)', period: '01.01.2026 – 31.12.2026', count: 42, from: 'Middle', to: 'Senior', about: 'Ведёт UI kit.' };

  it('подстановки без учёта регистра и пробелов; неизвестные остаются', () => {
    expect(fillPrompt('{Сотрудник}: {задач} задач за {период}, {грейд} → { целевой грейд }. {описание} {неизвестно}', info))
      .toBe('Иван Петров (i.petrov): 42 задач за 01.01.2026 – 31.12.2026, Middle → Senior. Ведёт UI kit. {неизвестно}');
    expect(fillPrompt('за {период}', { ...info, period: undefined })).toBe('за весь период');
  });

  it('без цели — пустой запрос; без своего — стандартный; свой — с подстановками', () => {
    expect(goalPrompt('none', { report: 'x' }, info)).toBe('');
    expect(goalPrompt('report', {}, info)).toBe(reportPrompt());
    expect(goalPrompt('promo', { promo: '  ' }, info)).toBe(promoPrompt(info));
    expect(goalPrompt('report', { report: 'Кратко по {задач} задачам' }, info)).toBe('Кратко по 42 задачам');
  });

  it('стандартный шаблон обоснования — с подстановками вместо данных', () => {
    const t = defaultTemplate('promo');
    expect(t).toContain('сотрудника {сотрудник} с грейда {грейд} на грейд {целевой грейд}');
    expect(fillPrompt(t, info)).toBe(promoPrompt(info));
  });
});

describe('готовые цели', async () => {
  const { goalPrompt, defaultTemplate, GOALS, GOAL_NAMES, isGoal } = await import('../src/core/prompts');
  const info = { name: 'Иван Петров (i.petrov)', period: '01.10.2026 – 31.10.2026', count: 17, from: '', to: '', about: '' };
  const all = GOALS.map((g) => g.v).filter((g) => g !== 'none') as Exclude<(typeof GOALS)[number]['v'], 'none'>[];

  it('у каждой цели есть название и непустой стандартный промпт без незаполненных подстановок', () => {
    expect(all).toHaveLength(11);
    for (const g of all) {
      expect(GOAL_NAMES[g]).toBeTruthy();
      expect(defaultTemplate(g).length).toBeGreaterThan(100);
      expect(goalPrompt(g, {}, info)).not.toMatch(/\{(сотрудник|период|задач|описание|грейд|целевой грейд)\}/);
    }
  });

  it('данные подставляются; пустое описание — строка выпадает, заполненное — попадает', () => {
    const p = goalPrompt('review', {}, info);
    expect(p).toContain('сотрудника Иван Петров (i.petrov) к performance review за период 01.10.2026 – 31.10.2026');
    expect(p).toContain('его задачи (17)');
    expect(p).not.toContain('Что важно подчеркнуть');
    expect(goalPrompt('oneOnOne', {}, { ...info, about: 'Обсудить нагрузку' })).toContain('Заметки руководителя: Обсудить нагрузку');
  });

  it('свой промпт заменяет стандартный; сохранённая неизвестная цель не принимается', () => {
    expect(goalPrompt('sprint', { sprint: 'Итоги за {период}' }, info)).toBe('Итоги за 01.10.2026 – 31.10.2026');
    expect(isGoal('retro')).toBe(true);
    expect(isGoal('something')).toBe(false);
  });
});
