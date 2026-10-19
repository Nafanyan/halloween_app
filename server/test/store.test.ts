import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@quiz/shared';
import { GAME_ID_RE } from '../src/games/validate';
import { GameLibrary, emptyGame, newGameId, referencedMedia } from '../src/games/store';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('GameLibrary', () => {
  it('newGameId соответствует GAME_ID_RE', () => {
    for (let i = 0; i < 20; i++) expect(newGameId()).toMatch(GAME_ID_RE);
  });

  it('create создаёт папку и перечитывается заново', () => {
    const lib = new GameLibrary(dir);
    const { id, def } = lib.create('Игра');
    expect(fs.existsSync(path.join(dir, id, 'game.json'))).toBe(true);
    expect(fs.statSync(path.join(dir, id, 'media')).isDirectory()).toBe(true);
    expect(def).toEqual(emptyGame('Игра'));
    expect(new GameLibrary(dir).def(id)).toEqual(emptyGame('Игра'));
    expect(lib.mediaDir(id)).toBe(path.join(dir, id, 'media'));
  });

  it('битая игра -> error, def null; посторонние папки игнорируются', () => {
    fs.mkdirSync(path.join(dir, 'g-aaaaaaaa'));
    fs.writeFileSync(path.join(dir, 'g-aaaaaaaa', 'game.json'), '{');
    fs.mkdirSync(path.join(dir, 'junk'));
    const lib = new GameLibrary(dir);
    const e = lib.get('g-aaaaaaaa');
    expect(e && 'error' in e && e.error).toContain('не удалось прочитать JSON');
    expect(lib.def('g-aaaaaaaa')).toBeNull();
    expect(lib.get('junk')).toBeUndefined();
    expect(lib.entries()).toHaveLength(1);
  });

  it('entries: по title (ru), битые в конце', () => {
    const lib = new GameLibrary(dir);
    const b = lib.create('Борщ');
    const a = lib.create('Арбуз');
    fs.mkdirSync(path.join(dir, 'g-00000000'));
    fs.writeFileSync(path.join(dir, 'g-00000000', 'game.json'), '{');
    expect(new GameLibrary(dir).entries().map((e) => e.id)).toEqual([a.id, b.id, 'g-00000000']);
  });

  it('duplicate копирует медиа и меняет title', () => {
    const lib = new GameLibrary(dir);
    const { id } = lib.create('Игра');
    fs.writeFileSync(path.join(dir, id, 'media', 'x.jpg'), 'x');
    const copy = lib.duplicate(id)!;
    expect(copy.id).not.toBe(id);
    expect(copy.def.title).toBe('Игра (копия)');
    expect(fs.existsSync(path.join(dir, copy.id, 'media', 'x.jpg'))).toBe(true);
    expect(new GameLibrary(dir).def(copy.id)!.title).toBe('Игра (копия)');
    expect(lib.def(id)!.title).toBe('Игра');
    expect(lib.duplicate('g-zzzzzzzz')).toBeNull();
  });

  it('duplicate обрезает title до 60 символов', () => {
    const lib = new GameLibrary(dir);
    const { id } = lib.create('я'.repeat(60));
    const copy = lib.duplicate(id)!;
    expect([...copy.def.title].length).toBeLessThanOrEqual(60);
  });

  it('save: ошибка записи бросает, память и tmp не страдают', () => {
    const lib = new GameLibrary(dir);
    const { id, def } = lib.create('Игра');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('boom'); });
    expect(() => lib.save(id, { ...def, title: 'Другая' })).toThrow('boom');
    expect(lib.def(id)!.title).toBe('Игра');
    expect(fs.existsSync(path.join(dir, id, 'game.json.tmp'))).toBe(false);
  });

  it('save сохраняет на диск и в память', () => {
    const lib = new GameLibrary(dir);
    const { id, def } = lib.create('Игра');
    lib.save(id, { ...def, title: 'Новая' });
    expect(lib.def(id)!.title).toBe('Новая');
    expect(new GameLibrary(dir).def(id)!.title).toBe('Новая');
  });

  it('remove удаляет папку и запись', () => {
    const lib = new GameLibrary(dir);
    const { id } = lib.create('Игра');
    lib.remove(id);
    expect(fs.existsSync(path.join(dir, id))).toBe(false);
    expect(lib.get(id)).toBeUndefined();
  });

  it('sweepMedia удаляет неиспользуемые файлы', () => {
    const lib = new GameLibrary(dir);
    const { id } = lib.create('Игра');
    const md = lib.mediaDir(id);
    for (const f of ['lm.mp3', 'bg.jpg', 'q.png', 'q.mp3', 'shop.png', 'orphan.mp3'])
      fs.writeFileSync(path.join(md, f), 'x');
    const def: GameDef = {
      ...emptyGame('Игра'), lobbyMusic: 'lm.mp3', background: 'bg.jpg',
      rounds: [{ name: 'Р', themes: [{ name: 'Т', questions: [{ value: 100, text: 'q', answer: 'a', image: 'q.png', audio: 'q.mp3' }] }] }],
      shop: [{ id: 'i1', name: 'n', description: '', price: 1, quantity: 1, hidden: false, image: 'shop.png' }],
    };
    lib.save(id, def);
    expect([...referencedMedia(def)].sort()).toEqual(['bg.jpg', 'lm.mp3', 'q.mp3', 'q.png', 'shop.png']);
    expect(lib.sweepMedia(id)).toEqual(['orphan.mp3']);
    expect(fs.readdirSync(md).sort()).toEqual(['bg.jpg', 'lm.mp3', 'q.mp3', 'q.png', 'shop.png']);
  });
});
