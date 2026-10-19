import type { GameDef, GameSettings, ShopItem } from '@quiz/shared';
import { QuestionsError, media, round } from '../questions';
import { parseItem } from '../game/shop';

export const GAME_ID_RE = /^g-[a-z0-9]{8}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (p: string, problem: string): never => { throw new QuestionsError(`${p}: ${problem}`); };

function text(o: Obj, key: string, max: number, allowEmpty: boolean): string {
  const v = o[key];
  if (typeof v !== 'string') return fail(key, 'ожидается строка');
  const s = v.trim();
  if (!allowEmpty && s === '') fail(key, 'ожидается непустая строка');
  if ([...s].length > max) fail(key, `слишком длинная строка (максимум ${max} символов)`);
  return s;
}

function scoring(v: unknown): GameSettings['scoring'] {
  if (!isObj(v)) return fail('scoring', 'ожидается объект');
  if (typeof v.wrongPenalty !== 'boolean') fail('scoring.wrongPenalty', 'ожидается true или false');
  const n = v.startScore;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100000)
    fail('scoring.startScore', 'ожидается целое число от 0 до 100000');
  return { wrongPenalty: v.wrongPenalty as boolean, startScore: n as number };
}

function settings(o: Obj, mediaDir: string): GameSettings {
  const s: GameSettings = {
    title: text(o, 'title', 60, false),
    subtitle: text(o, 'subtitle', 120, true),
    description: text(o, 'description', 500, true),
    scoring: scoring(o.scoring),
  };
  const lobbyMusic = media(o, 'lobbyMusic', '', mediaDir);
  const background = media(o, 'background', '', mediaDir);
  if (lobbyMusic) s.lobbyMusic = lobbyMusic;
  if (background) s.background = background;
  return s;
}

function shopItem(v: unknown, p: string, mediaDir: string, seen: Set<string>): ShopItem {
  if (!isObj(v)) return fail(p, 'ожидается объект');
  if (typeof v.id !== 'string' || v.id.trim() === '') fail(`${p}.id`, 'ожидается непустая строка');
  const id = (v.id as string).trim();
  if (seen.has(id)) fail(`${p}.id`, `повторяющийся id: ${id}`);
  seen.add(id);
  const item = parseItem(v);
  if (!item) return fail(p, 'некорректный предмет магазина');
  media(item as unknown as Obj, 'image', p, mediaDir);
  return { ...item, id };
}

export function parseGame(raw: unknown, mediaDir: string): GameDef {
  if (!isObj(raw)) return fail('game', 'ожидается объект');
  if (raw.version !== 1) fail('version', 'ожидается 1');
  const s = settings(raw, mediaDir);
  if (!Array.isArray(raw.rounds)) fail('rounds', 'ожидается массив');
  if (!Array.isArray(raw.shop)) fail('shop', 'ожидается массив');
  const rounds = (raw.rounds as unknown[]).map((x, i) => round(x, `rounds[${i}]`, mediaDir));
  const seen = new Set<string>();
  const shop = (raw.shop as unknown[]).map((x, i) => shopItem(x, `shop[${i}]`, mediaDir, seen));
  return { version: 1, ...s, rounds, shop };
}

export function parseSettings(raw: unknown, mediaDir: string): GameSettings | null {
  if (!isObj(raw)) return null;
  try {
    return settings(raw, mediaDir);
  } catch (e) {
    if (e instanceof QuestionsError) return null;
    throw e;
  }
}
