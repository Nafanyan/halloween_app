import { useEffect, useState } from 'react';
import type { ErrorCode } from '@quiz/shared';
import { socket } from '../socket';

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  UNAUTHORIZED: 'Нет доступа',
  INVALID_POINTS: 'Нужно целое число',
  ALREADY_PLAYED: 'Вопрос уже сыгран',
  QUESTION_ACTIVE: 'Сначала закройте текущий вопрос',
  NO_ANSWERER: 'Никто не отвечает',
  NOT_FOUND: 'Не найдено',
  WRONG_PHASE: 'Сейчас нельзя',
  INVALID_ITEM: 'Проверьте поля предмета',
  SOLD_OUT: 'Предмет распродан',
  NOT_ENOUGH_POINTS: 'Не хватает очков',
  NO_QUESTIONS: 'В игре нет вопросов',
  GAME_BROKEN: 'Игра повреждена — исправьте game.json',
  GAME_ACTIVE: 'Нельзя удалить активную игру',
  INVALID_SETTINGS: 'Проверьте поля настроек',
  SAVE_FAILED: 'Не удалось сохранить',
};

export const errorMessage = (code: ErrorCode): string => MESSAGES[code] ?? 'Ошибка';

let toastText: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(t: string | null) => void>();

export function showToast(text: string) {
  toastText = text;
  listeners.forEach((l) => l(toastText));
  clearTimeout(timer);
  timer = setTimeout(() => {
    toastText = null;
    listeners.forEach((l) => l(null));
  }, 3000);
}

export function useToast(): string | null {
  const [t, setT] = useState(toastText);
  useEffect(() => {
    listeners.add(setT);
    return () => {
      listeners.delete(setT);
    };
  }, []);
  return t;
}

type Res = { ok: true; id?: string } | { ok: false; error: ErrorCode };

/** Emit an admin event; show an error toast if the ack reports failure, else run onOk; onDone runs after any ack. */
export function call(event: string, payload?: object, onOk?: (res: { ok: true; id?: string }) => void, onDone?: () => void): void {
  const ack = (res: Res) => {
    if (!res.ok) showToast(errorMessage(res.error));
    else onOk?.(res);
    onDone?.();
  };
  const emit = socket.emit.bind(socket) as (...a: unknown[]) => void;
  if (payload === undefined) emit(event, ack);
  else emit(event, payload, ack);
}

/** Parse a number field; null for empty input (caller must not send). */
export function parseNum(s: string): number | null {
  return s.trim() === '' ? null : Number(s);
}

const PIN_KEY = 'quiz.adminPin';

export function loadPin(): string | null {
  try { return sessionStorage.getItem(PIN_KEY); } catch { return null; }
}

export function savePin(pin: string | null): void {
  try {
    if (pin === null) sessionStorage.removeItem(PIN_KEY); else sessionStorage.setItem(PIN_KEY, pin);
  } catch { /* ignore */ }
}

export function uploadErrorMessage(status: number | undefined): string {
  if (status === 413) return 'Файл слишком большой';
  if (status === 415) return 'Этот формат не подходит';
  if (status === 401) return 'Нет доступа';
  return 'Не удалось загрузить файл';
}

/** Upload a media file into a game; resolves with the stored file name and its /media URL. */
export async function uploadMedia(gameId: string, blob: Blob): Promise<{ file: string; url: string }> {
  const pin = loadPin();
  if (!pin) throw Object.assign(new Error('no pin'), { status: 401 });
  const res = await fetch(`/api/games/${gameId}/media`, {
    method: 'POST',
    headers: { 'X-Admin-Pin': pin, 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (!res.ok) throw Object.assign(new Error(`upload failed: ${res.status}`), { status: res.status });
  return (await res.json()) as { file: string; url: string };
}
