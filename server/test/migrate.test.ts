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
});

/** Мигрирует и открывает получившуюся библиотеку. */
function run(): string {
  const id = migrate({ dataDir, statePath });
  lib = new GameLibrary(path.join(dataDir, 'games'));
  return id;
}

afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('migrate', () => {
  it('создаёт игру из вопросов и копирует медиа', () => {
    const id = run();
    const def = lib.def(id)!;
    expect(def.title).toBe('Сумеречный шабаш');
    expect(def.subtitle).toBe('Наведи телефон на знак — и входи в лес');
    expect(def.rounds).toEqual(QUESTIONS.rounds);
    expect(fs.existsSync(path.join(lib.mediaDir(id), 'izba.svg'))).toBe(true);
  });

  it('переносит предметы магазина с картинками', () => {
    const id = run();
    const shop = lib.def(id)!.shop;
    expect(shop.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(shop[0].image).toBe('abc.jpg');
    expect(fs.existsSync(path.join(lib.mediaDir(id), 'abc.jpg'))).toBe(true);
    expect(shop[1].image).toBeUndefined();
  });

  it('переписывает state.json', () => {
    const id = run();
    const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(st.activeGameId).toBe(id);
    expect(st.players).toEqual(STATE.players);
    expect(st.shop).toEqual({ open: true, purchases: STATE.shop.purchases });
  });

  it('не удаляет исходные файлы', () => {
    run();
    expect(fs.existsSync(path.join(dataDir, 'questions.json'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'media', 'shop', 'abc.jpg'))).toBe(true);
  });

  it('битый questions.json даёт пустую игру', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fs.writeFileSync(path.join(dataDir, 'questions.json'), '{bad');
    const id = run();
    expect(lib.def(id)!.title).toBe('Новая игра');
    expect(lib.def(id)!.rounds).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('без state.json файл не создаётся', () => {
    fs.rmSync(statePath);
    const id = run();
    expect(id).toBeTruthy();
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('нечитаемый state.json остаётся нетронутым', () => {
    fs.writeFileSync(statePath, '{broken');
    const id = run();
    expect(id).toBeTruthy();
    expect(fs.readFileSync(statePath, 'utf8')).toBe('{broken');
  });

  it('небезопасные и неподходящие имена картинок не копируются, предмет мигрирует без image', () => {
    fs.writeFileSync(path.join(dataDir, 'media', 'shop', 'ABC.JPG'), 'x');
    const st = JSON.parse(JSON.stringify(STATE));
    const base = { description: '', price: 10, quantity: 1, hidden: false };
    st.shop.items = [
      { ...base, id: 'a', name: 'A', image: '/media/shop/../../state.json' },
      { ...base, id: 'b', name: 'B', image: '..\\..\\state.json' },
      { ...base, id: 'c', name: 'C', image: '/media/shop/ABC.JPG' },
      { ...base, id: 'd', name: 'D', image: '..' },
    ];
    fs.writeFileSync(statePath, JSON.stringify(st));
    const id = run();
    const shop = lib.def(id)!.shop;
    expect(shop.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    for (const i of shop) expect(i.image).toBeUndefined();
    expect(fs.readdirSync(lib.mediaDir(id))).toEqual(['izba.svg']);
  });

  it('сохраняет state.json.pre-games и не перезаписывает его повторно', () => {
    const backup = statePath + '.pre-games';
    run();
    expect(JSON.parse(fs.readFileSync(backup, 'utf8'))).toEqual(STATE);
    fs.rmSync(path.join(dataDir, 'games'), { recursive: true });
    run();
    expect(JSON.parse(fs.readFileSync(backup, 'utf8'))).toEqual(STATE);
  });

  it('сбой посреди миграции не оставляет games/, повторный запуск переносит всё', () => {
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('диск отвалился'); });
    expect(() => migrate({ dataDir, statePath })).toThrow(/Миграция в библиотеку игр не удалась.*диск отвалился/);
    expect(fs.existsSync(path.join(dataDir, 'games'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'games.tmp'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toEqual(STATE);
    vi.mocked(fs.renameSync).mockImplementation(rename);

    const id = run();
    expect(lib.def(id)!.shop.map((i) => i.id)).toEqual(['i1', 'i2']);
    const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(st.players).toEqual(STATE.players);
    expect(st.shop.purchases).toEqual(STATE.shop.purchases);
  });

  it('устаревшая games.tmp/ от прошлого сбоя убирается', () => {
    fs.mkdirSync(path.join(dataDir, 'games.tmp', 'g-stale000'), { recursive: true });
    const id = run();
    expect(fs.existsSync(path.join(dataDir, 'games.tmp'))).toBe(false);
    expect(lib.entries().map((e) => e.id)).toEqual([id]);
  });

  it('медиа вопроса не скопировалось — ссылка убирается с предупреждением, игра валидна', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const copy = fs.copyFileSync;
    vi.spyOn(fs, 'copyFileSync').mockImplementation((src, dst, mode) => {
      if (String(src).endsWith('izba.svg')) throw new Error('EACCES');
      return copy(src, dst, mode);
    });
    const id = run();
    expect(lib.def(id)!.rounds[0].themes[0].questions[0]).toEqual({ value: 100, text: 'Вопрос?', answer: 'Ответ' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('izba.svg'));
  });
});
