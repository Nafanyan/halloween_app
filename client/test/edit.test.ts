import { describe, expect, it } from 'vitest';
import type { EditRound, Question, Round, Theme } from '@quiz/shared';
import {
  addQuestion, addRound, addTheme, moveQuestion, moveRound, moveTheme, nextValue,
  removeQuestion, removeRound, removeTheme, renameRound, renameTheme, stripUrls,
  updateQuestion,
} from '../src/admin/questions/edit';

const q = (value: number, text = `q${value}`): Question => ({ value, text, answer: `a${value}` });
const theme = (name: string, questions: Question[] = []): Theme => ({ name, questions });
const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === 'object') {
    Object.values(v as object).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
};
const sample = (): Round[] => deepFreeze([
  { name: 'R1', themes: [theme('A', [q(100), q(300)]), theme('B', [q(100)])] },
  { name: 'R2', themes: [theme('C')] },
]) as Round[];

describe('round operations', () => {
  it('addRound добавляет раунд с именем по количеству и пустыми темами', () => {
    const rs = sample();
    const out = addRound(rs);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ name: 'Раунд 3', themes: [] });
    expect(out.slice(0, 2)).toEqual(rs);
  });

  it('addRound на пустом списке называет раунд «Раунд 1»', () => {
    expect(addRound([])).toEqual([{ name: 'Раунд 1', themes: [] }]);
  });

  it('renameRound меняет имя', () => {
    const out = renameRound(sample(), 1, 'Финал');
    expect(out[1].name).toBe('Финал');
    expect(out[0].name).toBe('R1');
  });

  it('renameRound с неверным индексом возвращает тот же массив', () => {
    const rs = sample();
    expect(renameRound(rs, 5, 'X')).toBe(rs);
  });

  it('moveRound меняет раунды местами', () => {
    const out = moveRound(sample(), 0, 1);
    expect(out.map((r) => r.name)).toEqual(['R2', 'R1']);
    expect(moveRound(out, 1, -1).map((r) => r.name)).toEqual(['R1', 'R2']);
  });

  it('moveRound за границу возвращает тот же массив', () => {
    const rs = sample();
    expect(moveRound(rs, 0, -1)).toBe(rs);
    expect(moveRound(rs, rs.length - 1, 1)).toBe(rs);
    expect(moveRound(rs, 9, 1)).toBe(rs);
  });

  it('removeRound удаляет раунд', () => {
    const out = removeRound(sample(), 0);
    expect(out.map((r) => r.name)).toEqual(['R2']);
  });

  it('removeRound с неверным индексом возвращает тот же массив', () => {
    const rs = sample();
    expect(removeRound(rs, 2)).toBe(rs);
  });
});

describe('theme operations', () => {
  it('addTheme добавляет пустую тему «Новая тема» в конец раунда', () => {
    const out = addTheme(sample(), 0);
    expect(out[0].themes).toHaveLength(3);
    expect(out[0].themes[2]).toEqual({ name: 'Новая тема', questions: [] });
  });

  it('addTheme с неверным индексом возвращает тот же массив', () => {
    const rs = sample();
    expect(addTheme(rs, 4)).toBe(rs);
  });

  it('renameTheme меняет имя темы', () => {
    const out = renameTheme(sample(), 0, 1, 'Кино');
    expect(out[0].themes[1].name).toBe('Кино');
    expect(out[0].themes[0].name).toBe('A');
  });

  it('renameTheme с неверным индексом возвращает тот же массив', () => {
    const rs = sample();
    expect(renameTheme(rs, 0, 7, 'X')).toBe(rs);
    expect(renameTheme(rs, 8, 0, 'X')).toBe(rs);
  });

  it('moveTheme меняет темы местами внутри раунда', () => {
    const out = moveTheme(sample(), 0, 0, 1);
    expect(out[0].themes.map((t) => t.name)).toEqual(['B', 'A']);
    expect(moveTheme(out, 0, 1, -1)[0].themes.map((t) => t.name)).toEqual(['A', 'B']);
  });

  it('moveTheme за границу возвращает тот же массив', () => {
    const rs = sample();
    expect(moveTheme(rs, 0, 0, -1)).toBe(rs);
    expect(moveTheme(rs, 0, 1, 1)).toBe(rs);
    expect(moveTheme(rs, 3, 0, 1)).toBe(rs);
  });

  it('removeTheme удаляет тему', () => {
    const out = removeTheme(sample(), 0, 0);
    expect(out[0].themes.map((t) => t.name)).toEqual(['B']);
  });

  it('removeTheme с неверным индексом возвращает тот же массив', () => {
    const rs = sample();
    expect(removeTheme(rs, 0, 5)).toBe(rs);
    expect(removeTheme(rs, 5, 0)).toBe(rs);
  });
});

