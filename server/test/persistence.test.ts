import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GameDef, GameState } from '@quiz/shared';
import { saveState, loadState, readActiveGameId } from '../src/persistence';
import { initialState } from '../src/game/logic';

const shopItem = { id: 'i1', name: 'Приз', description: 'д', price: 10, quantity: 2, hidden: false };
const pack: GameDef = {
  version: 1, title: 'T', subtitle: '', description: '',
  scoring: { wrongPenalty: false, startScore: 0 },
  rounds: [{ name: 'Р1', themes: [{ name: 'Т', questions: [
    { value: 100, text: 'a', answer: 'b' },
    { value: 200, text: 'c', answer: 'd' },
  ] }] }],
  shop: [shopItem],
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
  shop: { open: false, purchases: [] },
  activeGameId: 'g-aaaaaaaa',
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
    saveState(file, initialState('g-aaaaaaaa'));
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

  it('reads activeGameId back, empty string when absent', () => {
    saveState(file, sample());
    expect(loadState(file, pack)!.activeGameId).toBe('g-aaaaaaaa');
    const o: any = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete o.activeGameId;
    fs.writeFileSync(file, JSON.stringify(o));
    expect(loadState(file, pack)!.activeGameId).toBe('');
  });

  describe('readActiveGameId', () => {
    it('returns the id from the file', () => {
      saveState(file, sample());
      expect(readActiveGameId(file)).toBe('g-aaaaaaaa');
    });

    it('returns null for missing file and broken JSON without renaming', () => {
      expect(readActiveGameId(file)).toBeNull();
      fs.writeFileSync(file, '{"phase":');
      expect(readActiveGameId(file)).toBeNull();
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.existsSync(file + '.bak')).toBe(false);
    });

    it('returns null when activeGameId is not a string', () => {
      fs.writeFileSync(file, JSON.stringify({ phase: 'lobby', players: [] }));
      expect(readActiveGameId(file)).toBeNull();
    });
  });

  describe('shop', () => {
    const write = (patch: (o: any) => void) => {
      const o: any = JSON.parse(JSON.stringify(sample()));
      patch(o);
      fs.writeFileSync(file, JSON.stringify(o));
    };

    it('old state.json without shop loads with empty shop', () => {
      write((o) => { delete o.shop; });
      expect(loadState(file, pack)!.shop).toEqual({ open: false, purchases: [] });
    });

    it('round-trips shop including open flag', () => {
      const s = sample();
      s.shop = { open: true, purchases: [{ id: 'u1', itemId: 'i1', playerId: 'p1', price: 10, at: 5 }] };
      saveState(file, s);
      expect(loadState(file, pack)!.shop).toEqual(s.shop);
    });

    it('legacy shop.items are ignored; invalid and orphan purchases dropped', () => {
      write((o) => {
        o.shop = {
          open: true,
          items: [{ id: 'old', name: 'Старый', description: '', price: 1, quantity: 1, hidden: false }],
          purchases: [
            { id: 'u1', itemId: 'i1', playerId: 'p1', price: 10, at: 5 },
            { id: 'u2', itemId: 'nope', playerId: 'p1', price: 10, at: 5 },
            { id: 'u3', itemId: 'i1', playerId: 'ghost', price: 10, at: 5 },
            { id: 'u4', itemId: 'i1', playerId: 'p1', price: 1.5, at: 5 },
            { id: 'u5', itemId: 'old', playerId: 'p1', price: 1, at: 5 },
          ],
        };
      });
      const shop = loadState(file, pack)!.shop;
      expect(shop).not.toHaveProperty('items');
      expect(shop.purchases.map((p) => p.id)).toEqual(['u1']);
    });
  });
});
