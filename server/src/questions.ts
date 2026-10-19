import fs from 'node:fs';
import path from 'node:path';
import type { Question, QuestionId, QuestionPack, Round, Theme } from '@quiz/shared';

export class QuestionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionsError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (p: string, problem: string): never => { throw new QuestionsError(`${p}: ${problem}`); };

export const IMAGE_EXTS = ['jpg', 'png', 'webp', 'svg'];
export const AUDIO_EXTS = ['mp3', 'ogg', 'wav', 'm4a'];

function str(o: Obj, key: string, p: string, max: number): string {
  const v = o[key];
  if (typeof v !== 'string' || v.trim() === '') fail(`${p}.${key}`, 'ожидается непустая строка');
  if ([...(v as string).trim()].length > max) fail(`${p}.${key}`, `слишком длинная строка (максимум ${max} символов)`);
  return v as string;
}

function list(v: unknown, p: string): unknown[] {
  if (!Array.isArray(v) || v.length === 0) fail(p, 'ожидается непустой массив');
  return v as unknown[];
}

function arr(v: unknown, p: string): unknown[] {
  if (!Array.isArray(v)) fail(p, 'ожидается массив');
  return v as unknown[];
}

export function media(o: Obj, key: string, p: string, mediaDir: string, exts?: string[]): string | undefined {
  const at = p ? `${p}.${key}` : key;
  if (o[key] === undefined) return undefined;
  const name = o[key];
  if (typeof name !== 'string' || name === '') return fail(at, 'ожидается имя файла (строка)');
  if (exts && !exts.includes(path.extname(name).slice(1).toLowerCase()))
    fail(at, `недопустимый тип файла (ожидается: ${exts.join(', ')})`);
  const file = path.resolve(mediaDir, name);
  if (path.dirname(file) !== path.resolve(mediaDir) || !fs.existsSync(file))
    fail(at, `файл не найден в папке медиа: ${name}`);
  return name;
}

function question(v: unknown, p: string, mediaDir: string): Question {
  if (!isObj(v)) return fail(p, 'ожидается объект');
  const o = v as Obj;
  if (!Number.isInteger(o.value) || (o.value as number) < 1 || (o.value as number) > 100000)
    fail(`${p}.value`, 'ожидается целое число от 1 до 100000');
  const q: Question = { value: o.value as number, text: str(o, 'text', p, 1000), answer: str(o, 'answer', p, 500) };
  const image = media(o, 'image', p, mediaDir, IMAGE_EXTS);
  const audio = media(o, 'audio', p, mediaDir, AUDIO_EXTS);
  if (image) q.image = image;
  if (audio) q.audio = audio;
  return q;
}

function theme(v: unknown, p: string, mediaDir: string): Theme {
  if (!isObj(v)) return fail(p, 'ожидается объект');
  const o = v as Obj;
  return {
    name: str(o, 'name', p, 60),
    questions: arr(o.questions, `${p}.questions`).map((x, i) => question(x, `${p}.questions[${i}]`, mediaDir)),
  };
}

export function round(v: unknown, p: string, mediaDir: string): Round {
  if (!isObj(v)) return fail(p, 'ожидается объект');
  const o = v as Obj;
  return {
    name: str(o, 'name', p, 60),
    themes: arr(o.themes, `${p}.themes`).map((x, i) => theme(x, `${p}.themes[${i}]`, mediaDir)),
  };
}

export function loadQuestions(questionsPath: string, mediaDir: string): QuestionPack {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  } catch (e) {
    throw new QuestionsError(`${questionsPath}: не удалось прочитать JSON (${(e as Error).message})`);
  }
  if (!isObj(raw)) return fail('rounds', 'ожидается объект с полем rounds');
  return {
    rounds: list((raw as Obj).rounds, 'rounds').map((x, i) => round(x, `rounds[${i}]`, mediaDir)),
  };
}

export function questionId(r: number, t: number, q: number): QuestionId {
  return `${r}/${t}/${q}`;
}

export function findQuestion(
  pack: QuestionPack,
  id: QuestionId,
): { round: Round; theme: Theme; question: Question } | null {
  const parts = id.split('/');
  if (parts.length !== 3 || !parts.every((s) => /^\d+$/.test(s))) return null;
  const [r, t, q] = parts.map(Number);
  const round = pack.rounds[r];
  const theme = round?.themes[t];
  const question = theme?.questions[q];
  return question ? { round, theme, question } : null;
}
