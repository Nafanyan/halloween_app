import { describe, expect, it } from 'vitest';
import type { GameState, QuestionPack } from '@quiz/shared';
import { initialState } from '../src/game/logic';
import { toAdminView, toPublicView, trophiesOf } from '../src/views';

const SECRET = 'SECRET-ANSWER-XYZ';
const JOIN = 'http://192.168.0.5:3000/';

const theme = (n: string) => ({
  name: n,
  questions: [100, 200].map((value) => ({ value, text: `q${value}`, answer: SECRET })),
});
const pack = (): QuestionPack => ({
  rounds: [
    { name: 'Первый', themes: [theme('A'), theme('B')] },
    { name: 'Второй', themes: [theme('C')] },
  ],
});
const game = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  phase: 'game',
  players: [
    { id: 'p1', name: 'Вася', score: 100, online: true },
    { id: 'p2', name: 'Аня', score: 300, online: false },
    { id: 'p3', name: 'Борис', score: 100, online: true },
  ],
  ...over,
});

describe('toPublicView', () => {
  it('never contains the answer of the active question', () => {
    const s = game({ activeQuestion: { id: '0/1/1', answeringPlayerId: null, wrongPlayerIds: [] } });
    const v = toPublicView(s, pack(), JOIN);
    expect(v.activeQuestion).not.toBeNull();
    expect(JSON.stringify(v)).not.toContain(SECRET);
  });

  it('exposes theme name, value and text of the active question from the pack', () => {
    const s = game({
      activeQuestion: { id: '0/1/1', answeringPlayerId: 'p2', wrongPlayerIds: ['p1'] },
    });
    expect(toPublicView(s, pack(), JOIN).activeQuestion).toEqual({
      id: '0/1/1',
      themeName: 'B',
      value: 200,
      text: 'q200',
      answeringPlayerId: 'p2',
      wrongPlayerIds: ['p1'],
    });
  });

  it('returns null active question when the id is not in the pack', () => {
    const s = game({ activeQuestion: { id: '9/9/9', answeringPlayerId: null, wrongPlayerIds: [] } });
    expect(toPublicView(s, pack(), JOIN).activeQuestion).toBeNull();
  });

  it('lists themes of the current round with played flags', () => {
    const s = game({ currentRound: 0, playedCells: ['0/0/1'] });
    const v = toPublicView(s, pack(), JOIN);
    expect(v.roundIndex).toBe(0);
    expect(v.themes).toEqual([
      {
        name: 'A',
        cells: [
          { id: '0/0/0', value: 100, played: false },
          { id: '0/0/1', value: 200, played: true },
        ],
      },
      {
        name: 'B',
        cells: [
          { id: '0/1/0', value: 100, played: false },
          { id: '0/1/1', value: 200, played: false },
        ],
      },
    ]);
  });

  it('shows themes of the selected round', () => {
    const v = toPublicView(game({ currentRound: 1 }), pack(), JOIN);
    expect(v.themes.map((t) => t.name)).toEqual(['C']);
    expect(v.themes[0].cells[0].id).toBe('1/0/0');
  });

  it('lists all round names', () => {
    expect(toPublicView(game(), pack(), JOIN).roundNames).toEqual(['Первый', 'Второй']);
  });

  it('sorts players by score desc, then by name', () => {
    const s = game();
    const names = toPublicView(s, pack(), JOIN).players.map((p) => p.name);
    expect(names).toEqual(['Аня', 'Борис', 'Вася']);
  });

  it('does not mutate the state players order', () => {
    const s = game();
    const before = s.players.map((p) => p.id);
    toPublicView(s, pack(), JOIN);
    expect(s.players.map((p) => p.id)).toEqual(before);
  });

  it('passes phase and joinUrl through', () => {
    const v = toPublicView(game({ phase: 'lobby' }), pack(), JOIN);
    expect(v.phase).toBe('lobby');
    expect(v.joinUrl).toBe(JOIN);
  });
});

