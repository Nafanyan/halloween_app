import fs from 'node:fs';
import path from 'node:path';
import type { ShopItem } from '@quiz/shared';
import { IMAGE_RE, parseItem } from '../game/shop';
import { loadQuestions } from '../questions';
import { GameLibrary, emptyGame } from './store';
import { parseGame } from './validate';

function copyMedia(fromDir: string, toDir: string, name: string): boolean {
  try {
    const src = path.join(fromDir, name);
    if (!fs.statSync(src).isFile()) return false;
    fs.mkdirSync(toDir, { recursive: true });
    fs.copyFileSync(src, path.join(toDir, name));
    return true;
  } catch {
    return false;
  }
}

/**
 * Запускать, только если папки games/ ещё нет. Игра собирается во временной games.tmp/
 * и переименовывается в games/ только целиком; state.json переписывается после этого,
 * а его прежняя версия сохраняется как state.json.pre-games. Возвращает id созданной игры.
 */
export function migrate(opts: { dataDir: string; statePath: string }): string {
  const { dataDir, statePath } = opts;
  const mediaSrc = path.join(dataDir, 'media');
  const gamesDir = path.join(dataDir, 'games');
  const tmpDir = path.join(dataDir, 'games.tmp');

  const backup = statePath + '.pre-games';
  if (fs.existsSync(statePath) && !fs.existsSync(backup)) fs.copyFileSync(statePath, backup);

  let state: any = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) state = parsed;
  } catch { /* нет файла или битый JSON — не трогаем */ }

  let pack;
  try {
    pack = loadQuestions(path.join(dataDir, 'questions.json'), mediaSrc);
  } catch (e) {
    console.warn(`Миграция: вопросы не загружены, создана пустая игра (${(e as Error).message})`);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  let id: string;
  try {
    const lib = new GameLibrary(tmpDir);
    const title = pack ? 'Сумеречный шабаш' : 'Новая игра';
    id = lib.create(title).id;
    const mediaDst = lib.mediaDir(id);
    const def = emptyGame(title);

    if (pack) {
      def.subtitle = 'Наведи телефон на знак — и входи в лес';
      def.rounds = pack.rounds;
      for (const r of pack.rounds)
        for (const t of r.themes)
          for (const q of t.questions)
            for (const key of ['image', 'audio'] as const) {
              const name = q[key];
              if (name && !copyMedia(mediaSrc, mediaDst, name)) {
                console.warn(`Миграция: не удалось скопировать ${name}, вопрос «${q.text}» перенесён без него`);
                delete q[key];
              }
            }
    }

    const legacy = state?.shop?.items;
    if (Array.isArray(legacy)) {
      const shop: ShopItem[] = [];
      for (const raw of legacy) {
        if (typeof raw !== 'object' || raw === null || typeof raw.id !== 'string') continue;
        const { image, ...rest } = raw as Record<string, unknown>;
        let file: string | undefined;
        if (typeof image === 'string') {
          const name = image.startsWith('/media/shop/') ? image.slice('/media/shop/'.length) : image;
          if (IMAGE_RE.test(name) && copyMedia(path.join(mediaSrc, 'shop'), mediaDst, name)) file = name;
        }
        const parsed = parseItem(file ? { ...rest, image: file } : rest);
        if (parsed) shop.push({ ...parsed, id: raw.id });
      }
      def.shop = shop;
    }

    lib.save(id, def);
    parseGame(JSON.parse(fs.readFileSync(path.join(tmpDir, id, 'game.json'), 'utf8')), mediaDst);
    fs.renameSync(tmpDir, gamesDir);
  } catch (e) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw new Error(`Миграция в библиотеку игр не удалась, данные не изменены: ${(e as Error).message}`);
  }

  if (state) {
    const old = typeof state.shop === 'object' && state.shop !== null ? state.shop : {};
    const next = {
      ...state,
      activeGameId: id,
      shop: { open: old.open === true, purchases: Array.isArray(old.purchases) ? old.purchases : [] },
    };
    const tmp = statePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, statePath);
  }
  return id;
}
