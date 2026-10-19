import type { ErrorCode, GameState, Player, QuestionId, QuestionPack, Result } from '@quiz/shared';
import { findQuestion } from '../questions';

const MAX_NAME = 24;
const err = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });
const ok = (state: GameState): Result => ({ ok: true, state });

export function initialState(): GameState {
  return { phase: 'lobby', players: [], playedCells: [], currentRound: 0, activeQuestion: null,
    shop: { open: false, items: [], purchases: [] } };
}

export function hasPlayer(s: GameState, id: string): boolean {
  return s.players.some((p) => p.id === id);
}

export function registerPlayer(
  s: GameState,
  name: string,
  id: string,
): { ok: true; state: GameState; player: Player } | { ok: false; error: ErrorCode } {
  const trimmed = String(name ?? '').trim();
  if (trimmed === '') return err('NAME_EMPTY');
  if ([...trimmed].length > MAX_NAME) return err('NAME_TOO_LONG');
  const key = trimmed.toLowerCase();
  if (s.players.some((p) => p.name.trim().toLowerCase() === key)) return err('NAME_TAKEN');
  const player: Player = { id, name: trimmed, score: 0, online: true };
  return { ok: true, state: { ...s, players: [...s.players, player] }, player };
}

export function setOnline(s: GameState, playerId: string, online: boolean): GameState {
  if (!hasPlayer(s, playerId)) return s;
  return { ...s, players: s.players.map((p) => (p.id === playerId ? { ...p, online } : p)) };
}

export function removePlayer(s: GameState, playerId: string): Result {
  if (!hasPlayer(s, playerId)) return err('NOT_FOUND');
  const a = s.activeQuestion;
  return ok({
    ...s,
    players: s.players.filter((p) => p.id !== playerId),
    shop: { ...s.shop, purchases: s.shop.purchases.filter((p) => p.playerId !== playerId) },
    activeQuestion: a && {
      ...a,
      answeringPlayerId: a.answeringPlayerId === playerId ? null : a.answeringPlayerId,
      wrongPlayerIds: a.wrongPlayerIds.filter((id) => id !== playerId),
    },
  });
}

function addScore(s: GameState, playerId: string, delta: number): GameState {
  return { ...s, players: s.players.map((p) => (p.id === playerId ? { ...p, score: p.score + delta } : p)) };
}

export function adjustScore(s: GameState, playerId: string, delta: number): Result {
  if (!Number.isInteger(delta) || delta === 0) return err('INVALID_POINTS');
  if (!hasPlayer(s, playerId)) return err('NOT_FOUND');
  return ok(addScore(s, playerId, delta));
}

export function startGame(s: GameState): Result {
  if (s.phase !== 'lobby') return err('WRONG_PHASE');
  return ok({ ...s, phase: 'game' });
}

export function selectRound(s: GameState, pack: QuestionPack, index: number): Result {
  if (s.activeQuestion) return err('QUESTION_ACTIVE');
  if (!Number.isInteger(index) || index < 0 || index >= pack.rounds.length) return err('NOT_FOUND');
  return ok({ ...s, currentRound: index });
}

export function openQuestion(s: GameState, pack: QuestionPack, id: QuestionId): Result {
  if (s.phase !== 'game') return err('WRONG_PHASE');
  if (s.activeQuestion) return err('QUESTION_ACTIVE');
  if (!findQuestion(pack, id) || Number(id.split('/')[0]) !== s.currentRound) return err('NOT_FOUND');
  if (s.playedCells.includes(id)) return err('ALREADY_PLAYED');
  return ok({
    ...s,
    shop: { ...s.shop, open: false },
    activeQuestion: { id, answeringPlayerId: null, wrongPlayerIds: [] },
  });
}

export function buzz(s: GameState, playerId: string): Result {
  const a = s.activeQuestion;
  if (!a || a.answeringPlayerId !== null || a.wrongPlayerIds.includes(playerId) || !hasPlayer(s, playerId))
    return err('CANNOT_BUZZ');
  return ok({ ...s, activeQuestion: { ...a, answeringPlayerId: playerId } });
}

function closeWith(s: GameState, playerId: string | null, points: number): GameState {
  const a = s.activeQuestion!;
  const scored = playerId !== null ? addScore(s, playerId, points) : s;
  return { ...scored, playedCells: [...s.playedCells, a.id], activeQuestion: null };
}

export function judgeCorrect(s: GameState, pack: QuestionPack): Result {
  const a = s.activeQuestion;
  if (!a || a.answeringPlayerId === null) return err('NO_ANSWERER');
  const found = findQuestion(pack, a.id);
  if (!found) return err('NOT_FOUND');
  return ok(closeWith(s, a.answeringPlayerId, found.question.value));
}

export function judgeWrong(s: GameState): Result {
  const a = s.activeQuestion;
  if (!a || a.answeringPlayerId === null) return err('NO_ANSWERER');
  return ok({
    ...s,
    activeQuestion: { ...a, answeringPlayerId: null, wrongPlayerIds: [...a.wrongPlayerIds, a.answeringPlayerId] },
  });
}

export function judgePartial(s: GameState, points: number): Result {
  const a = s.activeQuestion;
  if (!a || a.answeringPlayerId === null) return err('NO_ANSWERER');
  if (!Number.isInteger(points) || points < 0) return err('INVALID_POINTS');
  return ok(closeWith(s, a.answeringPlayerId, points));
}

export function closeQuestion(s: GameState): Result {
  if (!s.activeQuestion) return err('NO_ACTIVE');
  return ok(closeWith(s, null, 0));
}

export function newGame(s: GameState, opts: { removePlayers: boolean }): GameState {
  return {
    phase: 'lobby',
    players: opts.removePlayers ? [] : s.players.map((p) => ({ ...p, score: 0 })),
    playedCells: [],
    currentRound: 0,
    activeQuestion: null,
    shop: { open: false, items: s.shop.items, purchases: [] },
  };
}