describe('question operations', () => {
  it('addQuestion добавляет вопрос в конец темы', () => {
    const out = addQuestion(sample(), 0, 0, q(500));
    expect(out[0].themes[0].questions.map((x) => x.value)).toEqual([100, 300, 500]);
  });

  it('addQuestion с неверным индексом возвращает тот же массив', () => {
    const rs = sample();
    expect(addQuestion(rs, 0, 9, q(100))).toBe(rs);
    expect(addQuestion(rs, 9, 0, q(100))).toBe(rs);
  });

  it('updateQuestion заменяет вопрос по индексу', () => {
    const out = updateQuestion(sample(), 0, 0, 1, q(999, 'новый'));
    expect(out[0].themes[0].questions[1]).toEqual(q(999, 'новый'));
    expect(out[0].themes[0].questions[0]).toEqual(q(100));
  });

  it('updateQuestion с неверным индексом возвращает тот же массив', () => {
    const rs = sample();
    expect(updateQuestion(rs, 0, 0, 5, q(1))).toBe(rs);
  });

  it('moveQuestion меняет вопросы местами', () => {
    const out = moveQuestion(sample(), 0, 0, 0, 1);
    expect(out[0].themes[0].questions.map((x) => x.value)).toEqual([300, 100]);
    expect(moveQuestion(out, 0, 0, 1, -1)[0].themes[0].questions.map((x) => x.value)).toEqual([100, 300]);
  });

  it('moveQuestion за границу возвращает тот же массив', () => {
    const rs = sample();
    expect(moveQuestion(rs, 0, 0, 0, -1)).toBe(rs);
    expect(moveQuestion(rs, 0, 0, 1, 1)).toBe(rs);
    expect(moveQuestion(rs, 0, 0, 9, 1)).toBe(rs);
  });

  it('removeQuestion удаляет вопрос по индексу', () => {
    const out = removeQuestion(sample(), 0, 0, 0);
    expect(out[0].themes[0].questions.map((x) => x.value)).toEqual([300]);
  });

  it('removeQuestion с неверным индексом возвращает тот же массив', () => {
    const rs = sample();
    expect(removeQuestion(rs, 0, 0, 4)).toBe(rs);
    expect(removeQuestion(rs, 0, 4, 0)).toBe(rs);
  });
});

describe('nextValue', () => {
  it('пустая тема даёт 100', () => {
    expect(nextValue({ name: 'T', questions: [] })).toBe(100);
  });

  it('берёт последний номинал + 100', () => {
    expect(nextValue({ name: 'T', questions: [q(100), q(300)] })).toBe(400);
  });
});

describe('stripUrls', () => {
  it('убирает imageUrl и audioUrl, оставляет image', () => {
    const input: EditRound[] = [{
      name: 'R',
      themes: [{
        name: 'T',
        questions: [
          { value: 100, text: 't', answer: 'a', image: 'x.png', imageUrl: '/media/x.png', audio: 'y.mp3', audioUrl: '/media/y.mp3' },
          { value: 200, text: 't2', answer: 'a2' },
        ],
      }],
    }];
    const out = stripUrls(input);
    expect(out).toEqual([{
      name: 'R',
      themes: [{
        name: 'T',
        questions: [
          { value: 100, text: 't', answer: 'a', image: 'x.png', audio: 'y.mp3' },
          { value: 200, text: 't2', answer: 'a2' },
        ],
      }],
    }]);
    const q0 = out[0].themes[0].questions[0] as Record<string, unknown>;
    expect('imageUrl' in q0).toBe(false);
    expect('audioUrl' in q0).toBe(false);
  });
});
