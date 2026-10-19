import { describe, expect, it } from 'vitest';
import type { GameState, Result } from '@quiz/shared';
import * as L from '../src/game/logic';
import * as S from '../src/game/shop';

const st = (r: Result): GameState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.state;
};
const err = (r: Result) => (r.ok ? 'ok' : r.error);
const game = (): GameState => {
  let s = L.initialState();
  for (const id of ['a', 'b', 'c']) {
    const r = L.registerPlayer(s, id.toUpperCase(), id);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return st(L.startGame(s));
};
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.score;
const item = { name: 'Кривое зеркало', description: 'Отражает не то', price: 300, quantity: 2, hidden: false };
const withItem = (s: GameState = game(), input: unknown = item) => st(S.addItem(s, input, 'i1'));
const give = (s: GameState, id: string, n: number) => st(L.adjustScore(s, id, n));

describe('parseItem', () => {
  it('trims and validates', () => {
    expect(S.parseItem({ ...item, name: '  Зеркало ' })?.name).toBe('Зеркало');
    for (const bad of [{ ...item, name: '  ' }, { ...item, name: 'x'.repeat(61) }, { ...item, description: 'x'.repeat(501) },
      { ...item, price: -1 }, { ...item, price: 100001 }, { ...item, price: 1.5 }, { ...item, quantity: 0 },
      { ...item, quantity: 100 }, { ...item, hidden: 'yes' }, { ...item, image: '/media/../state.json' }, { ...item, image: '/media/shop/ab-12.jpg' }, null])
      expect(S.parseItem(bad)).toBeNull();
    expect(S.parseItem({ ...item, image: 'ab-12.jpg' })?.image).toBe('ab-12.jpg');
  });
  it('returns only known fields, no image key when absent', () => {
    const p = S.parseItem({ ...item, extra: 1, image: undefined })!;
    expect(p).toEqual(item);
    expect('image' in p).toBe(false);
  });
});

describe('items', () => {
  it('add / update / delete', () => {
    const s = withItem();
    expect(s.shop.items).toEqual([{ ...item, id: 'i1' }]);
    expect(err(S.addItem(game(), { ...item, price: -1 }, 'x'))).toBe('INVALID_ITEM');
    const u = st(S.updateItem(s, 'i1', { ...item, price: 50 }));
    expect(u.shop.items).toEqual([{ ...item, price: 50, id: 'i1' }]);
    expect(err(S.updateItem(s, 'i1', null))).toBe('INVALID_ITEM');
    expect(err(S.updateItem(s, 'zz', item))).toBe('NOT_FOUND');
    expect(err(S.deleteItem(s, 'zz'))).toBe('NOT_FOUND');
    expect(st(S.deleteItem(s, 'i1')).shop.items).toEqual([]);
  });
  it('deleteItem drops its purchases without refund', () => {
    let s = give(withItem(), 'a', 500);
    s = st(S.sellItem(s, 'i1', 'a', 'p1', 1));
    const d = st(S.deleteItem(s, 'i1'));
    expect(d.shop.purchases).toEqual([]);
    expect(score(d, 'a')).toBe(200);
  });
  it('quantity below sold → INVALID_ITEM', () => {
    let s = give(give(withItem(), 'a', 300), 'b', 300);
    s = st(S.sellItem(st(S.sellItem(s, 'i1', 'a', 'p1', 1)), 'i1', 'b', 'p2', 2));
    expect(err(S.updateItem(s, 'i1', { ...item, quantity: 1 }))).toBe('INVALID_ITEM');
    expect(err(S.updateItem(s, 'i1', { ...item, quantity: 2 }))).toBe('ok');
  });
});

describe('selling', () => {
  it('sell deducts price, tracks remaining, SOLD_OUT', () => {
    let s = give(give(withItem(), 'a', 500), 'b', 300);
    s = st(S.sellItem(s, 'i1', 'a', 'p1', 10));
    expect(score(s, 'a')).toBe(200);
    expect(S.remaining(s, 'i1')).toBe(1);
    expect(s.shop.purchases).toEqual([{ id: 'p1', itemId: 'i1', playerId: 'a', price: 300, at: 10 }]);
    s = st(S.sellItem(s, 'i1', 'b', 'p2', 11));
    expect(S.remaining(s, 'i1')).toBe(0);
    expect(err(S.sellItem(give(s, 'c', 999), 'i1', 'c', 'p3', 12))).toBe('SOLD_OUT');
  });
  it('NOT_ENOUGH_POINTS when score < price', () => {
    const s = give(withItem(), 'a', 299);
    expect(err(S.sellItem(s, 'i1', 'a', 'p1', 1))).toBe('NOT_ENOUGH_POINTS');
    expect(score(s, 'a')).toBe(299);
  });
  it('price 0: sells to score 0, refuses negative score', () => {
    const s = withItem(game(), { ...item, price: 0, quantity: 5 });
    expect(score(st(S.sellItem(s, 'i1', 'a', 'p1', 1)), 'a')).toBe(0);
    expect(err(S.sellItem(give(s, 'a', -10), 'i1', 'a', 'p1', 1))).toBe('NOT_ENOUGH_POINTS');
  });
  it('sell allowed while shop closed', () => {
    const s = give(withItem(), 'a', 300);
    expect(s.shop.open).toBe(false);
    expect(err(S.sellItem(s, 'i1', 'a', 'p1', 1))).toBe('ok');
  });
  it('sell unknown item/player → NOT_FOUND', () => {
    const s = give(withItem(), 'a', 300);
    expect(err(S.sellItem(s, 'zz', 'a', 'p1', 1))).toBe('NOT_FOUND');
    expect(err(S.sellItem(s, 'i1', 'zz', 'p1', 1))).toBe('NOT_FOUND');
  });
  it('cancel refunds price at sale time', () => {
    let s = give(withItem(), 'a', 300);
    s = st(S.sellItem(s, 'i1', 'a', 'p1', 1));
    s = st(S.updateItem(s, 'i1', { ...item, price: 1000 }));
    const c = st(S.cancelPurchase(s, 'p1'));
    expect(score(c, 'a')).toBe(300);
    expect(c.shop.purchases).toEqual([]);
    expect(err(S.cancelPurchase(c, 'p1'))).toBe('NOT_FOUND');
  });
});

describe('setShopOpen', () => {
  it('lobby → WRONG_PHASE, active question → QUESTION_ACTIVE, close always ok', () => {
    expect(err(S.setShopOpen(L.initialState(), true))).toBe('WRONG_PHASE');
    expect(err(S.setShopOpen(L.initialState(), false))).toBe('ok');
    const pack = { rounds: [{ name: 'R', themes: [{ name: 'T', questions: [{ value: 100, text: 't', answer: 'a' }] }] }] };
    const q = st(L.openQuestion(game(), pack, '0/0/0'));
    expect(err(S.setShopOpen(q, true))).toBe('QUESTION_ACTIVE');
    expect(err(S.setShopOpen(q, false))).toBe('ok');
    expect(st(S.setShopOpen(game(), true)).shop.open).toBe(true);
  });
});
