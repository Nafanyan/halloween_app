import { describe, it, expect } from 'vitest';
import type { GameState } from '@quiz/shared';

describe('smoke', () => {
  it('shared types are importable', () => {
    const state: GameState = { phase: 'lobby', players: [], playedCells: [], currentRound: 0, activeQuestion: null,
      shop: { open: false, items: [], purchases: [] } };
    expect(state.phase).toBe('lobby');
  });
});
