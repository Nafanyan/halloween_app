import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameLibrary } from '../src/games/store';
import { migrate } from '../src/games/migrate';

let dir: string;
let dataDir: string;
let statePath: string;
let lib: GameLibrary;

const QUESTIONS = {
  rounds: [{
    name: 'Раунд 1',
    themes: [{ name: 'Тема', questions: [
      { value: 100, text: 'Вопрос?', answer: 'Ответ', image: 'izba.svg' },
    ] }],
  }],
};
const STATE = {
  phase: 'game',
  players: [
    { id: 'p1', name: 'Аня', score: 300, online: false },
    { id: 'p2', name: 'Боря', score: 50, online: false },
  ],
  playedCells: [], currentRound: 0, activeQuestion: null,
  shop: {
    open: true,
    items: [
      { id: 'i1', name: 'Кружка', description: 'Тёплая', price: 100, quantity: 2, hidden: false, image: '/media/shop/abc.jpg' },
      { id: 'i2', name: 'Свеча', description: '', price: 10, quantity: 1, hidden: true, image: '/media/shop/gone.jpg' },
      { name: 'Без id', description: '', price: 10, quantity: 1, hidden: false },
      { id: 'i4', name: '', description: '', price: 10, quantity: 1, hidden: false },
    ],
    purchases: [{ id: 'pu1', itemId: 'i1', playerId: 'p1', price: 100, at: 1 }],
  },
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-'));
  dataDir = path.join(dir, 'data');
  fs.mkdirSync(path.join(dataDir, 'media', 'shop'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'questions.json'), JSON.stringify(QUESTIONS));
  fs.writeFileSync(path.join(dataDir, 'media', 'izba.svg'), '<svg/>');
  fs.writeFileSync(path.join(dataDir, 'media', 'shop', 'abc.jpg'), 'jpg');
  statePath = path.join(dataDir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify(STATE));
  lib = new GameLibrary(path.join(dataDir, 'games'));
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('migrate', () => {
  it('создаёт игру из вопросов и копирует медиа', () => {
    const id = migrate({ dataDir, statePath, lib });
    const def = lib.def(id)!;
    expect(def.title).toBe('Сумеречный шабаш');
    expect(def.subtitle).toBe('Наведи телефон на знак — и входи в лес');
    expect(def.rounds).toEqual(QUESTIONS.rounds);
    expect(fs.existsSync(path.join(lib.mediaDir(id), 'izba.svg'))).toBe(true);
  });

  it('переносит предметы магазина с картинками', () => {
    const id = migrate({ dataDir, statePath, lib });
    const shop = lib.def(id)!.shop;
    expect(shop.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(shop[0].image).toBe('abc.jpg');
    expect(fs.existsSync(path.join(lib.mediaDir(id), 'abc.jpg'))).toBe(true);
    expect(shop[1].image).toBeUndefined();
  });

  it('переписывает state.json', () => {
    const id = migrate({ dataDir, statePath, lib });
    const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(st.activeGameId).toBe(id);
    expect(st.players).toEqual(STATE.players);
    expect(st.shop).toEqual({ open: true, purchases: STATE.shop.purchases });
  });

  it('не удаляет исходные файлы', () => {
    migrate({ dataDir, statePath, lib });
    expect(fs.existsSync(path.join(dataDir, 'questions.json'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'media', 'shop', 'abc.jpg'))).toBe(true);
  });

  it('битый questions.json даёт пустую игру', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fs.writeFileSync(path.join(dataDir, 'questions.json'), '{bad');
    const id = migrate({ dataDir, statePath, lib });
    expect(lib.def(id)!.title).toBe('Новая игра');
    expect(lib.def(id)!.rounds).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('без state.json файл не создаётся', () => {
    fs.rmSync(statePath);
    const id = migrate({ dataDir, statePath, lib });
    expect(id).toBeTruthy();
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('нечитаемый state.json остаётся нетронутым', () => {
    fs.writeFileSync(statePath, '{broken');
    const id = migrate({ dataDir, statePath, lib });
    expect(id).toBeTruthy();
    expect(fs.readFileSync(statePath, 'utf8')).toBe('{broken');
  });
});
