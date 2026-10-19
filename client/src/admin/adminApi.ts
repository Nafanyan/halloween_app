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

type Res = { ok: true } | { ok: false; error: ErrorCode };

/** Emit an admin event; show an error toast if the ack reports failure, else run onOk; onDone runs after any ack. */
export function call(event: string, payload?: object, onOk?: () => void, onDone?: () => void): void {
  const ack = (res: Res) => {
    if (!res.ok) showToast(errorMessage(res.error));
    else onOk?.();
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

/** Upload a (downscaled) image; resolves with its /media URL. */
export async function uploadImage(blob: Blob): Promise<string> {
  const pin = loadPin();
  if (!pin) throw new Error('no pin');
  const res = await fetch('/api/shop/image', {
    method: 'POST',
    headers: { 'X-Admin-Pin': pin, 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw Object.assign(new Error(`upload failed: ${res.status}`), { status: res.status });
  const { url } = (await res.json()) as { url: string };
  return url;
}
