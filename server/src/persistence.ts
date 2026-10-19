import fs from 'node:fs';
import type { GameDef, GameState, Purchase, ShopState } from '@quiz/shared';
import { findQuestion } from './questions';

export function saveState(path: string, s: GameState): void {
  const tmp = path + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, path);
}

function quarantine(path: string, reason: string): null {
  console.warn(`[state] ${path}: ${reason}; сохранён как ${path}.bak, начинаем с чистого состояния`);
  fs.renameSync(path, path + '.bak');
  return null;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isNat = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function loadShop(raw: unknown, playerIds: Set<string>, itemIds: Set<string>): ShopState {
  const shop: ShopState = { open: false, purchases: [] };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return shop;
  const r = raw as Record<string, unknown>;
  shop.open = r.open === true;
  for (const p of Array.isArray(r.purchases) ? r.purchases : []) {
    if (!p || !isStr(p.id) || !isStr(p.itemId) || !isStr(p.playerId)) continue;
    if (!itemIds.has(p.itemId) || !playerIds.has(p.playerId) || !isNat(p.price) || !isNat(p.at)) continue;
    shop.purchases.push({ id: p.id, itemId: p.itemId, playerId: p.playerId, price: p.price, at: p.at } as Purchase);
  }
  return shop;
}

export function readActiveGameId(path: string): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
    return typeof raw?.activeGameId === 'string' ? raw.activeGameId : null;
  } catch {
    return null;
  }
}

export function loadState(path: string, game: GameDef): GameState | null {
  if (!fs.existsSync(path)) return null;
  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    return quarantine(path, `битый JSON (${(e as Error).message})`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || !Array.isArray(raw.players)
    || (raw.phase !== 'lobby' && raw.phase !== 'game')) {
    return quarantine(path, 'неверная структура');
  }

  const players = raw.players.map((p: any) => ({ ...p, online: false }));
  const ids = new Set<string>(players.map((p: { id: string }) => p.id));
  const playedCells = (Array.isArray(raw.playedCells) ? raw.playedCells : [])
    .filter((id: unknown) => typeof id === 'string' && findQuestion(game, id));
  const aq = raw.activeQuestion;
  const activeQuestion = aq && typeof aq.id === 'string' && findQuestion(game, aq.id)
    ? {
        id: aq.id,
        answeringPlayerId: ids.has(aq.answeringPlayerId) ? aq.answeringPlayerId : null,
        wrongPlayerIds: (Array.isArray(aq.wrongPlayerIds) ? aq.wrongPlayerIds : []).filter((id: string) => ids.has(id)),
      }
    : null;
  const currentRound = Number.isInteger(raw.currentRound) && raw.currentRound >= 0 && raw.currentRound < game.rounds.length
    ? raw.currentRound : 0;

  return {
    phase: raw.phase, players, playedCells, currentRound, activeQuestion,
    shop: loadShop(raw.shop, ids, new Set(game.shop.map((i) => i.id))),
    activeGameId: typeof raw.activeGameId === 'string' ? raw.activeGameId : '',
  };
}
