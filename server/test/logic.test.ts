import { describe, expect, it } from 'vitest';
import type { GameDef, GameState, QuestionPack, Result, ShopItem } from '@quiz/shared';
import * as L from '../src/game/logic';
import * as S from '../src/game/shop';

const theme = (n: string) => ({
  name: n,
  questions: [100, 200].map((value) => ({ value, text: 't', answer: 'a' })),
});
const pack = (): QuestionPack => ({
  rounds: [0, 1].map((r) => ({ name: `R${r}`, themes: [theme('A'), theme('B')] })),
});
const def = (wrongPenalty = false): GameDef => ({
  version: 1, title: 'T', subtitle: '', description: '', scoring: { wrongPenalty, startScore: 0 }, shop: [], ...pack(),
});
const st = (r: Result): GameState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.state;
};
const game = (): GameState => {
  let s = L.initialState('g-aaaaaaaa');
  for (const id of ['a', 'b', 'c']) {
    const r = L.registerPlayer(s, id.toUpperCase(), id);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return st(L.startGame(s, pack()));
};
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.score;
const err = (r: Result) => (r.ok ? 'ok' : r.error);

describe('registerPlayer', () => {
  it('trims, dedupes case-insensitively, validates length', () => {
    const r1 = L.registerPlayer(L.initialState('g-aaaaaaaa'), '  Вася ', 'x');
    expect(r1.ok && r1.player).toEqual({ id: 'x', name: 'Вася', score: 0, online: true });
    if (!r1.ok) throw new Error();
    expect(L.registerPlayer(r1.state, 'вася', 'y')).toEqual({ ok: false, error: 'NAME_TAKEN' });
    expect(L.registerPlayer(r1.state, '   ', 'y')).toEqual({ ok: false, error: 'NAME_EMPTY' });
    expect(L.registerPlayer(r1.state, 'x'.repeat(25), 'y')).toEqual({ ok: false, error: 'NAME_TOO_LONG' });
    expect(L.registerPlayer(r1.state, 'x'.repeat(24), 'y').ok).toBe(true);
    expect(L.registerPlayer(r1.state, '🎃', 'z').ok).toBe(true);
  });
  it('uses startScore', () => {
    const r = L.registerPlayer(L.initialState('g-aaaaaaaa'), 'Аня', 'p1', 300);
    expect(r.ok && r.player.score).toBe(300);
  });
});

describe('openQuestion', () => {
  it('phase, active, round checks', () => {
    const p = pack();
    expect(err(L.openQuestion(L.initialState('g-aaaaaaaa'), p, '0/0/0'))).toBe('WRONG_PHASE');
    const s = game();
    const o = st(L.openQuestion(s, p, '0/0/0'));
    expect(err(L.openQuestion(o, p, '0/0/1'))).toBe('QUESTION_ACTIVE');
    expect(err(L.openQuestion(s, p, '1/0/0'))).toBe('NOT_FOUND');
    expect(err(L.openQuestion(s, p, '0/0/9'))).toBe('NOT_FOUND');
  });
  it('startGame without questions → NO_QUESTIONS', () => {
    const s = L.initialState('g-aaaaaaaa');
    expect(err(L.startGame(s, { rounds: [] }))).toBe('NO_QUESTIONS');
    expect(err(L.startGame(s, { rounds: [{ name: 'R', themes: [{ name: 'T', questions: [] }] }] }))).toBe('NO_QUESTIONS');
    expect(L.startGame(s, pack()).ok).toBe(true);
  });
  it('startGame twice is WRONG_PHASE', () => {
    expect(err(L.startGame(game(), pack()))).toBe('WRONG_PHASE');
  });
});

describe('selectRound', () => {
  it('selects, rejects bad index and active question', () => {
    const p = pack();
    const s = game();
    expect(st(L.selectRound(s, p, 1)).currentRound).toBe(1);
    expect(err(L.selectRound(s, p, 2))).toBe('NOT_FOUND');
    expect(err(L.selectRound(s, p, 0.5))).toBe('NOT_FOUND');
    expect(err(L.selectRound(s, p, -1))).toBe('NOT_FOUND');
    expect(err(L.selectRound(st(L.openQuestion(s, p, '0/0/0')), p, 1))).toBe('QUESTION_ACTIVE');
  });
});

describe('buzz and judging', () => {
  const open = () => st(L.openQuestion(game(), pack(), '0/0/1'));
  it('buzz rules', () => {
    const s = st(L.buzz(open(), 'a'));
    expect(s.activeQuestion!.answeringPlayerId).toBe('a');
    expect(err(L.buzz(s, 'b'))).toBe('CANNOT_BUZZ');
    expect(err(L.buzz(game(), 'a'))).toBe('CANNOT_BUZZ');
    expect(err(L.buzz(open(), 'ghost'))).toBe('CANNOT_BUZZ');
  });
  it('wrong excludes player, others can buzz', () => {
    const s = st(L.judgeWrong(st(L.buzz(open(), 'a')), def()));
    expect(s.activeQuestion).toEqual({ id: '0/0/1', answeringPlayerId: null, wrongPlayerIds: ['a'] });
    expect(err(L.buzz(s, 'a'))).toBe('CANNOT_BUZZ');
    expect(L.buzz(s, 'b').ok).toBe(true);
  });
  it('wrong with wrongPenalty subtracts value, without leaves score', () => {
    const b = st(L.buzz(open(), 'a'));
    const pen = st(L.judgeWrong(b, def(true)));
    expect(score(pen, 'a')).toBe(-200);
    expect(pen.activeQuestion!.wrongPlayerIds).toEqual(['a']);
    expect(score(st(L.judgeWrong(b, def(false))), 'a')).toBe(0);
    expect(err(L.judgeWrong(b, { ...def(true), rounds: [] }))).toBe('NOT_FOUND');
  });
  it('correct scores value, marks played, blocks reopen', () => {
    const s = st(L.judgeCorrect(st(L.buzz(open(), 'b')), pack()));
    expect(score(s, 'b')).toBe(200);
    expect(s.playedCells).toEqual(['0/0/1']);
    expect(s.activeQuestion).toBeNull();
    expect(err(L.openQuestion(s, pack(), '0/0/1'))).toBe('ALREADY_PLAYED');
  });
  it('partial', () => {
    const b = st(L.buzz(open(), 'a'));
    const s = st(L.judgePartial(b, 50));
    expect(score(s, 'a')).toBe(50);
    expect(s.activeQuestion).toBeNull();
    expect(s.playedCells).toEqual(['0/0/1']);
    for (const bad of [NaN, -5, 2.5]) expect(err(L.judgePartial(b, bad))).toBe('INVALID_POINTS');
    expect(score(st(L.judgePartial(b, 0)), 'a')).toBe(0);
  });
  it('judge without answerer', () => {
    expect(err(L.judgeCorrect(open(), pack()))).toBe('NO_ANSWERER');
    expect(err(L.judgeWrong(open(), def()))).toBe('NO_ANSWERER');
    expect(err(L.judgePartial(open(), 10))).toBe('NO_ANSWERER');
  });
  it('closeQuestion', () => {
    const s = st(L.closeQuestion(open()));
    expect(s.playedCells).toEqual(['0/0/1']);
    expect(s.players.every((p) => p.score === 0)).toBe(true);
    expect(err(L.closeQuestion(s))).toBe('NO_ACTIVE');
  });
  it('immutability', () => {
    const s0 = open();
    const snap = structuredClone(s0);
    L.buzz(s0, 'a');
    expect(s0).toEqual(snap);
  });
});

describe('players', () => {
  it('adjustScore', () => {
    const s = game();
    expect(score(st(L.adjustScore(s, 'a', -100)), 'a')).toBe(-100);
    expect(err(L.adjustScore(s, 'a', 0))).toBe('INVALID_POINTS');
    expect(err(L.adjustScore(s, 'a', NaN))).toBe('INVALID_POINTS');
    expect(err(L.adjustScore(s, 'zz', 5))).toBe('NOT_FOUND');
  });
  it('removePlayer answering and wrong', () => {
    let s = st(L.buzz(st(L.openQuestion(game(), pack(), '0/0/0')), 'a'));
    const r = st(L.removePlayer(s, 'a'));
    expect(r.activeQuestion).toEqual({ id: '0/0/0', answeringPlayerId: null, wrongPlayerIds: [] });
    expect(L.hasPlayer(r, 'a')).toBe(false);
    s = st(L.judgeWrong(s, def()));
    expect(st(L.removePlayer(s, 'a')).activeQuestion!.wrongPlayerIds).toEqual([]);
    expect(err(L.removePlayer(s, 'zz'))).toBe('NOT_FOUND');
  });
  it('setOnline', () => {
    const s = game();
    expect(L.setOnline(s, 'a', false).players[0].online).toBe(false);
    expect(L.setOnline(s, 'zz', false)).toBe(s);
  });
  it('newGame', () => {
    const s = st(L.adjustScore(game(), 'a', 300));
    const k = L.newGame(s, { removePlayers: false, startScore: 50 });
    expect(k.players.map((p) => p.score)).toEqual([50, 50, 50]);
    expect(k).toMatchObject({ phase: 'lobby', playedCells: [], currentRound: 0, activeQuestion: null,
      activeGameId: 'g-aaaaaaaa', shop: { open: false, purchases: [] } });
    expect(L.newGame(s, { removePlayers: true, startScore: 50 }).players).toEqual([]);
  });
  it('activateGame resets state, keeps players with startScore', () => {
    let s = st(L.openQuestion(st(L.adjustScore(game(), 'a', 300)), pack(), '0/0/0'));
    s = { ...s, shop: { open: true, purchases: [{ id: 'p1', itemId: 'i1', playerId: 'a', price: 100, at: 1 }] } };
    const k = L.activateGame(s, 'g-bbbbbbbb', 70);
    expect(k).toMatchObject({ phase: 'lobby', playedCells: [], currentRound: 0, activeQuestion: null,
      activeGameId: 'g-bbbbbbbb', shop: { open: false, purchases: [] } });
    expect(k.players.map((p) => [p.id, p.score])).toEqual([['a', 70], ['b', 70], ['c', 70]]);
  });
});

describe('shop interplay', () => {
  const items = (): ShopItem[] => [{ id: 'i1', name: 'Зеркало', description: '', price: 100, quantity: 2, hidden: false }];
  const shopGame = () => {
    let s = st(L.adjustScore(st(L.adjustScore(game(), 'a', 500)), 'b', 500));
    s = st(S.sellItem(st(S.sellItem(s, items(), 'i1', 'a', 'p1', 1)), items(), 'i1', 'b', 'p2', 2));
    return st(S.setShopOpen(s, true));
  };
  it('openQuestion closes the shop', () => {
    const s = shopGame();
    expect(s.shop.open).toBe(true);
    expect(st(L.openQuestion(s, pack(), '0/0/0')).shop.open).toBe(false);
  });
  it('removePlayer drops purchases, restores remaining', () => {
    const s = shopGame();
    expect(S.remaining(s, items(), 'i1')).toBe(0);
    const r = st(L.removePlayer(s, 'a'));
    expect(r.shop.purchases.map((p) => p.id)).toEqual(['p2']);
    expect(S.remaining(r, items(), 'i1')).toBe(1);
  });
  it('newGame clears purchases, closes shop', () => {
    for (const removePlayers of [false, true]) {
      const k = L.newGame(shopGame(), { removePlayers, startScore: 0 });
      expect(k.shop.purchases).toEqual([]);
      expect(k.shop.open).toBe(false);
    }
  });
  it('initialState has empty closed shop', () =>
    expect(L.initialState('g-aaaaaaaa').shop).toEqual({ open: false, purchases: [] }));
});
