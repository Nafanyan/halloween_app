import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GameState, QuestionPack } from '@quiz/shared';
import { saveState, loadState } from '../src/persistence';
import { initialState } from '../src/game/logic';

const pack: QuestionPack = {
  rounds: [{ name: 'Р1', themes: [{ name: 'Т', questions: [
    { value: 100, text: 'a', answer: 'b' },
    { value: 200, text: 'c', answer: 'd' },
  ] }] }],
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-persist-'));
  file = path.join(dir, 'state.json');
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sample = (): GameState => ({
  phase: 'game',
  players: [
    { id: 'p1', name: 'Аня', score: 300, online: true },
    { id: 'p2', name: 'Боря', score: -100, online: true },
  ],
  playedCells: ['0/0/0'],
  currentRound: 0,
  activeQuestion: { id: '0/0/1', answeringPlayerId: 'p1', wrongPlayerIds: ['p2'] },
  shop: { open: false, items: [], purchases: [] },
});

describe('persistence', () => {
  it('round-trips state, all players offline', () => {
    const s = sample();
    saveState(file, s);
    const expected = { ...s, players: s.players.map((p) => ({ ...p, online: false })) };
    expect(loadState(file, pack)).toEqual(expected);
  });

  it('returns null when file is missing', () => {
    expect(loadState(file, pack)).toBeNull();
  });

  it('drops played cells whose question was removed from pack', () => {
    saveState(file, { ...sample(), playedCells: ['0/0/0', '0/0/9', '5/0/0'] });
    expect(loadState(file, pack)!.playedCells).toEqual(['0/0/0']);
  });

  it('keeps active question across restart', () => {
    saveState(file, sample());
    expect(loadState(file, pack)!.activeQuestion!.id).toBe('0/0/1');
  });

  it('nulls active question that no longer exists', () => {
    saveState(file, { ...sample(), activeQuestion: { id: '0/0/9', answeringPlayerId: null, wrongPlayerIds: [] } });
    expect(loadState(file, pack)!.activeQuestion).toBeNull();
  });

  it('clears answerer and filters wrong ids of unknown players', () => {
    saveState(file, { ...sample(), activeQuestion: { id: '0/0/1', answeringPlayerId: 'ghost', wrongPlayerIds: ['ghost', 'p2'] } });
    const aq = loadState(file, pack)!.activeQuestion!;
    expect(aq.answeringPlayerId).toBeNull();
    expect(aq.wrongPlayerIds).toEqual(['p2']);
  });

  it('resets out-of-range currentRound to 0', () => {
    saveState(file, { ...sample(), currentRound: 7 });
    expect(loadState(file, pack)!.currentRound).toBe(0);
  });

  it('leaves no .tmp file after save', () => {
    saveState(file, initialState());
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(file + '.tmp')).toBe(false);
  });

  it.each([
    ['broken JSON', '{"phase":'],
    ['empty file', ''],
    ['non-object JSON', '[1,2]'],
    ['missing players array', '{"phase":"game"}'],
  ])('backs up %s to .bak, warns, returns null', (_n, content) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fs.writeFileSync(file, content);
    expect(loadState(file, pack)).toBeNull();
    expect(fs.existsSync(file + '.bak')).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  describe('shop', () => {
    const item = { name: 'Приз', description: 'д', price: 10, quantity: 2, hidden: false };
    const write = (patch: (o: any) => void) => {
      const o: any = JSON.parse(JSON.stringify(sample()));
      patch(o);
      fs.writeFileSync(file, JSON.stringify(o));
    };

    it('old state.json without shop loads with empty shop', () => {
      write((o) => { delete o.shop; });
      expect(loadState(file, pack)!.shop).toEqual({ open: false, items: [], purchases: [] });
    });

    it('round-trips shop including open flag', () => {
      const s = sample();
      s.shop = {
        open: true,
        items: [{ id: 'i1', ...item }],
        purchases: [{ id: 'u1', itemId: 'i1', playerId: 'p1', price: 10, at: 5 }],
      };
      saveState(file, s);
      expect(loadState(file, pack)!.shop).toEqual(s.shop);
    });

    it('drops invalid items and orphan purchases', () => {
      write((o) => {
        o.shop = {
          open: true,
          items: [{ id: 'i1', ...item }, { id: 'bad', name: '' }, { id: 'i1', ...item }],
          purchases: [
            { id: 'u1', itemId: 'i1', playerId: 'p1', price: 10, at: 5 },
            { id: 'u2', itemId: 'nope', playerId: 'p1', price: 10, at: 5 },
            { id: 'u3', itemId: 'i1', playerId: 'ghost', price: 10, at: 5 },
            { id: 'u4', itemId: 'i1', playerId: 'p1', price: 1.5, at: 5 },
          ],
        };
      });
      const shop = loadState(file, pack)!.shop;
      expect(shop.items).toHaveLength(1);
      expect(shop.purchases.map((p) => p.id)).toEqual(['u1']);
    });
  });
});
