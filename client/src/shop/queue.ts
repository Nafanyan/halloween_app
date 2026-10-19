import type { PurchasedEvent } from '@quiz/shared';

/** FIFO of purchase animations; a purchaseId already queued is ignored. */
export function enqueue(q: PurchasedEvent[], e: PurchasedEvent): PurchasedEvent[] {
  return q.some((x) => x.purchaseId === e.purchaseId) ? q : [...q, e];
}

export function dequeue(q: PurchasedEvent[]): PurchasedEvent[] {
  return q.slice(1);
}