describe('toAdminView', () => {
  it('contains the answer of the active question', () => {
    const s = game({ activeQuestion: { id: '0/1/1', answeringPlayerId: null, wrongPlayerIds: [] } });
    const v = toAdminView(s, pack(), JOIN);
    expect(v.activeQuestion?.answer).toBe(SECRET);
    expect(v.activeQuestion?.themeName).toBe('B');
  });

  it('has null active question when there is none', () => {
    expect(toAdminView(game(), pack(), JOIN).activeQuestion).toBeNull();
  });

  it('matches the public view apart from the answer', () => {
    const s = game({
      playedCells: ['0/0/0'],
      activeQuestion: { id: '0/0/1', answeringPlayerId: 'p1', wrongPlayerIds: [] },
    });
    const pub = toPublicView(s, pack(), JOIN);
    const adm = toAdminView(s, pack(), JOIN);
    const { answer, ...rest } = adm.activeQuestion!;
    expect(answer).toBe(SECRET);
    expect({ ...adm, activeQuestion: rest, shop: pub.shop }).toEqual(pub);
  });
});

describe('shop projections', () => {
  const HIDDEN_SECRET = 'ТАЙНЫЙ-ПРЕДМЕТ-QWE';
  const hiddenItem = {
    id: 'i1', name: HIDDEN_SECRET, description: HIDDEN_SECRET, price: 300, quantity: 2,
    hidden: true, image: '/media/shop/secret-1.jpg',
  };
  const openItem = {
    id: 'i2', name: 'Кружка', description: 'Тыквенная', price: 50, quantity: 3,
    hidden: false, image: '/media/shop/mug.png',
  };
  const shopGame = () =>
    game({
      shop: {
        open: true,
        items: [hiddenItem, openItem],
        purchases: [
          { id: 'b1', itemId: 'i1', playerId: 'p1', price: 300, at: 10 },
          { id: 'b2', itemId: 'i2', playerId: 'p2', price: 50, at: 20 },
          { id: 'b3', itemId: 'i2', playerId: 'p1', price: 50, at: 30 },
        ],
      },
    });

  it('hidden item content never reaches public view', () => {
    const s = shopGame();
    const v = toPublicView(s, pack(), JOIN);
    const json = JSON.stringify(v);
    expect(json).not.toContain(HIDDEN_SECRET);
    expect(json).not.toContain('secret-1');
    expect(v.shop.open).toBe(true);
    expect(v.shop.items[0]).toEqual({ id: 'i1', hidden: true, price: 300, quantity: 2, remaining: 1 });
  });

  it('open item shows name, description, image, remaining', () => {
    const v = toPublicView(shopGame(), pack(), JOIN);
    expect(v.shop.items[1]).toEqual({
      id: 'i2', hidden: false, price: 50, quantity: 3, remaining: 1,
      name: 'Кружка', description: 'Тыквенная', image: '/media/shop/mug.png',
    });
  });

  it('remaining is clamped at 0', () => {
    const s = shopGame();
    s.shop.items = [{ ...openItem, quantity: 1 }];
    expect(toPublicView(s, pack(), JOIN).shop.items[0].remaining).toBe(0);
  });

  it('admin view has full items and purchases newest first with names', () => {
    const v = toAdminView(shopGame(), pack(), JOIN);
    expect(v.shop.items[0]).toEqual({ ...hiddenItem, remaining: 1 });
    expect(v.shop.purchases.map((p) => p.id)).toEqual(['b3', 'b2', 'b1']);
    expect(v.shop.purchases[0]).toEqual({
      id: 'b3', itemId: 'i2', itemName: 'Кружка', playerId: 'p1', playerName: 'Вася', price: 50, at: 30,
    });
  });

  it('trophiesOf returns only that player\'s items, full content, in purchase order', () => {
    const s = shopGame();
    expect(trophiesOf(s, 'p1')).toEqual([
      { purchaseId: 'b1', item: hiddenItem },
      { purchaseId: 'b3', item: openItem },
    ]);
    expect(trophiesOf(s, 'p3')).toEqual([]);
  });
});
