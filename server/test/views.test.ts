import { describe, expect, it } from 'vitest';
import type { ActiveGame, GameState, ShopItem } from '@quiz/shared';
import { initialState } from '../src/game/logic';
import { editView, summarize, toAdminView, toPublicView, trophiesOf } from '../src/views';

const SECRET = 'SECRET-ANSWER-XYZ';
const JOIN = 'http://192.168.0.5:3000/';
const GID = 'g-aaaaaaaa';

const theme = (n: string) => ({
  name: n,
  questions: [100, 200].map((value) => ({ value, text: `q${value}`, answer: SECRET })),
});
const pack = (shop: ShopItem[] = []): ActiveGame => ({
  id: GID,
  def: {
    version: 1, title: 'Хэллоуин', subtitle: 'Подзаголовок', description: 'о', background: 'bg.jpg',
    scoring: { wrongPenalty: false, startScore: 0 },
    rounds: [
      { name: 'Первый', themes: [theme('A'), theme('B')] },
      { name: 'Второй', themes: [theme('C')] },
    ],
    shop,
  },
});
const game = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(GID),
  phase: 'game',
  players: [
    { id: 'p1', name: 'Вася', score: 100, online: true },
    { id: 'p2', name: 'Аня', score: 300, online: false },
    { id: 'p3', name: 'Борис', score: 100, online: true },
  ],
  ...over,
});

describe('toPublicView', () => {
  it('skips themes without questions but keeps original theme index in cell ids', () => {
    const p = pack();
    p.def.rounds[0].themes = [{ name: 'A', questions: [] }, theme('B')];
    const v = toPublicView(game(), p, JOIN);
    expect(v.themes.map((x) => x.name)).toEqual(['B']);
    expect(v.themes[0].cells.map((c) => c.id)).toEqual(['0/1/0', '0/1/1']);
  });

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

  it('game block carries id, title, subtitle and media URLs', () => {
    expect(toPublicView(game(), pack(), JOIN).game).toEqual({
      id: GID, title: 'Хэллоуин', subtitle: 'Подзаголовок', background: `/games/${GID}/media/bg.jpg`,
    });
  });

  it('question image and audio become URLs', () => {
    const g = pack();
    g.def.rounds[0].themes[0].questions[0] = { value: 100, text: 'q', answer: 'a', image: 'izba.svg', audio: 'a b.mp3' };
    const s = game({ activeQuestion: { id: '0/0/0', answeringPlayerId: null, wrongPlayerIds: [] } });
    const q = toPublicView(s, g, JOIN).activeQuestion!;
    expect(q.image).toBe(`/games/${GID}/media/izba.svg`);
    expect(q.audio).toBe(`/games/${GID}/media/a%20b.mp3`);
  });
});

describe('toAdminView', () => {
  it('contains the answer of the active question', () => {
    const s = game({ activeQuestion: { id: '0/1/1', answeringPlayerId: null, wrongPlayerIds: [] } });
    const v = toAdminView(s, pack(), JOIN, [], null);
    expect(v.activeQuestion?.answer).toBe(SECRET);
    expect(v.activeQuestion?.themeName).toBe('B');
  });

  it('has null active question when there is none', () => {
    expect(toAdminView(game(), pack(), JOIN, [], null).activeQuestion).toBeNull();
  });

  it('passes games and editing through', () => {
    const games = [summarize({ id: GID, def: pack().def }, GID)];
    const editing = editView(game(), pack(), GID);
    const v = toAdminView(game(), pack(), JOIN, games, editing);
    expect(v.games).toBe(games);
    expect(v.editing).toBe(editing);
  });

  it('matches the public view apart from the answer, shop, games and editing', () => {
    const s = game({
      playedCells: ['0/0/0'],
      activeQuestion: { id: '0/0/1', answeringPlayerId: 'p1', wrongPlayerIds: [] },
    });
    const pub = toPublicView(s, pack(), JOIN);
    const adm = toAdminView(s, pack(), JOIN, [], null);
    const { answer, ...rest } = adm.activeQuestion!;
    expect(answer).toBe(SECRET);
    const { games, editing, ...admRest } = adm;
    expect({ ...admRest, activeQuestion: rest, shop: pub.shop }).toEqual(pub);
  });
});

describe('summarize', () => {
  it('broken entry', () => {
    expect(summarize({ id: GID, error: 'oops' }, GID)).toEqual({
      id: GID, title: GID, description: '', rounds: 0, questions: 0, active: false, error: 'oops',
    });
  });

  it('counts questions across rounds and flags active', () => {
    expect(summarize({ id: GID, def: pack().def }, GID)).toEqual({
      id: GID, title: 'Хэллоуин', description: 'о', rounds: 2, questions: 6, active: true,
    });
    expect(summarize({ id: GID, def: pack().def }, 'other').active).toBe(false);
  });
});

