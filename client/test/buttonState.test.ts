import { describe, expect, it } from 'vitest';
import type { PublicView } from '@quiz/shared';
import { buttonState } from '../src/player/buttonState';

const view = (aq: { answeringPlayerId: string | null; wrongPlayerIds: string[] } | null): PublicView => ({
  phase: 'game', joinUrl: '', players: [], roundIndex: 0, roundNames: [], themes: [], shop: { open: false, items: [] },
  activeQuestion: aq && { id: '0/0/0', themeName: 't', value: 100, text: 'q', ...aq },
});

describe('buttonState', () => {
  it('idle without question', () => expect(buttonState(view(null), 'me')).toBe('idle'));
  it('active when nobody answering', () =>
    expect(buttonState(view({ answeringPlayerId: null, wrongPlayerIds: [] }), 'me')).toBe('active'));
  it('otherAnswering', () =>
    expect(buttonState(view({ answeringPlayerId: 'x', wrongPlayerIds: [] }), 'me')).toBe('otherAnswering'));
  it('youAnswering', () =>
    expect(buttonState(view({ answeringPlayerId: 'me', wrongPlayerIds: [] }), 'me')).toBe('youAnswering'));
  it('alreadyWrong, nobody answering', () =>
    expect(buttonState(view({ answeringPlayerId: null, wrongPlayerIds: ['me'] }), 'me')).toBe('alreadyWrong'));
  it('alreadyWrong, other answering', () =>
    expect(buttonState(view({ answeringPlayerId: 'x', wrongPlayerIds: ['me'] }), 'me')).toBe('alreadyWrong'));
});
