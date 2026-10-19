import type { EditQuestion, EditRound, Question, Round, Theme } from '@quiz/shared';

// Чистые операции над структурой вопросов. Вход не мутируется; если операция
// не меняет данные (индекс вне диапазона, ход за границу), возвращается тот же объект.

const inRange = (items: unknown[], i: number) => Number.isInteger(i) && i >= 0 && i < items.length;

/** Заменяет элемент по индексу; если fn вернула тот же объект или индекс неверный — тот же массив. */
function patch<T>(items: T[], i: number, fn: (x: T) => T): T[] {
  if (!inRange(items, i)) return items;
  const next = fn(items[i]);
  return next === items[i] ? items : items.map((x, k) => (k === i ? next : x));
}

/** Меняет элемент местами с соседним (dir = -1 или 1); за границей — тот же массив. */
function swap<T>(items: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (!inRange(items, i) || !inRange(items, j)) return items;
  const out = items.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function without<T>(items: T[], i: number): T[] {
  return inRange(items, i) ? items.filter((_, k) => k !== i) : items;
}

function withThemes(round: Round, fn: (themes: Theme[]) => Theme[]): Round {
  const themes = fn(round.themes);
  return themes === round.themes ? round : { ...round, themes };
}

function withQuestions(theme: Theme, fn: (questions: Question[]) => Question[]): Theme {
  const questions = fn(theme.questions);
  return questions === theme.questions ? theme : { ...theme, questions };
}

const inThemes = (rounds: Round[], r: number, fn: (themes: Theme[]) => Theme[]): Round[] =>
  patch(rounds, r, (round) => withThemes(round, fn));

const inQuestions = (rounds: Round[], r: number, t: number, fn: (questions: Question[]) => Question[]): Round[] =>
  inThemes(rounds, r, (themes) => patch(themes, t, (theme) => withQuestions(theme, fn)));

export function addRound(rounds: Round[]): Round[] {
  return [...rounds, { name: `Раунд ${rounds.length + 1}`, themes: [] }];
}

export function renameRound(rounds: Round[], r: number, name: string): Round[] {
  return patch(rounds, r, (round) => ({ ...round, name }));
}

export function moveRound(rounds: Round[], r: number, dir: -1 | 1): Round[] {
  return swap(rounds, r, dir);
}

export function removeRound(rounds: Round[], r: number): Round[] {
  return without(rounds, r);
}

export function addTheme(rounds: Round[], r: number): Round[] {
  return inThemes(rounds, r, (themes) => [...themes, { name: 'Новая тема', questions: [] }]);
}

export function renameTheme(rounds: Round[], r: number, t: number, name: string): Round[] {
  return inThemes(rounds, r, (themes) => patch(themes, t, (theme) => ({ ...theme, name })));
}

export function moveTheme(rounds: Round[], r: number, t: number, dir: -1 | 1): Round[] {
  return inThemes(rounds, r, (themes) => swap(themes, t, dir));
}

export function removeTheme(rounds: Round[], r: number, t: number): Round[] {
  return inThemes(rounds, r, (themes) => without(themes, t));
}

export function addQuestion(rounds: Round[], r: number, t: number, q: Question): Round[] {
  return inQuestions(rounds, r, t, (questions) => [...questions, q]);
}

export function updateQuestion(rounds: Round[], r: number, t: number, i: number, q: Question): Round[] {
  return inQuestions(rounds, r, t, (questions) => patch(questions, i, () => q));
}

export function moveQuestion(rounds: Round[], r: number, t: number, i: number, dir: -1 | 1): Round[] {
  return inQuestions(rounds, r, t, (questions) => swap(questions, i, dir));
}

export function removeQuestion(rounds: Round[], r: number, t: number, i: number): Round[] {
  return inQuestions(rounds, r, t, (questions) => without(questions, i));
}

/** Номинал нового вопроса: последний в теме + 100, в пустой теме — 100. */
export function nextValue(theme: Theme): number {
  const last = theme.questions[theme.questions.length - 1];
  return last ? last.value + 100 : 100;
}

/** Убирает служебные imageUrl/audioUrl (пути для превью) перед отправкой на сервер. */
export function stripUrls(rounds: EditRound[]): Round[] {
  return rounds.map((round) => ({
    name: round.name,
    themes: round.themes.map((theme) => ({
      name: theme.name,
      questions: theme.questions.map(stripQuestion),
    })),
  }));
}

function stripQuestion({ imageUrl, audioUrl, ...question }: EditQuestion): Question {
  void imageUrl;
  void audioUrl;
  return question;
}
