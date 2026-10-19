import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseGame, parseRounds, parseSettings, GAME_ID_RE } from '../src/games/validate';

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-'));
  fs.writeFileSync(path.join(dir, 'a.mp3'), 'x');
  fs.writeFileSync(path.join(dir, 'b.jpg'), 'x');
  fs.writeFileSync(path.join(dir, 'a.jpg'), 'x');
  fs.writeFileSync(path.join(dir, 'b.mp3'), 'x');
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const settings = {
  title: 'Игра', subtitle: 'Подзаголовок', description: 'Описание',
  scoring: { wrongPenalty: true, startScore: 0 },
};
const shopItem = { id: 'i1', name: 'Зеркало', description: 'd', price: 10, quantity: 1, hidden: false };
const valid = () => ({
  version: 1, ...settings,
  rounds: [{ name: 'R1', themes: [{ name: 'T1', questions: [{ value: 100, text: 'q', answer: 'a', image: 'b.jpg' }] }] }],
  shop: [shopItem],
});
const msg = (fn: () => unknown): string => {
  try { fn(); } catch (e) { return (e as Error).message; }
  return '';
};
const bad = (patch: Record<string, unknown>) => msg(() => parseGame({ ...valid(), ...patch }, dir));

describe('parseGame', () => {
  it('GAME_ID_RE', () => {
    expect(GAME_ID_RE.test('g-abcd1234')).toBe(true);
    expect(GAME_ID_RE.test('g-ABCD1234')).toBe(false);
  });
  it('returns the valid object, trimming strings', () => {
    expect(parseGame(valid(), dir)).toEqual(valid());
    expect(parseGame({ ...valid(), title: '  Игра ' }, dir).title).toBe('Игра');
  });
  it('rounds', () => {
    expect(parseGame({ ...valid(), rounds: [] }, dir).rounds).toEqual([]);
    const { rounds: _r, ...rest } = valid();
    expect(msg(() => parseGame(rest, dir))).toContain('rounds');
    expect(bad({ rounds: [{ name: 'R', themes: [{ name: 'T', questions: [{ value: 1, text: 'q', answer: 'a' }, { value: 0, text: 'q', answer: 'a' }] }] }] }))
      .toContain('rounds[0].themes[0].questions[1].value');
  });
  it('title / subtitle', () => {
    expect(bad({ title: '' })).toContain('title');
    expect(bad({ title: 'x'.repeat(61) })).toContain('title');
    expect(bad({ subtitle: 'x'.repeat(121) })).toContain('subtitle');
  });
  it('scoring', () => {
    expect(bad({ scoring: { wrongPenalty: true, startScore: -1 } })).toContain('scoring.startScore');
    expect(bad({ scoring: { wrongPenalty: true, startScore: 1.5 } })).toContain('scoring.startScore');
    expect(bad({ scoring: { wrongPenalty: 'yes', startScore: 0 } })).toContain('scoring.wrongPenalty');
  });
  it('lobbyMusic must exist', () => {
    const m = bad({ lobbyMusic: 'нет.mp3' });
    expect(m).toContain('lobbyMusic');
    expect(m).toContain('файл не найден');
    expect(parseGame({ ...valid(), lobbyMusic: 'a.mp3' }, dir).lobbyMusic).toBe('a.mp3');
  });
  it('shop', () => {
    expect(bad({ shop: [{ ...shopItem, image: 'zz.jpg' }] })).toContain('shop[0].image');
    expect(bad({ shop: [shopItem, { ...shopItem }] })).toContain('shop[1].id');
    expect(bad({ shop: [{ ...shopItem, price: -1 }] })).toContain('shop[0]');
    expect(parseGame({ ...valid(), shop: [{ ...shopItem, image: 'b.jpg' }] }, dir).shop[0].image).toBe('b.jpg');
  });
  it('version', () => {
    expect(bad({ version: 2 })).toContain('version');
  });
});

describe('parseSettings', () => {
  it('null on invalid, object on valid', () => {
    expect(parseSettings({ ...settings, lobbyMusic: '../../state.json' }, dir)).toBeNull();
    expect(parseSettings({ ...settings, lobbyMusic: 'a.mp3' }, dir)).toEqual({ ...settings, lobbyMusic: 'a.mp3' });
  });
});

describe('parseRounds', () => {
  const qn = (patch: Record<string, unknown> = {}) => ({ value: 100, text: 'q', answer: 'a', ...patch });
  const rs = (q: Record<string, unknown>) => [{ name: 'Р', themes: [{ name: 'Т', questions: [q] }] }];
  const err = (raw: unknown) => msg(() => parseRounds(raw, dir));

  it('allows empty rounds, themes and questions', () => {
    expect(parseRounds([], dir)).toEqual([]);
    expect(parseRounds([{ name: 'Р', themes: [] }], dir)).toEqual([{ name: 'Р', themes: [] }]);
    const r = [{ name: 'Р', themes: [{ name: 'Т', questions: [] }] }];
    expect(parseRounds(r, dir)).toEqual(r);
  });
  it('parseGame accepts an empty theme in a round', () => {
    const g = { ...valid(), rounds: [{ name: 'R', themes: [{ name: 'T', questions: [] }] }] };
    expect(parseGame(g, dir).rounds[0].themes[0].questions).toEqual([]);
  });
  it('not an array', () => {
    expect(err({})).toContain('rounds');
  });
  it('round and theme name limits', () => {
    expect(err([{ name: '', themes: [] }])).toContain('rounds[0].name');
    expect(err([{ name: 'x'.repeat(61), themes: [] }])).toContain('rounds[0].name');
    expect(parseRounds([{ name: 'x'.repeat(60), themes: [] }], dir)).toHaveLength(1);
    expect(err([{ name: 'Р', themes: [{ name: 'x'.repeat(61), questions: [] }] }])).toContain('rounds[0].themes[0].name');
  });
  it('value must be an integer 1..100000', () => {
    for (const value of [0, 100001, 1.5]) expect(err(rs(qn({ value })))).toContain('rounds[0].themes[0].questions[0].value');
    for (const value of [1, 100000]) expect(parseRounds(rs(qn({ value })), dir)).toHaveLength(1);
  });
  it('text and answer limits', () => {
    expect(err(rs(qn({ text: 'x'.repeat(1001) })))).toContain('questions[0].text');
    expect(parseRounds(rs(qn({ text: 'x'.repeat(1000) })), dir)).toHaveLength(1);
    expect(err(rs(qn({ answer: 'x'.repeat(501) })))).toContain('questions[0].answer');
    expect(parseRounds(rs(qn({ answer: 'x'.repeat(500) })), dir)).toHaveLength(1);
    expect(err(rs(qn({ answer: '   ' })))).toContain('questions[0].answer');
  });
  it('media kind by extension', () => {
    expect(err(rs(qn({ image: 'b.mp3' })))).toContain('questions[0].image');
    expect(err(rs(qn({ audio: 'a.jpg' })))).toContain('questions[0].audio');
    expect(parseRounds(rs(qn({ image: 'a.jpg', audio: 'b.mp3' })), dir)[0].themes[0].questions[0])
      .toEqual(qn({ image: 'a.jpg', audio: 'b.mp3' }));
    const m = err(rs(qn({ image: 'нет.jpg' })));
    expect(m).toContain('questions[0].image');
    expect(m).toContain('файл не найден');
  });
});
