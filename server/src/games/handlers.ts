import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  ActiveGame, ClientToServerEvents, ErrorCode, GameDef, GameState, ServerToClientEvents, ShopItem,
} from '@quiz/shared';
import * as logic from '../game/logic';
import * as shop from '../game/shop';
import type { GameLibrary } from './store';
import { GAME_ID_RE, parseSettings } from './validate';

export interface SocketData { isAdmin?: boolean; playerId?: string; editingId?: string }
export type QuizSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type AckFn = (r: unknown) => void;

const noop: AckFn = () => {};
export const ackOf = (v: unknown): AckFn => (typeof v === 'function' ? (v as AckFn) : noop);
export const fail = (error: ErrorCode) => ({ ok: false as const, error });
export const obj = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {});

/** Игра по id от клиента: id проверяется до любого обращения к диску. */
export function findGame(lib: GameLibrary, id: unknown): ActiveGame | ErrorCode {
  if (typeof id !== 'string' || !GAME_ID_RE.test(id) || !lib.get(id)) return 'NOT_FOUND';
  const def = lib.def(id);
  return def ? { id, def } : 'GAME_BROKEN';
}

export interface GameContext {
  lib: GameLibrary;
  state(): GameState;
  /** Сохраняет и рассылает новое состояние прогресса. */
  commit(next: GameState): void;
  /** Рассылка после изменения игры в библиотеке (без изменения прогресса). */
  changed(gameId: string): void;
  /** state:admin только этому сокету. */
  sendAdmin(socket: QuizSocket): void;
}

const MAX_TITLE = 60;

export function registerGameHandlers(socket: QuizSocket, ctx: GameContext): void {
  const { lib } = ctx;
  const isActive = (id: string) => id === ctx.state().activeGameId;

  /** Админское событие; `run` возвращает ответ для ack. */
  const on = (event: keyof ClientToServerEvents, run: (p: Record<string, unknown>) => unknown) => {
    (socket.on as (e: string, h: (...a: unknown[]) => void) => void)(event, (...args) => {
      const reply = ackOf(args[args.length - 1]);
      if (!socket.data.isAdmin) return reply(fail('UNAUTHORIZED'));
      reply(run(obj(args[0])));
    });
  };

  /** Запись на диск; ошибка → SAVE_FAILED, состояние в памяти не меняется. */
  const saved = <T>(write: () => T): T | null => {
    try {
      return write();
    } catch (e) {
      console.warn(`[games] не удалось записать: ${(e as Error).message}`);
      return null;
    }
  };

  /** Сохраняет новый каталог магазина игры; `after` — правка прогресса для активной игры. */
  const saveShop = (game: ActiveGame, result: shop.CatalogResult, after?: (s: GameState) => GameState) => {
    if (!result.ok) return result;
    const missing = result.items.some((i: ShopItem) =>
      i.image !== undefined && !fs.existsSync(path.join(lib.mediaDir(game.id), i.image)));
    if (missing) return fail('INVALID_ITEM');
    const def: GameDef = { ...game.def, shop: result.items };
    if (saved(() => lib.save(game.id, def)) === null) return fail('SAVE_FAILED');
    if (after && isActive(game.id)) ctx.commit(after(ctx.state()));
    else ctx.changed(game.id);
    return { ok: true };
  };

  on('game:create', (p) => {
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    if (title === '' || [...title].length > MAX_TITLE) return fail('INVALID_SETTINGS');
    const created = saved(() => lib.create(title));
    if (!created) return fail('SAVE_FAILED');
    ctx.changed(created.id);
    return { ok: true, id: created.id };
  });

  on('game:duplicate', (p) => {
    const game = findGame(lib, p.id);
    if (typeof game === 'string') return fail(game);
    const copy = saved(() => lib.duplicate(game.id));
    if (!copy) return fail('SAVE_FAILED');
    ctx.changed(copy.id);
    return { ok: true, id: copy.id };
  });

  on('game:delete', (p) => {
    const id = p.id;
    if (typeof id !== 'string' || !GAME_ID_RE.test(id) || !lib.get(id)) return fail('NOT_FOUND');
    if (isActive(id)) return fail('GAME_ACTIVE');
    if (saved(() => { lib.remove(id); return true; }) === null) return fail('SAVE_FAILED');
    ctx.changed(id);
    return { ok: true };
  });

  on('game:activate', (p) => {
    const game = findGame(lib, p.id);
    if (typeof game === 'string') return fail(game);
    ctx.commit(logic.activateGame(ctx.state(), game.id, game.def.scoring.startScore));
    return { ok: true };
  });

  on('game:open', (p) => {
    if (p.id === null) {
      socket.data.editingId = undefined;
    } else {
      const game = findGame(lib, p.id);
      if (typeof game === 'string') return fail(game);
      socket.data.editingId = game.id;
    }
    ctx.sendAdmin(socket);
    return { ok: true };
  });

  on('game:updateSettings', (p) => {
    const game = findGame(lib, p.id);
    if (typeof game === 'string') return fail(game);
    const settings = parseSettings(p.settings, lib.mediaDir(game.id));
    if (!settings) return fail('INVALID_SETTINGS');
    const def: GameDef = { ...game.def, ...settings };
    // Отсутствующий ключ медиа означает «убрать».
    if (settings.lobbyMusic === undefined) delete def.lobbyMusic;
    if (settings.background === undefined) delete def.background;
    if (saved(() => { lib.save(game.id, def); return true; }) === null) return fail('SAVE_FAILED');
    ctx.changed(game.id);
    return { ok: true };
  });

  on('admin:itemAdd', (p) => {
    const game = findGame(lib, p.gameId);
    if (typeof game === 'string') return fail(game);
    return saveShop(game, shop.addItem(game.def.shop, p.item, randomUUID()));
  });

  on('admin:itemUpdate', (p) => {
    const game = findGame(lib, p.gameId);
    if (typeof game === 'string') return fail(game);
    if (typeof p.id !== 'string') return fail('NOT_FOUND');
    const sold = isActive(game.id) ? shop.soldCount(ctx.state(), p.id) : 0;
    return saveShop(game, shop.updateItem(game.def.shop, p.id, p.item, sold));
  });

  on('admin:itemDelete', (p) => {
    const game = findGame(lib, p.gameId);
    if (typeof game === 'string') return fail(game);
    const itemId = p.id;
    if (typeof itemId !== 'string') return fail('NOT_FOUND');
    return saveShop(game, shop.deleteItem(game.def.shop, itemId), (s) => shop.dropPurchasesOf(s, itemId));
  });
}