describe('shop projections', () => {
  const HIDDEN_SECRET = 'ТАЙНЫЙ-ПРЕДМЕТ-QWE';
  const hiddenItem: ShopItem = {
    id: 'i1', name: HIDDEN_SECRET, description: HIDDEN_SECRET, price: 300, quantity: 2,
    hidden: true, image: 'secret-1.jpg',
  };
  const openItem: ShopItem = {
    id: 'i2', name: 'Кружка', description: 'Тыквенная', price: 50, quantity: 3,
    hidden: false, image: 'mug.png',
  };
  const mug = `/games/${GID}/media/mug.png`;
  const shopPack = (items: ShopItem[] = [hiddenItem, openItem]) => pack(items);
  const shopGame = () =>
    game({
      shop: {
        open: true,
        purchases: [
          { id: 'b1', itemId: 'i1', playerId: 'p1', price: 300, at: 10 },
          { id: 'b2', itemId: 'i2', playerId: 'p2', price: 50, at: 20 },
          { id: 'b3', itemId: 'i2', playerId: 'p1', price: 50, at: 30 },
        ],
      },
    });

  it('hidden item content never reaches public view', () => {
    const v = toPublicView(shopGame(), shopPack(), JOIN);
    const json = JSON.stringify(v);
    expect(json).not.toContain(HIDDEN_SECRET);
    expect(json).not.toContain('secret-1');
    expect(v.shop.open).toBe(true);
    expect(v.shop.items[0]).toEqual({ id: 'i1', hidden: true, price: 300, quantity: 2, remaining: 1 });
  });

  it('open item shows name, description, image URL, remaining', () => {
    const v = toPublicView(shopGame(), shopPack(), JOIN);
    expect(v.shop.items[1]).toEqual({
      id: 'i2', hidden: false, price: 50, quantity: 3, remaining: 1,
      name: 'Кружка', description: 'Тыквенная', image: mug,
    });
  });

  it('remaining is clamped at 0', () => {
    const v = toPublicView(shopGame(), shopPack([{ ...openItem, quantity: 1 }]), JOIN);
    expect(v.shop.items[0].remaining).toBe(0);
  });

  it('admin view has full items (file name + imageUrl) and purchases newest first with names', () => {
    const v = toAdminView(shopGame(), shopPack(), JOIN, [], null);
    expect(v.shop.items[0]).toEqual({ ...hiddenItem, remaining: 1, imageUrl: `/games/${GID}/media/secret-1.jpg` });
    expect(v.shop.purchases.map((p) => p.id)).toEqual(['b3', 'b2', 'b1']);
    expect(v.shop.purchases[0]).toEqual({
      id: 'b3', itemId: 'i2', itemName: 'Кружка', playerId: 'p1', playerName: 'Вася', price: 50, at: 30,
    });
  });

  it("trophiesOf returns only that player's items with image URLs, in purchase order", () => {
    const s = shopGame();
    expect(trophiesOf(s, shopPack(), 'p1')).toEqual([
      { purchaseId: 'b1', item: { ...hiddenItem, image: `/games/${GID}/media/secret-1.jpg` } },
      { purchaseId: 'b3', item: { ...openItem, image: mug } },
    ]);
    expect(trophiesOf(s, shopPack(), 'p3')).toEqual([]);
  });

  describe('editView', () => {
    const g = () => {
      const a = shopPack();
      a.def.lobbyMusic = 'music.mp3';
      return a;
    };

    it('inactive game: remaining equals quantity, imageUrl and media URLs set', () => {
      const v = editView(shopGame(), g(), 'other');
      expect(v.active).toBe(false);
      expect(v.shop.map((i) => i.remaining)).toEqual([2, 3]);
      expect(v.shop[1].imageUrl).toBe(mug);
      expect(v.media).toEqual({ lobbyMusic: `/games/${GID}/media/music.mp3`, background: `/games/${GID}/media/bg.jpg` });
      expect(v.settings.lobbyMusic).toBe('music.mp3');
      expect(v.rounds.map((r) => [r.name, r.themes.length])).toEqual([['Первый', 2], ['Второй', 1]]);
    });

    it('rounds carry full questions with media URLs', () => {
      const a = g();
      a.def.rounds[0].themes[0].questions[0] = { value: 100, text: 't', answer: 'a', image: 'a.jpg', audio: 'b.mp3' };
      const q = editView(shopGame(), a, 'other').rounds[0].themes[0].questions;
      expect(q[0]).toEqual({
        value: 100, text: 't', answer: 'a', image: 'a.jpg', audio: 'b.mp3',
        imageUrl: '/games/g-aaaaaaaa/media/a.jpg', audioUrl: '/games/g-aaaaaaaa/media/b.mp3',
      });
      expect(q[1]).toEqual({ value: 200, text: 'q200', answer: SECRET });
    });

    it('locked only for the active game in phase game', () => {
      expect(editView(shopGame(), g(), GID).locked).toBe(true);
      expect(editView(shopGame(), g(), 'other').locked).toBe(false);
      expect(editView({ ...shopGame(), phase: 'lobby' }, g(), GID).locked).toBe(false);
    });

    it('active game: remaining accounts for purchases', () => {
      const v = editView(shopGame(), g(), GID);
      expect(v.active).toBe(true);
      expect(v.shop.map((i) => i.remaining)).toEqual([1, 1]);
    });
  });
});
