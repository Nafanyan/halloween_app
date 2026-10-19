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

const sold = (s: GameState, itemId: string) => s.shop.purchases.filter((p) => p.itemId === itemId).length;

export function remaining(s: GameState, itemId: string): number {
  const item = s.shop.items.find((i) => i.id === itemId);
  return item ? item.quantity - sold(s, itemId) : 0;
}

export function addItem(s: GameState, input: unknown, id: string): Result {
  const parsed = parseItem(input);
  if (!parsed) return err('INVALID_ITEM');
  return ok({ ...s, shop: { ...s.shop, items: [...s.shop.items, { ...parsed, id }] } });
}

export function updateItem(s: GameState, id: string, input: unknown): Result {
  if (!s.shop.items.some((i) => i.id === id)) return err('NOT_FOUND');
  const parsed = parseItem(input);
  if (!parsed || parsed.quantity < sold(s, id)) return err('INVALID_ITEM');
  const items: ShopItem[] = s.shop.items.map((i) => (i.id === id ? { ...parsed, id } : i));
  return ok({ ...s, shop: { ...s.shop, items } });
}

export function deleteItem(s: GameState, id: string): Result {
  if (!s.shop.items.some((i) => i.id === id)) return err('NOT_FOUND');
  return ok({
    ...s,
    shop: {
      ...s.shop,
      items: s.shop.items.filter((i) => i.id !== id),
      purchases: s.shop.purchases.filter((p) => p.itemId !== id),
    },
  });
}

export function setShopOpen(s: GameState, open: boolean): Result {
  if (open) {
    if (s.phase !== 'game') return err('WRONG_PHASE');
    if (s.activeQuestion) return err('QUESTION_ACTIVE');
  }
  return ok({ ...s, shop: { ...s.shop, open } });
}

export function sellItem(s: GameState, itemId: string, playerId: string, purchaseId: string, now: number): Result {
  const item = s.shop.items.find((i) => i.id === itemId);
  const player = s.players.find((p) => p.id === playerId);
  if (!item || !player) return err('NOT_FOUND');
  if (remaining(s, itemId) <= 0) return err('SOLD_OUT');
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
