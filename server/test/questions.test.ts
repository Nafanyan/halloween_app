import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadQuestions, round, findQuestion, questionId, QuestionsError } from '../src/questions';

let dir: string;
let file: string;
let media: string;

const q = (answer: string | null = 'Баба Яга', extra: object = {}) => ({ value: 100, text: 'Кто?', ...(answer === null ? {} : { answer }), ...extra });
const pack = (themes: unknown[]) => ({ rounds: [{ name: 'Раунд 1', themes }] });
const write = (data: unknown) => fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-'));
  file = path.join(dir, 'questions.json');
  media = path.join(dir, 'media');
  fs.mkdirSync(media);
});

describe('loadQuestions', () => {
  it('loads valid pack', () => {
    write(pack([{ name: 'Сказки', questions: [q()] }]));
    expect(loadQuestions(file, media).rounds[0].themes[0].questions[0].answer).toBe('Баба Яга');
  });

  it('reports missing field with path', () => {
    write(pack([
      { name: 'A', questions: [q(), q(), q()] },
      { name: 'B', questions: [q(), q(), q(null)] },
    ]));
    expect(() => loadQuestions(file, media)).toThrow('rounds[0].themes[1].questions[2].answer');
  });

  it('reports missing media file', () => {
    write(pack([{ name: 'A', questions: [q('x', { image: 'nope.jpg' })] }]));
    expect(() => loadQuestions(file, media)).toThrow(/nope\.jpg/);
  });

  it('accepts existing media file', () => {
    fs.writeFileSync(path.join(media, 'a.mp3'), '');
    write(pack([{ name: 'A', questions: [q('x', { audio: 'a.mp3' })] }]));
    expect(loadQuestions(file, media).rounds[0].themes[0].questions[0].audio).toBe('a.mp3');
  });

  it('rejects non-positive-integer value', () => {
    write(pack([{ name: 'A', questions: [q('x', { value: 0 })] }]));
    expect(() => loadQuestions(file, media)).toThrow('rounds[0].themes[0].questions[0].value');
  });

  it('rejects empty rounds', () => {
    write({ rounds: [] });
    expect(() => loadQuestions(file, media)).toThrow(QuestionsError);
  });

  it('round() accepts empty themes and questions', () => {
    expect(round({ name: 'Р', themes: [{ name: 'Т', questions: [] }] }, 'rounds[0]', media).themes[0].questions).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    write('{');
    expect(() => loadQuestions(file, media)).toThrow(QuestionsError);
    expect(() => loadQuestions(file, media)).toThrow(file);
  });
});

describe('findQuestion', () => {
  const p = { rounds: [{ name: 'R', themes: [{ name: 'T0', questions: [] }, { name: 'T1', questions: [
    { value: 1, text: 'a', answer: 'a' }, { value: 2, text: 'b', answer: 'b' }, { value: 3, text: 'c', answer: 'c' },
  ] }] }] };

  it('finds by id', () => {
    expect(questionId(0, 1, 2)).toBe('0/1/2');
    const r = findQuestion(p, '0/1/2');
    expect(r?.question.answer).toBe('c');
    expect(r?.theme.name).toBe('T1');
    expect(r?.round.name).toBe('R');
  });

  it('returns null for bad ids', () => {
    for (const id of ['9/9/9', 'abc', '0/1', '0/1/2/3', '-1/0/0', '0/0/-1', '0/1/1.5', '0/1/x', '0//1', '0/1/3'])
      expect(findQuestion(p, id)).toBeNull();
  });
});
