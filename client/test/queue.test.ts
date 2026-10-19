import { describe, expect, it } from 'vitest';
import type { PurchasedEvent } from '@quiz/shared';
import { dequeue, enqueue } from '../src/shop/queue';

const ev = (id: string): PurchasedEvent => ({
  purchaseId: id,
  playerName: 'Аня',
  item: { id: 'i', name: 'n', description: '', price: 1, quantity: 1, secret: false } as PurchasedEvent['item'],
});

describe('purchase queue', () => {
  it('enqueue appends, ignores duplicate purchaseId', () => {
    let q = enqueue([], ev('a'));
    q = enqueue(q, ev('b'));
    q = enqueue(q, ev('a'));
    expect(q.map((e) => e.purchaseId)).toEqual(['a', 'b']);
  });
  it('dequeue drops head', () => {
    expect(dequeue([ev('a'), ev('b')]).map((e) => e.purchaseId)).toEqual(['b']);
    expect(dequeue([])).toEqual([]);
  });
});
