import fs from 'node:fs';
import type { GameState, Purchase, QuestionPack, ShopItem, ShopState } from '@quiz/shared';
import { parseItem } from './game/shop';
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

export function loadShop(raw: unknown, playerIds: Set<string>): ShopState {
  const shop: ShopState = { open: false, items: [], purchases: [] };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return shop;
  const r = raw as Record<string, unknown>;
  shop.open = r.open === true;
  const itemIds = new Set<string>();
  for (const it of Array.isArray(r.items) ? r.items : []) {
    const id = it?.id;
    const parsed = parseItem(it);
    if (!isStr(id) || itemIds.has(id) || !parsed) continue;
    itemIds.add(id);
    shop.items.push({ id, ...parsed } as ShopItem);
  }
  for (const p of Array.isArray(r.purchases) ? r.purchases : []) {
    if (!p || !isStr(p.id) || !isStr(p.itemId) || !isStr(p.playerId)) continue;
    if (!itemIds.has(p.itemId) || !playerIds.has(p.playerId) || !isNat(p.price) || !isNat(p.at)) continue;
    shop.purchases.push({ id: p.id, itemId: p.itemId, playerId: p.playerId, price: p.price, at: p.at } as Purchase);
  }
  return shop;
}

export function loadState(path: string, pack: QuestionPack): GameState | null {
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
    .filter((id: unknown) => typeof id === 'string' && findQuestion(pack, id));
  const aq = raw.activeQuestion;
  const activeQuestion = aq && typeof aq.id === 'string' && findQuestion(pack, aq.id)
    ? {
        id: aq.id,
        answeringPlayerId: ids.has(aq.answeringPlayerId) ? aq.answeringPlayerId : null,
        wrongPlayerIds: (Array.isArray(aq.wrongPlayerIds) ? aq.wrongPlayerIds : []).filter((id: string) => ids.has(id)),
      }
    : null;
  const currentRound = Number.isInteger(raw.currentRound) && raw.currentRound >= 0 && raw.currentRound < pack.rounds.length
    ? raw.currentRound : 0;

  return { phase: raw.phase, players, playedCells, currentRound, activeQuestion, shop: loadShop(raw.shop, ids) };
}
