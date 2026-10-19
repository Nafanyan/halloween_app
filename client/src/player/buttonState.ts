import type { PublicView } from '@quiz/shared';

export type ButtonState = 'idle' | 'active' | 'otherAnswering' | 'youAnswering' | 'alreadyWrong';

export function buttonState(view: PublicView, playerId: string): ButtonState {
  const q = view.activeQuestion;
  if (!q) return 'idle';
  if (q.wrongPlayerIds.includes(playerId)) return 'alreadyWrong';
  if (q.answeringPlayerId === playerId) return 'youAnswering';
  if (q.answeringPlayerId) return 'otherAnswering';
  return 'active';
}
