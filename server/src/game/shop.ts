import type { ErrorCode, GameState, Result, ShopItem, ShopItemInput } from '@quiz/shared';

const err = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });
const ok = (state: GameState): Result => ({ ok: true, state });

const IMAGE_RE = /^[a-z0-9-]+\.(jpg|png|webp|svg)$/;
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function parseItem(input: unknown): ShopItemInput | null {
  if (typeof input !== 'object' || input === null) return null;
  const i = input as Record<string, unknown>;
  if (typeof i.name !== 'string' || typeof i.description !== 'string') return null;
  const name = i.name.trim();
  const description = i.description.trim();
  if (name === '' || [...name].length > 60 || [...description].length > 500) return null;
  if (!isInt(i.price, 0, 100000) || !isInt(i.quantity, 1, 99) || typeof i.hidden !== 'boolean') return null;
  const out: ShopItemInput = { name, description, price: i.price, quantity: i.quantity, hidden: i.hidden };
  if (i.image !== undefined) {
    if (typeof i.image !== 'string' || !IMAGE_RE.test(i.image)) return null;
    out.image = i.image;
  }
  return out;
}

export type CatalogResult = { ok: true; items: ShopItem[] } | { ok: false; error: ErrorCode };
const catOk = (items: ShopItem[]): CatalogResult => ({ ok: true, items });

export function soldCount(s: GameState, itemId: string): number {
  return s.shop.purchases.filter((p) => p.itemId === itemId).length;
}

export function remaining(s: GameState, items: ShopItem[], itemId: string): number {
  const item = items.find((i) => i.id === itemId);
  return item ? item.quantity - soldCount(s, itemId) : 0;
}

export function addItem(items: ShopItem[], input: unknown, id: string): CatalogResult {
  const parsed = parseItem(input);
  if (!parsed) return err('INVALID_ITEM');
  return catOk([...items, { ...parsed, id }]);
}

export function updateItem(items: ShopItem[], id: string, input: unknown, sold: number): CatalogResult {
  if (!items.some((i) => i.id === id)) return err('NOT_FOUND');
  const parsed = parseItem(input);
  if (!parsed || parsed.quantity < sold) return err('INVALID_ITEM');
  return catOk(items.map((i) => (i.id === id ? { ...parsed, id } : i)));
}

export function deleteItem(items: ShopItem[], id: string): CatalogResult {
  if (!items.some((i) => i.id === id)) return err('NOT_FOUND');
  return catOk(items.filter((i) => i.id !== id));
}

export function dropPurchasesOf(s: GameState, itemId: string): GameState {
  return { ...s, shop: { ...s.shop, purchases: s.shop.purchases.filter((p) => p.itemId !== itemId) } };
}

export function setShopOpen(s: GameState, open: boolean): Result {
  if (open) {
    if (s.phase !== 'game') return err('WRONG_PHASE');
    if (s.activeQuestion) return err('QUESTION_ACTIVE');
  }
  return ok({ ...s, shop: { ...s.shop, open } });
}

export function sellItem(s: GameState, items: ShopItem[], itemId: string, playerId: string, purchaseId: string, now: number): Result {
  const item = items.find((i) => i.id === itemId);
  const player = s.players.find((p) => p.id === playerId);
  if (!item || !player) return err('NOT_FOUND');
  if (remaining(s, items, itemId) <= 0) return err('SOLD_OUT');
  if (player.score < item.price) return err('NOT_ENOUGH_POINTS');
  return ok({
    ...s,
    players: s.players.map((p) => (p.id === playerId ? { ...p, score: p.score - item.price } : p)),
    shop: {
      ...s.shop,
      purchases: [...s.shop.purchases, { id: purchaseId, itemId, playerId, price: item.price, at: now }],
    },
  });
}

export function cancelPurchase(s: GameState, purchaseId: string): Result {
  const purchase = s.shop.purchases.find((p) => p.id === purchaseId);
  if (!purchase) return err('NOT_FOUND');
  return ok({
    ...s,
    players: s.players.map((p) => (p.id === purchase.playerId ? { ...p, score: p.score + purchase.price } : p)),
    shop: { ...s.shop, purchases: s.shop.purchases.filter((p) => p.id !== purchaseId) },
  });
}
